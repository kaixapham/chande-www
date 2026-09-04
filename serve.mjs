// Static server tối giản cho chande-www.
// Có MIME cho woff2/svg/avif/webp và phân giải clean-URL (/about -> about.html).
import { createServer } from 'node:http'
import { createReadStream, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('.', import.meta.url))
const PORT = Number(process.env.PORT || process.argv[2] || 3120)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
}

const stat = (p) => {
  try {
    return statSync(p)
  } catch {
    return null
  }
}

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  let rel = normalize(url).replace(/^(\.\.[/\\])+/, '')
  if (rel.endsWith('/')) rel += 'index.html'

  let file = join(ROOT, rel)
  let st = stat(file)
  if (st?.isDirectory()) {
    file = join(file, 'index.html')
    st = stat(file)
  }
  if (!st && !extname(file)) {
    // clean URL: /about -> about.html
    const alt = `${file}.html`
    if (stat(alt)) {
      file = alt
      st = stat(alt)
    }
  }
  if (!st?.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('404')
    return
  }

  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
  })
  createReadStream(file).pipe(res)
}).listen(PORT, () => console.log(`chande-www -> http://localhost:${PORT}`))
