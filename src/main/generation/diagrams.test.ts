import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { getCachedContent } from '../db/repositories/contentCache'
import {
  buildDiagramRepairCall,
  diagramFailureMarker,
  dropUnparsableQuizDiagrams,
  findDiagramFailures,
  findMermaidBlocks,
  parseDiagramSource,
  repairDiagrams,
  repairDiagramsInMarkdown,
  validateDiagramsInMarkdown
} from './diagrams'
import { GenerationError } from './errors'
import { DIAGRAM_RULES } from './prompts/common'
import { GenerationService, type FinalizeCall, type FinalizeTools } from './service'
import { installFakeCli, type FakeCli } from './testing/fakeCli'

const valid = 'flowchart LR\n  C[Client] -->|requête| S[Serveur]'
const mermaid = (source: string) => `\`\`\`mermaid\n${source}\n\`\`\``

const lesson = [
  '# Cache',
  '',
  'Voici le flux.',
  '',
  mermaid(valid),
  '',
  'Le serveur lit le cache.',
  mermaid('flowchart LR\n  S[Serveur<br>web] --> K[Cache]'),
  '',
  '```js',
  'const x = 1',
  '```',
  '',
  'La répartition.',
  '',
  mermaid('pie\n  "hit" : 80'),
  '',
  'Fin.'
].join('\n')

/** Tools answering the repair call with `answer`, recording the calls. */
function toolsReturning(
  answer: (call: FinalizeCall) => unknown,
  calls: FinalizeCall[] = []
): FinalizeTools {
  return {
    complete: async <T>(call: FinalizeCall) => {
      calls.push(call)
      return answer(call) as T
    }
  } as FinalizeTools
}

describe('validateDiagramsInMarkdown', () => {
  it('finds the mermaid blocks only, with their lines', () => {
    const blocks = findMermaidBlocks(lesson)
    expect(blocks.map((block) => block.index)).toEqual([1, 2, 3])
    expect(blocks[0]).toMatchObject({ source: valid, startLine: 4, endLine: 7, closed: true })
  })

  it('accepts valid blocks and a text without diagrams', async () => {
    expect(await validateDiagramsInMarkdown(`Intro\n\n${mermaid(valid)}\n`)).toEqual({
      blocks: 1,
      invalid: []
    })
    expect(await validateDiagramsInMarkdown('# Rien\n\n```js\nx\n```')).toEqual({
      blocks: 0,
      invalid: []
    })
  })

  it('reports forbidden and unsupported blocks with their lead-in', async () => {
    const { blocks, invalid } = await validateDiagramsInMarkdown(lesson)
    expect(blocks).toBe(3)
    expect(invalid).toMatchObject([
      { index: 2, error: { code: 'forbidden_content' }, context: 'Le serveur lit le cache.' },
      { index: 3, error: { code: 'unsupported_type' }, context: 'La répartition.' }
    ])
  })

  it('reports an empty block and other forbidden content', async () => {
    const text = [
      mermaid(''),
      mermaid('%%{init: {"theme": "dark"}}%%\nflowchart LR\n  A --> B'),
      mermaid('flowchart LR\n  A --> B\n  click A "https://x.y"')
    ].join('\n\n')
    expect(
      (await validateDiagramsInMarkdown(text)).invalid.map((entry) => entry.error.code)
    ).toEqual(['parse_error', 'forbidden_content', 'forbidden_content'])
  })

  it('checks an unclosed fence of a final text as it is', async () => {
    const unclosed = await validateDiagramsInMarkdown(`Fin.\n\n\`\`\`mermaid\n${valid}`)
    expect(unclosed.invalid).toEqual([])
    const cut = await validateDiagramsInMarkdown(`Fin.\n\n\`\`\`mermaid\nflowchart LR\n  A --`)
    expect(cut.invalid[0]!.error.code).toBe('parse_error')
    const truncated = await validateDiagramsInMarkdown('Fin.\n\n```mermaid\nflowch')
    expect(truncated.invalid[0]!.error.code).toBe('unsupported_type')
  })

  it('reports the syntax errors only mermaid sees, with the parser message', async () => {
    const text = `Le flux.\n\n${mermaid('flowchart LR\n  A[Serveur (lecture)] --> B[Cache]')}`
    const { invalid } = await validateDiagramsInMarkdown(text)
    expect(invalid).toMatchObject([{ index: 1, error: { code: 'parse_error' } }])
    expect(invalid[0]!.error.message).toMatch(/Parse error on line 2/)
    expect(invalid[0]!.error.message.length).toBeLessThanOrEqual(200)
  })
})

