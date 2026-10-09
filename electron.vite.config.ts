import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    // Read .env and .env.local from the repo root (the renderer root is src/renderer).
    // Only VITE_ and RENDERER_VITE_ prefixed variables reach the renderer.
    envDir: resolve('.'),
    // The dev pre-bundler drops the `?url` imports of @tldraw/assets (tldraw's bundled fonts,
    // icons and translations), so Vite must serve that package as is.
    optimizeDeps: { exclude: ['@tldraw/assets'] },
    build: {
      // The built renderer runs from file://, where Chromium blocks font and mask-image loads
      // (CORS, opaque origin) and fetch() of files. Inline tldraw's assets as data: URLs instead.
      assetsInlineLimit: (filePath) =>
        filePath.includes('/node_modules/@tldraw/assets/') ? true : undefined
    },
    plugins: [react()]
  }
})
