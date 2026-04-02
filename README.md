# inval

Deterministic, incremental layout invalidation.

Not a framework. Not a renderer. A layout dependency engine.

## The Problem

When one layout property changes, most apps rerender everything. A sidebar width change affects content width, text wrapping, card heights, scroll positions, and virtualized ranges. But app code has no way to reason about these dependencies.

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

// When containerWidth changes, only titleHeight and cardHeight are dirtied.
// They recompute lazily on .get().
containerWidth.set(600)
cardHeight.get() // recomputes titleHeight first, then cardHeight
```

## Install

```bash
npm install inval
bun add inval
```

## API

### `input(value)`

Create a leaf node with an initial value.

```typescript
const width = input(800)
width.get() // 800
width.set(600)
width.get() // 600
```

### `node({ dependsOn, compute })`

Create a computed node with dependencies and a compute function.

```typescript
const area = node({
  dependsOn: { w: width, h: height },
  compute: ({ w, h }) => w * h
})

area.get() // computes lazily, caches result
area.get() // returns cached value — zero cost
```

Dependencies are passed as an object. The keys become the argument names in `compute`.

### `batch(fn)`

Set multiple inputs in a batch. Returns a `Set<Node>` of all dirtied nodes.

```typescript
const changed = batch(() => {
  width.set(400)
  height.set(300)
})
// changed = Set { width, height, area, ... }
```

### `why(node)`

Trace the invalidation path from the target node up to the root inputs.

```typescript
width.set(100)
const path = why(area)
// ['area', 'width']
```

### `inspect()`

Debug a node's state.

```typescript
const info = area.inspect()
// { id, kind, dirty, lastValue, computeCount, depCount, childCount }
```

### `toDot(nodes)`

Export the graph as Graphviz DOT format for visualization.

### `stats(nodes)`

Get graph statistics.

```typescript
const s = stats([area])
// { nodeCount, inputCount, computedCount, edgeCount, totalComputeCalls }
```

## How It Works

1. **DAG** — Nodes form a directed acyclic graph. Cycles are detected at construction time.
2. **Lazy** — `node.get()` recomputes only if dirty. Otherwise returns cached value.
3. **Incremental** — `input.set()` walks children, marks transitive dependents dirty. Nothing else is touched.
4. **Pure** — No DOM interaction. You measure, you pass values in.

## Performance

```
input.get() cached          3,683,648 ops/s
input.set() + get() cycle   1,874,977 ops/s
chain depth 3: set+get        875,434 ops/s
chain depth 10: set+get       448,095 ops/s
100 chains: set 1, get 1    4,711,869 ops/s
```

The core cycle (set + get) is ~1.8M ops/s. Well under the 16ms frame budget.

## Use Cases

- Virtualized feeds with variable-height rows
- Resizable panel layouts
- Node editors
- Dashboards
- Kanban boards
- Data grids
- Timeline editors

Any interface where layout is dynamic and expensive.

## Demos

Open `demo/pure/index.html` in a browser to see the virtualized list demo.

Open `demo/without-inval/index.html` to compare with the naive approach (recomputes everything on every change).

## License

MIT
