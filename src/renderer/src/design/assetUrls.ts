/**
 * Percent-encodes the characters that end an unquoted CSS `url()`. tldraw sets icons as
 * `mask: url(${asset})` without quotes, and Vite inlines SVGs as data: URLs that keep `'` and
 * spaces, which would make the declaration invalid.
 */
export function cssSafeUrl(url: string): string {
  return url.replace(/['"()\s]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`)
}

/** Icon name to URL, from an `import.meta.glob` of tldraw's per-icon SVG files. */
export function iconUrlsByName(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(files).map(([path, url]) => [
      path.slice(path.lastIndexOf('/') + 1, -'.svg'.length),
      cssSafeUrl(url)
    ])
  )
}
