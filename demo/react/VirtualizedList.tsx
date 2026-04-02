import { useState, useEffect, useRef, useCallback } from 'react'
import { input, node, batch, why } from 'inval'

// Example: Virtualized list with inval dependency graph
// Shows how inval prevents unnecessary recomputation when layout changes

interface Item {
  id: number
  text: string
  imageAspect: number
}

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'

function useInvalLayout(items: Item[]) {
  // Inputs
  const viewportWidth = useRef(input(800))
  const scrollTop = useRef(input(0))
  const viewportHeight = useRef(input(600))
  const itemsInput = useRef(input(items))

  // Computed nodes
  const rowHeights = useRef(
    node({
      dependsOn: { width: viewportWidth.current, items: itemsInput.current },
      compute: ({ width, items }) => {
        const w = width as number
        const its = items as Item[]
        const charsPerLine = Math.floor(w / 8)
        return its.map(item => {
          const lines = Math.ceil(item.text.length / charsPerLine)
          return 20 + lines * 18 + 8 + 16
        })
      },
    })
  )

  const totalHeight = useRef(
    node({
      dependsOn: { heights: rowHeights.current },
      compute: ({ heights }) => (heights as number[]).reduce((a, b) => a + b, 0),
    })
  )

  const rowOffsets = useRef(
    node({
      dependsOn: { heights: rowHeights.current },
      compute: ({ heights }) => {
        const h = heights as number[]
        const offsets = [0]
        for (let i = 0; i < h.length; i++) {
          offsets.push(offsets[i]! + h[i]!)
        }
        return offsets
      },
    })
  )

  const visibleRange = useRef(
    node({
      dependsOn: {
        offsets: rowOffsets.current,
        scroll: scrollTop.current,
        viewport: viewportHeight.current,
      },
      compute: ({ offsets, scroll, viewport }) => {
        const o = offsets as number[]
        const s = scroll as number
        const v = viewport as number
        let start = 0
        for (let i = 0; i < o.length; i++) {
          if (o[i]! >= s) { start = Math.max(0, i - 1); break }
        }
        let end = o.length - 1
        for (let i = start; i < o.length; i++) {
          if (o[i]! > s + v) { end = i; break }
        }
        return { start, end }
      },
    })
  )

  // Update inputs
  const setWidth = useCallback((w: number) => {
    viewportWidth.current.set(w)
  }, [])

  const setScroll = useCallback((s: number) => {
    scrollTop.current.set(s)
  }, [])

  const setHeight = useCallback((h: number) => {
    viewportHeight.current.set(h)
  }, [])

  // Read computed values
  const getVisibleRange = useCallback(() => visibleRange.current.get(), [])
  const getTotalHeight = useCallback(() => totalHeight.current.get(), [])
  const getRowOffsets = useCallback(() => rowOffsets.current.get(), [])
  const getRowHeights = useCallback(() => rowHeights.current.get(), [])

  // Get stats
  const getStats = useCallback(() => {
    const rh = rowHeights.current.inspect()
    const th = totalHeight.current.inspect()
    const vr = visibleRange.current.inspect()
    return {
      rowHeights: { computeCount: rh.computeCount, dirty: rh.dirty },
      totalHeight: { computeCount: th.computeCount, dirty: th.dirty },
      visibleRange: { computeCount: vr.computeCount, dirty: vr.dirty },
    }
  }, [])

  return {
    setWidth,
    setScroll,
    setHeight,
    getVisibleRange,
    getTotalHeight,
    getRowOffsets,
    getRowHeights,
    getStats,
  }
}

export function VirtualizedList({ items }: { items: Item[] }) {
  const {
    setWidth,
    setScroll,
    setHeight,
    getVisibleRange,
    getTotalHeight,
    getRowOffsets,
    getRowHeights,
    getStats,
  } = useInvalLayout(items)

  const [renderCount, setRenderCount] = useState(0)
  const viewportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (viewportRef.current) {
      setWidth(viewportRef.current.clientWidth)
      setHeight(viewportRef.current.clientHeight)
    }

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width)
        setHeight(entry.contentRect.height)
        setRenderCount(c => c + 1)
      }
    })

    if (viewportRef.current) {
      resizeObserver.observe(viewportRef.current)
    }

    return () => resizeObserver.disconnect()
  }, [setWidth, setHeight])

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      setScroll(e.currentTarget.scrollTop)
      setRenderCount(c => c + 1)
    },
    [setScroll]
  )

  const { start, end } = getVisibleRange()
  const total = getTotalHeight()
  const offsets = getRowOffsets()
  const heights = getRowHeights()
  const stats = getStats()

  const visibleItems = items.slice(start, Math.min(end + 1, items.length))

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 300, background: '#111', padding: 20, color: '#e0e0e0' }}>
        <h2 style={{ fontSize: 14, color: '#888', textTransform: 'uppercase', letterSpacing: 1 }}>
          Stats
        </h2>
        <div style={{ fontFamily: 'monospace', fontSize: 12, marginTop: 16 }}>
          <div>Render count: {renderCount}</div>
          <div>Visible: {start}-{end} ({end - start + 1} items)</div>
          <div style={{ height: 8 }} />
          <div style={{ color: stats.rowHeights.dirty ? '#f59e0b' : '#22c55e' }}>
            rowHeights: {stats.rowHeights.computeCount}x
          </div>
          <div style={{ color: stats.totalHeight.dirty ? '#f59e0b' : '#22c55e' }}>
            totalHeight: {stats.totalHeight.computeCount}x
          </div>
          <div style={{ color: stats.visibleRange.dirty ? '#f59e0b' : '#22c55e' }}>
            visibleRange: {stats.visibleRange.computeCount}x
          </div>
        </div>
      </div>
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: 'auto',
          position: 'relative',
          background: '#0a0a0a',
        }}
      >
        <div style={{ height: total, position: 'relative' }}>
          {visibleItems.map((item, i) => {
            const idx = start + i
            return (
              <div
                key={item.id}
                style={{
                  position: 'absolute',
                  top: offsets[idx],
                  height: heights[idx],
                  left: 0,
                  right: 0,
                  padding: '16px 20px',
                  borderBottom: '1px solid #1a1a1a',
                  color: '#e0e0e0',
                }}
              >
                <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
                  Item {item.id + 1}
                </div>
                <div style={{ fontSize: 13, color: '#888', lineHeight: 1.5 }}>
                  {item.text}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
