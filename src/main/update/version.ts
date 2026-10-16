// Version comparison for App Updates: semver 2.0 precedence, no dependency.

export interface Version {
  major: number
  minor: number
  patch: number
  /** Dot-separated pre-release identifiers; empty for a stable release. */
  prerelease: string[]
}

const SEMVER =
  /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

/** Parses `1.2.3`, `v1.2.3`, `1.2.3-beta.1` (build metadata ignored); null when not semver. */
export function parseVersion(text: string): Version | null {
  const match = SEMVER.exec(text.trim())
  if (!match) return null
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : []
  }
}

const isNumeric = (identifier: string) => /^\d+$/.test(identifier)

function comparePrerelease(a: string[], b: string[]): number {
  // A stable release is greater than any of its pre-releases.
  if (a.length === 0 || b.length === 0) return Math.sign(b.length - a.length)
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i] ?? ''
    const y = b[i] ?? ''
    if (x === y) continue
    if (isNumeric(x) && isNumeric(y)) return Math.sign(Number(x) - Number(y))
    // Numeric identifiers rank below alphanumeric ones.
    if (isNumeric(x)) return -1
    if (isNumeric(y)) return 1
    return x < y ? -1 : 1
  }
  return Math.sign(a.length - b.length)
}

/** Negative when `a` is older than `b`, 0 when equal, positive when newer. */
export function compareVersions(a: Version, b: Version): number {
  return (
    Math.sign(a.major - b.major) ||
    Math.sign(a.minor - b.minor) ||
    Math.sign(a.patch - b.patch) ||
    comparePrerelease(a.prerelease, b.prerelease)
  )
}

/**
 * Whether `latest` is an update for the running `current`: a stable release strictly newer than
 * it. A pre-release is never offered (the GitHub "latest" release is never one either), and an
 * unparsable version never counts as an update.
 */
export function isUpdate(current: string, latest: string): boolean {
  const running = parseVersion(current)
  const candidate = parseVersion(latest)
  if (!running || !candidate || candidate.prerelease.length > 0) return false
  return compareVersions(candidate, running) > 0
}