describe('parseDiagramSource', () => {
  it('accepts the other supported types and the examples of the prompt rules', async () => {
    const sources = [
      'stateDiagram-v2\n  [*] --> Valide\n  Valide --> Expire : TTL',
      'erDiagram\n  USER ||--o{ LINK : cree',
      'classDiagram\n  class Cache',
      ...findMermaidBlocks(DIAGRAM_RULES).map((block) => block.source)
    ]
    for (const source of sources) expect(await parseDiagramSource(source)).toEqual({ ok: true })
  })

  it('accepts valid flowcharts and sequence diagrams with mermaid itself', async () => {
    expect(await parseDiagramSource(valid)).toEqual({ ok: true })
    const sequence =
      'sequenceDiagram\n  participant C as Client\n  C->>S: requête\n  S-->>C: absente (cache miss)'
    expect(await parseDiagramSource(sequence)).toEqual({ ok: true })
  })

  it('rejects unquoted parentheses in a flowchart label and garbage text', async () => {
    const parens = await parseDiagramSource('flowchart LR\n  A[Serveur (lecture)] --> B')
    expect(parens).toMatchObject({
      ok: false,
      code: 'parse_error',
      error: expect.stringMatching(/Parse error/)
    })
    expect(await parseDiagramSource('flowchart LR\n  ]]] --> ((( ;; ->')).toMatchObject({
      ok: false,
      code: 'parse_error'
    })
    expect(await parseDiagramSource('du texte qui n est pas un diagramme')).toMatchObject({
      ok: false,
      code: 'unsupported_type'
    })
  })

  it('rejects unsupported types and forbidden content before parsing', async () => {
    const parse = vi.fn()
    expect(await parseDiagramSource('pie\n  "a" : 1', { parse })).toMatchObject({
      ok: false,
      code: 'unsupported_type'
    })
    expect(await parseDiagramSource('flowchart LR\n  A[<b>x</b>] --> B', { parse })).toMatchObject({
      ok: false,
      code: 'forbidden_content'
    })
    expect(parse).not.toHaveBeenCalled()
  })

  it('times out on a parser that never answers, and never throws', async () => {
    const hang = () => new Promise(() => {})
    expect(await parseDiagramSource(valid, { parse: hang, timeoutMs: 20 })).toEqual({
      ok: false,
      code: 'timeout',
      error: 'Parsing took longer than 20 ms.'
    })
    const throws = () => {
      throw 'boom'
    }
    expect(await parseDiagramSource(valid, { parse: throws })).toEqual({
      ok: false,
      code: 'parse_error',
      error: 'boom'
    })
  })

  it('parses one source at a time', async () => {
    let running = 0
    let overlap = false
    const parse = async () => {
      overlap ||= running > 0
      running++
      await new Promise((resolve) => setTimeout(resolve, 5))
      running--
    }
    await Promise.all([1, 2, 3].map(() => parseDiagramSource(valid, { parse })))
    expect(overlap).toBe(false)
  })
})

