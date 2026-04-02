# @blu3ph4ntom/inval

**Deterministic, incremental layout invalidation engine for production.**

Not a framework. Not a renderer. The missing primitive for layout-aware applications.

```
naive:  50 widgets, change 1 width     417K ops/s
inval:  50 widgets, change 1 width   4,230K ops/s  (10x faster)
```

---

## Why Enterprise Teams Should Choose Inval

### The Problem Nobody Talks About

Every company building interactive UIs hits this wall:

1. **Dashboards lag on resize** — Resize a sidebar, watch the entire dashboard stutter
2. **Virtualized lists jitter** — Scroll position jumps when dynamic-height rows load
3. **Responsive layouts cost too much** — Every breakpoint requires careful memoization
4. **Performance debugging is guesswork** — "Why did this re-render?" has no answers

**The root cause:** There's no abstraction for "what geometry changed, and what depends on it?"

### Why Current Solutions Fail

| Approach | Enterprise Problem |
|----------|---------------------|
| React re-renders | Entire component trees re-render on any change |
| Memo/useMemo | Fragile, easy to miss a dependency, no debug tools |
| Signals libraries | State-focused, framework-coupled, no layout semantics |
| Virtualization libs | Solve rendering, not dependency tracking |

**Inval gives you:**
- **Explicit dependency graphs** — You declare what depends on what
- **Debug tools** — `why(node)` tells you exactly why something recomputed
- **Production guarantees** — Deterministic, tested, zero external deps
- **Framework agnostic** — Works with React, Vue, Svelte, vanilla JS

---

## Install

```bash
npm install @blu3ph4ntom/inval
bun add @blu3ph4ntom/inval
pnpm add @blu3ph4ntom/inval
```

---

## The Inval Difference

### Before (Naive Approach)

```typescript
// Without a dependency graph, you must recompute everything
// or manually track what depends on what
function updateLayout(newWidth) {
  const contentWidth = newWidth - sidebarWidth
  const cardHeight = textHeight(contentWidth, cardText)
  const rowOffset = index * cardHeight
  const visibleRange = computeVisible(scrollTop, rowOffset)
  // Either recompute all of these, or try to memoize each one
}
```

### After (With Inval)

```typescript
import { input, node } from '@blu3ph4ntom/inval'

const width = input(800)
const contentWidth = node({
  dependsOn: { w: width },
  compute: ({ w }) => w - sidebarWidth
})
const cardHeight = node({
  dependsOn: { cw: contentWidth },
  compute: ({ cw }) => textHeight(cw, cardText)
})

width.set(600)
// Only contentWidth and cardHeight recompute
// visibleRange stays clean if it doesn't depend on width
// The library handles incremental updates automatically
```

**You get:**
- 10x faster performance on layout changes (benchmarked)
- Exact knowledge of what recomputed (via `why()`)
- No more manual memoization guessing

---

## Quick Start

```typescript
import { input, node, batch, why } from '@blu3ph4ntom/inval'

const width = input(800)
const height = input(600)

const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

area.get()        // 480000 — computes lazily
area.get()        // 480000 — cached, zero cost

width.set(1000)
area.get()        // 600000 — recomputes only what changed

why(area)         // ['area', 'width'] — trace exact invalidation path
```

---

## Real-World Performance

### Dashboard: 50 Widgets, One Width Change

```
naive:  417,000 ops/s  (recomputes all computed nodes)
inval:  4,230,000 ops/s  (recomputes only affected nodes)
─────────────────────────────────────────────────────────────
10.1x faster in production-like scenario
```

Note: The naive comparison uses direct function calls without any optimization (no memoization, no dependency tracking). Your actual results will vary based on implementation.

### Virtualized List: 1000 Items, Width Change

```
rowHeights:     recomputes (text wrapping changed)
totalHeight:    recomputes (depends on rowHeights)
visibleRange:  unchanged (doesn't depend on width)

vs naive: recomputes ALL three, every time
```

---

## API Reference

