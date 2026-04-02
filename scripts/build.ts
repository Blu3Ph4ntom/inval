import { $ } from 'bun'
import { existsSync, renameSync, rmSync } from 'fs'
import { join } from 'path'

const distDir = join(import.meta.dir, '..', 'dist')
const srcEntry = join(import.meta.dir, '..', 'src', 'index.ts')

console.log('Building ESM...')
await $`bun build ${srcEntry} --outdir ${distDir} --format esm --target node`

console.log('Building CJS...')
await $`bun build ${srcEntry} --outfile ${join(distDir, 'index.cjs')} --format cjs --target node`

console.log('Building IIFE...')
const iifeTempDir = join(distDir, 'iife-temp')
await $`bun build ${srcEntry} --outdir ${iifeTempDir} --format iife --global-name inval --target browser`
if (existsSync(join(iifeTempDir, 'src', 'index.js'))) {
  renameSync(join(iifeTempDir, 'src', 'index.js'), join(distDir, 'inval.iife.js'))
  rmSync(iifeTempDir, { recursive: true })
}

console.log('Building types...')
await $`tsc --emitDeclarationOnly --outDir ${distDir}`

console.log('Done.')
