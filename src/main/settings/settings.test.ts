import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsErrors } from '../../shared/settings'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { putCachedContent } from '../db/repositories/contentCache'
import { createLesson, createTopic } from '../db/repositories/learningContent'
import { getGenerationLanguage, getSettings, getTheme } from '../db/repositories/settings'
import { checkCli, parseAuthStatus } from './checkCli'
import { createSettingsIpc } from './settingsIpc'

describe('settingsErrors', () => {
  it('accepts the defaults and the bounds', () => {
    expect(
      settingsErrors({
        masteryThreshold: 100,
        roundLimit: 3,
        questionsPerQuiz: null,
        claudeCliPath: null,
        claudeConfigDir: null,
        generationLanguage: 'fr'
      })
    ).toEqual({})
    expect(settingsErrors({ masteryThreshold: 50, roundLimit: 1, questionsPerQuiz: 4 })).toEqual({})
    expect(settingsErrors({ roundLimit: 10, questionsPerQuiz: 20 })).toEqual({})
    expect(settingsErrors({ claudeCliPath: '/opt/homebrew/bin/claude' })).toEqual({})
  })

  it('refuses values out of range, fractions and relative paths', () => {
    expect(Object.keys(settingsErrors({ masteryThreshold: 49 }))).toEqual(['masteryThreshold'])
    expect(Object.keys(settingsErrors({ masteryThreshold: 101 }))).toEqual(['masteryThreshold'])
    expect(Object.keys(settingsErrors({ masteryThreshold: 75.5 }))).toEqual(['masteryThreshold'])
    expect(Object.keys(settingsErrors({ roundLimit: 0 }))).toEqual(['roundLimit'])
    expect(Object.keys(settingsErrors({ roundLimit: 11 }))).toEqual(['roundLimit'])
    expect(Object.keys(settingsErrors({ questionsPerQuiz: 3 }))).toEqual(['questionsPerQuiz'])
    expect(Object.keys(settingsErrors({ claudeCliPath: 'claude' }))).toEqual(['claudeCliPath'])
    expect(Object.keys(settingsErrors({ claudeConfigDir: '~/.claude-perso' }))).toEqual([
      'claudeConfigDir'
    ])
    expect(Object.keys(settingsErrors({ claudeConfigDir: ' ' }))).toEqual(['claudeConfigDir'])
  })

  it('accepts French and English as the Generation Language, nothing else', () => {
    expect(settingsErrors({ generationLanguage: 'fr' })).toEqual({})
    expect(settingsErrors({ generationLanguage: 'en' })).toEqual({})
    expect(Object.keys(settingsErrors({ generationLanguage: 'de' as never }))).toEqual([
      'generationLanguage'
    ])
    expect(Object.keys(settingsErrors({ generationLanguage: '' as never }))).toEqual([
      'generationLanguage'
    ])
  })

  it('accepts System, Light and Dark as the Theme, nothing else', () => {
    for (const theme of ['system', 'light', 'dark'] as const) {
      expect(settingsErrors({ theme })).toEqual({})
    }
    expect(Object.keys(settingsErrors({ theme: 'sepia' as never }))).toEqual(['theme'])
    expect(Object.keys(settingsErrors({ theme: '' as never }))).toEqual(['theme'])
  })

  it('accepts a Daily Goal of 1 to 3 Rounds, nothing else', () => {
    for (const dailyGoalRounds of [1, 2, 3]) {
      expect(settingsErrors({ dailyGoalRounds })).toEqual({})
    }
    for (const dailyGoalRounds of [0, 4, -1, 1.5, Number.NaN]) {
      expect(Object.keys(settingsErrors({ dailyGoalRounds }))).toEqual(['dailyGoalRounds'])
    }
    expect(Object.keys(settingsErrors({ dailyGoalRounds: '2' as never }))).toEqual([
      'dailyGoalRounds'
    ])
  })

  it('accepts an absolute Claude config directory or null', () => {
    expect(settingsErrors({ claudeConfigDir: '/Users/me/.claude-perso' })).toEqual({})
    expect(settingsErrors({ claudeConfigDir: null })).toEqual({})
  })
})

