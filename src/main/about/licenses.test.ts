import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LicensesFile } from '../../shared/about'
import {
  buildLicensesFile,
  serializeLicensesFile,
  shippedPackages,
  staleEntries,
  TLDRAW_LICENSE_ID,
  type Lockfile,
  type PackageFiles
} from './licenses'

const lock: Lockfile = {
  lockfileVersion: 3,
  packages: {
    '': { name: 'app', version: '1.0.0', license: 'Apache-2.0' },
    'node_modules/zod': { version: '4.0.0', license: 'MIT' },
    'node_modules/react': { version: '19.0.0', license: 'MIT' },
    'node_modules/tldraw': { version: '5.5.2', license: 'SEE LICENSE IN LICENSE.md' },
    'node_modules/@tldraw/editor': { version: '5.5.2', license: 'SEE LICENSE IN LICENSE.md' },
    'node_modules/electron': { version: '44.0.0', license: 'MIT', dev: true },
    'node_modules/@electron/get': { version: '5.0.0', license: 'MIT', dev: true },
    'node_modules/vitest': { version: '5.0.0', license: 'MIT', dev: true },
    'node_modules/vitest/node_modules/electron': { version: '1.0.0', license: 'MIT', dev: true },
    'node_modules/tslib': { version: '2.8.1', license: '0BSD' },
    'node_modules/a/node_modules/tslib': { version: '2.8.1', license: '0BSD' },
    'node_modules/b/node_modules/tslib': { version: '1.14.1', license: '0BSD' },
    'node_modules/alias': { name: 'real-name', version: '1.0.0', license: 'ISC' },
    'packages/local': { version: '0.0.0', link: true }
  }
}

const files: Record<string, Record<string, string>> = {
  'node_modules/zod': { LICENSE: 'MIT zod\r\n\r\n', 'package.json': '{}', 'README.md': '' },
  'node_modules/react': { LICENSE: 'MIT react' },
  'node_modules/tldraw': { 'LICENSE.md': 'This code is licensed under the tldraw license' },
  'node_modules/@tldraw/editor': { 'LICENSE.md': 'pointer' },
  'node_modules/electron': { LICENSE: 'MIT electron' },
  'node_modules/tslib': { 'LICENSE.txt': '0BSD tslib', 'CopyrightNotice.txt': 'not matched' },
  'node_modules/b/node_modules/tslib': { NOTICE: 'notice', 'LICENSE.txt': '0BSD old' }
  // node_modules/alias is not installed (an optional dependency on another platform).
}

const packageFiles: PackageFiles = {
  list: (path) => (files[path] ? Object.keys(files[path]) : null),
  read: (path, file) => files[path]?.[file] ?? ''
}

describe('shippedPackages', () => {
  it('lists the production tree plus electron, deduplicated and sorted', () => {
    expect(shippedPackages(lock).map((pkg) => `${pkg.name}@${pkg.version} ${pkg.license}`)).toEqual(
      [
        `@tldraw/editor@5.5.2 ${TLDRAW_LICENSE_ID}`,
        'electron@44.0.0 MIT',
        'react@19.0.0 MIT',
        'real-name@1.0.0 ISC',
        `tldraw@5.5.2 ${TLDRAW_LICENSE_ID}`,
        'tslib@1.14.1 0BSD',
        'tslib@2.8.1 0BSD',
        'zod@4.0.0 MIT'
      ]
    )
  })

  it('marks the tldraw-licensed packages and electron as special', () => {
    const special = Object.fromEntries(shippedPackages(lock).map((pkg) => [pkg.name, pkg.special]))

    expect(special).toMatchObject({
      tldraw: 'tldraw',
      '@tldraw/editor': 'tldraw',
      electron: 'electron',
      react: null
    })
  })

  it('keeps a tldraw package whose declared license changed as declared', () => {
    const changed: Lockfile = {
      lockfileVersion: 3,
      packages: { 'node_modules/tldraw': { version: '6.0.0', license: 'MIT' } }
    }

    expect(shippedPackages(changed)[0]).toMatchObject({ license: 'MIT', special: null })
  })

  it('rejects lockfile v1', () => {
    expect(() => shippedPackages({ lockfileVersion: 1 })).toThrow(/lockfileVersion/)
  })
})

describe('buildLicensesFile', () => {
  it('collects license, copying and notice files, normalized, plus extra files', () => {
    const built = buildLicensesFile(lock, packageFiles, {
      extraFiles: { 'tldraw@5.5.2': [{ file: 'vendored.md', text: 'full text\n' }] }
    })
    const byId = Object.fromEntries(
      built.packages.map((pkg) => [`${pkg.name}@${pkg.version}`, pkg])
    )

    expect(byId['zod@4.0.0']?.licenseFiles).toEqual([{ file: 'LICENSE', text: 'MIT zod' }])
    expect(byId['tslib@1.14.1']?.licenseFiles.map((f) => f.file)).toEqual(['LICENSE.txt', 'NOTICE'])
    expect(byId['tslib@2.8.1']?.licenseFiles.map((f) => f.file)).toEqual(['LICENSE.txt'])
    expect(byId['real-name@1.0.0']?.licenseFiles).toEqual([])
    expect(byId['tldraw@5.5.2']?.licenseFiles).toEqual([
      { file: 'LICENSE.md', text: 'This code is licensed under the tldraw license' },
      { file: 'vendored.md', text: 'full text' }
    ])
  })

  it('is deterministic', () => {
    const shuffled: Lockfile = {
      lockfileVersion: 3,
      packages: Object.fromEntries(Object.entries(lock.packages ?? {}).reverse())
    }

    expect(serializeLicensesFile(buildLicensesFile(shuffled, packageFiles))).toBe(
      serializeLicensesFile(buildLicensesFile(lock, packageFiles))
    )
  })
})

describe('staleEntries', () => {
  it('is empty when the file matches the lockfile', () => {
    expect(staleEntries(lock, buildLicensesFile(lock, packageFiles))).toEqual([])
  })

  it('reports missing, extra and relicensed packages', () => {
    const file = buildLicensesFile(lock, packageFiles)
    const edited = {
      packages: [
        ...file.packages.filter((pkg) => pkg.name !== 'react' && pkg.name !== 'zod'),
        { ...file.packages.find((pkg) => pkg.name === 'zod')!, license: 'ISC' },
        { name: 'left-pad', version: '1.0.0', license: 'MIT', licenseFiles: [], special: null }
      ]
    }

    expect(staleEntries(lock, edited).sort()).toEqual([
      'extra left-pad@1.0.0 (MIT)',
      'extra zod@4.0.0 (ISC)',
      'missing react@19.0.0 (MIT)',
      'missing zod@4.0.0 (MIT)'
    ])
  })

  it('finds resources/licenses.json up to date with package-lock.json', () => {
    const root = join(__dirname, '../../..')
    const repoLock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8')) as Lockfile
    const committed = JSON.parse(
      readFileSync(join(root, 'resources', 'licenses.json'), 'utf8')
    ) as LicensesFile

    // When this fails: npm run licenses:build, then commit resources/licenses.json.
    expect(staleEntries(repoLock, committed)).toEqual([])
  })
})
