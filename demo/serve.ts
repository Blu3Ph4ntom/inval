import { serve } from 'bun'
import { join } from 'path'
import { readFileSync } from 'fs'

const demoDir = join(import.meta.dir)

const mimeTypes: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
}

serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url)
    let path = url.pathname

    if (path === '/') path = '/pure/index.html'

    const filePath = join(demoDir, path)
    const ext = filePath.slice(filePath.lastIndexOf('.'))

    try {
      const content = readFileSync(filePath)
      return new Response(content, {
        headers: { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' },
      })
    } catch {
      return new Response('Not Found', { status: 404 })
    }
  },
})

console.log('Demo server running at http://localhost:3000')
console.log('  /pure          — with inval')
console.log('  /without-inval — without inval (naive approach)')