describe('settings IPC', () => {
  let db: Database

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db, migrations)
  })

  afterEach(() => db.close())

  it('validates, persists, and reports a CLI path change', () => {
    const onCliPathChange = vi.fn()
    const ipc = createSettingsIpc(db, { onCliPathChange })

    expect(ipc.get()).toEqual({
      masteryThreshold: 100,
      roundLimit: 3,
      questionsPerQuiz: null,
      claudeCliPath: null,
      claudeConfigDir: null,
      generationLanguage: 'fr',
      checkForUpdatesAtLaunch: true,
      theme: 'system',
      dailyGoalRounds: 1,
      celebrations: true
    })
    expect(() => ipc.update({ masteryThreshold: 20 })).toThrow(/between 50 and 100/)
    expect(() => ipc.update({ roundLimit: 3, unknown: 1 } as never)).toThrow()
    expect(getSettings(db).masteryThreshold).toBe(100)

    expect(ipc.update({ masteryThreshold: 80, roundLimit: 5 })).toMatchObject({
      masteryThreshold: 80,
      roundLimit: 5
    })
    expect(onCliPathChange).not.toHaveBeenCalled()

    expect(ipc.update({ claudeCliPath: '  /usr/local/bin/claude ' }).claudeCliPath).toBe(
      '/usr/local/bin/claude'
    )
    expect(onCliPathChange).toHaveBeenCalledTimes(1)
    // Empty means the automatic lookup.
    expect(ipc.update({ claudeCliPath: '' }).claudeCliPath).toBeNull()
    expect(onCliPathChange).toHaveBeenCalledTimes(2)
    expect(ipc.update({ questionsPerQuiz: 8 }).questionsPerQuiz).toBe(8)
    expect(ipc.update({ questionsPerQuiz: null }).questionsPerQuiz).toBeNull()
  })

  it('validates and persists the Daily Goal (default 1, read before the first save)', () => {
    const ipc = createSettingsIpc(db)
    expect(ipc.get().dailyGoalRounds).toBe(1)
    expect(() => ipc.update({ dailyGoalRounds: 0 })).toThrow(/between 1 and 3/)
    expect(() => ipc.update({ dailyGoalRounds: 4 })).toThrow(/between 1 and 3/)
    expect(() => ipc.update({ dailyGoalRounds: '2' } as never)).toThrow()
    expect(ipc.get().dailyGoalRounds).toBe(1)
    expect(ipc.update({ dailyGoalRounds: 3 }).dailyGoalRounds).toBe(3)
    expect(getSettings(db).dailyGoalRounds).toBe(3)
    expect(ipc.update({ roundLimit: 4 }).dailyGoalRounds).toBe(3)
  })

  it('persists "Check for updates at launch" and refuses anything but a boolean', () => {
    const ipc = createSettingsIpc(db)
    expect(ipc.get().checkForUpdatesAtLaunch).toBe(true)
    expect(() => ipc.update({ checkForUpdatesAtLaunch: 'no' } as never)).toThrow()
    expect(ipc.update({ checkForUpdatesAtLaunch: false }).checkForUpdatesAtLaunch).toBe(false)
    expect(ipc.get().checkForUpdatesAtLaunch).toBe(false)
    expect(ipc.update({ checkForUpdatesAtLaunch: true }).checkForUpdatesAtLaunch).toBe(true)
  })

  it('persists Celebrations (default on, read before the first save) and refuses anything but a boolean', () => {
    const ipc = createSettingsIpc(db)
    expect(ipc.get().celebrations).toBe(true)
    expect(() => ipc.update({ celebrations: 'off' } as never)).toThrow()
    expect(ipc.update({ celebrations: false }).celebrations).toBe(false)
    expect(getSettings(db).celebrations).toBe(false)
    expect(ipc.update({ roundLimit: 4 }).celebrations).toBe(false)
    expect(ipc.update({ celebrations: true }).celebrations).toBe(true)
  })

  it('validates, persists and applies the Generation Language without touching stored content', () => {
    const ipc = createSettingsIpc(db)
    const topic = createTopic(db, { slug: 'cache', title: 'Cache', position: 1 })
    createLesson(db, { topicId: topic.id, content: 'Bonjour', grounded: false })
    putCachedContent(db, {
      kind: 'lesson',
      inputs: { topic: 'cache' },
      promptVersion: 'lesson-4',
      language: 'fr',
      content: 'Bonjour',
      grounded: false
    })
    const stored = () => ({
      lessons: db.prepare('SELECT * FROM lessons').all(),
      cache: db.prepare('SELECT * FROM content_cache').all()
    })
    const before = stored()

    expect(ipc.get().generationLanguage).toBe('fr')
    expect(() => ipc.update({ generationLanguage: 'de' } as never)).toThrow()
    expect(() => ipc.update({ generationLanguage: 1 } as never)).toThrow()
    expect(getSettings(db).generationLanguage).toBe('fr')

    expect(ipc.update({ generationLanguage: 'en' }).generationLanguage).toBe('en')
    expect(getGenerationLanguage(db)).toBe('en')
    // Other settings keep their value, the change is for the next Generation only.
    expect(ipc.get()).toMatchObject({ masteryThreshold: 100, generationLanguage: 'en' })
    expect(stored()).toEqual(before)
    expect(ipc.update({ generationLanguage: 'fr' }).generationLanguage).toBe('fr')
    expect(stored()).toEqual(before)
  })

  it('validates and persists the Theme, System by default, and tells main when it changes', () => {
    const onThemeChange = vi.fn()
    const ipc = createSettingsIpc(db, { onThemeChange })
    expect(ipc.get().theme).toBe('system')
    expect(getTheme(db)).toBe('system')
    expect(() => ipc.update({ theme: 'warm' } as never)).toThrow()
    expect(() => ipc.update({ theme: 1 } as never)).toThrow()
    expect(getSettings(db).theme).toBe('system')
    expect(onThemeChange).not.toHaveBeenCalled()

    expect(ipc.update({ theme: 'light' }).theme).toBe('light')
    expect(onThemeChange).toHaveBeenLastCalledWith('light')
    expect(ipc.update({ theme: 'dark' }).theme).toBe('dark')
    expect(getTheme(db)).toBe('dark')
    // An unrelated change does not announce a Theme change.
    onThemeChange.mockClear()
    ipc.update({ roundLimit: 4 })
    expect(onThemeChange).not.toHaveBeenCalled()
    expect(ipc.update({ theme: 'system' }).theme).toBe('system')
  })

  it('reads an unknown stored Theme as System', () => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('theme', '\"sepia\"')").run()
    expect(getTheme(db)).toBe('system')
  })

  it('keeps the Theme after the app restarts (a new connection on the same file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'theme-setting-'))
    try {
      const file = join(dir, 'app.sqlite')
      const first = openDatabase(file)
      migrate(first, migrations)
      createSettingsIpc(first).update({ theme: 'light' })
      first.close()

      const second = openDatabase(file)
      migrate(second, migrations)
      expect(createSettingsIpc(second).get().theme).toBe('light')
      expect(getTheme(second)).toBe('light')
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('keeps the Generation Language after the app restarts (a new connection on the same file)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'language-setting-'))
    try {
      const file = join(dir, 'app.sqlite')
      const first = openDatabase(file)
      migrate(first, migrations)
      createSettingsIpc(first).update({ generationLanguage: 'en' })
      first.close()

      const second = openDatabase(file)
      migrate(second, migrations)
      expect(createSettingsIpc(second).get().generationLanguage).toBe('en')
      second.close()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('stores an existing Claude config directory and refuses a missing one or a file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'claude-profile-'))
    try {
      const file = join(dir, 'file')
      writeFileSync(file, '')
      const ipc = createSettingsIpc(db)

      expect(() => ipc.update({ claudeConfigDir: join(dir, 'missing') })).toThrow(
        /not an existing directory/
      )
      expect(() => ipc.update({ claudeConfigDir: file })).toThrow(/not an existing directory/)
      expect(() => ipc.update({ claudeConfigDir: 'relative' })).toThrow(/absolute directory/)
      expect(getSettings(db).claudeConfigDir).toBeNull()

      expect(ipc.update({ claudeConfigDir: ` ${dir} ` }).claudeConfigDir).toBe(dir)
      expect(ipc.get().claudeConfigDir).toBe(dir)
      // Empty means inherit the environment.
      expect(ipc.update({ claudeConfigDir: '' }).claudeConfigDir).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('refuses to test a missing Claude config directory', async () => {
    const ipc = createSettingsIpc(db)
    await expect(
      ipc.testCli({ claudeCliPath: null, claudeConfigDir: '/no/such/profile-dir' })
    ).resolves.toMatchObject({
      ok: false,
      error: { message: expect.stringMatching(/not an existing/) }
    })
  })
})

// Real outputs of `claude auth status --json` (Claude Code 2.1.295), identifiers replaced.
const authFixtures = {
  claudeAi: JSON.stringify({
    loggedIn: true,
    authMethod: 'claude.ai',
    apiProvider: 'firstParty',
    analyticsDisabled: false,
    projectsDirectory: '/Users/me/.claude-perso/projects',
    configDirectory: '/Users/me/.claude-perso',
    email: 'me@example.com',
    orgId: '00000000-0000-0000-0000-000000000000',
    orgName: "me@example.com's Organization",
    subscriptionType: 'max'
  }),
  thirdParty: JSON.stringify({
    loggedIn: true,
    authMethod: 'third_party',
    apiProvider: 'bedrock',
    analyticsDisabled: false,
    projectsDirectory: '/Users/me/.claude/projects',
    configDirectory: '/Users/me/.claude'
  }),
  // Printed with exit code 1.
  loggedOut: JSON.stringify(
    {
      loggedIn: false,
      authMethod: 'none',
      apiProvider: 'firstParty',
      analyticsDisabled: false,
      projectsDirectory: '/tmp/empty-profile/projects',
      configDirectory: '/tmp/empty-profile'
    },
    null,
    2
  )
}

describe('parseAuthStatus', () => {
  it('reads the login state, method, email and config directory', () => {
    expect(parseAuthStatus(authFixtures.claudeAi)).toEqual({
      loggedIn: true,
      authMethod: 'claude.ai',
      apiProvider: 'firstParty',
      email: 'me@example.com',
      configDirectory: '/Users/me/.claude-perso'
    })
    expect(parseAuthStatus(authFixtures.thirdParty)).toEqual({
      loggedIn: true,
      authMethod: 'third_party',
      apiProvider: 'bedrock',
      email: null,
      configDirectory: '/Users/me/.claude'
    })
    expect(parseAuthStatus(authFixtures.loggedOut)).toMatchObject({
      loggedIn: false,
      authMethod: 'none',
      email: null
    })
  })

  it('returns undefined for anything else', () => {
    expect(parseAuthStatus('')).toBeUndefined()
    expect(parseAuthStatus('Logged in as me')).toBeUndefined()
    expect(parseAuthStatus('{"authMethod":"none"}')).toBeUndefined()
  })
})

describe('checkCli', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'check-cli-'))
  })

  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const script = (name: string, body: string) => {
    const path = join(dir, name)
    writeFileSync(path, `#!/bin/sh\n${body}\n`)
    chmodSync(path, 0o755)
    return path
  }

  /** A fake CLI: `--version`, and `auth status` printing the profile it got (exit 1 if none). */
  const fakeCli = () =>
    script(
      'claude',
      [
        'if [ "$1" = "--version" ]; then echo "2.1.0 (Claude Code)"; exit 0; fi',
        'if [ -n "$CLAUDE_CONFIG_DIR" ]; then',
        `  printf '{"loggedIn":true,"authMethod":"claude.ai","email":"me@example.com","configDirectory":"%s"}' "$CLAUDE_CONFIG_DIR"`,
        'else',
        `  printf '{"loggedIn":false,"authMethod":"none","configDirectory":"/home/.claude"}'; exit 1`,
        'fi'
      ].join('\n')
    )

  it('reports the version and the login state of the inherited profile', async () => {
    const path = fakeCli()
    const env = { ...process.env, CLAUDE_CONFIG_DIR: '' }
    await expect(checkCli({ configuredPath: path, env })).resolves.toEqual({
      ok: true,
      path,
      version: '2.1.0 (Claude Code)',
      auth: {
        ok: true,
        status: {
          loggedIn: false,
          authMethod: 'none',
          apiProvider: null,
          email: null,
          configDirectory: '/home/.claude'
        }
      }
    })
  })

  it('passes the configured Claude config directory as CLAUDE_CONFIG_DIR', async () => {
    const path = fakeCli()
    const env = { ...process.env, CLAUDE_CONFIG_DIR: '' }
    await expect(
      checkCli({ configuredPath: path, env, configDir: '/Users/me/.claude-perso' })
    ).resolves.toMatchObject({
      ok: true,
      auth: {
        ok: true,
        status: {
          loggedIn: true,
          email: 'me@example.com',
          configDirectory: '/Users/me/.claude-perso'
        }
      }
    })
  })

  it('reports an auth status it cannot read without failing the check', async () => {
    const path = script(
      'claude',
      'if [ "$1" = "--version" ]; then echo 1.0.0; exit 0; fi\necho "unknown command" >&2; exit 2'
    )
    await expect(checkCli({ configuredPath: path })).resolves.toMatchObject({
      ok: true,
      version: '1.0.0',
      auth: { ok: false, error: { message: expect.stringContaining('unknown command') } }
    })
  })

  it('reports a missing path and a failing CLI without throwing', async () => {
    await expect(checkCli({ configuredPath: join(dir, 'missing') })).resolves.toMatchObject({
      ok: false,
      error: { code: 'cli_not_found' }
    })
    const broken = script('broken', 'echo boom >&2; exit 3')
    await expect(checkCli({ configuredPath: broken })).resolves.toMatchObject({
      ok: false,
      error: { code: 'unknown', message: expect.stringContaining('boom') }
    })
  })
})
