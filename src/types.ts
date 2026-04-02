export interface InputNode<T = unknown> {
  readonly kind: 'input'
  readonly id: string
  get(): T
  set(value: T): void
  invalidate(): void
  isDirty(): boolean
  inspect(): InspectInfo<T>
  dispose(): void
  _children: Set<ComputedNode>
  _value: T
  _dirty: boolean
  _disposed: boolean
}

export interface ComputedNode<T = unknown> {
  readonly kind: 'computed'
  readonly id: string
  get(): T
  invalidate(): void
  isDirty(): boolean
  inspect(): InspectInfo<T>
  dispose(): void
  _parents: Node[]
  _children: Set<ComputedNode>
  _compute: (deps: Record<string, unknown>) => T
  _depKeys: string[]
  _depNodes: Node[]
  _value: T | undefined
  _dirty: boolean
  _computeCount: number
  _disposed: boolean
}

export type Node<T = unknown> = InputNode<T> | ComputedNode<T>

export interface InspectInfo<T = unknown> {
  id: string
  kind: 'input' | 'computed'
  dirty: boolean
  lastValue: T | undefined
  computeCount: number
  depCount: number
  childCount: number
}

export interface NodeOptions<T = unknown> {
  dependsOn: Record<string, Node>
  compute: (deps: Record<string, unknown>) => T
}

export type BatchFn = () => void

let nextId = 0

export function generateId(): string {
  return `n${nextId++}`
}

export function resetIdCounter(): void {
  nextId = 0
}
