// Fetches the System Design Primer at a pinned commit and writes the Source Corpus artifact.
//
//   node scripts/build-corpus.ts [--sha <commit>]
//
// Needs Node 22.18+ (native TypeScript type stripping). Set GITHUB_TOKEN to avoid API rate limits.
// Only the English README.md and the 8 system design solution READMEs are downloaded; images,
// code files, Anki decks, translations and third-party linked pages are not.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCorpus, PRIMER_REPOSITORY, SOLUTION_IDS } from '../src/main/corpus/ingest.ts'

/** Pinned primer commit. Bump it with --sha, then review the diff of the artifact. */
const PINNED_SHA = 'ae9bbd7b02d90b9866215de185217d33f39ab733'

const OUTPUT = resolve(dirname(fileURLToPath(import.meta.url)), '../resources/corpus/primer.json')

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index === -1 ? undefined : process.argv[index + 1]
}

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await fetch(url, { headers })
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status}`)
  return response.text()
}

async function main(): Promise<void> {
  const sha = argValue('--sha') ?? PINNED_SHA
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Expected a full commit SHA, got "${sha}"`)
  const raw = (path: string) =>
    fetchText(`https://raw.githubusercontent.com/${PRIMER_REPOSITORY}/${sha}/${path}`)

  const apiHeaders: Record<string, string> = { Accept: 'application/vnd.github+json' }
  if (process.env.GITHUB_TOKEN) apiHeaders.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  const tree = JSON.parse(
    await fetchText(
      `https://api.github.com/repos/${PRIMER_REPOSITORY}/git/trees/${sha}?recursive=1`,
      apiHeaders
    )
  ) as { tree: { path: string; type: string }[]; truncated: boolean }
  if (tree.truncated) throw new Error('Upstream tree listing is truncated')
  const upstreamFiles = tree.tree.filter((entry) => entry.type === 'blob').map((e) => e.path)

  const readme = await raw('README.md')
  const solutions = []
  for (const id of SOLUTION_IDS) {
    solutions.push({ id, markdown: await raw(`solutions/system_design/${id}/README.md`) })
  }

  const corpus = buildCorpus({
    sha,
    fetchedAt: new Date().toISOString().slice(0, 10),
    readme,
    solutions,
    upstreamFiles
  })
  await mkdir(dirname(OUTPUT), { recursive: true })
  await writeFile(OUTPUT, `${JSON.stringify(corpus, null, 2)}\n`)
  const subTopics = corpus.topics.reduce((sum, topic) => sum + topic.subTopics.length, 0)
  console.log(
    `Wrote ${OUTPUT}: ${corpus.topics.length} topics, ${subTopics} sub-topics, ` +
      `${corpus.referenceSolutions.length} reference solutions (primer ${sha})`
  )
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
