// Fake `claude` CLI for the Generation tests. Run by plain Node (type stripping), never bundled.
// Emits stream-json events shaped like the real CLI's (docs/spikes/cli-latency.md). The scenario
// is read from the prompt on stdin: `scenario:<name>`. Every call is logged as one JSON line to
// $FAKE_CLAUDE_LOG (argv, cwd and its entries, stdin, pid).
import { appendFileSync, readdirSync } from 'node:fs'
import process from 'node:process'

const SESSION = '00000000-0000-4000-8000-000000000000'
const usage = {
  input_tokens: 3,
  cache_creation_input_tokens: 605,
  cache_read_input_tokens: 0,
  output_tokens: 12
}

const write = (event: object) => process.stdout.write(`${JSON.stringify(event)}\n`)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const streamEvent = (event: object) =>
  write({ type: 'stream_event', event, session_id: SESSION, parent_tool_use_id: null })

function init() {
  write({
    type: 'system',
    subtype: 'init',
    cwd: process.cwd(),
    session_id: SESSION,
    tools: [],
    mcp_servers: [],
    model: 'claude-sonnet-5-5',
    permissionMode: 'default',
    slash_commands: [],
    apiKeySource: 'none',
    claude_code_version: '2.1.294',
    output_style: 'default'
  })
  write({ type: 'system', subtype: 'status', status: 'requesting', session_id: SESSION })
  streamEvent({
    type: 'message_start',
    message: {
      model: 'claude-sonnet-5-5',
      id: 'msg_fake',
      type: 'message',
      role: 'assistant',
      content: [],
      usage
    }
  })
}

async function text(chunks: string[], gapMs = 0) {
  streamEvent({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } })
  for (const chunk of chunks) {
    streamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: chunk }
    })
    if (gapMs) await sleep(gapMs)
  }
  streamEvent({ type: 'content_block_stop', index: 0 })
}

function structured(value: unknown) {
  const json = JSON.stringify(value)
  streamEvent({
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'tool_use', id: 'toolu_fake', name: 'StructuredOutput', input: {} }
  })
  for (let i = 0; i < json.length; i += 12) {
    streamEvent({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: json.slice(i, i + 12) }
    })
  }
  streamEvent({ type: 'content_block_stop', index: 0 })
}

