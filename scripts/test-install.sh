#!/usr/bin/env bash
# Tests install.sh against a local fake release folder (BASE_URL=file://...), in a scratch HOME and a
# scratch install folder. Never touches the real home, /Applications or the network.
#
#   scripts/test-install.sh                 Linux branch (on a Mac through SDFS_TEST_PLATFORM), then
#                                           the macOS branch for real when run on Apple Silicon
#   SDFS_TEST_APPIMAGE=<file> scripts/test-install.sh
#                                           use a real AppImage (CI: the one just built) as the
#                                           released file instead of the fake one
#
# On a Linux x64 machine the Linux branch runs for real (no platform switch). Exit status 1 when a
# check fails. Docs: docs/Packaging.md.
set -uo pipefail

repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_sh="$repo/install.sh"
scratch="$(mktemp -d "${TMPDIR:-/tmp}/sdfs-test-install.XXXXXX")"
failures=0
checks=0
background=()

cleanup() {
  for pid in ${background[@]+"${background[@]}"}; do kill "$pid" 2>/dev/null || true; done
  chmod -R u+rwx "$scratch" 2>/dev/null || true
  rm -rf "$scratch"
}
trap cleanup EXIT

pass() { checks=$((checks + 1)); echo "PASS $1"; }
fail() { checks=$((checks + 1)); failures=$((failures + 1)); echo "FAIL $1"; }
check() { # check DESCRIPTION COMMAND...
  local description="$1"
  shift
  if "$@" >/dev/null 2>&1; then pass "$description"; else fail "$description"; fi
}
contains() { grep -qF -- "$2" "$1"; }

native_linux=0
if [ "$(uname -s) $(uname -m)" = "Linux x86_64" ]; then
  native_linux=1
else
  export SDFS_TEST_PLATFORM="Linux x86_64"
fi

# ---------------------------------------------------------------------------------------------
# Linux branch
# ---------------------------------------------------------------------------------------------

# A fake AppImage: runs like the app (prints its version) and, like a real one, extracts itself with
# --appimage-extract [pattern] into ./squashfs-root. FAKE_ICON_MODE (read at install time):
#   hicolor (default)  the icon is in usr/share/icons/hicolor/512x512/apps
#   full-only          the pattern finds nothing, the full extraction holds the icon elsewhere
#   none               no icon at all
make_fake_appimage() { # make_fake_appimage FILE VERSION
  cat >"$1" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = "--appimage-extract" ]; then
  mode="\${FAKE_ICON_MODE:-hicolor}"
  [ "\$mode" = none ] && { mkdir -p squashfs-root; exit 0; }
  if [ -n "\${2:-}" ]; then
    [ "\$mode" = full-only ] && exit 0
    mkdir -p squashfs-root/usr/share/icons/hicolor/512x512/apps
    echo "icon of $2" > squashfs-root/usr/share/icons/hicolor/512x512/apps/system-design-from-scratch.png
  else
    mkdir -p squashfs-root/usr/share/icons/hicolor/256x256/apps squashfs-root/usr/share/icons/hicolor/512x512/apps
    echo "small" > squashfs-root/usr/share/icons/hicolor/256x256/apps/system-design-from-scratch.png
    echo "icon of full extraction (larger file)" > squashfs-root/usr/share/icons/hicolor/512x512/apps/system-design-from-scratch.png
  fi
  exit 0
fi
echo "version $2 \$*"
EOF
  chmod +x "$1"
}

sha256_of() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{ print $1 }'; else shasum -a 256 "$1" | awk '{ print $1 }'; fi
}

