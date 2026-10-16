#!/usr/bin/env bash
# Installs System Design from Scratch from a GitHub Release: on macOS (Apple Silicon) the .dmg, on
# Linux (x64) the AppImage.
#
#   curl -fsSL https://raw.githubusercontent.com/jbclaramonte/system-design-from-scratch/main/install.sh | bash
#
# Environment (all optional):
#   VERSION      release tag to install, e.g. v0.1.1 (default: the latest release)
#   INSTALL_DIR  folder that receives the app (default: /Applications on macOS,
#                ~/.local/share/system-design-from-scratch on Linux)
#   BASE_URL     folder holding the release files and SHA256SUMS (default: the release download
#                URL; for tests)
#
# macOS: downloads the .dmg and SHA256SUMS of the release with curl, checks the checksum, mounts
# the image read-only, copies the app into INSTALL_DIR (replacing a previous copy), unmounts and
# deletes its temporary files. curl sets no quarantine attribute, so macOS opens the app without a
# Gatekeeper dialog (a browser download would get one: the app is signed ad hoc, not notarized).
# It never touches your data folder (~/Library/Application Support/system-design-from-scratch).
#
# Linux: downloads the .AppImage and SHA256SUMS, checks the checksum, installs the file into
# INSTALL_DIR (replacing a previous one, made executable), takes the icon out of it and writes a
# launcher, ~/.local/share/applications/system-design-from-scratch.desktop, so the app appears in
# the application menu. It never needs sudo, never touches your data folder
# (~/.config/system-design-from-scratch) and refuses to replace a running instance. An AppImage
# needs FUSE 2 (libfuse2): when it is missing the script prints the one-line fix and writes a
# launcher that extracts the image on each start (APPIMAGE_EXTRACT_AND_RUN=1, slower); run the
# script again after installing libfuse2 to get the normal launcher. XDG_DATA_HOME is honored.
#
# Test-only switches, never set them for a real install: SDFS_TEST_PLATFORM="<uname -s> <uname -m>"
# (for example "Linux x86_64") makes the script behave as on that platform, so the Linux branch can
# be tested on a Mac; SDFS_TEST_FUSE2=present|missing overrides the libfuse2 detection. Tests: scripts/test-install.sh. Docs: docs/Packaging.md.
set -euo pipefail

REPO="jbclaramonte/system-design-from-scratch"
VERSION="${VERSION:-latest}"
APP_NAME="System Design from Scratch.app"
APP_ID="system-design-from-scratch"

fail() {
  echo "install: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------------------------
# Common: platform, release tag, download and checksum
# ---------------------------------------------------------------------------------------------

platform="${SDFS_TEST_PLATFORM:-$(uname -s) $(uname -m)}"
case "$platform" in
  "Darwin arm64") os=macos ;;
  "Darwin "*) fail "the macOS build is Apple Silicon (arm64) only." ;;
  "Linux x86_64") os=linux ;;
  "Linux "*) fail "the Linux build is x64 (x86_64) only; this machine is ${platform#Linux }." ;;
  *) fail "unsupported platform \"$platform\": this script installs the macOS (Apple Silicon) and Linux (x64) builds; see the README." ;;
esac

command -v curl >/dev/null 2>&1 || fail "curl is required."

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{ print $1 }'
  else
    shasum -a 256 "$1" | awk '{ print $1 }'
  fi
}

# Looks the latest release tag up (/releases/latest redirects to /releases/tag/<tag>) and checks it.
resolve_version() {
  if [ "$VERSION" = "latest" ]; then
    latest_url="$(curl -fsSL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")"
    VERSION="${latest_url##*/}"
  fi
  case "$VERSION" in
    v[0-9]*) ;;
    *) fail "unexpected release tag \"$VERSION\" (expected something like v0.1.1)." ;;
  esac
  base="${BASE_URL:-https://github.com/$REPO/releases/download/$VERSION}"
}

# download_and_verify FILE: downloads FILE and SHA256SUMS of the release into $work, then checks FILE.
download_and_verify() {
  local file="$1"
  echo "install: downloading $file ($VERSION)"
  curl -fSL --progress-bar -o "$work/$file" "$base/$file"
  curl -fsSL -o "$work/SHA256SUMS" "$base/SHA256SUMS"

  echo "install: checking the checksum"
  local expected actual
  expected="$(awk -v name="$file" '$2 == name { print $1 }' "$work/SHA256SUMS")"
  [ -n "$expected" ] || fail "$file is not listed in SHA256SUMS."
  actual="$(sha256_of "$work/$file")"
  [ "$expected" = "$actual" ] || fail "checksum mismatch for $file (expected $expected, got $actual)."
}

