import { describe, expect, it } from 'vitest'
import { isAllowedPermission, isExternalWebUrl } from './security'

describe('isExternalWebUrl', () => {
  it.each(['https://example.com', 'http://example.com/path'])('accepts %s', (url) => {
    expect(isExternalWebUrl(url)).toBe(true)
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)', 'smb://host/share', 'not a url'])(
    'rejects %s',
    (url) => {
      expect(isExternalWebUrl(url)).toBe(false)
    }
  )
})

describe('isAllowedPermission', () => {
  it('only allows writing sanitized text to the clipboard', () => {
    expect(isAllowedPermission('clipboard-sanitized-write')).toBe(true)
    for (const permission of [
      'clipboard-read',
      'media',
      'geolocation',
      'notifications',
      'openExternal'
    ]) {
      expect(isAllowedPermission(permission)).toBe(false)
    }
  })
})
