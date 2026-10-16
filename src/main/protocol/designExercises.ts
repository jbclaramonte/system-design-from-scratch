// The Design Exercises of the Learning Path, as data: order, title, the curated problem statement
// and the primer Reference Solution of each. Seeded into `design_exercises` at startup (insert
// only). Rules and statements policy in docs/Design Exercises.md.
import type { Corpus } from '../corpus'
import type { Database } from '../db'
import { createDesignExercise, listDesignExercises } from '../db/repositories/designPractice'
import {
  DEFAULT_GENERATION_LANGUAGE,
  type GenerationLanguage
} from '../../shared/generationLanguage'
import type { ProtocolStep } from '../../shared/protocol'
import type { ReferenceTerm } from './leakGuard'

export interface DesignExerciseDefinition {
  /** `design_exercises.slug`, also the Reference Solution id (`pastebin`). */
  slug: string
  /** 1-based exercise index: decides the active Protocol Steps (`activeStepsFor`). */
  orderIndex: number
  /** The interview question, as the primer titles it (UI text). */
  title: string
  /**
   * What the learner is asked to design, in each Generation Language (the one matching the
   * setting is shown and given to the prompts). Curated, never generated: the product and its
   * context only, no use case and no number (scoping and estimating are the learner's steps, and
   * the primer's Step 1 is their reference answer). The rules hold in every language
   * (`designExercises.test.ts`).
   */
  problemStatements: Record<GenerationLanguage, string>
  referenceSolutionId: string
  /**
   * Distinctive items of the Reference Solution per step, which step feedback must not name
   * unless the learner did (`findLeakedTerms`). Curated by hand from the primer's Step 1.
   */
  referenceTerms: Partial<Record<ProtocolStep, readonly ReferenceTerm[]>>
}