# make_release DIR VERSION: DIR holds the AppImage of VERSION (without v) and a SHA256SUMS in the
# format of `sha256sum *` (two spaces), like the release job writes it.
make_release() {
  local dir="$1" version="$2" name="system-design-from-scratch-$2-x86_64.AppImage"
  mkdir -p "$dir"
  if [ -n "${SDFS_TEST_APPIMAGE:-}" ]; then
    cp "$SDFS_TEST_APPIMAGE" "$dir/$name"
  else
    make_fake_appimage "$dir/$name" "$version"
  fi
  (cd "$dir" && printf '%s  %s\n' "$(sha256_of "$name")" "$name" >SHA256SUMS)
}

# run_install LOGFILE [VAR=value...]: runs install.sh as a Linux user in the scratch HOME.
run_install() {
  local log="$1"
  shift
  local platform=()
  if [ -n "${SDFS_TEST_PLATFORM:-}" ]; then platform=("SDFS_TEST_PLATFORM=$SDFS_TEST_PLATFORM"); fi
  env -i PATH="$PATH" HOME="$home" TMPDIR="$tmp" BASE_URL="file://$release" VERSION="${VERSION:-v0.0.1}" \
    ${platform[@]+"${platform[@]}"} \
    SDFS_TEST_FUSE2="${SDFS_TEST_FUSE2:-present}" FAKE_ICON_MODE="${FAKE_ICON_MODE:-hicolor}" "$@" bash "$install_sh" >"$log" 2>&1
}

new_sandbox() { # a fresh scratch HOME, temporary folder and release folder
  sandbox="$scratch/case-$((++case_number))"
  home="$sandbox/home"
  tmp="$sandbox/tmp"
  release="$sandbox/release"
  mkdir -p "$home/.config/system-design-from-scratch" "$tmp"
  echo "my learning progress" >"$home/.config/system-design-from-scratch/marker"
  make_release "$release" 0.0.1
  data="$home/.local/share"
  target="$data/system-design-from-scratch/system-design-from-scratch.AppImage"
  desktop="$data/applications/system-design-from-scratch.desktop"
  log="$sandbox/install.log"
}
case_number=0

data_untouched() { [ "$(cat "$home/.config/system-design-from-scratch/marker")" = "my learning progress" ]; }
nothing_left_behind() {
  [ -z "$(find "$tmp" -mindepth 1 2>/dev/null)" ] && [ -z "$(find "$home" -name '.sdfs-install-*' 2>/dev/null)" ]
}

echo "== Linux branch ($([ "$native_linux" = 1 ] && echo "native" || echo "faked platform: $SDFS_TEST_PLATFORM"))"

new_sandbox
check "install succeeds" run_install "$log"
check "the AppImage is installed in ~/.local/share/system-design-from-scratch and executable" test -x "$target"
check "the installed file is the released one" test "$(sha256_of "$target")" = "$(sha256_of "$release/system-design-from-scratch-0.0.1-x86_64.AppImage")"
check "the launcher exists" test -f "$desktop"
check "launcher: Type, Name, Categories, StartupWMClass" bash -c "grep -qx 'Type=Application' '$desktop' && grep -qx 'Name=System Design from Scratch' '$desktop' && grep -qx 'Categories=Education;' '$desktop' && grep -qx 'StartupWMClass=system-design-from-scratch' '$desktop' && grep -qx 'Terminal=false' '$desktop'"
check "launcher: Exec is the installed file, quoted, with no flag when FUSE 2 is there" contains "$desktop" "Exec=\"$target\""
check "launcher: no APPIMAGE_EXTRACT_AND_RUN when FUSE 2 is there" bash -c "! grep -q APPIMAGE_EXTRACT_AND_RUN '$desktop'"
check "launcher: Icon points at a file that exists" bash -c "icon=\$(sed -n 's/^Icon=//p' '$desktop'); [ -n \"\$icon\" ] && [ -s \"\$icon\" ]"
check "the data folder is untouched" data_untouched
check "no temporary file is left behind" nothing_left_behind
check "nothing is written outside ~/.local/share (and the untouched ~/.config)" bash -c "[ -z \"\$(find '$home' -mindepth 1 -maxdepth 1 ! -name .local ! -name .config)\" ] && [ -z \"\$(find '$home/.local' -mindepth 1 -maxdepth 1 ! -name share)\" ] && [ -z \"\$(find '$home/.local/share' -mindepth 1 -maxdepth 1 ! -name applications ! -name system-design-from-scratch)\" ]"
check "says where the launcher is and how to uninstall" bash -c "grep -q 'launcher:' '$log' && grep -q 'uninstall' '$log'"

