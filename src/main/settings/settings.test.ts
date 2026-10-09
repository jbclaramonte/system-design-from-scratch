import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsErrors } from '../../shared/settings'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getSettings } from '../db/repositories/settings'
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
        claudeConfigDir: null
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
      claudeConfigDir: null
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
