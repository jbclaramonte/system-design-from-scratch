// Parser for the CLI's `--output-format stream-json --include-partial-messages` NDJSON output.
// Shapes measured in the CLI latency spike (docs/spikes/cli-latency.md). Unknown events and
// unparsable lines are ignored: the event surface is a CLI internal that can change.

export interface CliResult {
  isError: boolean
  subtype: string | null
  /** Final text (or error message when `isError`). */
  text: string
  /** Set when the run used `--json-schema`. */
  structuredOutput: unknown
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | null
}

export type CliEvent =
  | { type: 'init' }
  /** Streamed text (`text_delta`). */
  | { type: 'text_delta'; text: string }
  /** Partial JSON of the hidden structured output tool call (`input_json_delta`). */
  | { type: 'json_delta'; partialJson: string }
  | { type: 'result'; result: CliResult }

type Obj = Record<string, unknown>

const isObj = (value: unknown): value is Obj =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null)

/** Parses one NDJSON line. Returns undefined for lines that are not an event we use. */
export function parseStreamLine(line: string): CliEvent | undefined {
  if (!line.trim()) return undefined
  let raw: unknown
  try {
    raw = JSON.parse(line)
  } catch {
    return undefined
  }
  if (!isObj(raw)) return undefined

  if (raw['type'] === 'system' && raw['subtype'] === 'init') return { type: 'init' }

  if (raw['type'] === 'stream_event' && isObj(raw['event'])) {
    const event = raw['event']
    if (event['type'] !== 'content_block_delta' || !isObj(event['delta'])) return undefined
    const delta = event['delta']
    if (delta['type'] === 'text_delta' && typeof delta['text'] === 'string') {
      return { type: 'text_delta', text: delta['text'] }
    }
    if (delta['type'] === 'input_json_delta' && typeof delta['partial_json'] === 'string') {
      return { type: 'json_delta', partialJson: delta['partial_json'] }
    }
    return undefined
  }

  if (raw['type'] === 'result') {
    const usage = isObj(raw['usage']) ? raw['usage'] : {}
    return {
      type: 'result',
      result: {
        // `subtype` can say "success" while `is_error` is true: trust `is_error`.
        isError: raw['is_error'] === true,
        subtype: typeof raw['subtype'] === 'string' ? raw['subtype'] : null,
        text: typeof raw['result'] === 'string' ? raw['result'] : '',
        structuredOutput: raw['structured_output'],
        inputTokens: num(usage['input_tokens']),
        outputTokens: num(usage['output_tokens']),
        costUsd: num(raw['total_cost_usd'])
      }
    }
  }

  return undefined
}

/** Splits a chunked stream into lines; call `push` per chunk and `flush` at the end. */
export function createLineSplitter(onLine: (line: string) => void) {
  let buffer = ''
  return {
    push(chunk: string) {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf('\n')) >= 0) {
        onLine(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
      }
    },
    flush() {
      if (buffer) onLine(buffer)
      buffer = ''
    }
  }
}
