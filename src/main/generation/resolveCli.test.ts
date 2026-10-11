import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GenerationError } from './errors'
import { commonCliLocations, defaultLoginShell, resolveCliPath } from './resolveCli'

let root: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'resolve-cli-'))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

function executable(path: string, content = '#!/bin/sh\n'): string {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
  chmodSync(path, 0o755)
  return path
}

const emptyHome = () => join(root, 'home')

describe.skipIf(process.platform === 'win32')('resolveCliPath', () => {
  it('uses the configured path when it exists', async () => {
    const bin = executable(join(root, 'custom', 'claude'))

    await expect(resolveCliPath({ configuredPath: bin })).resolves.toBe(bin)
  })

  it('does not fall back when the configured path is missing', async () => {
    const onPath = executable(join(root, 'bin', 'claude'))

    const error = await resolveCliPath({
      configuredPath: join(root, 'nope', 'claude'),
      env: { PATH: join(onPath, '..') }
    }).catch((reason: unknown) => reason)

    expect(error).toBeInstanceOf(GenerationError)
    expect((error as GenerationError).code).toBe('cli_not_found')
    expect((error as GenerationError).message).toContain('configured path')
  })

  it('finds the binary on PATH', async () => {
    const bin = executable(join(root, 'bin', 'claude'))

    await expect(
      resolveCliPath({ env: { PATH: `/nonexistent:${join(root, 'bin')}` }, home: emptyHome() })
    ).resolves.toBe(bin)
  })

  it('ignores a non-executable file on PATH', async () => {
    const path = join(root, 'bin', 'claude')
    executable(path)
    chmodSync(path, 0o644)

    await expect(
      resolveCliPath({ env: { PATH: join(root, 'bin') }, home: emptyHome(), useLoginShell: false })
    ).rejects.toMatchObject({ code: 'cli_not_found' })
  })

  it('falls back to common install locations with a minimal PATH', async () => {
    const bin = executable(join(root, 'home', '.local', 'bin', 'claude'))

    await expect(
      resolveCliPath({ env: { PATH: '/nonexistent' }, home: join(root, 'home') })
    ).resolves.toBe(bin)
  })

  it('falls back to a login shell lookup', async () => {
    const bin = executable(join(root, 'hidden', 'claude'))
    const shell = executable(join(root, 'fake-shell'), `#!/bin/sh\necho "${bin}"\n`)

    await expect(
      resolveCliPath({ env: { PATH: '/nonexistent' }, home: emptyHome(), shell })
    ).resolves.toBe(bin)
  })

  it('asks the login shell named by $SHELL when none is given', async () => {
    const bin = executable(join(root, 'hidden', 'claude'))
    const shell = executable(join(root, 'fake-shell'), `#!/bin/sh\necho "${bin}"\n`)

    await expect(
      resolveCliPath({ env: { PATH: '/nonexistent', SHELL: shell }, home: emptyHome() })
    ).resolves.toBe(bin)
  })

  it('rejects an alias printed by the login shell', async () => {
    const shell = executable(
      join(root, 'fake-shell'),
      '#!/bin/sh\necho "claude: aliased to command claude"\n'
    )

    await expect(
      resolveCliPath({ env: { PATH: '/nonexistent' }, home: emptyHome(), shell })
    ).rejects.toMatchObject({ code: 'cli_not_found' })
  })
})

describe('defaultLoginShell', () => {
  it('is zsh on macOS and bash elsewhere (Linux has no zsh by default)', () => {
    expect(defaultLoginShell('darwin')).toBe('/bin/zsh')
    expect(defaultLoginShell('linux')).toBe('/bin/bash')
  })
})

describe('commonCliLocations', () => {
  it('lists the Linux install locations under the home folder, native installer first', () => {
    const locations = commonCliLocations('/home/ada', {})

    expect(locations).toContain('/home/ada/.local/bin/claude')
    expect(locations).toContain('/home/ada/.npm-global/bin/claude')
    expect(locations).toContain('/home/linuxbrew/.linuxbrew/bin/claude')
    expect(locations.indexOf('/home/ada/.local/bin/claude')).toBeLessThan(
      locations.indexOf('/usr/local/bin/claude')
    )
  })

  it('adds the npm prefix of the environment', () => {
    expect(commonCliLocations('/home/ada', { npm_config_prefix: '/opt/npm' })).toContain(
      '/opt/npm/bin/claude'
    )
  })
})