// Patterns match French and English wordings (stems), case-insensitive, without the `g` flag.
const PASTEBIN_USE_CASE_TERMS: readonly ReferenceTerm[] = [
  { id: 'expiration', pattern: /expir|durée de vie|pour toujours|périmé/i },
  { id: 'anonymous users', pattern: /anonym/i },
  { id: 'page analytics', pattern: /analytic|statisti|nombre de visites|monthly visit/i },
  { id: 'deleting expired pastes', pattern: /nettoy|purge|delete expired/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  {
    id: 'user accounts (out of scope)',
    pattern: /\bcomptes?\b|account|inscri|connect[ée]|\blog ?in\b|authentif/i
  },
  { id: 'email verification (out of scope)', pattern: /e-?mail/i },
  { id: 'editing (out of scope)', pattern: /édit|\bedit|modifi/i },
  { id: 'visibility (out of scope)', pattern: /visibilit|priv[ée]/i },
  { id: 'custom short link (out of scope)', pattern: /personnalis|custom|alias/i }
]

const TWITTER_USE_CASE_TERMS: readonly ReferenceTerm[] = [
  { id: 'fan-out to followers', pattern: /fan-?out|diffus/i },
  { id: 'push notifications', pattern: /notif/i },
  { id: 'emails', pattern: /e-?mail/i },
  {
    id: 'user timeline',
    pattern: /user timeline|timeline (d'un|de l'|du |personnelle)|ses propres tweets|profil/i
  },
  { id: 'home timeline', pattern: /home timeline|accueil/i },
  { id: 'keyword search', pattern: /mots?[- ]cl[ée]|keyword/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'firehose and streams (out of scope)', pattern: /firehose|flux externe|\bstreams?\b/i },
  { id: 'visibility settings (out of scope)', pattern: /visibilit|masqu|\bhide\b/i },
  { id: 'replies (out of scope)', pattern: /@ ?repl|\brepl(y|ies)\b|réponses? (à|aux) /i },
  { id: 'analytics (out of scope)', pattern: /analytic|statisti/i }
]

const QUERY_CACHE_TERMS: readonly ReferenceTerm[] = [
  { id: 'cache hit', pattern: /\bhits?\b|succès (de|du) cache/i },
  { id: 'cache miss', pattern: /\bmiss(es)?\b|échec (de|du) cache|absente? du cache/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'popular queries (uneven traffic)', pattern: /populaire|popular|inégal|not evenly/i },
  {
    id: 'eviction (limited memory)',
    pattern: /évict|évinc|evict|\blru\b|least recently|mémoire (limitée|restreinte)|limited memory/i
  },
  { id: 'expiring or refreshing entries', pattern: /expir|\bttl\b|rafraîch|refresh|péremption/i },
  { id: 'fast lookups, low latency', pattern: /latence|latency|lookups? rapides?|fast lookup/i }
]

const WEB_CRAWLER_TERMS: readonly ReferenceTerm[] = [
  { id: 'reverse index', pattern: /reverse index|inverted index|index invers/i },
  { id: 'titles and snippets', pattern: /snippet|extrait/i },
  {
    id: 'user searches a term',
    pattern:
      /search term|terme de recherche|termes? recherch|saisi(t|r) (un|une) (terme|recherche)/i
  },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  {
    id: 'infinite loop (cycles, duplicates)',
    pattern: /infinite loop|boucle infinie|cycle|cyclique|doublon|duplicate|dupliqu/i
  },
  {
    id: 'freshness (recrawl)',
    pattern:
      /fraîcheur|freshness|re-?crawl|revisit|actualis|rafraîch|refresh|régulièrement|regularly/i
  },
  { id: 'anonymous users', pattern: /anonym/i },
  { id: 'popular searches (uneven traffic)', pattern: /populaire|popular|inégal|not evenly/i },
  { id: 'page rank (out of scope)', pattern: /page ?rank/i },
  { id: 'search analytics (out of scope)', pattern: /analytic|statisti/i },
  { id: 'personalized results (out of scope)', pattern: /personnalis|personali[sz]ed/i },
  { id: 'existing systems such as solr (out of scope)', pattern: /solr|nutch/i }
]

const SOCIAL_GRAPH_TERMS: readonly ReferenceTerm[] = [
  {
    id: 'shortest path',
    pattern:
      /shortest path|plus courts? chemins?|chemin le plus court|degr[ée]s? de séparation|degrees of separation|\bbfs\b/i
  },
  {
    id: 'user searches for someone',
    pattern:
      /search(es)? for (someone|a person|people)|recherche (de|d')(quelqu|une personne|personne)|chercher (quelqu|une personne)|friend search/i
  },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'popular searches (uneven traffic)', pattern: /populaire|popular|inégal|not evenly/i },
  { id: 'unweighted edges', pattern: /unweighted|non pondér|sans poids|weighted|pondér/i },
  {
    id: 'data does not fit on one machine',
    pattern: /single machine|une seule machine|tient pas (sur|dans)|won't fit|ne rentre pas/i
  },
  {
    id: 'no graph database (out of scope)',
    pattern: /neo4j|graphql|graph database|base (de données )?(orientée )?graphes?/i
  },
  { id: 'friends', pattern: /\bfriends?\b|\bamis?\b|\bamies?\b/i }
]

const SALES_RANK_TERMS: readonly ReferenceTerm[] = [
  {
    id: 'past week window',
    pattern: /past week|last week|seven days|semaine|sept jours|7 jours|hebdomadaire/i
  },
  { id: 'hourly updates', pattern: /hourly|every hour|toutes les heures|chaque heure|horaire/i },
  {
    id: 'items in several categories',
    pattern: /multiple categories|several categories|plusieurs catégories|subcategor|sous-catégor/i
  },
  {
    id: 'most popular products',
    pattern: /most popular|best[- ]sell|plus populaires|plus vendus|meilleures ventes/i
  },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'uneven traffic', pattern: /inégal|not evenly|non uniforme/i },
  {
    id: 'read-heavy traffic',
    pattern: /read to write|read[- ]heavy|lectures? (pour|par|contre) écritures?|plus de lectures/i
  },
  {
    id: 'rest of the e-commerce site (out of scope)',
    pattern: /e-?commerce|site marchand|reste du site|rest of the (site|store)/i
  }
]

