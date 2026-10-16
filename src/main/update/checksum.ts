// SHA256SUMS: parsing, and checking a downloaded file against it.
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { UpdateError } from './errors'

/** The hex SHA-256 digest of a file, streamed. */
export function sha256File(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('error', reject)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
  })
}

/** The digest listed for `fileName` in a `shasum -a 256` file ("<hash>  <name>"), or null. */
export function expectedDigest(sums: string, fileName: string): string | null {
  for (const line of sums.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64}) [ *](.+)$/.exec(line.trim())
    if (match?.[1] && match[2] === fileName) return match[1].toLowerCase()
  }
  return null
}

/** Throws an `UpdateError` unless the file's digest is the one SHA256SUMS lists for `fileName`. */
export async function verifyChecksum(
  filePath: string,
  fileName: string,
  sums: string
): Promise<void> {
  const expected = expectedDigest(sums, fileName)
  if (!expected) {
    throw new UpdateError('checksum', `${fileName} is not listed in the release checksums.`)
  }
  const actual = await sha256File(filePath)
  if (actual !== expected) {
    throw new UpdateError(
      'checksum',
      'The downloaded file is corrupt (its checksum does not match the release).'
    )
  }
}
