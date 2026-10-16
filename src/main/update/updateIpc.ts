// App Update over IPC: check, pending, install and dismiss (zod-validated), and the
// `update:available` push.
import { z } from 'zod'
import type {
  UpdateCheckResult,
  UpdateInfo,
  UpdateInstallResult,
  UpdateProgress,
  UpdateVersionRequest
} from '../../shared/update'
import { sendEvent, type IpcEventTarget } from '../ipc/sendEvent'
import type { UpdateService } from './service'
import { parseVersion } from './version'

const versionRequest = z
  .object({ version: z.string().refine((version) => parseVersion(version) !== null) })
  .strict()

export interface UpdateIpc {
  check(): Promise<UpdateCheckResult>
  pending(): UpdateInfo | null
  install(request: UpdateVersionRequest, sender: IpcEventTarget): Promise<UpdateInstallResult>
  dismiss(request: UpdateVersionRequest): void
}

export function createUpdateIpc(service: UpdateService): UpdateIpc {
  return {
    check: () => service.check(),
    pending: () => service.pending(),
    install(request, sender) {
      const { version } = versionRequest.parse(request)
      return service.install(version, (progress: UpdateProgress) =>
        sendEvent(sender, 'update:progress', progress)
      )
    },
    dismiss(request) {
      service.dismiss(versionRequest.parse(request).version)
    }
  }
}
