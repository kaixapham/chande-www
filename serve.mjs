// Static server tối giản cho chande-www.
// Có MIME cho woff2/svg/avif/webp và phân giải clean-URL (/about -> about.html).
import { createServer } from 'node:http'
import { createReadStream, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, normalize } from 'node:path'
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

// ---- CMS (chế độ Local) ------------------------------------------------------
// cms.html gọi POST /__cms/save để ghi thẳng file xuống đĩa. Chỉ nhận từ máy
// này (loopback) và chỉ được ghi: các trang .html ở gốc, ảnh trong assets/img/cms/.
const isLoopback = (a = '') => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1'
const writable = (rel) =>
  /^[a-z0-9-]+\.html$/i.test(rel) || /^assets\/img\/cms\/[a-z0-9/_.-]+\.(webp|png|jpg|svg)$/i.test(rel)

function cms(req, res, url) {
  const send = (code, obj) => {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(JSON.stringify(obj))
  }
  if (!isLoopback(req.socket.remoteAddress)) return send(403, { error: 'CMS local chỉ nhận từ máy này' })
  if (url === '/__cms/ping') return send(200, { local: true })
  if (url !== '/__cms/save' || req.method !== 'POST') return send(404, { error: 'không có' })
  // Gom ĐỦ byte rồi mới giải mã UTF-8 một lần: cộng từng mảnh thành chuỗi là
  // vỡ chữ tiếng Việt nằm vắt qua ranh giới hai mảnh ("Chế" -> "Ch���").
  const chunks = []
  let size = 0
  req.on('data', (c) => {
    chunks.push(c)
    size += c.length
    if (size > 60e6) req.destroy()
  })
  req.on('end', () => {
    try {
      const { files = [] } = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      const done = []
      for (const f of files) {
        const rel = normalize(String(f.path)).replace(/\\/g, '/')
        if (rel.startsWith('..') || !writable(rel)) throw new Error(`không được ghi: ${f.path}`)
        const abs = join(ROOT, rel)
        mkdirSync(dirname(abs), { recursive: true })
        writeFileSync(abs, f.base64 != null ? Buffer.from(f.base64, 'base64') : String(f.text ?? ''))
        done.push(rel)
      }
      send(200, { ok: true, files: done })
    } catch (e) {
      send(400, { error: String(e.message || e) })
    }
  })
}

createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/__cms/')) return cms(req, res, url)
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
