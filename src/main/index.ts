import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, Menu, session, shell } from 'electron'
import { createAboutIpc, licensesPath } from './about'
import { createLessonIpc, FOUNDATIONS_TOPICS, seedTopics } from './content'
import { corpusPath, loadCorpus } from './corpus'
import { createDashboardIpc } from './dashboard'
import { openAppDatabase, type Database } from './db'
import { createGenerationIpc, GenerationService } from './generation'
import { createLessonQuestionIpc } from './lessonQuestion'
import { createDesignIpc } from './ipc/design'
import { createHandlers } from './ipc/handlers'
import { buildApplicationMenuTemplate } from './menu'
import { createMasteryIpc, createMasteryService } from './mastery'
import { createExerciseLockGuard, createLearningPathIpc, createTopicLockGuard } from './path'
import { createProtocolIpc, createProtocolService, seedDesignExercises } from './protocol'
import { createFirstRunIpc } from './settings/firstRunIpc'
import { createSettingsIpc } from './settings/settingsIpc'
import { getSettings, isGenerationLanguageChosen } from './db/repositories/settings'
import {
  getDismissedUpdateVersion,
  getLastUpdateCheck,
  saveDismissedUpdateVersion,
  saveLastUpdateCheck
} from './db/repositories/updateState'
import { resolveCliPath } from './generation/resolveCli'
import { createQuizIpc } from './ipc/quiz'
import { createFreeAnswerGrader } from './quiz/freeAnswerGrader'
import { createQuestionClarifier } from './quiz/questionClarifier'
import { localGraders } from './quiz/grading'
import { createQuizService } from './quiz/service'
import { registerHandlers } from './ipc/registerHandlers'
import { sendEvent } from './ipc/sendEvent'
import {
  checkInstallable,
  createHttpClient,
  createMenuCheck,
  createUpdateIpc,
  createUpdateService,
  endpointsFromEnv,
  installAppImageUpdate,
  installUpdate,
  lookupLatestRelease,
  relaunchEnvironment
} from './update'
import { isAllowedPermission, isExternalWebUrl } from './security'

// The userData folder (database, caches) is named after the package name, never the productName of
// the packaged app ("System Design from Scratch"), so dev, preview and the packaged app share one
// folder. An explicit --user-data-dir (tests, verification runs) still wins.
const USER_DATA_DIR_NAME = 'system-design-from-scratch'
if (!app.commandLine.hasSwitch('user-data-dir')) {
  app.setPath('userData', join(app.getPath('appData'), USER_DATA_DIR_NAME))
}

// The product name of electron-builder.yml, shown in the application menu: `app.name` is the
// package name.
const APP_DISPLAY_NAME = 'System Design from Scratch'

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

