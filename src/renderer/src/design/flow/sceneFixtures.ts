import { COMPONENT_LOOKS } from '../componentTypes'
import type { Scene, SceneEdge, SceneNode } from './scene'

/** Test fixtures: scenes shaped like the ones the editor stores. */

export const component = (
  id: string,
  componentType: Extract<SceneNode, { type: 'component' }>['data']['componentType'],
  x: number,
  y: number,
  label = COMPONENT_LOOKS[componentType].label,
  parentId?: string
): SceneNode => ({
  id,
  type: 'component',
  position: { x, y },
  width: 160,
  height: 90,
  data: { componentType, label },
  ...(parentId ? { parentId } : {})
})

export const note = (
  id: string,
  x: number,
  y: number,
  text: string,
  parentId?: string
): SceneNode => ({
  id,
  type: 'note',
  position: { x, y },
  width: 200,
  height: 120,
  data: { text },
  ...(parentId ? { parentId } : {})
})

export const group = (
  id: string,
  x: number,
  y: number,
  label: string,
  parentId?: string,
  width = 480,
  height = 320
): SceneNode => ({
  id,
  type: 'group',
  position: { x, y },
  width,
  height,
  data: { label },
  ...(parentId ? { parentId } : {})
})

export const edge = (
  id: string,
  source: string,
  target: string,
  direction: SceneEdge['data']['direction'] = 'forward',
  label = ''
): SceneEdge => ({ id, source, target, data: { label, direction } })

export const scene = (nodes: SceneNode[], edges: SceneEdge[] = []): Scene => ({
  version: 1,
  nodes,
  edges,
  viewport: { x: 0, y: 0, zoom: 1 }
})

/** Client -> Load balancer -> 2 services -> database, a cache, a note and a group. */
export function architectureScene(): Scene {
  return scene(
    [
      group('g-backend', 400, 0, 'Backend'),
      component('client', 'client', 0, 100),
      component('lb', 'load-balancer', 200, 100),
      component('svc-a', 'service', 40, 40, 'Service A', 'g-backend'),
      component('svc-b', 'service', 40, 180, 'Service B', 'g-backend'),
      component('db', 'database', 760, 100, 'Users'),
      component('cache', 'cache', 400, 400),
      note('note', 760, 300, 'Reads are ~100x writes')
    ],
    [
      edge('e1', 'client', 'lb', 'forward', 'HTTPS'),
      edge('e2', 'lb', 'svc-a'),
      edge('e3', 'lb', 'svc-b'),
      edge('e4', 'svc-a', 'db', 'both', 'SQL'),
      edge('e5', 'svc-b', 'db', 'none'),
      edge('e6', 'cache', 'svc-a', 'backward')
    ]
  )
}

/** Load balancer -> Service -> Database (ported from the tldraw fixture of the same name). */
export function chainScene(): Scene {
  return scene(
    [
      component('lb', 'load-balancer', 0, 0),
      component('svc', 'service', 300, 0),
      component('db', 'database', 600, 0, 'Users')
    ],
    [edge('a1', 'lb', 'svc'), edge('a2', 'svc', 'db', 'forward', 'SQL')]
  )
}

/** Client -> Load balancer -> 3 services -> Cache and Database, with two notes. */
export function branchingScene(): Scene {
  const services = ['s1', 's2', 's3']
  return scene(
    [
      component('client', 'client', 0, 200),
      component('lb', 'load-balancer', 250, 200),
      ...services.map((id, i) => component(id, 'service', 500, 50 + i * 150)),
      component('cache', 'cache', 800, 100),
      component('db', 'database', 800, 300),
      note('n-reads', 800, -40, 'Reads are ~100x writes'),
      note('n-far', 2000, 2000, 'Single region for now')
    ],
    [
      edge('e-client', 'client', 'lb', 'forward', 'HTTPS'),
      ...services.flatMap((id) => [
        edge(`e-lb-${id}`, 'lb', id),
        edge(`e-${id}-cache`, id, 'cache'),
        edge(`e-${id}-db`, id, 'db')
      ])
    ]
  )
}
