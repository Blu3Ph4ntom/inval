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
  if (!target._dirty && target.kind === 'computed') return []

  const path: string[] = []
  const visited = new Set<Node>()

  function trace(node: Node): void {
    if (visited.has(node)) return
    visited.add(node)

    path.push(node.id)

    if (node.kind === 'computed') {
      for (const parent of node._parents) {
        if (parent.kind === 'computed' && parent._dirty) {
          trace(parent)
        } else if (parent.kind === 'input') {
          path.push(parent.id)
        }
      }
    }
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
