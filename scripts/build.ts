import { $ } from 'bun'
import { mkdirSync, rmSync } from 'fs'
import { join } from 'path'

const distDir = join(import.meta.dir, '..', 'dist')
const srcEntry = join(import.meta.dir, '..', 'src', 'index.ts')

rmSync(distDir, { recursive: true, force: true })
mkdirSync(distDir, { recursive: true })

console.log('Building ESM...')
await $`bun x esbuild ${srcEntry} --bundle --format=esm --platform=neutral --outfile=${join(distDir, 'index.js')}`

console.log('Building CJS...')
await $`bun x esbuild ${srcEntry} --bundle --format=cjs --platform=node --outfile=${join(distDir, 'index.cjs')}`

console.log('Building IIFE...')
await $`bun x esbuild ${srcEntry} --bundle --format=iife --global-name=inval --platform=browser --outfile=${join(distDir, 'inval.iife.js')}`

console.log('Building types...')
await $`tsc --emitDeclarationOnly --outDir ${distDir}`
console.log('Done.')
