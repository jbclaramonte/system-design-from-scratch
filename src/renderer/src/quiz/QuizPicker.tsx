import { useCallback, useEffect, useState } from 'react'
import type { QuizSummary, QuizTopic } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'

/** Picks a topic, then one of its quizzes. In dev, creates a fixture quiz to play. */
export function QuizPicker({ onStart }: { onStart: (quizId: number) => void }) {
  const [topics, setTopics] = useState<QuizTopic[] | null>(null)
  const [topicId, setTopicId] = useState<number | null>(null)
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Bumped to reload the quiz list when a quiz is added to the selected topic.
  const [quizListVersion, setQuizListVersion] = useState(0)

  const loadTopics = useCallback(
    (select?: number) =>
      window.api
        .listQuizTopics()
        .then((list) => {
          setTopics(list)
          setTopicId(
            (current) => select ?? current ?? list.find((t) => t.quizCount > 0)?.id ?? null
          )
        })
        .catch((reason: unknown) => setError(errorMessage(reason))),
    []
  )

  useEffect(() => {
    void loadTopics()
  }, [loadTopics])

  useEffect(() => {
    if (topicId === null) return
    let current = true
    window.api
      .listQuizzes({ topicId })
      .then((list) => current && setQuizzes(list))
      .catch((reason: unknown) => setError(errorMessage(reason)))
    return () => {
      current = false
    }
  }, [topicId, quizListVersion])

  const createDevQuiz = () => {
    window.api
      .createDevQuiz()
      .then(({ topicId: created }) => {
        setQuizListVersion((version) => version + 1)
        return loadTopics(created)
      })
      .catch((reason: unknown) => setError(errorMessage(reason)))
  }

  const withQuizzes = topics?.filter((topic) => topic.quizCount > 0) ?? []

  return (
    <section data-testid="quiz-picker">
      <h2>Choose a quiz</h2>
      {error && <p role="alert">{error}</p>}
      {topics === null ? (
        <p>Loading...</p>
      ) : withQuizzes.length === 0 ? (
        <p>No quiz yet. Quizzes are generated from a topic&apos;s lesson.</p>
      ) : (
        <p>
          <label>
            Topic{' '}
            <select
              data-testid="quiz-topic"
              value={topicId ?? ''}
              onChange={(e) => setTopicId(Number(e.target.value))}
            >
              {withQuizzes.map((topic) => (
                <option key={topic.id} value={topic.id}>
                  {topic.title} ({topic.quizCount})
                </option>
              ))}
            </select>
          </label>
        </p>
      )}
      {topicId !== null && quizzes && (
        <ul data-testid="quiz-list" style={{ listStyle: 'none', padding: 0 }}>
          {quizzes.map((quiz) => (
            <li key={quiz.id} style={{ marginBottom: 8 }}>
              <button data-testid={`start-quiz-${quiz.id}`} onClick={() => onStart(quiz.id)}>
                Quiz #{quiz.id}
              </button>{' '}
              {quiz.questionCount} questions
              {quiz.gradableQuestionCount < quiz.questionCount &&
                ` (${quiz.questionCount - quiz.gradableQuestionCount} not graded)`}
              , {quiz.grounded ? 'grounded' : 'ungrounded'},{' '}
              {new Date(quiz.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
      {import.meta.env.DEV && (
        <p>
          <button data-testid="create-dev-quiz" onClick={createDevQuiz}>
            Create fixture quiz (dev)
          </button>
        </p>
      )}
    </section>
  )
}
