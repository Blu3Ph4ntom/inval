# inval

Deterministic, incremental layout invalidation.

Not a framework. Not a renderer. A layout dependency engine.

```
naive:  50 widgets, change 1 width     417K ops/s
inval:  50 widgets, change 1 width   4,230K ops/s  (10x faster)
```

## The Problem

A sidebar width changes.

That affects content width.
That affects text wrapping.
That affects card heights.
That affects scroll positions.
That affects sticky elements.
That affects virtualized ranges.

Most apps handle this like cavemen: "something changed, rerender the tree."

### The evidence

Real GitHub issues from the most popular virtualization libraries:

**TanStack Virtual** (7K stars):
- [#832](https://github.com/TanStack/virtual/issues/832): "Scrolling with items of dynamic height lags and stutters a lot"
- [#659](https://github.com/TanStack/virtual/issues/659): "Scrolling up with dynamic heights stutters and jumps"

**react-window** (17K stars):
- [#741](https://github.com/bvaughn/react-window/issues/741): "VariableSizeList causes major scroll jitters"

**react-virtuoso** (6K stars):
- [#1220](https://github.com/petyosi/react-virtuoso/issues/1220): "VirtuosoGrid with dynamic height items enters persistent flickering"

The root cause: **when viewport width changes, these libraries recompute ALL row heights.** They have no dependency graph to know which rows are affected.

### Current choices are bad

| Approach | Problem |
|----------|---------|
| Recompute everything | Wastes CPU. Jank on resize. |
| Memo soup | Fragile. Easy to forget a dependency. No debug tools. |
| Signals | Track state, not layout. Framework-coupled. |
| Virtualization libs | Solve only the rendering slice. Don't track layout deps. |

**There is no clean, general-purpose JS primitive for:**

> "Given this UI change, what geometry must be recomputed, in what order, and nothing else?"

## Install

```bash
npm install inval
bun add inval
pnpm add inval
```

## Quick Start

```typescript
import { input, node, batch, why } from 'inval'

const width = input(800)
const height = input(600)

const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

area.get()        // 480000 — computes lazily
area.get()        // 480000 — cached, zero cost

width.set(1000)
area.get()        // 600000 — recomputes

why(area)         // ['area', 'width'] — trace invalidation
```

## API

### `input(value)`

Create a leaf node. External code sets its value. Nothing computes.

```typescript
import { input } from 'inval'

const width = input(800)

// Read
width.get()            // 800

// Write — marks all dependents dirty
width.set(600)

// Force invalidation without changing value
// Useful when DOM measurement changed but value is same type
width.invalidate()

// Check state
width.isDirty()        // false — inputs are never dirty
width.inspect()        // { id: 'n0', kind: 'input', dirty: false, lastValue: 600, computeCount: 0, depCount: 0, childCount: 2 }

// Cleanup
width.dispose()        // disconnect from graph, remove children refs
```

### `node({ dependsOn, compute })`

Create a computed node. Lazy recompute on `.get()`.

```typescript
import { node } from 'inval'

const width = input(800)
const height = input(600)

const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

// Read — recomputes if dirty, caches result
area.get()            // 480000

// Read again — returns cached, zero cost
area.get()            // 480000

// After dependency changes
width.set(1000)
area.isDirty()        // true
area.get()            // 600000 — recomputes lazily

// Force recompute even if not dirty
area.invalidate()
area.get()            // recomputes

// Debug
area.inspect()        // { id: 'n2', kind: 'computed', dirty: false, lastValue: 600000, computeCount: 2, depCount: 2, childCount: 0 }

// Cleanup
area.dispose()        // removes from parent._children, clears children._parents
```

### `batch(fn)`

Set multiple inputs atomically. Returns `Set<Node>` of all dirtied nodes.

```typescript
import { input, node, batch } from 'inval'

const a = input(1)
const b = input(2)
const sum = node({
  dependsOn: { a, b },
  compute: ({ a, b }) => a + b
})

sum.get() // 3

// Without batch: each set() marks dirty immediately
// With batch: all sets happen, then collect changed set
const changed = batch(() => {
  a.set(10)
  b.set(20)
})

// changed = Set { a, b, sum }
changed.has(a)    // true
changed.has(b)    // true
changed.has(sum)  // true

sum.get() // 30
```

### `why(node)`

Trace the invalidation path from target to root causes.

```typescript
import { input, node, why } from 'inval'

const width = input(800)
const textHeight = node({
  dependsOn: { w: width },
  compute: ({ w }) => Math.ceil(1000 / w)
})
const cardHeight = node({
  dependsOn: { h: textHeight },
  compute: ({ h }) => h + 32
})

cardHeight.get()     // compute initial

width.set(400)       // invalidate chain

why(cardHeight)      // ['cardHeight', 'textHeight', 'width']
// Shows exactly what caused the invalidation
```

### `ancestors(node)`

Get all nodes upstream of this node (its dependencies, recursively).

```typescript
import { input, node, ancestors } from 'inval'

const a = input(1)
const b = input(2)
const c = node({
  dependsOn: { a, b },
  compute: ({ a, b }) => a + b
})
const d = node({
  dependsOn: { c },
  compute: ({ c }) => c * 2
})

ancestors(d)  // [d, c, a, b]
```

### `descendants(node)`

Get all nodes downstream of this node (what depends on it, recursively).

```typescript
import { input, node, descendants } from 'inval'

const a = input(1)
const b = node({
  dependsOn: { a },
  compute: ({ a }) => a + 1
})
const c = node({
  dependsOn: { b },
  compute: ({ b }) => b * 2
})

descendants(a)  // [a, b, c]
```

### `toDot(nodes)`

Export the graph as Graphviz DOT. Paste into [Graphviz Online](https://dreampuf.github.io/GraphvizOnline/) to visualize.

```typescript
import { input, node, toDot } from 'inval'

const width = input(800)
const height = input(600)
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

console.log(toDot([area]))
// digraph inval {
//   "n0" [label="n0 [input]"];
//   "n1" [label="n1 [input]"];
//   "n2" [label="n2 [computed]"];
//   "n0" -> "n2";
//   "n1" -> "n2";
// }
```

### `stats(nodes)`

Get graph statistics. Useful for monitoring graph size in production.

```typescript
import { input, node, stats } from 'inval'

const width = input(800)
const height = input(600)
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})
area.get()

stats([area])
// {
//   nodeCount: 3,
//   inputCount: 2,
//   computedCount: 1,
//   edgeCount: 2,
//   totalComputeCalls: 1
// }
```

### `dispose()`

Disconnect a node from the graph. Cleans up parent/child references.

```typescript
import { input, node } from 'inval'

const width = input(800)
const area = node({
  dependsOn: { w: width },
  compute: ({ w }) => w * 600
})

width._children.size  // 1

area.dispose()

width._children.size  // 0 — area removed
area._parents.length  // 0 — parents cleared

// area is now disconnected. Changes to width won't affect it.
width.set(1000)
area.isDirty()        // false — not receiving invalidations
```

## Real-World Examples

### Variable-Height Virtualized List

```typescript
import { input, node } from 'inval'

// Inputs from the real world
const viewportWidth = input(800)
const scrollTop = input(0)
const viewportHeight = input(600)
const items = input(generateItems(1000))

// Row heights depend on viewport width (text wrapping)
const rowHeights = node({
  dependsOn: { width: viewportWidth, items },
  compute: ({ width, items }) => {
    const charsPerLine = Math.floor(width / 8)
    return items.map(item => {
      const lines = Math.ceil(item.text.length / charsPerLine)
      return lines * 20 + 16
    })
  }
})

// Total height for scroll container
const totalHeight = node({
  dependsOn: { heights: rowHeights },
  compute: ({ heights }) => heights.reduce((a, b) => a + b, 0)
})

// Row offsets for positioning
const rowOffsets = node({
  dependsOn: { heights: rowHeights },
  compute: ({ heights }) => {
    const offsets = [0]
    for (let i = 0; i < heights.length; i++) {
      offsets.push(offsets[i] + heights[i])
    }
    return offsets
  }
})

// Visible range for virtualization
const visibleRange = node({
  dependsOn: { offsets: rowOffsets, scroll: scrollTop, viewport: viewportHeight },
  compute: ({ offsets, scroll, viewport }) => {
    let start = 0
    for (let i = 0; i < offsets.length; i++) {
      if (offsets[i] >= scroll) { start = Math.max(0, i - 1); break }
    }
    let end = offsets.length - 1
    for (let i = start; i < offsets.length; i++) {
      if (offsets[i] > scroll + viewport) { end = i; break }
    }
    return { start, end }
  }
})

// Width change: rowHeights → dirty, totalHeight → dirty, visibleRange → dirty
viewportWidth.set(400)

// Scroll change: ONLY visibleRange → dirty
scrollTop.set(500)
rowHeights.isDirty()   // false — not affected by scroll
totalHeight.isDirty()  // false — not affected by scroll
```

### Resizable Panel Layout

```typescript
import { input, node } from 'inval'

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

// Drag sidebar: sidebarRatio changes
// → sidebarWidth dirty
// → contentWidth dirty
// → columns dirty (might change)
// → columnWidth dirty

// Resize window: containerWidth changes
// → same chain

columnWidth.get() // recomputes entire chain lazily
```

### Dashboard with Multiple Widgets

```typescript
import { input, node, batch } from 'inval'

// Shared layout inputs
const dashboardWidth = input(1200)
const dashboardHeight = input(800)
const zoomLevel = input(1)

// Widget 1: Chart
const chartWidth = node({
  dependsOn: { dash: dashboardWidth },
  compute: ({ dash }) => dash * 0.6
})
const chartHeight = node({
  dependsOn: { dash: dashboardHeight },
  compute: ({ dash }) => dash * 0.5
})
const chartScale = node({
  dependsOn: { zoom: zoomLevel },
  compute: ({ zoom }) => zoom
})

// Widget 2: Table
const tableWidth = node({
  dependsOn: { dash: dashboardWidth },
  compute: ({ dash }) => dash * 0.4
})
const tableRowHeight = node({
  dependsOn: { zoom: zoomLevel },
  compute: ({ zoom }) => 40 * zoom
})

// Zoom change: only chartScale and tableRowHeight dirty
// chartWidth and tableWidth NOT dirty
zoomLevel.set(1.5)
chartWidth.isDirty()    // false
tableWidth.isDirty()    // false
chartScale.isDirty()    // true
tableRowHeight.isDirty() // true

// Resize: everything dirty
dashboardWidth.set(800)
chartWidth.get()        // recomputes
tableWidth.get()        // recomputes
```

### Kanban Board

```typescript
import { input, node } from 'inval'

interface Card { id: number; text: string }

const columnWidth = input(300)
const cards = input<Card[]>([
  { id: 1, text: 'Long text that wraps...' },
  { id: 2, text: 'Short' },
])

const cardHeights = node({
  dependsOn: { width: columnWidth, cards },
  compute: ({ width, cards }) => {
    const charsPerLine = Math.floor(width / 8)
    return cards.map(card => {
      const lines = Math.ceil(card.text.length / charsPerLine)
      return 60 + lines * 18
    })
  }
})

const cardOffsets = node({
  dependsOn: { heights: cardHeights },
  compute: ({ heights }) => {
    const offsets = [0]
    for (let i = 0; i < heights.length; i++) {
      offsets.push(offsets[i] + heights[i] + 8)
    }
    return offsets
  }
})

const totalColumnHeight = node({
  dependsOn: { offsets: cardOffsets },
  compute: ({ offsets }) => offsets[offsets.length - 1]
})

// Resize column: only affected cards recompute
columnWidth.set(250)
cardHeights.get()      // recomputes all (text wrapping changed)
cardOffsets.get()       // recomputes
totalColumnHeight.get() // recomputes
```

## How It Works

1. **DAG** — Nodes form a directed acyclic graph. Cycles detected at construction.
2. **Lazy** — `node.get()` recomputes only if dirty. Otherwise returns cached value.
3. **Incremental** — `input.set()` walks children, marks transitive dependents dirty. Nothing else.
4. **Pure** — No DOM. You measure, you pass values in.
5. **Zero deps** — Pure TypeScript.

## Performance

```
input.get() cached            34,578,147 ops/s
computed.get() cached         44,267,375 ops/s
input.set() + get() cycle      1,905,488 ops/s
chain depth 3: set+get           901,201 ops/s
chain depth 10: set+get          503,872 ops/s
diamond (1->4->1): set+get     1,486,591 ops/s
100 chains: set 1, get 1       3,742,655 ops/s
```

## Why Not X?

| Tool | What it does | What it lacks |
|------|-------------|---------------|
| React | Component re-rendering | No explicit layout graph |
| Preact Signals | State reactivity | Framework-coupled, state-focused, no debug tools |
| SolidJS | Best signals impl | Framework-coupled, auto-tracked deps |
| MobX | Observable state | No layout focus, no debug tools |
| TanStack Virtual | List virtualization | No dependency graph, recomputes all on resize |
| useMemo | Memoization | Fragile, no debug tools, framework-specific |

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

## Demos

```bash
git clone https://github.com/blu3ph4ntom/inval.git
cd inval
bun install
bun run build

# Open demos in browser
open demo/pure/index.html
open demo/without-inval/index.html
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
