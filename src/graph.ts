import type { Node, ComputedNode } from './types.js'

export class InvalCycleError extends Error {
  constructor(path: string[]) {
    super(`Cycle detected: ${path.join(' \u2192 ')}`)
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
  const visited = new Set<ComputedNode>()
  const queue: ComputedNode[] = []

  for (const child of source._children) {
    if (!visited.has(child)) {
      visited.add(child)
      queue.push(child)
      collectChildren(child, queue, visited)
    }
  }

  for (const child of queue) {
    child._dirty = true
  }
}

function collectChildren(
  node: ComputedNode,
  queue: ComputedNode[],
  visited: Set<ComputedNode>,
): void {
  for (const child of node._children) {
    if (!visited.has(child)) {
      visited.add(child)
      queue.push(child)
      collectChildren(child, queue, visited)
    }
  }
}

export function why(target: Node): string[] {
  if (target.kind === 'computed' && !target._dirty) return []

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
          if (!visited.has(parent)) {
            visited.add(parent)
            path.push(parent.id)
          }
        }
      }
    }
  }

  trace(target)
  return path
}

export function ancestors(node: Node): Node[] {
  const result: Node[] = []
  const visited = new Set<Node>()

  function walk(n: Node): void {
    if (visited.has(n)) return
    visited.add(n)
    result.push(n)
    if (n.kind === 'computed') {
      for (const parent of n._parents) {
        walk(parent)
      }
    }
  }

  walk(node)
  return result
}

export function descendants(node: Node): Node[] {
  const result: Node[] = []
  const visited = new Set<Node>()

  function walk(n: Node): void {
    if (visited.has(n)) return
    visited.add(n)
    result.push(n)
    for (const child of n._children) {
      walk(child)
    }
  }

  walk(node)
  return result
}
