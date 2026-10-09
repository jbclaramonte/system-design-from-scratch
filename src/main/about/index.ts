import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AboutInfo } from '../../shared/about'
import type { CorpusMetadata } from '../corpus'
import { assembleAbout } from './aboutData'

export { assembleAbout } from './aboutData'

/** Location of the generated license list, relative to the app root (`app.getAppPath()`). */
export function licensesPath(appRoot: string): string {
  return join(appRoot, 'resources', 'licenses.json')
}

export interface AboutIpc {
  get(): AboutInfo
}

export interface AboutIpcDependencies {
  appVersion: string
  metadata: CorpusMetadata
  licensesPath: string
}

/** Reads resources/licenses.json on the first call only. */
export function createAboutIpc({
  appVersion,
  metadata,
  licensesPath: path
}: AboutIpcDependencies): AboutIpc {
  let cached: AboutInfo | undefined
  return {
    get() {
      cached ??= assembleAbout({
        appVersion,
        metadata,
        licenses: JSON.parse(readFileSync(path, 'utf8')) as unknown
      })
      return cached
    }
  }
}
