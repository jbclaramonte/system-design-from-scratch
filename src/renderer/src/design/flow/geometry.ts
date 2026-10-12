/** Position of a node on the canvas: its own position plus the offsets of its groups. Bounded. */
export function absolutePositionIn<
  N extends { id: string; position: { x: number; y: number }; parentId?: string | undefined }
>(node: N, byId: ReadonlyMap<string, N>): { x: number; y: number } {
  let { x, y } = node.position
  let parent = node.parentId ? byId.get(node.parentId) : undefined
  for (let hops = 0; parent && hops <= byId.size; hops++) {
    x += parent.position.x
    y += parent.position.y
    parent = parent.parentId ? byId.get(parent.parentId) : undefined
  }
  return { x, y }
}
