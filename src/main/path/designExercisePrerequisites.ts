// Design Exercise slots of the Learning Path: one per primer Reference Solution, with the primer
// topics to master before it unlocks. Rationale and table in docs/Learning Path Implementation.md.
import { DESIGN_EXERCISES } from '../protocol/designExercises'

export interface DesignExercisePrerequisites {
  /** Reference Solution id (upstream folder name), for example `pastebin`. */
  referenceSolutionId: string
  /** Primer topic slugs (Source Corpus topic ids) to master first. */
  prerequisites: readonly string[]
  /** Why these topics: what the Reference Solution relies on. */
  rationale: string
}

/**
 * In Learning Path order: the implemented Design Exercises first, in their order index
 * (`DESIGN_EXERCISES`), then the others from the smallest design to the broadest. An implemented
 * exercise also needs the previous implemented one completed (`previousDesignExercise`).
 */
export const DESIGN_EXERCISE_PREREQUISITES: readonly DesignExercisePrerequisites[] = [
  {
    referenceSolutionId: 'pastebin',
    prerequisites: ['performance-vs-scalability', 'load-balancer', 'database', 'cache'],
    rationale:
      'A read-heavy store behind web servers: SQL database (and its scaling), a cache for hot pastes, load balancing.'
  },
  {
    referenceSolutionId: 'twitter',
    prerequisites: [
      'performance-vs-scalability',
      'content-delivery-network',
      'load-balancer',
      'application-layer',
      'database',
      'cache',
      'asynchronism'
    ],
    rationale:
      'Timeline fan-out and search at scale: services, asynchronous fan-out, memory caches, SQL and NoSQL, a CDN for media.'
  },
  {
    referenceSolutionId: 'query_cache',
    prerequisites: ['latency-vs-throughput', 'load-balancer', 'cache'],
    rationale:
      'A sharded in-memory LRU cache in front of a search service: caching strategies, latency, load balancing.'
  },
  {
    referenceSolutionId: 'web_crawler',
    prerequisites: ['domain-name-system', 'database', 'cache', 'asynchronism'],
    rationale:
      'Queues of pages to crawl, NoSQL storage, duplicate detection with a cache, and DNS lookups as a bottleneck.'
  },
  {
    referenceSolutionId: 'social_graph',
    prerequisites: ['load-balancer', 'application-layer', 'database', 'cache'],
    rationale:
      'A person and lookup service over a sharded user graph: services, database sharding, caching, load balancing.'
  },
  {
    referenceSolutionId: 'sales_rank',
    prerequisites: ['database', 'cache', 'asynchronism'],
    rationale:
      'A batch (MapReduce) job over sales logs writing a ranking table read through a cache: asynchronous processing, SQL, caching.'
  },
  {
    referenceSolutionId: 'mint',
    prerequisites: [
      'load-balancer',
      'application-layer',
      'database',
      'cache',
      'asynchronism',
      'security'
    ],
    rationale:
      'Account sync and transaction categorization: queues and workers, SQL, caching, services, and the security of financial data.'
  },
  {
    referenceSolutionId: 'scaling_aws',
    prerequisites: [
      'performance-vs-scalability',
      'availability-patterns',
      'domain-name-system',
      'content-delivery-network',
      'load-balancer',
      'reverse-proxy-web-server',
      'application-layer',
      'database',
      'cache',
      'asynchronism'
    ],
    rationale:
      'Iterates from one box to millions of users: DNS, CDN, load balancers, web and application tiers, replication, caching, queues, failover.'
  }
]

/**
 * Design Exercises the app can run: the catalogue of `src/main/protocol/designExercises.ts`. The
 * others show as "coming soon" and are never startable.
 */
export const IMPLEMENTED_DESIGN_EXERCISES: readonly string[] = DESIGN_EXERCISES.map(
  ({ slug }) => slug
)
