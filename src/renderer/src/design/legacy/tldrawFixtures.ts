import { COMPONENT_LOOKS, type ComponentType } from '../componentTypes'

/**
 * Test fixtures: tldraw store records shaped like the ones of a real Design Scene (as found in
 * `getSnapshot(editor.store).document.store`), built by hand so the tests run without an editor.
 */

export const PAGE_ID = 'page:page'

export type FixtureRecord = Record<string, unknown> & { id: string; typeName: string }

export function richText(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

const shapeBase = (id: string, type: string, x: number, y: number, parentId = PAGE_ID) => ({
  id: `shape:${id}`,
  typeName: 'shape',
  type,
  x,
  y,
  rotation: 0,
  index: 'a1',
  parentId,
  isLocked: false,
  opacity: 1,
  meta: {}
})

export function page(id = PAGE_ID, index = 'a1'): FixtureRecord {
  return { id, typeName: 'page', name: 'Page 1', index, meta: {} }
}

export function component(
  id: string,
  type: ComponentType,
  x: number,
  y: number,
  text = COMPONENT_LOOKS[type].label,
  parentId?: string
): FixtureRecord {
  const { defaultW: w, defaultH: h } = COMPONENT_LOOKS[type]
  return { ...shapeBase(id, type, x, y, parentId), props: { w, h, text } }
}

/**
 * An arrow. `start` / `end` are the stored terminal points; for a bound arrow tldraw does not
 * keep them up to date, so the tests set them to misleading values on purpose.
 */
export function arrow(
  id: string,
  options: {
    label?: string
    arrowheadStart?: string
    arrowheadEnd?: string
    start?: { x: number; y: number }
    end?: { x: number; y: number }
  } = {}
): FixtureRecord {
  return {
    ...shapeBase(id, 'arrow', 0, 0),
    props: {
      kind: 'arc',
      richText: richText(options.label ?? ''),
      arrowheadStart: options.arrowheadStart ?? 'none',
      arrowheadEnd: options.arrowheadEnd ?? 'arrow',
      start: options.start ?? { x: 0, y: 0 },
      end: options.end ?? { x: 100, y: 0 },
      bend: 0
    }
  }
}

export function binding(arrowId: string, terminal: 'start' | 'end', targetId: string) {
  return {
    id: `binding:${arrowId}-${terminal}`,
    typeName: 'binding',
    type: 'arrow',
    fromId: `shape:${arrowId}`,
    toId: `shape:${targetId}`,
    props: {
      terminal,
      normalizedAnchor: { x: 0.5, y: 0.5 },
      isExact: false,
      isPrecise: false,
      snap: 'none'
    },
    meta: {}
  }
}

/** An arrow bound at both ends. */
export function link(id: string, from: string, to: string, label?: string): FixtureRecord[] {
  return [arrow(id, { label }), binding(id, 'start', from), binding(id, 'end', to)]
}

export function text(id: string, x: number, y: number, value: string): FixtureRecord {
  return { ...shapeBase(id, 'text', x, y), props: { richText: richText(value), w: 200 } }
}

export function note(id: string, x: number, y: number, value: string): FixtureRecord {
  return { ...shapeBase(id, 'note', x, y), props: { richText: richText(value), color: 'yellow' } }
}

export function geo(id: string, x: number, y: number, value: string, parentId?: string) {
  return {
    ...shapeBase(id, 'geo', x, y, parentId),
    props: { geo: 'rectangle', w: 120, h: 60, richText: richText(value) }
  }
}

export function frame(id: string, x: number, y: number, name: string): FixtureRecord {
  return { ...shapeBase(id, 'frame', x, y), props: { w: 600, h: 400, name } }
}

/** Load balancer -> Service -> Database. */
export function chainScene(): FixtureRecord[] {
  return [
    page(),
    component('lb', 'load-balancer', 0, 0),
    component('svc', 'service', 300, 0),
    component('db', 'database', 600, 0, 'Users'),
    ...link('a1', 'lb', 'svc'),
    ...link('a2', 'svc', 'db', 'SQL')
  ]
}

/** Client -> Load balancer -> 3 services -> Cache and Database, with notes. */
export function branchingScene(): FixtureRecord[] {
  const services = ['s1', 's2', 's3']
  return [
    page(),
    component('client', 'client', 0, 200),
    component('lb', 'load-balancer', 250, 200),
    ...services.map((id, i) => component(id, 'service', 500, 50 + i * 150)),
    component('cache', 'cache', 800, 100),
    component('db', 'database', 800, 300),
    ...link('e-client', 'client', 'lb', 'HTTPS'),
    ...services.flatMap((id) => [
      ...link(`e-lb-${id}`, 'lb', id),
      ...link(`e-${id}-cache`, id, 'cache'),
      ...link(`e-${id}-db`, id, 'db')
    ]),
    text('n-reads', 800, 240, 'Reads are ~100x writes'),
    note('n-far', 2000, 2000, 'Single region for now')
  ]
}
