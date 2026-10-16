// "Check for updates..." in the application menu: the same check as the Settings button (the
// service's `check`), whose result is pushed to the windows on `update:checked`.
import type { UpdateCheckResult } from '../../shared/update'
import { toErrorInfo } from './errors'

export interface MenuCheckDeps {
  /** `UpdateService.check`: always asks GitHub and records the answer. */
  check: () => Promise<UpdateCheckResult>
  /** Brings a window forward and sends it the result. */
  publish: (result: UpdateCheckResult) => void
}

export function createMenuCheck({ check, publish }: MenuCheckDeps): () => Promise<void> {
  return async () => {
    let result: UpdateCheckResult
    try {
      result = await check()
    } catch (error) {
      result = { status: 'error', error: toErrorInfo(error) }
    }
    publish(result)
  }
}
