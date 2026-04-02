import { describe, it, expect } from 'bun:test'
import { input, node, batch, why, toDot, stats, InvalCycleError } from '../src/index.js'

describe('input', () => {
  it('creates an input node with initial value', () => {
    const a = input(42)
    expect(a.get()).toBe(42)
    expect(a.kind).toBe('input')
  })

  it('updates value with set()', () => {
    const a = input(1)
    a.set(2)
    expect(a.get()).toBe(2)
  })

  it('skips propagation when value is same', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    expect(b._computeCount).toBe(1)
    a.set(1)
    expect(b._dirty).toBe(false)
  })

  it('marks dependents dirty on set()', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    expect(b._dirty).toBe(false)
    a.set(2)
    expect(b._dirty).toBe(true)
  })

  it('inspect returns correct info', () => {
    const a = input(10)
    const info = a.inspect()
    expect(info.kind).toBe('input')
    expect(info.lastValue).toBe(10)
    expect(info.dirty).toBe(false)
    expect(info.computeCount).toBe(0)
  })
})

describe('node', () => {
  it('computes value lazily on get()', () => {
    const a = input(2)
    const b = input(3)
    const sum = node({
      dependsOn: { a, b },
      compute: ({ a, b }) => (a as number) + (b as number),
    })
    expect(sum.get()).toBe(5)
  })

  it('caches computed value', () => {
    let calls = 0
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        calls++
        return (a as number) * 2
      },
    })
    b.get()
    b.get()
    expect(calls).toBe(1)
  })

  it('recomputes when dependency changes', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    expect(b.get()).toBe(2)
    a.set(5)
    expect(b.get()).toBe(10)
  })

  it('propagates through chains', () => {
    const width = input(1000)
    const textHeight = node({
      dependsOn: { width },
      compute: ({ width }) => Math.ceil(1000 / (width as number)),
    })
    const cardHeight = node({
      dependsOn: { h: textHeight },
      compute: ({ h }) => (h as number) + 32,
    })
    expect(cardHeight.get()).toBe(33)
    width.set(500)
    expect(cardHeight.get()).toBe(34)
  })

  it('handles diamond dependencies', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    const d = node({
      dependsOn: { b, c },
      compute: ({ b, c }) => (b as number) + (c as number),
    })
    expect(d.get()).toBe(4)
    a.set(2)
    expect(d.get()).toBe(7)
  })

  it('only recomputes dirty nodes', () => {
    const a = input(1)
    const b = input(2)
    const c = node({
      dependsOn: { a, b },
      compute: ({ a, b }) => (a as number) + (b as number),
    })
    c.get()
    expect(c._computeCount).toBe(1)
    a.set(10)
    c.get()
    expect(c._computeCount).toBe(2)
    c.get()
    expect(c._computeCount).toBe(2)
  })

  it('incremental compute count tracks correctly', () => {
    const a = input(0)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    expect(b._computeCount).toBe(0)
    b.get()
    expect(b._computeCount).toBe(1)
    a.set(1)
    b.get()
    expect(b._computeCount).toBe(2)
  })

  it('inspect returns correct info', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    const info = b.inspect()
    expect(info.kind).toBe('computed')
    expect(info.dirty).toBe(true)
    expect(info.computeCount).toBe(0)
  })

  it('deep chain recomputes in order', () => {
    const width = input(800)
    const lines = node({
      dependsOn: { w: width },
      compute: ({ w }) => Math.ceil(2000 / (w as number)),
    })
    const textH = node({
      dependsOn: { lines },
      compute: ({ lines }) => (lines as number) * 18,
    })
    const totalH = node({
      dependsOn: { textH },
      compute: ({ textH }) => (textH as number) + 16,
    })
    expect(totalH.get()).toBe(70)
    width.set(400)
    expect(totalH.get()).toBe(106)
  })
})

describe('batch', () => {
  it('batches multiple set operations', () => {
    const a = input(1)
    const b = input(2)
    const sum = node({
      dependsOn: { a, b },
      compute: ({ a, b }) => (a as number) + (b as number),
    })
    sum.get()
    const changed = batch(() => {
      a.set(10)
      b.set(20)
    })
    expect(changed.size).toBe(3)
    expect(changed.has(a)).toBe(true)
    expect(changed.has(b)).toBe(true)
    expect(changed.has(sum)).toBe(true)
    expect(sum.get()).toBe(30)
  })

  it('throws on nested batch', () => {
    const a = input(1)
    expect(() => {
      batch(() => {
        batch(() => {
          a.set(2)
        })
      })
    }).toThrow('Cannot nest batch() calls')
  })

  it('batch tracks all dirtied nodes', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) + 1,
    })
    b.get()
    c.get()
    const changed = batch(() => {
      a.set(100)
    })
    expect(changed.has(a)).toBe(true)
    expect(changed.has(b)).toBe(true)
    expect(changed.has(c)).toBe(true)
  })
})

describe('why', () => {
  it('traces invalidation from computed node', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    a.set(10)
    const path = why(b)
    expect(path.length).toBe(2)
    expect(path[0]).toBe(b.id)
    expect(path[1]).toBe(a.id)
  })

  it('traces deep chain', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) + 1,
    })
    b.get()
    c.get()
    a.set(5)
    const path = why(c)
    expect(path.length).toBe(3)
    expect(path[0]).toBe(c.id)
    expect(path[1]).toBe(b.id)
    expect(path[2]).toBe(a.id)
  })
})

describe('toDot', () => {
  it('generates valid dot graph', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const dot = toDot([b])
    expect(dot).toContain('digraph inval')
    expect(dot).toContain(a.id)
    expect(dot).toContain(b.id)
    expect(dot).toContain('->')
  })
})

describe('stats', () => {
  it('counts nodes and edges', () => {
    const a = input(1)
    const b = input(2)
    const c = node({
      dependsOn: { a, b },
      compute: ({ a, b }) => (a as number) + (b as number),
    })
    c.get()
    const s = stats([c])
    expect(s.inputCount).toBe(2)
    expect(s.computedCount).toBe(1)
    expect(s.edgeCount).toBe(2)
    expect(s.totalComputeCalls).toBe(1)
  })

  it('counts after multiple recompute', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    a.set(2)
    b.get()
    a.set(3)
    b.get()
    const s = stats([b])
    expect(s.totalComputeCalls).toBe(3)
  })
})
