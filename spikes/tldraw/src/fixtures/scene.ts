/**
 * Fixture scene as tldraw shape/binding partials (`editor.createShapes` / `createBindings` accept
 * them as-is) that also satisfy the SceneShape/SceneBinding shapes used by buildGraph.
 *
 * Layout (x grows right):
 *   Client -> Load balancer -> Cache -> Database
 *                  \-> Queue ----------^
 */

/** Minimal tldraw rich text document (same JSON that `toRichText` produces). */
const rt = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: text ? [{ type: 'text', text }] : [] }],
})

const component = (id: string, type: string, x: number, y: number, text: string, h = 90) => ({
  id: `shape:${id}`,
  type,
  x,
  y,
  props: { w: 160, h, text },
})

/** Arrow attached to a start/end shape: start and end offsets are in the arrow's own space. */
const arrow = (id: string, x: number, y: number, dx: number, dy: number, label: string) => ({
  id: `shape:${id}`,
  type: 'arrow',
  x,
  y,
  props: {
    start: { x: 0, y: 0 },
    end: { x: dx, y: dy },
    arrowheadStart: 'none',
    arrowheadEnd: 'arrow',
    richText: rt(label),
  },
})

const bind = (arrowId: string, terminal: 'start' | 'end', toId: string) => ({
  type: 'arrow' as const,
  fromId: `shape:${arrowId}`,
  toId: `shape:${toId}`,
  props: {
    terminal,
    normalizedAnchor: { x: 0.5, y: 0.5 },
    isExact: false,
    isPrecise: false,
    snap: 'none' as const,
  },
})

export const fixtureShapes = [
  {
    id: 'shape:client',
    type: 'geo',
    x: 0,
    y: 0,
    props: { w: 140, h: 90, geo: 'rectangle', richText: rt('Client') },
  },
  component('lb', 'load-balancer', 240, 0, 'Load balancer'),
  component('cache', 'cache', 480, 0, 'Cache'),
  component('db', 'database', 720, 0, 'Database', 110),
  component('queue', 'queue', 480, 200, 'Write queue'),
  arrow('e1', 140, 45, 100, 0, 'HTTPS'),
  arrow('e2', 400, 45, 80, 0, 'GET /{id}'),
  arrow('e3', 640, 45, 80, 10, 'cache miss'),
  arrow('e4', 320, 90, 160, 155, 'POST /shorten'),
  arrow('e5', 640, 245, 160, -80, 'async drain'),
  {
    id: 'shape:note1',
    type: 'text',
    x: 240,
    y: 330,
    props: { richText: rt('Reads are ~100x writes; cache TTL 1h.'), w: 300, autoSize: true },
  },
  {
    id: 'shape:note2',
    type: 'note',
    x: 640,
    y: 330,
    props: { richText: rt('Single DB primary for now') },
  },
]

export const fixtureBindings = [
  bind('e1', 'start', 'client'),
  bind('e1', 'end', 'lb'),
  bind('e2', 'start', 'lb'),
  bind('e2', 'end', 'cache'),
  bind('e3', 'start', 'cache'),
  bind('e3', 'end', 'db'),
  bind('e4', 'start', 'lb'),
  bind('e4', 'end', 'queue'),
  bind('e5', 'start', 'queue'),
  bind('e5', 'end', 'db'),
]
