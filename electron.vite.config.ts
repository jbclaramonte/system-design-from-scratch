import react from '@vitejs/plugin-react'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      // The packaged app ships no node_modules: bundle zod into the main process instead of
      // requiring it at runtime (the default externalizes every `dependencies` entry). Any other
      // external package would be missing from the package; scripts/check-package.mjs fails then.
      externalizeDeps: { exclude: ['zod'] }
    }
  },
  preload: {},
  renderer: {
    build: {
      // The built renderer runs from file://, where Chromium blocks font loads (CORS, opaque
      // origin) and fetch() of files. Inline the self-hosted Geist and JetBrains Mono fonts (about
      // 170 KB each) as data: URLs instead.
      assetsInlineLimit: (filePath) =>
        filePath.includes('/node_modules/@fontsource-variable/') ? true : undefined
    },
    plugins: [react()]
  }
})
