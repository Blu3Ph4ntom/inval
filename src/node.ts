import type {
  InputNode,
  ComputedNode,
  Node,
  NodeOptions,
  InspectInfo,
} from './types.js'
import { generateId } from './types.js'
import { checkForCycles, markDirty } from './graph.js'
import { trackInput, isInBatch } from './batch.js'

export function input<T>(value: T): InputNode<T> {
  const self: InputNode<T> = {
    kind: 'input',
    id: generateId(),
    _children: new Set(),
    _value: value,
    _dirty: false,
    _disposed: false,

    get() {
      return self._value
    },

    set(newValue: T) {
      if (Object.is(self._value, newValue)) return
      self._value = newValue
      if (isInBatch()) trackInput(self)
      markDirty(self)
    },

    invalidate() {
      if (isInBatch()) trackInput(self)
      markDirty(self)
    },

    isDirty() {
      return false
    },

    inspect(): InspectInfo<T> {
      return {
        id: self.id,
        kind: 'input',
        dirty: false,
        lastValue: self._value,
        computeCount: 0,
        depCount: 0,
        childCount: self._children.size,
      }
    },

    dispose() {
      self._disposed = true
      for (const child of self._children) {
        child._parents = child._parents.filter(p => p !== self)
      }
      self._children.clear()
    },
  }

  return self
}

export function node<T>(options: NodeOptions<T>): ComputedNode<T> {
  const depEntries = Object.entries(options.dependsOn)
  const depKeys = depEntries.map(([k]) => k)
  const depNodes = depEntries.map(([, v]) => v)

  checkForCycles(depNodes)

  const self: ComputedNode<T> = {
    kind: 'computed',
    id: generateId(),
    _parents: depNodes,
    _children: new Set(),
    _compute: options.compute,
    _depKeys: depKeys,
    _depNodes: depNodes,
    _value: undefined,
    _dirty: true,
    _computeCount: 0,
    _disposed: false,

    get() {
      if (self._dirty) {
        recompute(self)
      }
      return self._value as T
    },

    invalidate() {
      if (self._dirty) return
      self._dirty = true
      markDirty(self)
    },

    isDirty() {
      return self._dirty
    },

    inspect(): InspectInfo<T> {
      return {
        id: self.id,
        kind: 'computed',
        dirty: self._dirty,
        lastValue: self._value,
        computeCount: self._computeCount,
        depCount: self._depNodes.length,
        childCount: self._children.size,
      }
    },

    dispose() {
      self._disposed = true
      for (const parent of self._parents) {
        parent._children.delete(self)
      }
      for (const child of self._children) {
        child._parents = child._parents.filter(p => p !== self)
      }
      self._parents = []
      self._children.clear()
    },
  }

  for (const parent of depNodes) {
    parent._children.add(self)
  }

  return self
}

function recompute<T>(self: ComputedNode<T>): void {
  const deps: Record<string, unknown> = {}
  for (let i = 0; i < self._depKeys.length; i++) {
    deps[self._depKeys[i]!] = self._depNodes[i]!.get()
  }
  self._value = self._compute(deps)
  self._dirty = false
  self._computeCount++
}
