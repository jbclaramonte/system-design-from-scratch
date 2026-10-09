import { useState } from 'react'
import type { DesignExerciseRef } from '../../../../shared/ipc'
import { PROTOCOL_UNLOCK_PLAN } from '../../../../shared/protocol'
import { errorMessage } from '../../quiz/errorMessage'
import { ProtocolExerciseScreen } from './ProtocolExerciseScreen'
import { stepTitle } from './protocolText'

/**
 * Dev-only entry: opens the fixture Design Exercise (the primer's Pastebin solution) playing
 * exercise 1 to 5 of the Learning Path, so every stage of the unlock plan can be tried. The real
 * Design Exercises open from the Learning Path.
 */
export function ProtocolDevScreen({ onClose }: { onClose: () => void }) {
  const [exercise, setExercise] = useState<DesignExerciseRef | null>(null)
  const [error, setError] = useState<string | null>(null)

  const open = (exerciseIndex: number) => {
    setError(null)
    window.api
      .openDevProtocolExercise({ exerciseIndex })
      .then(setExercise)
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  if (exercise) {
    return (
      <ProtocolExerciseScreen
        key={exercise.id}
        designExerciseId={exercise.id}
        onClose={() => setExercise(null)}
      />
    )
  }

  return (
    <main data-testid="protocol-dev">
      <p>
        <button type="button" onClick={onClose}>
          Back
        </button>
      </p>
      <h2>Design exercise (dev)</h2>
      <p>
        Fixture exercise: the primer&apos;s Pastebin (or Bit.ly) solution. Pick the exercise it
        plays:
      </p>
      <ul>
        {PROTOCOL_UNLOCK_PLAN.map(({ exerciseIndex, adds }) => (
          <li key={exerciseIndex}>
            <button
              type="button"
              data-testid={`open-protocol-exercise-${exerciseIndex}`}
              onClick={() => open(exerciseIndex)}
            >
              Exercise {exerciseIndex}
            </button>{' '}
            adds {adds.map(stepTitle).join(', ')}
          </li>
        ))}
      </ul>
      {error && <p role="alert">{error}</p>}
    </main>
  )
}
