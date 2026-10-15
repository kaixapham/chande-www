// =============================================================================
// CHANDE — Lời nhắn theo từng ảnh của Gallery 3D (mặt sau tem, assets/js/chande-g3.js).
// Hàm serverless của Vercel:
//   GET  /api/messages?image=<đường dẫn ảnh>  -> { ok, messages: [{ name, text, createdAt }] } (mới nhất trước)
//   GET  /api/messages?ping=1                 -> { ok } — trang dùng để biết có bật lời nhắn không
//   GET  /api/messages?all=1                  -> { ok, all: { ảnh: [lời nhắn…] } } — mọi ảnh một lần (cần Apps
//        Script bản có action=all; bản cũ thì lỗi -> trang quay về lấy theo từng ảnh)
//   POST /api/messages  { image, name, text, avatar, hp, t }  -> { ok }   (avatar: một trong 8 emoji)
//   Đọc (all / image) lấy từ bản đệm "mọi lời nhắn" trong máy chủ + CDN (20 s, cũ vẫn trả trong lúc làm mới) —
//   Apps Script chậm / lỗi thoáng qua không làm trang chờ hay mất note. Thêm &fresh=… để đọc thẳng Sheet.
//
// Lưu vào CÙNG Google Sheet với form (Apps Script scripts/form-sheet.gs, biến SHEET_WEBHOOK_URL trên
// Vercel): tab "Messages" — Time · Image · Name · Avatar · Message · Hide. Gõ x vào cột Hide để ẩn một lời nhắn
// khỏi site (duyệt tay, không cần sửa code). Chưa cập nhật Apps Script bản có lời nhắn thì ping báo lỗi
// -> trang tự ẩn nút lời nhắn.
//
// Chống spam như form: ô bẫy hp phải trống, form mở ít nhất 2 s trước khi gửi, giới hạn độ dài, và giới
// hạn số lần gửi theo IP (trong bộ nhớ của từng máy chủ — chặn được người gửi dồn dập là chính).
// Chống trùng: cùng lời nhắn gửi lại trong 10 phút không ghi thêm; đọc ra thì lời nhắn trùng chỉ hiện một.
// =============================================================================

