import { describe, expect, it } from 'vitest'
import { UpdateError } from './errors'
import {
  API_URL_ENV,
  DOWNLOAD_BASE_URL_ENV,
  appImageName,
  dmgName,
  endpointsFromEnv,
  lookupLatestRelease,
  type UpdateEndpoints
} from './release'
import { fakeHttp } from './testing/fakes'

const API = 'http://127.0.0.1:9/latest'
const endpoints: UpdateEndpoints = { apiUrl: API, overridden: false }

const release = (overrides: Record<string, unknown> = {}) => ({
  tag_name: 'v0.3.1',
  html_url: 'https://github.com/o/r/releases/tag/v0.3.1',
  draft: false,
  prerelease: false,
  assets: [
    { name: dmgName('0.3.1'), browser_download_url: 'https://example.test/a.dmg' },
    { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
    { name: 'system-design-from-scratch-0.3.1-x64.AppImage' }
  ],
  ...overrides
})

describe('endpointsFromEnv', () => {
  it('points at the GitHub API by default', () => {
    const result = endpointsFromEnv({})
    expect(result.apiUrl).toMatch(/^https:\/\/api\.github\.com\/repos\/.+\/releases\/latest$/)
    expect(result.downloadBaseUrl).toBeUndefined()
    expect(result.overridden).toBe(false)
  })

  it('is overridden by the environment variables (tests, smoke test)', () => {
    const result = endpointsFromEnv({
      [API_URL_ENV]: 'http://127.0.0.1:8080/latest',
      [DOWNLOAD_BASE_URL_ENV]: ' http://127.0.0.1:8080/files '
    })
    expect(result).toEqual({
      apiUrl: 'http://127.0.0.1:8080/latest',
      downloadBaseUrl: 'http://127.0.0.1:8080/files',
      overridden: true
    })
    expect(endpointsFromEnv({ [API_URL_ENV]: '  ' }).overridden).toBe(false)
  })
})

describe('lookupLatestRelease', () => {
  it('reads the version, the release page and the macOS build from the assets', async () => {
    const latest = await lookupLatestRelease(
      fakeHttp({ [API]: JSON.stringify(release()) }),
      endpoints
    )
    expect(latest).toEqual({
      version: '0.3.1',
      tag: 'v0.3.1',
      releaseUrl: 'https://github.com/o/r/releases/tag/v0.3.1',
      macBuild: {
        dmgName: 'system-design-from-scratch-0.3.1-arm64.dmg',
        dmgUrl: 'https://example.test/a.dmg',
        checksumsUrl: 'https://example.test/sums'
      },
      // The fixture's "-x64.AppImage" is not the name electron-builder gives (x86_64).
      linuxBuild: null
    })
  })

  it('reads the Linux AppImage build from the assets', async () => {
    const body = release({
      assets: [
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' },
        { name: appImageName('0.3.1'), browser_download_url: 'https://example.test/a.AppImage' },
        { name: 'system-design-from-scratch-0.3.1-amd64.deb', browser_download_url: 'https://x/d' }
      ]
    })
    const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), endpoints)
    expect(latest?.linuxBuild).toEqual({
      appImageName: 'system-design-from-scratch-0.3.1-x86_64.AppImage',
      appImageUrl: 'https://example.test/a.AppImage',
      checksumsUrl: 'https://example.test/sums'
    })
    expect(latest?.macBuild).toBeNull()
  })

  it('reports a release without the AppImage or the checksums as having no Linux build', async () => {
    const withoutImage = release({
      assets: [{ name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' }]
    })
    const withoutSums = release({
      assets: [{ name: appImageName('0.3.1'), browser_download_url: 'https://example.test/a' }]
    })
    const staleImage = release({
      assets: [
        { name: appImageName('0.3.0'), browser_download_url: 'https://example.test/old' },
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' }
      ]
    })
    for (const body of [withoutImage, withoutSums, staleImage]) {
      const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), endpoints)
      expect(latest?.linuxBuild).toBeNull()
    }
  })

  it('downloads the AppImage from the folder of the override when there is one', async () => {
    const body = release({
      assets: [{ name: appImageName('0.3.1') }, { name: 'SHA256SUMS' }]
    })
    const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), {
      ...endpoints,
      downloadBaseUrl: 'http://127.0.0.1:8080/files',
      overridden: true
    })
    expect(latest?.linuxBuild).toEqual({
      appImageName: 'system-design-from-scratch-0.3.1-x86_64.AppImage',
      appImageUrl: 'http://127.0.0.1:8080/files/system-design-from-scratch-0.3.1-x86_64.AppImage',
      checksumsUrl: 'http://127.0.0.1:8080/files/SHA256SUMS'
    })
  })

  it('downloads from the folder of the override when there is one', async () => {
    const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(release()) }), {
      ...endpoints,
      downloadBaseUrl: 'http://127.0.0.1:8080/files/',
      overridden: true
    })
    expect(latest?.macBuild).toEqual({
      dmgName: 'system-design-from-scratch-0.3.1-arm64.dmg',
      dmgUrl: 'http://127.0.0.1:8080/files/system-design-from-scratch-0.3.1-arm64.dmg',
      checksumsUrl: 'http://127.0.0.1:8080/files/SHA256SUMS'
    })
  })

  it('reports a release without the macOS asset as having no macOS build', async () => {
    const withoutDmg = release({
      assets: [{ name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' }]
    })
    const withoutSums = release({
      assets: [{ name: dmgName('0.3.1'), browser_download_url: 'https://example.test/a.dmg' }]
    })
    const noAssets = release({ assets: undefined })
    for (const body of [withoutDmg, withoutSums, noAssets]) {
      const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), endpoints)
      expect(latest?.version).toBe('0.3.1')
      expect(latest?.macBuild).toBeNull()
    }
  })

  it('ignores an asset built for another version', async () => {
    const body = release({
      assets: [
        { name: dmgName('0.3.0'), browser_download_url: 'https://example.test/old.dmg' },
        { name: 'SHA256SUMS', browser_download_url: 'https://example.test/sums' }
      ]
    })
    const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), endpoints)
    expect(latest?.macBuild).toBeNull()
  })

  it('offers neither a draft nor a pre-release', async () => {
    for (const flag of [{ draft: true }, { prerelease: true }]) {
      const http = fakeHttp({ [API]: JSON.stringify(release(flag)) })
      expect(await lookupLatestRelease(http, endpoints)).toBeNull()
    }
  })

  it('falls back to the tag page when the release page address is unusable', async () => {
    const body = release({ html_url: 'javascript:alert(1)' })
    const latest = await lookupLatestRelease(fakeHttp({ [API]: JSON.stringify(body) }), endpoints)
    expect(latest?.releaseUrl).toBe(
      'https://github.com/jbclaramonte/system-design-from-scratch/releases/tag/v0.3.1'
    )
  })

  it('rejects an answer that is not a release, or whose tag is not a version', async () => {
    await expect(
      lookupLatestRelease(fakeHttp({ [API]: JSON.stringify({ message: 'Not Found' }) }), endpoints)
    ).rejects.toMatchObject({ code: 'invalid_release' })
    await expect(
      lookupLatestRelease(
        fakeHttp({ [API]: JSON.stringify(release({ tag_name: 'nightly' })) }),
        endpoints
      )
    ).rejects.toMatchObject({ code: 'invalid_release' })
  })

  it('passes a network error on as a readable UpdateError', async () => {
    const error = new UpdateError('network', 'Could not reach GitHub.')
    await expect(lookupLatestRelease(fakeHttp({ [API]: error }), endpoints)).rejects.toBe(error)
  })
})
