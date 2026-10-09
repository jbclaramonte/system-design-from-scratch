import { describe, expect, it } from 'vitest'
import { cssSafeUrl, iconUrlsByName } from './assetUrls'

describe('asset urls', () => {
  it('encodes the characters an unquoted CSS url() cannot hold', () => {
    const url = 'data:image/svg+xml,%3csvg%20xmlns=\'http://www.w3.org/2000/svg\' d="M0 (1)"%3e'

    expect(cssSafeUrl(url)).toBe(
      'data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20d=%22M0%20%281%29%22%3e'
    )
  })

  it('leaves plain URLs untouched', () => {
    expect(cssSafeUrl('/@fs/repo/node_modules/@tldraw/assets/icons/icon/menu.svg')).toBe(
      '/@fs/repo/node_modules/@tldraw/assets/icons/icon/menu.svg'
    )
  })

  it('keys icon URLs by file name', () => {
    expect(
      iconUrlsByName({
        '../../node_modules/@tldraw/assets/icons/icon/align-left.svg': 'data:a b',
        '../../node_modules/@tldraw/assets/icons/icon/menu.svg': '/menu.svg'
      })
    ).toEqual({ 'align-left': 'data:a%20b', menu: '/menu.svg' })
  })
})
