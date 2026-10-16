// The detached helper that relaunches an AppImage after an update. The file itself is replaced by
// the installer (appImageInstaller.ts) while the app still runs; what cannot be done from inside
// the app is starting the new one once the old one has quit, because the old AppImage stays
// mounted and the app's data folder in use until the process exits.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { chmod, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { UpdateError } from './errors'

/**
 * Arguments: APP_PID TARGET WORK LOG WAIT_SECONDS START_DIR [APP_ARGS...]
 *
 * 1. Moves to START_DIR (or /), then waits for APP_PID to exit (WAIT_SECONDS at most; then it gives
 *    up without relaunching: the app is still running, the update stays installed for the next
 *    start).
 * 2. Relaunches TARGET (the new AppImage) detached from this script, with APP_ARGS and the
 *    environment the helper itself was started with (the app's, see `relaunchEnvironment`).
 * 3. Removes WORK.
 *
 * The log file holds one line per step (overwritten at each update).
 */
export const APPIMAGE_HELPER_SCRIPT = `#!/bin/bash
set -u
APP_PID="$1"; TARGET="$2"; WORK="$3"; LOG="$4"; WAIT_SECONDS="$5"; START_DIR="$6"
shift 6
RELAUNCH_ARGS=("$@")

log() { echo "$(date '+%Y-%m-%dT%H:%M:%S') $*" >> "$LOG"; }
: > "$LOG"
# Out of the folder the app was in (it may be inside the old AppImage mount), in the one it started in.
cd "$START_DIR" 2>/dev/null || cd /

ticks=$((WAIT_SECONDS * 5))
while kill -0 "$APP_PID" 2>/dev/null; do
  if [ "$ticks" -le 0 ]; then
    log "the app did not quit in time: not relaunching"
    rm -rf "$WORK"
    exit 1
  fi
  ticks=$((ticks - 1))
  sleep 0.2
done
log "the app quit"

if [ -x "$TARGET" ]; then
  ("$TARGET" \${RELAUNCH_ARGS[@]+"\${RELAUNCH_ARGS[@]}"} </dev/null >/dev/null 2>&1 &)
  log "relaunched"
else
  log "relaunch failed: $TARGET is not executable"
fi
rm -rf "$WORK"
log "done"
`

export interface AppImageHelperPlan {
  /** The app's process id: the helper waits until it exits. */
  appPid: number
  /** The new AppImage, at the path of the old one. */
  target: string
  /** The temporary folder: holds the script, removed by the script at the end. */
  work: string
  log: string
  /** The folder the relaunched app starts in (relative arguments keep their meaning). */
  startDir: string
  /** The command-line arguments the app was started with, passed to the relaunch. */
  args: string[]
  /** The environment the app was started with, minus what the AppImage runtime sets again. */
  env: NodeJS.ProcessEnv
  waitSeconds?: number
}

/** A running helper: `cancel` stops it before the app quits (the swap failed after all). */
export interface HelperHandle {
  cancel(): void
}

type Spawn = (file: string, args: string[], options: SpawnOptions) => ChildProcess

/**
 * Set by the AppImage runtime for the instance that runs, and set again by the runtime of the new
 * one: a stale value would point at the old mount.
 */
const RUNTIME_VARIABLES = ['APPIMAGE', 'APPDIR', 'ARGV0', 'OWD']

/** The environment of the running app, ready for the relaunch of the new AppImage. */
export function relaunchEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const copy = { ...env }
  for (const name of RUNTIME_VARIABLES) delete copy[name]
  return copy
}

/** Writes the script and starts it detached, so it outlives the app. */
export async function launchAppImageHelper(
  plan: AppImageHelperPlan,
  spawn: Spawn = nodeSpawn
): Promise<HelperHandle> {
  const failure = (cause?: unknown) =>
    new UpdateError('helper', 'The update could not be prepared to finish after the restart.', {
      cause
    })
  const script = join(plan.work, 'relaunch.sh')
  await writeFile(script, APPIMAGE_HELPER_SCRIPT, { mode: 0o700 })
  await chmod(script, 0o700)
  let child: ChildProcess
  try {
    child = spawn(
      '/bin/bash',
      [
        script,
        String(plan.appPid),
        plan.target,
        plan.work,
        plan.log,
        String(plan.waitSeconds ?? 120),
        plan.startDir,
        ...plan.args
      ],
      { detached: true, stdio: 'ignore', env: plan.env }
    )
  } catch (error) {
    throw failure(error)
  }
  if (child.pid === undefined) throw failure()
  child.unref()
  const { pid } = child
  return {
    cancel() {
      try {
        process.kill(pid)
      } catch {
        // Already gone.
      }
    }
  }
}
