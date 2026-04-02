# inval

Deterministic, incremental layout invalidation.

Not a framework. Not a renderer. A layout dependency engine.

## The Problem

When one layout property changes, most apps rerender everything. A sidebar width change affects content width, text wrapping, card heights, scroll positions, and virtualized ranges. But app code has no way to reason about these dependencies.

Current choices are mostly bad:
- Recompute too much
- Hand-optimize with memo soup
- Pray the framework scheduler saves you
- Bolt on virtualization and still get jank

Browsers know how to lay things out, but app code usually has terrible knowledge of layout dependencies.

## The Solution

Write constraints and dependencies explicitly. `inval` computes the smallest invalidation graph. When an input changes, only the transitive dependents are dirtied. They only recompute when read.

```typescript
import { input, node } from 'inval'

const containerWidth = input(800)
const titleText = input('Hello world')

const titleHeight = node({
  dependsOn: { text: titleText, width: containerWidth },
  compute: ({ text, width }) => measureTextBlock(text, width)
})

const cardHeight = node({
  dependsOn: { titleH: titleHeight, padding: input(16) },
  compute: ({ titleH, padding }) => titleH + padding * 2
})

// When containerWidth changes:
// 1. titleHeight → dirty
// 2. cardHeight → dirty
// 3. Nothing else is touched.
containerWidth.set(600)
cardHeight.get() // recomputes lazily, in order
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
width.isDirty()    // false
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

Disconnect a node from the graph. Removes it from parent children sets and child parent arrays.

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

```
input.get() cached            24,943,876 ops/s
computed.get() cached         32,331,070 ops/s
input.set() + get() cycle      1,303,815 ops/s
chain depth 3: set+get           647,790 ops/s
chain depth 10: set+get          354,039 ops/s
diamond (1->4->1): set+get       882,519 ops/s
100 chains: set 1, get 1       3,152,983 ops/s
```

The core cycle (set + get) is ~1.3M ops/s. Well under the 16ms frame budget.

## Why Not X?

| Tool | Problem |
|------|---------|
| React | Tracks render dependencies poorly for geometry |
| CSS | App code can't reason about layout dependencies |
| Virtualization libs | Solve only slices of the problem |
| Memoization | Manual and fragile |
| Signals | Track state, not layout dependencies |

`inval` is the missing primitive: "Given this UI change, what geometry must be recomputed, in what order, and nothing else?"

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

Any interface where layout is dynamic and expensive.

## Demos

```bash
git clone https://github.com/blu3ph4ntom/inval.git
cd inval
bun install
bun run build

# Open demos in browser
open demo/pure/index.html          # with inval
open demo/without-inval/index.html # without inval (naive approach)
```

## License

MIT
