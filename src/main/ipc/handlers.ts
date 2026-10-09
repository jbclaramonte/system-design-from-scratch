import { app } from 'electron'
import type { AboutIpc } from '../about'
import type { LessonIpc } from '../content/lessonIpc'
import type { DashboardIpc } from '../dashboard/dashboardIpc'
import type { GenerationIpc } from '../generation/ipc'
import type { MasteryIpc } from '../mastery/masteryIpc'
import type { LearningPathIpc } from '../path/pathIpc'
import type { ProtocolIpc } from '../protocol/protocolIpc'
import type { SettingsIpc } from '../settings/settingsIpc'
import type { DesignIpc } from './design'
import type { QuizIpc } from './quiz'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  about: AboutIpc
  generation: GenerationIpc
  design: DesignIpc
  lesson: LessonIpc
  quiz: QuizIpc
  mastery: MasteryIpc
  path: LearningPathIpc
  dashboard: DashboardIpc
  protocol: ProtocolIpc
  settings: SettingsIpc
}

export function createHandlers({
  about,
  generation,
  design,
  lesson,
  quiz,
  mastery,
  path,
  dashboard,
  protocol,
  settings
}: HandlerDependencies): IpcHandlers {
  return {
    'app:getVersion': () => app.getVersion(),
    'app:getAbout': () => about.get(),
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
    'mastery:choose': (request, event) => {
      const state = mastery.choose(request)
      path.notifyChanged(event.sender)
      return state
    },
    'path:get': () => path.get(),
    'dashboard:get': (request) => dashboard.get(request),
    'settings:get': () => settings.get(),
    'settings:update': (request) => settings.update(request),
    'settings:testCli': (request) => settings.testCli(request),
    'quiz:listTopics': () => quiz.listTopics(),
    'quiz:listQuizzes': (request) => quiz.listQuizzes(request),
    'quiz:load': (request) => quiz.loadQuiz(request),
    'quiz:startRound': (request) => quiz.startRound(request),
    'quiz:submitAnswer': (request) => quiz.submitAnswer(request),
    'quiz:completeRound': (request, event) => {
      const result = quiz.completeRound(request)
      // A passed round can unlock the next step of the Learning Path.
      path.notifyChanged(event.sender)
      return result
    },
    'quiz:createDevQuiz': () => quiz.createDevQuiz(),
    'quiz:submitFreeAnswer': (request, event) => quiz.submitFreeAnswer(request, event.sender),
    'quiz:contestGrade': (request, event) => quiz.contestGrade(request, event.sender),
    'quiz:cancelGrading': (request) => quiz.cancelGrading(request),
    'protocol:openDevExercise': (request) => protocol.openDevExercise(request),
    'protocol:getExercise': (request) => protocol.getExercise(request),
    'protocol:saveDraft': (request) => protocol.saveDraft(request),
    'protocol:markLessonSeen': (request) => protocol.markLessonSeen(request),
    'protocol:startStepLesson': (request, event) => protocol.startStepLesson(request, event.sender),
    'protocol:submitStep': (request, event) => protocol.submitStep(request, event.sender),
    'protocol:requestHint': (request, event) => protocol.requestHint(request, event.sender),
    'protocol:requestFinalReview': (request, event) =>
      protocol.requestFinalReview(request, event.sender),
    'protocol:cancel': (request) => protocol.cancel(request)
  }
}
