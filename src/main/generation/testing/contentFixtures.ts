// Fixtures for the prompt and pipeline tests: a small corpus (the primer fixture), a Notion
// Outline of its cache topic, and a valid quiz on it.
import { FIXTURE_SHA, PRIMER_FIXTURE } from '../../corpus/fixtures'
import { buildCorpus } from '../../corpus/ingest'
import { createCorpus } from '../../corpus/lookup'
import type { NotionOutline, QuizContent } from '../prompts'

export const fixtureCorpus = () =>
  createCorpus(
    buildCorpus({
      sha: FIXTURE_SHA,
      fetchedAt: '2026-10-08',
      readme: PRIMER_FIXTURE,
      solutions: [],
      upstreamFiles: []
    })
  )

export const CACHE_SECTIONS = ['cache', 'cache/client-caching', 'cache/when-to-update-the-cache']

export const cacheOutline: NotionOutline = {
  notions: [
    {
      slug: 'client-caching',
      title: 'Le cache côté client',
      description: 'Le navigateur ou l’OS garde des données en cache pour éviter des requêtes.',
      sourceSections: ['cache/client-caching']
    },
    {
      slug: 'cache-aside',
      title: 'Cache-aside (lazy loading)',
      description: 'L’application lit le cache, puis le stockage en cas de cache miss.',
      sourceSections: ['cache/when-to-update-the-cache']
    },
    {
      slug: 'write-through',
      title: 'Write-through',
      description: 'L’application écrit dans le cache, qui sert de stockage principal.',
      sourceSections: ['cache/when-to-update-the-cache']
    },
    {
      slug: 'cache-consistency',
      title: 'Cohérence entre cache et source de vérité',
      description: 'Un cache peut diverger de la base de données.',
      sourceSections: ['cache']
    }
  ]
}

export const cacheNotions = cacheOutline.notions.map((notion) => ({ ...notion }))

const choices = (correct: number[], count = 4) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Choix ${i + 1}`,
    correct: correct.includes(i)
  }))

export const validQuiz = (): QuizContent => ({
  questions: [
    {
      type: 'single_choice',
      prompt: 'Où se trouve un client cache ?',
      notions: ['client-caching'],
      sourceSections: ['cache/client-caching'],
      choices: choices([1]),
      explanation: 'Côté client : OS ou navigateur.'
    },
    {
      type: 'multiple_choice',
      prompt: 'Que fait l’application en cache-aside lors d’un cache miss ?',
      notions: ['cache-aside'],
      sourceSections: ['cache/when-to-update-the-cache'],
      choices: choices([0, 2]),
      explanation: 'Elle lit le stockage puis remplit le cache.'
    },
    {
      type: 'scenario',
      prompt: 'Quelle stratégie choisis-tu ?',
      scenario: 'Une boutique lit beaucoup et écrit peu ; les données doivent rester à jour.',
      notions: ['write-through', 'cache-aside'],
      sourceSections: ['cache/when-to-update-the-cache'],
      choices: choices([0], 3),
      explanation: 'Write-through garde le cache à jour à chaque écriture.'
    },
    {
      type: 'free_answer',
      prompt: 'Pourquoi un cache peut-il renvoyer une donnée périmée ?',
      notions: ['cache-consistency'],
      sourceSections: ['cache'],
      expectedPoints: ['La source de vérité a changé sans que le cache soit mis à jour.'],
      modelAnswer: 'Parce que la base a été modifiée et que le cache garde l’ancienne valeur.'
    },
    {
      type: 'single_choice',
      prompt: 'En write-through, où l’application écrit-elle ?',
      notions: ['write-through'],
      sourceSections: ['cache/when-to-update-the-cache'],
      choices: choices([2]),
      explanation: 'Dans le cache, qui sert de stockage principal.'
    },
    {
      type: 'scenario',
      prompt: 'Que risques-tu ?',
      scenario: 'Deux serveurs ont chacun leur cache local de profils.',
      notions: ['cache-consistency'],
      sourceSections: ['cache'],
      choices: choices([3]),
      explanation: 'Les caches peuvent diverger de la source de vérité.'
    }
  ]
})
