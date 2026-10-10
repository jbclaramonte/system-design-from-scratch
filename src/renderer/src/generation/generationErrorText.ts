import type { GenerationErrorCode } from '../../../shared/generation'

/**
 * Code of an error shown by `GenerationErrorView`: a Generation error code, or `refused` when the
 * main process refused the call itself (its message is already a plain sentence).
 */
export type DisplayedErrorCode = GenerationErrorCode | 'refused'

export interface GenerationErrorText {
  title: string
  /** One or two plain sentences: what happened and what to do. */
  advice: string
  /** Settings can fix it (CLI path, Claude config directory): offer "Open Settings". */
  openSettings: boolean
}

const texts: Record<GenerationErrorCode, GenerationErrorText> = {
  cli_not_found: {
    title: 'Claude Code CLI not found',
    advice:
      'The app could not start the Claude Code CLI. Install it, or set its path in Settings, then retry.',
    openSettings: true
  },
  not_logged_in: {
    title: 'Claude Code is not logged in',
    advice:
      'Retry will fail until the CLI is logged in for the profile the app uses. Log in with the CLI, or pick a logged-in profile in Settings, then retry.',
    openSettings: true
  },
  quota_or_rate_limit: {
    title: 'Claude usage limit reached',
    advice: 'Your Claude plan hit its usage or rate limit. Wait until it resets, then retry.',
    openSettings: false
  },
  bad_model: {
    title: 'Model not available',
    advice:
      'The Claude model the app asks for is not available to this account. Update the Claude Code CLI or check your plan, then retry.',
    openSettings: false
  },
  timeout: {
    title: 'The generation took too long',
    advice:
      'Claude did not finish in time and the request was stopped. This is often temporary: retry.',
    openSettings: false
  },
  invalid_output: {
    title: 'The generated content was invalid',
    advice:
      'Claude returned content the app could not use, even after an automatic second try. Retry to generate it again.',
    openSettings: false
  },
  cancelled: {
    title: 'Generation cancelled',
    advice: 'You cancelled it. Retry to start again.',
    openSettings: false
  },
  topic_locked: {
    title: 'This topic is locked on the Learning Path',
    advice: 'Master the previous topic of the Learning Path first, then come back to this one.',
    openSettings: false
  },
  unknown: {
    title: 'The generation failed',
    advice:
      'Something unexpected went wrong. Retry; if it keeps failing, the technical details tell what happened.',
    openSettings: false
  }
}

/** Title and advice of an error. A `refused` call keeps its own message as the advice. */
export function generationErrorText(code: DisplayedErrorCode, message = ''): GenerationErrorText {
  if (code === 'refused') {
    return { title: 'This action is not possible now', advice: message, openSettings: false }
  }
  return texts[code]
}

/** Longest raw message shown in the "Technical details" disclosure. */
export const MAX_DETAILS_LENGTH = 2000

/**
 * The raw message for the "Technical details" disclosure, cut to `max` characters with a note
 * saying how much was left out (the full text is in the console).
 */
export function truncateDetails(raw: string, max: number = MAX_DETAILS_LENGTH): string {
  const text = raw.trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… ${text.length - max} more characters (full text in the developer console)`
}
