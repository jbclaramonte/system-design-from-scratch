import { describe, expect, it } from 'vitest'
import type { ThirdPartyPackage } from '../../../shared/about'
import { filterPackages } from './filterPackages'

const pkg = (name: string, license: string): ThirdPartyPackage => ({
  name,
  version: '1.0.0',
  license,
  licenseFiles: [],
  special: null
})

const packages = [pkg('react', 'MIT'), pkg('tldraw', 'LicenseRef-tldraw'), pkg('tslib', '0BSD')]

describe('filterPackages', () => {
  it('returns every package for a blank query', () => {
    expect(filterPackages(packages, '  ')).toBe(packages)
  })

  it('matches the name or the license, case-insensitively', () => {
    expect(filterPackages(packages, 'LI').map((p) => p.name)).toEqual(['tldraw', 'tslib'])
    expect(filterPackages(packages, '0bsd').map((p) => p.name)).toEqual(['tslib'])
  })
})
