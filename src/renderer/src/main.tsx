import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
// Order matters: fonts, tokens, base and shared styles first, then the screens (imported by App).
import './styles/design-tokens.css'
import './styles/base.css'
import './styles/components.css'
import { App } from './App'
import { FirstRunGate } from './firstRun/FirstRunGate'
import { watchTheme } from './theme/watchTheme'

// theme-init.js set data-theme before the first paint; this keeps it in step with the Theme.
watchTheme()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <FirstRunGate>
      <App />
    </FirstRunGate>
  </StrictMode>
)
