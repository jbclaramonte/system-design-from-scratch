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
    plugins: [react()]
  }
})
