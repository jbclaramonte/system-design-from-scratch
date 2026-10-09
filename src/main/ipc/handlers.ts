import { app } from 'electron'
import type { LessonIpc } from '../content/lessonIpc'
import type { GenerationIpc } from '../generation/ipc'
import type { MasteryIpc } from '../mastery/masteryIpc'
import type { SettingsIpc } from '../settings/settingsIpc'
import type { DesignIpc } from './design'
import type { QuizIpc } from './quiz'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  generation: GenerationIpc
  design: DesignIpc
  lesson: LessonIpc
  quiz: QuizIpc
  mastery: MasteryIpc
  settings: SettingsIpc
}

export function createHandlers({
  generation,
  design,
  lesson,
  quiz,
  mastery,
  settings
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
    'mastery:listTopics': () => mastery.listTopics(),
    'mastery:getState': (request) => mastery.getState(request),
    'mastery:startRound': (request, event) => mastery.startRound(request, event.sender),
    'mastery:startRemediation': (request, event) => mastery.startRemediation(request, event.sender),
    'mastery:cancel': (request) => mastery.cancel(request),
    'mastery:choose': (request) => mastery.choose(request),
    'settings:get': () => settings.get(),
    'settings:update': (request) => settings.update(request),
    'settings:testCli': (request) => settings.testCli(request),
    'quiz:listTopics': () => quiz.listTopics(),
    'quiz:listQuizzes': (request) => quiz.listQuizzes(request),
    'quiz:load': (request) => quiz.loadQuiz(request),
    'quiz:startRound': (request) => quiz.startRound(request),
    'quiz:submitAnswer': (request) => quiz.submitAnswer(request),
    'quiz:completeRound': (request) => quiz.completeRound(request),
    'quiz:createDevQuiz': () => quiz.createDevQuiz(),
    'quiz:submitFreeAnswer': (request, event) => quiz.submitFreeAnswer(request, event.sender),
    'quiz:contestGrade': (request, event) => quiz.contestGrade(request, event.sender),
    'quiz:cancelGrading': (request) => quiz.cancelGrading(request)
  }
}
