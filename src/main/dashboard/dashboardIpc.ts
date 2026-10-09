// Dashboard over IPC: the read model computed from the database on every call. The renderer
// reloads it on `path:changed`, pushed after a completed round or a Round Limit choice.
import { z } from 'zod'
import type { LearningPathDeps } from '../path/pathIpc'
import type { Dashboard, DashboardRequest } from '../../shared/dashboard'
import { buildDashboard } from './model'
import { loadDashboardSnapshot } from './queries'

// The renderer is not trusted to send well-formed requests: validate before use.
export const dashboardRequest = z
  .object({ topicId: z.number().int().positive().optional() })
  .strict()

export interface DashboardIpc {
  get(request: DashboardRequest): Dashboard
}

export function createDashboardIpc(deps: LearningPathDeps): DashboardIpc {
  return {
    get(request) {
      const { topicId } = dashboardRequest.parse(request ?? {})
      const snapshot = loadDashboardSnapshot(deps)
      if (
        topicId !== undefined &&
        !snapshot.topics.some((topic) => topic.step.topic.id === topicId)
      ) {
        throw new Error(`Topic ${topicId} is not on the Learning Path.`)
      }
      return buildDashboard(snapshot, { historyTopicId: topicId ?? null })
    }
  }
}