work=""
mountpoint=""
mounted=0
staging=""
cleanup() {
  if [ -n "$staging" ]; then rm -rf "$staging"; fi
  if [ "$mounted" = 1 ]; then hdiutil detach "$mountpoint" -quiet || hdiutil detach "$mountpoint" -force -quiet || true; fi
  if [ -n "$work" ]; then rm -rf "$work"; fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# macOS
# ---------------------------------------------------------------------------------------------

install_macos() {
  INSTALL_DIR="${INSTALL_DIR:-/Applications}"
  [ -d "$INSTALL_DIR" ] || fail "$INSTALL_DIR does not exist."
  [ -w "$INSTALL_DIR" ] || fail "$INSTALL_DIR is not writable (run with INSTALL_DIR=\$HOME/Applications, or sudo)."

  resolve_version
  local dmg="system-design-from-scratch-${VERSION#v}-arm64.dmg"

  work="$(mktemp -d "${TMPDIR:-/tmp}/sdfs-install.XXXXXX")"
  mountpoint="$work/mount"
  download_and_verify "$dmg"

  echo "install: mounting the image"
  mkdir "$mountpoint"
  hdiutil attach -readonly -nobrowse -noverify -quiet -mountpoint "$mountpoint" "$work/$dmg"
  mounted=1
  [ -d "$mountpoint/$APP_NAME" ] || fail "$APP_NAME is not in the image."

  local target="$INSTALL_DIR/$APP_NAME"
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
}

# ---------------------------------------------------------------------------------------------
# Linux
# ---------------------------------------------------------------------------------------------

# Whether the AppImage file is the one a running instance was started from. The AppImage runtime
# sets APPIMAGE=<file> in the environment of the app (also when it extracts and runs), and the
# runtime process itself has the file in its command line.
appimage_running() {
  local target="$1" environ
  if command -v pgrep >/dev/null 2>&1 && pgrep -f -- "$target" >/dev/null 2>&1; then
    return 0
  fi
  for environ in /proc/[0-9]*/environ; do
    # -z: the entries of the environment are separated by NUL; -x -F: the whole entry, as text.
    if [ -r "$environ" ] && grep -aqzxF "APPIMAGE=$target" "$environ" 2>/dev/null; then
      return 0
    fi
  done
  return 1
}

# Whether FUSE 2, which an AppImage mounts itself with, is installed.
has_fuse2() {
  case "${SDFS_TEST_FUSE2:-}" in
    present) return 0 ;;
    missing) return 1 ;;
  esac
  # No -q: grep reads everything, so ldconfig is never cut short (pipefail would turn that into a
  # failure). /sbin is not on the PATH of a normal user on Debian.
  local cache
  cache="$({ ldconfig -p || /sbin/ldconfig -p; } 2>/dev/null | grep 'libfuse\.so\.2' || true)"
  if [ -n "$cache" ]; then return 0; fi
  local lib
  for lib in /lib/x86_64-linux-gnu /usr/lib/x86_64-linux-gnu /usr/lib64 /usr/lib /lib64 /lib; do
    if [ -e "$lib/libfuse.so.2" ]; then return 0; fi
  done
  return 1
}

# The largest PNG of the icon theme in a folder, else the largest PNG at its root.
largest_png() {
  local dir="$1" found
  found="$(find "$dir" -path '*/icons/*' -name '*.png' -type f -exec ls -S {} + 2>/dev/null | head -n 1)" || true
  if [ -z "$found" ]; then
    found="$(find "$dir" -maxdepth 2 -name '*.png' -type f -exec ls -S {} + 2>/dev/null | head -n 1)" || true
  fi
  echo "$found"
}

# extract_icon APPIMAGE DEST: copies the icon out of the AppImage into DEST (a .png). Returns 1 when
# the image holds none. Extraction does not need FUSE.
extract_icon() {
  local image="$1" dest="$2" found
  local scratch="$work/icon"
  mkdir -p "$scratch"
  # The icon the build installs into the hicolor theme first (a few files only), then the whole image.
  (cd "$scratch" && "$image" --appimage-extract 'usr/share/icons/hicolor/512x512/apps/*' >/dev/null 2>&1) || true
  found="$(largest_png "$scratch")"
  if [ -z "$found" ]; then
    rm -rf "$scratch"
    mkdir -p "$scratch"
    (cd "$scratch" && "$image" --appimage-extract >/dev/null 2>&1) || true
    found="$(largest_png "$scratch")"
  fi
  [ -n "$found" ] || return 1
  cp "$found" "$dest"
}

