import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CORPUS_SCHEMA_VERSION } from './ingest'
import { createCorpus, type Corpus } from './lookup'
import type { CorpusData } from './types'

export * from './lookup'
export type * from './types'

/** Location of the bundled artifact, relative to the app root (`app.getAppPath()`). */
export function corpusPath(appRoot: string): string {
  return join(appRoot, 'resources', 'corpus', 'primer.json')
}

/** Reads the Source Corpus artifact written by scripts/build-corpus.ts. */
export function loadCorpus(filePath: string): Corpus {
  const data = JSON.parse(readFileSync(filePath, 'utf8')) as CorpusData
  if (data.metadata?.schemaVersion !== CORPUS_SCHEMA_VERSION) {
    throw new Error(`Unsupported corpus schema in ${filePath}`)
  }
  if (!data.metadata.license?.url || !data.metadata.attribution) {
    throw new Error(`Corpus ${filePath} lacks license or attribution metadata`)
  }
  return createCorpus(data)
}
