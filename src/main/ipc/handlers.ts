import { app } from 'electron'
import type { AboutIpc } from '../about'
import type { LessonIpc } from '../content/lessonIpc'
import type { DashboardIpc } from '../dashboard/dashboardIpc'
import type { GenerationIpc } from '../generation/ipc'
import type { LessonQuestionIpc } from '../lessonQuestion'
import type { MasteryIpc } from '../mastery/masteryIpc'
import type { LearningPathIpc } from '../path/pathIpc'
import type { ProtocolIpc } from '../protocol/protocolIpc'
import type { FirstRunIpc } from '../settings/firstRunIpc'
import type { SettingsIpc } from '../settings/settingsIpc'
import type { UpdateIpc } from '../update'
import type { DesignIpc } from './design'
import type { QuizIpc } from './quiz'
import type { IpcHandlers } from './registerHandlers'

export interface HandlerDependencies {
  about: AboutIpc
  generation: GenerationIpc
  design: DesignIpc
  lesson: LessonIpc
  lessonQuestion: LessonQuestionIpc
  quiz: QuizIpc
  mastery: MasteryIpc
  path: LearningPathIpc
  dashboard: DashboardIpc
  protocol: ProtocolIpc
  firstRun: FirstRunIpc
  settings: SettingsIpc
  update: UpdateIpc
}

export function createHandlers({
  about,
  generation,
  design,
  lesson,
  lessonQuestion,
  quiz,
  mastery,
  path,
  dashboard,
  protocol,
  firstRun,
  settings,
  update
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
    'lessonQuestion:ask': (request, event) => lessonQuestion.ask(request, event.sender),
    'lessonQuestion:cancel': (request) => lessonQuestion.cancel(request),
    'mastery:listTopics': () => mastery.listTopics(),
    'mastery:getState': (request) => mastery.getState(request),
    'mastery:getLessonReview': (request) => mastery.getLessonReview(request),
    'mastery:startRound': (request, event) => mastery.startRound(request, event.sender),
    'mastery:startRemediation': (request, event) => mastery.startRemediation(request, event.sender),
    'mastery:cancel': (request) => mastery.cancel(request),
    'mastery:choose': (request, event) => {
      const state = mastery.choose(request)
      path.notifyChanged(event.sender)
      return state
    },
    'mastery:declare': (request, event) => {
      const state = mastery.declare(request)
      path.notifyChanged(event.sender)
      return state
    },
    'mastery:undoDeclaration': (request, event) => {
      const state = mastery.undoDeclaration(request)
      path.notifyChanged(event.sender)
      return state
    },
    'path:get': () => path.get(),
    'path:forceUnlock': (request, event) => {
      const result = path.forceUnlock(request)
      path.notifyChanged(event.sender)
      return result
    },
    'path:lockAgain': (request, event) => {
      const result = path.lockAgain(request)
      path.notifyChanged(event.sender)
      return result
    },
    'dashboard:get': (request) => dashboard.get(request),
    'firstRun:get': () => firstRun.get(),
    'firstRun:chooseLanguage': (request) => firstRun.chooseLanguage(request),
    'settings:get': () => settings.get(),
    'settings:update': (request) => settings.update(request),
    'settings:testCli': (request) => settings.testCli(request),
    'update:check': () => update.check(),
    'update:pending': () => update.pending(),
    'update:install': (request, event) => update.install(request, event.sender),
    'update:dismiss': (request) => update.dismiss(request),
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
    'quiz:clarifyQuestion': (request, event) => quiz.clarifyQuestion(request, event.sender),
    'quiz:cancelClarification': (request) => quiz.cancelClarification(request),
    'quiz:flagQuestion': (request) => quiz.flagQuestion(request),
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
