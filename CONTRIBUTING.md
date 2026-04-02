# Contributing

## Development Setup

```bash
git clone https://github.com/blu3ph4ntom/inval.git
cd inval
bun install
```

## Commands

```bash
bun test          # Run tests
bun run bench     # Run benchmarks
bun run typecheck # Type check
bun run build     # Build dist/
```

## Code Style

- TypeScript strict mode
- No comments in source code
- Commit messages: lowercase, no period, max 72 chars
- No co-author trailers

## Commit Messages

Format: `type: description`

Types:
- `feat` — new feature
- `fix` — bug fix
- `test` — tests
- `bench` — benchmarks
- `docs` — documentation
- `ci` — CI/CD
- `refactor` — refactoring
- `chore` — maintenance

Examples:
- `feat: add dispose() method`
- `fix: cycle detection for deep graphs`
- `test: edge cases for batch`

## Pull Requests

1. Fork the repo
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Ensure typecheck passes
6. Submit PR with clear description

## Architecture

- `src/types.ts` — Type definitions
- `src/node.ts` — `input()` and `node()` constructors
- `src/graph.ts` — Graph traversal, cycle detection, dirty propagation
- `src/batch.ts` — Batch execution context
- `src/debug.ts` — Debug tools (inspect, why, toDot, stats)
- `src/index.ts` — Public API exports

## Design Principles

1. **Zero dependencies** — Pure TypeScript, no runtime deps
2. **DOM-agnostic** — Pure computation. User passes measured values.
3. **Lazy evaluation** — Recompute only on `.get()` when dirty
4. **Fail fast** — Cycles detected at construction time
5. **Minimal API** — Only essential primitives