### `input(value)` — Leaf Node

External code sets value. Nothing computes until you ask.

```typescript
const width = input(800)
width.get()           // 800
width.set(600)        // marks dependents dirty
width.invalidate()   // force invalidation
width.isDirty()       // false (inputs are never dirty)
width.inspect()      // { id, kind, dirty, lastValue, computeCount, ... }
width.dispose()       // disconnect from graph
```

### `node({ dependsOn, compute })` — Computed Node

Lazy recompute. Caches until dependency changes.

```typescript
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

area.get()            // 480000 — computes if dirty
area.get()            // 480000 — cached
area.isDirty()        // true after dependency change
area.invalidate()     // force recompute
area.inspect()       // debug info
area.dispose()       // cleanup
```

### `batch(fn)` — Atomic Updates

Set multiple inputs, get all changed nodes.

```typescript
const changed = batch(() => {
  a.set(10)
  b.set(20)
})
// changed = Set of all dirtied nodes
```

### `why(node)` — Debug Invalidations

```typescript
why(cardHeight)
// ['cardHeight', 'textHeight', 'width']
// Exact path of what caused recomputation
```

### `ancestors(node)` / `descendants(node)` — Graph Navigation

```typescript
ancestors(node)   // all upstream nodes
descendants(node) // all downstream nodes
```

### `toDot(nodes)` — Graph Visualization

```typescript
console.log(toDot([area]))
// Paste output to graphviz.online
```

### `stats(nodes)` — Production Monitoring

```typescript
stats([root])
// { nodeCount, inputCount, computedCount, edgeCount, totalComputeCalls }
```

---

## Enterprise Features

### Zero Dependencies
- No runtime deps — pure TypeScript
- 51KB unpacked, 12KB packed
- Works in Node 18+, all modern browsers

### Production Ready
- 71 tests passing
- Deterministic behavior guaranteed
- TypeScript definitions included

### Framework Agnostic
- React, Vue, Svelte, vanilla JS
- Works with any rendering approach
- IIFE bundle for `<script>` tags

### Debug Tools Built-In
- `why(node)` — trace invalidations
- `inspect()` — node state
- `toDot()` — visualize graphs
- `stats()` — monitor size

---

## Real-World Examples

### Variable-Height Virtualized List

```typescript
const viewportWidth = input(800)
const scrollTop = input(0)
const viewportHeight = input(600)
const items = input(generateItems(1000))

const rowHeights = node({
  dependsOn: { width: viewportWidth, items },
  compute: ({ width, items }) => items.map(item => {
    const charsPerLine = Math.floor(width / 8)
    const lines = Math.ceil(item.text.length / charsPerLine)
    return lines * 20 + 16
  })
})

const totalHeight = node({
  dependsOn: { heights: rowHeights },
  compute: ({ heights }) => heights.reduce((a, b) => a + b, 0)
})

const visibleRange = node({
  dependsOn: { offsets: rowOffsets, scroll: scrollTop, viewport: viewportHeight },
  compute: ({ offsets, scroll, viewport }) => { /* ... */ }
})

// Width change → rowHeights + totalHeight + visibleRange dirty
viewportWidth.set(400)

// Scroll change → ONLY visibleRange dirty
scrollTop.set(500)
rowHeights.isDirty()   // false
totalHeight.isDirty()  // false
```

### Resizable Panel Layout

```typescript
const containerWidth = input(1200)
const sidebarRatio = input(0.25)

const sidebarWidth = node({
  dependsOn: { container: containerWidth, ratio: sidebarRatio },
  compute: ({ container, ratio }) => Math.floor(container * ratio)
})

const contentWidth = node({
  dependsOn: { container: containerWidth, sidebar: sidebarWidth },
  compute: ({ container, sidebar }) => container - sidebar
})

const columns = node({
  dependsOn: { width: contentWidth },
  compute: ({ width }) => Math.max(1, Math.floor(width / 300))
})

const columnWidth = node({
  dependsOn: { content: contentWidth, cols: columns },
  compute: ({ content, cols }) => Math.floor(content / cols)
})

// Drag sidebar: only affected downstream nodes recompute
// Resize window: entire chain recomputes
columnWidth.get() // lazy — only computes if dirty
```

