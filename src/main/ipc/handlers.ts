import { app } from 'electron'
import type { LessonIpc } from '../content/lessonIpc'
import type { GenerationIpc } from '../generation/ipc'
import type { DesignIpc } from './design'
import type { QuizIpc } from './quiz'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  generation: GenerationIpc
  design: DesignIpc
  lesson: LessonIpc
  quiz: QuizIpc
}

export function createHandlers({
  generation,
  design,
  lesson,
  quiz
}: HandlerDependencies): IpcHandlers {
  return {
    'app:getVersion': () => app.getVersion(),
    'system:ping': ({ message }) => ({
      reply: `pong: ${message}`,
      receivedAt: new Date().toISOString()
    }),
    'generation:start': (request, event) => generation.start(request, event.sender),
    'generation:cancel': (request) => generation.cancel(request),
    'design:loadScene': (request) => design.loadScene(request),
    'design:saveScene': (request) => design.saveScene(request),
    'design:openScratchExercise': () => design.openScratchExercise(),
    'design:exportScene': (request) => design.exportScene(request),
    'topic:list': () => lesson.listTopics(),
    'topic:get': (request) => lesson.getTopic(request),
    'lesson:start': (request, event) => lesson.start(request, event.sender),
    'lesson:cancel': (request) => lesson.cancel(request),
    'quiz:listTopics': () => quiz.listTopics(),
    'quiz:listQuizzes': (request) => quiz.listQuizzes(request),
    'quiz:load': (request) => quiz.loadQuiz(request),
    'quiz:startRound': (request) => quiz.startRound(request),
    'quiz:submitAnswer': (request) => quiz.submitAnswer(request),
    'quiz:completeRound': (request) => quiz.completeRound(request),
    'quiz:createDevQuiz': () => quiz.createDevQuiz()
  }
}