# A second run replaces the first one (a new version), and keeps working.
make_release "$release" 0.0.2
VERSION=v0.0.2 run_install "$log"
status=$?
check "a second run (next version) succeeds" test "$status" = 0
if [ -z "${SDFS_TEST_APPIMAGE:-}" ]; then
  check "the second run replaced the first file" test "$("$target" a)" = "version 0.0.2 a"
fi
check "the second run keeps one launcher and no leftovers" bash -c "[ \$(ls '$data/applications' | wc -l) -eq 1 ]"
check "the second run left the data folder untouched" data_untouched
check "the second run left no temporary file" nothing_left_behind

# A running instance is never replaced.
new_sandbox
run_install "$log"
before="$(sha256_of "$target")"
make_release "$release" 0.0.2
cat >"$sandbox/running.sh" <<'EOF'
#!/usr/bin/env bash
# Stays a bash process (its command line holds the AppImage path, like the runtime's); stops with it.
sleep 60 &
trap 'kill $!' TERM
wait
EOF
bash "$sandbox/running.sh" "$target" &
background+=("$!")
sleep 0.5
VERSION=v0.0.2 run_install "$log"
status=$?
check "refuses to replace a running instance (command line)" test "$status" != 0
check "the running-instance message says to quit the app" contains "$log" "the app is running"
check "the installed file is untouched after the refusal" test "$(sha256_of "$target")" = "$before"
kill "${background[@]}" 2>/dev/null || true
background=()
if [ -d /proc/self ]; then
  env APPIMAGE="$target" sleep 60 &
  background+=("$!")
  sleep 0.3
  VERSION=v0.0.2 run_install "$log"
  status=$?
  check "refuses to replace a running instance (APPIMAGE in its environment)" test "$status" != 0
  kill "${background[@]}" 2>/dev/null || true
  background=()
fi
sleep 0.3
VERSION=v0.0.2 run_install "$log"
check "replaces it once the instance has quit" test "$(sha256_of "$target")" != "$before"

# A corrupt or unlisted download is refused and leaves the installed app alone.
new_sandbox
run_install "$log"
before="$(sha256_of "$target")"
make_release "$release" 0.0.2
echo "0000000000000000000000000000000000000000000000000000000000000000  system-design-from-scratch-0.0.2-x86_64.AppImage" >"$release/SHA256SUMS"
VERSION=v0.0.2 run_install "$log"
status=$?
check "checksum mismatch: exit status is not 0" test "$status" != 0
check "checksum mismatch: the message says so" contains "$log" "checksum mismatch"
check "checksum mismatch: the installed file is untouched" test "$(sha256_of "$target")" = "$before"
check "checksum mismatch: no temporary file is left behind" nothing_left_behind
echo "0000000000000000000000000000000000000000000000000000000000000000  other.AppImage" >"$release/SHA256SUMS"
VERSION=v0.0.2 run_install "$log"
status=$?
check "unlisted file: refused" test "$status" != 0
check "unlisted file: the message says so" contains "$log" "is not listed in SHA256SUMS"
check "unlisted file: the installed file is untouched" test "$(sha256_of "$target")" = "$before"
rm "$release/system-design-from-scratch-0.0.2-x86_64.AppImage"
VERSION=v0.0.2 run_install "$log"
status=$?
check "missing release file: refused, nothing left behind" bash -c "[ $status != 0 ]"
check "missing release file: the installed file is untouched" test "$(sha256_of "$target")" = "$before"

