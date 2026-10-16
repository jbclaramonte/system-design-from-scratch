import type { UpdateErrorCode, UpdateErrorInfo } from '../../shared/update'

/** A failed update step; the message is written for the learner. */
export class UpdateError extends Error {
  readonly code: UpdateErrorCode

  constructor(code: UpdateErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UpdateError'
    this.code = code
  }
}

export function toErrorInfo(error: unknown): UpdateErrorInfo {
  if (error instanceof UpdateError) return { code: error.code, message: error.message }
  const detail = error instanceof Error ? error.message : String(error)
  return { code: 'unknown', message: `The update failed unexpectedly: ${detail}` }
}
