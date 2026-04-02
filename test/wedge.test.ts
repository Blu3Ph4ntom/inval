import { describe, it, expect } from 'bun:test'
import { input, node, batch, why, stats } from '../src/index.js'

interface Item {
  text: string
  imageAspect: number
}

function simulateMeasureRow(item: Item, width: number): number {
  const charsPerLine = Math.floor(width / 8)
  const lines = Math.ceil(item.text.length / charsPerLine)
  return lines * 20 + item.imageAspect * 100 + 16
}

function computeVisibleRange(
  rowHeights: number[],
  scrollTop: number,
  viewportHeight: number,
): { start: number; end: number; offsets: number[] } {
  const offsets: number[] = [0]
  for (let i = 0; i < rowHeights.length; i++) {
    offsets.push(offsets[i]! + rowHeights[i]!)
  }

  let start = 0
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i]! >= scrollTop) {
      start = Math.max(0, i - 1)
      break
    }
  }

  let end = rowHeights.length
  for (let i = start; i < offsets.length; i++) {
    if (offsets[i]! > scrollTop + viewportHeight) {
      end = i
      break
    }
  }

  return { start, end, offsets }
}

describe('wedge: variable-height virtualized list', () => {
  const items: Item[] = Array.from({ length: 100 }, (_, i) => ({
    text: `Item ${i} `.repeat(10 + (i % 20)),
    imageAspect: 0.5 + (i % 3) * 0.25,
  }))

  it('computes row heights based on width', () => {
    const viewportWidth = input(800)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const h = rowHeights.get()
    expect(h.length).toBe(100)
    expect(h[0]).toBeGreaterThan(0)
  })

  it('total height depends on row heights', () => {
    const viewportWidth = input(800)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const totalHeight = node({
      dependsOn: { heights: rowHeights },
      compute: ({ heights }) =>
        (heights as number[]).reduce((a, b) => a + b, 0),
    })

    const total = totalHeight.get()
    expect(total).toBeGreaterThan(0)
  })

  it('visible range depends on scroll, viewport, and row heights', () => {
    const viewportWidth = input(800)
    const scrollTop = input(0)
    const viewportHeight = input(600)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const visibleRange = node({
      dependsOn: {
        heights: rowHeights,
        scroll: scrollTop,
        viewport: viewportHeight,
      },
      compute: ({ heights, scroll, viewport }) =>
        computeVisibleRange(
          heights as number[],
          scroll as number,
          viewport as number,
        ),
    })

    const range = visibleRange.get()
    expect(range.start).toBe(0)
    expect(range.end).toBeGreaterThan(0)
    expect(range.end).toBeLessThanOrEqual(100)
  })

  it('width change invalidates rowHeights, totalHeight, visibleRange', () => {
    const viewportWidth = input(800)
    const scrollTop = input(0)
    const viewportHeight = input(600)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const totalHeight = node({
      dependsOn: { heights: rowHeights },
      compute: ({ heights }) =>
        (heights as number[]).reduce((a, b) => a + b, 0),
    })

    const visibleRange = node({
      dependsOn: {
        heights: rowHeights,
        scroll: scrollTop,
        viewport: viewportHeight,
      },
      compute: ({ heights, scroll, viewport }) =>
        computeVisibleRange(
          heights as number[],
          scroll as number,
          viewport as number,
        ),
    })

    // initial read
    rowHeights.get()
    totalHeight.get()
    visibleRange.get()

    expect(rowHeights._computeCount).toBe(1)
    expect(totalHeight._computeCount).toBe(1)
    expect(visibleRange._computeCount).toBe(1)

    // change width
    viewportWidth.set(400)

    // all three are dirty
    expect(rowHeights._dirty).toBe(true)
    expect(totalHeight._dirty).toBe(true)
    expect(visibleRange._dirty).toBe(true)

    // scroll is NOT dirty (it wasn't changed)
    expect(scrollTop._dirty).toBe(false)
  })

  it('scroll change only invalidates visibleRange', () => {
    const viewportWidth = input(800)
    const scrollTop = input(0)
    const viewportHeight = input(600)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const totalHeight = node({
      dependsOn: { heights: rowHeights },
      compute: ({ heights }) =>
        (heights as number[]).reduce((a, b) => a + b, 0),
    })

    const visibleRange = node({
      dependsOn: {
        heights: rowHeights,
        scroll: scrollTop,
        viewport: viewportHeight,
      },
      compute: ({ heights, scroll, viewport }) =>
        computeVisibleRange(
          heights as number[],
          scroll as number,
          viewport as number,
        ),
    })

    // initial read
    rowHeights.get()
    totalHeight.get()
    visibleRange.get()

    // change scroll only
    scrollTop.set(500)

    // rowHeights and totalHeight are NOT dirty
    expect(rowHeights._dirty).toBe(false)
    expect(totalHeight._dirty).toBe(false)

    // only visibleRange is dirty
    expect(visibleRange._dirty).toBe(true)

    // only visibleRange recomputed
    visibleRange.get()
    expect(visibleRange._computeCount).toBe(2)
    expect(rowHeights._computeCount).toBe(1)
    expect(totalHeight._computeCount).toBe(1)
  })

  it('batch width + scroll changes', () => {
    const viewportWidth = input(800)
    const scrollTop = input(0)
    const viewportHeight = input(600)
    const itemsInput = input(items)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const totalHeight = node({
      dependsOn: { heights: rowHeights },
      compute: ({ heights }) =>
        (heights as number[]).reduce((a, b) => a + b, 0),
    })

    const visibleRange = node({
      dependsOn: {
        heights: rowHeights,
        scroll: scrollTop,
        viewport: viewportHeight,
      },
      compute: ({ heights, scroll, viewport }) =>
        computeVisibleRange(
          heights as number[],
          scroll as number,
          viewport as number,
        ),
    })

    // initial read
    rowHeights.get()
    totalHeight.get()
    visibleRange.get()

    const changed = batch(() => {
      viewportWidth.set(600)
      scrollTop.set(200)
    })

    expect(changed.has(viewportWidth)).toBe(true)
    expect(changed.has(scrollTop)).toBe(true)
    expect(changed.has(rowHeights)).toBe(true)
    expect(changed.has(visibleRange)).toBe(true)

    // lazy recompute
    const range = visibleRange.get()
    expect(range.start).toBeGreaterThanOrEqual(0)
  })

  it('benchmark: 1000 items, width change, compute count', () => {
    const bigItems: Item[] = Array.from({ length: 1000 }, (_, i) => ({
      text: `Item ${i} `.repeat(10 + (i % 20)),
      imageAspect: 0.5 + (i % 3) * 0.25,
    }))

    const viewportWidth = input(800)
    const scrollTop = input(0)
    const viewportHeight = input(600)
    const itemsInput = input(bigItems)

    const rowHeights = node({
      dependsOn: { width: viewportWidth, items: itemsInput },
      compute: ({ width, items }) =>
        (items as Item[]).map(item => simulateMeasureRow(item, width as number)),
    })

    const totalHeight = node({
      dependsOn: { heights: rowHeights },
      compute: ({ heights }) =>
        (heights as number[]).reduce((a, b) => a + b, 0),
    })

    const visibleRange = node({
      dependsOn: {
        heights: rowHeights,
        scroll: scrollTop,
        viewport: viewportHeight,
      },
      compute: ({ heights, scroll, viewport }) =>
        computeVisibleRange(
          heights as number[],
          scroll as number,
          viewport as number,
        ),
    })

    // initial
    rowHeights.get()
    totalHeight.get()
    visibleRange.get()

    // 10 scroll changes (start from 1 since initial is 0)
    for (let i = 1; i <= 10; i++) {
      scrollTop.set(i * 100)
      visibleRange.get()
    }

    // only visibleRange recomputed 10 times
    expect(visibleRange._computeCount).toBe(11)
    expect(rowHeights._computeCount).toBe(1)
    expect(totalHeight._computeCount).toBe(1)

    // width change
    viewportWidth.set(400)
    rowHeights.get()
    totalHeight.get()
    visibleRange.get()

    expect(rowHeights._computeCount).toBe(2)
    expect(totalHeight._computeCount).toBe(2)
    expect(visibleRange._computeCount).toBe(12)

    const s = stats([visibleRange])
    expect(s.computedCount).toBe(2)
    expect(s.inputCount).toBe(4)
  })
})
