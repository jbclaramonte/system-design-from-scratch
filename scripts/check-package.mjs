// Guard run after electron-builder (`npm run package`): fails when the macOS package is not fit to
// keep. Plain Node, no dependency. Checks, on dist/mac-arm64/<productName>.app:
//   - the Chromium licenses (LICENSES.chromium.html) and the Electron LICENSE are in the app;
//   - app.asar holds the runtime files and none of the files that must never ship (.env*, src,
//     docs, spikes, screenshots, scripts, .github, tests, node_modules);
//   - the main and preload bundles do not require a package that the app does not contain;
//   - the tldraw license key, when one is configured at build time, is inside app.asar (renderer
//     bundle, expected: it is a client-side key) and nowhere in the main and preload bundles. The
//     key is compared, never printed.
// `--app-only` skips the .dmg check (npm run package:dir). See docs/Packaging.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, resolve } from 'node:path'
import { readTldrawLicenseKey } from './tldraw-license-key.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const appOnly = process.argv.includes('--app-only')
const failures = []
const fail = (message) => failures.push(message)

/** Reads the file tree of an asar archive (header only, no extraction): a list of "/a/b" paths. */
function listAsar(asarPath) {
  const fd = readFileSync(asarPath)
  // Layout: [4 bytes: 4][4 bytes: header pickle size][4 bytes: payload size][4 bytes: JSON length][JSON]
  const jsonLength = fd.readUInt32LE(12)
  const header = JSON.parse(fd.subarray(16, 16 + jsonLength).toString('utf8'))
  const paths = []
  const walk = (node, prefix) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const path = `${prefix}/${name}`
      paths.push(path)
      if (child.files) walk(child, path)
    }
  }
  walk(header, '')
  return paths
}

const appDirs = existsSync(distDir)
  ? readdirSync(distDir)
      .filter((name) => /^mac(-arm64)?$/.test(name))
      .map((name) => join(distDir, name))
  : []
const appPath = appDirs
  .flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))
  .find((path) => path.endsWith('.app'))

if (!appPath) {
  console.error(`check-package: no .app found in ${join(distDir, 'mac-arm64')}`)
  process.exit(1)
}
console.log(`check-package: ${appPath}`)
const resources = join(appPath, 'Contents', 'Resources')

// 1. Licenses that must travel with the app (Chromium, Node.js and others: LICENSES.chromium.html).
const chromium = join(resources, 'LICENSES.chromium.html')
if (!existsSync(chromium) || statSync(chromium).size < 1_000_000) {
  fail(`LICENSES.chromium.html is missing or truncated in ${resources}`)
}
const electronLicense = join(resources, 'LICENSE.electron')
if (
  !existsSync(electronLicense) ||
  !/Electron contributors/.test(readFileSync(electronLicense, 'utf8'))
) {
  fail(`The Electron LICENSE (LICENSE.electron) is missing or unexpected in ${resources}`)
}

// 2. app.asar content.
const asarPath = join(resources, 'app.asar')
let asarPaths = []
if (!existsSync(asarPath)) {
  fail(`app.asar is missing in ${resources}`)
} else {
  asarPaths = listAsar(asarPath)
  const required = [
    '/package.json',
    '/out/main/index.js',
    '/out/preload/index.js',
    '/out/renderer/index.html',
    '/resources/corpus/primer.json',
    '/resources/licenses.json'
  ]
  for (const path of required) {
    if (!asarPaths.includes(path)) fail(`app.asar does not contain ${path}`)
  }
  const forbiddenTopLevel = [
    'src',
    'docs',
    'spikes',
    'screenshots',
    'scripts',
    'build',
    '.github',
    '.vitest',
    'node_modules'
  ]
  for (const path of asarPaths) {
    const segments = path.split('/').filter(Boolean)
    const base = segments[segments.length - 1]
    if (/^\.env(\..*)?$/.test(base)) fail(`app.asar contains an environment file: ${path}`)
    if (segments.length === 1 && forbiddenTopLevel.includes(base)) {
      fail(`app.asar contains ${path}`)
    }
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(base)) fail(`app.asar contains a test file: ${path}`)
  }
}

// 3. The bundles must not require a package missing from the app (the app ships no node_modules).
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]))
for (const dir of ['out/main', 'out/preload']) {
  for (const file of readdirSync(join(root, dir)).filter((name) => name.endsWith('.js'))) {
    const source = readFileSync(join(root, dir, file), 'utf8')
    for (const [, specifier] of source.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
      const known = specifier.startsWith('.') || specifier === 'electron' || builtins.has(specifier)
      if (!known) {
        fail(`${dir}/${file} requires "${specifier}" but the app has no node_modules (bundle it)`)
      }
    }
  }
}

// 4. The tldraw license key: baked into the renderer when configured, absent from the main process.
// Without a key the package is still valid (see scripts/check-tldraw-key.mjs for the warning).
const licenseKey = readTldrawLicenseKey()
if (licenseKey) {
  if (existsSync(asarPath) && !readFileSync(asarPath).includes(licenseKey)) {
    fail(
      'a tldraw license key is configured but app.asar does not contain it: rebuild with `npm run package`'
    )
  }
  for (const dir of ['out/main', 'out/preload']) {
    for (const file of readdirSync(join(root, dir)).filter((name) => name.endsWith('.js'))) {
      if (readFileSync(join(root, dir, file), 'utf8').includes(licenseKey)) {
        fail(`${dir}/${file} contains the tldraw license key (it belongs to the renderer only)`)
      }
    }
  }
}

// 5. The disk image.
if (!appOnly) {
  const dmg = readdirSync(distDir).find((name) => name.endsWith('.dmg'))
  if (!dmg) fail(`no .dmg in ${distDir}`)
}

if (failures.length > 0) {
  console.error('check-package: FAILED')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log(`check-package: ok (${asarPaths.length} entries in app.asar)`)