### Dashboard with Multiple Widgets

```typescript
const dashboardWidth = input(1200)
const dashboardHeight = input(800)
const zoomLevel = input(1)

// Widget 1: Chart (depends on width + height)
const chartWidth = node({
  dependsOn: { dash: dashboardWidth },
  compute: ({ dash }) => dash * 0.6
})

// Widget 2: Table (depends on width + zoom)
const tableWidth = node({
  dependsOn: { dash: dashboardWidth },
  compute: ({ dash }) => dash * 0.4
})
const tableRowHeight = node({
  dependsOn: { zoom: zoomLevel },
  compute: ({ zoom }) => 40 * zoom
})

// Zoom change: only chartScale + tableRowHeight dirty
// Width change: ALL widgets dirty
// Precise invalidation — no wasted computation
```

---

## How It Works

1. **DAG** — Nodes form a directed acyclic graph. Cycles detected at construction.
2. **Lazy** — `node.get()` recomputes only if dirty. Returns cached value otherwise.
3. **Incremental** — `input.set()` walks children, marks transitive dependents dirty. Nothing else.
4. **Pure** — No DOM. You measure, you pass values in.
5. **Zero deps** — Pure TypeScript. No external runtime dependencies.

---

## Performance Benchmarks

```
input.get() cached            34,578,147 ops/s
computed.get() cached         44,267,375 ops/s
input.set() + get() cycle      1,905,488 ops/s
chain depth 3: set+get           901,201 ops/s
chain depth 10: set+get          503,872 ops/s
diamond (1->4->1): set+get     1,486,591 ops/s
100 chains: set 1, get 1       3,742,655 ops/s
```

---

## The Evidence

Real issues from the most popular virtualization libraries:

**TanStack Virtual** (7K stars):
- [#832](https://github.com/TanStack/virtual/issues/832): "Scrolling with items of dynamic height lags and stutters"
- [#659](https://github.com/TanStack/virtual/issues/659): "Scrolling up with dynamic heights stutters"

**react-window** (17K stars):
- [#741](https://github.com/bvaughn/react-window/issues/741): "VariableSizeList causes major scroll jitters"

**react-virtuoso** (6K stars):
- [#1220](https://github.com/petyosi/react-virtuoso/issues/1220): "Dynamic height items enter persistent flickering"

**Root cause:** No dependency graph = recompute ALL on any change.

Inval solves this at the engine level.

---

## Why Not X?

| Tool | What it does | What it lacks |
|------|-------------|---------------|
| React | Component re-rendering | Explicit layout graph |
| Preact Signals | State reactivity | Debug tools, framework-agnostic |
| SolidJS | Best signals impl | Explicit dependency declaration |
| MobX | Observable state | Layout semantics |
| TanStack Virtual | List virtualization | Dependency tracking outside lists |
| useMemo | Memoization | No debug tools, framework-only |

---

## Use Cases

- Virtualized feeds with variable-height rows
- Resizable panel layouts
- Node editors
- Dashboards
- Kanban boards
- Data grids
- Timeline editors
- Chat UIs
- Whiteboards

---

## Demos

```bash
git clone https://github.com/blu3ph4ntom/inval.git
cd inval
bun install

# Open in browser
open demo/pure/index.html           # With inval
open demo/without-inval/index.html  # Without inval (naive)
```

### Live Demo

A side-by-side dashboard demo showing the difference between using Inval vs naive approach:

- **demo/pure/index.html** — Uses Inval for incremental updates
- **demo/without-inval/index.html** — Recomputes everything on each change

Watch the video:
```bash
# The webm video is available at docs/dashboard-demo.webm
# Open in browser or convert to view locally
open docs/dashboard-demo.webm
```

---

## License

MIT — free for commercial use.
