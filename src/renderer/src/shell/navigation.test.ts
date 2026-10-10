import { describe, expect, it } from 'vitest'
import type { TopicMasterySummary } from '../../../shared/mastery'
import { activeNavItem, NAV_ITEMS, screenLayout, type Screen } from './navigation'

const topic = { id: 1, slug: 'cache', title: 'Cache' } as TopicMasterySummary

describe('activeNavItem', () => {
  it('highlights the nav item of the four main screens', () => {
    expect(activeNavItem({ name: 'home' })).toBe('learning-path')
    expect(activeNavItem({ name: 'dashboard' })).toBe('dashboard')
    expect(activeNavItem({ name: 'settings' })).toBe('settings')
    expect(activeNavItem({ name: 'about' })).toBe('about')
  })

  it('keeps Learning Path highlighted on a topic opened from the Learning Path and on exercises', () => {
    expect(activeNavItem({ name: 'topic', topic })).toBe('learning-path')
    expect(activeNavItem({ name: 'exercise', designExerciseId: 3 })).toBe('learning-path')
  })

  it('keeps Dashboard highlighted on a topic opened from the Dashboard', () => {
    expect(activeNavItem({ name: 'topic', topic, from: 'dashboard' })).toBe('dashboard')
  })

  it('highlights Settings when it is opened from another screen', () => {
    expect(activeNavItem({ name: 'settings', back: { name: 'topic', topic } })).toBe('settings')
  })

  it('keeps Learning Path highlighted on the dev screens', () => {
    const dev: Screen[] = [
      { name: 'dev-topics' },
      { name: 'dev-lessons' },
      { name: 'dev-quiz' },
      { name: 'dev-design-canvas' },
      { name: 'dev-design-exercise' },
      { name: 'dev-diagrams' }
    ]
    for (const screen of dev) expect(activeNavItem(screen)).toBe('learning-path')
  })

  it('returns an item that exists in the navigation', () => {
    const ids = NAV_ITEMS.map((item) => item.id)
    const screens: Screen[] = [{ name: 'home' }, { name: 'about' }, { name: 'dashboard' }]
    for (const screen of screens) expect(ids).toContain(activeNavItem(screen))
  })
})

describe('screenLayout', () => {
  it('gives the canvas screens the full width', () => {
    expect(screenLayout({ name: 'exercise', designExerciseId: 1 })).toBe('canvas')
    expect(screenLayout({ name: 'dev-design-canvas' })).toBe('canvas')
    expect(screenLayout({ name: 'dev-design-exercise' })).toBe('canvas')
  })

  it('lets the topic screen fill the height and the other screens scroll the page', () => {
    expect(screenLayout({ name: 'topic', topic })).toBe('fill')
    expect(screenLayout({ name: 'home' })).toBe('page')
    expect(screenLayout({ name: 'dashboard' })).toBe('page')
    expect(screenLayout({ name: 'settings' })).toBe('page')
    expect(screenLayout({ name: 'about' })).toBe('page')
  })
})
