// Gắn / cập nhật mã phiên bản (?v=…) cho mọi file JS / CSS nội bộ trong các trang HTML,
// để trình duyệt tải bản mới ngay sau mỗi lần cập nhật (GitHub Pages cho cache 10 phút).
// Chạy trước khi commit:  node scripts/bump-version.mjs
import { readFileSync, writeFileSync } from 'node:fs'

const PAGES = ['index.html', 'about.html', 'gallery.html', 'cms.html', 'poster-edit.html']
const v = new Date().toISOString().replace(/\D/g, '').slice(0, 12) // yyyymmddhhmm

for (const file of PAGES) {
  let html
  try {
    html = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  const out = html.replace(/((?:src|href)=")(assets\/(?:js|css)\/[^"?]+\.(?:js|css))(?:\?v=[^"]*)?"/g, `$1$2?v=${v}"`)
  if (out !== html) {
    writeFileSync(file, out)
    console.log(`${file}: v=${v}`)
  }
}
