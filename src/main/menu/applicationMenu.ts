// The application menu, built by a pure function so it can be tested without Electron. Standard
// roles keep copy, paste, undo, zoom, minimize and quit working; reload and the developer tools
// exist in development builds only. "Check for updates..." sits in the app menu under About on
// macOS and in the Help menu elsewhere.
import type { MenuItemConstructorOptions } from 'electron'

/** Id of the "Check for updates..." item, for tests and the packaged smoke test. */
export const CHECK_FOR_UPDATES_ID = 'check-for-updates'

export interface ApplicationMenuOptions {
  platform: NodeJS.Platform
  /** A development build (`npm run dev`, `preview`), not the packaged app. */
  isDev: boolean
  /** The name shown in the macOS app menu (`app.name` is the package name, not the product name). */
  appName: string
  /** Whether a window is open to show the result; macOS keeps the menu when every window is closed. */
  canCheckForUpdates: boolean
  /** Runs the same check as Settings > Updates and shows the result in the app. */
  checkForUpdates: () => void
}

export function buildApplicationMenuTemplate(
  options: ApplicationMenuOptions
): MenuItemConstructorOptions[] {
  const mac = options.platform === 'darwin'
  const checkForUpdates: MenuItemConstructorOptions = {
    id: CHECK_FOR_UPDATES_ID,
    label: 'Check for updates...',
    enabled: options.canCheckForUpdates,
    click: () => options.checkForUpdates()
  }

  const appMenu: MenuItemConstructorOptions = {
    label: options.appName,
    submenu: [
      { role: 'about', label: `About ${options.appName}` },
      checkForUpdates,
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide', label: `Hide ${options.appName}` },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit', label: `Quit ${options.appName}` }
    ]
  }

  const fileMenu: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [{ role: 'quit' }]
  }

  const editMenu: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    ]
  }

  const viewMenu: MenuItemConstructorOptions = {
    label: 'View',
    submenu: [
      ...(options.isDev
        ? ([
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' }
          ] satisfies MenuItemConstructorOptions[])
        : []),
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  }

  const windowMenu: MenuItemConstructorOptions = {
    label: 'Window',
    role: 'window',
    submenu: mac
      ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }]
  }

  // macOS adds its own help search to a menu with the `help` role.
  const helpMenu: MenuItemConstructorOptions = {
    label: 'Help',
    role: 'help',
    submenu: mac ? [] : [checkForUpdates]
  }

  return mac
    ? [appMenu, editMenu, viewMenu, windowMenu, helpMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu, helpMenu]
}
