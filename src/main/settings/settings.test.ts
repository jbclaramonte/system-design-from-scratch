import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsErrors } from '../../shared/settings'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getSettings } from '../db/repositories/settings'
import { checkCli } from './checkCli'
import { createSettingsIpc } from './settingsIpc'

describe('settingsErrors', () => {
  it('accepts the defaults and the bounds', () => {
    expect(
      settingsErrors({
        masteryThreshold: 100,
        roundLimit: 3,
        questionsPerQuiz: null,
        claudeCliPath: null
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
      claudeCliPath: null
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

  it('reports the version of the configured CLI', async () => {
    const path = script('claude', 'echo "2.1.0 (Claude Code)"')
    await expect(checkCli({ configuredPath: path })).resolves.toEqual({
      ok: true,
      path,
      version: '2.1.0 (Claude Code)'
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
