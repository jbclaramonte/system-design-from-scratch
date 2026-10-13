// Third-party license list (resources/licenses.json), built by scripts/build-licenses.ts.
// Pure: the lockfile and the package files are passed in, so the rule is testable on fixtures.
// No runtime imports, so plain node can run it (native TypeScript type stripping).
import type { LicensesFile, SpecialPackage, ThirdPartyPackage } from '../../shared/about'

/** The subset of a package-lock.json (lockfileVersion 2 or 3) entry used here. */
export interface LockfilePackage {
  name?: string
  version?: string
  license?: string
  dev?: boolean
  link?: boolean
}

export interface Lockfile {
  lockfileVersion: number
  packages?: Record<string, LockfilePackage>
}

/** A shipped package, identified from the lockfile alone. */
export interface ShippedPackage {
  /** Install path relative to the repo root, such as `node_modules/react`. */
  path: string
  name: string
  version: string
  license: string
  special: SpecialPackage | null
}

/**
 * devDependencies that still ship: electron-vite apps declare `electron` as a devDependency,
 * but its binary is the app's runtime. Their own dependencies are install-time only.
 */
export const RUNTIME_DEV_PACKAGES = ['electron']

export const LICENSES_RULE =
  'Every package that package-lock.json does not mark as dev (the production dependency tree of ' +
  'package.json "dependencies"), plus electron (the runtime). This is a superset of what the ' +
  'bundles contain: tree-shaking may drop some of them.'

const LICENSE_FILE = /^(licen[cs]e|copying|notice)/i
const MODULES = 'node_modules/'

function specialOf(name: string): SpecialPackage | null {
  return RUNTIME_DEV_PACKAGES.includes(name) ? 'electron' : null
}

const byNameThenVersion = (a: { name: string; version: string }, b: typeof a) =>
  a.name < b.name
    ? -1
    : a.name > b.name
      ? 1
      : a.version < b.version
        ? -1
        : a.version > b.version
          ? 1
          : 0

/** The packages to list, deduplicated by name and version, sorted by name then version. */
export function shippedPackages(lock: Lockfile): ShippedPackage[] {
  if (lock.lockfileVersion < 2 || !lock.packages) {
    throw new Error('Expected a package-lock.json with lockfileVersion 2 or 3')
  }
  const byId = new Map<string, ShippedPackage>()
  // Shallowest install path first: a duplicate name and version keeps its top-level copy.
  const depth = (path: string) => path.split(MODULES).length
  const paths = Object.keys(lock.packages).sort((a, b) =>
    depth(a) !== depth(b) ? depth(a) - depth(b) : a < b ? -1 : a > b ? 1 : 0
  )
  for (const path of paths) {
    const entry = lock.packages[path]
    if (!entry || !path.includes(MODULES) || entry.link) continue
    const name = entry.name ?? path.slice(path.lastIndexOf(MODULES) + MODULES.length)
    const topLevel = path === `${MODULES}${name}`
    const shipped = !entry.dev || (topLevel && RUNTIME_DEV_PACKAGES.includes(name))
    if (!shipped) continue
    if (!entry.version) throw new Error(`No version for ${path} in package-lock.json`)
    const license = entry.license ?? 'UNKNOWN'
    const id = `${name}@${entry.version}`
    if (!byId.has(id)) {
      byId.set(id, {
        path,
        name,
        version: entry.version,
        license,
        special: specialOf(name)
      })
    }
  }
  return [...byId.values()].sort(byNameThenVersion)
}

/** Reads installed packages (node_modules) for their license files. */
export interface PackageFiles {
  /** File names in the package directory, or null when it is not installed. */
  list(path: string): string[] | null
  read(path: string, file: string): string
}

const normalizeText = (text: string) => text.replace(/\r\n?/g, '\n').trimEnd()

/** Builds resources/licenses.json. Deterministic: same lockfile and files, same output. */
export function buildLicensesFile(lock: Lockfile, files: PackageFiles): LicensesFile {
  const packages: ThirdPartyPackage[] = shippedPackages(lock).map((pkg) => {
    const names = (files.list(pkg.path) ?? []).filter((file) => LICENSE_FILE.test(file)).sort()
    const licenseFiles = names.map((file) => ({
      file,
      text: normalizeText(files.read(pkg.path, file))
    }))
    return {
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      licenseFiles,
      special: pkg.special
    }
  })
  return { schemaVersion: 1, generator: 'scripts/build-licenses.ts', rule: LICENSES_RULE, packages }
}

/** Serialized form written to disk, with a trailing newline. */
export function serializeLicensesFile(file: LicensesFile): string {
  return `${JSON.stringify(file, null, 2)}\n`
}

/**
 * Differences between the lockfile and a licenses file, by name, version and license (no
 * node_modules needed). Empty when the file is up to date.
 */
export function staleEntries(lock: Lockfile, file: Pick<LicensesFile, 'packages'>): string[] {
  const key = (pkg: { name: string; version: string; license: string }) =>
    `${pkg.name}@${pkg.version} (${pkg.license})`
  const expected = new Set(shippedPackages(lock).map(key))
  const actual = new Set(file.packages.map(key))
  return [
    ...[...expected].filter((id) => !actual.has(id)).map((id) => `missing ${id}`),
    ...[...actual].filter((id) => !expected.has(id)).map((id) => `extra ${id}`)
  ]
}
