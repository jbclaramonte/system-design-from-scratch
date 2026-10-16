// Smoke test of the packaged app (`npm run smoke:packaged`, after `npm run package`, `package:dir`,
// `package:linux` or `package:linux:dir`). Launches the packaged binary the way a desktop launcher
// would, as far as a script can. The platform is the one it runs on: the macOS .app on darwin
// (dist/mac-arm64), dist/linux-unpacked on Linux, where it needs a display (CI: `xvfb-run -a npm
// run smoke:packaged`). The app gets a minimal environment (PATH=/usr/bin:/bin, no SHELL, HOME in a
// scratch folder), a scratch --user-data-dir and a fake Claude Code CLI installed in
// <HOME>/.local/bin (a location that src/main/generation/resolveCli.ts tries when `claude` is not
// on PATH). The app is driven over the
// Chrome DevTools protocol (built-in WebSocket of Node 22+, no dependency).
//
//   node scripts/smoke-packaged.mjs [--app <path to the app binary>] [--shots <dir>] [--keep]
//                                   [--no-sandbox]
//
// Linux only: the default Chromium sandbox is kept. It needs either unprivileged user namespaces or
// a chrome-sandbox helper owned by root with mode 4755 next to the binary (the script says which one
// it found). `--no-sandbox` (or SMOKE_NO_SANDBOX=1) turns the sandbox off for a machine that has
// neither, such as a container running as root. SMOKE_APP_ARGS adds Chromium switches (space
// separated), for example --disable-dev-shm-usage in a container with a small /dev/shm.
//
// Two launches share one scratch user-data folder:
//   1. fresh folder: window, Learning Path (21 topics), database, Settings (Test button finds the
//      CLI), About (licenses, fonts), first lesson (fake CLI, Mermaid diagram);
//   2. after every topic is marked mastered in the scratch database: an exercise canvas (React
//      Flow) where a typed component can be added, and no console error.
// The App Update check runs against a local fake release server started by this script (the app
// gets its address through SDFS_UPDATE_API_URL and SDFS_UPDATE_DOWNLOAD_BASE_URL): the real GitHub
// API is never called. On macOS no update is installed. On Linux a third launch runs the whole
// AppImage update: APPIMAGE points at a scratch file standing for the installed AppImage, and
// "Install and restart" replaces it with the fake release's file and relaunches it.
// It never touches the real userData folder or ~/.claude*, always passes --user-data-dir, kills the
// whole process tree it started (also on failure or Ctrl+C), prints one PASS/FAIL line per check
// and exits 1 when a check fails. What it does not cover is listed in docs/Packaging.md
// ("Smoke test").
import { createHash } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer as createHttpServer } from 'node:http'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = resolve(import.meta.dirname, '..')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// ---------------------------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------------------------

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const platform = process.platform
if (platform !== 'darwin' && platform !== 'linux') {
  console.error(`smoke-packaged: no packaged app for ${platform} (macOS and Linux only).`)
  process.exit(2)
}

function findAppBinary() {
  const explicit = argValue('--app')
  if (explicit) return resolve(explicit)
  if (platform === 'linux') {
    // electron-builder unpacks the app in dist/linux-unpacked: the Electron executable is the only
    // executable file of that folder over 50 MB (its name is the package name by default).
    const unpacked = join(root, 'dist', 'linux-unpacked')
    if (!existsSync(unpacked)) return undefined
    const binary = readdirSync(unpacked).find((name) => {
      const stats = statSync(join(unpacked, name))
      return stats.isFile() && stats.size > 50_000_000 && (stats.mode & 0o111) !== 0
    })
    return binary ? join(unpacked, binary) : undefined
  }
  const macosDir = join(
    root,
    'dist',
    'mac-arm64',
    'System Design from Scratch.app',
    'Contents',
    'MacOS'
  )
  if (!existsSync(macosDir)) return undefined
  const [binary] = readdirSync(macosDir)
  return binary ? join(macosDir, binary) : undefined
}

const appBinary = findAppBinary()
if (!appBinary || !existsSync(appBinary)) {
  console.error(
    `smoke-packaged: no packaged app found. Run \`npm run ${platform === 'linux' ? 'package:linux:dir' : 'package:dir'}\` first.`
  )
  process.exit(2)
}

/**
 * Linux: what lets Chromium sandbox the renderer. The setuid helper must be owned by root with the
 * setuid bit (electron-builder cannot do it: it does not run as root); without it Chromium falls
 * back to unprivileged user namespaces, which some distributions restrict (Ubuntu 24.04 AppArmor).
 */
