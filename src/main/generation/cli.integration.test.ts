// Opt-in end-to-end check against the real Claude Code CLI. Costs 2 real calls on the user's
// plan, so it only runs with RUN_CLI_INTEGRATION=1:
//   RUN_CLI_INTEGRATION=1 npx vitest run src/main/generation/cli.integration.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { GenerationEvent } from '../../shared/generation'
import { openDatabase, type Database } from '../db/driver'
import { migrate } from '../db/migrate'
import { migrations } from '../db/migrations'
import { GenerationService } from './service'

const enabled = process.env['RUN_CLI_INTEGRATION'] === '1'
const system = 'You generate content for a learning app. Output only the requested content.'

describe.skipIf(!enabled)('Generation with the real Claude Code CLI', () => {
  let db: Database
  let service: GenerationService

  beforeAll(() => {
    db = openDatabase(':memory:')
    migrate(db, migrations)
    service = new GenerationService({ db })
  })

  afterAll(() => {
    service.dispose()
    db.close()
  })

  it('streams a text generation in isolation', { timeout: 90_000 }, async () => {
    const run = service.generate({
      kind: 'lesson',
      input: { integration: 'text' },
      prompt: {
        version: 'integration-1',
        system,
        user: 'En français, explique en 3 phrases courtes ce qu’est un cache.'
      },
      groundedSourceSections: ['cache']
    })
    const events: GenerationEvent[] = []
    for await (const event of run.events) events.push(event)
    const result = await run.result

    const deltas = events.filter((e) => e.type === 'text_delta')
    expect(deltas.length).toBeGreaterThan(1)
    expect(deltas.map((e) => e.text).join('')).toBe(result.content)
    // Without the isolation flags the user's hooks and plugins add 20-45k tokens to the call.
    expect(result.usage?.costUsd ?? 0).toBeLessThan(0.02)
    console.log('text generation', {
      deltas: deltas.length,
      usage: result.usage,
      content: result.content
    })
  })

  it('returns schema-validated structured output', { timeout: 90_000 }, async () => {
    const result = await service.generate({
      kind: 'quiz',
      input: { integration: 'schema' },
      prompt: {
        version: 'integration-1',
        system,
        user: 'Génère une seule question à choix unique en français sur le cache, avec 3 choix.'
      },
      schema: z.object({
        questions: z
          .array(
            z.object({
              prompt: z.string(),
              choices: z.array(z.string()).min(2),
              correct: z.array(z.number().int().min(0)).min(1)
            })
          )
          .min(1)
      })
    }).result

    expect(result.content.questions.length).toBeGreaterThan(0)
    console.log('structured generation', {
      usage: result.usage,
      content: JSON.stringify(result.content)
    })
  })
})
