import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { expectedDigest, sha256File, verifyChecksum } from './checksum'

const digest = (content: string) => createHash('sha256').update(content).digest('hex')
const NAME = 'system-design-from-scratch-0.3.1-arm64.dmg'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sdfs-checksum-test-'))
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe('expectedDigest', () => {
  const other = digest('other')
  const mine = digest('mine')

  it('finds the digest of a file in a shasum listing', () => {
    expect(expectedDigest(`${other}  other.zip\n${mine}  ${NAME}\n`, NAME)).toBe(mine)
  })

  it('accepts the binary-mode marker and upper-case hex', () => {
    expect(expectedDigest(`${mine.toUpperCase()} *${NAME}`, NAME)).toBe(mine)
  })

  it('does not match a longer name or a missing file', () => {
    expect(expectedDigest(`${mine}  prefix-${NAME}\n`, NAME)).toBeNull()
    expect(expectedDigest('', NAME)).toBeNull()
    expect(expectedDigest('not a checksum line', NAME)).toBeNull()
  })
})

describe('verifyChecksum', () => {
  it('accepts a file that matches the listing', async () => {
    const file = join(dir, NAME)
    await writeFile(file, 'image')
    await expect(sha256File(file)).resolves.toBe(digest('image'))
    await expect(
      verifyChecksum(file, NAME, `${digest('image')}  ${NAME}\n`)
    ).resolves.toBeUndefined()
  })

  it('refuses a corrupt file with a readable message', async () => {
    const file = join(dir, NAME)
    await writeFile(file, 'image')
    await expect(verifyChecksum(file, NAME, `${digest('other')}  ${NAME}\n`)).rejects.toMatchObject(
      {
        code: 'checksum',
        message: expect.stringContaining('corrupt')
      }
    )
  })

  it('refuses a file the listing does not mention', async () => {
    const file = join(dir, NAME)
    await writeFile(file, 'image')
    await expect(
      verifyChecksum(file, NAME, `${digest('image')}  another.dmg\n`)
    ).rejects.toMatchObject({ code: 'checksum' })
  })
})
