import type { Node } from './types.js'

export function toDot(nodes: Node[]): string {
  const lines: string[] = ['digraph inval {']
  const visited = new Set<Node>()

  function addNode(node: Node): void {
    if (visited.has(node)) return
    visited.add(node)

    const label =
      node.kind === 'input'
        ? `${node.id} [input]`
        : `${node.id} [computed]`
    lines.push(`  "${node.id}" [label="${label}"];`)

    if (node.kind === 'computed') {
      for (const parent of node._parents) {
        lines.push(`  "${parent.id}" -> "${node.id}";`)
        addNode(parent)
      }
    }
  }

  for (const node of nodes) {
    addNode(node)
  }

  lines.push('}')
  return lines.join('\n')
}

export function stats(nodes: Node[]): {
  nodeCount: number
  inputCount: number
  computedCount: number
  edgeCount: number
  totalComputeCalls: number
} {
  let inputCount = 0
  let computedCount = 0
  let edgeCount = 0
  let totalComputeCalls = 0

  const visited = new Set<Node>()

  function count(node: Node): void {
    if (visited.has(node)) return
    visited.add(node)

    if (node.kind === 'input') {
      inputCount++
    } else {
      computedCount++
      edgeCount += node._parents.length
      totalComputeCalls += node._computeCount
      for (const parent of node._parents) {
        count(parent)
      }
    }
  }

  for (const node of nodes) {
    count(node)
  }

  return {
    nodeCount: inputCount + computedCount,
    inputCount,
    computedCount,
    edgeCount,
    totalComputeCalls,
  }
}
