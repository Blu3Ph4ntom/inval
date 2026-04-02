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

This isn't hypothetical. These are real GitHub issues from the most popular virtualization libraries:

**TanStack Virtual** (7K stars):
- [#832](https://github.com/TanStack/virtual/issues/832): "Scrolling with items of dynamic height lags and stutters a lot"
- [#659](https://github.com/TanStack/virtual/issues/659): "Scrolling up with dynamic heights stutters and jumps"
- [#28](https://github.com/TanStack/virtual/issues/28): "Resizing rows in dynamic list" — 21 upvotes

**react-window** (17K stars):
- [#741](https://github.com/bvaughn/react-window/issues/741): "VariableSizeList causes major scroll jitters"
- [#1836](https://github.com/bvaughn/react-virtualized/issues/1836): "Rows with dynamic height overlap when using CellMeasurer"

**react-virtuoso** (6K stars):
- [#1220](https://github.com/petyosi/react-virtuoso/issues/1220): "VirtuosoGrid with dynamic height items enters persistent flickering"
- [#89](https://github.com/petyosi/react-virtuoso/issues/89): "Is it possible to pre-compute all row heights?"

The root cause is always the same: **when viewport width changes, these libraries recompute ALL row heights.** They have no dependency graph to know which rows are affected.

### The current choices are bad

| Approach | Problem |
|----------|---------|
| Recompute everything | Wastes CPU. Jank on resize. |
| Memo soup (`useMemo`) | Fragile. Easy to forget a dependency. No debug tools. |
| Signals (Preact, SolidJS) | Track state, not layout. Framework-coupled. Auto-tracked deps are hard to debug. |
| Virtualization libs | Solve only the rendering slice. Don't track layout dependencies. |
| Framework scheduler | You're praying. You have no control. |

**There is no clean, general-purpose JS primitive for:**

> "Given this UI change, what geometry must be recomputed, in what order, and nothing else?"

That's a real hole. `inval` fills it.

## The Solution

Write constraints and dependencies explicitly. `inval` computes the smallest invalidation graph. When an input changes, only the transitive dependents are dirtied. They only recompute when read.

```typescript
import { input, node } from 'inval'

const viewportWidth = input(800)
const itemText = input('Hello world')

const rowHeight = node({
  dependsOn: { text: itemText, width: viewportWidth },
  compute: ({ text, width }) => {
    const lines = Math.ceil(text.length / Math.floor(width / 8))
    return lines * 20
  }
})

const totalHeight = node({
  dependsOn: { h: rowHeight },
  compute: ({ h }) => h + 32
})

// When viewportWidth changes:
// 1. rowHeight → dirty
// 2. totalHeight → dirty
// 3. Nothing else is touched.

viewportWidth.set(600)
totalHeight.get() // recomputes rowHeight first, then totalHeight
```

## Install

```bash
npm install inval
bun add inval
pnpm add inval
```

## Quick Start

```typescript
import { input, node, batch, why } from 'inval'

// Leaf nodes — set externally
const width = input(800)
const height = input(600)

// Computed nodes — lazy recompute
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

// Read — recomputes if dirty
area.get() // 480000

// Write — marks dependents dirty
width.set(1000)
area.get() // 600000

// Batch — set multiple at once
const changed = batch(() => {
  width.set(500)
  height.set(400)
})
// changed = Set { width, height, area }

// Debug — trace invalidation path
width.set(300)
why(area) // ['area', 'width']
```

## API

### `input(value)`

Create a leaf node with an initial value.

```typescript
const width = input(800)
width.get()        // 800
width.set(600)     // updates, marks dependents dirty
width.invalidate() // marks dependents dirty without changing value
width.isDirty()    // false (inputs are never dirty)
width.inspect()    // { id, kind: 'input', dirty: false, lastValue: 600, ... }
width.dispose()    // disconnect from graph
```

### `node({ dependsOn, compute })`

Create a computed node with dependencies and a compute function.

```typescript
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

area.get()        // computes lazily, caches result
area.get()        // returns cached value — zero cost
area.isDirty()    // true if dependencies changed
area.invalidate() // force recompute on next get()
area.inspect()    // { id, kind: 'computed', dirty: false, computeCount: 1, ... }
area.dispose()    // disconnect from graph
```

Dependencies are passed as an object. The keys become the argument names in `compute`.

### `batch(fn)`

Set multiple inputs in a batch. Returns a `Set<Node>` of all dirtied nodes.

```typescript
const changed = batch(() => {
  width.set(400)
  height.set(300)
})
// changed = Set { width, height, area }
```

Throws if you try to nest batches.

### `why(node)`

Trace the invalidation path from the target node up to the root inputs.

```typescript
width.set(100)
why(area) // ['area', 'width']
```

Returns empty array if the node is not dirty.

### `ancestors(node)`

Get all ancestor nodes (upstream dependencies).

```typescript
ancestors(area) // [area, width, height]
```

### `descendants(node)`

Get all descendant nodes (downstream dependents).

```typescript
descendants(width) // [width, area]
```

### `inspect()`

Debug a node's state.

```typescript
const info = area.inspect()
// {
//   id: 'n3',
//   kind: 'computed',
//   dirty: false,
//   lastValue: 480000,
//   computeCount: 1,
//   depCount: 2,
//   childCount: 0
// }
```

### `toDot(nodes)`

Export the graph as Graphviz DOT format for visualization.

```typescript
import { toDot } from 'inval'
console.log(toDot([area]))
// digraph inval {
//   "n0" [label="n0 [input]"];
//   "n1" [label="n1 [input]"];
//   "n3" [label="n3 [computed]"];
//   "n0" -> "n3";
//   "n1" -> "n3";
// }
```

### `stats(nodes)`

Get graph statistics.

```typescript
import { stats } from 'inval'
const s = stats([area])
// {
//   nodeCount: 3,
//   inputCount: 2,
//   computedCount: 1,
//   edgeCount: 2,
//   totalComputeCalls: 1
// }
```

### `dispose()`

Disconnect a node from the graph.

```typescript
width.dispose()
// width is no longer part of the graph
// area will not receive invalidations from width anymore
```

## How It Works

1. **DAG** — Nodes form a directed acyclic graph. Cycles are detected at construction time.
2. **Lazy** — `node.get()` recomputes only if dirty. Otherwise returns cached value.
3. **Incremental** — `input.set()` walks children, marks transitive dependents dirty. Nothing else is touched.
4. **Pure** — No DOM interaction. You measure, you pass values in.
5. **Zero deps** — Pure TypeScript. No runtime dependencies.

## Performance

### Micro-benchmarks

```
input.get() cached            34,578,147 ops/s
computed.get() cached         44,267,375 ops/s
input.set() + get() cycle      1,905,488 ops/s
chain depth 3: set+get           901,201 ops/s
chain depth 10: set+get          503,872 ops/s
diamond (1->4->1): set+get     1,486,591 ops/s
100 chains: set 1, get 1       3,742,655 ops/s
```

### Real-world comparison

**Scenario:** 50 independent dashboard widgets. Change 1 widget's width.

```
naive (recompute everything):     417,179 ops/s
inval (only recompute affected): 4,230,476 ops/s  (10.1x faster)
```

**Why:** inval only recomputes the widget whose dependency changed. Naive recomputes all 50.

```
naive:  1 widget changed, 50 recomputed  = wasted 49 recomputes
inval:  1 widget changed, 1 recomputed   = zero waste
```

## Why Not X?

| Tool | What it does | What it lacks |
|------|-------------|---------------|
| **React** | Component re-rendering | Tracks render deps poorly for geometry. No explicit layout graph. |
| **Preact Signals** | Fine-grained state reactivity | Framework-coupled. State-focused. No `why()`. No explicit deps. |
| **SolidJS** | Best signals implementation | Framework-coupled. Auto-tracked deps. No debug tools. |
| **Svelte 5 Runes** | Compiler-optimized reactivity | Framework-coupled. Compiler magic. No explicit layout graph. |
| **MobX** | Observable state + computed | No layout focus. No debug tools. |
| **TanStack Virtual** | List virtualization | No dependency graph. Recomputes all on width change. |
| **useMemo** | Memoization | Fragile. No debug tools. Framework-specific. |

**inval's differentiation:**
- **Explicit** layout dependency declaration (signals auto-track, which is harder to debug)
- **Framework-agnostic** primitive (signals are framework-coupled)
- **Debug tools** (`why()`, `inspect()`, `toDot()`)
- **Layout-focused** (signals manage state, not geometry)
- **Batch with changed set**

## The Wedge

Start with one brutal use case: **variable-height virtualized lists with width-dependent rows.**

```typescript
const viewportWidth = input(800)
const scrollTop = input(0)
const viewportHeight = input(600)

const rowHeights = node({
  dependsOn: { width: viewportWidth, items: input(itemData) },
  compute: ({ width, items }) =>
    items.map(item => measureRow(item, width))
})

const totalHeight = node({
  dependsOn: { heights: rowHeights },
  compute: ({ heights }) => heights.reduce((a, b) => a + b, 0)
})

const visibleRange = node({
  dependsOn: { heights: rowHeights, scroll: scrollTop, viewport: viewportHeight },
  compute: ({ heights, scroll, viewport }) =>
    computeRange(heights, scroll, viewport)
})

// Width changes:
//   rowHeights → dirty
//   totalHeight → dirty
//   visibleRange → dirty
// Nothing else.

// Scroll changes:
//   visibleRange → dirty
//   rowHeights → NOT dirty
//   totalHeight → NOT dirty
```

That niche is painful enough to matter and narrow enough to ship.

## Use Cases

Any interface where layout is dynamic and expensive:

- **Virtualized feeds** — Variable-height rows with width-dependent wrapping
- **Resizable panels** — Flex-like splits with cascading size updates
- **Node editors** — Connection positions depend on node sizes
- **Dashboards** — Widget layouts depend on container dimensions
- **Kanban boards** — Card heights depend on content and column width
- **Data grids** — Column resize affects row heights and scroll ranges
- **Timeline editors** — Zoom level affects all element positions
- **Chat UIs** — Message bubble heights depend on viewport width
- **Whiteboards** — Element positions depend on zoom and pan state

## Architecture

```
inval/
├── src/
│   ├── types.ts      — Type definitions
│   ├── node.ts       — input() and node() constructors
│   ├── graph.ts      — Graph traversal, cycle detection, dirty propagation
│   ├── batch.ts      — Batch execution context
│   ├── debug.ts      — Debug tools (inspect, why, toDot, stats)
│   └── index.ts      — Public API exports
├── test/
│   ├── node.test.ts  — Core functionality (29 tests)
│   ├── wedge.test.ts — Virtualized list scenario (6 tests)
│   ├── edge.test.ts  — Edge cases, dispose, large graphs (16 tests)
│   └── error.test.ts — Error handling, invalidation order (20 tests)
├── bench/
│   ├── index.ts      — Micro-benchmarks
│   └── compare.ts    — inval vs naive vs signals comparison
└── dist/
    ├── index.js      — ESM
    ├── index.cjs     — CJS
    ├── inval.iife.js — IIFE for browsers
    └── *.d.ts        — TypeScript declarations
```

## Demos

```bash
git clone https://github.com/blu3ph4ntom/inval.git
cd inval
bun install
bun run build

# Pure JS demos
open demo/pure/index.html          # with inval
open demo/without-inval/index.html # without inval (naive approach)

# Run demo server
bun run demo:serve
# → http://localhost:3000
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
