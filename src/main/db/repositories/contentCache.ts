import { createHash } from 'node:crypto'
import type { Database } from '../driver'
import type { ContentCacheEntry, ContentCacheKind, Json } from '../types'
import { fromFlag, fromJson, NOW, TIMESTAMP_COLUMNS, toFlag, toJson } from './mapping'

/**
 * Content Cache key: SHA-256 of the kind, the generation inputs and the prompt version. Object
 * keys are sorted first, so the key does not depend on property order.
 */
export function contentCacheKey(
  kind: ContentCacheKind,
  inputs: Json,
  promptVersion: string
): string {
  return createHash('sha256').update(canonicalJson({ kind, inputs, promptVersion })).digest('hex')
}

function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as Json)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

export interface NewContentCacheEntry {
  kind: ContentCacheKind
  inputs: Json
  promptVersion: string
  content: Json
  grounded: boolean
  sourceSections?: string[]
}

interface ContentCacheRow extends Omit<
  ContentCacheEntry,
  'inputs' | 'content' | 'grounded' | 'sourceSections'
> {
  inputs: string
  content: string
  grounded: number
  sourceSections: string
}

const CONTENT_CACHE_COLUMNS = `cache_key AS cacheKey, kind, inputs, prompt_version AS promptVersion,
  content, grounded, source_sections AS sourceSections, ${TIMESTAMP_COLUMNS}`

const toEntry = (row: ContentCacheRow): ContentCacheEntry => ({
  ...row,
  inputs: fromJson(row.inputs),
  content: fromJson(row.content),
  grounded: fromFlag(row.grounded),
  sourceSections: fromJson<string[]>(row.sourceSections)
})

export function getCachedContent(db: Database, cacheKey: string): ContentCacheEntry | undefined {
  const row = db
    .prepare(`SELECT ${CONTENT_CACHE_COLUMNS} FROM content_cache WHERE cache_key = $cacheKey`)
    .get<ContentCacheRow>({ cacheKey })
  return row && toEntry(row)
}

/** Stores generated content under its key, replacing a previous entry with the same key. */
export function putCachedContent(db: Database, entry: NewContentCacheEntry): ContentCacheEntry {
  const cacheKey = contentCacheKey(entry.kind, entry.inputs, entry.promptVersion)
  db.prepare(
    `INSERT INTO content_cache
       (cache_key, kind, inputs, prompt_version, content, grounded, source_sections)
     VALUES ($cacheKey, $kind, $inputs, $promptVersion, $content, $grounded, $sourceSections)
     ON CONFLICT (cache_key) DO UPDATE SET
       content = excluded.content, grounded = excluded.grounded,
       source_sections = excluded.source_sections, updated_at = ${NOW}`
  ).run({
    cacheKey,
    kind: entry.kind,
    inputs: toJson(entry.inputs),
    promptVersion: entry.promptVersion,
    content: toJson(entry.content),
    grounded: toFlag(entry.grounded),
    sourceSections: toJson(entry.sourceSections ?? [])
  })
  return getCachedContent(db, cacheKey)!
}
