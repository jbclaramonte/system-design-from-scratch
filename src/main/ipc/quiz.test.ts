import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { listAttemptsByRound } from '../db/repositories/assessment'
import { createQuizService } from '../quiz/service'
import { createQuizIpc } from './quiz'

let db: Database

beforeEach(() => {
  db = openDatabase(':memory:')
  migrate(db, migrations)
})

afterEach(() => db.close())

const quizIpc = (allowDevFixture = true) =>
  createQuizIpc(db, createQuizService(db), { allowDevFixture })

describe('createQuizIpc', () => {
  it('plays the dev fixture quiz end to end', () => {
    const ipc = quizIpc()
    const { topicId, quizId } = ipc.createDevQuiz()

    expect(ipc.listQuizzes({ topicId }).map((quiz) => quiz.id)).toEqual([quizId])
    const { round, quiz } = ipc.startRound({ quizId })
    const [single, multiple, scenario] = quiz.questions
    const feedback = ipc.submitAnswer({
      roundId: round.id,
      questionId: single!.id,
      answer: { selected: [0] }
    })
    expect(feedback.result).toBe('incorrect')
    const result = ipc.completeRound({
      roundId: round.id,
      answers: [
        { questionId: multiple!.id, answer: { selected: [0, 1, 3] } },
        { questionId: scenario!.id, answer: { selected: [1] } }
      ]
    })

    expect(result.round).toMatchObject({ number: 1, passed: false })
    expect(result.round.scorePercent).toBeCloseTo(66.667, 3)
    expect(listAttemptsByRound(db, round.id)).toHaveLength(3)
  })

  it('rejects malformed requests before reaching the service', () => {
    const ipc = quizIpc()

    expect(() => ipc.listQuizzes({ topicId: 0 })).toThrow()
    expect(() => ipc.loadQuiz({ quizId: 1.5 })).toThrow()
    expect(() => ipc.startRound({ quizId: -1 })).toThrow()
    expect(() =>
      ipc.submitAnswer({ roundId: 1, questionId: 1, answer: { selected: 'all' } } as never)
    ).toThrow()
    expect(() => ipc.completeRound({ roundId: 1, answers: [{}] } as never)).toThrow()
  })

  it('refuses the dev fixture when not allowed', () => {
    expect(() => quizIpc(false).createDevQuiz()).toThrow(/only available in dev/)
  })
})
