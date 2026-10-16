import { describe, expect, it } from 'vitest'
import { compareVersions, isUpdate, parseVersion } from './version'

const compare = (a: string, b: string) => {
  const left = parseVersion(a)
  const right = parseVersion(b)
  if (!left || !right) throw new Error(`not semver: ${a} ${b}`)
  return compareVersions(left, right)
}

describe('parseVersion', () => {
  it('reads a tag with or without the v, and ignores build metadata', () => {
    expect(parseVersion('v0.3.1')).toEqual({ major: 0, minor: 3, patch: 1, prerelease: [] })
    expect(parseVersion('1.2.3+build.5')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseVersion('1.0.0-beta.2')?.prerelease).toEqual(['beta', '2'])
  })

  it('refuses what is not semver', () => {
    for (const text of ['', 'latest', '1.2', '1.2.3.4', '01.2.3', 'v1.2.x', '1.2.3-', '1.2.3-a..b'])
      expect(parseVersion(text), text).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders by major, minor then patch, numerically', () => {
    expect(compare('0.3.1', '0.3.0')).toBeGreaterThan(0)
    expect(compare('0.3.0', '0.3.1')).toBeLessThan(0)
    expect(compare('0.10.0', '0.9.0')).toBeGreaterThan(0)
    expect(compare('1.0.0', '0.99.99')).toBeGreaterThan(0)
    expect(compare('0.3.0', '0.3.0')).toBe(0)
    expect(compare('0.3.0+a', '0.3.0+b')).toBe(0)
  })

  it('ranks a pre-release below its stable release and orders pre-releases by identifier', () => {
    expect(compare('1.0.0-rc.1', '1.0.0')).toBeLessThan(0)
    expect(compare('1.0.0-alpha', '1.0.0-alpha.1')).toBeLessThan(0)
    expect(compare('1.0.0-alpha.2', '1.0.0-alpha.10')).toBeLessThan(0)
    expect(compare('1.0.0-alpha.1', '1.0.0-beta')).toBeLessThan(0)
    expect(compare('1.0.0-1', '1.0.0-alpha')).toBeLessThan(0)
  })
})

describe('isUpdate', () => {
  it('offers a newer stable version', () => {
    expect(isUpdate('0.3.0', '0.3.1')).toBe(true)
    expect(isUpdate('0.3.0', '0.10.0')).toBe(true)
    expect(isUpdate('0.3.0', 'v1.0.0')).toBe(true)
  })

  it('offers nothing for an equal or older version', () => {
    expect(isUpdate('0.3.0', '0.3.0')).toBe(false)
    expect(isUpdate('0.3.1', '0.3.0')).toBe(false)
  })

  it('never offers a pre-release, even a newer one', () => {
    expect(isUpdate('0.3.0', '0.4.0-beta.1')).toBe(false)
  })

  it('offers the stable release to a running pre-release of the same version', () => {
    expect(isUpdate('0.4.0-beta.1', '0.4.0')).toBe(true)
    expect(isUpdate('0.4.0-beta.1', '0.4.0-beta.2')).toBe(false)
  })

  it('offers nothing when a version is not semver', () => {
    expect(isUpdate('0.3.0', 'latest')).toBe(false)
    expect(isUpdate('dev', '1.0.0')).toBe(false)
  })
})
