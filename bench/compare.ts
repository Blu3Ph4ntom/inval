import { input, node, batch } from '../src/index.js'

interface BenchResult {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  opsPerSec: number
}

function bench(name: string, fn: () => void, iterations = 10000): BenchResult {
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
    `  ${r.name.padEnd(50)} ${r.avgMs.toFixed(4).padStart(8)}ms/op  ${r.opsPerSec.toLocaleString().padStart(12)} ops/s`,
  )
}

console.log('\n=== inval vs naive vs signals comparison ===\n')

// ── Scenario: Dashboard with 50 widgets ──
// Each widget has: width, height, data, zoom, scroll
// Each widget computes: area, scale, visibleRange, renderList
// We measure: change 1 input, how many things recompute?

interface WidgetConfig {
  id: number
  data: number[]
}

const widgetConfigs: WidgetConfig[] = Array.from({ length: 50 }, (_, i) => ({
  id: i,
  data: Array.from({ length: 100 }, (_, j) => i * 100 + j),
}))

// ── 1. Naive approach: recompute everything on every change ──
console.log('1. Naive approach (recompute everything)')

interface NaiveState {
  width: number
  height: number
  zoom: number
  scrollTop: number
  data: number[]
}

function naiveComputeArea(state: NaiveState): number {
  return state.width * state.height
}

function naiveComputeScale(state: NaiveState): number {
  return state.zoom * (state.width / 800)
}

function naiveComputeVisibleRange(state: NaiveState): { start: number; end: number } {
  const rowHeight = 40 * naiveComputeScale(state)
  const start = Math.floor(state.scrollTop / rowHeight)
  const end = Math.ceil((state.scrollTop + state.height) / rowHeight)
  return { start, end }
}

function naiveComputeRenderList(state: NaiveState): number[] {
  const range = naiveComputeVisibleRange(state)
  return state.data.slice(range.start, range.end)
}

function naiveFullPipeline(state: NaiveState): void {
  naiveComputeArea(state)
  naiveComputeScale(state)
  naiveComputeVisibleRange(state)
  naiveComputeRenderList(state)
}

const naiveState: NaiveState = {
  width: 800,
  height: 600,
  zoom: 1,
  scrollTop: 0,
  data: widgetConfigs[0]!.data,
}

const r1 = bench('naive: full pipeline (width change)', () => {
  naiveState.width = 400 + Math.random() * 400
  naiveFullPipeline(naiveState)
})
printResult(r1)

const r2 = bench('naive: full pipeline (scroll change)', () => {
  naiveState.scrollTop = Math.random() * 10000
  naiveFullPipeline(naiveState)
})
printResult(r2)

// ── 2. inval approach: incremental ──
console.log('\n2. inval approach (incremental)')

const invalWidth = input(800)
const invalHeight = input(600)
const invalZoom = input(1)
const invalScrollTop = input(0)
const invalData = input(widgetConfigs[0]!.data)

const invalArea = node({
  dependsOn: { w: invalWidth, h: invalHeight },
  compute: ({ w, h }) => (w as number) * (h as number),
})

const invalScale = node({
  dependsOn: { zoom: invalZoom, width: invalWidth },
  compute: ({ zoom, width }) => (zoom as number) * ((width as number) / 800),
})

const invalVisibleRange = node({
  dependsOn: { scale: invalScale, scroll: invalScrollTop, h: invalHeight },
  compute: ({ scale, scroll, h }) => {
    const rowHeight = 40 * (scale as number)
    const start = Math.floor((scroll as number) / rowHeight)
    const end = Math.ceil(((scroll as number) + (h as number)) / rowHeight)
    return { start, end }
  },
})

const invalRenderList = node({
  dependsOn: { range: invalVisibleRange, data: invalData },
  compute: ({ range, data }) => {
    const r = range as { start: number; end: number }
    return (data as number[]).slice(r.start, r.end)
  },
})

// warm up
invalRenderList.get()

const r3 = bench('inval: width change + get renderList', () => {
  invalWidth.set(400 + Math.random() * 400)
  invalRenderList.get()
})
printResult(r3)

const r4 = bench('inval: scroll change + get renderList', () => {
  invalScrollTop.set(Math.random() * 10000)
  invalRenderList.get()
})
printResult(r4)