function describeLinuxSandbox() {
  const helper = join(appBinary, '..', 'chrome-sandbox')
  if (!existsSync(helper)) return 'no chrome-sandbox helper next to the binary'
  const stats = statSync(helper)
  return stats.uid === 0 && (stats.mode & 0o4000) !== 0
    ? 'chrome-sandbox helper is setuid root'
    : 'chrome-sandbox helper is not setuid root (relies on unprivileged user namespaces)'
}
const noSandbox =
  platform === 'linux' && (process.argv.includes('--no-sandbox') || !!process.env.SMOKE_NO_SANDBOX)

const keep = process.argv.includes('--keep')
// The scratch folder lives under the OS temp folder; realpath so that the paths we compare with
// (the CLI path reported by Settings) do not depend on the /var -> /private/var link.
const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'sdfs-smoke-')))
const shotsDir = argValue('--shots') ? resolve(argValue('--shots')) : join(scratch, 'shots')
mkdirSync(shotsDir, { recursive: true })
const userData = join(scratch, 'user-data')
const home = join(scratch, 'home')
const cliDir = join(home, '.local', 'bin')
const cliPath = join(cliDir, 'claude')
const callsLog = join(scratch, 'cli-calls.log')
const scratchTmp = join(scratch, 'tmp')
mkdirSync(scratchTmp, { recursive: true })
mkdirSync(userData, { recursive: true })
mkdirSync(cliDir, { recursive: true })

// ---------------------------------------------------------------------------------------------
// Fake release: the GitHub "latest release" answer of a version newer than any real one. The
// update check of the packaged app is pointed at it (launchApp), so it never reaches GitHub.
// ---------------------------------------------------------------------------------------------

const FAKE_RELEASE_VERSION = '99.0.0'
const FAKE_APPIMAGE_NAME = `system-design-from-scratch-${FAKE_RELEASE_VERSION}-x86_64.AppImage`
const fakeAppImageLog = join(scratch, 'fake-appimage-launches.log')
/** The "new AppImage" of the fake release: a script that logs how it was started. */
const FAKE_APPIMAGE_CONTENT = `#!/bin/sh\necho "new $* mark=$SDFS_SMOKE_MARK" >> ${JSON.stringify(fakeAppImageLog)}\n`
const fakeSums = () =>
  `${createHash('sha256').update(FAKE_APPIMAGE_CONTENT).digest('hex')}  ${FAKE_APPIMAGE_NAME}\n`
const fakeReleaseRequests = []
/** Requests made during the first launch: the second one must make none (once a day at most). */
let requestsAfterFirstLaunch = 0
let fakeReleaseServer
let fakeReleaseUrl

function startFakeRelease() {
  return new Promise((done, fail) => {
    const server = createHttpServer((request, response) => {
      fakeReleaseRequests.push(request.url)
      if (request.url === `/files/${FAKE_APPIMAGE_NAME}`) {
        response.writeHead(200, { 'content-type': 'application/octet-stream' })
        response.end(FAKE_APPIMAGE_CONTENT)
        return
      }
      if (request.url === '/files/SHA256SUMS') {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end(fakeSums())
        return
      }
      if (request.url !== '/latest') {
        response.writeHead(404).end()
        return
      }
      const base = `http://127.0.0.1:${server.address().port}/files`
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(
        JSON.stringify({
          tag_name: `v${FAKE_RELEASE_VERSION}`,
          html_url: `https://example.invalid/releases/tag/v${FAKE_RELEASE_VERSION}`,
          draft: false,
          prerelease: false,
          assets: [
            `system-design-from-scratch-${FAKE_RELEASE_VERSION}-arm64.dmg`,
            FAKE_APPIMAGE_NAME,
            'SHA256SUMS'
          ].map((name) => ({ name, browser_download_url: `${base}/${name}` }))
        })
      )
    })
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      fakeReleaseServer = server
      fakeReleaseUrl = `http://127.0.0.1:${server.address().port}`
      done()
    })
  })
}

// ---------------------------------------------------------------------------------------------
// Fake Claude Code CLI: speaks the stream-json protocol the app expects and logs every call.
// ---------------------------------------------------------------------------------------------

