// Hand-written Mermaid sources for the Diagrams (dev) screen and the tests: one per supported
// type, plus sources that must fall back. No Claude call involved.

export interface DiagramFixture {
  id: string
  label: string
  source: string
  /** True when the fixture must fall back to the code block. */
  fails?: boolean
}

export const DIAGRAM_FIXTURES: DiagramFixture[] = [
  {
    id: 'flowchart',
    label: 'Flowchart (read path with a cache)',
    source: `flowchart LR
  accTitle: Lecture avec un cache
  Client[Client] --> LB[Load balancer]
  LB --> S1[Service A]
  LB --> S2[Service B]
  S1 --> C[(Cache)]
  S2 --> C
  C -- cache miss --> DB[(Database)]`
  },
  {
    id: 'sequence',
    label: 'Sequence diagram (cache-aside)',
    source: `sequenceDiagram
  participant App as Application
  participant Cache
  participant DB as Database
  App->>Cache: GET user:42
  Cache-->>App: miss
  App->>DB: SELECT user 42
  DB-->>App: row
  App->>Cache: SET user:42 (TTL 60 s)
  Note over App,Cache: la prochaine lecture est un hit`
  },
  {
    id: 'class',
    label: 'Class diagram',
    source: `classDiagram
  class Repository {
    <<interface>>
    +find(id) Entity
    +save(entity) void
  }
  class CachedRepository {
    -cache Map
    +find(id) Entity
  }
  Repository <|.. CachedRepository
  CachedRepository --> Repository : delegates`
  },
  {
    id: 'state',
    label: 'State diagram (circuit breaker)',
    source: `stateDiagram-v2
  [*] --> Closed
  Closed --> Open : trop d'erreurs
  Open --> HalfOpen : délai écoulé
  HalfOpen --> Closed : succès
  HalfOpen --> Open : échec`
  },
  {
    id: 'er',
    label: 'ER diagram (URL shortener)',
    source: `erDiagram
  USER ||--o{ SHORT_URL : creates
  SHORT_URL ||--o{ CLICK : records
  USER {
    int id PK
    string email
  }
  SHORT_URL {
    string code PK
    string target
    int user_id FK
  }`
  },
  {
    id: 'wide',
    label: 'Wide flowchart (scrolls horizontally)',
    source: `flowchart LR
  A[Navigateur] --> B[DNS] --> C[CDN] --> D[Load balancer] --> E[API gateway] --> F[Service web] --> G[File de messages] --> H[Worker] --> I[(Base de données)] --> J[(Réplique)] --> K[Entrepôt analytique]`
  },
  {
    id: 'invalid',
    label: 'Invalid syntax (falls back)',
    source: `flowchart LR
  A[Client] -->> B[Server
  B --> `,
    fails: true
  },
  {
    id: 'click',
    label: 'Click directive (refused)',
    source: `flowchart LR
  A --> B
  click A "https://example.com"`,
    fails: true
  },
  {
    id: 'html',
    label: 'HTML label (refused)',
    source: `flowchart LR
  A["<b>bold</b>"] --> B`,
    fails: true
  },
  {
    id: 'unsupported',
    label: 'Unsupported type (pie, falls back)',
    source: `pie title Trafic
  "Lectures" : 90
  "Écritures" : 10`,
    fails: true
  },
  {
    id: 'too-many-nodes',
    label: 'Too many nodes (falls back)',
    source: `flowchart TD\n${Array.from({ length: 45 }, (_, index) => `  N${index} --> N${index + 1}`).join('\n')}`,
    fails: true
  }
]

/** A short lesson with a diagram in the middle, streamed by the dev screen. */
export const STREAMING_FIXTURE = `## Cache-aside

L'application lit d'abord le cache, puis la base de données en cas de *miss* :

\`\`\`mermaid
sequenceDiagram
  participant App
  participant Cache
  participant DB
  App->>Cache: GET clé
  Cache-->>App: miss
  App->>DB: lecture
  App->>Cache: SET clé
\`\`\`

Le cache ne contient donc que les données réellement lues.
`