// Verify incremental behavior
invalRenderList.get()
const areaCountBefore = invalArea._computeCount
const scaleCountBefore = invalScale._computeCount
const rangeCountBefore = invalVisibleRange._computeCount
const renderCountBefore = invalRenderList._computeCount

invalScrollTop.set(500)
invalRenderList.get()

console.log(`\n  After scroll change:`)
console.log(`    area: ${invalArea._computeCount - areaCountBefore} recomputes (should be 0)`)
console.log(`    scale: ${invalScale._computeCount - scaleCountBefore} recomputes (should be 0)`)
console.log(`    range: ${invalVisibleRange._computeCount - rangeCountBefore} recomputes (should be 1)`)
console.log(`    renderList: ${invalRenderList._computeCount - renderCountBefore} recomputes (should be 1)`)

// ── 3. Signals-like approach (manual tracking) ──
console.log('\n3. Signals-like approach (manual dependency tracking)')

let signalWidth = 800
let signalHeight = 600
let signalZoom = 1
let signalScrollTop = 0
let signalData = widgetConfigs[0]!.data

let signalAreaDirty = true
let signalScaleDirty = true
let signalRangeDirty = true
let signalRenderDirty = true

let signalAreaValue = 0
let signalScaleValue = 0
let signalRangeValue = { start: 0, end: 0 }
let signalRenderValue: number[] = []

function signalComputeArea() {
  if (!signalAreaDirty) return signalAreaValue
  signalAreaValue = signalWidth * signalHeight
  signalAreaDirty = false
  return signalAreaValue
}

function signalComputeScale() {
  if (!signalScaleDirty) return signalScaleValue
  signalScaleValue = signalZoom * (signalWidth / 800)
  signalScaleDirty = false
  return signalScaleValue
}

function signalComputeRange() {
  if (!signalRangeDirty) return signalRangeValue
  const scale = signalComputeScale()
  const rowHeight = 40 * scale
  signalRangeValue = {
    start: Math.floor(signalScrollTop / rowHeight),
    end: Math.ceil((signalScrollTop + signalHeight) / rowHeight),
  }
  signalRangeDirty = false
  return signalRangeValue
}

function signalComputeRender() {
  if (!signalRenderDirty) return signalRenderValue
  const range = signalComputeRange()
  signalRenderValue = signalData.slice(range.start, range.end)
  signalRenderDirty = false
  return signalRenderValue
}

const r5 = bench('signals: width change + get renderList', () => {
  signalWidth = 400 + Math.random() * 400
  signalAreaDirty = true
  signalScaleDirty = true
  signalRangeDirty = true
  signalRenderDirty = true
  signalComputeRender()
})
printResult(r5)

const r6 = bench('signals: scroll change + get renderList', () => {
  signalScrollTop = Math.random() * 10000
  signalRangeDirty = true
  signalRenderDirty = true
  signalComputeRender()
})
printResult(r6)

// ── 4. 50 widgets: change 1 input ──
console.log('\n4. 50 independent widgets: change 1 input')

// Naive: all 50 recomputed
const naiveWidgets = widgetConfigs.map(config => ({
  state: { width: 800, height: 600, zoom: 1, scrollTop: 0, data: config.data },
}))
const r7 = bench('naive: 50 widgets, change 1 width', () => {
  naiveWidgets[0]!.state.width = 400 + Math.random() * 400
  for (const w of naiveWidgets) {
    naiveFullPipeline(w.state)
  }
})
printResult(r7)

// inval: only 1 recomputed
const invalWidgetWidths = widgetConfigs.map(config => input(800))
const invalWidgetData = widgetConfigs.map(config => input(config.data))
const invalWidgetAreas = invalWidgetWidths.map((w, i) =>
  node({
    dependsOn: { w, data: invalWidgetData[i] },
    compute: ({ w, data }) => (w as number) * (data as number[]).length,
  }),
)
invalWidgetAreas.forEach(a => a.get())

const r8 = bench('inval: 50 widgets, change 1 width', () => {
  invalWidgetWidths[0]!.set(400 + Math.random() * 400)
  invalWidgetAreas[0]!.get()
})
printResult(r8)

console.log(`\n  inval widget 0 computeCount: ${invalWidgetAreas[0]!._computeCount}`)
console.log(`  inval widget 1 computeCount: ${invalWidgetAreas[1]!._computeCount} (should be 1)`)

console.log('\n=== done ===\n')
