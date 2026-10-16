// Language profiles: the one place that knows how each Generation Language is written. Every prompt
// builder takes its language rules, headings, examples and the learner-facing wording from here,
// so no sentence about a language is hard-coded in a prompt. The French profile holds the exact
// text the prompts had before English existed: changing it changes French content, so bump the
// version of every prompt that uses the changed field (see docs/Prompts.md).
import type { GenerationLanguage } from '../../shared/generationLanguage'

export interface LanguageProfile {
  code: GenerationLanguage
  /** Name of the language, as it appears in the instructions ("in French"). */
  name: string
  /** The name with its article, for "a French learning app" / "an English learning app". */
  nameWithArticle: string

  /** The output rules every learner-facing prompt includes: address form, jargon, everyday words. */
  languageRules: string
  /**
   * The learner may answer or write in either language; the feedback follows the Generation
   * Language anyway. Included where learner text is graded or reviewed.
   */
  learnerTextNote: string

  diagram: {
    /** How labels are written, for "Labels follow the language rules: ...". */
    labelPolicy: string
    quotedLabelExample: string
    arrowLabelExamples: string
    flowchartExample: string
    sequenceExample: string
  }
  quizDiagram: {
    answerWords: string
    labelPolicy: string
    exampleScenario: string
    example: string
  }
  ungrounded: {
    /** Wording that marks a measured quantity as approximate. */
    approximately: string
    /** Wording that marks a simplification. */
    simplifying: string
  }

  lesson: {
    /** Heading of the closing recap section. */
    recapHeading: string
    /** Separator between a notion title and its sentence in the recap (`**Title** : text`). */
    recapSeparator: string
  }
  remediation: {
    takeawaysHeading: string
  }
  protocolStepLesson: {
    why: string
    produce: string
    pitfall: string
    remember: string
  }
  quiz: {
    /** Filler choices a quiz never uses. */
    noneOfTheAbove: string
  }
  notionOutline: {
    /** The end of "It must stay stable, so ...". */
    slugStability: string
    titlePolicy: string
    titleExamples: string
  }
  freeAnswer: {
    /** What grading never penalizes besides spelling. */
    tolerance: string
  }
  designFeedback: {
    gapPointer: string
    /** The phrase that introduces an example, which must not name a reference item. */
    forExample: string
    missingContentExamples: string
    /** Section prefixes of the final review's gapsVsReference entries. */
    finalReviewPrefixes: string
  }
  lessonQuestion: {
    notCoveredExample: string
    followUpExample: string
  }
}

const FRENCH: LanguageProfile = {
  code: 'fr',
  name: 'French',
  nameWithArticle: 'a French',

  languageRules: `Language:
- Write everything the learner reads in French, natural and simple, addressing the learner as "tu".
- Keep only system design jargon in English, exactly as it is said in interviews (load balancer, sharding, cache, cache-aside, write-through, replication, throughput, latency, TTL...). Never translate it; the first time a term appears you may add a short French gloss in parentheses.
- Write everyday computing words in French, as a French developer says them: serveur, client, requête, réponse, mémoire, disque, réseau, base de données, octet (Ko, Mo, Go, To), fichier, machine, panne.
- Examples. Good: "le serveur renvoie une réponse", "la mémoire est plus rapide que le disque", "un load balancer répartit les requêtes", "10 Go par jour". Bad: "le server renvoie une response", "la memory est plus rapide que le disk", "un répartiteur de charge", "10 GB par jour".
- Do not mix in English sentences.`,
  learnerTextNote: `The learner may write in French or in English. Your feedback is always in French.`,

  diagram: {
    labelPolicy: 'system design jargon in English, everyday words in French',
    quotedLabelExample: 'S1["Serveur (lecture seule)"]',
    arrowLabelExamples: '-->|requête|, ->>: lecture',
    flowchartExample: `flowchart LR
  C[Client] -->|requête| LB[Load balancer]
  LB -->|requête| S1[Serveur 1]
  LB -->|requête| S2[Serveur 2]
  S1 -->|lecture| DB[(Base de données)]
  S2 -->|lecture| DB`,
    sequenceExample: `sequenceDiagram
  participant C as Client
  participant S as Serveur
  participant K as Cache
  C->>S: requête
  S->>K: lecture de la clé
  K-->>S: absente (cache miss)`
  },
  quizDiagram: {
    answerWords: '"correct" or "bonne réponse"',
    labelPolicy: 'system design jargon in English and everyday words in French',
    exampleScenario: 'le cache tombe en panne, que se passe-t-il ?',
    example: `flowchart LR
  C[Client] -->|requête| S[Serveur web]
  S -->|lecture| K[Cache]
  S -->|lecture| DB[(Database)]`
  },
  ungrounded: {
    approximately: '"environ" or "de l\'ordre de"',
    simplifying: '"en simplifiant"'
  },

  lesson: { recapHeading: 'Récapitulatif', recapSeparator: ' :' },
  remediation: { takeawaysHeading: 'À retenir' },
  protocolStepLesson: {
    why: "Pourquoi c'est important",
    produce: 'Ce que tu vas produire',
    pitfall: 'Piège fréquent',
    remember: 'À retenir'
  },
  quiz: { noneOfTheAbove: '"toutes les réponses" or "aucune de ces réponses"' },
  notionOutline: {
    slugStability: 'no numbering and no French',
    titlePolicy: 'keeps the system design jargon in English and everyday words in French',
    titleExamples: '"Cache-aside (lazy loading)", "Le serveur et ses requêtes"'
  },
  freeAnswer: { tolerance: 'missing English jargon or French words used instead of it' },
  designFeedback: {
    gapPointer: 'tu ne dis pas ...',
    forExample: 'par exemple',
    missingContentExamples:
      '"tu ne dis pas ce qui est hors périmètre", "pense aux cas limites de tes cas d\'usage", "qui d\'autre que l\'utilisateur agit sur le système ?"',
    finalReviewPrefixes:
      '"Cas d\'usage :", "Hors périmètre :", "Estimations :", "Composants :", "Passage à l\'échelle :"'
  },
  lessonQuestion: {
    notCoveredExample: "Ce point n'est pas traité dans le cours.",
    followUpExample: "et pour l'écriture ?"
  }
}

