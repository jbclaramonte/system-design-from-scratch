import { useState } from 'react'
import type { RoundResult, RoundStart } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'
import { QuizPicker } from './QuizPicker'
import { QuizPlayer } from './QuizPlayer'
import { QuizResults } from './QuizResults'

type Step =
  | { name: 'pick' }
  | { name: 'play'; start: RoundStart }
  | { name: 'results'; result: RoundResult; grounded: boolean }

/** Quiz flow: pick a quiz, play it as a Round, see the results. */
export function QuizScreen({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>({ name: 'pick' })
  const [error, setError] = useState<string | null>(null)

  const start = (quizId: number) => {
    setError(null)
    window.api
      .startRound({ quizId })
      .then((roundStart) => setStep({ name: 'play', start: roundStart }))
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  return (
    <main
      data-testid="quiz-screen"
      style={{ maxWidth: '72ch', margin: '0 auto', padding: 16, lineHeight: 1.5 }}
    >
      <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <button onClick={onClose}>Back</button>
        {step.name !== 'pick' && (
          <button data-testid="quiz-back-to-list" onClick={() => setStep({ name: 'pick' })}>
            Quiz list
          </button>
        )}
        <h1 style={{ fontSize: '1.4em', margin: 0 }}>Quiz</h1>
      </header>
      {error && <p role="alert">{error}</p>}
      {step.name === 'pick' && <QuizPicker onStart={start} />}
      {step.name === 'play' && (
        <QuizPlayer
          key={step.start.round.id}
          start={step.start}
          onCompleted={(result) =>
            setStep({ name: 'results', result, grounded: step.start.quiz.grounded })
          }
        />
      )}
      {step.name === 'results' && (
        <QuizResults result={step.result} outsidePrimer={!step.grounded} />
      )}
    </main>
  )
}
