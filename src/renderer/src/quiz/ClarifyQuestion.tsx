import { GenerationErrorView } from '../generation/GenerationErrorView'
import './quiz.css'
import { useClarification } from './useClarification'

/**
 * "I don't understand the question": a plainer wording of the question and one concrete
 * example, shown under the question. The question and its choices stay on screen and the
 * original question is the one answered. It never carries a hint at the answer, records nothing
 * and has no effect on the score, the round or the grading. The result is stored per question
 * (Content Cache): pressing again reads it; "Reformulate differently" asks for another version.
 */
export function ClarifyQuestion({ roundId, questionId }: { roundId: number; questionId: number }) {
  const { clarification, fromCache, pending, error, request, cancel, hide } = useClarification(
    roundId,
    questionId
  )

  return (
    <div className="quiz-clarify" data-testid="clarify">
      {!clarification && !pending && (
        <div className="quiz-actions">
          <button type="button" data-testid="clarify-question" onClick={() => request()}>
            I don’t understand the question
          </button>
        </div>
      )}
      {pending && (
        <p className="status-strip" role="status" data-testid="clarify-pending">
          <span className="quiz-pending-dot" aria-hidden="true" />
          <span className="status-strip-text">
            {clarification
              ? 'Rewording it another way…'
              : 'Rewording the question (a few seconds)…'}
          </span>
          <button type="button" className="btn-sm" data-testid="clarify-cancel" onClick={cancel}>
            Cancel
          </button>
        </p>
      )}
      {error &&
        (error.code === 'cancelled' ? (
          <p className="notice" role="status" data-testid="clarify-error" data-code={error.code}>
            Rewording cancelled. The question is unchanged.
          </p>
        ) : (
          <GenerationErrorView
            code={error.code}
            message={error.message}
            hint={
              error.code !== 'refused'
                ? 'Nothing was recorded: retry, or answer as it is.'
                : undefined
            }
            onRetry={() => request()}
            retryTestId="clarify-retry"
            testId="clarify-error"
          />
        ))}
      {clarification && (
        <section
          className="card quiz-clarification"
          aria-label="The question, reworded"
          data-testid="clarification"
          data-from-cache={fromCache}
        >
          <p className="label-caps">In other words</p>
          <p lang="fr" data-testid="clarification-rewording">
            {clarification.rewording}
          </p>
          <p className="label-caps">Example</p>
          <p lang="fr" data-testid="clarification-example">
            {clarification.example}
          </p>
          <p className="muted">
            This only rewords the question. Answer the original question and its choices.
          </p>
          <div className="quiz-actions">
            <button
              type="button"
              data-testid="clarify-another"
              disabled={pending}
              onClick={() => request(true)}
            >
              Reformulate differently
            </button>
            <button type="button" data-testid="clarify-hide" disabled={pending} onClick={hide}>
              Hide
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
