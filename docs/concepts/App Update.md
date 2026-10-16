---
title: App Update
tags: [concept, packaging]
issue: [58, 59, 60]
---

# App Update

The app finds a newer release on GitHub and installs it when the learner clicks "Install and restart": on macOS (Apple Silicon, packaged app) and on Linux x64 when the app runs as an AppImage. A `.deb` install, or any other run, gets a banner that only links to the release page (a `.deb` is updated with `apt`, which needs administrator rights). Before, a new version meant quitting the app and running `install.sh` by hand; `install.sh` now also installs the AppImage and its launcher on Linux.

- **Check**: at launch (once a day at most, unless "Check for updates at launch" is off in Settings) and from the "Check for updates" button of Settings, which works whatever the setting is and shows a dismissed version again. The main process reads the latest release from the GitHub API and compares versions (semver; a pre-release is never offered). The only request is to that API: nothing identifies the learner.
- **Application menu**: **Check for updates...** in the app menu under About (macOS) or in the Help menu (Linux) runs the same check as the Settings button, whatever the setting is, and the app shows the answer: the banner when a newer release exists, "You are up to date (version X)", or a readable error. During a [[Round]] or a [[Design Exercise]] the check runs but the banner waits, and the message says so. The packaged menu has no reload or developer tools items.
- **Banner**: "Version X is available" with "Install and restart" (or a link to the release page when the app cannot install itself), "Not now" and the release notes. "Not now" remembers the version: it is not announced again, a newer one is. The banner stays away from a [[Round]] and a [[Design Exercise]]; it returns when the learner leaves them.
- **Install on macOS**: the same steps as `install.sh` (download the `.dmg` and `SHA256SUMS`, check the checksum, mount read-only, copy next to the running app, verify the signature and the identity of the copy), then a small detached helper waits for the app to quit, swaps the bundle, clears quarantine, relaunches and removes its temporary files.
- **Install on Linux (AppImage)**: the AppImage runtime sets `APPIMAGE` to the path of the running file. The app downloads the `.AppImage` and `SHA256SUMS`, writes the new file next to the running one, checks the checksum, makes it executable, replaces the running file with an atomic rename (the running instance keeps the old inode), then a detached helper relaunches the new AppImage with the original arguments and environment once the app has quit.
- Any failed step, on either platform, leaves the installed app untouched and shows the reason with the manual download link.
- **Refused** when the app is not packaged, not at an app bundle path (macOS) or not an AppImage (Linux: `APPIMAGE` unset, as with a `.deb`), not in a writable folder, or on another platform (not macOS arm64, not Linux x64).
- It never touches the data folder: the [[Learning Path]], mastery and the [[Content Cache]] are the same after an update.

Why not `electron-updater`, and what the checksum protects: see [[Packaging#Updates]].

## Related

- Settings: "Check for updates at launch" (default on), see [[Mastery Loop Implementation]] for the other settings
- Same trust level as `install.sh`, on both platforms: the checksum comes from the same release as the image or the AppImage

## In code

`src/main/update/` (`version.ts`, `release.ts`, `http.ts`, `checksum.ts`, `installable.ts`, `installer.ts` and `helper.ts` for macOS, `appImageInstaller.ts` and `appImageHelper.ts` for the Linux AppImage, `service.ts`, `updateIpc.ts`, `menuCheck.ts`), the menu template `src/main/menu/applicationMenu.ts`, wired in `src/main/index.ts`, `install.sh` at the repo root for the first install on macOS and Linux (tests: `scripts/test-install.sh`), shared types in `src/shared/update.ts`, channels `update:check`, `update:pending`, `update:install`, `update:dismiss` and events `update:available`, `update:progress`, `update:checked` (the answer to the menu entry) in `src/shared/ipc.ts`. State (last check, dismissed version) in the `settings` table, `src/main/db/repositories/updateState.ts`; the setting `checkForUpdatesAtLaunch` (key `check_for_updates_at_launch`, no migration) in `src/shared/settings.ts`. UI: `src/renderer/src/update/` (`UpdateProvider`, `UpdateBanner`, `UpdatesSection` in Settings, `UpdateCheckNotice` for the menu answer); `useHoldUpdateBanner` keeps the banner away from `QuizPlayer` and `ProtocolExerciseScreen`.
