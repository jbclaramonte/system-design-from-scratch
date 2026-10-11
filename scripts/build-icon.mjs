// Generates the app icons of the packaged apps: build/icon.icns (macOS, needs `iconutil`) and
// build/icons/<size>x<size>.png (Linux: electron-builder reads that folder for the AppImage, the
// deb and the .desktop entry), all from the same drawing.
//
// Run with Electron (already a devDependency, no extra tooling), on macOS for the .icns:
//   npm run icon:build
// On another OS the PNG set is still written and the .icns step is skipped.
//
// The icon is the brand mark of the app header (src/renderer/src/shell/AppShell.tsx) on a dark
// rounded square (Design System tokens: surface-base #0b0f19, indigo #6366f1, emerald #10b981).
// Electron renders the SVG to a 1024 px PNG, then `iconutil` (macOS) assembles the .icns.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { app, BrowserWindow } from 'electron'

const SIZE = 1024
// Apple's macOS icon grid: an 824 px body centered on the 1024 px canvas, corner radius about 185.
const BODY = { x: 100, y: 100, size: 824, radius: 185 }
// The brand mark has its nodes at (8,8.5), (16,8.5) and (12,16) in a 24 px box; scale and center it.
const SCALE = 58
const point = (x, y) => [
  Math.round(SIZE / 2 + (x - 12) * SCALE),
  Math.round(SIZE / 2 + (y - 12.25) * SCALE)
]
const [ax, ay] = point(8, 8.5)
const [bx, by] = point(16, 8.5)
const [cx, cy] = point(12, 16)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#161d2e" />
      <stop offset="1" stop-color="#0b0f19" />
    </linearGradient>
    <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#818cf8" />
      <stop offset="1" stop-color="#6366f1" />
    </linearGradient>
  </defs>
  <rect x="${BODY.x}" y="${BODY.y}" width="${BODY.size}" height="${BODY.size}" rx="${BODY.radius}" fill="url(#bg)" />
  <rect x="${BODY.x + 2}" y="${BODY.y + 2}" width="${BODY.size - 4}" height="${BODY.size - 4}" rx="${BODY.radius - 2}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="4" />
  <path d="M${ax} ${ay} L${bx} ${by} M${ax} ${ay} L${cx} ${cy} M${bx} ${by} L${cx} ${cy}" fill="none" stroke="url(#edge)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="${ax}" cy="${ay}" r="62" fill="#10b981" />
  <circle cx="${bx}" cy="${by}" r="62" fill="#10b981" />
  <circle cx="${cx}" cy="${cy}" r="62" fill="#10b981" />
</svg>`

const outDir = resolve(import.meta.dirname, '..', 'build')
const pngDir = join(outDir, 'icons')
const iconset = join(tmpdir(), `sdfs-icon-${process.pid}.iconset`)
// Sizes of the Linux PNG set (hicolor theme sizes).
const LINUX_SIZES = [16, 24, 32, 48, 64, 128, 256, 512]

// Electron would otherwise create an "Electron" userData folder in the user's Application Support.
app.setPath('userData', join(tmpdir(), `sdfs-icon-userdata-${process.pid}`))

// No top-level await: Electron would never emit `ready` while the entry module is pending.
void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    useContentSize: true,
    show: false,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: false }
  })
  const html = `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const captured = await window.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE })
  // capturePage returns device pixels: normalise to exactly SIZE x SIZE.
  const master =
    captured.getSize().width === SIZE
      ? captured
      : captured.resize({ width: SIZE, height: SIZE, quality: 'best' })

  mkdirSync(outDir, { recursive: true })

  rmSync(pngDir, { recursive: true, force: true })
  mkdirSync(pngDir, { recursive: true })
  for (const size of LINUX_SIZES) {
    const png = master.resize({ width: size, height: size, quality: 'best' }).toPNG()
    writeFileSync(join(pngDir, `${size}x${size}.png`), png)
  }
  console.log(`Wrote ${LINUX_SIZES.length} PNG icons in ${pngDir}`)

  if (process.platform === 'darwin') {
    rmSync(iconset, { recursive: true, force: true })
    mkdirSync(iconset, { recursive: true })
    for (const size of [16, 32, 128, 256, 512]) {
      const one = master.resize({ width: size, height: size, quality: 'best' })
      const two = master.resize({ width: size * 2, height: size * 2, quality: 'best' })
      writeFileSync(join(iconset, `icon_${size}x${size}.png`), one.toPNG())
      writeFileSync(join(iconset, `icon_${size}x${size}@2x.png`), two.toPNG())
    }
    execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(outDir, 'icon.icns')])
    rmSync(iconset, { recursive: true, force: true })
    console.log(`Wrote ${join(outDir, 'icon.icns')}`)
  } else {
    console.log('Skipped build/icon.icns: it needs macOS iconutil.')
  }
  app.quit()
})
