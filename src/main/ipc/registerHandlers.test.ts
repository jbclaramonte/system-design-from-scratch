import type { IpcMainInvokeEvent } from 'electron'
import { describe, expect, it } from 'vitest'
import { createApi } from '../../shared/ipc'
import { registerHandlers, type IpcHandlers, type IpcMainLike } from './registerHandlers'

type Listener = (event: IpcMainInvokeEvent, request: unknown) => unknown

function fakeIpcMain(): IpcMainLike & { listeners: Map<string, Listener> } {
  const listeners = new Map<string, Listener>()
  return {
    listeners,
    handle(channel, listener) {
      listeners.set(channel, listener)
    }
  }
}

const handlers: IpcHandlers = {
  'app:getVersion': () => '1.2.3',
  'system:ping': ({ message }) => ({ reply: `pong: ${message}`, receivedAt: 'now' }),
  'generation:start': () => undefined,
  'generation:cancel': () => undefined,
  'design:loadScene': () => null,
  'design:saveScene': () => undefined,
  'design:openScratchExercise': () => ({ id: 1, slug: 'dev-scratch', title: 'Scratch' }),
  'design:exportScene': () => ({
    nodes: 0,
    edges: 0,
    annotations: 0,
    danglingArrows: 0,
    groups: 0,
    pngBytes: 0
  }),
  'topic:list': () => [],
  'topic:get': () => {
    throw new Error('no topic')
  },
  'lesson:start': () => undefined,
  'lesson:cancel': () => undefined,
  'mastery:listTopics': () => [],
  'mastery:getState': () => {
    throw new Error('no topic')
  },
  'mastery:startRound': () => undefined,
  'mastery:startRemediation': () => undefined,
  'mastery:cancel': () => undefined,
  'mastery:choose': () => {
    throw new Error('no topic')
  },
  'settings:get': () => ({
    masteryThreshold: 100,
    roundLimit: 3,
    questionsPerQuiz: null,
    claudeCliPath: null
  }),
  'settings:update': () => {
    throw new Error('invalid')
  },
  'settings:testCli': async () => ({ ok: true, path: '/x/claude', version: '1.0.0' }),
  'quiz:listTopics': () => [],
  'quiz:listQuizzes': () => [],
  'quiz:load': () => {
    throw new Error('no quiz')
  },
  'quiz:startRound': () => {
    throw new Error('no quiz')
  },
  'quiz:submitAnswer': () => {
    throw new Error('no round')
  },
  'quiz:completeRound': () => {
    throw new Error('no round')
  },
  'quiz:createDevQuiz': () => ({ topicId: 1, quizId: 1 }),
  'quiz:submitFreeAnswer': async () => {
    throw new Error('no round')
  },
  'quiz:contestGrade': async () => {
    throw new Error('no round')
  },
  'quiz:cancelGrading': () => undefined
}

describe('registerHandlers', () => {
  it('registers one listener per channel', () => {
    const ipc = fakeIpcMain()

    registerHandlers(ipc, handlers)

    expect([...ipc.listeners.keys()].sort()).toEqual([
      'app:getVersion',
      'design:exportScene',
      'design:loadScene',
      'design:openScratchExercise',
      'design:saveScene',
      'generation:cancel',
      'generation:start',
      'lesson:cancel',
      'lesson:start',
      'mastery:cancel',
      'mastery:choose',
      'mastery:getState',
      'mastery:listTopics',
      'mastery:startRemediation',
      'mastery:startRound',
      'quiz:cancelGrading',
      'quiz:completeRound',
      'quiz:contestGrade',
      'quiz:createDevQuiz',
      'quiz:listQuizzes',
      'quiz:listTopics',
      'quiz:load',
      'quiz:startRound',
      'quiz:submitAnswer',
      'quiz:submitFreeAnswer',
      'settings:get',
      'settings:testCli',
      'settings:update',
      'system:ping',
      'topic:get',
      'topic:list'
    ])
  })

  it('round-trips a typed call from createApi to the handler', async () => {
    const ipc = fakeIpcMain()
    registerHandlers(ipc, handlers)
    const event = {} as IpcMainInvokeEvent
    const api = createApi(
      async (channel, request) => ipc.listeners.get(channel)?.(event, request),
      () => () => {}
    )

    await expect(api.getAppVersion()).resolves.toBe('1.2.3')
    await expect(api.ping({ message: 'hello' })).resolves.toEqual({
      reply: 'pong: hello',
      receivedAt: 'now'
    })
  })
})
