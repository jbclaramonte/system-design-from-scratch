import { createContext, useContext } from 'react'

/**
 * Opens the Settings screen from anywhere in the app (provided by `App`). Null outside the app
 * shell: error screens then show no "Open Settings" button.
 */
export const OpenSettingsContext = createContext<(() => void) | null>(null)

export const useOpenSettings = () => useContext(OpenSettingsContext)
