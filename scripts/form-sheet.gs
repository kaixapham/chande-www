/* =============================================================================
 * CHANDE — Ghi form vào Google Sheet (dán vào Extensions → Apps Script của Sheet)
 * -----------------------------------------------------------------------------
 * api/submit.js POST JSON { form: 'register' | 'partner', entries: [[nhãn, giá trị], …] }
 * tới đường link Web app của script này (biến SHEET_WEBHOOK_URL trên Vercel — đường link
 * là bí mật, ai có link đều ghi được vào Sheet).
 *
 *   • Mỗi loại form một tab: "Register", "Partner" (chưa có thì tự tạo).
 *   • Cột khớp theo TÊN ở hàng 1: cột "Time" + mỗi câu hỏi một cột; câu hỏi mới thì tự
 *     thêm cột cuối. Cột tự thêm tay (Status, Note…) không bị đụng tới, đặt đâu cũng được.
 *   • Dòng mới nhất nằm dưới cùng.
 *
 *
 * Lời nhắn theo từng ảnh của Gallery 3D (api/messages.js):
 *   • POST { kind: 'message', image, name, avatar, text } -> thêm dòng vào tab "Messages"
 *     (Time · Image · Name · Avatar · Message · Hide; tab cũ thiếu cột thì tự thêm cột cuối).
 *   • GET ?action=messages&image=… -> các lời nhắn của ảnh đó, mới nhất trước.
 *     GET ?action=all -> { all: { ảnh: [lời nhắn…] } } — mọi ảnh trong một lần đọc (trang tải một lần là note
 *     của ảnh nào cũng hiện ngay, khỏi chờ Sheet mỗi lần mở ảnh).
 *     GET ?action=ping -> { ok } (site dùng để biết đã bật lời nhắn).
 *   • DUYỆT: gõ x (hay bất kỳ chữ gì) vào cột Hide của một dòng -> lời nhắn đó thôi hiện trên site.
 *
 * Triển khai: Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 * Sửa script xong phải Deploy → Manage deployments → Edit → Version: New version (giữ link).
 * ========================================================================== */
const TABS = { register: 'Register', partner: 'Partner' }
const MSG_TAB = 'Messages'
const MSG_HEAD = ['Time', 'Image', 'Name', 'Avatar', 'Message', 'Hide']

// chống công thức: ô bắt đầu bằng = + - @ thì thêm ' để Sheet hiểu là chữ
const safeCell = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v ?? '')

function doGet(e) {
  const p = (e && e.parameter) || {}
  if (p.action === 'ping') return out({ ok: true, messages: true })
  if (p.action !== 'messages' && p.action !== 'all') return out({ ok: false, error: 'bad request' })
  const rows = messageRows() // mới nhất trước, đã bỏ dòng có chữ ở cột Hide
  if (p.action === 'all') {
    const all = {}
    rows.forEach((m) => {
      const list = all[m.image] || (all[m.image] = [])
      if (list.length < 50) list.push(m.msg)
    })
    return out({ ok: true, all: all })
  }
  const image = String(p.image || '')
  return out({ ok: true, messages: rows.filter((m) => m.image === image).slice(0, 200).map((m) => m.msg) })
}

function messageRows() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MSG_TAB)
  if (!sh || sh.getLastRow() < 2) return []
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
  const at = (n) => head.indexOf(n)
  return sh
    .getRange(2, 1, sh.getLastRow() - 1, head.length)
    .getValues()
    .filter((r) => r[at('Image')] && !String(r[at('Hide')] ?? '').trim())
    .map((r) => ({
      image: String(r[at('Image')]),
      msg: {
        name: String(r[at('Name')] ?? '').replace(/^'/, ''),
        avatar: at('Avatar') >= 0 ? String(r[at('Avatar')] ?? '') : '',
        text: String(r[at('Message')] ?? '').replace(/^'/, ''),
        createdAt: new Date(r[at('Time')]).getTime() || 0,
      },
    }))
    .reverse()
}

function addMessage(body) {
  const book = SpreadsheetApp.getActiveSpreadsheet()
  let sh = book.getSheetByName(MSG_TAB)
  if (!sh) {
    sh = book.insertSheet(MSG_TAB)
    sh.getRange(1, 1, 1, MSG_HEAD.length).setValues([MSG_HEAD]).setFontWeight('bold')
    sh.setFrozenRows(1)
  }
  let head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
  const missing = MSG_HEAD.filter((k) => !head.includes(k))
  if (missing.length) {
    sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold')
    head = head.concat(missing)
  }
  const row = { Time: new Date(), Image: String(body.image || '').slice(0, 300), Name: String(body.name || '').slice(0, 40), Avatar: String(body.avatar || '').slice(0, 16), Message: String(body.text || '').slice(0, 500), Hide: '' }
  sh.appendRow(head.map((h) => safeCell(row[h])))
  sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy hh:mm')
  return out({ ok: true })
}

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const body = JSON.parse(e.postData.contents)
    if (body.kind === 'message') return addMessage(body)
    const name = TABS[body.form]
    if (!name || !Array.isArray(body.entries)) return out({ ok: false, error: 'bad request' })

    const book = SpreadsheetApp.getActiveSpreadsheet()
    const sh = book.getSheetByName(name) || book.insertSheet(name)
    const row = { Time: new Date() }
    body.entries.forEach(([k, v]) => {
      if (k) row[String(k).slice(0, 200)] = String(v ?? '').slice(0, 3000)
    })

    let head = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : []
    const missing = Object.keys(row).filter((k) => !head.includes(k))
    if (missing.length) {
      sh.getRange(1, head.length + 1, 1, missing.length).setValues([missing]).setFontWeight('bold')
      head = head.concat(missing)
      sh.setFrozenRows(1)
    }
    sh.appendRow(head.map((h) => safeCell(row[h])))
    sh.getRange(sh.getLastRow(), 1).setNumberFormat('dd/mm/yyyy hh:mm')
    return out({ ok: true })
  } catch (err) {
    return out({ ok: false, error: String(err) })
  } finally {
    lock.releaseLock()
  }
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON)
}