# FUSE 2 missing: the launcher extracts on each start, and the fix is printed.
new_sandbox
SDFS_TEST_FUSE2=missing run_install "$log"
check "FUSE 2 missing: install still succeeds with a launcher" test -f "$desktop"
check "FUSE 2 missing: the launcher sets APPIMAGE_EXTRACT_AND_RUN=1" contains "$desktop" "Exec=env APPIMAGE_EXTRACT_AND_RUN=1 \"$target\""
check "FUSE 2 missing: the one-line fix is printed" contains "$log" "sudo apt install libfuse2"
SDFS_TEST_FUSE2=present run_install "$log"
check "FUSE 2 installed later: running the script again restores the plain launcher" contains "$desktop" "Exec=\"$target\""

# Icons: found by the targeted extraction, by the full extraction, or absent.
new_sandbox
FAKE_ICON_MODE=full-only run_install "$log"
check "icon found by the full extraction when the targeted one finds nothing" bash -c "grep -q 'larger file' '$data/system-design-from-scratch/system-design-from-scratch.png'"
new_sandbox
FAKE_ICON_MODE=none run_install "$log"
status=$?
check "no icon in the image: the install still succeeds" bash -c "[ -x '$target' ] && [ -f '$desktop' ]"
check "no icon in the image: a warning, and no Icon line" bash -c "grep -q 'no icon' '$log' && ! grep -q '^Icon=' '$desktop'"

# INSTALL_DIR: another folder, with a space (the launcher quotes it); characters that break Exec.
new_sandbox
dir="$sandbox/my apps"
run_install "$log" INSTALL_DIR="$dir"
check "INSTALL_DIR with a space: installed there" test -x "$dir/system-design-from-scratch.AppImage"
check "INSTALL_DIR with a space: the launcher quotes the path" contains "$desktop" "Exec=\"$dir/system-design-from-scratch.AppImage\""
check "INSTALL_DIR with a space: nothing in the default folder" test ! -e "$data/system-design-from-scratch"
run_install "$log" INSTALL_DIR="$sandbox/a\$b"
status=$?
check "INSTALL_DIR with a dollar sign is refused" bash -c "[ $status != 0 ] && grep -q 'INSTALL_DIR must not contain' '$log'"
run_install "$log" INSTALL_DIR="relative/dir"
status=$?
check "a relative INSTALL_DIR is refused" bash -c "[ $status != 0 ] && grep -q 'absolute' '$log'"

if [ "$(id -u)" != 0 ]; then
  new_sandbox
  mkdir -p "$sandbox/ro"
  chmod 555 "$sandbox/ro"
  run_install "$log" INSTALL_DIR="$sandbox/ro"
  status=$?
  check "a read-only INSTALL_DIR is refused with a message" bash -c "[ $status != 0 ] && grep -q 'not writable' '$log'"
  chmod 755 "$sandbox/ro"
fi

# XDG_DATA_HOME is honored.
new_sandbox
run_install "$log" XDG_DATA_HOME="$sandbox/xdg"
check "XDG_DATA_HOME: AppImage and launcher go under it" bash -c "[ -x '$sandbox/xdg/system-design-from-scratch/system-design-from-scratch.AppImage' ] && [ -f '$sandbox/xdg/applications/system-design-from-scratch.desktop' ] && [ ! -e '$home/.local' ]"

# Arguments and platforms.
new_sandbox
VERSION="nightly" run_install "$log"
status=$?
check "an unexpected VERSION is refused" bash -c "[ $status != 0 ] && grep -q 'unexpected release tag' '$log'"
for unsupported in "Linux aarch64" "Darwin x86_64" "FreeBSD amd64"; do
  new_sandbox
  SDFS_TEST_PLATFORM="$unsupported" run_install "$log"
  status=$?
  check "\"$unsupported\" exits with a clear message and installs nothing" bash -c "[ $status != 0 ] && grep -q 'install:' '$log' && [ ! -e '$data' ]"
