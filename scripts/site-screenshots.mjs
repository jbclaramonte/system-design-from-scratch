// Screenshots of the real app for the website (site/), one per step of the learning flow. Run it
// after `npm run package:dir` (docs/Website.md explains the whole procedure):
//
//   node scripts/site-screenshots.mjs [--user-data-dir <dir>] [--out <dir>] [--app <binary>]
//                                     [--cli <claude binary>] [--keep] [--only-exercise]
//
// It launches the PACKAGED app (so the Learning Path locks apply) with a scratch --user-data-dir
// (never the real data folder: a directory that looks like it is refused), drives it over the
// Chrome DevTools protocol to each screen, and writes 2x WebP images into site/assets/img/. The
// learning flow, in the order the learner lives it:
//
//   1. Learning Path: "I already know this" (Declared Mastery) on the first Foundations topic,
//      "Unlock anyway" (Forced Unlock) on the next one, and on a primer topic and a Design
//      Exercise to reach them without mastering what comes before.
//   2. Lesson of the primer topic (a Notion Outline, then the Lesson with a diagram), and a
//      Lesson Question about a selected passage.
//   3. Quiz: one question reworded ("I don't understand the question"), one wrong answer with its
//      feedback, a free answer, the results, then the Remediation Lesson of the missed notion.
//   4. Dashboard and Notion Map.
//   5. Design Exercise: a canvas written into the scratch database (the drawing itself is not what
//      the screenshots are about), the Design Feedback of its High-level design step.
//
// REAL GENERATIONS. Unless --cli points at a fake, every Generation goes through the real Claude
// Code CLI, found like the app finds it (PATH, ~/.local/bin, login shell) and logged in with the
// profile of the environment this script runs in (CLAUDE_CONFIG_DIR is inherited). A run makes
// about ten CLI calls (outline, lesson, quiz, lesson question, clarification, free-answer grading,
// remediation lesson, and design feedback, plus the quiz the app pre-generates behind the
// lesson and after the remediation). Content is French, the default Generation Language. Each run
// writes different content: keep the images of a run you are happy with. When something fails the
// script stops and keeps the scratch folder (no retry: a retry would pay for the calls again).
//
// `--only-exercise` runs the last stage again on a scratch folder a previous run left (after a
// failure there, to avoid paying for the earlier Generations twice).
//
// What it writes into the scratch database directly: the drawing of the exercise and the fact that
// the learner read the Protocol Step Lessons of the two steps of Exercise 1 (otherwise the app
// would generate those lessons when the exercise opens, two more calls the screenshots do not
// need). The app is never driven through its own database otherwise.
import { execFileSync, spawn } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { createServer } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = resolve(import.meta.dirname, '..')
const sleep = (ms) => new Promise((done) => setTimeout(done, ms))

// ---------------------------------------------------------------------------------------------
// Settings of the run
// ---------------------------------------------------------------------------------------------

/** The primer topic taught in the screenshots: a topic with architecture to draw. */
const LESSON_TOPIC = 'load-balancer'
/** Foundations topics: the first is declared as known, the third is unlocked anyway. */
const DECLARED_TOPIC = 'how-the-web-works'
const FORCED_TOPIC = 'inside-a-server'
const EXERCISE = 'pastebin'

const WIDTH = 1280
const HEIGHT = 800
const SCALE = 2
/** Images stay under this size (bytes): WebP quality goes down until they do. */
const MAX_IMAGE_BYTES = 245_000
const QUALITIES = [90, 84, 78, 72, 66, 60]
/** A Generation can take minutes; the script waits this long for one before it gives up. */
const GENERATION_TIMEOUT = 300_000

