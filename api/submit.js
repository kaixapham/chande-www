// =============================================================================
// CHANDE — Nhận form (register.html / partner.html) rồi gửi mail cho ban tổ chức.
// Hàm serverless của Vercel: POST /api/submit, body JSON từ assets/js/chande-form.js
//   { form: 'register' | 'partner', entries: [[nhãn, giá trị], …], email, name, hp, t }
//
// Gửi mail qua Resend (https://resend.com — gọi thẳng HTTP, không cần cài gói).
// Biến môi trường (đặt trong Vercel → Project → Settings → Environment Variables):
//   RESEND_API_KEY  bắt buộc — khoá API của Resend
//   FORM_TO         người nhận, cách nhau dấu phẩy (mặc định 2 địa chỉ bên dưới)
//   FORM_FROM       người gửi (mặc định "Chande Bootcamp <hello@chandebootcamp.com>" — tên miền
//                   chandebootcamp.com đã xác minh trong Resend, vùng Tokyo, DNS ở GoDaddy)
//   SHEET_WEBHOOK_URL  (tuỳ chọn) link Web app của Apps Script scripts/form-sheet.gs — mỗi form
//                   thêm một dòng vào Google Sheet (tab Register / Partner) để xem tổng quan.
//
// Gửi mail và ghi Sheet chạy song song; một trong hai thành công là báo người dùng đã gửi
// (bên lỗi chỉ ghi log Vercel) — mất mail vẫn còn dòng trong Sheet và ngược lại.
//
// Chống spam: ô bẫy hp phải trống, form phải mở ít nhất 3 s trước khi gửi, giới hạn độ dài.
// =============================================================================

const TO_DEFAULT = ['kaixadesign@gmail.com', 'phap22011994@gmail.com']
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const FORMS = {
  register: { subject: (n) => `[Chande S3] Đăng ký mới — ${n}`, heading: 'Đăng ký Chande mùa 3' },
  partner: { subject: (n) => `[Chande] Đề xuất đối tác — ${n}`, heading: 'Đề xuất hợp tác / tài trợ' },
}

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const clip = (s, n) => String(s ?? '').trim().slice(0, n)

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'Bad request' })

  const kind = FORMS[body.form]
  if (!kind) return res.status(400).json({ ok: false, error: 'Unknown form' })

  // máy spam: điền ô bẫy hoặc gửi quá nhanh -> giả vờ thành công, không gửi gì
  if (body.hp || !(Number(body.t) >= 3000)) return res.status(200).json({ ok: true })

  const email = clip(body.email, 160)
  const name = clip(body.name, 160)
  if (!EMAIL.test(email) || !name) return res.status(400).json({ ok: false, error: 'Missing name or email' })

  const entries = (Array.isArray(body.entries) ? body.entries : [])
    .slice(0, 30)
    .map((e) => [clip(Array.isArray(e) ? e[0] : '', 200), clip(Array.isArray(e) ? e[1] : '', 3000)])
    .filter(([k, v]) => k && v)
  if (!entries.length) return res.status(400).json({ ok: false, error: 'Empty form' })

  const key = process.env.RESEND_API_KEY
  // link Web app của Apps Script — bỏ dấu cách / ngoặc kép thừa nếu lỡ dán vào Vercel
  const sheet = String(process.env.SHEET_WEBHOOK_URL || '').trim().replace(/^['"]+|['"]+$/g, '').trim()
  if (!key && !sheet) return res.status(500).json({ ok: false, error: 'Mail is not configured' })
  const to = (process.env.FORM_TO || TO_DEFAULT.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const from = process.env.FORM_FROM || 'Chande Bootcamp <hello@chandebootcamp.com>'

  const rows = entries
    .map(
      ([k, v]) =>
        `<tr><td style="padding:10px 16px 10px 0;vertical-align:top;color:#6b706d;font:13px/1.4 monospace;text-transform:uppercase;white-space:nowrap">${esc(k)}</td>` +
        `<td style="padding:10px 0;vertical-align:top;color:#0f1513;font:16px/1.5 -apple-system,Segoe UI,sans-serif;white-space:pre-wrap">${esc(v)}</td></tr>`,
    )
    .join('')
  const when = new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
  const html =
    `<div style="max-width:640px;margin:0 auto;padding:24px;background:#f4f3eb">` +
    `<p style="margin:0 0 4px;color:#236c3c;font:600 12px/1 monospace;text-transform:uppercase">chandebootcamp.com</p>` +
    `<h1 style="margin:0 0 20px;color:#0f1513;font:700 26px/1.1 -apple-system,Segoe UI,sans-serif">${esc(kind.heading)}</h1>` +
    `<table style="width:100%;border-collapse:collapse;border-top:1px solid #d9d8cf">${rows}</table>` +
    `<p style="margin:20px 0 0;color:#6b706d;font:12px/1.4 monospace">${esc(when)} · Trả lời mail này để liên hệ thẳng ${esc(email)}</p>` +
    `</div>`
  const text = entries.map(([k, v]) => `${k}: ${v}`).join('\n')

  const mail = async () => {
    if (!key) throw new Error('no RESEND_API_KEY')
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, reply_to: email, subject: kind.subject(name), html, text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`resend ${r.status} ${await r.text().catch(() => '')}`)
  }
  // Apps Script trả 302 sang trang kết quả — fetch tự theo, đọc { ok }
  const log = async () => {
    if (!sheet) throw new Error('no SHEET_WEBHOOK_URL')
    const r = await fetch(sheet, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ form: body.form, entries }),
      signal: AbortSignal.timeout(8000),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) throw new Error(`sheet ${r.status} ${j.error || ''}`)
  }

  const [m, l] = await Promise.allSettled([mail(), log()])
  if (m.status === 'rejected') console.error('[submit] mail', m.reason?.message || m.reason)
  if (l.status === 'rejected' && sheet) console.error('[submit] sheet', l.reason?.message || l.reason)
  if (m.status === 'fulfilled' || l.status === 'fulfilled') return res.status(200).json({ ok: true })
  return res.status(502).json({ ok: false, error: 'Mail service error' })
}
