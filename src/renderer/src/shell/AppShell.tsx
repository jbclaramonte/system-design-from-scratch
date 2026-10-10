import { useEffect, useRef, type ReactNode } from 'react'
import './shell.css'
import { NAV_ITEMS, type NavItemId, type ShellLayout } from './navigation'

/** Brand mark: three linked nodes (a small system diagram). Decorative. */
function BrandMark() {
  return (
    <svg
      className="shell-brand-mark"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="1.75" y="1.75" width="20.5" height="20.5" rx="4" />
      <path d="M8 8.5 16 8.5M8 8.5 12 16M16 8.5 12 16" />
      <circle cx="8" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="16" cy="8.5" r="1.6" fill="currentColor" />
      <circle cx="12" cy="16" r="1.6" fill="currentColor" />
    </svg>
  )
}

/**
 * The frame shared by every screen: header with the brand and the navigation, the content area,
 * and a quiet footer with the app version. The shell fills the window; only the content area
 * scrolls, so the header stays in view. Screens render their own `<main>` inside it.
 *
 * `layout` (see `screenLayout`): `page` and `fill` use a centered container (about 1100px);
 * `canvas` removes the container so a screen such as the Design Exercise uses the full area.
 * `scrollKey` changes when the screen changes: the content scrolls back to the top.
 */
export function AppShell({
  activeItem,
  layout,
  version,
  scrollKey,
  onNavigate,
  children
}: {
  activeItem: NavItemId
  layout: ShellLayout
  version: string | null
  scrollKey: string
  onNavigate: (item: NavItemId) => void
  children: ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => {
    content.current?.scrollTo({ top: 0 })
  }, [scrollKey])

  return (
    <div className="shell" data-testid="app-shell" data-layout={layout}>
      <header className="shell-header">
        <div className="shell-bar">
          <div className="shell-brand">
            <BrandMark />
            <span className="shell-brand-name">
              System Design <span className="shell-brand-sub">from Scratch</span>
            </span>
          </div>
          <nav aria-label="App" className="shell-nav">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="shell-nav-item"
                data-testid={item.testId}
                aria-current={item.id === activeItem ? 'page' : undefined}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <div className="shell-content" ref={content}>
        <div className="shell-container">{children}</div>
      </div>
      <footer className="shell-footer">
        <div className="shell-bar">
          <span data-testid="app-version">Version {version ?? '...'}</span>
        </div>
      </footer>
    </div>
  )
}