const ENGLISH: LanguageProfile = {
  code: 'en',
  name: 'English',
  nameWithArticle: 'an English',

  languageRules: `Language:
- Write everything the learner reads in English, natural and simple, addressing the learner as "you".
- Use system design terms exactly as they are said in interviews (load balancer, sharding, cache, cache-aside, write-through, replication, throughput, latency, TTL...); the first time a term appears you may add a short gloss in plain words in parentheses.
- Write everyday computing words in plain English, as a developer says them: server, client, request, response, memory, disk, network, database, byte (KB, MB, GB, TB), file, machine, outage.
- Examples. Good: "the server sends back a response", "memory is faster than disk", "a load balancer spreads requests across servers", "10 GB per day". Bad: "the serving machine returns an answer message", "a load distributor", "ten thousand million bytes per day".
- Do not mix in sentences in another language.`,
  learnerTextNote: `The learner may write in French or in English. Your feedback is always in English.`,

  diagram: {
    labelPolicy: 'standard system design terms, plain English for everything else',
    quotedLabelExample: 'S1["Server (read-only)"]',
    arrowLabelExamples: '-->|request|, ->>: read',
    flowchartExample: `flowchart LR
  C[Client] -->|request| LB[Load balancer]
  LB -->|request| S1[Server 1]
  LB -->|request| S2[Server 2]
  S1 -->|read| DB[(Database)]
  S2 -->|read| DB`,
    sequenceExample: `sequenceDiagram
  participant C as Client
  participant S as Server
  participant K as Cache
  C->>S: request
  S->>K: read the key
  K-->>S: missing (cache miss)`
  },
  quizDiagram: {
    answerWords: '"correct" or "right answer"',
    labelPolicy: 'standard system design terms and plain English for everything else',
    exampleScenario: 'the cache goes down, what happens?',
    example: `flowchart LR
  C[Client] -->|request| S[Web server]
  S -->|read| K[Cache]
  S -->|read| DB[(Database)]`
  },
  ungrounded: {
    approximately: '"about" or "on the order of"',
    simplifying: '"in simplified terms"'
  },

  lesson: { recapHeading: 'Recap', recapSeparator: ':' },
  remediation: { takeawaysHeading: 'Key takeaways' },
  protocolStepLesson: {
    why: 'Why it matters',
    produce: 'What you will produce',
    pitfall: 'A common pitfall',
    remember: 'Key takeaway'
  },
  quiz: { noneOfTheAbove: '"all of the above" or "none of the above"' },
  notionOutline: {
    slugStability: 'no numbering',
    titlePolicy: 'uses the standard system design terms and plain English for everything else',
    titleExamples: '"Cache-aside (lazy loading)", "The server and its requests"'
  },
  freeAnswer: {
    tolerance: 'missing standard jargon or an answer written in French instead of English'
  },
  designFeedback: {
    gapPointer: 'you do not say ...',
    forExample: 'for example',
    missingContentExamples:
      '"you do not say what is out of scope", "think about the edge cases of your use cases", "who other than the user acts on the system?"',
    finalReviewPrefixes: '"Use cases:", "Out of scope:", "Estimations:", "Components:", "Scaling:"'
  },
  lessonQuestion: {
    notCoveredExample: 'This point is not covered in the course.',
    followUpExample: 'what about writing?'
  }
}

const profiles: Record<GenerationLanguage, LanguageProfile> = { fr: FRENCH, en: ENGLISH }

export const languageProfile = (language: GenerationLanguage): LanguageProfile => profiles[language]