done
check "shell syntax (bash -n)" bash -n "$install_sh"
if command -v shellcheck >/dev/null 2>&1; then
  check "shellcheck" shellcheck "$install_sh" "$repo/scripts/test-install.sh"
else
  echo "SKIP shellcheck (not installed)"
fi

# ---------------------------------------------------------------------------------------------
# macOS branch (real, Apple Silicon only): the behavior #45 shipped
# ---------------------------------------------------------------------------------------------

if [ "$(uname -s) $(uname -m)" = "Darwin arm64" ]; then
  echo "== macOS branch (real hdiutil, ad hoc codesign, scratch install folder)"
  sandbox="$scratch/mac"
  mkdir -p "$sandbox/src/System Design from Scratch.app/Contents/MacOS" "$sandbox/release" "$sandbox/apps" "$sandbox/tmp"
  app="$sandbox/src/System Design from Scratch.app"
  cat >"$app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>app</string>
<key>CFBundleIdentifier</key><string>com.example.fake</string>
<key>CFBundlePackageType</key><string>APPL</string>
</dict></plist>
EOF
  printf '#!/bin/sh\necho fake\n' >"$app/Contents/MacOS/app"
  chmod +x "$app/Contents/MacOS/app"
  codesign -s - --force --deep "$app" >/dev/null 2>&1
  dmg="$sandbox/release/system-design-from-scratch-0.0.1-arm64.dmg"
  if hdiutil create -quiet -srcfolder "$sandbox/src" -volname fake -fs HFS+ "$dmg" >/dev/null 2>&1; then
    (cd "$sandbox/release" && shasum -a 256 "$(basename "$dmg")" >SHA256SUMS)
    mac_install() {
      env -u SDFS_TEST_PLATFORM -u SDFS_TEST_FUSE2 PATH="$PATH" HOME="$sandbox/home" TMPDIR="$sandbox/tmp" \
        BASE_URL="file://$sandbox/release" VERSION=v0.0.1 INSTALL_DIR="$sandbox/apps" "$@" bash "$install_sh" >"$sandbox/log" 2>&1
    }
    mac_install
    check "macOS: installs the app into INSTALL_DIR" test -x "$sandbox/apps/System Design from Scratch.app/Contents/MacOS/app"
    check "macOS: the copy has a valid signature" codesign --verify --deep --strict "$sandbox/apps/System Design from Scratch.app"
    check "macOS: says where it installed" contains "$sandbox/log" "install: done."
    check "macOS: no hidden staging copy and no temporary folder left" bash -c "[ -z \"\$(find '$sandbox/apps' -name '.sdfs-install-*')\" ] && [ -z \"\$(find '$sandbox/tmp' -mindepth 1)\" ]"
    touch "$sandbox/apps/System Design from Scratch.app/marker"
    mac_install
    check "macOS: a second run replaces the app" test ! -e "$sandbox/apps/System Design from Scratch.app/marker"
    echo "0000000000000000000000000000000000000000000000000000000000000000  system-design-from-scratch-0.0.1-arm64.dmg" >"$sandbox/release/SHA256SUMS"
    touch "$sandbox/apps/System Design from Scratch.app/marker"
    mac_install
    status=$?
    check "macOS: a checksum mismatch is refused and leaves the app alone" bash -c "grep -q 'checksum mismatch' '$sandbox/log' && [ -e '$sandbox/apps/System Design from Scratch.app/marker' ]"
    mac_install SDFS_TEST_PLATFORM="Darwin x86_64"
    check "macOS: an Intel Mac is refused" contains "$sandbox/log" "Apple Silicon (arm64) only"
  else
    echo "SKIP the macOS branch: hdiutil could not create an image here"
  fi
else
  echo "SKIP the macOS branch (not on Apple Silicon)"
fi

echo
echo "$checks checks, $failures failed"
[ "$failures" = 0 ]
