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
 * Triển khai: Deploy → New deployment → Web app; Execute as: Me; Who has access: Anyone.
 * Sửa script xong phải Deploy → Manage deployments → Edit → Version: New version (giữ link).
 * ========================================================================== */
const TABS = { register: 'Register', partner: 'Partner' }

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(20000)
  try {
    const body = JSON.parse(e.postData.contents)
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
    // chống công thức: ô bắt đầu bằng = + - @ thì thêm ' để Sheet hiểu là chữ
    const cell = (v) => (typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v ?? '')
    sh.appendRow(head.map((h) => cell(row[h])))
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
