import { describe, it, expect } from 'bun:test'
import { input, node, batch, why, ancestors, descendants, graphSize, InvalCycleError } from '../src/index.js'

describe('error handling', () => {
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

  it('batch rethrows compute errors', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: () => {
        throw new Error('compute failed')
      },
    })
    expect(() => b.get()).toThrow('compute failed')
  })

  it('batch continues after error in fn', () => {
    const a = input(1)
    expect(() => {
      batch(() => {
        a.set(2)
        throw new Error('fn error')
      })
    }).toThrow('fn error')
    expect(a.get()).toBe(2)
  })

  it('input invalidate marks dependents dirty', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    expect(b._dirty).toBe(false)

    a.invalidate()
    expect(b._dirty).toBe(true)
  })

  it('input invalidate with batch', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()

    const changed = batch(() => {
      a.invalidate()
    })
    expect(changed.has(a)).toBe(true)
    expect(changed.has(b)).toBe(true)
  })

  it('computed invalidate forces recompute', () => {
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
    expect(calls).toBe(1)

    b.invalidate()
    b.get()
    expect(calls).toBe(2)
  })

  it('dispose prevents further invalidation', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()

    b.dispose()

    a.set(100)
    expect(b._dirty).toBe(false)
    expect(b.get()).toBe(2) // stale value
  })
})

describe('graphSize', () => {
  it('returns number of nodes reachable from root', () => {
    const a = input(1)
    const b = input(2)
    const c = node({
      dependsOn: { a, b },
      compute: ({ a, b }) => (a as number) + (b as number),
    })
    expect(graphSize(c)).toBe(3)
  })

  it('handles diamond correctly', () => {
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
    expect(graphSize(d)).toBe(4)
  })
})

describe('invalidation order', () => {
  it('recomputes parents before children (depth-first)', () => {
    const order: string[] = []
    const a = input(1)

    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        order.push('b')
        return (a as number) + 1
      },
    })

    const c = node({
      dependsOn: { b },
      compute: ({ b }) => {
        order.push('c')
        return (b as number) * 2
      },
    })

    c.get()
    expect(order).toEqual(['b', 'c'])

    a.set(10)
    order.length = 0
    c.get()
    expect(order).toEqual(['b', 'c'])
  })

  it('diamond: common ancestor computed once per get', () => {
    const order: string[] = []
    const a = input(1)

    const b = node({
      dependsOn: { a },
      compute: ({ a }) => {
        order.push('b')
        return (a as number) + 1
      },
    })

    const c = node({
      dependsOn: { a },
      compute: ({ a }) => {
        order.push('c')
        return (a as number) * 2
      },
    })

    const d = node({
      dependsOn: { b, c },
      compute: ({ b, c }) => {
        order.push('d')
        return (b as number) + (c as number)
      },
    })

    d.get()
    expect(order).toEqual(['b', 'c', 'd'])

    a.set(10)
    order.length = 0
    d.get()
    expect(order).toEqual(['b', 'c', 'd'])
  })

  it('wide diamond: 10 branches merge', () => {
    const order: number[] = []
    const a = input(0)

    const branches = Array.from({ length: 10 }, (_, i) =>
      node({
        dependsOn: { a },
        compute: ({ a }) => {
          order.push(i)
          return (a as number) + i
        },
      }),
    )

    const merge = node({
      dependsOn: Object.fromEntries(branches.map((b, i) => [`b${i}`, b])),
      compute: deps => {
        order.push(100)
        return Object.values(deps as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        )
      },
    })

    merge.get()
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100])

    a.set(1)
    order.length = 0
    merge.get()
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100])
  })
})

describe('why', () => {
  it('returns empty for clean computed node', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    expect(why(b)).toEqual([])
  })

  it('traces single dependency', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    b.get()
    a.set(10)
    const path = why(b)
    expect(path).toEqual([b.id, a.id])
  })

  it('traces chain', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) * 2,
    })
    b.get()
    c.get()
    a.set(5)
    const path = why(c)
    expect(path).toEqual([c.id, b.id, a.id])
  })

  it('traces diamond', () => {
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
    expect(path).toContain(a.id)
  })
})

describe('batch', () => {
  it('empty batch returns empty set', () => {
    expect(batch(() => {}).size).toBe(0)
  })

  it('no-op set returns empty set', () => {
    const a = input(1)
    expect(batch(() => { a.set(1) }).size).toBe(0)
  })

  it('tracks all transitive dirtied nodes', () => {
    const a = input(1)
    const b = node({
      dependsOn: { a },
      compute: ({ a }) => (a as number) + 1,
    })
    const c = node({
      dependsOn: { b },
      compute: ({ b }) => (b as number) * 2,
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

  it('multiple inputs batched', () => {
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
    expect(changed.has(a)).toBe(true)
    expect(changed.has(b)).toBe(true)
    expect(changed.has(sum)).toBe(true)
    expect(sum.get()).toBe(30)
  })
})