function end(result: string, extra: object = {}) {
  streamEvent({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage })
  streamEvent({ type: 'message_stop' })
  write({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' }, session_id: SESSION })
  write({
    type: 'result',
    subtype: 'success',
    is_error: false,
    duration_ms: 1614,
    duration_api_ms: 700,
    num_turns: 1,
    result,
    stop_reason: 'end_turn',
    session_id: SESSION,
    total_cost_usd: 0.0001232,
    usage,
    permission_denials: [],
    ...extra
  })
}

/** Failure as observed for a bad model: `subtype` says success, `is_error` is true, exit 1. */
function fail(message: string, stderr: string) {
  write({
    type: 'result',
    subtype: 'success',
    is_error: true,
    duration_ms: 1900,
    duration_api_ms: 0,
    num_turns: 1,
    result: message,
    session_id: SESSION,
    total_cost_usd: 0,
    usage: { input_tokens: 0, output_tokens: 0 }
  })
  process.stderr.write(`${stderr}\n`)
  process.exitCode = 1
}

const validQuiz = { questions: [{ prompt: 'Q?', choices: ['a', 'b'], correct: [0] }] }
// A free-answer grading of a question with one expected point.
const validGrading = {
  verdict: 'correct',
  expectedPoints: [{ covered: true, justification: 'La réponse parle des données périmées.' }],
  misconceptions: [],
  explanation: 'Bien vu : le TTL limite la durée d’une donnée périmée.',
  toReview: []
}

/**
 * Design Feedback, by the `--json-schema` it gets: step feedback (one checklist verdict per item),
 * a Hint, or a final review. `leak`: step feedback that names reference items (expiration,
 * availability), unless the prompt carries the leak guard's retry note and `leak` is `once`.
 */
function designFeedback(leak: 'none' | 'once' | 'always' = 'none') {
  const schemaArg = process.argv[process.argv.indexOf('--json-schema') + 1] ?? '{}'
  const schema = JSON.parse(schemaArg) as {
    properties?: { checklist?: { minItems?: number }; hint?: object; strengths?: object }
  }
  if (schema.properties?.hint) return { hint: 'Que se passe-t-il quand un paste a expiré ?' }
  if (schema.properties?.strengths) {
    return {
      summary: 'Une conception simple et cohérente.',
      strengths: ['Les cas d’usage principaux sont couverts.'],
      gapsVsReference: ['Le contenu des pastes n’est pas séparé des métadonnées.'],
      tradeOffsToDiscuss: ['SQL ou NoSQL pour la table des liens.'],
      nextTime: ['Chiffrer le trafic avant de dessiner.']
    }
  }
  const items = schema.properties?.checklist?.minItems ?? 1
  const leaking =
    leak === 'always' || (leak === 'once' && !stdin.includes('previous feedback named'))
  return {
    checklist: Array.from({ length: items }, (_, i) => ({
      verdict: i === 0 ? 'met' : 'partial',
      comment: `Point ${i + 1} : à préciser.`
    })),
    summary: 'Un bon début, mais il manque des cas limites.',
    gaps: leaking
      ? [
          'Tu ne dis pas ce qui se passe quand un lien expire.',
          'Tu ne précises pas le hors périmètre.'
        ]
      : ['Tu ne précises pas les cas limites de tes cas d’usage.'],
    errors: [],
    forgottenTradeOffs: leaking ? ['Disponibilité contre cohérence pour les lectures.'] : [],
    nextStep: 'Précise les cas limites avant de passer au schéma.'
  }
}

let stdin = ''
process.stdin.setEncoding('utf8')
for await (const chunk of process.stdin) stdin += chunk

// `--input-format stream-json`: one user message with image and text blocks. The text is used as
// the prompt below; the image blocks are counted in the log.
let images = 0
if (process.argv.includes('--input-format')) {
  const message = JSON.parse(stdin) as {
    message: { content: { type: string; text?: string; source?: { media_type: string } }[] }
  }
  images = message.message.content.filter((block) => block.type === 'image').length
  stdin = message.message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

if (process.env['FAKE_CLAUDE_LOG']) {
  appendFileSync(
    process.env['FAKE_CLAUDE_LOG'],
    `${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), cwdEntries: readdirSync(process.cwd()), stdin, images, pid: process.pid, configDir: process.env['CLAUDE_CONFIG_DIR'] ?? null })}\n`
  )
}

/**
 * Lessons with Mermaid Diagrams (`diagram-lesson-<mode>`): one valid block, then two that fail the
 * renderer checks (HTML in a label, an unsupported type). The lead-in sentences carry
 * `mode:<mode>`, which the repair call sees: `fixable` gets valid sources back, `broken` sources
 * that still fail. `diagram-lesson-valid` only has valid blocks.
 */
const diagramLesson = (mode: string) =>
  mode === 'valid'
    ? '# Cache\n\nLe flux :\n\n```mermaid\nflowchart LR\n  C[Client] -->|requête| S[Serveur]\n```\n\nFin.'
    : [
        '# Cache',
        '',
        'Le flux :',
        '',
        '```mermaid',
        'flowchart LR',
        '  C[Client] -->|requête| S[Serveur]',
        '```',
        '',
        `Le cache, mode:${mode}.`,
        '```mermaid',
        'flowchart LR',
        '  S[Serveur<br>web] --> K[Cache]',
        '```',
        '',
        `La répartition, mode:${mode}.`,
        '',
        '```mermaid',
        'pie',
        '  "hit" : 80',
        '```',
        '',
        'Fin.'
      ].join('\n')

function diagramRepair() {
  const mode = /mode:(\w+)/.exec(stdin)?.[1] ?? 'fixable'
  const ids = [...stdin.matchAll(/<diagram id="(\d+)">/g)].map((match) => Number(match[1]))
  return {
    diagrams: ids.map((id) => ({
      id,
      source:
        mode === 'fixable'
          ? `\`\`\`mermaid\nflowchart LR\n  S["Serveur web"] -->|lecture ${id}| K[Cache]\n\`\`\``
          : 'flowchart LR\n  S[Serveur<br>web] --> K[Cache]'
    }))
  }
}

const jsonSchemaArg = process.argv.includes('--json-schema')
  ? process.argv[process.argv.indexOf('--json-schema') + 1]!
  : null
const isDiagramRepair = jsonSchemaArg !== null && jsonSchemaArg.includes('"diagrams"')

const scenario = isDiagramRepair
  ? 'diagram-repair'
  : (/scenario:([\w-]+)/.exec(stdin)?.[1] ?? 'text')
const isRetry = stdin.includes('previous output was invalid')

switch (scenario) {
  case 'text':
    init()
    await text(['Bonjour', ', le cache', ' en bref.'])
    end('Bonjour, le cache en bref.')
    break
  case 'garbage':
    process.stdout.write('not json at all\n{"type":"unknown_future_event"}\n')
    init()
    await text(['ok'])
    end('ok')
    break
  case 'slow':
  case 'stubborn':
    if (scenario === 'stubborn') process.on('SIGTERM', () => {})
    init()
    await text(
      Array.from({ length: 400 }, (_, i) => `chunk${i} `),
      50
    )
    end('too late')
    break
  case 'linger':
    init()
    await text(['done'])
    end('done')
    await sleep(60_000)
    break
  case 'diagram-lesson-valid':
  case 'diagram-lesson-fixable':
  case 'diagram-lesson-broken': {
    const lesson = diagramLesson(scenario.slice('diagram-lesson-'.length))
    init()
    await text([lesson.slice(0, 40), lesson.slice(40)])
    end(lesson)
    break
  }
  case 'diagram-repair': {
    const output = diagramRepair()
    init()
    structured(output)
    end('', { structured_output: output })
    break
  }
  case 'json':
    init()
    structured(validQuiz)
    end('', { structured_output: validQuiz })
    break
  case 'grading':
    init()
    structured(validGrading)
    end('', { structured_output: validGrading })
    break
  case 'design':
  case 'design-leak-once':
  case 'design-leak-always': {
    const output = designFeedback(
      scenario === 'design' ? 'none' : scenario === 'design-leak-once' ? 'once' : 'always'
    )
    init()
    structured(output)
    end('', { structured_output: output })
    break
  }
  case 'json-invalid-once':
    init()
    structured(isRetry ? validQuiz : { questions: 'nope' })
    end('', { structured_output: isRetry ? validQuiz : { questions: 'nope' } })
    break
  case 'json-invalid-always':
    init()
    structured({ questions: [] })
    end('', { structured_output: { questions: [] } })
    break
  case 'json-in-text':
    init()
    await text(['```json\n', JSON.stringify(validQuiz), '\n```'])
    end(`\`\`\`json\n${JSON.stringify(validQuiz)}\n\`\`\``)
    break
  case 'empty':
    init()
    end('')
    break
  case 'bad-model':
    init()
    fail(
      "There's an issue with the selected model (definitely-not-a-model). It may not exist or you may not have access to it. Run --model to pick a different model.",
      '[claude-code:unrecognized_model]'
    )
    break
  case 'not-logged-in':
    fail('Not logged in · Please run /login', '')
    break
  case 'oauth-expired':
    fail('Failed to authenticate: OAuth session expired and could not be refreshed', '')
    break
  case 'rate-limit':
    init()
    fail('Claude AI usage limit reached|1760000000', '')
    break
  case 'no-result':
    init()
    await text(['partial'])
    break
  case 'crash':
    process.stderr.write('Error: something exploded\n')
    process.exitCode = 2
    break
  default:
    process.stderr.write(`unknown fake scenario ${scenario}\n`)
    process.exitCode = 3
}
