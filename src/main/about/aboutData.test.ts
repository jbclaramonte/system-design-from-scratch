import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { LicensesFile } from '../../shared/about'
import type { CorpusData, CorpusMetadata } from '../corpus'
import { APP_NAME, assembleAbout } from './aboutData'
import { createAboutIpc } from './index'

const root = join(__dirname, '../../..')
const metadata = (
  JSON.parse(readFileSync(join(root, 'resources/corpus/primer.json'), 'utf8')) as CorpusData
).metadata

const licenses: LicensesFile = {
  schemaVersion: 1,
  generator: 'scripts/build-licenses.ts',
  rule: 'rule',
  packages: [
    {
      name: 'tldraw',
      version: '5.5.2',
      license: 'LicenseRef-tldraw',
      licenseFiles: [{ file: 'LICENSE.md', text: 'pointer' }],
      special: 'tldraw'
    }
  ]
}

describe('assembleAbout', () => {
  it('takes the attribution from the corpus metadata, with a permalink at the pinned commit', () => {
    const about = assembleAbout({ appVersion: '0.1.0', metadata, licenses })

    expect(about.appName).toBe(APP_NAME)
    expect(about.appVersion).toBe('0.1.0')
    expect(about.primer).toMatchObject({
      repositoryUrl: metadata.repositoryUrl,
      commitSha: metadata.commitSha,
      permalink: `${metadata.repositoryUrl}/tree/${metadata.commitSha}`,
      licenseName: metadata.license.name,
      licenseUrl: metadata.license.url,
      upstreamNotice: metadata.license.upstreamNotice,
      attribution: metadata.attribution,
      modifications: metadata.modifications,
      thirdPartyContent: metadata.thirdPartyContent
    })
    expect(about.primer.attribution).toContain('Donne Martin')
    expect(about.licenses).toEqual(licenses)
  })

  it.each<[string, (meta: CorpusMetadata) => CorpusMetadata]>([
    ['an empty attribution', (meta) => ({ ...meta, attribution: ' ' })],
    [
      'a non-web license URL',
      (meta) => ({ ...meta, license: { ...meta.license, url: 'file:///x' } })
    ],
    ['a short commit', (meta) => ({ ...meta, commitSha: 'ae9bbd7' })],
    ['no modification notice', (meta) => ({ ...meta, modifications: '' })]
  ])('rejects corpus metadata with %s', (_label, edit) => {
    expect(() =>
      assembleAbout({ appVersion: '0.1.0', metadata: edit(metadata), licenses })
    ).toThrow()
  })

  it.each<[string, unknown]>([
    ['a missing packages list', { ...licenses, packages: undefined }],
    ['an unknown schema version', { ...licenses, schemaVersion: 2 }],
    [
      'an unknown special case',
      { ...licenses, packages: [{ ...licenses.packages[0], special: 'x' }] }
    ],
    [
      'a package without license',
      { ...licenses, packages: [{ ...licenses.packages[0], license: '' }] }
    ]
  ])('rejects a licenses file with %s', (_label, bad) => {
    expect(() => assembleAbout({ appVersion: '0.1.0', metadata, licenses: bad })).toThrow()
  })

  it('accepts the committed resources/licenses.json', () => {
    const committed: unknown = JSON.parse(
      readFileSync(join(root, 'resources/licenses.json'), 'utf8')
    )
    const about = assembleAbout({ appVersion: '0.1.0', metadata, licenses: committed })
    const tldraw = about.licenses.packages.find((pkg) => pkg.name === 'tldraw')

    expect(tldraw?.special).toBe('tldraw')
    expect(tldraw?.licenseFiles.some((file) => file.text.startsWith('# tldraw license'))).toBe(true)
    expect(about.licenses.packages.find((pkg) => pkg.name === 'electron')?.special).toBe('electron')
  })
})

describe('createAboutIpc', () => {
  let dir: string | undefined

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = undefined
  })

  it('reads the licenses file once', () => {
    dir = mkdtempSync(join(tmpdir(), 'about-'))
    const path = join(dir, 'licenses.json')
    writeFileSync(path, JSON.stringify(licenses))
    const ipc = createAboutIpc({ appVersion: '1.2.3', metadata, licensesPath: path })

    const first = ipc.get()
    rmSync(path)

    expect(ipc.get()).toBe(first)
    expect(first.appVersion).toBe('1.2.3')
  })
})