const FAKE_CLI_SOURCE = String.raw`
import { appendFileSync } from 'node:fs'
const argv = process.argv.slice(2)
const log = (entry) => appendFileSync(process.env.SMOKE_CALLS_LOG ?? ${JSON.stringify(callsLog)}, JSON.stringify(entry) + '\n')
if (argv.includes('--version')) { log({ call: 'version' }); console.log('9.9.9 (fake smoke CLI)'); process.exit(0) }
if (argv[0] === 'auth') {
  log({ call: 'auth' })
  console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty', email: 'smoke@example.com' }))
  process.exit(0)
}
const SESSION = '00000000-0000-4000-8000-000000000000'
const write = (event) => process.stdout.write(JSON.stringify(event) + '\n')
const streamEvent = (event) => write({ type: 'stream_event', event, session_id: SESSION, parent_tool_use_id: null })
let stdin = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) stdin += chunk
const system = argv[argv.indexOf('--system-prompt') + 1] ?? ''
const hasSchema = argv.includes('--json-schema')
log({ call: hasSchema ? 'structured' : 'text', system: system.slice(0, 60), excerpt: stdin.includes('<excerpt'), cwd: process.cwd(), pathEnv: process.env.PATH ?? null })
const usage = { input_tokens: 1, output_tokens: 1 }
write({ type: 'system', subtype: 'init', cwd: process.cwd(), session_id: SESSION, tools: [], mcp_servers: [], model: 'fake', permissionMode: 'default', slash_commands: [], apiKeySource: 'none', claude_code_version: '9.9.9', output_style: 'default' })
streamEvent({ type: 'message_start', message: { model: 'fake', id: 'm', type: 'message', role: 'assistant', content: [], usage } })
const end = (result, extra = {}) => {
  streamEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage })
  streamEvent({ type: 'message_stop' })
  write({ type: 'result', subtype: 'success', is_error: false, duration_ms: 1, duration_api_ms: 1, num_turns: 1, result, stop_reason: 'end_turn', session_id: SESSION, total_cost_usd: 0, usage, permission_denials: [], ...extra })
}
if (hasSchema) {
  // A Notion Outline (the lesson flow asks for one first): four notions, tied to the primer
  // sections named in the prompt when the topic is grounded.
  const found = [...stdin.matchAll(/\b([a-z][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)\b/g)].map((match) => match[1])
  const prefix = [...new Set(found.map((id) => id.split('/')[0]))].sort((x, y) => found.filter((id) => id.startsWith(y + '/')).length - found.filter((id) => id.startsWith(x + '/')).length)[0]
  const sections = !stdin.includes('Foundations Module') && prefix ? [...new Set(found.filter((id) => id.startsWith(prefix + '/')))] : []
  const out = { notions: [['client-server', 'Client et serveur'], ['request-response', 'Requête et réponse'], ['http-methods', 'Les méthodes HTTP'], ['status-codes', 'Les status codes']].map(([slug, title]) => ({ slug, title, description: 'Description de la notion.', sourceSections: sections })) }
  const json = JSON.stringify(out)
  streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'StructuredOutput', input: {} } })
  streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json } })
  streamEvent({ type: 'content_block_stop', index: 0 })
  end('', { structured_output: out })
} else {
  const cite = /<excerpt id="([^"]+)"/.exec(stdin)?.[1]
  const source = cite ? ' [source: ' + cite + ']' : ''
  const text = '# Smoke test : cadrer le problème\n\nCette leçon est produite par un faux CLI.' + source + '\n\n## Un schéma\n\n__FENCE__mermaid\nflowchart LR\n  A[Client] --> B[Load balancer]\n  B --> C[Service]\n  C --> D[(Base de données)]\n__FENCE__\n\n## À retenir\n\n- Le client appelle le service.\n- Le service lit la base.\n'
  streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  streamEvent({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } })
  streamEvent({ type: 'content_block_stop', index: 0 })
  end(text)
}
`

function installFakeCli() {
  const body = join(scratch, 'fake-claude.mjs')
  writeFileSync(body, FAKE_CLI_SOURCE.replaceAll('__FENCE__', '```'))
  // A shell wrapper: under PATH=/usr/bin:/bin there is no `node`, so the wrapper names the Node
  // that runs this script by its absolute path.
  writeFileSync(
    cliPath,
    `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(body)} "$@"\n`
  )
  chmodSync(cliPath, 0o755)
}

// ---------------------------------------------------------------------------------------------
// Process control
// ---------------------------------------------------------------------------------------------

let child
let childExited = true
let appOutput = ''

