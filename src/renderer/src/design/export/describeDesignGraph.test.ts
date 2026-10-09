import { describe, expect, it } from 'vitest'
import { describeDesignGraph } from './describeDesignGraph'
import { buildDesignGraph } from './exportDesignGraph'
import {
  arrow,
  binding,
  branchingScene,
  chainScene,
  component,
  frame,
  link,
  page,
  PAGE_ID,
  type FixtureRecord
} from './fixtureScenes'

const describeScene = (records: FixtureRecord[]) =>
  describeDesignGraph(buildDesignGraph(records, PAGE_ID))

describe('describeDesignGraph', () => {
  it('describes a chain, with type hints for custom labels and edge labels', () => {
    expect(describeScene(chainScene())).toBe(
      [
        'Components (3): Load balancer, Service, Users (database)',
        'Connections:',
        '- Load balancer -> Service -[SQL]-> Users'
      ].join('\n')
    )
  })

  it('collapses interchangeable nodes and chains a branching scene', () => {
    expect(describeScene(branchingScene())).toBe(
      [
        'Components (7): 3x Service, Cache, Client, Load balancer, Database',
        'Connections:',
        '- Client -[HTTPS]-> Load balancer -> 3x Service -> Cache, Database',
        'Notes:',
        '- "Reads are ~100x writes" (near Cache)',
        '- "Single region for now"'
      ].join('\n')
    )
  })

  it('numbers nodes that share a label but differ, and lists isolated and dangling ones', () => {
    const records = [
      page(),
      component('lb', 'load-balancer', 0, 0),
      component('a', 'service', 300, 0),
      component('b', 'service', 300, 200),
      component('db', 'database', 600, 0, ''),
      component('cdn', 'cdn', 0, 400),
      ...link('e1', 'lb', 'a'),
      ...link('e2', 'a', 'db'),
      ...link('e3', 'b', 'db'),
      arrow('loose', { label: 'async' }),
      binding('loose', 'start', 'b'),
      frame('f', -50, -50, 'Edge'),
      { ...component('in-frame', 'queue', 10, 10), parentId: 'shape:f' }
    ]

    expect(describeScene(records)).toBe(
      [
        'Components (6): Queue, Load balancer, Service #1, unlabeled database, Service #2, CDN',
        'Connections:',
        '- Load balancer -> Service #1 -> unlabeled database',
        '- Service #2 -> unlabeled database',
        'Not connected: Queue, CDN',
        'Arrows not connected at both ends:',
        '- Service #2 -[async]-> (nothing)',
        'Groups:',
        '- frame "Edge": Queue'
      ].join('\n')
    )
  })

  it('describes an empty scene', () => {
    expect(describeScene([page()])).toBe('Empty design: no components.')
  })
})
