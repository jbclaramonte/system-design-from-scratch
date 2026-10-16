// App Update memory, kept in the key/value `settings` table (no migration: the rows appear when
// first written): when the last check ran and what it found, and the version the learner
// dismissed ("Not now"). Not part of the Settings screen, so not in `getSettings`.
import type { Database } from '../driver'
import { NOW } from './mapping'

const LAST_CHECK_KEY = 'update_last_check'
const DISMISSED_KEY = 'update_dismissed_version'

/** What the last check found, enough to show the banner again at launch without a request. */
export interface CachedLatestRelease {
  version: string
  releaseUrl: string
  hasMacBuild: boolean
  /** Whether the release carries the Linux x64 AppImage. */
  hasAppImage: boolean
}

export interface LastUpdateCheck {
  /** ISO 8601. */
  checkedAt: string
  /** Null when the check found no stable release. */
  latest: CachedLatestRelease | null
}

function readJson<T>(db: Database, key: string): T | null {
  const row = db
    .prepare('SELECT value FROM settings WHERE key = $key')
    .get<{ value: string }>({ key })
  if (!row) return null
  try {
    return JSON.parse(row.value) as T
  } catch {
    return null
  }
}

function writeJson(db: Database, key: string, value: unknown): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ($key, $value)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = ${NOW}`
  ).run({ key, value: JSON.stringify(value) })
}

export function getLastUpdateCheck(db: Database): LastUpdateCheck | null {
  const value = readJson<Partial<LastUpdateCheck>>(db, LAST_CHECK_KEY)
  if (!value || typeof value.checkedAt !== 'string') return null
  // A check saved before the Linux AppImage install existed has no `hasAppImage`: assume the
  // release carries it (the install looks the release up again and says so when it does not).
  const latest = value.latest && { ...value.latest, hasAppImage: value.latest.hasAppImage ?? true }
  return { checkedAt: value.checkedAt, latest: latest ?? null }
}

export function saveLastUpdateCheck(db: Database, check: LastUpdateCheck): void {
  writeJson(db, LAST_CHECK_KEY, check)
}

export function getDismissedUpdateVersion(db: Database): string | null {
  const value = readJson<unknown>(db, DISMISSED_KEY)
  return typeof value === 'string' ? value : null
}

export function saveDismissedUpdateVersion(db: Database, version: string | null): void {
  writeJson(db, DISMISSED_KEY, version)
}
