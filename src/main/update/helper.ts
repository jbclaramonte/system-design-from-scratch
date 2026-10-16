// The detached helper that swaps the app bundle once the app has quit. The running app cannot
// replace itself: a process outliving it does the swap, relaunches the new version and cleans up.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { UpdateError } from './errors'

/**
 * Arguments: APP_PID TARGET STAGING BACKUP WORK LOG WAIT_SECONDS XATTR_COMMAND EXECUTABLE [APP_ARGS...]
 * (EXECUTABLE is the app's binary relative to TARGET).
 *
 * 1. Waits for APP_PID to exit (WAIT_SECONDS at most; then it gives up, removes the staged copy
 *    and leaves the running app alone).
 * 2. Swaps: TARGET becomes BACKUP, STAGING becomes TARGET (two renames in one folder, hence one
 *    volume; the gap between them is two system calls). If the second rename fails, the first is
 *    undone. The old app is only deleted once the new one is in place.
 * 3. Clears the quarantine attribute when present, relaunches the app (its binary, with the
 *    arguments and the environment it was started with, as Electron's own `app.relaunch()` does:
 *    a custom --user-data-dir survives the update), removes BACKUP and WORK.
 *
 * On any failure the old app stays (or is put back) at TARGET and is relaunched; STAGING is
 * removed. The log file holds one line per step (overwritten at each update).
 */
export const HELPER_SCRIPT = `#!/bin/bash
set -u
APP_PID="$1"; TARGET="$2"; STAGING="$3"; BACKUP="$4"; WORK="$5"; LOG="$6"
WAIT_SECONDS="$7"; XATTR_COMMAND="$8"; EXECUTABLE="$9"
shift 9
RELAUNCH_ARGS=("$@")

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S') $*" >> "$LOG"; }
: > "$LOG"

# \${arr[@]+...}: an empty array is an unbound variable for bash 3.2, the macOS one.
relaunch() {
  if [ -x "$TARGET/$EXECUTABLE" ]; then
    (cd / && "$TARGET/$EXECUTABLE" \${RELAUNCH_ARGS[@]+"\${RELAUNCH_ARGS[@]}"} </dev/null >/dev/null 2>&1 &)
    log "relaunched"
  else
    log "relaunch failed: no executable at $TARGET/$EXECUTABLE"
  fi
}

abort() {
  log "abort: $1"
  rm -rf "$STAGING"
  if [ -d "$TARGET" ] && [ "$2" = "relaunch" ]; then relaunch; fi
  rm -rf "$WORK"
  exit 1
}

ticks=$((WAIT_SECONDS * 5))
while kill -0 "$APP_PID" 2>/dev/null; do
  if [ "$ticks" -le 0 ]; then abort "the app did not quit in time" no-relaunch; fi
  ticks=$((ticks - 1))
  sleep 0.2
done
log "the app quit"

[ -d "$STAGING" ] || abort "the staged copy is missing" relaunch
[ ! -e "$BACKUP" ] || abort "the backup path is taken" relaunch

mv "$TARGET" "$BACKUP" || abort "could not move the installed app aside" relaunch
if ! mv "$STAGING" "$TARGET"; then
  mv "$BACKUP" "$TARGET" || log "could not put the old app back: it is at $BACKUP"
  abort "could not move the new app into place" relaunch
fi
log "swapped"

if "$XATTR_COMMAND" -p com.apple.quarantine "$TARGET" >/dev/null 2>&1; then
  "$XATTR_COMMAND" -dr com.apple.quarantine "$TARGET" >> "$LOG" 2>&1 || log "could not clear quarantine"
fi

relaunch
rm -rf "$BACKUP" "$WORK"
log "done"
`

export interface HelperPlan {
  /** The app's process id: the helper waits until it exits. */
  appPid: number
  /** The bundle to replace. */
  target: string
  /** The verified new bundle, next to the target. */
  staging: string
  /** Where the old bundle goes during the swap, next to the target. */
  backup: string
  /** The temporary folder: holds the script, removed by the script at the end. */
  work: string
  log: string
  /** The app's binary, relative to the bundle (`Contents/MacOS/System Design from Scratch`). */
  executable: string
  /** The command-line arguments the app was started with, passed to the relaunch. */
  args: string[]
  waitSeconds?: number
  xattrCommand?: string
}

type Spawn = (file: string, args: string[], options: SpawnOptions) => ChildProcess

/** Writes the script and starts it detached, so it outlives the app. */
export async function launchHelper(plan: HelperPlan, spawn: Spawn = nodeSpawn): Promise<void> {
  const script = join(plan.work, 'swap.sh')
  await writeFile(script, HELPER_SCRIPT, { mode: 0o700 })
  await chmod(script, 0o700)
  let child: ChildProcess
  try {
    child = spawn(
      '/bin/bash',
      [
        script,
        String(plan.appPid),
        plan.target,
        plan.staging,
        plan.backup,
        plan.work,
        plan.log,
        String(plan.waitSeconds ?? 120),
        plan.xattrCommand ?? 'xattr',
        plan.executable,
        ...plan.args
      ],
      { detached: true, stdio: 'ignore' }
    )
  } catch (error) {
    throw new UpdateError(
      'helper',
      'The update could not be prepared to finish after the restart.',
      {
        cause: error
      }
    )
  }
  if (child.pid === undefined) {
    throw new UpdateError('helper', 'The update could not be prepared to finish after the restart.')
  }
  child.unref()
}
