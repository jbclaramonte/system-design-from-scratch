// Dev-only fixture quiz, so the quiz screens can be played without topic seeding (#8) or a real
// Generation. Lives on its own topic, never on a real one: adding notions to a real topic would
// stand in for its Notion Outline.
import type { Database } from '../db'
import { createQuiz, type NewQuestion } from '../db/repositories/assessment'
import {
  createNotions,
  createTopic,
  getTopicBySlug,
  listNotionsByTopic
} from '../db/repositories/learningContent'
import type { Topic } from '../db/types'

export const DEV_QUIZ_TOPIC_SLUG = 'dev-quiz-fixture'

const NOTIONS = [
  {
    slug: 'cache-aside',
    title: 'Cache-aside (lazy loading)',
    description: 'L’application lit le cache, puis le stockage en cas de cache miss.'
  },
  {
    slug: 'write-through',
    title: 'Write-through',
    description: 'Chaque écriture passe par le cache, qui écrit dans le stockage.'
  },
  {
    slug: 'cache-invalidation',
    title: 'Invalidation du cache',
    description: 'Retirer ou rafraîchir une entrée quand la donnée source change.'
  }
]

type FixtureQuestion = Omit<NewQuestion, 'position' | 'notionIds'> & { notions: string[] }

const QUESTIONS: FixtureQuestion[] = [
  {
    type: 'single_choice',
    prompt: 'Avec cache-aside, que fait l’application lors d’un cache miss ?',
    notions: ['cache-aside'],
    body: {
      sourceSections: [],
      choices: [
        { text: 'Elle renvoie une erreur au client.', correct: false },
        {
          text: 'Elle lit la donnée dans la base, puis l’écrit dans le cache.',
          correct: true
        },
        { text: 'Elle attend que le cache se remplisse tout seul.', correct: false }
      ],
      explanation:
        'Avec cache-aside, c’est l’application qui charge la donnée depuis la base et la place dans le cache. Le cache ne se remplit jamais tout seul.'
    }
  },
  {
    type: 'multiple_choice',
    prompt: 'Quels sont des inconvénients du write-through ? (plusieurs réponses)',
    notions: ['write-through', 'cache-invalidation'],
    body: {
      sourceSections: [],
      choices: [
        { text: 'Chaque écriture est plus lente.', correct: true },
        { text: 'Le cache contient des données rarement lues.', correct: true },
        { text: 'Les lectures renvoient souvent des données périmées.', correct: false },
        { text: 'Un nouveau nœud de cache est vide au démarrage.', correct: true }
      ],
      explanation:
        'Le write-through écrit à la fois dans le cache et dans la base, donc les écritures sont plus lentes, et il garde des données jamais relues. Les données restent fraîches : c’est justement son avantage.'
    }
  },
  {
    type: 'scenario',
    prompt: 'Quelle stratégie de cache convient le mieux ?',
    notions: ['cache-aside', 'write-through'],
    body: {
      sourceSections: [],
      scenario:
        'Ton site de recettes reçoit 100 lectures pour 1 écriture. Une recette modifiée peut rester ancienne quelques minutes. Tu veux un cache qui ne garde que les recettes réellement consultées.',
      choices: [
        { text: 'Write-through', correct: false },
        { text: 'Cache-aside avec un TTL de quelques minutes', correct: true },
        { text: 'Pas de cache, la base suffit', correct: false }
      ],
      explanation:
        'Cache-aside ne met en cache que ce qui est lu, et le TTL borne la durée pendant laquelle une recette peut être ancienne. Write-through remplirait le cache de recettes jamais consultées.'
    }
  },
  {
    type: 'free_answer',
    prompt: 'Explique en une ou deux phrases pourquoi on fixe un TTL sur une entrée de cache.',
    notions: ['cache-invalidation'],
    body: {
      sourceSections: [],
      expectedPoints: ['Limiter la durée pendant laquelle une donnée périmée est servie.'],
      modelAnswer:
        'Le TTL fait expirer l’entrée, donc une donnée modifiée dans la base finit par être relue : on limite le temps où le cache sert une valeur périmée.'
    }
  }
]

function devTopic(db: Database): Topic {
  return (
    getTopicBySlug(db, DEV_QUIZ_TOPIC_SLUG) ??
    createTopic(db, { slug: DEV_QUIZ_TOPIC_SLUG, title: 'Cache (dev fixture)', position: 9999 })
  )
}

/** Creates a new fixture quiz (one question of each type) on the dev topic. Returns its id. */
export function createDevQuiz(db: Database): number {
  return db.transaction(() => {
    const topic = devTopic(db)
    let notions = listNotionsByTopic(db, topic.id)
    if (notions.length === 0) {
      notions = createNotions(
        db,
        NOTIONS.map((notion) => ({ ...notion, topicId: topic.id }))
      )
    }
    const idBySlug = new Map(notions.map((notion) => [notion.slug, notion.id]))
    return createQuiz(db, {
      topicId: topic.id,
      grounded: false,
      questions: QUESTIONS.map(({ notions: slugs, ...question }, position) => ({
        ...question,
        position,
        notionIds: slugs.map((slug) => idBySlug.get(slug)!)
      }))
    }).id
  })
}
