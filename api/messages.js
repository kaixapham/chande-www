// =============================================================================
// CHANDE — Lời nhắn theo từng ảnh của Gallery 3D (mặt sau tem, assets/js/chande-g3.js).
// Hàm serverless của Vercel:
//   GET  /api/messages?image=<đường dẫn ảnh>  -> { ok, messages: [{ name, text, createdAt }] } (mới nhất trước)
//   GET  /api/messages?ping=1                 -> { ok } — trang dùng để biết có bật lời nhắn không
//   POST /api/messages  { image, name, text, avatar, hp, t }  -> { ok }   (avatar: một trong 8 emoji)
//
// Lưu vào CÙNG Google Sheet với form (Apps Script scripts/form-sheet.gs, biến SHEET_WEBHOOK_URL trên
// Vercel): tab "Messages" — Time · Image · Name · Avatar · Message · Hide. Gõ x vào cột Hide để ẩn một lời nhắn
// khỏi site (duyệt tay, không cần sửa code). Chưa cập nhật Apps Script bản có lời nhắn thì ping báo lỗi
// -> trang tự ẩn nút lời nhắn.
//
// Chống spam như form: ô bẫy hp phải trống, form mở ít nhất 2 s trước khi gửi, giới hạn độ dài, và giới
// hạn số lần gửi theo IP (trong bộ nhớ của từng máy chủ — chặn được người gửi dồn dập là chính).
// =============================================================================

const IMAGE = /^assets\/img\/[\w\-/.]+\.(webp|jpe?g|png|gif)$/i
const AVATARS = ['🐺', '🐻', '🦊', '🐯', '🐶', '🐟', '🐷', '👨‍🌾'] // khớp hàng chọn avatar ở gallery.html
const clip = (s, n) => String(s ?? '').replace(/\s+\n/g, '\n').trim().slice(0, n)
const hits = new Map() // ip -> [mốc gửi gần đây]
const LIMIT = { n: 5, ms: 10 * 60 * 1000 } // tối đa 5 lời nhắn / 10 phút / IP

function limited(ip) {
  const now = Date.now()
  const list = (hits.get(ip) || []).filter((t) => now - t < LIMIT.ms)
  if (list.length >= LIMIT.n) {
    hits.set(ip, list)
    return true
  }
  list.push(now)
  hits.set(ip, list)
  if (hits.size > 5000) hits.clear()
  return false
}

// Link Web app của Apps Script trong biến SHEET_WEBHOOK_URL — chịu được kiểu dán lệch hay gặp: thừa dấu cách /
// xuống dòng, bọc trong ngoặc kép, hay dán nhầm ID triển khai (AKfy…) thay vì cả đường link
function sheetUrl() {
  let v = String(process.env.SHEET_WEBHOOK_URL || '')
    .trim()
    .replace(/^['"]+|['"]+$/g, '')
    .trim()
  if (v && !/^https?:\/\//i.test(v) && /^AKfy[\w-]+$/.test(v)) v = `https://script.google.com/macros/s/${v}/exec`
  return v
}
// lý do lỗi gửi kèm cho dễ dò — không bao giờ chứa đường link (lỗi URL của fetch có in nguyên link ra)
const reason = (e) => (e instanceof TypeError ? `fetch: ${e.cause?.code || 'bad url or network'}` : String(e?.message || e).slice(0, 80))

async function sheetGet(sheet, params) {
  const r = await fetch(`${sheet}?${new URLSearchParams(params)}`, { redirect: 'follow', signal: AbortSignal.timeout(9000) })
  const j = await r.json().catch(() => null)
  if (!r.ok || !j?.ok) throw new Error(j?.error || `sheet ${r.status}${j ? '' : ' (not json)'}`)
  return j
}

module.exports = async function handler(req, res) {
  const sheet = sheetUrl()
  if (!sheet) return res.status(503).json({ ok: false, error: 'messages are not configured' })

  if (req.method === 'GET') {
    try {
      if (req.query.ping) {
        await sheetGet(sheet, { action: 'ping' })
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
        return res.status(200).json({ ok: true })
      }
      const image = String(req.query.image || '')
      if (!IMAGE.test(image)) return res.status(400).json({ ok: false, error: 'bad image' })
      const j = await sheetGet(sheet, { action: 'messages', image })
      res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60')
      return res.status(200).json({ ok: true, messages: Array.isArray(j.messages) ? j.messages : [] })
    } catch (e) {
      console.error('[messages] GET', reason(e))
      return res.status(502).json({ ok: false, error: 'messages unavailable', reason: reason(e) })
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
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
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'bad request' })
  // bẫy bot: ô ẩn có chữ, hoặc gửi quá nhanh -> giả như đã nhận
  if (body.hp || !(Number(body.t) >= 2000)) return res.status(200).json({ ok: true })
  const image = String(body.image || '')
  const name = clip(body.name, 40) || 'Anonymous'
  const text = clip(body.text, 500)
  const avatar = AVATARS.includes(body.avatar) ? body.avatar : ''
  if (!IMAGE.test(image) || !text) return res.status(400).json({ ok: false, error: 'bad request' })
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (limited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' })

  try {
    const r = await fetch(sheet, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'message', image, name, text, avatar }),
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
    })
    const j = await r.json().catch(() => null)
    if (!r.ok || !j?.ok) throw new Error(j?.error || `sheet ${r.status}${j ? '' : ' (not json)'}`)
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[messages] POST', reason(e))
    return res.status(502).json({ ok: false, error: 'could not save', reason: reason(e) })
  }
}
