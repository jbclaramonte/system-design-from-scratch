import { useEffect, useState, type RefObject } from 'react'
import { askButtonPosition, toPassage } from './lessonQuestion'

export interface SelectedPassage {
  text: string
  /** Where the fixed Ask button goes (viewport px). */
  position: { top: number; left: number }
}

/** Delay before the Ask button shows, so it does not flicker while the learner drags. */
const SHOW_DELAY_MS = 150

/**
 * The text selected inside `container` right now, or null. The selection must start in the
 * container; one that runs past its end (a triple click on the last paragraph selects up to the
 * next block) is cut at the end of the container.
 */
function readSelection(container: HTMLElement | null): SelectedPassage | null {
  const selection = window.getSelection()
  if (!container || !selection || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  if (!container.contains(range.startContainer)) return null
  const inside = container.contains(range.endContainer)
  const clipped = range.cloneRange()
  if (!inside) clipped.setEnd(container, container.childNodes.length)
  const text = toPassage(inside ? selection.toString() : clipped.toString())
  if (!text) return null
  const rects = clipped.getClientRects()
  const end = rects.length > 0 ? rects[rects.length - 1]! : clipped.getBoundingClientRect()
  return {
    text,
    position: askButtonPosition(end, { width: window.innerWidth, height: window.innerHeight })
  }
}

const same = (a: SelectedPassage | null, b: SelectedPassage | null) =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.text === b.text &&
    a.position.top === b.position.top &&
    a.position.left === b.position.left)

/**
 * Follows the learner's text selection inside the container: the quotable passage and where to
 * put the Ask button. Read-only on the selection (copy and paste are untouched). Hiding is
 * immediate, showing waits for the selection to settle; scrolling and resizing move the button.
 */
export function useSelectedPassage(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean
): SelectedPassage | null {
  const [passage, setPassage] = useState<SelectedPassage | null>(null)

  useEffect(() => {
    if (!enabled) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const apply = (next: SelectedPassage | null) =>
      setPassage((previous) => (same(previous, next) ? previous : next))
    const now = () => apply(readSelection(containerRef.current))
    const settled = () => {
      clearTimeout(timer)
      const next = readSelection(containerRef.current)
      if (next === null) return apply(null)
      timer = setTimeout(() => apply(next), SHOW_DELAY_MS)
    }

    document.addEventListener('selectionchange', settled)
    document.addEventListener('pointerup', now)
    document.addEventListener('keyup', now)
    // Capture: scrolling happens in an inner element, which does not bubble.
    document.addEventListener('scroll', now, true)
    window.addEventListener('resize', now)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('selectionchange', settled)
      document.removeEventListener('pointerup', now)
      document.removeEventListener('keyup', now)
      document.removeEventListener('scroll', now, true)
      window.removeEventListener('resize', now)
    }
  }, [containerRef, enabled])

  return enabled ? passage : null
}