const IMAGE = /^assets\/img\/[\w\-/.]+\.(webp|jpe?g|png|gif)$/i
const AVATARS = ['🐺', '🐻', '🦊', '🐯', '🐶', '🐟', '🐷', '👨‍🌾'] // khớp hàng chọn avatar ở gallery.html
const clip = (s, n) => String(s ?? '').replace(/\s+\n/g, '\n').trim().slice(0, n)
const hits = new Map() // ip -> [mốc gửi gần đây]
// Trùng lời nhắn = cùng ảnh + cùng tên + cùng nội dung (bỏ khác biệt hoa / thường, dấu cách thừa).
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()
const dupKey = (image, name, text) => `${image}|${norm(name)}|${norm(text)}`
// Gửi trùng (bấm hai lần, gửi lại sau khi Sheet chậm báo lỗi mà thật ra đã ghi): cùng lời nhắn trong 10 phút thì
// coi như đã nhận, không ghi thêm dòng; đang gửi dở thì đợi chính lần gửi đó. Nhớ trong bộ nhớ máy chủ (như
// giới hạn theo IP) — trang còn tự kiểm tra Sheet trước khi gửi lại, và lúc đọc ra thì lời nhắn trùng chỉ hiện một.
const DUP_MS = 10 * 60 * 1000
// lời nhắn trùng (kể cả các dòng trùng đã lỡ vào Sheet) chỉ hiện một — giữ bản mới nhất (Sheet trả mới trước)
function uniq(image, list) {
  const seen = new Set()
  return list.filter((m) => {
    const k = dupKey(image, m?.name, m?.text)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
const sent = new Map() // dupKey -> mốc đã ghi
const inflight = new Map() // dupKey -> Promise lần đang gửi
// tối đa 10 lời nhắn / 7 phút / IP (5 / 10 phút như trước thì người thật viết được vài ảnh là bị chặn)
const LIMIT = { n: 10, ms: 7 * 60 * 1000 }

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

// Apps Script hay chậm (3–10 s) và có lúc trả 404 ("không mở được tệp" của Google) dù link đúng -> lỗi nhanh
// (404, không phải JSON, rớt mạng) thì thử lại một lần; treo quá hạn thì không (lượt sau đọc bản đệm).
async function sheetGet(sheet, params) {
  const t0 = Date.now()
  for (let i = 0; ; i++) {
    try {
      const r = await fetch(`${sheet}?${new URLSearchParams(params)}`, { redirect: 'follow', signal: AbortSignal.timeout(8000) })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) throw Object.assign(new Error(j?.error || `sheet ${r.status}${j ? '' : ' (not json)'}`), { sheet: !!j })
      return j
    } catch (e) {
      if (i || e.sheet || e.name === 'TimeoutError' || Date.now() - t0 > 5000) throw e
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}

// Bản đệm "mọi lời nhắn" trong máy chủ (Vercel giữ máy ấm giữa các lượt): mọi lượt đọc — cả theo từng ảnh —
// lấy từ đây, mỗi FRESH_MS mới đọc Sheet một lần (nhiều lượt cùng lúc chung một lần đọc). Sheet chậm thì chờ tối đa
// WAIT_MS rồi trả bản cũ (lần đọc vẫn chạy tiếp cho lượt sau); Sheet lỗi thì trả bản cũ — note cũ vài phút vẫn hơn
// trang trống / nút gửi báo lỗi.
const FRESH_MS = 20 * 1000
const WAIT_MS = 2500
let snap = null // { at, all: { ảnh: [lời nhắn…] } }
let loading = null
function loadAll(sheet, force) {
  if (snap && !force && Date.now() - snap.at < FRESH_MS) return Promise.resolve(snap)
  if (!loading) {
    const t0 = Date.now()
    loading = sheetGet(sheet, { action: 'all' })
      .then((j) => {
        const all = {}
        for (const [image, list] of Object.entries(j.all || {})) if (IMAGE.test(image)) all[image] = uniq(image, Array.isArray(list) ? list : [])
        // lời nhắn ghi xong ở máy này trong lúc đang đọc (Sheet trả bản chưa có) -> giữ lại
        for (const m of fresh) {
          const list = (all[m.image] ||= [])
          if (m.createdAt > t0 - 3000 && !list.some((x) => dupKey(m.image, x.name, x.text) === dupKey(m.image, m.name, m.text))) list.unshift(m.msg)
        }
        snap = { at: Date.now(), all }
        return snap
      })
      .finally(() => (loading = null))
  }
  const job = loading.catch((e) => {
    if (snap) return snap
    throw e
  })
  if (!snap || force) return job
  return Promise.race([job, new Promise((r) => setTimeout(() => r(snap), WAIT_MS))])
}
const fresh = [] // lời nhắn ghi xong ở máy này gần đây: { image, name, text, createdAt, msg }
function remember(image, msg) {
  if (snap) (snap.all[image] ||= []).unshift(msg)
  fresh.unshift({ image, name: msg.name, text: msg.text, createdAt: msg.createdAt, msg })
  fresh.length = Math.min(fresh.length, 50)
}
const CACHE = 'public, s-maxage=20, stale-while-revalidate=86400'

module.exports = async function handler(req, res) {
  const sheet = sheetUrl()
  if (!sheet) return res.status(503).json({ ok: false, error: 'messages are not configured' })

  if (req.method === 'GET') {
    try {
      if (req.query.ping) {
        if (!snap) await loadAll(sheet).catch(() => sheetGet(sheet, { action: 'ping' }))
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
        return res.status(200).json({ ok: true })
      }
      const force = !!req.query.fresh // trang kiểm tra lời nhắn đã vào Sheet chưa -> đọc Sheet thật
      if (req.query.all) {
        const s = await loadAll(sheet, force)
        res.setHeader('Cache-Control', CACHE)
        return res.status(200).json({ ok: true, all: s.all })
      }
      const image = String(req.query.image || '')
      if (!IMAGE.test(image)) return res.status(400).json({ ok: false, error: 'bad image' })
      let messages
      try {
        messages = (await loadAll(sheet, force)).all[image] || []
      } catch (e) {
        if (!e.sheet) throw e
        // Apps Script bản cũ chưa có action=all -> hỏi theo ảnh
        const j = await sheetGet(sheet, { action: 'messages', image })
        messages = uniq(image, Array.isArray(j.messages) ? j.messages : [])
      }
      res.setHeader('Cache-Control', CACHE)
      return res.status(200).json({ ok: true, messages })
    } catch (e) {
      console.error('[messages] GET', reason(e))
      res.setHeader('Cache-Control', 'no-store')
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
  const key = dupKey(image, name, text)
  const now = Date.now()
  for (const [k, t] of sent) if (now - t > DUP_MS) sent.delete(k)
  if (sent.has(key)) return res.status(200).json({ ok: true, dup: true })
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (!inflight.has(key) && limited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' })

  try {
    let job = inflight.get(key)
    if (!job) {
      job = (async () => {
        // Apps Script có lúc mất vài giây (khởi động + khoá ghi) — chờ đủ lâu để khỏi báo lỗi oan rồi người
        // dùng gửi lại thành hai dòng. Lỗi nhanh (404 thoáng qua của Google, rớt mạng) thì thử lại một lần.
        const t0 = Date.now()
        for (let i = 0; ; i++) {
          try {
            const r = await fetch(sheet, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ kind: 'message', image, name, text, avatar }),
              redirect: 'follow',
              signal: AbortSignal.timeout(Math.max(5000, 26000 - (Date.now() - t0))),
            })
            const j = await r.json().catch(() => null)
            if (!r.ok || !j?.ok) throw Object.assign(new Error(j?.error || `sheet ${r.status}${j ? '' : ' (not json)'}`), { sheet: !!j })
            break
          } catch (e) {
            if (i || e.sheet || e.name === 'TimeoutError' || Date.now() - t0 > 6000) throw e
            await new Promise((r) => setTimeout(r, 500))
          }
        }
        sent.set(key, Date.now())
        remember(image, { name, avatar, text, createdAt: Date.now() })
      })()
      inflight.set(key, job)
      job.catch(() => {}).finally(() => inflight.delete(key))
    }
    await job
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[messages] POST', reason(e))
    return res.status(502).json({ ok: false, error: 'could not save', reason: reason(e) })
  }
}
