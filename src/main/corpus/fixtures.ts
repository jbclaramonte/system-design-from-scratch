// Small primer-shaped Markdown used by the corpus unit tests.

export const FIXTURE_SHA = '0123456789abcdef0123456789abcdef01234567'

export const PRIMER_FIXTURE = `# The System Design Primer

Intro that is not part of any topic.

## Anki flashcards

Download the [deck](resources/flash_cards/System%20Design.apkg).

## Cache

Caching improves page load times and can reduce the load on your servers and databases.

<img src="images/Q6z24La.png">

### Client caching

Caches can be located on the client side (OS or browser).

### When to update the cache

Since you can only store a limited amount of data in cache, you need a strategy.

#### Cache-aside

The application reads from cache first, then from storage on a miss (lazy loading).

\`\`\`python
# not a heading, inside a code fence
def get_user(user_id):
    return cache.get(user_id)
\`\`\`

##### Disadvantage(s): cache-aside

* Each cache miss results in three trips.

#### Write-through

The application uses the cache as the main data store.

### Disadvantage(s): cache

* Need to maintain consistency between caches and the source of truth.

### Source(s) and further reading

* [From cache to in-memory data grid](http://www.slideshare.net/tmatyashovsky/from-cache-to-in-memory-data-grid)
* [Scalable system design patterns](http://horicky.blogspot.com/2010/10/scalable-system-design-patterns.html)

## Load balancer

Load balancers distribute incoming client requests to computing resources.

### Horizontal scaling

Load balancers can also help with horizontal scaling.

#### Disadvantage(s): horizontal scaling

* Scaling horizontally introduces complexity.

### Source(s) and further reading

* [NGINX architecture](https://www.nginx.com/blog/inside-nginx-how-we-designed-for-performance-scale/)

## License

    Copyright 2017 Donne Martin

    Creative Commons Attribution 4.0 International License (CC BY 4.0)
`

export const SOLUTION_FIXTURE = `# Design Pastebin.com (or Bit.ly)

**Design Bit.ly** - is a similar question.

## Step 1: Outline use cases and constraints

### Use cases

* **User** enters a block of text and gets a randomly generated link

### Constraints and assumptions

* 10 million users

## Step 2: Create a high level design

![Imgur](http://i.imgur.com/BKsBnmG.png)

## Step 3: Design core components

### Use case: User enters a block of text

Use a relational database as a large hash table.

## Step 4: Scale the design

![Imgur](http://i.imgur.com/4edXG0T.png)
`

export const UPSTREAM_FILES_FIXTURE = [
  'README.md',
  'images/4edXG0T.png',
  'solutions/system_design/pastebin/README.md',
  'solutions/system_design/pastebin/__init__.py',
  'solutions/system_design/pastebin/pastebin.py',
  'solutions/system_design/pastebin/pastebin.png',
  'solutions/system_design/pastebin/pastebin_basic.png',
  'solutions/system_design/pastebin/pastebin.graffle'
]
