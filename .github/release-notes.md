Personal-use builds: signed ad hoc, **not notarized**. An installed app tells you about a newer release and updates itself in one click on macOS and on a Linux AppImage (a `.deb` install: a link to this page, update it with `apt`). The Claude Code CLI must be installed and logged in (the app drives it for every generation).

**macOS, no dialog at all** (the script downloads with `curl`, which leaves no quarantine attribute):

```bash
curl -fsSL https://raw.githubusercontent.com/jbclaramonte/system-design-from-scratch/main/install.sh | bash
```

**Linux x64** (Ubuntu 22.04 or later, no `sudo`): the same command. It installs the AppImage in `~/.local/share/system-design-from-scratch/` and adds a launcher to the application menu; run it again to update by hand, or use **Install and restart** in the app. Without FUSE 2 (`sudo apt install libfuse2`, `libfuse2t64` on Ubuntu 24.04) it writes a launcher that extracts the app on each start. Ubuntu 24.04 restricts the Chromium sandbox of an AppImage: use the `.deb` there.

| Platform                    | File                                                   | Manual install                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS (Apple Silicon)       | `system-design-from-scratch-<version>-arm64.dmg`       | Open the dmg, drag the app onto Applications. A browser download is quarantined and macOS blocks it once: **System Settings > Privacy & Security > Open Anyway**, or `/usr/bin/xattr -dr com.apple.quarantine "/Applications/System Design from Scratch.app"` (full path). |
| Linux x64, Debian or Ubuntu | `system-design-from-scratch-<version>-amd64.deb`       | `sudo apt install ./system-design-from-scratch-<version>-amd64.deb`                                                                                                                                                                                                        |
| Linux x64, any distribution | `system-design-from-scratch-<version>-x86_64.AppImage` | The install command above, or `chmod +x` the file and run it. Needs FUSE 2 (`libfuse2` on Ubuntu 22.04, `libfuse2t64` on 24.04), or start it with `APPIMAGE_EXTRACT_AND_RUN=1`. On systems that restrict unprivileged user namespaces, use the deb.                        |

Verify a download with `SHA256SUMS` (`shasum -a 256 -c SHA256SUMS --ignore-missing`). No Windows build.

Your data lives in `~/Library/Application Support/system-design-from-scratch/` (macOS) or `~/.config/system-design-from-scratch/` (Linux). More in the [README](https://github.com/jbclaramonte/system-design-from-scratch#download) and [docs/Packaging.md](https://github.com/jbclaramonte/system-design-from-scratch/blob/main/docs/Packaging.md).

---
