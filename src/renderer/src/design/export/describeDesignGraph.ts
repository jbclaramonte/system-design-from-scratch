import type { DesignGraph, DesignGraphEdge, EdgeDirection } from '../../../../shared/designGraph'
import { COMPONENT_LOOKS } from '../componentTypes'

/**
 * Compact text rendering of a Design Graph, put into the LLM prompt next to the JSON so the
 * structure reads at a glance, for example:
 *
 *   Components (6): Client, Load balancer, 3x Service, Cache, Users (database)
 *   Connections:
 *   - Client -[HTTPS]-> Load balancer -> 3x Service -> Cache, Users
 *
 * Nodes with the same type, label and connections are collapsed ("3x Service"). Other nodes
 * sharing a label get a number ("Service #1"). Deterministic: it follows the graph order.
 */

const ARROWS: Record<EdgeDirection, [string, string]> = {
  forward: ['-', '->'],
  backward: ['<-', '-'],
  both: ['<-', '->'],
  none: ['-', '-']
}

const quote = (text: string) => JSON.stringify(text.replace(/\s+/g, ' '))

interface Unit {
  key: string
  nodeIds: string[]
  name: string
}

/** Arrow text between two names: `->`, or `-[label]->` with a label. */
function connector(direction: EdgeDirection, label: string): string {
  const [tail, head] = ARROWS[direction]
  if (!label)
    return direction === 'none' ? '--' : direction === 'both' ? '<->' : tail + head.slice(1)
  return `${tail}[${label.replace(/\s+/g, ' ')}]${head}`
}

