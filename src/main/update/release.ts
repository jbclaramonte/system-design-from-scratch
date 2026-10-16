// The latest GitHub release: its version, its page and the macOS build it carries.
import { z } from 'zod'
import { UpdateError } from './errors'
import { isAllowedUrl, type HttpClient } from './http'
import { parseVersion } from './version'

export const REPO = 'jbclaramonte/system-design-from-scratch'
const DEFAULT_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`

/** Environment variables that point the whole flow at a local folder (tests, smoke test). */
export const API_URL_ENV = 'SDFS_UPDATE_API_URL'
export const DOWNLOAD_BASE_URL_ENV = 'SDFS_UPDATE_DOWNLOAD_BASE_URL'

export const CHECKSUMS_NAME = 'SHA256SUMS'

export interface UpdateEndpoints {
  /** Returns the latest release as JSON, in the shape of the GitHub API. */
  apiUrl: string
  /** When set, the .dmg and SHA256SUMS are downloaded from this folder URL, not from the assets. */
  downloadBaseUrl?: string
  /** True when an environment variable changed the endpoints. */
  overridden: boolean
}

export function endpointsFromEnv(env: NodeJS.ProcessEnv): UpdateEndpoints {
  const apiUrl = env[API_URL_ENV]?.trim()
  const downloadBaseUrl = env[DOWNLOAD_BASE_URL_ENV]?.trim()
  return {
    apiUrl: apiUrl || DEFAULT_API_URL,
    downloadBaseUrl: downloadBaseUrl || undefined,
    overridden: Boolean(apiUrl || downloadBaseUrl)
  }
}

export const dmgName = (version: string) => `system-design-from-scratch-${version}-arm64.dmg`

export interface MacBuild {
  dmgName: string
  dmgUrl: string
  checksumsUrl: string
}

export interface LatestRelease {
  /** Semver without the leading `v`. */
  version: string
  tag: string
  /** The release page: release notes and manual download. */
  releaseUrl: string
  /** Null when the release does not (yet) carry the macOS .dmg and SHA256SUMS. */
  macBuild: MacBuild | null
}

const releaseSchema = z.object({
  tag_name: z.string(),
  html_url: z.string().optional(),
  draft: z.boolean().optional(),
  prerelease: z.boolean().optional(),
  assets: z
    .array(z.object({ name: z.string(), browser_download_url: z.string().optional() }))
    .default([])
})

/** The release page of a tag, for when the API answer carries no usable address. */
export const releasePageUrl = (tag: string) => `https://github.com/${REPO}/releases/tag/${tag}`

/**
 * Reads the latest release. Null when it is a draft or a pre-release (never offered). Throws an
 * `UpdateError` when the network fails or the answer is not a release with a semver tag.
 */
export async function lookupLatestRelease(
  http: HttpClient,
  endpoints: UpdateEndpoints
): Promise<LatestRelease | null> {
  const body = await http.getJson(endpoints.apiUrl)
  const parsed = releaseSchema.safeParse(body)
  if (!parsed.success) {
    throw new UpdateError(
      'invalid_release',
      'GitHub answered with something that is not a release.'
    )
  }
  const release = parsed.data
  if (release.draft || release.prerelease) return null
  const version = parseVersion(release.tag_name)
  if (!version) {
    throw new UpdateError(
      'invalid_release',
      `The latest release has an unexpected version tag ("${release.tag_name}").`
    )
  }
  const text = release.tag_name.replace(/^v/, '')
  const tag = release.tag_name
  const releaseUrl =
    release.html_url && isAllowedUrl(release.html_url) ? release.html_url : releasePageUrl(tag)

  const asset = (name: string) => release.assets.find((candidate) => candidate.name === name)
  const urlOf = (name: string): string | null => {
    const found = asset(name)
    if (!found) return null
    if (endpoints.downloadBaseUrl) return `${endpoints.downloadBaseUrl.replace(/\/+$/, '')}/${name}`
    return found.browser_download_url ?? null
  }
  const name = dmgName(text)
  const dmgUrl = urlOf(name)
  const checksumsUrl = urlOf(CHECKSUMS_NAME)
  return {
    version: text,
    tag,
    releaseUrl,
    macBuild: dmgUrl && checksumsUrl ? { dmgName: name, dmgUrl, checksumsUrl } : null
  }
}
