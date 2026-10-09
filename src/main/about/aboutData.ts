// About screen data: the primer attribution from the Source Corpus metadata and the third-party
// licenses from resources/licenses.json, validated before they cross IPC.
import { z } from 'zod'
import type { AboutInfo } from '../../shared/about'
import type { CorpusMetadata } from '../corpus'

export const APP_NAME = 'System Design from Scratch'

/** Links open in the OS browser, which only accepts http and https. */
const webUrl = z.url({ protocol: /^https?$/ })
const text = z.string().trim().min(1)

const licenseFileSchema = z.object({ file: text, text: z.string() })

export const licensesFileSchema = z.object({
  schemaVersion: z.literal(1),
  generator: text,
  rule: text,
  packages: z.array(
    z.object({
      name: text,
      version: text,
      license: text,
      licenseFiles: z.array(licenseFileSchema),
      special: z.enum(['tldraw', 'electron']).nullable()
    })
  )
})

export const aboutInfoSchema = z.object({
  appName: text,
  appVersion: text,
  primer: z.object({
    repository: text,
    repositoryUrl: webUrl,
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    permalink: webUrl,
    fetchedAt: text,
    licenseName: text,
    licenseSpdx: text,
    licenseUrl: webUrl,
    upstreamNotice: text,
    attribution: text,
    modifications: text,
    thirdPartyContent: text
  }),
  licenses: licensesFileSchema
})

export interface AboutSources {
  appVersion: string
  metadata: CorpusMetadata
  /** Parsed resources/licenses.json, unvalidated. */
  licenses: unknown
}

/** Assembles and validates the About screen data; throws when a source is malformed. */
export function assembleAbout({ appVersion, metadata, licenses }: AboutSources): AboutInfo {
  const info: AboutInfo = aboutInfoSchema.parse({
    appName: APP_NAME,
    appVersion,
    primer: {
      repository: metadata.repository,
      repositoryUrl: metadata.repositoryUrl,
      commitSha: metadata.commitSha,
      permalink: `${metadata.repositoryUrl}/tree/${metadata.commitSha}`,
      fetchedAt: metadata.fetchedAt,
      licenseName: metadata.license.name,
      licenseSpdx: metadata.license.spdx,
      licenseUrl: metadata.license.url,
      upstreamNotice: metadata.license.upstreamNotice,
      attribution: metadata.attribution,
      modifications: metadata.modifications,
      thirdPartyContent: metadata.thirdPartyContent
    },
    licenses
  })
  return info
}
