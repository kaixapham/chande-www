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
const maybe = new Map() // dupKey -> mốc lần gửi lỗi mà có thể Sheet đã ghi
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
const reason = (e) => (e instanceof TypeError ? `fetch: ${e.cause?.code || 'bad url or network'}` : String(e?.message || e).slice(0, 120))
// Apps Script trả trang HTML thay vì JSON: lấy <title> cho log dễ dò (bỏ mọi đường link)
const htmlTitle = (t) => {
  const m = /<title>([^<]{1,80})<\/title>/i.exec(t || '')
  return m ? `: ${m[1].replace(/https?:\S+/g, '').trim()}` : ''
}
// đọc trả lời của Apps Script: JSON { ok: true } mới là được; lỗi có e.sheet = Apps Script tự báo lỗi (JSON ok:false)
async function sheetJSON(r) {
  const txt = await r.text()
  let j = null
  try {
    j = JSON.parse(txt)
  } catch {}
  if (!r.ok || !j?.ok) throw Object.assign(new Error(j?.error || `sheet ${r.status}${j ? '' : ` (not json${htmlTitle(txt)})`}`), { sheet: !!j })
  return j
}

// Apps Script hay chậm (3–10 s) và có lúc trả 404 ("không mở được tệp" của Google) dù link đúng -> lỗi nhanh
// (404, không phải JSON, rớt mạng) thì thử lại một lần; treo quá hạn thì không (lượt sau đọc bản đệm).
async function sheetGet(sheet, params, ms = 8000) {
  const t0 = Date.now()
  for (let i = 0; ; i++) {
    try {
      return await sheetJSON(await fetch(`${sheet}?${new URLSearchParams(params)}`, { redirect: 'follow', signal: AbortSignal.timeout(ms) }))
    } catch (e) {
      if (i || e.sheet || e.name === 'TimeoutError' || Date.now() - t0 > 5000) throw e
      await new Promise((r) => setTimeout(r, 400))
    }
  }
}

// Bản đệm trong máy chủ (Vercel giữ máy ấm giữa các lượt): "mọi lời nhắn" (khoá '*') và — khi Apps Script còn là
// bản cũ chưa có action=all — lời nhắn theo từng ảnh. Mỗi FRESH_MS mới đọc Sheet một lần / khoá (nhiều lượt cùng lúc
// chung một lần đọc). Sheet chậm thì chờ tối đa WAIT_MS rồi trả bản cũ (lần đọc vẫn chạy tiếp cho lượt sau); Sheet
// lỗi thì trả bản cũ — note cũ vài chục giây vẫn hơn trang trống / chờ 10 s.
const FRESH_MS = 20 * 1000
const WAIT_MS = 2500
const snaps = new Map() // khoá -> { at, data }
const loads = new Map() // khoá -> Promise lần đọc đang chạy
function cached(key, read, force) {
  const s = snaps.get(key)
  if (s && !force && Date.now() - s.at < FRESH_MS) return Promise.resolve(s.data)
  let job = loads.get(key)
  if (!job) {
    job = read(Date.now())
      .then((data) => {
        if (snaps.size > 1000) snaps.clear()
        snaps.set(key, { at: Date.now(), data })
        return data
      })
      .finally(() => loads.delete(key))
    loads.set(key, job)
  }
  const safe = job.catch((e) => {
    const old = snaps.get(key)
    if (old) return old.data
    throw e
  })
  if (!s || force) return safe
  return Promise.race([safe, new Promise((r) => setTimeout(() => r(s.data), WAIT_MS))])
}
// lời nhắn ghi xong ở máy này trong lúc đang đọc (Sheet trả bản chưa có) -> giữ lại
const fresh = [] // { image, createdAt, msg }
function withFresh(image, list, t0) {
  for (const m of fresh) {
    if (m.image !== image || m.createdAt < t0 - 3000) continue
    if (!list.some((x) => dupKey(image, x.name, x.text) === dupKey(image, m.msg.name, m.msg.text))) list.unshift(m.msg)
  }
  return list
}
function remember(image, msg) {
  const all = snaps.get('*')?.data
  if (all) (all[image] ||= []).unshift(msg)
  snaps.get(image)?.data.unshift(msg)
  fresh.unshift({ image, createdAt: msg.createdAt, msg })
  fresh.length = Math.min(fresh.length, 50)
}
const loadAll = (sheet, force) =>
  cached(
    '*',
    async (t0) => {
      const j = await sheetGet(sheet, { action: 'all' })
      const all = {}
      for (const [image, list] of Object.entries(j.all || {})) if (IMAGE.test(image)) all[image] = uniq(image, Array.isArray(list) ? list : [])
      for (const m of fresh) all[m.image] = withFresh(m.image, all[m.image] || [], t0)
      return all
    },
    force,
  )