export function describeDesignGraph(graph: DesignGraph): string {
  if (graph.nodes.length === 0 && graph.annotations.length === 0 && graph.edges.length === 0) {
    return graph.danglingArrows.length === 0
      ? 'Empty design: no components.'
      : `No components. ${graph.danglingArrows.length} arrow(s) not connected to anything.`
  }

  // Collapse nodes that are interchangeable: same type, label and connections.
  const edgeKey = (edge: DesignGraphEdge, end: 'from' | 'to') =>
    `${edge[end]}|${edge.direction}|${edge.label}`
  const signature = (nodeId: string): string => {
    const node = graph.nodes.find(({ id }) => id === nodeId)!
    const incoming = graph.edges.filter((e) => e.to === nodeId).map((e) => edgeKey(e, 'from'))
    const outgoing = graph.edges.filter((e) => e.from === nodeId).map((e) => edgeKey(e, 'to'))
    const touchesItself = graph.edges.some((e) => e.from === nodeId && e.to === nodeId)
    return JSON.stringify([
      node.componentType,
      node.label,
      incoming.sort(),
      outgoing.sort(),
      touchesItself ? nodeId : ''
    ])
  }

  const units: Unit[] = []
  const unitOf = new Map<string, Unit>()
  for (const node of graph.nodes) {
    const key = signature(node.id)
    let unit = units.find((u) => u.key === key)
    if (!unit) {
      unit = { key, nodeIds: [], name: '' }
      units.push(unit)
    }
    unit.nodeIds.push(node.id)
    unitOf.set(node.id, unit)
  }

  // Names: label (or "unlabeled <type>"), "Nx" prefix when collapsed, "#n" when ambiguous.
  const baseName = (unit: Unit) => {
    const node = graph.nodes.find(({ id }) => id === unit.nodeIds[0])!
    const label = node.label.replace(/\s+/g, ' ') || `unlabeled ${node.componentType}`
    return unit.nodeIds.length > 1 ? `${unit.nodeIds.length}x ${label}` : label
  }
  const nameCounts = new Map<string, number>()
  for (const unit of units) {
    const base = baseName(unit)
    nameCounts.set(base, (nameCounts.get(base) ?? 0) + 1)
  }
  const seen = new Map<string, number>()
  for (const unit of units) {
    const base = baseName(unit)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    unit.name = (nameCounts.get(base) ?? 0) > 1 ? `${base} #${n}` : base
  }

  const typeHint = (unit: Unit) => {
    const node = graph.nodes.find(({ id }) => id === unit.nodeIds[0])!
    const defaultLabel = COMPONENT_LOOKS[node.componentType].label.toLowerCase()
    const obvious = !node.label || node.label.toLowerCase() === defaultLabel
    return obvious ? '' : ` (${node.componentType})`
  }

  const lines: string[] = []
  lines.push(
    `Components (${graph.nodes.length}): ` +
      (units.length ? units.map((unit) => unit.name + typeHint(unit)).join(', ') : 'none')
  )

  // Connections between units, one line per (source, arrow, label), duplicates dropped.
  interface Line {
    source: Unit
    connector: string
    targets: Unit[]
  }
  const connectionLines: Line[] = []
  for (const edge of graph.edges) {
    const source = unitOf.get(edge.from)!
    const target = unitOf.get(edge.to)!
    const link = connector(edge.direction, edge.label)
    let line = connectionLines.find((l) => l.source === source && l.connector === link)
    if (!line) {
      line = { source, connector: link, targets: [] }
      connectionLines.push(line)
    }
    if (!line.targets.includes(target)) line.targets.push(target)
  }

  // Chain "A -> B" with B's own single line when B has no other incoming line: A -> B -> C.
  const incomingLines = (unit: Unit) => connectionLines.filter((l) => l.targets.includes(unit))
  const outgoingLines = (unit: Unit) => connectionLines.filter((l) => l.source === unit)
  const chains: string[] = []
  const used = new Set<Line>()
  const isChainStart = (line: Line) => {
    const into = incomingLines(line.source)
    return !(
      into.length === 1 &&
      into[0]!.targets.length === 1 &&
      into[0]!.source !== line.source &&
      outgoingLines(line.source).length === 1
    )
  }
  const render = (start: Line) => {
    let text = start.source.name
    let line: Line | undefined = start
    while (line && !used.has(line)) {
      used.add(line)
      text += ` ${line.connector} ${line.targets.map((t) => t.name).join(', ')}`
      const next: Line[] = line.targets.length === 1 ? outgoingLines(line.targets[0]!) : []
      line = next.length === 1 && incomingLines(line.targets[0]!).length === 1 ? next[0] : undefined
    }
    chains.push(`- ${text}`)
  }
  for (const line of connectionLines) if (!used.has(line) && isChainStart(line)) render(line)
  for (const line of connectionLines) if (!used.has(line)) render(line) // cycles
  if (chains.length) lines.push('Connections:', ...chains)

  const connected = new Set(graph.edges.flatMap((e) => [e.from, e.to]))
  const isolated = units.filter((unit) => !unit.nodeIds.some((id) => connected.has(id)))
  if (graph.edges.length && isolated.length) {
    lines.push(`Not connected: ${isolated.map((unit) => unit.name).join(', ')}`)
  }

  const nameOf = (nodeId: string | null) => (nodeId ? unitOf.get(nodeId)!.name : null)
  if (graph.danglingArrows.length) {
    lines.push('Arrows not connected at both ends:')
    for (const arrow of graph.danglingArrows) {
      const link = connector('forward', arrow.label)
      lines.push(
        `- ${nameOf(arrow.from) ?? '(nothing)'} ${link} ${nameOf(arrow.to) ?? '(nothing)'}`
      )
    }
  }

  if (graph.annotations.length) {
    lines.push('Notes:')
    for (const annotation of graph.annotations) {
      const near = nameOf(annotation.nearestNodeId)
      lines.push(`- ${quote(annotation.text)}${near ? ` (near ${near})` : ''}`)
    }
  }

  if (graph.groups.length) {
    const memberName = (id: string) => {
      const annotation = graph.annotations.find((a) => a.id === id)
      return annotation ? `note ${quote(annotation.text)}` : nameOf(id)!
    }
    lines.push('Groups:')
    for (const group of graph.groups) {
      const title = group.label ? `${group.kind} ${quote(group.label)}` : group.kind
      const names = [...new Set(group.memberIds.map(memberName))]
      lines.push(`- ${title}: ${names.length ? names.join(', ') : 'empty'}`)
    }
  }

  return lines.join('\n')
}