function killTree(signal) {
  if (!child?.pid) return
  try {
    // The app is its own process group (detached): the signal reaches its helper processes too.
    process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}

/** Last resort: processes whose command line carries our scratch folder (and nothing else). */
function killStragglers() {
  try {
    execFileSync('pkill', ['-9', '-f', `--user-data-dir=${userData}`], { stdio: 'ignore' })
  } catch {
    // pkill exits 1 when nothing matched
  }
}

async function stopApp() {
  if (!child) return
  killTree('SIGTERM')
  for (let i = 0; i < 30 && !childExited; i++) await sleep(100)
  killTree('SIGKILL')
  killStragglers()
  await sleep(300)
  child = undefined
}

async function freePort() {
  return new Promise((done, fail) => {
    const server = createServer()
    server.once('error', fail)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address()
      server.close(() => done(port))
    })
  })
}

async function launchApp(extraEnv = {}) {
  const port = await freePort()
  childExited = false
  appOutput = ''
  // The scratch --user-data-dir is always passed, so the real userData folder is never opened.
  const args = [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`]
  if (noSandbox) args.push('--no-sandbox')
  args.push(...(process.env.SMOKE_APP_ARGS ?? '').split(/\s+/).filter(Boolean))
  // What a desktop launch gives, minus the things only the system adds: a minimal PATH, no SHELL,
  // a HOME that holds nothing but the fake CLI. On Linux the display (xvfb-run sets DISPLAY and
  // XAUTHORITY) is the only variable passed through: Chromium cannot start without one.
  const env = {
    PATH: '/usr/bin:/bin',
    HOME: home,
    // The app's temporary files (an update's helper script and log) stay in the scratch folder.
    TMPDIR: scratchTmp,
    ...extraEnv,
    SDFS_UPDATE_API_URL: `${fakeReleaseUrl}/latest`,
    SDFS_UPDATE_DOWNLOAD_BASE_URL: `${fakeReleaseUrl}/files`
  }
  if (platform === 'linux') {
    for (const name of ['DISPLAY', 'XAUTHORITY']) {
      if (process.env[name]) env[name] = process.env[name]
    }
  }
  child = spawn(appBinary, args, {
    env,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout.on('data', (chunk) => (appOutput += chunk))
  child.stderr.on('data', (chunk) => (appOutput += chunk))
  child.once('exit', () => (childExited = true))
  return port
}

// Never leave the app running, whatever happens to this script.
process.on('exit', () => {
  killTree('SIGKILL')
  killStragglers()
})
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => process.exit(130))
}

// ---------------------------------------------------------------------------------------------
// Chrome DevTools protocol client
// ---------------------------------------------------------------------------------------------

/** Console problems collected from the page, reported by the "no console errors" check. */
let consoleProblems = []

function redact(text) {
  return String(text)
    .replace(/[\w/.-]*\/Contents\/Resources\//g, '<app>/Resources/')
    .replace(/[\w/.-]*\/linux-unpacked\//g, '<app>/')
    .slice(0, 400)
}

async function connect(port) {
  let page
  for (let i = 0; i < 120 && !page; i++) {
    if (childExited) throw new Error(`the app exited early:\n${redact(appOutput)}`)
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
      page = targets.find((target) => target.type === 'page')
    } catch {
      // the debugging port is not listening yet
    }
    if (!page) await sleep(500)
  }
  if (!page) throw new Error('no page target on the DevTools port')

  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((done, fail) => {
    socket.addEventListener('open', done, { once: true })
    socket.addEventListener('error', () => fail(new Error('DevTools WebSocket error')), {
      once: true
    })
  })
  let lastId = 0
  const pending = new Map()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      consoleProblems.push(`exception: ${redact(details.exception?.description ?? details.text)}`)
    } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
      const text = message.params.args.map((arg) => arg.value ?? arg.description ?? '').join(' ')
      consoleProblems.push(`console.error: ${redact(text)}`)
    } else if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const entry = message.params.entry
      consoleProblems.push(`${entry.source}: ${redact(entry.text)} ${redact(entry.url ?? '')}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((done) => {
      const id = ++lastId
      pending.set(id, done)
      socket.send(JSON.stringify({ id, method, params }))
    })
  const evaluate = async (expression) => {
    const response = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true
    })
    if (response.result?.exceptionDetails) {
      throw new Error(
        `page script failed: ${redact(JSON.stringify(response.result.exceptionDetails))}`
      )
    }
    return response.result?.result?.value
  }
  const waitFor = async (expression, label, timeoutMs = 30000) => {
    const end = Date.now() + timeoutMs
    while (Date.now() < end) {
      try {
        if (await evaluate(expression)) return
      } catch {
        // the page may be navigating or not ready: retry
      }
      await sleep(200)
    }
    throw new Error(`timeout (${timeoutMs / 1000}s) waiting for ${label}`)
  }
  const testId = (id) => `document.querySelector('[data-testid="${id}"]')`
  const client = {
    send,
    evaluate,
    waitFor,
    testId,
    click: (id) => evaluate(`${testId(id)}.click(), true`),
    shot: async (name) => {
      const response = await send('Page.captureScreenshot', { format: 'png' })
      const file = join(shotsDir, `${name}.png`)
      writeFileSync(file, Buffer.from(response.result.data, 'base64'))
      return file
    },
    close: () => socket.close()
  }
  await send('Runtime.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  })
  return client
}

