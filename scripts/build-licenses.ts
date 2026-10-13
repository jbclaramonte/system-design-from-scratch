// Writes resources/licenses.json: name, version, license and license file texts of the shipped
// third-party packages (rule in src/main/about/licenses.ts, docs/Attribution and Licenses.md).
//
//   node scripts/build-licenses.ts           # rewrite the file
//   node scripts/build-licenses.ts --check   # exit 1 if the committed file is stale
//
// Needs Node 22.18+ and an installed node_modules (npm ci). No network. Run it after any change
// to package-lock.json and commit the result; `npm test` fails while the file is stale.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildLicensesFile,
  serializeLicensesFile,
  type Lockfile
} from '../src/main/about/licenses.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(ROOT, 'resources', 'licenses.json')

function main(): void {
  const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as Lockfile
  const generated = serializeLicensesFile(
    buildLicensesFile(lock, {
      list: (path) => (existsSync(join(ROOT, path)) ? readdirSync(join(ROOT, path)) : null),
      read: (path, file) => readFileSync(join(ROOT, path, file), 'utf8')
    })
  )

  if (process.argv.includes('--check')) {
    const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : ''
    if (current !== generated) {
      console.error('resources/licenses.json is stale: run npm run licenses:build and commit it.')
      process.exit(1)
    }
    console.log('resources/licenses.json is up to date.')
    return
  }
  writeFileSync(OUTPUT, generated)
  console.log(`Wrote ${OUTPUT}`)
}

main()
