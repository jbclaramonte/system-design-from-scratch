import { useCallback, useEffect, useState } from 'react'
import type { QuizSummary, QuizTopic } from '../../../shared/quiz'
import { errorMessage } from './errorMessage'
import './quiz.css'

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
    <section className="reading-column quiz-picker" data-testid="quiz-picker">
      <h2>Choose a quiz</h2>
      {error && <p role="alert">{error}</p>}
      {topics === null ? (
        <p className="muted">Loading...</p>
      ) : withQuizzes.length === 0 ? (
        <p className="quiz-empty">No quiz yet. Quizzes are generated from a topic&apos;s lesson.</p>
      ) : (
        <label className="quiz-picker-field">
          <span className="label-caps">Topic</span>
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
      )}
      {topicId !== null && quizzes && (
        <ul className="quiz-list" data-testid="quiz-list">
          {quizzes.map((quiz) => (
            <li key={quiz.id} className="card quiz-list-item">
              <div className="quiz-list-main">
                <h3 className="quiz-list-title">Quiz #{quiz.id}</h3>
                <div className="quiz-list-meta">
                  <span className="label-mono muted">
                    {quiz.questionCount} questions
                    {quiz.gradableQuestionCount < quiz.questionCount &&
                      ` (${quiz.questionCount - quiz.gradableQuestionCount} not graded)`}
                  </span>
                  <span className={`chip ${quiz.grounded ? 'chip-progress' : 'chip-attention'}`}>
                    {quiz.grounded ? 'grounded' : 'ungrounded'}
                  </span>
                  <span className="label-mono faint">
                    {new Date(quiz.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>
              <button
                className="btn-primary"
                data-testid={`start-quiz-${quiz.id}`}
                onClick={() => onStart(quiz.id)}
              >
                Start quiz #{quiz.id}
              </button>
            </li>
          ))}
        </ul>
      )}
      {import.meta.env.DEV && (
        <div className="quiz-actions">
          <button data-testid="create-dev-quiz" onClick={createDevQuiz}>
            Create fixture quiz (dev)
          </button>
        </div>
      )}
    </section>
  )
}
