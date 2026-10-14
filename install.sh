#!/usr/bin/env bash
# Installs System Design from Scratch on macOS (Apple Silicon) from a GitHub Release.
#
#   curl -fsSL https://raw.githubusercontent.com/jbclaramonte/system-design-from-scratch/main/install.sh | bash
#
# Environment (all optional):
#   VERSION      release tag to install, e.g. v0.1.1 (default: the latest release)
#   INSTALL_DIR  folder that receives the app (default: /Applications)
#   BASE_URL     folder holding the .dmg and SHA256SUMS (default: the release download URL; for tests)
#
# What it does: downloads the .dmg and SHA256SUMS of the release with curl, checks the checksum,
# mounts the image read-only, copies the app into INSTALL_DIR (replacing a previous copy), unmounts
# and deletes its temporary files. curl sets no quarantine attribute, so macOS opens the app
# without a Gatekeeper dialog (a browser download would get one: the app is signed ad hoc, not
# notarized). It never touches your data folder
# (~/Library/Application Support/system-design-from-scratch). Docs: docs/Packaging.md.
set -euo pipefail

REPO="jbclaramonte/system-design-from-scratch"
APP_NAME="System Design from Scratch.app"
VERSION="${VERSION:-latest}"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"

fail() {
  echo "install: $*" >&2
  exit 1
}

[ "$(uname -s)" = "Darwin" ] || fail "this script installs the macOS app; see the README for Linux."
[ "$(uname -m)" = "arm64" ] || fail "the macOS build is Apple Silicon (arm64) only."
[ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR does not exist."
[ -w "$INSTALL_DIR" ] || fail "$INSTALL_DIR is not writable (run with INSTALL_DIR=\$HOME/Applications, or sudo)."

if [ "$VERSION" = "latest" ]; then
  # /releases/latest redirects to /releases/tag/<tag>.
  latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")"
  VERSION="${latest_url##*/}"
fi
case "$VERSION" in
  v[0-9]*) ;;
  *) fail "unexpected release tag \"$VERSION\" (expected something like v0.1.1)." ;;
esac

dmg="system-design-from-scratch-${VERSION#v}-arm64.dmg"
base="${BASE_URL:-https://github.com/$REPO/releases/download/$VERSION}"

work="$(mktemp -d "${TMPDIR:-/tmp}/sdfs-install.XXXXXX")"
mountpoint="$work/mount"
mounted=0
staging=""
cleanup() {
  if [ -n "$staging" ]; then rm -rf "$staging"; fi
  if [ "$mounted" = 1 ]; then hdiutil detach "$mountpoint" -quiet || hdiutil detach "$mountpoint" -force -quiet || true; fi
  rm -rf "$work"
}
trap cleanup EXIT

echo "install: downloading $dmg ($VERSION)"
curl -fSL --progress-bar -o "$work/$dmg" "$base/$dmg"
curl -fsSL -o "$work/SHA256SUMS" "$base/SHA256SUMS"

echo "install: checking the checksum"
expected="$(awk -v name="$dmg" '$2 == name { print $1 }' "$work/SHA256SUMS")"
[ -n "$expected" ] || fail "$dmg is not listed in SHA256SUMS."
actual="$(shasum -a 256 "$work/$dmg" | awk '{ print $1 }')"
[ "$expected" = "$actual" ] || fail "checksum mismatch for $dmg (expected $expected, got $actual)."

echo "install: mounting the image"
mkdir "$mountpoint"
hdiutil attach -readonly -nobrowse -noverify -quiet -mountpoint "$mountpoint" "$work/$dmg"
mounted=1
[ -d "$mountpoint/$APP_NAME" ] || fail "$APP_NAME is not in the image."

target="$INSTALL_DIR/$APP_NAME"
if pgrep -f "$target/Contents/MacOS/" >/dev/null 2>&1; then
  fail "the app is running: quit it, then run this script again."
fi

echo "install: copying to $target"
# Copy next to the target first, then swap: an interrupted copy never leaves a half app.
staging="$INSTALL_DIR/.sdfs-install-$$.app"
ditto "$mountpoint/$APP_NAME" "$staging"
codesign --verify --deep --strict "$staging" || fail "the copied app has an invalid signature."
rm -rf "$target"
mv "$staging" "$target"

if xattr -p com.apple.quarantine "$target" >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$target"
fi

echo "install: done. $target ($VERSION)"
echo "install: the Claude Code CLI must be installed and logged in (see the README)."
