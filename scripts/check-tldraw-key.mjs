// Run by `npm run package` and `npm run package:dir`, before and after the build: reports whether
// the tldraw license key reaches the renderer bundle. Never fails the build and never prints the
// key, only its presence and length. See docs/Packaging.md ("tldraw license").
//
//   node scripts/check-tldraw-key.mjs
import { LICENSE_KEY_VARIABLE, readTldrawLicenseKey } from './tldraw-license-key.mjs'

const key = readTldrawLicenseKey()

if (key) {
  console.log(`tldraw license key found (${key.length} chars): it will be baked into the renderer.`)
  if (!key.startsWith('tldraw-')) {
    console.warn(
      `tldraw license key WARNING: the value of ${LICENSE_KEY_VARIABLE} does not look like a tldraw key (expected the "tldraw-" prefix). tldraw will reject it.`
    )
  }
} else {
  console.warn(
    [
      '',
      `tldraw license key WARNING: ${LICENSE_KEY_VARIABLE} is missing or empty.`,
      '  The build goes on, but in this package the Design Canvas of an exercise shows for 5 seconds,',
      '  then tldraw stops rendering the editor (blank canvas, errors in the console).',
      `  Put ${LICENSE_KEY_VARIABLE}=<your key> in .env.local (see .env.example) and rebuild.`,
      '  Details: docs/Packaging.md, section "tldraw license".',
      ''
    ].join('\n')
  )
}
