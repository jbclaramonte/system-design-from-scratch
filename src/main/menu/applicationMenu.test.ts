import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import {
  buildApplicationMenuTemplate,
  CHECK_FOR_UPDATES_ID,
  type ApplicationMenuOptions
} from './applicationMenu'

function build(overrides: Partial<ApplicationMenuOptions> = {}) {
  const checkForUpdates = vi.fn()
  const template = buildApplicationMenuTemplate({
    platform: 'darwin',
    isDev: false,
    appName: 'System Design from Scratch',
    canCheckForUpdates: true,
    checkForUpdates,
    ...overrides
  })
  return { template, checkForUpdates }
}

const submenu = (template: MenuItemConstructorOptions[], label: string) => {
  const menu = template.find((item) => item.label === label)
  return (menu?.submenu ?? []) as MenuItemConstructorOptions[]
}

const labels = (template: MenuItemConstructorOptions[]) => template.map((item) => item.label)

const roles = (items: MenuItemConstructorOptions[]) => items.map((item) => item.role)

const checkItems = (template: MenuItemConstructorOptions[]) =>
  template.flatMap((menu) =>
    ((menu.submenu ?? []) as MenuItemConstructorOptions[]).filter(
      (item) => item.id === CHECK_FOR_UPDATES_ID
    )
  )

describe('buildApplicationMenuTemplate', () => {
  it('puts "Check for updates..." in the app menu under About on macOS, and nowhere else', () => {
    const { template } = build()
    expect(labels(template)).toEqual([
      'System Design from Scratch',
      'Edit',
      'View',
      'Window',
      'Help'
    ])
    const app = submenu(template, 'System Design from Scratch')
    expect(app[0]).toMatchObject({ role: 'about', label: 'About System Design from Scratch' })
    expect(app[1]).toMatchObject({ id: CHECK_FOR_UPDATES_ID, label: 'Check for updates...' })
    expect(roles(app)).toContain('quit')
    expect(app.find((item) => item.role === 'quit')?.label).toBe('Quit System Design from Scratch')
    expect(checkItems(template)).toHaveLength(1)
  })

  it('puts it in the Help menu on Linux', () => {
    const { template } = build({ platform: 'linux' })
    expect(labels(template)).toEqual(['File', 'Edit', 'View', 'Window', 'Help'])
    expect(submenu(template, 'Help').map((item) => item.id)).toEqual([CHECK_FOR_UPDATES_ID])
    expect(roles(submenu(template, 'File'))).toEqual(['quit'])
    expect(checkItems(template)).toHaveLength(1)
  })

  it('runs the injected check when clicked', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const { template, checkForUpdates } = build({ platform })
      const [item] = checkItems(template)
      ;(item?.click as () => void)()
      expect(checkForUpdates).toHaveBeenCalledTimes(1)
    }
  })

  it('disables the entry when no window can show the result', () => {
    const [item] = checkItems(build({ canCheckForUpdates: false }).template)
    expect(item?.enabled).toBe(false)
    expect(checkItems(build().template)[0]?.enabled).toBe(true)
  })

  it('keeps the standard Edit roles so copy, paste and undo work', () => {
    for (const platform of ['darwin', 'linux'] as const) {
      const edit = roles(submenu(build({ platform }).template, 'Edit'))
      expect(edit).toEqual(
        expect.arrayContaining(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'])
      )
    }
  })

  it('has reload and the developer tools in a development build only', () => {
    const devOnly = ['reload', 'forceReload', 'toggleDevTools']
    for (const platform of ['darwin', 'linux'] as const) {
      const dev = roles(submenu(build({ platform, isDev: true }).template, 'View'))
      expect(dev).toEqual(expect.arrayContaining(devOnly))
      const packaged = roles(submenu(build({ platform, isDev: false }).template, 'View'))
      for (const role of devOnly) expect(packaged).not.toContain(role)
      expect(packaged).toEqual(expect.arrayContaining(['zoomIn', 'zoomOut', 'togglefullscreen']))
    }
  })

  it('keeps Window and Help menus with the roles of the platform', () => {
    expect(roles(submenu(build().template, 'Window'))).toContain('minimize')
    expect(roles(submenu(build({ platform: 'linux' }).template, 'Window'))).toContain('close')
    expect(build().template.find((item) => item.label === 'Help')?.role).toBe('help')
  })
})