const openWindows = () => BrowserWindow.getAllWindows().filter((window) => !window.isDestroyed())

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

  session.defaultSession.setPermissionRequestHandler((_contents, permission, callback) =>
    callback(isAllowedPermission(permission))
  )
  const quizService = createQuizService(db, localGraders, {
    freeAnswerGrader: createFreeAnswerGrader(generation),
    questionClarifier: createQuestionClarifier(generation, db)
  })
  const masteryDeps = { db, corpus, service: generation }
  // Dev builds may open any topic (dev screens); a packaged app enforces the Learning Path lock.
  const assertTopicUnlocked = createTopicLockGuard(
    { db, corpus },
    { allowLockedTopics: !app.isPackaged }
  )
  // App Update: the only network access of the app besides the Claude CLI; the renderer CSP stays
  // `connect-src 'self'`. A development build never checks on its own (see launchCheckAllowed).
  const updateEndpoints = endpointsFromEnv(process.env)
  const updateHttp = createHttpClient()
  const updates = createUpdateService({
    currentVersion: app.getVersion(),
    store: {
      lastCheck: () => getLastUpdateCheck(appDb),
      saveLastCheck: (check) => saveLastUpdateCheck(appDb, check),
      dismissedVersion: () => getDismissedUpdateVersion(appDb),
      saveDismissedVersion: (version) => saveDismissedUpdateVersion(appDb, version)
    },
    checkAtLaunchEnabled: () => getSettings(appDb).checkForUpdatesAtLaunch,
    launchCheckAllowed: app.isPackaged || updateEndpoints.overridden,
    lookup: () => lookupLatestRelease(updateHttp, updateEndpoints),
    checkInstallable: () =>
      checkInstallable({
        platform: process.platform,
        arch: process.arch,
        isPackaged: app.isPackaged,
        execPath: app.getPath('exe'),
        // Set by the AppImage runtime to the running .AppImage file; unset for a deb install.
        appImage: process.env.APPIMAGE
      }),
    install: (plan, onProgress) =>
      plan.kind === 'appimage'
        ? installAppImageUpdate(plan, {
            http: updateHttp,
            onProgress,
            tmpRoot: tmpdir(),
            appPid: process.pid,
            // The relaunched app keeps its switches (such as a custom --user-data-dir) and its
            // environment (such as APPIMAGE_EXTRACT_AND_RUN), and starts where it was started.
            relaunchArgs: process.argv.slice(1),
            relaunchEnv: relaunchEnvironment(process.env),
            startDir: process.env.OWD || process.cwd()
          })
        : installUpdate(plan, {
            http: updateHttp,
            onProgress,
            tmpRoot: tmpdir(),
            appPid: process.pid,
            // The relaunched app keeps its switches, such as a custom --user-data-dir.
            relaunchArgs: process.argv.slice(1)
          }),
    notify: (update) => {
      for (const window of BrowserWindow.getAllWindows()) {
        sendEvent(window.webContents, 'update:available', update)
      }
    },
    scheduleQuit: () => {
      setTimeout(() => app.quit(), 500)
    },
    log: (message) => console.log(message)
  })
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
      lessonQuestion: createLessonQuestionIpc(
        { db, corpus, service: generation },
        { assertTopicUnlocked }
      ),
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
      firstRun: createFirstRunIpc(db, {
        systemLanguages: () => {
          const preferred = app.getPreferredSystemLanguages()
          return preferred.length > 0 ? preferred : [app.getLocale()]
        },
        // Nothing reaches the network before the choice: the launch check follows it.
        onLanguageChosen: () => void updates.checkAtLaunch()
      }),
      settings: createSettingsIpc(db, {
        onCliPathChange: () => generationService.resetCliPath(),
        fallbackCliPath: envCliPath
      }),
      update: createUpdateIpc(updates)
    })
  )
  // "Check for updates..." in the application menu: the service's check, then the result goes to
  // the window, which shows the banner, "You are up to date" or the error.
  const checkFromMenu = createMenuCheck({
    check: () => updates.check(),
    publish: (result) => {
      const windows = openWindows()
      const [front] = windows
      if (front) {
        if (front.isMinimized()) front.restore()
        front.show()
        front.focus()
      }
      for (const window of windows) sendEvent(window.webContents, 'update:checked', result)
    }
  })
  const installApplicationMenu = () =>
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        buildApplicationMenuTemplate({
          platform: process.platform,
          isDev: !app.isPackaged,
          appName: APP_DISPLAY_NAME,
          // macOS keeps the menu with no window open: there would be nowhere to show the result.
          canCheckForUpdates: openWindows().length > 0,
          checkForUpdates: () => void checkFromMenu()
        })
      )
    )
  app.on('browser-window-created', (_event, window) => {
    installApplicationMenu()
    window.once('closed', installApplicationMenu)
  })
  installApplicationMenu()
  createMainWindow()
  // The first-run screen comes first: a fresh folder checks for updates once the language is chosen.
  if (isGenerationLanguageChosen(appDb)) void updates.checkAtLaunch()

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
