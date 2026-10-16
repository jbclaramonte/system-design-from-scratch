// Rows written the way the app did before the Generation Language (migration 8): without a
// `language` column. Migration tests use them to fill an older schema before migrating, since the
// repositories write the current columns.
import { contentCacheKey } from '../repositories/contentCache'
import type { ContentCacheKind, Json } from '../types'
import type { Database } from '../driver'

/** A Content Cache entry as old code stored it; returns its (French) cache key. */
export function insertLegacyCacheEntry(
  db: Database,
  entry: {
    kind: ContentCacheKind
    inputs: Json
    promptVersion: string
    content: Json
    grounded?: boolean
    sourceSections?: string[]
  }
): string {
  const cacheKey = contentCacheKey(entry.kind, entry.inputs, entry.promptVersion, 'fr')
  db.prepare(
    `INSERT INTO content_cache
       (cache_key, kind, inputs, prompt_version, content, grounded, source_sections)
     VALUES ($cacheKey, $kind, $inputs, $promptVersion, $content, $grounded, $sourceSections)`
  ).run({
    cacheKey,
    kind: entry.kind,
    inputs: JSON.stringify(entry.inputs),
    promptVersion: entry.promptVersion,
    content: JSON.stringify(entry.content),
    grounded: entry.grounded === false ? 0 : 1,
    sourceSections: JSON.stringify(entry.sourceSections ?? [])
  })
  return cacheKey
}

/** A `lessons` row as old code stored it; returns its id. */
export function insertLegacyLesson(
  db: Database,
  lesson: { topicId: number; content: string; contentCacheKey: string | null }
): number {
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO lessons (topic_id, content, grounded, source_sections, content_cache_key)
       VALUES ($topicId, $content, 1, '[]', $contentCacheKey)`
    )
    .run({
      topicId: lesson.topicId,
      content: lesson.content,
      contentCacheKey: lesson.contentCacheKey
    })
  return lastInsertRowid
}
