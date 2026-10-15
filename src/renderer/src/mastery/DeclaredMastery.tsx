import { useEffect, useId, useRef, useState } from 'react'
import type { MasteryState } from '../../../shared/mastery'
import { errorMessage } from '../quiz/errorMessage'
import { declareConfirmation } from './masteryText'

/**
 * "I already know this": declares the topic as already known (Declared Mastery) after a
 * confirmation that says what it does. Used on the topic screen and on the Learning Path. The
 * main process stores it and pushes `path:changed`; `onChanged` also gets the new loop state.
 */
export function DeclareMastery({
  topicId,
  topicTitle,
  onChanged
}: {
  topicId: number
  topicTitle: string
  onChanged?: (state: MasteryState) => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refocusAction = useRef(false)
  const action = useRef<HTMLButtonElement>(null)
  const confirm = useRef<HTMLButtonElement>(null)
  const questionId = useId()

  // Keyboard users keep their place: the confirm button when asked, the button back on Cancel.
  useEffect(() => {
    if (confirming) confirm.current?.focus()
    else if (refocusAction.current) {
      refocusAction.current = false
      action.current?.focus()
    }
  }, [confirming])

  const cancel = () => {
    refocusAction.current = true
    setConfirming(false)
  }
  const declare = () => {
    setError(null)
    window.api
      .declareMastery({ topicId })
      .then((state) => {
        setConfirming(false)
        onChanged?.(state)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  return (
    <div className="declare-mastery">
      {confirming ? (
        <div
          role="group"
          aria-labelledby={questionId}
          className="notice notice-attention declare-mastery-confirm"
          data-testid="declare-confirmation"
          onKeyDown={(event) => event.key === 'Escape' && cancel()}
        >
          <p id={questionId}>{declareConfirmation(topicTitle)}</p>
          <div className="chip-row">
            <button
              ref={confirm}
              type="button"
              className="btn btn-sm card-clickable-action"
              data-testid="declare-confirm"
              onClick={declare}
            >
              Yes, I already know this
            </button>
            <button type="button" className="btn btn-sm card-clickable-action" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          ref={action}
          type="button"
          className="btn btn-sm card-clickable-action"
          data-testid="declare-mastery"
          onClick={() => setConfirming(true)}
        >
          I already know this
        </button>
      )}
      {error && (
        <p role="alert" className="declare-mastery-error">
          Could not declare the topic: {error}
        </p>
      )}
    </div>
  )
}

/** "Undo" of a Declared Mastery, offered while no Round was played after it. */
export function UndoDeclaration({
  topicId,
  onChanged
}: {
  topicId: number
  onChanged?: (state: MasteryState) => void
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button
        type="button"
        className="btn btn-sm card-clickable-action"
        data-testid="undo-declaration"
        onClick={() => {
          setError(null)
          window.api
            .undoDeclaredMastery({ topicId })
            .then((state) => onChanged?.(state))
            .catch((reason: unknown) => setError(errorMessage(reason)))
        }}
      >
        Undo
      </button>
      {error && (
        <span role="alert" className="declare-mastery-error">
          Could not undo: {error}
        </span>
      )}
    </>
  )
}