// ---------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------

const results = []

/** Runs one check; prints PASS or FAIL with the reason; returns whether it passed. */
async function check(name, run) {
  try {
    const detail = await run()
    results.push({ name, ok: true })
    console.log(`PASS  ${name}${detail ? ` (${detail})` : ''}`)
    return true
  } catch (error) {
    results.push({ name, ok: false })
    console.log(`FAIL  ${name}: ${redact(error instanceof Error ? error.message : error)}`)
    return false
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readOnlyDb() {
  return new DatabaseSync(join(userData, 'system-design-from-scratch.db'), { readOnly: true })
}

const EXPECTED_TOPICS = 21

async function phaseOne() {
  const port = await launchApp()
  let c
  const opened = await check('window loads and the Learning Path renders', async () => {
    c = await connect(port)
    await c.waitFor(`!!${c.testId('learning-path')}`, 'the Learning Path', 60000)
    const url = await c.evaluate('location.protocol')
    assert(url === 'file:', `expected a file: page, got ${url}`)
  })
  if (!opened) return

  await check(
    `Learning Path shows ${EXPECTED_TOPICS} topics (corpus read from the package)`,
    async () => {
      await c.waitFor(`!!${c.testId('path-progress-text')}`, 'the progress text')
      const progress = await c.evaluate(`${c.testId('path-progress-text')}.textContent`)
      const items = await c.evaluate(`document.querySelectorAll('[data-step^="topic:"]').length`)
      assert(items === EXPECTED_TOPICS, `${items} topic steps`)
      assert(
        new RegExp(`/\\s*${EXPECTED_TOPICS}(?!\\d)`).test(progress),
        `progress text "${progress}"`
      )
    }
  )

  await check('database is created and migrated in the scratch user data', async () => {
    const dbFile = join(userData, 'system-design-from-scratch.db')
    assert(existsSync(dbFile), 'system-design-from-scratch.db is missing')
    const migrationFiles = join(root, 'src', 'main', 'db', 'migrations')
    const expected = existsSync(migrationFiles)
      ? readdirSync(migrationFiles).filter((name) => /^\d{4}-.+\.ts$/.test(name)).length
      : undefined
    const db = readOnlyDb()
    try {
      const version = db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get().v
      const topics = db.prepare('SELECT COUNT(*) AS n FROM topics').get().n
      const exercises = db.prepare('SELECT COUNT(*) AS n FROM design_exercises').get().n
      assert(topics === EXPECTED_TOPICS, `${topics} rows in topics`)
      assert(exercises > 0, 'no design exercise seeded')
      if (expected !== undefined)
        assert(version === expected, `schema version ${version}, expected ${expected}`)
      return `schema version ${version}, ${topics} topics, ${exercises} exercises`
    } finally {
      db.close()
    }
  })

  await check('the launch check finds the fake release and the banner offers it', async () => {
    await c.waitFor(`!!${c.testId('update-banner')}`, 'the update banner', 30000)
    const text = await c.evaluate(`${c.testId('update-banner')}.textContent`)
    assert(
      text.includes(`Version ${FAKE_RELEASE_VERSION} is available`),
      `banner text: ${text.slice(0, 160)}`
    )
    // macOS arm64 (a writable folder): install in one click; Linux: a link to the release page.
    const action = platform === 'darwin' ? 'update-install' : 'update-download'
    assert(await c.evaluate(`!!${c.testId(action)}`), `no ${action} control in the banner`)
    assert(
      fakeReleaseRequests.includes('/latest'),
      'the fake release server was never asked: the check did not use SDFS_UPDATE_API_URL'
    )
    await c.shot('00-update-banner')
    return `${fakeReleaseRequests.length} request to the fake release`
  })

  await check('Settings: "Check for updates" reports the fake release', async () => {
    await c.click('open-settings')
    await c.waitFor(`!!${c.testId('settings-screen')}`, 'Settings')
    await c.click('settings-check-updates')
    await c.waitFor(
      `/available/.test(${c.testId('settings-update-result')}?.textContent ?? '')`,
      'the update check result'
    )
    assert(
      await c.evaluate(`${c.testId('settings-check-updates-at-launch')}.checked`),
      '"Check for updates at launch" is not on by default'
    )
  })

  await check('"Not now" hides the banner', async () => {
    await c.click('update-dismiss')
    await c.waitFor(`!${c.testId('update-banner')}`, 'the banner to disappear')
  })

  await check('Settings renders and its Test button finds the CLI without PATH', async () => {
    await c.click('open-settings')
    await c.waitFor(`!!${c.testId('settings-screen')}`, 'Settings')
    await c.click('settings-test-cli')
    await c.waitFor(
      `/OK|Failed/.test(${c.testId('settings-cli-check')}?.textContent ?? '')`,
      'the Test result',
      20000
    )
    const text = await c.evaluate(`${c.testId('settings-cli-check')}.textContent`)
    assert(text.includes('OK') && text.includes('9.9.9'), `Test result: ${text.slice(0, 160)}`)
    assert(text.includes(cliPath), `the CLI was not found at ${cliPath}: ${text.slice(0, 160)}`)
  })

  await check('About renders with licenses.json', async () => {
    await c.click('open-about')
    await c.waitFor(`!!${c.testId('about-screen')}`, 'About')
    await c.waitFor(
      `document.querySelectorAll('[data-testid="about-license-entry"]').length > 50`,
      'the third-party license entries (licenses.json)'
    )
    const entries = await c.evaluate(
      `document.querySelectorAll('[data-testid="about-license-entry"]').length`
    )
    const primer = await c.evaluate(`${c.testId('about-attribution')}?.textContent ?? ''`)
    assert(primer.length > 20, 'the primer attribution is missing')
    // The packaged app reports its own version (the one in package.json for the default build).
    const text = await c.evaluate(`${c.testId('about-screen')}.textContent`)
    const expected = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
    if (!argValue('--app')) {
      assert(
        new RegExp(`version\\s*${expected.replaceAll('.', '\\.')}(?![\\d.])`).test(text),
        `About does not show version ${expected}: ${text.slice(0, 120)}`
      )
    }
    return `${entries} license entries, version ${expected}`
  })

  await check('fonts are loaded (Geist, JetBrains Mono)', async () => {
    const fonts = await c.evaluate(`(async () => {
      await document.fonts.ready
      const faces = [...document.fonts].map((face) => ({ family: face.family, status: face.status }))
      return JSON.stringify({
        geist: document.fonts.check('16px "Geist Variable"'),
        faces: faces.filter((face) => face.status === 'loaded').map((face) => face.family)
      })
    })()`)
    const { geist, faces } = JSON.parse(fonts)
    assert(geist, 'document.fonts.check for Geist Variable is false')
    assert(
      faces.some((family) => /Geist/.test(family)),
      `no loaded Geist face (${faces.join(', ')})`
    )
  })

  await check('first topic lesson is generated by the CLI found in ~/.local/bin', async () => {
    await c.click('open-learning-path')
    await c.waitFor(`!!${c.testId('learning-path')}`, 'the Learning Path')
    const slug = await c.evaluate(`(() => {
      const step = document.querySelector('[data-step^="topic:"]:not(.path-step-locked)')
      step.querySelector('button').click()
      return step.getAttribute('data-step')
    })()`)
    await c.waitFor(`!!${c.testId('lesson-origin')}`, 'the lesson to finish', 90000)
    await c.shot('01-lesson')
    const body = await c.evaluate(`document.body.innerText`)
    assert(body.includes('Smoke test'), 'the lesson shown is not the fake CLI one')
    assert(existsSync(callsLog), 'the fake CLI was never called')
    const calls = readFileSync(callsLog, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    assert(
      calls.some((call) => call.call === 'text'),
      'the fake CLI got no lesson request'
    )
    return `${slug}, ${calls.length} CLI calls`
  })

  await check('Mermaid diagram renders in the lesson', async () => {
    await c.waitFor(`!!${c.testId('diagram-svg')}`, 'a rendered diagram', 30000)
    const fallback = await c.evaluate(`!!${c.testId('diagram-fallback')}`)
    assert(!fallback, 'the diagram fell back to its source')
    const nodes = await c.evaluate(
      `document.querySelectorAll('[data-testid="diagram-svg"] svg .node, [data-testid="diagram-svg"] svg g.nodes > g').length`
    )
    assert(nodes >= 3, `${nodes} diagram nodes`)
    await c.evaluate(`${c.testId('diagram-svg')}.scrollIntoView(), true`)
    await sleep(300)
    await c.shot('02-diagram')
    return `${nodes} nodes`
  })

  await check('no console errors (first launch)', async () => {
    assert(consoleProblems.length === 0, consoleProblems.join(' | '))
  })

  requestsAfterFirstLaunch = fakeReleaseRequests.length
  c.close()
  await stopApp()
}

/** Marks every topic mastered in the scratch database (the app is stopped). */
function seedMasteredTopics() {
  const db = new DatabaseSync(join(userData, 'system-design-from-scratch.db'))
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const { id } of db.prepare('SELECT id FROM topics').all()) {
      const quiz = db.prepare('INSERT INTO quizzes (topic_id, grounded) VALUES (?, 0)').run(id)
      db.prepare(
        "INSERT INTO rounds (topic_id, quiz_id, number, completed_at, score_percent, passed) VALUES (?, ?, 1, datetime('now'), 100, 1)"
      ).run(id, quiz.lastInsertRowid)
    }
  } finally {
    db.close()
  }
}

async function phaseTwo() {
  consoleProblems = []
  const seeded = await check('scratch database seeded with every topic mastered', async () => {
    seedMasteredTopics()
    const db = readOnlyDb()
    try {
      const passed = db
        .prepare('SELECT COUNT(DISTINCT topic_id) AS n FROM rounds WHERE passed = 1')
        .get().n
      assert(passed === EXPECTED_TOPICS, `${passed} mastered topics`)
    } finally {
      db.close()
    }
  })
  if (!seeded) return

  const port = await launchApp()
  let c
  const opened = await check('relaunch on the seeded database', async () => {
    c = await connect(port)
    await c.waitFor(
      `!!${c.testId('path-continue')}`,
      'the Continue button of the Learning Path',
      60000
    )
  })
  if (!opened) return

  await check('the dismissed update is not announced again, without a second request', async () => {
    // The Learning Path is on screen: a banner would be visible by now.
    await sleep(1500)
    assert(!(await c.evaluate(`!!${c.testId('update-banner')}`)), 'the banner is back')
    assert(
      fakeReleaseRequests.length === requestsAfterFirstLaunch,
      `${fakeReleaseRequests.length - requestsAfterFirstLaunch} new request(s) to the release API`
    )
  })

  const canvasOpened = await check('exercise opens on the Design Canvas', async () => {
    await c.click('path-continue')
    await c.waitFor(`!!${c.testId('protocol-exercise')}`, 'the exercise screen')
    await c.click('step-high_level_design')
    await c.waitFor(`!!${c.testId('protocol-canvas')}`, 'the canvas panel')
    await c.waitFor(`!!${c.testId('design-palette')}`, 'the component palette')
    await c.waitFor(`!!document.querySelector('.react-flow__renderer')`, 'the React Flow canvas')
  })
  if (!canvasOpened) return

  await check('a typed component can be added and the canvas keeps its fonts', async () => {
    await c.click('add-cache')
    await c.waitFor(
      `document.querySelectorAll('.react-flow__node [data-component="cache"]').length === 1`,
      'a Cache node on the canvas'
    )
    await sleep(500)
    await c.shot('03-design-canvas-component')
    const faces = await c.evaluate(
      `(async () => { await document.fonts.ready; return [...document.fonts].filter((f) => f.status === 'loaded').length })()`
    )
    assert(faces >= 2, `${faces} fonts loaded`)
  })

  await check('no console errors (exercise canvas)', async () => {
    if (process.env.SMOKE_VERBOSE)
      for (const problem of consoleProblems) console.log(`      console: ${problem}`)
    assert(consoleProblems.length === 0, consoleProblems.join(' | '))
  })

  c.close()
  await stopApp()
}

/**
 * Linux only: the whole AppImage update, in the packaged app. APPIMAGE (what the AppImage runtime
 * sets) names a scratch file standing for the installed AppImage; "Install and restart" downloads
 * the fake release's file from the local server, checks it, replaces the scratch file, quits, and
 * a helper relaunches the new file with the arguments and the environment of the app.
 */
async function phaseThree() {
  const folder = join(scratch, 'appimage')
  const installed = join(folder, 'system-design-from-scratch.AppImage')
  mkdirSync(folder, { recursive: true })
  writeFileSync(installed, '#!/bin/sh\necho old\n', { mode: 0o755 })

  const port = await launchApp({ APPIMAGE: installed, SDFS_SMOKE_MARK: 'kept' })
  let c
  const opened = await check(
    'third launch with APPIMAGE set: the Learning Path renders',
    async () => {
      c = await connect(port)
      await c.waitFor(`!!${c.testId('path-continue')}`, 'the Learning Path', 60000)
    }
  )
  if (!opened) return

  const offered = await check(
    'the banner offers "Install and restart" on an AppImage',
    async () => {
      // The version was dismissed in the first launch: the Settings button shows it again.
      await c.click('open-settings')
      await c.waitFor(`!!${c.testId('settings-screen')}`, 'Settings')
      await c.click('settings-check-updates')
      await c.waitFor(`!!${c.testId('update-install')}`, 'the Install and restart button', 30000)
      assert(
        !(await c.evaluate(`!!${c.testId('update-download')}`)),
        'the release link is shown too'
      )
    }
  )
  if (!offered) return

  await check('Install and restart replaces the AppImage and relaunches the new file', async () => {
    await c.click('update-install')
    const fresh = FAKE_APPIMAGE_CONTENT
    for (let i = 0; i < 300 && readFileSync(installed, 'utf8') !== fresh; i++) await sleep(100)
    assert(
      readFileSync(installed, 'utf8') === fresh,
      `the AppImage was not replaced${await bannerError(c)}`
    )
    assert((statSync(installed).mode & 0o111) !== 0, 'the new AppImage is not executable')
    for (let i = 0; i < 300 && !childExited; i++) await sleep(100)
    assert(childExited, 'the app did not quit after the install')
    for (let i = 0; i < 100 && !existsSync(fakeAppImageLog); i++) await sleep(100)
    assert(existsSync(fakeAppImageLog), 'the new AppImage was not relaunched')
    const launches = readFileSync(fakeAppImageLog, 'utf8')
    assert(
      launches.includes(`--user-data-dir=${userData}`) && launches.includes('mark=kept'),
      `the relaunch lost the arguments or the environment: ${launches.trim()}`
    )
    assert(
      readdirSync(folder).join() === 'system-design-from-scratch.AppImage',
      `leftovers next to the AppImage: ${readdirSync(folder).join(', ')}`
    )
    assert(
      !readdirSync(scratchTmp).some(
        (name) => name.startsWith('sdfs-update-') && name !== 'sdfs-update.log'
      ),
      'the update left its temporary folder behind'
    )
    return 'file replaced, app quit, new file relaunched with --user-data-dir and the environment'
  })

  c.close()
  await stopApp()
}

/** The banner's error text, for a failure message. */
async function bannerError(c) {
  const text = await c.evaluate(`${c.testId('update-error')}?.textContent ?? ''`).catch(() => '')
  return text ? `: ${text}` : ''
}

// ---------------------------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------------------------

console.log(`smoke-packaged: ${appBinary}`)
if (platform === 'linux') {
  console.log(
    `smoke-packaged: DISPLAY=${process.env.DISPLAY ?? '(unset)'}, ${noSandbox ? 'sandbox OFF (--no-sandbox)' : `sandbox ON, ${describeLinuxSandbox()}`}`
  )
  if (!process.env.DISPLAY) {
    console.log(
      'smoke-packaged: WARNING no DISPLAY: run it under `xvfb-run -a npm run smoke:packaged`'
    )
  }
}
console.log(
  `smoke-packaged: scratch folder ${scratch} (HOME and user data; the real ones are untouched)`
)
installFakeCli()
try {
  await startFakeRelease()
  await phaseOne()
  if (results.every((result) => result.ok)) {
    await phaseTwo()
    if (platform === 'linux' && results.every((result) => result.ok)) await phaseThree()
  } else {
    console.log('SKIP  second launch (exercise canvas): the first launch failed')
  }
} catch (error) {
  results.push({ name: 'smoke test run', ok: false })
  console.log(`FAIL  smoke test run: ${redact(error instanceof Error ? error.stack : error)}`)
} finally {
  await stopApp()
  fakeReleaseServer?.close()
  const failed = results.filter((result) => !result.ok)
  console.log(
    failed.length === 0
      ? `smoke-packaged: PASS (${results.length} checks)`
      : `smoke-packaged: FAIL (${failed.length} of ${results.length} checks failed)`
  )
  if (failed.length > 0 && appOutput.trim()) console.log(`app output:\n${redact(appOutput)}`)
  if (failed.length > 0 || keep) {
    console.log(`smoke-packaged: scratch folder kept at ${scratch}`)
  } else {
    rmSync(scratch, { recursive: true, force: true })
  }
  process.exitCode = failed.length === 0 ? 0 : 1
}
