import type { Node, ComputedNode } from './types.js'

export class InvalCycleError extends Error {
  constructor(path: string[]) {
    super(`Cycle detected: ${path.join(' → ')}`)
    this.name = 'InvalCycleError'
  }
}

export function checkForCycles(roots: Node[]): void {
  const visiting = new Set<Node>()
  const visited = new Set<Node>()

  function dfs(node: Node, path: string[]): void {
    if (visited.has(node)) return
    if (visiting.has(node)) {
      throw new InvalCycleError([...path, node.id])
    }
    visiting.add(node)
    path.push(node.id)
    if (node.kind === 'computed') {
      for (const parent of node._parents) {
        dfs(parent, path)
      }
    }
    path.pop()
    visiting.delete(node)
    visited.add(node)
  }

  for (const root of roots) {
    dfs(root, [])
  }
}

export function markDirty(source: Node): void {
  const queue: ComputedNode[] = []
  const visited = new Set<ComputedNode>()

  collectChildren(source, queue, visited)

  for (const child of queue) {
    child._dirty = true
  }
}

function collectChildren(
  node: Node,
  queue: ComputedNode[],
  visited: Set<ComputedNode>,
): void {
  if (node.kind === 'input') {
    for (const child of node._children) {
      if (!visited.has(child)) {
        visited.add(child)
        queue.push(child)
        collectChildren(child, queue, visited)
      }
    }
  } else {
    for (const child of node._children) {
      if (!visited.has(child)) {
        visited.add(child)
        queue.push(child)
        collectChildren(child, queue, visited)
      }
    }
  }
}

export function why(target: Node): string[] {
  const path: string[] = []
  const visited = new Set<Node>()

  function trace(node: Node): boolean {
    if (visited.has(node)) return false
    visited.add(node)

    if (node.kind === 'input' && node._dirty) {
      path.push(node.id)
      return true
    }

    if (node.kind === 'computed') {
      for (const parent of node._parents) {
        if (trace(parent)) {
          path.push(node.id)
          return true
        }
      }
    }

    return false
  }

  trace(target)
  return path
}

export function nodeCount(): number {
  return parseInt(globalThis.__inval_nodeCount ?? '0', 10)
}

declare global {
  var __inval_nodeCount: string | undefined
}
