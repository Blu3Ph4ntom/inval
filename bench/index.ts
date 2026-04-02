import { input, node, batch, stats } from '../src/index.js'

interface BenchResult {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  opsPerSec: number
}

function bench(name: string, fn: () => void, iterations = 10000): BenchResult {
  // warmup
  for (let i = 0; i < Math.min(iterations, 100); i++) fn()

  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const totalMs = performance.now() - start

  return {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    opsPerSec: Math.round(iterations / (totalMs / 1000)),
  }
}

function printResult(r: BenchResult): void {
  console.log(
    `  ${r.name.padEnd(45)} ${r.avgMs.toFixed(4).padStart(8)}ms/op  ${r.opsPerSec.toLocaleString().padStart(12)} ops/s`,
  )
}

// ── Benchmarks ──

console.log('\n=== inval benchmarks ===\n')

// 1. input() creation
const r1 = bench('input() creation', () => {
  input(42)
})
printResult(r1)

// 2. node() creation (2 deps)
const a = input(1)
const b = input(2)
const r2 = bench('node() creation (2 deps)', () => {
  node({
    dependsOn: { a, b },
    compute: ({ a, b }) => (a as number) + (b as number),
  })
})
printResult(r2)

// 3. input.get() — baseline
const x = input(42)
const r3 = bench('input.get() baseline', () => {
  x.get()
})
printResult(r3)

// 4. computed.get() — cached (no recompute)
const y = input(1)
const z = node({
  dependsOn: { y },
  compute: ({ y }) => (y as number) * 2,
})
z.get() // warm up
const r4 = bench('computed.get() cached', () => {
  z.get()
})
printResult(r4)

// 5. input.set() + computed.get() (full cycle)
const w = input(0)
const c = node({
  dependsOn: { w },
  compute: ({ w }) => (w as number) + 1,
})
let counter = 0
const r5 = bench('input.set() + computed.get() cycle', () => {
  w.set(counter++)
  c.get()
})
printResult(r5)

// 6. Chain depth 3: input -> n1 -> n2 -> n3
const depth = input(0)
const n1 = node({
  dependsOn: { depth },
  compute: ({ depth }) => (depth as number) + 1,
})
const n2 = node({
  dependsOn: { n1 },
  compute: ({ n1 }) => (n1 as number) * 2,
})
const n3 = node({
  dependsOn: { n2 },
  compute: ({ n2 }) => (n2 as number) + 1,
})
let d = 0
const r6 = bench('chain depth 3: set + get leaf', () => {
  depth.set(d++)
  n3.get()
})
printResult(r6)

// 7. Chain depth 10
let root = input(0)
let prev: any = root
for (let i = 0; i < 10; i++) {
  const p = prev
  prev = node({
    dependsOn: { p },
    compute: ({ p }) => (p as number) + 1,
  })
}
const deepLeaf = prev
let dd = 0
const r7 = bench('chain depth 10: set + get leaf', () => {
  root.set(dd++)
  deepLeaf.get()
})
printResult(r7)

// 8. Diamond: 1 input -> 4 computed -> 1 merge
const dia = input(1)
const d1 = node({ dependsOn: { dia }, compute: ({ dia }) => (dia as number) * 1 })
const d2 = node({ dependsOn: { dia }, compute: ({ dia }) => (dia as number) * 2 })
const d3 = node({ dependsOn: { dia }, compute: ({ dia }) => (dia as number) * 3 })
const d4 = node({ dependsOn: { dia }, compute: ({ dia }) => (dia as number) * 4 })
const diaMerge = node({
  dependsOn: { d1, d2, d3, d4 },
  compute: ({ d1, d2, d3, d4 }) =>
    (d1 as number) + (d2 as number) + (d3 as number) + (d4 as number),
})
diaMerge.get()
let di = 0
const r8 = bench('diamond (1->4->1): set + get merge', () => {
  dia.set(di++)
  diaMerge.get()
})
printResult(r8)

// 9. batch() — 10 inputs
const inputs = Array.from({ length: 10 }, (_, i) => input(i))
const merged = node({
  dependsOn: Object.fromEntries(inputs.map((inp, i) => [`i${i}`, inp])),
  compute: deps =>
    Object.values(deps as Record<string, number>).reduce((a, b) => a + b, 0),
})
merged.get()
let bi = 0
const r9 = bench('batch 10 inputs: set all + get merged', () => {
  batch(() => {
    for (const inp of inputs) {
      inp.set(bi++)
    }
  })
  merged.get()
})
printResult(r9)

// 10. 100 independent chains: set 1 input, only 1 chain recomputes
const chainInputs = Array.from({ length: 100 }, (_, i) => input(i))
const chainLeaves = chainInputs.map(inp => {
  const mid = node({
    dependsOn: { inp },
    compute: ({ inp }) => (inp as number) * 2,
  })
  return node({
    dependsOn: { mid },
    compute: ({ mid }) => (mid as number) + 1,
  })
})
chainLeaves.forEach(l => l.get())
let ci = 0
const r10 = bench('100 chains: set 1 input, get 1 leaf', () => {
  chainInputs[0]!.set(ci++)
  chainLeaves[0]!.get()
})
printResult(r10)

// 11. 1000-node graph: fan-out (1 input -> 50 computed -> 1 merge)
const fanInput = input(1)
const fanNodes = Array.from({ length: 50 }, (_, i) =>
  node({
    dependsOn: { fanInput },
    compute: ({ fanInput }) => (fanInput as number) * i,
  }),
)
const fanMerge = node({
  dependsOn: Object.fromEntries(fanNodes.map((n, i) => [`f${i}`, n])),
  compute: deps =>
    Object.values(deps as Record<string, number>).reduce((a, b) => a + b, 0),
})
fanMerge.get()
let fi = 0
const r11 = bench('fan-out 1->50->1: set + get merge', () => {
  fanInput.set(fi++)
  fanMerge.get()
})
printResult(r11)

console.log('\n=== graph stats ===\n')
console.log('  fan-out graph:', stats([fanMerge]))
console.log('  diamond graph:', stats([diaMerge]))
console.log('  100 chains:', stats(chainLeaves.slice(0, 1)))

console.log('\n=== done ===\n')
