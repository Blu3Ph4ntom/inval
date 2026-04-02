import { describe, it, expect } from 'bun:test'
import { input, node, batch, why, ancestors, descendants, resetIdCounter, InvalCycleError } from '../src/index.js'

describe('dispose', () => {
  it('input dispose clears children', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    expect(b._children.size).toBe(0)
    expect(a._children.size).toBe(1)
    a.dispose()
    expect(a._children.size).toBe(0)
    expect(a._disposed).toBe(true)
  })

  it('computed dispose removes from parent children', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    expect(a._children.size).toBe(1)
    b.dispose()
    expect(a._children.size).toBe(0)
    expect(b._disposed).toBe(true)
    expect(b._parents.length).toBe(0)
  })

  it('dispose disconnects chain', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) * 2,
    })
    expect(a._children.size).toBe(1)
    expect(b._children.size).toBe(1)

    b.dispose()

    expect(a._children.size).toBe(0)
    expect(b._children.size).toBe(0)
    expect(c._parents.length).toBe(0)
  })

  it('disposed input still returns value', () => {
    const a = input(42)
    a.dispose()
    expect(a.get()).toBe(42)
  })
})

describe('ancestors', () => {
  it('returns all ancestors', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) * 2,
    })
    const anc = ancestors(c)
    expect(anc.length).toBe(3)
    expect(anc[0]).toBe(c)
    expect(anc[1]).toBe(b)
    expect(anc[2]).toBe(a)
  })

  it('handles diamond', () => {
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
    const anc = ancestors(d)
    expect(anc.length).toBe(4)
  })
})

describe('descendants', () => {
  it('returns all descendants', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) * 2,
    })
    const desc = descendants(a)
    expect(desc.length).toBe(3)
    expect(desc[0]).toBe(a)
  })
})

describe('large graphs', () => {
  it('1000 nodes: set one input, only affected chain recomputes', () => {
    const inputs = Array.from({ length: 100 }, (_, i) => input(i))
    const mids = inputs.map(inp =>
      node({
        dependsOn: { inp },
        compute: ({ inp }) => (inp as number) * 2,
      }),
    )
    const leaves = mids.map(mid =>
      node({
        dependsOn: { mid },
        compute: ({ mid }) => (mid as number) + 1,
      }),
    )

    // initial compute
    leaves.forEach(l => l.get())

    // change first input
    inputs[0]!.set(100)

    // only first chain should be dirty
    expect(leaves[0]!._dirty).toBe(true)
    expect(leaves[1]!._dirty).toBe(false)
    expect(leaves[99]!._dirty).toBe(false)

    // only first chain recomputed
    leaves[0]!.get()
    expect(leaves[0]!._computeCount).toBe(2)
    expect(leaves[1]!._computeCount).toBe(1)
    expect(leaves[99]!._computeCount).toBe(1)
  })

  it('deep chain (50 levels): set + get works', () => {
    let root = input(0)
    let prev: any = root
    for (let i = 0; i < 50; i++) {
      const p = prev
      prev = node({
        dependsOn: { p },
        compute: ({ p }) => (p as number) + 1,
      })
    }
    const leaf = prev
    expect(leaf.get()).toBe(50)

    root.set(1)
    expect(leaf.get()).toBe(51)
  })

  it('fan-out (1 input -> 100 computed)', () => {
    const src = input(1)
    const fans = Array.from({ length: 100 }, (_, i) =>
      node({
        dependsOn: { src },
        compute: ({ src }) => (src as number) * i,
      }),
    )

    fans.forEach(f => f.get())
    fans.forEach(f => expect(f._computeCount).toBe(1))

    src.set(2)
    fans.forEach(f => f.get())
    fans.forEach(f => expect(f._computeCount).toBe(2))
  })
})

describe('edge cases', () => {
  it('same value set does not invalidate', () => {
    let calls = 0
    const a = input(42)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        calls++
        return (a as number) * 2
      },
    })
    b.get()
    expect(calls).toBe(1)

    a.set(42) // same value
    b.get()
    expect(calls).toBe(1) // no recomputation
  })

  it('undefined as value', () => {
    const a = input<number | undefined>(undefined)
    expect(a.get()).toBe(undefined)
    a.set(42)
    expect(a.get()).toBe(42)
  })

  it('null as value', () => {
    const a = input<string | null>(null)
    expect(a.get()).toBe(null)
    a.set('hello')
    expect(a.get()).toBe('hello')
  })

  it('object reference equality', () => {
    const obj = { x: 1 }
    const a = input(obj)
    let calls = 0
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        calls++
        return (a as typeof obj).x + 1
      },
    })
    b.get()
    expect(calls).toBe(1)

    a.set(obj) // same reference
    b.get()
    expect(calls).toBe(1) // no recomputation
  })

  it('multiple inputs to same computed', () => {
    const a = input(1)
    const b = input(2)
    const c = input(3)
    const sum = node({
      dependsOn: { a, b, c },
      compute: ({ a, b, c }) =>
        (a as number) + (b as number) + (c as number),
    })
    expect(sum.get()).toBe(6)

    a.set(10)
    expect(sum.get()).toBe(15)

    b.set(20)
    expect(sum.get()).toBe(33)

    c.set(30)
    expect(sum.get()).toBe(60)
  })

  it('computed with no dependencies', () => {
    let calls = 0
    const a = node({
      dependsOn: {},
      compute: () => {
        calls++
        return 42
      },
    })
    expect(a.get()).toBe(42)
    expect(calls).toBe(1)
    a.get()
    expect(calls).toBe(1) // cached
  })

  it('invalidate() forces recomputation', () => {
    let calls = 0
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        calls++
        return (a as number) + Date.now()
      },
    })
    b.get()
    expect(calls).toBe(1)

    b.get()
    expect(calls).toBe(1) // cached

    b.invalidate()
    b.get()
    expect(calls).toBe(2) // recomputed
  })
})

describe('why', () => {
  it('returns empty for clean node', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    const path = why(b)
    expect(path.length).toBe(0)
  })

  it('traces through diamond', () => {
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
    b.get()
    c.get()
    d.get()

    a.set(5)
    const path = why(d)
    expect(path).toContain(d.id)
    expect(path).toContain(b.id)
    expect(path).toContain(c.id)
    expect(path).toContain(a.id)
  })
})

describe('batch', () => {
  it('empty batch returns empty set', () => {
    const changed = batch(() => {})
    expect(changed.size).toBe(0)
  })

  it('batch with no changes returns only inputs', () => {
    const a = input(1)
    const changed = batch(() => {
      a.set(1) // same value
    })
    expect(changed.size).toBe(0)
  })

  it('batch returns all transitive dependents', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) * 2,
    })
    const d = node({
      dependsOn: { c },
      compute: ({ c }) => (c as number) + 1,
    })
    b.get()
    c.get()
    d.get()

    const changed = batch(() => {
      a.set(100)
    })

    expect(changed.has(a)).toBe(true)
    expect(changed.has(b)).toBe(true)
    expect(changed.has(c)).toBe(true)
    expect(changed.has(d)).toBe(true)
  })
})