// Apps Script bản cũ chưa có action=all (trả "bad request") -> 10 phút không hỏi lại, đọc theo từng ảnh
const NO_ALL_MS = 10 * 60 * 1000
let noAllAt = 0
async function loadImage(sheet, image, force) {
  if (Date.now() - noAllAt > NO_ALL_MS) {
    try {
      return (await loadAll(sheet, force))[image] || []
    } catch (e) {
      if (!e.sheet) throw e
      noAllAt = Date.now()
    }
  }
  return cached(
    image,
    async (t0) => {
      const j = await sheetGet(sheet, { action: 'messages', image })
      return withFresh(image, uniq(image, Array.isArray(j.messages) ? j.messages : []), t0)
    },
    force,
  )
}
const CACHE = 'public, s-maxage=20, stale-while-revalidate=86400'

module.exports = async function handler(req, res) {
  const sheet = sheetUrl()
  if (!sheet) return res.status(503).json({ ok: false, error: 'messages are not configured' })

  if (req.method === 'GET') {
    try {
      if (req.query.ping) {
        if (!snaps.size) await loadAll(sheet).catch(() => sheetGet(sheet, { action: 'ping' }))
        res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
        return res.status(200).json({ ok: true })
      }
      const force = !!req.query.fresh // trang kiểm tra lời nhắn đã vào Sheet chưa -> đọc Sheet thật
      if (req.query.all) {
        if (Date.now() - noAllAt < NO_ALL_MS) throw new Error('bad request')
        const all = await loadAll(sheet, force)
        res.setHeader('Cache-Control', CACHE)
        return res.status(200).json({ ok: true, all })
      }
      const image = String(req.query.image || '')
      if (!IMAGE.test(image)) return res.status(400).json({ ok: false, error: 'bad image' })
      const messages = await loadImage(sheet, image, force)
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
  for (const [k, t] of maybe) if (now - t > DUP_MS) maybe.delete(k)
  if (sent.has(key)) return res.status(200).json({ ok: true, dup: true })
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown'
  if (!inflight.has(key) && limited(ip)) return res.status(429).json({ ok: false, error: 'rate_limited' })

  try {
    let job = inflight.get(key)
    if (!job) {
      job = (async () => {
        // Apps Script hay báo lỗi OAN: dòng đã vào Sheet mà trả về trang HTML (đo trên live 2026-10-15: "sheet 200
        // (not json)" nhưng lời nhắn có trong Sheet), 404 thoáng qua, hay ghi xong mới quá hạn chờ — trước đây vì vậy
        // trang báo "Could not send", người dùng bấm lại 2–3 lần. Gặp vậy thì đọc lại Sheet: đã có lời nhắn -> gửi
        // được; chưa có mà còn thời gian thì gửi lại một lần. Apps Script báo lỗi rõ (JSON ok:false) = chưa ghi.
        const t0 = Date.now()
        const left = () => 27000 - (Date.now() - t0)
        const written = async () => {
          if (left() < 3000) return false
          const j = await sheetGet(sheet, { action: 'messages', image }, Math.min(9000, left())).catch(() => null)
          return !!j?.messages?.some((m) => dupKey(image, m.name, m.text) === key)
        }
        // lần trước chưa rõ đã ghi chưa (máy này) -> xem Sheet trước khi ghi thêm
        if (!(maybe.has(key) && (await written())))
          for (let i = 0; ; i++) {
            try {
              await sheetJSON(
                await fetch(sheet, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ kind: 'message', image, name, text, avatar }),
                  redirect: 'follow',
                  signal: AbortSignal.timeout(Math.min(i ? 12000 : 16000, left())),
                }),
              )
              break
            } catch (e) {
              if (e.sheet) throw e
              console.warn('[messages] POST', reason(e), '-> đọc lại Sheet')
              if (await written()) break
              if (i || left() < 12000) {
                maybe.set(key, Date.now())
                throw e
              }
            }
          }
        maybe.delete(key)
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
