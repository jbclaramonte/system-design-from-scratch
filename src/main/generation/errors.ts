import type { GenerationErrorCode, GenerationErrorInfo } from '../../shared/generation'

const defaultMessages: Record<GenerationErrorCode, string> = {
  cli_not_found:
    'Claude Code CLI not found. Install it (https://docs.claude.com/en/docs/claude-code) or set its path in the settings.',
  not_logged_in: 'Claude Code is not logged in. Run `claude` in a terminal and log in, then retry.',
  quota_or_rate_limit:
    'Claude usage limit or rate limit reached. Wait for the limit to reset, then retry.',
  bad_model: 'The configured model is not available. Pick another model in the settings.',
  timeout: 'The generation took too long and was stopped. Retry.',
  invalid_output: 'The generated content was invalid twice in a row. Retry.',
  cancelled: 'The generation was cancelled.',
  topic_locked: 'This topic is locked. Master the previous step of the Learning Path first.',
  unknown: 'The generation failed. Retry.'
}

export class GenerationError extends Error {
  readonly code: GenerationErrorCode

  constructor(code: GenerationErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? defaultMessages[code], options)
    this.name = 'GenerationError'
    this.code = code
  }

  toInfo(): GenerationErrorInfo {
    return { code: this.code, message: this.message }
  }
}

export function toGenerationError(error: unknown): GenerationError {
  if (error instanceof GenerationError) return error
  return new GenerationError('unknown', undefined, { cause: error })
}

// Matched against the result text and stderr of a failed CLI run. Only the bad model shape was
// observed in the spike (docs/spikes/cli-latency.md); the others are best-effort patterns.
const failurePatterns: [GenerationErrorCode, RegExp][] = [
  ['bad_model', /unrecognized_model|issue with the selected model|model .*(not found|not exist)/i],
  [
    'not_logged_in',
    /not logged in|please run \/login|\/login|invalid api key|authentication_error|oauth token|unauthorized|\b401\b/i
  ],
  [
    'quota_or_rate_limit',
    /rate.?limit|usage limit|limit reached|quota|\b429\b|overloaded|credit balance/i
  ]
]

/** Maps a failed CLI run (`is_error` result or non-zero exit) to an error code. */
export function classifyCliFailure(text: string): GenerationErrorCode {
  for (const [code, pattern] of failurePatterns) {
    if (pattern.test(text)) return code
  }
  return 'unknown'
}

/** Error for a failed CLI run, keeping the CLI's own message after the actionable one. */
export function cliFailure(text: string): GenerationError {
  const code = classifyCliFailure(text)
  const detail = text.trim().slice(0, 500)
  return new GenerationError(code, detail ? `${defaultMessages[code]} (${detail})` : undefined)
}
