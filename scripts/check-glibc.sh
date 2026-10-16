#!/usr/bin/env bash
# Prints the highest glibc symbol version that the Electron binary and the libraries next to it need
# (objdump -T), and fails when it is above the glibc of the oldest supported Ubuntu.
#
#   scripts/check-glibc.sh [FOLDER] [MAX_VERSION]
#
# FOLDER: the unpacked Linux app (default dist/linux-unpacked). MAX_VERSION: default 2.35, the glibc
# of Ubuntu 22.04. Needs binutils (objdump). Docs: docs/Packaging.md, "Linux (x64)".
set -euo pipefail

folder="${1:-dist/linux-unpacked}"
max="${2:-2.35}"

command -v objdump >/dev/null 2>&1 || { echo "check-glibc: objdump (binutils) is required." >&2; exit 2; }
[ -d "$folder" ] || { echo "check-glibc: $folder does not exist." >&2; exit 2; }

highest="0"
echo "glibc symbol versions needed (highest per file) in $folder:"
while IFS= read -r file; do
  # ELF files only; a file without GLIBC symbols (static) needs nothing.
  if ! head -c 4 "$file" | grep -q 'ELF'; then continue; fi
  version="$(objdump -T "$file" 2>/dev/null | grep -o 'GLIBC_[0-9][0-9.]*' | sed 's/GLIBC_//' | sort -uV | tail -n 1 || true)"
  [ -n "$version" ] || continue
  echo "  $version  ${file#"$folder"/}"
  highest="$(printf '%s\n%s\n' "$highest" "$version" | sort -V | tail -n 1)"
done < <(find "$folder" -maxdepth 1 -type f \( -name 'system-design-from-scratch' -o -name 'electron' -o -name '*.so' -o -name '*.so.*' -o -name 'chrome_crashpad_handler' -o -name 'chrome-sandbox' \) | sort)

echo "highest: glibc $highest (limit: $max)"
if [ "$(printf '%s\n%s\n' "$highest" "$max" | sort -V | tail -n 1)" != "$max" ]; then
  echo "check-glibc: the package needs glibc $highest, newer than $max (2.35 is Ubuntu 22.04)." >&2
  exit 1
fi