const MINT_TERMS: readonly ReferenceTerm[] = [
  {
    id: 'connecting a financial account',
    pattern:
      /financial account|compte (financier|bancaire)|bank account|(lier|connecter|relier) (un|son|ses) comptes?|connects? (a|an|their|his|her) accounts?/i
  },
  { id: 'extracting transactions', pattern: /transactions?/i },
  { id: 'daily updates', pattern: /daily|quotidien|chaque jour|tous les jours/i },
  { id: 'categorizing transactions', pattern: /categori[sz]|catégor/i },
  { id: 'manual category override', pattern: /override|surcharg|manual|manuel/i },
  {
    id: 'monthly spending analysis',
    pattern: /monthly spending|dépenses? (mensuel|par mois|du mois)|mensuel/i
  },
  { id: 'budget', pattern: /budget/i },
  { id: 'notifications', pattern: /notif/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'logging and analytics (out of scope)', pattern: /analytic|logging|journalis/i },
  {
    id: 'active users only',
    pattern: /30 days|trente jours|active users|utilisateurs actifs/i
  },
  {
    id: 'write-heavy traffic',
    pattern: /write-heavy|write to read|écritures? (massive|intensive)|plus d'écritures/i
  }
]

const SCALING_AWS_TERMS: readonly ReferenceTerm[] = [
  {
    id: 'read or write requests',
    pattern: /read or write|read and write|lectures? (ou|et) (d')?écritures?|lecture ou écriture/i
  },
  { id: 'storing user data', pattern: /user data|données (des |de l'|d')?utilisateurs?/i },
  { id: 'evolving iteratively', pattern: /evolv|évolu|iterativ|itérati|incremental|incrément/i },
  { id: 'high availability', pattern: /disponibilit|availability/i },
  { id: 'uneven traffic', pattern: /inégal|not evenly|non uniforme/i },
  { id: 'relational data', pattern: /relational|relationnel/i },
  {
    id: 'benchmark, load test, profiling',
    pattern: /benchmark|load test|test de charge|profil(ing|age)/i
  },
  {
    id: 'read-heavy traffic',
    pattern: /read to write|read[- ]heavy|lectures? (pour|par|contre) écritures?|plus de lectures/i
  }
]

/** In exercise order. Prerequisite topics: `DESIGN_EXERCISE_PREREQUISITES` (src/main/path). */
export const DESIGN_EXERCISES: readonly DesignExerciseDefinition[] = [
  {
    slug: 'pastebin',
    orderIndex: 1,
    title: 'Design Pastebin.com (or Bit.ly)',
    problemStatements: {
      fr: "Tu conçois un service web de partage de texte comme Pastebin.com : on y dépose du texte (du code, des logs, une note) pour le partager avec d'autres personnes grâce à un lien. Bit.ly, qui raccourcit des URL, est un problème très proche. Avant de dessiner quoi que ce soit, cadre ce que le service doit faire, et ce qu'il ne fera pas.",
      en: 'You are designing a web service for sharing text, like Pastebin.com: people drop in some text (code, logs, a note) and share it with others through a link. Bit.ly, which shortens URLs, is a very close problem. Before drawing anything, frame what the service must do, and what it will not do.'
    },
    referenceSolutionId: 'pastebin',
    referenceTerms: { functional_requirements: PASTEBIN_USE_CASE_TERMS }
  },
  {
    slug: 'twitter',
    orderIndex: 2,
    title: 'Design the Twitter timeline and search',
    problemStatements: {
      fr: "Tu conçois le cœur d'un réseau social comme Twitter : chacun y publie des messages courts et suit d'autres personnes pour lire ce qu'elles publient. On te demande la partie timeline et la recherche. Aucun chiffre de trafic n'est donné : pose tes propres hypothèses, estime les ordres de grandeur, puis dessine.",
      en: 'You are designing the core of a social network like Twitter: everyone posts short messages and follows other people to read what they post. You are asked for the timeline and the search. No traffic figure is given: make your own assumptions, estimate the orders of magnitude, then draw.'
    },
    referenceSolutionId: 'twitter',
    referenceTerms: { functional_requirements: TWITTER_USE_CASE_TERMS }
  },
  {
    slug: 'query_cache',
    orderIndex: 3,
    title: 'Design a key-value cache for recent web server queries',
    problemStatements: {
      fr: "Tu conçois le cache d'un moteur de recherche web : il garde à portée de main les résultats des requêtes récentes, pour que le moteur n'ait pas à les recalculer à chaque fois. Aucun chiffre ne t'est donné : cadre le périmètre, pose tes propres hypothèses et estime les ordres de grandeur. Ensuite, définis l'API du cache et son modèle de données, puis dessine l'ensemble.",
      en: 'You are designing the cache of a web search engine: it keeps the results of recent queries close at hand, so the engine does not have to compute them again each time. No figure is given: frame the scope, make your own assumptions and estimate the orders of magnitude. Then define the API of the cache and its data model, and draw the whole thing.'
    },
    referenceSolutionId: 'query_cache',
    referenceTerms: { functional_requirements: QUERY_CACHE_TERMS }
  },
  {
    slug: 'web_crawler',
    orderIndex: 4,
    title: 'Design a web crawler',
    problemStatements: {
      fr: "Tu conçois un robot d'exploration du web (web crawler) : un programme qui parcourt le web de page en page en suivant les liens qu'il y trouve. Ce que le service fait des pages collectées, c'est à toi de le décider. Cadre le périmètre, précise les exigences non fonctionnelles, pose tes hypothèses et estime les ordres de grandeur, puis définis l'API et le modèle de données, et dessine l'architecture.",
      en: 'You are designing a web crawler: a program that explores the web by going from page to page through the links it finds. What the service does with the pages it collects is for you to decide. Frame the scope, state the non-functional requirements, make your assumptions and estimate the orders of magnitude, then define the API and the data model, and draw the architecture.'
    },
    referenceSolutionId: 'web_crawler',
    referenceTerms: { functional_requirements: WEB_CRAWLER_TERMS }
  },
  {
    slug: 'social_graph',
    orderIndex: 5,
    title: 'Design the data structures of a social network',
    problemStatements: {
      fr: "Tu conçois les structures de données qui se cachent derrière un réseau social, où des personnes sont reliées les unes aux autres. À toi de décider ce que le service fait de ces liens. Cadre le périmètre, précise les exigences non fonctionnelles et estime les ordres de grandeur, puis définis l'API et le modèle de données, dessine l'architecture et cherche ses goulots d'étranglement.",
      en: 'You are designing the data structures behind a social network, where people are connected to one another. It is up to you to decide what the service does with these connections. Frame the scope, state the non-functional requirements and estimate the orders of magnitude, then define the API and the data model, draw the architecture and look for its bottlenecks.'
    },
    referenceSolutionId: 'social_graph',
    referenceTerms: { functional_requirements: SOCIAL_GRAPH_TERMS }
  },
  {
    slug: 'sales_rank',
    orderIndex: 6,
    title: "Design Amazon's sales rank by category",
    problemStatements: {
      fr: "Tu conçois la fonctionnalité de classement des ventes d'un grand site de vente en ligne comme Amazon : les produits y sont classés selon leur succès dans leur catégorie. À toi de décider ce que cette fonctionnalité doit faire, et ce qu'elle laisse de côté. Estime les ordres de grandeur et précise les exigences non fonctionnelles, puis définis l'API et le modèle de données, dessine l'architecture et cherche ses goulots d'étranglement.",
      en: 'You are designing the sales rank feature of a large online store like Amazon: products are ranked by how well they sell within their category. It is up to you to decide what this feature must do, and what it leaves aside. Estimate the orders of magnitude and state the non-functional requirements, then define the API and the data model, draw the architecture and look for its bottlenecks.'
    },
    referenceSolutionId: 'sales_rank',
    referenceTerms: { functional_requirements: SALES_RANK_TERMS }
  },
  {
    slug: 'mint',
    orderIndex: 7,
    title: 'Design Mint.com',
    problemStatements: {
      fr: "Tu conçois Mint.com, un service de gestion de finances personnelles : il aide chacun à mieux maîtriser son argent. À toi de décider ce que le service fait pour ses utilisateurs, et ce qu'il ne fait pas. Estime les ordres de grandeur et précise les exigences non fonctionnelles, puis définis l'API et le modèle de données, dessine l'architecture et cherche ses goulots d'étranglement.",
      en: 'You are designing Mint.com, a personal finance service that helps people keep better control of their money. It is up to you to decide what the service does for its users, and what it does not. Estimate the orders of magnitude and state the non-functional requirements, then define the API and the data model, draw the architecture and look for its bottlenecks.'
    },
    referenceSolutionId: 'mint',
    referenceTerms: { functional_requirements: MINT_TERMS }
  },
  {
    slug: 'scaling_aws',
    orderIndex: 8,
    title: 'Design a system that scales to millions of users on AWS',
    problemStatements: {
      fr: "Tu conçois une application web hébergée sur AWS, le cloud d'Amazon, dont le public doit passer de quelques personnes à une foule immense sans que le service s'effondre. Savoir utiliser AWS n'est pas indispensable : les idées valent partout. Cadre le périmètre, estime les ordres de grandeur et précise les exigences non fonctionnelles, puis définis l'API et le modèle de données, dessine l'architecture et cherche ses goulots d'étranglement.",
      en: "You are designing a web application hosted on AWS, Amazon's cloud, whose audience must grow from a handful of people to a very large crowd without the service collapsing. Knowing AWS is not required: the ideas apply anywhere. Frame the scope, estimate the orders of magnitude and state the non-functional requirements, then define the API and the data model, draw the architecture and look for its bottlenecks."
    },
    referenceSolutionId: 'scaling_aws',
    referenceTerms: { functional_requirements: SCALING_AWS_TERMS }
  }
]

export const designExerciseBySlug = (slug: string): DesignExerciseDefinition | undefined =>
  DESIGN_EXERCISES.find((exercise) => exercise.slug === slug)

/**
 * The problem statement of a catalogued exercise in a language; undefined for an exercise outside
 * the catalogue (a dev fixture), whose stored statement is used as it is.
 */
export const problemStatementFor = (
  slug: string,
  language: GenerationLanguage
): string | undefined => designExerciseBySlug(slug)?.problemStatements[language]

/** Leak guard terms of a step, by Reference Solution (dev fixtures share their reference's). */
export const referenceTermsFor = (
  referenceSolutionId: string | null,
  step: ProtocolStep
): readonly ReferenceTerm[] =>
  DESIGN_EXERCISES.find((exercise) => exercise.referenceSolutionId === referenceSolutionId)
    ?.referenceTerms[step] ?? []

/** The exercise to complete before `slug` unlocks: the one just before it, null for the first. */
export function previousDesignExercise(slug: string): DesignExerciseDefinition | null {
  const exercise = designExerciseBySlug(slug)
  if (!exercise) return null
  return DESIGN_EXERCISES.find(({ orderIndex }) => orderIndex === exercise.orderIndex - 1) ?? null
}

/**
 * Inserts the Design Exercises missing from the database (`position` = order index). Never
 * updates an existing row, so a learner's exercise keeps its id and history. Returns the number
 * inserted.
 */
export function seedDesignExercises(
  db: Database,
  corpus: Corpus,
  exercises: readonly DesignExerciseDefinition[] = DESIGN_EXERCISES
): number {
  const existing = new Set(listDesignExercises(db).map(({ slug }) => slug))
  const missing = exercises.filter(({ slug }) => !existing.has(slug))
  db.transaction(() => {
    for (const exercise of missing) {
      if (!corpus.getReferenceSolution(exercise.referenceSolutionId)) {
        throw new Error(
          `Design Exercise ${exercise.slug}: Reference Solution ${exercise.referenceSolutionId} is not in the corpus.`
        )
      }
      createDesignExercise(db, {
        slug: exercise.slug,
        title: exercise.title,
        position: exercise.orderIndex,
        grounded: true,
        referenceSolutionSection: exercise.referenceSolutionId,
        // The stored statement is the fallback of an exercise the catalogue no longer knows; the
        // one shown comes from `problemStatementFor`, in the Generation Language of the moment.
        problemStatement: exercise.problemStatements[DEFAULT_GENERATION_LANGUAGE]
      })
    }
  })
  return missing.length
}
