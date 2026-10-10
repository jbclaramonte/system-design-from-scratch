import { useCallback, useState } from 'react'
import type { DiagramErrorEvent } from '../markdown/diagramSource'
import { MermaidDiagram } from '../markdown/MermaidDiagram'
import { FLAG_REASON_MAX_LENGTH } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'

/** Start of the reason pre-filled when the learner flags a question whose Diagram failed. */
export const DIAGRAM_FLAG_REASON = 'diagram could not be drawn'

/** Reason pre-filled in the flag offer: the fixed start, then the failure's code and message. */
export const diagramFlagReason = ({ error }: DiagramErrorEvent): string =>
  `${DIAGRAM_FLAG_REASON} (${error.code}: ${error.message})`.slice(0, FLAG_REASON_MAX_LENGTH)

/**
 * The Diagram of a question, shown before and after answering. When it cannot be drawn,
 * `MermaidDiagram` shows its source as code with a note, the question stays playable, and the
 * learner is offered to flag it as faulty. Key it by question id.
 */
export function QuestionDiagram({
  questionId,
  source,
  title
}: {
  questionId: number
  source: string
  /** Accessible title: the question prompt. */
  title: string
}) {
  const [failure, setFailure] = useState<DiagramErrorEvent | null>(null)
  // Stable, as `MermaidDiagram` is memoized on its props. Keeps the first failure.
  const onDiagramError = useCallback(
    (event: DiagramErrorEvent) => setFailure((previous) => previous ?? event),
    []
  )
  return (
    <div data-testid="question-diagram">
      <MermaidDiagram source={source} title={title} onDiagramError={onDiagramError} />
      {failure && <DiagramFlagOffer questionId={questionId} reason={diagramFlagReason(failure)} />}
    </div>
  )
}

/** Offer to flag a question whose Diagram could not be drawn, with an editable reason. */
export function DiagramFlagOffer({ questionId, reason }: { questionId: number; reason: string }) {
  const [text, setText] = useState(reason)
  const [busy, setBusy] = useState(false)
  const [flagged, setFlagged] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (flagged) {
    return (
      <p role="status" data-testid="question-flagged">
        Question flagged as faulty. You can still answer it.
      </p>
    )
  }

  const flag = () => {
    setBusy(true)
    setError(null)
    window.api
      .flagQuestion({ questionId, reason: text })
      .then(() => setFlagged(true))
      .catch((failure: unknown) => setError(errorMessage(failure)))
      .finally(() => setBusy(false))
  }

  return (
    <form
      data-testid="diagram-flag-offer"
      style={{ background: '#fff4e5', padding: '8px 12px', marginBottom: 8 }}
      onSubmit={(event) => {
        event.preventDefault()
        flag()
      }}
    >
      <p style={{ marginTop: 0 }}>
        You can still answer this question. Flag it as faulty so that it can be replaced by one with
        a working diagram.
      </p>
      <label style={{ display: 'block', marginBottom: 8 }}>
        Reason{' '}
        <input
          data-testid="flag-reason"
          value={text}
          maxLength={FLAG_REASON_MAX_LENGTH}
          onChange={(event) => setText(event.target.value)}
          style={{ width: '100%' }}
        />
      </label>
      <button type="submit" data-testid="flag-question" disabled={busy || !text.trim()}>
        Flag this question
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}