describe('diagram repair', () => {
  const fixed = 'flowchart LR\n  S["Serveur web"] -->|lecture| K[Cache]'

  it('makes no call when every block is valid', async () => {
    const calls: FinalizeCall[] = []
    const text = `Intro\n\n${mermaid(valid)}`
    expect(
      await repairDiagramsInMarkdown(
        text,
        toolsReturning(() => null, calls)
      )
    ).toBe(text)
    expect(calls).toHaveLength(0)
  })

  it('swaps in the repaired blocks with one call for all of them', async () => {
    const calls: FinalizeCall[] = []
    const repaired = await repairDiagramsInMarkdown(
      lesson,
      toolsReturning(
        () => ({
          diagrams: [
            { id: 2, source: fixed },
            { id: 3, source: mermaid('flowchart TD\n  H[hit] --> M[miss]') }
          ]
        }),
        calls
      )
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]!.prompt.user).toContain('<diagram id="2">')
    expect(calls[0]!.prompt.user).toContain('Error: unsupported_type')
    expect(calls[0]!.prompt.user).toContain('Introduced by: La répartition.')
    expect(await validateDiagramsInMarkdown(repaired)).toEqual({ blocks: 3, invalid: [] })
    expect(findMermaidBlocks(repaired).map((block) => block.source)).toEqual([
      valid,
      fixed,
      'flowchart TD\n  H[hit] --> M[miss]'
    ])
    expect(repaired).toContain('```js\nconst x = 1\n```')
    expect(findDiagramFailures(repaired)).toEqual([])
  })

  it('keeps a block whose repair is still invalid and records it', async () => {
    const repaired = await repairDiagramsInMarkdown(
      lesson,
      toolsReturning(() => ({
        diagrams: [
          { id: 2, source: fixed },
          { id: 3, source: 'pie\n  "hit" : 80' }
        ]
      }))
    )

    const blocks = findMermaidBlocks(repaired)
    expect(blocks[1]!.source).toBe(fixed)
    expect(blocks[2]!.source).toBe('pie\n  "hit" : 80')
    expect(repaired.endsWith(`${diagramFailureMarker(3, 'unsupported_type')}\n`)).toBe(true)
    expect(findDiagramFailures(repaired)).toEqual([{ index: 3, code: 'unsupported_type' }])
  })

  it('keeps the text and records every failure when the repair call fails', async () => {
    const repaired = await repairDiagramsInMarkdown(
      lesson,
      toolsReturning(() => null)
    )
    expect(repaired.startsWith(lesson)).toBe(true)
    expect(findDiagramFailures(repaired)).toEqual([
      { index: 2, code: 'forbidden_content' },
      { index: 3, code: 'unsupported_type' }
    ])
  })

  it('ignores repairs of blocks that were not broken', async () => {
    const repaired = await repairDiagramsInMarkdown(
      lesson,
      toolsReturning(() => ({ diagrams: [{ id: 1, source: fixed }] }))
    )
    expect(findMermaidBlocks(repaired)[0]!.source).toBe(valid)
  })

  it('closes a repaired unclosed fence', async () => {
    const repaired = await repairDiagramsInMarkdown(
      'Fin.\n\n```mermaid\nflowch',
      toolsReturning(() => ({ diagrams: [{ id: 1, source: fixed }] }))
    )
    expect(repaired).toBe(`Fin.\n\n${mermaid(fixed)}`)
  })

  it('passes structured content through untouched', async () => {
    const calls: FinalizeCall[] = []
    const content = { questions: [] }
    expect(
      await repairDiagrams(
        content,
        toolsReturning(() => null, calls)
      )
    ).toBe(content)
    expect(calls).toHaveLength(0)
  })

  it('repairs a block only mermaid rejects, and checks the repair with the parser', async () => {
    const text = `Le flux.\n\n${mermaid('flowchart LR\n  A[Serveur (lecture)] --> B[Cache]')}`
    const calls: FinalizeCall[] = []
    const stillBroken = await repairDiagramsInMarkdown(
      text,
      toolsReturning(
        () => ({ diagrams: [{ id: 1, source: 'flowchart LR\n  A[Serveur (x)] --> B' }] }),
        calls
      )
    )
    expect(calls[0]!.prompt.user).toMatch(/Error: parse_error \(Parse error on line 2/)
    expect(findDiagramFailures(stillBroken)).toEqual([{ index: 1, code: 'parse_error' }])

    const quoted = 'flowchart LR\n  A["Serveur (lecture)"] --> B[Cache]'
    const repaired = await repairDiagramsInMarkdown(
      text,
      toolsReturning(() => ({ diagrams: [{ id: 1, source: quoted }] }))
    )
    expect(repaired).toBe(`Le flux.\n\n${mermaid(quoted)}`)
  })

  it('builds a structured repair call with the diagram rules', async () => {
    const call = buildDiagramRepairCall((await validateDiagramsInMarkdown(lesson)).invalid)
    expect(call.prompt.version).toBe('diagram-repair-2')
    expect(call.prompt.system).toContain('Diagrams (Mermaid):')
    expect(call.schema.safeParse({ diagrams: [{ id: 2, source: fixed }] }).success).toBe(true)
    expect(call.schema.safeParse({ diagrams: [] }).success).toBe(false)
  })
})

