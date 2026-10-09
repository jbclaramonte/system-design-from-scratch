// The Foundations Module: prerequisite Topics the System Design Primer assumes, generated
// ungrounded unless a seed declares primer sections to be grounded on (`groundedOn`). Seeded
// first in the Learning Path (see docs/Foundations Module Content.md).
import type { FoundationsTopicSeed } from './topics'

/**
 * In Learning Path order. Slugs are stable (notions and attempts hang off the topic row) and must
 * not clash with a primer topic id. `scope` and `leftToPrimer` steer the Notion Outline: what a
 * complete beginner needs first, and what the grounded primer topics teach later. `groundedOn`
 * lists the primer sections a topic is grounded on, even sections of non-teachable topics.
 */
export const FOUNDATIONS_TOPICS: readonly FoundationsTopicSeed[] = [
  {
    slug: 'how-the-web-works',
    title: 'Comment fonctionne le web : client, serveur et HTTP',
    scope:
      'the client/server model; what happens when a browser or an app loads a page or calls an API (request, response); URL parts; HTTP methods (GET, POST...) and status code families (2xx, 3xx, 4xx, 5xx); headers and body; statelessness and cookies at a mental-model level; JSON as the usual API payload.',
    leftToPrimer:
      'DNS resolution details (topic domain-name-system), REST versus RPC (topic communication), CDNs, load balancers and reverse proxies.'
  },
  {
    slug: 'networking-basics',
    title: 'Les bases du réseau : adresses IP, ports, TCP et UDP',
    scope:
      'IP addresses and the idea that names are translated to addresses; ports and why one machine runs several services; data sent in packets; TCP (connection, ordered and reliable delivery) versus UDP (no connection, no delivery guarantee) as a mental model; the round trip between two machines and why distance adds delay.',
    leftToPrimer:
      'how DNS works (topic domain-name-system), the detailed TCP/UDP/HTTP comparison (topic communication), latency versus throughput (topic latency-vs-throughput).'
  },
  {
    slug: 'inside-a-server',
    title: 'Dans un serveur : CPU, mémoire, processus et threads',
    scope:
      'what a server is (a computer running a program that answers requests); CPU, RAM (fast, lost on restart) and disk (slower, persistent); processes and threads; concurrency (handling many requests at once) versus parallelism; shared state and race conditions; why one machine eventually runs out of CPU, memory, disk or network capacity (a bottleneck).',
    leftToPrimer:
      'vertical versus horizontal scaling and load balancing (topics performance-vs-scalability, load-balancer), message and task queues (topic asynchronism).'
  },
  {
    slug: 'data-storage-basics',
    title: 'Stocker des données : tables, index et transactions',
    scope:
      'why applications use a database rather than files or memory; tables, rows, columns and primary keys; reading and writing with simple SQL queries (SELECT, INSERT, UPDATE); indexes as a lookup structure that speeds up reads and costs on writes; transactions as all-or-nothing groups of changes; a key-value store as the simplest alternative model.',
    leftToPrimer:
      'ACID in depth, replication, federation, sharding, denormalization, SQL tuning and the NoSQL families (topic database), caching (topic cache).'
  },
  {
    slug: 'orders-of-magnitude',
    title: 'Ordres de grandeur : unités, puissances de deux et latences',
    scope:
      'what a back-of-the-envelope estimate is for; bytes and the units KB, MB, GB, TB with the powers of two behind them (powers of two table); time units ns, us, ms; reading the latency numbers every programmer should know as orders of magnitude: memory, SSD, HDD, the network inside a data center and across the world; comparing them (how many times slower) and the handy throughput metrics; using those numbers in a step-by-step estimate with rounded values.',
    leftToPrimer:
      'CPU-level details of the latency table (L1/L2 cache, branch mispredict, mutex), estimations inside a design interview (Interview Protocol).',
    groundedOn: [
      'appendix',
      'appendix/powers-of-two-table',
      'appendix/latency-numbers-every-programmer-should-know'
    ]
  },
  {
    slug: 'failures-and-redundancy',
    title: 'Pannes, redondance et disponibilité',
    scope:
      'everything fails eventually (disks, machines, networks, bad deployments, human mistakes); a single point of failure; redundancy (several copies so one failure does not stop the service); backups versus redundancy; availability as the share of time a service works, expressed as a percentage; health checks and monitoring to notice failures.',
    leftToPrimer:
      'fail-over modes, replication and the availability-in-nines table (topic availability-patterns), consistency trade-offs (topics availability-vs-consistency, consistency-patterns).'
  }
]

/** The seed of a Foundations Module topic, by slug. */
export const findFoundationsTopic = (slug: string): FoundationsTopicSeed | undefined =>
  FOUNDATIONS_TOPICS.find((topic) => topic.slug === slug)

/** Primer sections a Foundations Module topic is grounded on; empty: ungrounded. */
export const foundationsGroundedOn = (slug: string): readonly string[] =>
  findFoundationsTopic(slug)?.groundedOn ?? []
