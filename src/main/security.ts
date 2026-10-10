/** Only web links may leave the app, and they open in the OS browser. */
export function isExternalWebUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}

/**
 * Permissions the renderer may be granted: only writing sanitized text to the clipboard (the
 * "Copy" button of the technical error details). Everything else stays denied.
 */
export function isAllowedPermission(permission: string): boolean {
  return permission === 'clipboard-sanitized-write'
}
