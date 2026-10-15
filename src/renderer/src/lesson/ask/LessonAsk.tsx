import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { LessonQuestionContext } from '../../../../shared/lessonQuestion'
import { isAskShortcut } from './lessonQuestion'
import { LessonQuestionPanel } from './LessonQuestionPanel'
import { useSelectedPassage } from './useSelectedPassage'
import './lessonAsk.css'

/**
 * Lets the learner ask a question about a passage of the text in `children` (a Lesson, a
 * Remediation Lesson or a Protocol Step Lesson): selecting text shows an Ask button next to it
 * (or Ctrl/Cmd+Shift+A), which opens the panel on the right with the passage quoted.
 *
 * Only the screens that read a Lesson for learning use it. The Lesson reading panel opened during
 * a Quiz round (#35) does not, and the main process refuses a Lesson Question while a round of
 * the topic is open anyway.
 *
 * `enabled` is false while the text is still streaming (the question needs the whole text). The
 * selection is only read, never changed, so copy and paste and the Mermaid Diagrams are as before.
 */
export function LessonAsk({
  context,
  lesson,
  enabled,
  children
}: {
  context: LessonQuestionContext
  /** The text being read, complete. */
  lesson: string
  enabled: boolean
  children: ReactNode
}) {
  // `display: contents`: the wrapper only gives a DOM boundary for the selection, so the
  // children keep laying out in their parent (flex columns, scroll areas).
  const contentRef = useRef<HTMLDivElement>(null)
  const selected = useSelectedPassage(contentRef, enabled)
  const [panel, setPanel] = useState<{ passage: string; focusTick: number } | null>(null)
  // Read by the stable handlers below.
  const latest = useRef({ selected, panel })
  useEffect(() => {
    latest.current = { selected, panel }
  })

  /** Quotes the current selection in the panel (opening it), or refocuses an open panel. */
  const open = useCallback(() => {
    const { selected: current } = latest.current
    setPanel((previous) =>
      current
        ? { passage: current.text, focusTick: (previous?.focusTick ?? 0) + 1 }
        : previous && { ...previous, focusTick: previous.focusTick + 1 }
    )
    // The passage is quoted in the panel: drop the selection and its button.
    if (current) window.getSelection()?.removeAllRanges()
  }, [])

  useEffect(() => {
    if (!enabled) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isAskShortcut(event)) return
      if (!latest.current.selected && !latest.current.panel) return
      event.preventDefault()
      open()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled, open])

  const visible = enabled && panel !== null
  return (
    <>
      <div ref={contentRef} className="lesson-ask-content">
        {children}
      </div>
      {enabled && selected && (
        <button
          type="button"
          className="lesson-ask-button"
          style={selected.position}
          data-testid="lesson-ask-button"
          title="Ask a question about the selected text (Ctrl/Cmd+Shift+A)"
          aria-keyshortcuts="Control+Shift+A Meta+Shift+A"
          // Keep the selection: a click on a button would clear it before the click lands.
          onMouseDown={(event) => event.preventDefault()}
          onClick={open}
        >
          Ask
        </button>
      )}
      {visible && (
        <LessonQuestionPanel
          context={context}
          lesson={lesson}
          passage={panel.passage}
          focusTick={panel.focusTick}
          onClose={() => setPanel(null)}
        />
      )}
    </>
  )
}
