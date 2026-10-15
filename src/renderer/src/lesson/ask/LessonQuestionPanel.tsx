import { useEffect, useRef, useState } from 'react'
import {
  LESSON_QUESTION_MAX_QUESTION,
  type LessonQuestionContext
} from '../../../../shared/lessonQuestion'
import { GenerationErrorView } from '../../generation/GenerationErrorView'
import { submitOnModEnter } from '../../quiz/FreeAnswerForm'
import { isLessonRunning, lessonErrorTitle } from '../lessonState'
import { LessonMarkdown } from '../LessonMarkdown'
import { type QuestionExchange } from './lessonQuestion'
import { useLessonQuestions } from './useLessonQuestions'
import './lessonAsk.css'

const answerStatus = ({ answer }: QuestionExchange): string => {
  switch (answer.status) {
    case 'queued':
      return 'Waiting for a free generation slot...'
    case 'generating':
      return answer.text ? 'Writing the answer...' : 'Looking at the lesson...'
    default:
      return 'Sending the question...'
  }
}

/** One question and its answer: the quoted passage, the question, then the streamed answer. */
function ExchangeView({
  exchange,
  showPassage,
  onCancel,
  onRetry
}: {
  exchange: QuestionExchange
  /** False when the previous question was about the same passage. */
  showPassage: boolean
  onCancel: () => void
  onRetry: () => void
}) {
  const { answer, refusal } = exchange
  const running = refusal === null && isLessonRunning(answer.status)
  return (
    <li className="lesson-ask-exchange" data-testid="lesson-ask-exchange">
      {showPassage && (
        <blockquote lang="fr" className="lesson-ask-passage">
          {exchange.selection}
        </blockquote>
      )}
      <p lang="fr" className="lesson-ask-question" data-testid="lesson-ask-question">
        {exchange.question}
      </p>
      {running && (
        <p className="status-strip" role="status" data-testid="lesson-ask-status">
          <span className="spinner" aria-hidden />
          <span className="status-strip-text">{answerStatus(exchange)}</span>
          <button
            type="button"
            className="btn-sm"
            onClick={onCancel}
            data-testid="lesson-ask-cancel"
          >
            Cancel
          </button>
        </p>
      )}
      {refusal !== null && (
        <GenerationErrorView
          code="refused"
          message={refusal}
          testId="lesson-ask-error"
          onRetry={onRetry}
          retryTestId="lesson-ask-retry"
        />
      )}
      {refusal === null && answer.error && (
        <GenerationErrorView
          code={answer.error.code}
          message={answer.error.message}
          title={
            answer.status === 'cancelled'
              ? 'Question cancelled'
              : lessonErrorTitle(answer.error.code)
          }
          hint="Your question is kept: retry it."
          onRetry={onRetry}
          retryTestId="lesson-ask-retry"
          testId="lesson-ask-error"
        />
      )}
      {answer.text && (
        <div
          className="lesson-body lesson-ask-answer"
          data-testid="lesson-ask-answer"
          aria-busy={running}
        >
          <LessonMarkdown markdown={answer.text} sources={answer.sources} streaming={running} />
        </div>
      )}
    </li>
  )
}

/**
 * The panel on the right of a Lesson: the quoted passage, the thread of questions and streamed
 * answers, and the input. The thread lives in this component: closing the panel (it unmounts)
 * discards it and cancels an answer in progress. A new `passage` replaces the quote and keeps the
 * thread; `focusTick` brings the focus back to the input.
 */
export function LessonQuestionPanel({
  context,
  lesson,
  passage,
  focusTick,
  onClose
}: {
  context: LessonQuestionContext
  lesson: string
  passage: string
  focusTick: number
  onClose: () => void
}) {
  const { thread, answering, ask, retry, cancel } = useLessonQuestions(context, lesson)
  const [question, setQuestion] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLOListElement>(null)
  const empty = question.trim().length === 0

  useEffect(() => {
    inputRef.current?.focus()
  }, [passage, focusTick])

  // Follow the newest question and the streaming answer.
  useEffect(() => {
    const element = threadRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [thread])

  const send = () => {
    if (empty || answering) return
    ask(passage, question.trim())
    setQuestion('')
  }

  return (
    <aside
      className="lesson-ask-panel"
      aria-labelledby="lesson-ask-title"
      data-testid="lesson-ask-panel"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.preventDefault()
        onClose()
      }}
    >
      <header className="lesson-ask-header">
        <h2 id="lesson-ask-title">Ask about the lesson</h2>
        <button type="button" onClick={onClose} data-testid="lesson-ask-close">
          Close
        </button>
      </header>
      <div className="lesson-ask-selection">
        <p className="label-caps">Selected passage</p>
        <blockquote
          lang="fr"
          className="lesson-ask-passage lesson-ask-current"
          data-testid="lesson-ask-quote"
        >
          {passage}
        </blockquote>
      </div>
      <ol className="lesson-ask-thread" ref={threadRef} aria-label="Questions and answers">
        {thread.exchanges.map((exchange, index) => (
          <ExchangeView
            key={exchange.id}
            showPassage={exchange.selection !== thread.exchanges[index - 1]?.selection}
            exchange={exchange}
            onCancel={() => cancel(exchange.id)}
            onRetry={() => retry(exchange.id)}
          />
        ))}
      </ol>
      <form
        className="lesson-ask-form"
        onSubmit={(event) => {
          event.preventDefault()
          send()
        }}
      >
        <label htmlFor="lesson-ask-input" className="muted">
          {thread.exchanges.length === 0
            ? 'Your question about this passage. Select other text in the lesson to change the passage.'
            : 'A follow-up question. Select other text in the lesson to change the passage.'}
        </label>
        <textarea
          id="lesson-ask-input"
          ref={inputRef}
          data-testid="lesson-ask-input"
          lang="fr"
          rows={3}
          maxLength={LESSON_QUESTION_MAX_QUESTION}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={submitOnModEnter}
        />
        <div className="lesson-ask-form-foot">
          <span className="label-mono muted">Ctrl+Enter (⌘+Enter) to send</span>
          <button
            type="submit"
            className="btn-primary"
            data-testid="lesson-ask-send"
            disabled={empty || answering}
          >
            Ask
          </button>
        </div>
      </form>
    </aside>
  )
}