install_linux() {
  [ -n "${HOME:-}" ] || fail "HOME is not set."
  local data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
  INSTALL_DIR="${INSTALL_DIR:-$data_home/$APP_ID}"
  local applications="$data_home/applications"
  local desktop_file="$applications/$APP_ID.desktop"
  # The folder goes into the launcher's Exec line, which has its own quoting rules.
  case "$INSTALL_DIR" in
    /*) ;;
    *) fail "INSTALL_DIR must be an absolute path." ;;
  esac
  case "$INSTALL_DIR" in
    *[\"\`\$\\%]* | *$'\n'*) fail "INSTALL_DIR must not contain any of: \" \` \$ \\ % or a line break." ;;
  esac

  resolve_version
  local image="system-design-from-scratch-${VERSION#v}-x86_64.AppImage"
  local target="$INSTALL_DIR/$APP_ID.AppImage"
  local icon="$INSTALL_DIR/$APP_ID.png"

  if [ -e "$target" ] && appimage_running "$target"; then
    fail "the app is running: quit it, then run this script again."
  fi
  mkdir -p "$INSTALL_DIR" "$applications" || fail "cannot create $INSTALL_DIR and $applications."
  [ -w "$INSTALL_DIR" ] || fail "$INSTALL_DIR is not writable (run with INSTALL_DIR=<a folder you own>)."

  work="$(mktemp -d "${TMPDIR:-/tmp}/sdfs-install.XXXXXX")"
  download_and_verify "$image"
  chmod +x "$work/$image"

  local has_icon=1
  extract_icon "$work/$image" "$work/icon.png" || has_icon=0

  echo "install: installing to $target"
  # Next to the target first, then a rename: an interrupted copy never leaves a half file.
  staging="$INSTALL_DIR/.sdfs-install-$$.AppImage"
  cp "$work/$image" "$staging"
  chmod 755 "$staging"
  mv -f "$staging" "$target"
  staging=""

  local icon_line=""
  if [ "$has_icon" = 1 ]; then
    cp "$work/icon.png" "$icon"
    icon_line="Icon=$icon"
  else
    echo "install: warning: no icon found in the image; the launcher has none." >&2
  fi

  local exec_line="\"$target\""
  local fuse_missing=0
  if ! has_fuse2; then
    fuse_missing=1
    exec_line="env APPIMAGE_EXTRACT_AND_RUN=1 \"$target\""
  fi

  # Written next to its final place, then renamed.
  local desktop_staging="$applications/.sdfs-install-$$.desktop"
  staging="$desktop_staging"
  {
    echo "[Desktop Entry]"
    echo "Type=Application"
    echo "Name=System Design from Scratch"
    echo "Comment=Learn system design from scratch"
    echo "Exec=$exec_line"
    if [ -n "$icon_line" ]; then echo "$icon_line"; fi
    echo "Terminal=false"
    echo "Categories=Education;"
    echo "StartupWMClass=$APP_ID"
  } >"$desktop_staging"
  chmod 644 "$desktop_staging"
  mv -f "$desktop_staging" "$desktop_file"
  staging=""

  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$applications" >/dev/null 2>&1 || true
  fi

  echo "install: done. $target ($VERSION)"
  echo "install: launcher: $desktop_file (look for \"System Design from Scratch\" in the application menu)"
  if [ "$fuse_missing" = 1 ]; then
    echo "install: FUSE 2 (libfuse2) is not installed, so an AppImage cannot mount itself. The launcher"
    echo "install: extracts the app on each start instead (slower). To fix it, then run this script again:"
    echo "install:   Debian/Ubuntu: sudo apt install libfuse2   (Ubuntu 24.04 and later: libfuse2t64)"
    echo "install:   Fedora: sudo dnf install fuse-libs"
  fi
  echo "install: the Claude Code CLI must be installed and logged in (see the README)."
  echo "install: to uninstall, delete $INSTALL_DIR and $desktop_file (your data stays in ~/.config/$APP_ID)."
}

case "$os" in
  macos) install_macos ;;
  linux) install_linux ;;
esac