function argValue(name) {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

const platform = process.platform
if (platform !== 'darwin' && platform !== 'linux') {
  console.error(`site-screenshots: no packaged app for ${platform} (macOS and Linux only).`)
  process.exit(2)
}

function findAppBinary() {
  const explicit = argValue('--app')
  if (explicit) return resolve(explicit)
  if (platform === 'linux') {
    const unpacked = join(root, 'dist', 'linux-unpacked')
    if (!existsSync(unpacked)) return undefined
    return readdirSync(unpacked)
      .map((name) => join(unpacked, name))
      .find((path) => statSync(path).isFile() && statSync(path).size > 50_000_000)
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
  console.error('site-screenshots: no packaged app found. Run `npm run package:dir` first.')
  process.exit(2)
}

const outDir = resolve(argValue('--out') ?? join(root, 'site', 'assets', 'img'))
const keep = process.argv.includes('--keep')
const cli = argValue('--cli') ? resolve(argValue('--cli')) : undefined
const userData = resolve(argValue('--user-data-dir') ?? mkdtempSync(join(tmpdir(), 'sdfs-site-')))

/** Folders the real app stores its data in: never used by this script. */
function looksLikeRealUserData(path) {
  const lower = path.toLowerCase()
  const inside = (dir) => lower === dir.toLowerCase() || lower.startsWith(`${dir.toLowerCase()}/`)
  const realRoots = [join(homedir(), 'Library', 'Application Support'), join(homedir(), '.config')]
  return realRoots.some((dir) => inside(dir) && /system[- ]design/.test(lower))
}
if (looksLikeRealUserData(userData)) {
  console.error(`site-screenshots: ${userData} looks like the real app data folder. Refused.`)
  process.exit(2)
}
const onlyExercise = process.argv.includes('--only-exercise')
if (!onlyExercise && existsSync(join(userData, 'system-design-from-scratch.db'))) {
  console.error(
    `site-screenshots: ${userData} already holds a database. Use an empty folder (or none).`
  )
  process.exit(2)
}
mkdirSync(userData, { recursive: true })
mkdirSync(outDir, { recursive: true })

// ---------------------------------------------------------------------------------------------
// Process control
// ---------------------------------------------------------------------------------------------

let child
let childExited = true
let appOutput = ''

function killTree(signal) {
  if (!child?.pid) return
  try {
    process.kill(-child.pid, signal)
  } catch {
    // already gone
  }
}

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

async function launchApp() {
  const port = await freePort()
  childExited = false
  appOutput = ''
  const env = { ...process.env }
  // A fake CLI, to try the script without spending any Generation.
  if (cli) env.CLAUDE_CLI_PATH = cli
  const args = [
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${port}`,
    // The window may sit behind others or on a sleeping display: keep it rendering, or the PNG
    // export of a canvas (which waits for animation frames) times out.
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-background-timer-throttling'
  ]
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

async function connect(port) {
  let page
  for (let i = 0; i < 120 && !page; i++) {
    if (childExited) throw new Error(`the app exited early:\n${appOutput.slice(0, 600)}`)
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
  const problems = []
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message)
      pending.delete(message.id)
    } else if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      problems.push(`exception: ${details.exception?.description ?? details.text}`)
    }
  })
  const send = (method, params = {}) =>
    new Promise((done) => {
      const id = ++lastId
      pending.set(id, done)
      socket.send(JSON.stringify({ id, method, params }))
    })
  await send('Runtime.enable')
  await send('Page.enable')
  return { send, problems }
}

let cdp

async function evaluate(expression) {
  const reply = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  if (reply.result?.exceptionDetails) {
    const details = reply.result.exceptionDetails
    throw new Error(`page script failed: ${details.exception?.description ?? details.text}`)
  }
  return reply.result?.result?.value
}

async function waitFor(expression, label, timeout = 30_000) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      if (await evaluate(expression)) return
    } catch {
      // the page is between two screens
    }
    await sleep(200)
  }
  throw new Error(`timed out waiting for ${label}`)
}

const q = (selector) => JSON.stringify(selector)

/** Clicks the first element of the selector (a real click on the DOM node). */
async function click(selector, label = selector) {
  await waitFor(`!!document.querySelector(${q(selector)})`, label, 20_000)
  await evaluate(`document.querySelector(${q(selector)}).click()`)
}

/** Clicks the first enabled button of the page whose text starts with `prefix`. */
async function clickButton(prefix, scope = 'body') {
  const found = `[...document.querySelector(${q(scope)}).querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${q(prefix)}) && !b.disabled)`
  await waitFor(`!!${found}`, `button "${prefix}"`, 20_000)
  await evaluate(`${found}.click()`)
}

/** Sets the value of a React-controlled input or textarea. */
async function fill(selector, value) {
  await waitFor(`!!document.querySelector(${q(selector)})`, selector, 20_000)
  await evaluate(`(() => {
    const field = document.querySelector(${q(selector)})
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(field, ${JSON.stringify(value)})
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
}

/** Back to the top of the page, and of every scroll area the app has (the shell scrolls inside). */
const scrollToTop = () =>
  evaluate(`(() => {
    window.scrollTo(0, 0)
    for (const element of document.querySelectorAll('*')) if (element.scrollTop > 0) element.scrollTop = 0
  })()`)

const scrollTo = (selector, block = 'start') =>
  evaluate(`(() => {
    const element = document.querySelector(${q(selector)})
    element?.scrollIntoView({ block: ${q(block)} })
    return !!element
  })()`)

// ---------------------------------------------------------------------------------------------
// Screenshots
// ---------------------------------------------------------------------------------------------

const written = []

/** Captures the viewport as a 2x WebP under the size cap and writes it as `<name>.webp`. */
async function shot(name, { height = HEIGHT } = {}) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height,
    deviceScaleFactor: SCALE,
    mobile: false
  })
  await sleep(700)
  let data
  for (const quality of QUALITIES) {
    const reply = await cdp.send('Page.captureScreenshot', { format: 'webp', quality })
    if (!reply.result?.data) throw new Error(`screenshot ${name} failed`)
    data = Buffer.from(reply.result.data, 'base64')
    if (data.length <= MAX_IMAGE_BYTES) break
  }
  if (data.length > MAX_IMAGE_BYTES) {
    throw new Error(`${name}.webp is ${data.length} bytes, over the ${MAX_IMAGE_BYTES} cap`)
  }
  writeFileSync(join(outDir, `${name}.webp`), data)
  written.push({ name, bytes: data.length, size: `${WIDTH * SCALE}x${height * SCALE}` })
  console.log(`shot ${name}.webp ${(data.length / 1024).toFixed(0)} KB`)
}

// ---------------------------------------------------------------------------------------------
// The scratch database (read to know the answers of the learner's own quiz, written for the two
// things that would cost extra Generations)
// ---------------------------------------------------------------------------------------------

function database(readOnly = true) {
  const db = new DatabaseSync(join(userData, 'system-design-from-scratch.db'), { readOnly })
  db.exec('PRAGMA busy_timeout = 5000')
  return db
}

function topicRow(slug) {
  const db = database()
  try {
    const row = db.prepare('SELECT id, slug, title FROM topics WHERE slug = ?').get(slug)
    if (!row) throw new Error(`no topic ${slug} in the scratch database`)
    return row
  } finally {
    db.close()
  }
}

/** The latest quiz of the topic, its questions in order, with the stored answer keys. */
function latestQuiz(topicId) {
  const db = database()
  try {
    const quiz = db
      .prepare('SELECT id FROM quizzes WHERE topic_id = ? ORDER BY id DESC')
      .get(topicId)
    if (!quiz) throw new Error('no quiz in the scratch database')
    return db
      .prepare(
        `SELECT q.id, q.position, q.type, q.prompt, q.body,
           (SELECT group_concat(notion_id) FROM question_notions WHERE question_id = q.id) AS notions
         FROM questions q WHERE q.quiz_id = ? AND q.replaced_by_question_id IS NULL
         ORDER BY q.position`
      )
      .all(quiz.id)
      .map((row) => ({
        ...row,
        body: JSON.parse(row.body),
        notions: (row.notions ?? '').split(',').filter(Boolean)
      }))
  } finally {
    db.close()
  }
}

/** The drawing of Exercise 1's High-level design step: a paste service with a read path. */
function pasteServiceScene() {
  const component = (id, componentType, label, x, y) => ({
    id,
    type: 'component',
    position: { x, y },
    width: 160,
    height: 90,
    data: { componentType, label }
  })
  const edge = (id, source, target, label = '', direction = 'forward') => ({
    id,
    source,
    target,
    data: { label, direction }
  })
  return {
    version: 1,
    // Top to bottom: the canvas of the exercise screen is narrow, a tall drawing reads better.
    nodes: [
      component('client', 'client', 'Client', 220, 0),
      component('lb', 'load-balancer', 'Load balancer', 220, 140),
      component('web', 'service', 'Web server', 220, 280),
      component('write', 'service', 'API écriture', 0, 420),
      component('read', 'service', 'API lecture', 440, 420),
      component('sql', 'database', 'Base SQL (métadonnées)', 0, 560),
      component('cache', 'cache', 'Cache', 440, 560),
      component('store', 'database', 'Stockage objets (texte)', 220, 700)
    ],
    edges: [
      edge('e1', 'client', 'lb', 'HTTPS'),
      edge('e2', 'lb', 'web'),
      edge('e3', 'web', 'write', 'POST /pastes'),
      edge('e4', 'web', 'read', 'GET /{lien}'),
      edge('e5', 'write', 'sql'),
      edge('e6', 'read', 'cache'),
      edge('e7', 'write', 'store'),
      edge('e8', 'cache', 'store', 'cache miss')
    ],
    viewport: { x: 90, y: 20, zoom: 0.7 }
  }
}

/** Seeds what the exercise screens need beyond the app's own flow (see the header). */
function seedExercise() {
  const db = database(false)
  try {
    const exercise = db.prepare('SELECT id FROM design_exercises WHERE slug = ?').get(EXERCISE)
    if (!exercise) throw new Error(`no design exercise ${EXERCISE} in the scratch database`)
    db.prepare(
      'INSERT OR REPLACE INTO design_scenes (design_exercise_id, snapshot) VALUES (?, ?)'
    ).run(exercise.id, JSON.stringify(pasteServiceScene()))
    for (const step of ['functional_requirements', 'high_level_design']) {
      db.prepare(
        'INSERT OR IGNORE INTO protocol_step_encounters (protocol_step, design_exercise_id) VALUES (?, ?)'
      ).run(step, exercise.id)
    }
  } finally {
    db.close()
  }
}

// ---------------------------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------------------------

/** Opens the Learning Path (the nav item) and shows every step. */
async function openPath(filter = 'all') {
  await click('[data-testid=open-learning-path]')
  await click(`[data-testid=path-filter-${filter}]`)
  await sleep(300)
}

/** Clicks `label` on the row of the Learning Path step titled `title`. */
async function onRow(title, label) {
  const expression = `(() => {
    const rows = [...document.querySelectorAll('[data-testid=learning-path] li')]
    const row = rows.filter((r) => r.textContent.includes(${JSON.stringify(title)}))
      .sort((a, b) => a.textContent.length - b.textContent.length)[0]
    const button = row && [...row.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(label)}))
    if (!button) return false
    button.click()
    return true
  })()`
  await waitFor(expression, `"${label}" on ${title}`, 20_000)
}

/** Declared Mastery on the first Foundations topic, Forced Unlock on the others. */
async function pathScreens() {
  const declared = topicRow(DECLARED_TOPIC)
  const forced = topicRow(FORCED_TOPIC)
  const lesson = topicRow(LESSON_TOPIC)
  await openPath()
  await onRow(declared.title, 'I already know this')
  await click('[data-testid=declare-confirm]')
  await waitFor(`!!document.querySelector('[data-testid=path-declared-marker]')`, 'declared marker')
  await onRow(forced.title, 'Unlock anyway')
  await click('[data-testid=path-unlock-confirm]')
  await waitFor(`!!document.querySelector('[data-testid=path-forced-marker]')`, 'forced marker')
  await onRow(lesson.title, 'Unlock anyway')
  await click('[data-testid=path-unlock-confirm]')
  await waitFor(
    `document.querySelectorAll('[data-testid=path-forced-marker]').length >= 2`,
    'second forced marker'
  )
  await scrollToTop()
  await shot('path-topics', { height: 1000 })
}

/** The Lesson of the primer topic, a diagram, a Lesson Question. */
async function lessonScreens() {
  const topic = topicRow(LESSON_TOPIC)
  await openPath('primer')
  await clickButton(topic.title, '[data-testid=learning-path]')
  console.log(`generating the lesson of "${topic.title}" (outline, lesson, quiz)...`)
  await waitFor(
    `!!document.querySelector('[data-testid=mastery-start-round]') && !document.querySelector('[data-testid=lesson-status]')`,
    'the lesson',
    GENERATION_TIMEOUT
  )
  await waitFor(`!!document.querySelector('[data-testid=diagram-svg]')`, 'a diagram in the lesson')
  await sleep(500)
  await scrollTo('[data-testid=diagram]', 'center')
  await shot('lesson', { height: 900 })

  // A Lesson Question about the first paragraph of the first notion section.
  await evaluate(`(() => {
    const body = document.querySelector('[data-testid=lesson-body]') ?? document.querySelector('[data-testid=lesson-view]')
    const paragraphs = [...body.querySelectorAll('h2 ~ p')]
    const paragraph =
      paragraphs.find((p) => p.textContent.trim().length > 120) ??
      paragraphs.sort((x, y) => y.textContent.length - x.textContent.length)[0]
    if (!paragraph) throw new Error('no paragraph to select')
    paragraph.scrollIntoView({ block: 'center' })
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  await click('[data-testid=lesson-ask-button]')
  await fill(
    '[data-testid=lesson-ask-input]',
    'Peux-tu me donner un exemple concret pour ce passage ?'
  )
  await click('[data-testid=lesson-ask-send]')
  console.log('asking a Lesson Question...')
  await waitFor(
    `(document.querySelector('[data-testid=lesson-ask-answer]')?.textContent.length ?? 0) > 80 && !document.querySelector('[data-testid=lesson-ask-cancel]')`,
    'the answer to the Lesson Question',
    GENERATION_TIMEOUT
  )
  await sleep(500)
  await shot('lesson-ask', { height: 900 })
  await click('[data-testid=lesson-ask-close]')
}

/** Text of the labels of the visible choice inputs, in display order. */
const choiceLabels = () =>
  evaluate(
    `[...document.querySelectorAll('[data-testid=mastery-step] input[data-testid^=choice-]')].map((input) => (input.closest('label') ?? input.parentElement).textContent.trim())`
  )

/** Selects the choices whose text is in `texts` (display order is the stored order). */
async function pick(texts) {
  const labels = await choiceLabels()
  for (const text of texts) {
    const index = labels.findIndex((label) => label === text || label.includes(text))
    if (index === -1) throw new Error(`choice "${text}" not found among ${labels.join(' | ')}`)
    await click(`[data-testid=choice-${index}]`)
  }
}

/** The texts of the correct choices, or of enough wrong ones to make the answer wrong. */
function answerTexts(question, wrong) {
  const choices = question.body.choices
  if (!wrong) return choices.filter((choice) => choice.correct).map((choice) => choice.text)
  const incorrect = choices.find((choice) => !choice.correct)
  return [incorrect.text]
}

/** Plays the round: a clarification, one wrong answer, a free answer, then the results. */
async function quizScreens() {
  const topic = topicRow(LESSON_TOPIC)
  await click('[data-testid=mastery-start-round]')
  // The quiz is usually pre-generated behind the lesson, otherwise it is generated now.
  await waitFor(
    `!!document.querySelector('[data-testid=quiz-position]')`,
    'the first question',
    GENERATION_TIMEOUT
  )
  const questions = latestQuiz(topic.id)
  console.log(`round: ${questions.map((question) => question.type).join(', ')}`)

  // The wrong answer, and the clarification, go on the first choice question.
  const flagged = questions.find((question) => question.type !== 'free_answer')
  for (const question of questions) {
    await waitFor(
      `document.querySelector('[data-testid=quiz-position]')?.textContent.startsWith('Question ${question.position + 1} ')`,
      `question ${question.position + 1}`
    )
    await sleep(400)
    if (question.type === 'free_answer') {
      await fill('[data-testid=free-answer-text]', question.body.modelAnswer)
      await click('[data-testid=submit-answer]')
      console.log('grading the free answer...')
      await waitFor(
        `!!document.querySelector('[data-testid=next-question]')`,
        'the free-answer grading',
        GENERATION_TIMEOUT
      )
    } else {
      if (question === flagged) {
        await click('[data-testid=clarify-question]')
        console.log('rewording the question...')
        await waitFor(
          `!!document.querySelector('[data-testid=clarification]')`,
          'the clarification',
          GENERATION_TIMEOUT
        )
        await sleep(400)
        await scrollTo('[data-testid=quiz-position]', 'start')
        await shot('quiz-clarify', { height: 950 })
      }
      await pick(answerTexts(question, question === flagged))
      await click('[data-testid=submit-answer]')
      await waitFor(`!!document.querySelector('[data-testid=next-question]')`, 'the feedback')
      if (question === flagged) {
        await scrollTo('[data-testid=quiz-position]', 'start')
        await shot('quiz-feedback', { height: 950 })
      }
    }
    await click('[data-testid=next-question]')
  }
  await click('[data-testid=complete-round]')
  await click('[data-testid=mastery-continue]')
  console.log('generating the Remediation Lesson...')
  await waitFor(
    `!!document.querySelector('[data-testid=remediation-lesson]') && !!document.querySelector('[data-testid=remediation-origin]')`,
    'the Remediation Lesson',
    GENERATION_TIMEOUT
  )
  await sleep(600)
  await scrollTo('[data-testid=mastery-remediation]', 'start')
  await shot('remediation', { height: 950 })
}

async function dashboardScreens() {
  await click('[data-testid=open-dashboard]')
  await waitFor(
    `document.querySelectorAll('[data-testid=notion-cell]').length > 0`,
    'the Notion Map'
  )
  await scrollToTop()
  await sleep(300)
  await shot('dashboard', { height: 1000 })
  await evaluate(`(() => {
    const cell = document.querySelector('[data-testid=notion-cell]')
    const heading = [...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Notion Map'))
    heading?.scrollIntoView({ block: 'start' })
    cell?.click()
  })()`)
  await sleep(500)
  await shot('notion-map', { height: 900 })
}

async function exerciseScreens() {
  await openPath('design_exercises')
  const exercise = await evaluate(
    `document.querySelector('[data-testid=path-unlock-anyway]') ? 'locked' : 'open'`
  )
  if (exercise === 'locked') {
    await click('[data-testid=path-unlock-anyway]')
    await click('[data-testid=path-unlock-confirm]')
    await waitFor(
      `!!document.querySelector('[data-testid=path-forced-marker]')`,
      'exercise unlocked'
    )
  }
  await scrollToTop()
  await scrollTo('[data-testid=path-forced-marker]', 'center')
  await shot('path-exercises', { height: 1000 })

  seedExercise()
  await clickButton('Design Pastebin', '[data-testid=learning-path]')
  await click('[data-testid=step-high_level_design]')
  await waitFor(
    `!!document.querySelector('[data-testid=protocol-canvas] .react-flow__node')`,
    'the canvas'
  )
  await sleep(1200)
  await shot('design-canvas', { height: 1000 })

  await click('[data-testid=step-submit]')
  console.log('asking for the Design Feedback...')
  // Nothing happens when the export fails: say why instead of waiting for minutes.
  await waitFor(
    `!!document.querySelector('[data-testid=protocol-pending], [data-testid=step-feedback], [role=alert]')`,
    'the submission to start',
    15_000
  )
  const alert = await evaluate(`document.querySelector('[role=alert]')?.textContent ?? ''`)
  if (alert) throw new Error(`the submission was refused: ${alert}`)
  await waitFor(
    `!!document.querySelector('[data-testid=step-feedback]')`,
    'the Design Feedback',
    GENERATION_TIMEOUT
  )
  await sleep(600)
  await scrollTo('[data-testid=step-feedback]', 'start')
  await shot('design-feedback', { height: 1000 })
}

async function main() {
  console.log(`scratch data folder: ${userData}`)
  console.log(cli ? `CLI: ${cli} (not the real one)` : 'CLI: the real Claude Code CLI')
  const port = await launchApp()
  cdp = await connect(port)
  // A fresh data folder asks the course language first: French, as the images have always been.
  await waitFor(
    `!!document.querySelector('[data-testid=first-run], [data-testid=learning-path]')`,
    'the first-run screen or the Learning Path'
  )
  if (await evaluate(`!!document.querySelector('[data-testid=first-run]')`)) {
    await click('[data-testid=first-run-fr]')
    await click('[data-testid=first-run-confirm]')
  }
  await waitFor(`!!document.querySelector('[data-testid=learning-path]')`, 'the Learning Path')
  // No animation in the images.
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await cdp.send('Page.bringToFront')
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }]
  })

  if (!onlyExercise) {
    await pathScreens()
    await lessonScreens()
    await quizScreens()
    await dashboardScreens()
  }
  await exerciseScreens()

  const total = written.reduce((sum, image) => sum + image.bytes, 0)
  console.log(
    `${written.length} images, ${(total / 1024).toFixed(0)} KB in ${outDir}. Check each one for personal data before committing.`
  )
  if (cdp.problems.length > 0) console.log(`page problems:\n${cdp.problems.join('\n')}`)
}

try {
  await main()
} catch (error) {
  console.error(`site-screenshots: ${error instanceof Error ? error.message : error}`)
  console.error(`The scratch folder is kept: ${userData}`)
  await stopApp()
  process.exit(1)
}
await stopApp()
if (!keep && !argValue('--user-data-dir')) rmSync(userData, { recursive: true, force: true })
