# Changelog

## 0.1.0

Initial release.

### Features
- `input()` — Create leaf nodes with get/set/invalidate
- `node()` — Create computed nodes with dependencies and lazy recompute
- `batch()` — Batch multiple set operations, returns changed set
- `dispose()` — Disconnect nodes from the graph
- `why()` — Trace invalidation paths
- `ancestors()` — Get all upstream dependencies
- `descendants()` — Get all downstream dependents
- `inspect()` — Debug node state
- `toDot()` — Export graph as Graphviz DOT
- `stats()` — Graph statistics
- Cycle detection at construction time
- Zero dependencies, pure TypeScript
- ESM, CJS, and IIFE builds
- TypeScript type definitions
