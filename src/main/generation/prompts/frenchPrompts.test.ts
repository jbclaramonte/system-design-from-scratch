// The French prompts are pinned: French is the default Generation Language and the one every
// install's stored content was written in, so a change to a French prompt must be deliberate.
// Content Cache keys of French content do not depend on the prompt text, only on its version, so
// a text change without a version bump would leave old content served for a new prompt.
//
// This test pins the version and a hash of the text of every prompt kind (and variant). When a
// French prompt changes on purpose: bump its version, then refresh the pins with
//   UPDATE_FRENCH_GOLDEN=1 npx vitest run src/main/generation/prompts/frenchPrompts.test.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildAllPrompts, promptHash } from '../testing/promptFixtures'

const goldenPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../testing/frenchPrompts.golden.json'
)

type Golden = Record<string, { version: string; sha256: string }>

const current = (): Golden =>
  Object.fromEntries(
    Object.entries(buildAllPrompts('fr')).map(([name, prompt]) => [
      name,
      { version: prompt.version, sha256: promptHash(prompt) }
    ])
  )

describe('French prompts', () => {
  if (process.env['UPDATE_FRENCH_GOLDEN']) {
    it('refreshes the pins', () => {
      writeFileSync(goldenPath, `${JSON.stringify(current(), null, 2)}\n`)
    })
    return
  }

  const golden = JSON.parse(readFileSync(goldenPath, 'utf8')) as Golden
  const now = current()

  it('covers every prompt kind and variant', () => {
    expect(Object.keys(now).sort()).toEqual(Object.keys(golden).sort())
  })

  it.each(Object.keys(golden))('keeps the text of %s, version included', (name) => {
    expect(now[name]).toEqual(golden[name])
  })
})
