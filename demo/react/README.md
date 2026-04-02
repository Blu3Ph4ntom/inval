# React Integration Example

This example shows how to use `inval` with React for efficient virtualized lists.

## Setup

```bash
npm install inval react react-dom
npm install -D @types/react @types/react-dom typescript
```

## Usage

```tsx
import { VirtualizedList } from './VirtualizedList'

const items = Array.from({ length: 1000 }, (_, i) => ({
  id: i,
  text: `Item ${i} `.repeat(10 + (i % 20)),
  imageAspect: [0.75, 1.0, 1.33, 1.5][i % 4],
}))

function App() {
  return <VirtualizedList items={items} />
}
```

## How It Works

1. `inval` creates a dependency graph of layout computations
2. When the viewport width changes, only affected row heights are recomputed
3. Scroll changes only affect the visible range calculation
4. React re-renders only when the computed values actually change

## Key Benefits

- **No unnecessary recomputation**: Width changes don't recompute scroll-related calculations
- **No unnecessary re-renders**: Only visible items are rendered
- **Clear dependencies**: The layout dependency graph is explicit
- **Debuggable**: Use `why()` to trace invalidation paths