describe('diagram repair in a Generation, with the fake CLI', () => {
  let fake: FakeCli
  let db: Database
  let service: GenerationService

  beforeEach(() => {
    fake = installFakeCli()
    db = openDatabase(':memory:')
    migrate(db, migrations)
    service = new GenerationService({
      db,
      cli: { env: fake.env },
      resolveCli: async () => fake.bin
    })
  })

  afterEach(() => {
    service.dispose()
    db.close()
    fake.cleanup()
  })

  const generate = (mode: string) =>
    service.generate({
      kind: 'lesson',
      input: { mode },
      prompt: { version: 'test', system: 'Lesson.', user: `scenario:diagram-lesson-${mode}` },
      finalize: repairDiagrams
    })

  it('repairs the broken blocks once, then caches and sends the repaired text', async () => {
    const run = generate('fixable')
    let streamed = ''
    for await (const event of run.events) if (event.type === 'text_delta') streamed += event.text
    const result = await run.result

    expect((await validateDiagramsInMarkdown(streamed)).invalid).toHaveLength(2)
    expect(fake.calls()).toHaveLength(2)
    expect(fake.calls()[1]!.argv).toContain('--json-schema')
    const content = result.content as string
    expect(await validateDiagramsInMarkdown(content)).toEqual({ blocks: 3, invalid: [] })
    expect(content).toContain('-->|lecture 3| K[Cache]')
    expect(getCachedContent(db, result.cacheKey!)?.content).toBe(content)
  })

  it('keeps the original blocks and records the failure when the repair is still invalid', async () => {
    const result = await generate('broken').result
    const content = result.content as string

    expect(fake.calls()).toHaveLength(2)
    expect((await validateDiagramsInMarkdown(content)).invalid).toHaveLength(2)
    expect(findDiagramFailures(content)).toEqual([
      { index: 2, code: 'forbidden_content' },
      { index: 3, code: 'unsupported_type' }
    ])
    expect(getCachedContent(db, result.cacheKey!)?.content).toBe(content)
  })

  it('makes no repair call when every block is valid', async () => {
    const result = await generate('valid').result
    expect(fake.calls()).toHaveLength(1)
    expect(findDiagramFailures(result.content as string)).toEqual([])
  })

  it('serves the repaired text from the cache without a new call', async () => {
    await generate('fixable').result
    const again = await generate('fixable').result
    expect(again.fromCache).toBe(true)
    expect((await validateDiagramsInMarkdown(again.content as string)).invalid).toEqual([])
    expect(fake.calls()).toHaveLength(2)
  })

  it('stops on cancellation during the repair', async () => {
    const tools: FinalizeTools = {
      complete: async () => {
        throw new GenerationError('cancelled')
      }
    }
    await expect(repairDiagramsInMarkdown(lesson, tools)).rejects.toMatchObject({
      code: 'cancelled'
    })
  })
})

describe('dropUnparsableQuizDiagrams', () => {
  const tools = {} as FinalizeTools
  const good = 'flowchart LR\n  C[Client] -->|requête| S[Serveur]'
  const bad = 'flowchart LR\n  C[Client] --> S[Serveur (lecture)]'

  it('drops a diagram that mermaid cannot parse and keeps the question', async () => {
    const out = (await dropUnparsableQuizDiagrams(
      {
        questions: [
          { type: 'scenario', prompt: 'A ?', diagram: bad },
          { type: 'scenario', prompt: 'B ?', diagram: good },
          { type: 'single_choice', prompt: 'C ?' }
        ]
      },
      tools
    )) as { questions: Array<Record<string, unknown>> }

    expect(out.questions).toHaveLength(3)
    expect(out.questions[0]).toEqual({ type: 'scenario', prompt: 'A ?' })
    expect(out.questions[1]!.diagram).toBe(good)
    expect(out.questions[2]).toEqual({ type: 'single_choice', prompt: 'C ?' })
  })

  it('leaves anything that is not a quiz untouched', async () => {
    expect(await dropUnparsableQuizDiagrams('# lesson', tools)).toBe('# lesson')
    expect(await dropUnparsableQuizDiagrams({ other: 1 }, tools)).toEqual({ other: 1 })
  })
})
