import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { createAboutIpc, licensesPath } from './about'
import { createLessonIpc, FOUNDATIONS_TOPICS, seedTopics } from './content'
import { corpusPath, loadCorpus } from './corpus'
import { createDashboardIpc } from './dashboard'
import { openAppDatabase, type Database } from './db'
import { createGenerationIpc, GenerationService } from './generation'
import { createDesignIpc } from './ipc/design'
import { createHandlers } from './ipc/handlers'
import { createMasteryIpc, createMasteryService } from './mastery'
import { createExerciseLockGuard, createLearningPathIpc, createTopicLockGuard } from './path'
import { createProtocolIpc, createProtocolService, seedDesignExercises } from './protocol'
import { createSettingsIpc } from './settings/settingsIpc'
import { getSettings } from './db/repositories/settings'
import { resolveCliPath } from './generation/resolveCli'
import { createQuizIpc } from './ipc/quiz'
import { createFreeAnswerGrader } from './quiz/freeAnswerGrader'
import { localGraders } from './quiz/grading'
import { createQuizService } from './quiz/service'
import { registerHandlers } from './ipc/registerHandlers'
import { isExternalWebUrl } from './security'

function openExternally(url: string): void {
  if (isExternalWebUrl(url)) {
    void shell.openExternal(url)
  }
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  window.once('ready-to-show', () => window.show())

  // Links and window.open never create Electron windows: web links go to the OS browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url)
    return { action: 'deny' }
  })

  // The renderer is a single page: block every navigation away from it.
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    openExternally(url)
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devServerUrl) {
    void window.loadURL(devServerUrl)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event) => event.preventDefault())
})

let db: Database | undefined
let generation: GenerationService | undefined

void app.whenReady().then(() => {
  const opened = openAppDatabase(app.getPath('userData'))
  db = opened.db
  console.log(`Database ready at schema version ${opened.schemaVersion}`)
  const appDb = db
  // The CLI path setting wins; CLAUDE_CLI_PATH (dev, tests) applies when it is empty.
  const envCliPath = process.env['CLAUDE_CLI_PATH'] || undefined
  generation = new GenerationService({
    db,
    resolveCli: () =>
      resolveCliPath({ configuredPath: getSettings(appDb).claudeCliPath ?? envCliPath }),
    // Read on every call: a Claude config directory change applies at once.
    configDir: () => getSettings(appDb).claudeConfigDir
  })
  const generationService = generation
  const corpus = loadCorpus(corpusPath(app.getAppPath()))
  const seeded = seedTopics(db, corpus, FOUNDATIONS_TOPICS)
  if (seeded > 0) console.log(`Seeded ${seeded} topics from the Source Corpus`)
  const seededExercises = seedDesignExercises(db, corpus)
  if (seededExercises > 0) console.log(`Seeded ${seededExercises} Design Exercises`)

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  const quizService = createQuizService(db, localGraders, {
    freeAnswerGrader: createFreeAnswerGrader(generation)
  })
  const masteryDeps = { db, corpus, service: generation }
  // Dev builds may open any topic (dev screens); a packaged app enforces the Learning Path lock.
  const assertTopicUnlocked = createTopicLockGuard(
    { db, corpus },
    { allowLockedTopics: !app.isPackaged }
  )
  registerHandlers(
    ipcMain,
    createHandlers({
      about: createAboutIpc({
        appVersion: app.getVersion(),
        metadata: corpus.data.metadata,
        licensesPath: licensesPath(app.getAppPath())
      }),
      generation: createGenerationIpc(generation),
      design: createDesignIpc(db, { allowScratch: !app.isPackaged }),
      lesson: createLessonIpc({ db, corpus, service: generation }, { assertTopicUnlocked }),
      quiz: createQuizIpc(db, quizService, {
        allowDevFixture: !app.isPackaged,
        assertTopicUnlocked
      }),
      mastery: createMasteryIpc(
        masteryDeps,
        createMasteryService({ ...masteryDeps, quiz: quizService }),
        { assertTopicUnlocked }
      ),
      path: createLearningPathIpc({ db, corpus }),
      dashboard: createDashboardIpc({ db, corpus }),
      protocol: createProtocolIpc(masteryDeps, createProtocolService(masteryDeps), {
        allowDevFixture: !app.isPackaged,
        assertExerciseUnlocked: createExerciseLockGuard(
          { db, corpus },
          { allowLockedExercises: !app.isPackaged }
        )
      }),
      settings: createSettingsIpc(db, {
        onCliPathChange: () => generationService.resetCliPath(),
        fallbackCliPath: envCliPath
      })
    })
  )
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('will-quit', () => {
  // Kills running CLI processes and drops queued Generations.
  generation?.dispose()
  generation = undefined
  db?.close()
  db = undefined
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
