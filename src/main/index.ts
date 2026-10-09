import { join } from 'node:path'
import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { openAppDatabase, type Database } from './db'
import { createGenerationIpc, GenerationService } from './generation'
import { createHandlers } from './ipc/handlers'
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
  // CLAUDE_CLI_PATH overrides the automatic lookup until the settings screen exposes it.
  generation = new GenerationService({ db, cli: { path: process.env['CLAUDE_CLI_PATH'] } })

  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  registerHandlers(ipcMain, createHandlers({ generation: createGenerationIpc(generation) }))
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
