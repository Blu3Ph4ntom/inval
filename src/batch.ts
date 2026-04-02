import type { BatchFn } from './types.js'
import type { Node, ComputedNode } from './types.js'

let inBatch = false
const batchedInputs = new Set<Node>()

export function batch(fn: BatchFn): Set<Node> {
  if (inBatch) {
    throw new Error('Cannot nest batch() calls')
  }

  inBatch = true
  batchedInputs.clear()

  try {
    fn()
  } finally {
    inBatch = false
  }

  const changed = collectDirtied(batchedInputs)
  batchedInputs.clear()
  return changed
}

export function trackInput(node: Node): void {
  if (inBatch) {
    batchedInputs.add(node)
  }
}

function collectDirtied(inputs: Set<Node>): Set<Node> {
  const changed = new Set<Node>()
  const queue: Node[] = [...inputs]
  const visited = new Set<Node>()

  while (queue.length > 0) {
    const node = queue.shift()!
    if (visited.has(node)) continue
    visited.add(node)
    changed.add(node)

    if (node.kind === 'input') {
      for (const child of node._children) {
        queue.push(child)
      }
    } else {
      for (const child of node._children) {
        queue.push(child)
      }
    }
  }

  return changed
}

export function isInBatch(): boolean {
  return inBatch
}
