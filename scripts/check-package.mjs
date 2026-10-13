// Guard run after electron-builder (`npm run package`, `npm run package:linux`): fails when the
// package is not fit to keep. Plain Node, no dependency.
//
//   node scripts/check-package.mjs [--platform mac|linux] [--app-only]
//
// Checks, on dist/mac-arm64/<productName>.app (mac, the default) or dist/linux-unpacked (linux):
//   - the Chromium licenses (LICENSES.chromium.html) and the Electron LICENSE are in the app
//     (Contents/Resources on macOS, resources/ on Linux);
//   - app.asar holds the runtime files and none of the files that must never ship (.env*, src,
//     docs, spikes, screenshots, scripts, .github, tests, node_modules);
//   - the main and preload bundles do not require a package that the app does not contain;
//   - the tldraw license key, when one is configured at build time, is nowhere in the main and
//     preload bundles. The key is compared, never printed. (Since #43 the renderer no longer
//     reads it, so it is not expected inside app.asar; #44 removes the key and this check.)
//   - the disk image (.dmg) or the AppImage and the .deb exist next to the app.
// `--app-only` skips that last check (npm run package:dir, npm run package:linux:dir). See
// docs/Packaging.md.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, resolve } from 'node:path'
import { readTldrawLicenseKey } from './tldraw-license-key.mjs'

const root = resolve(import.meta.dirname, '..')
const distDir = join(root, 'dist')
const appOnly = process.argv.includes('--app-only')
const platformIndex = process.argv.indexOf('--platform')
const platform = platformIndex === -1 ? 'mac' : process.argv[platformIndex + 1]
if (platform !== 'mac' && platform !== 'linux') {
  console.error(`check-package: unknown platform "${platform}" (expected mac or linux)`)
  process.exit(2)
}
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

/** The directory that holds the unpacked app and its resources folder, for the platform. */
function findApp() {
  if (platform === 'linux') {
    const unpacked = join(distDir, 'linux-unpacked')
    return existsSync(unpacked)
      ? { path: unpacked, resources: join(unpacked, 'resources') }
      : undefined
  }
  const appDirs = existsSync(distDir)
    ? readdirSync(distDir)
        .filter((name) => /^mac(-arm64)?$/.test(name))
        .map((name) => join(distDir, name))
    : []
  const appPath = appDirs
    .flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))
    .find((path) => path.endsWith('.app'))
  return appPath ? { path: appPath, resources: join(appPath, 'Contents', 'Resources') } : undefined
}

const app = findApp()
if (!app) {
  console.error(
    platform === 'linux'
      ? `check-package: no linux-unpacked folder in ${distDir}`
      : `check-package: no .app found in ${join(distDir, 'mac-arm64')}`
  )
  process.exit(1)
}
console.log(`check-package: ${platform}: ${app.path}`)
const resources = app.resources

if (platform === 'linux') {
  // The Electron executable (the only executable over 50 MB at the top level) and its sandbox helper.
  const top = readdirSync(app.path).map((name) => join(app.path, name))
  const executable = top.find(
    (path) =>
      statSync(path).isFile() && statSync(path).size > 50_000_000 && statSync(path).mode & 0o111
  )
  if (!executable) fail(`no Electron executable at the top of ${app.path}`)
  if (!existsSync(join(app.path, 'chrome-sandbox'))) fail('chrome-sandbox is missing')
}

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

// 4. The tldraw license key stays out of the main process. Since #43 nothing in the renderer
// reads it (the Design Canvas runs on React Flow), so it is no longer expected inside app.asar;
// #44 removes the key and this step with it.
const licenseKey = readTldrawLicenseKey()
if (licenseKey) {
  for (const dir of ['out/main', 'out/preload']) {
    for (const file of readdirSync(join(root, dir)).filter((name) => name.endsWith('.js'))) {
      if (readFileSync(join(root, dir, file), 'utf8').includes(licenseKey)) {
        fail(`${dir}/${file} contains the tldraw license key (it belongs to the renderer only)`)
      }
    }
  }
}

// 5. The installable artifacts, next to the app. A size floor catches an empty or truncated file.
if (!appOnly) {
  const names = readdirSync(distDir)
  const expected = platform === 'linux' ? ['.AppImage', '.deb'] : ['.dmg']
  for (const extension of expected) {
    const name = names.find((entry) => entry.endsWith(extension))
    if (!name) fail(`no ${extension} in ${distDir}`)
    else if (statSync(join(distDir, name)).size < 50_000_000) {
      fail(`${name} is smaller than 50 MB: truncated?`)
    }
  }
}

if (failures.length > 0) {
  console.error('check-package: FAILED')
  for (const message of failures) console.error(`  - ${message}`)
  process.exit(1)
}
console.log(`check-package: ok (${asarPaths.length} entries in app.asar)`)
