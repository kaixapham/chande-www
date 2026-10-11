/* =============================================================================
 * CHANDE — Vá text-box cho trình duyệt cũ (Safari < 18.2)
 * -----------------------------------------------------------------------------
 * Toàn site căn chữ theo Figma bằng `text-box: trim-both cap alphabetic` (cắt
 * khoảng trên đỉnh chữ hoa và dưới chân chữ). Trình duyệt chưa hiểu thuộc tính
 * này thì mọi chữ lớn tụt xuống, các khối giãn ra. Ở đó: phần tử nào mang dấu
 * --tb:1 (CSS đặt kèm text-box, @property không kế thừa) được bù margin âm đúng
 * bằng phần lẽ ra bị cắt, tính từ số đo font:
 *   cắt trên = (line-height − (ascent + descent)) / 2 + (ascent − cap height)
 *   cắt dưới = (line-height − (ascent + descent)) / 2 + descent
 * Margin gốc của phần tử (CSS) giữ nguyên, chỉ cộng thêm. Tính lại khi đổi cỡ
 * màn, khi font nạp xong và sau mỗi lần chuyển trang (Barba).
 * Trình duyệt đã hỗ trợ text-box thì file này không làm gì.
 * ========================================================================== */
;(() => {
  if (CSS.supports('text-box', 'trim-both cap alphabetic') && !/[?&]tbfix\b/.test(location.search)) return

  // số đo font (theo em): ascent, descent, cap height — đo bằng canvas ở Chrome
  const METRICS = [
    [/geist mono/i, { a: 1.01, d: 0.29, c: 0.71 }],
    [/phudu/i, { a: 1.02, d: 0.2, c: 0.7 }],
  ]
  const FIXED = 'tbfix'

  function fix(root = document) {
    const scope = root.querySelectorAll ? root : document
    const els = scope.querySelectorAll('body *')
    for (const el of els) {
      // bỏ phần đã bù lần trước để đọc margin gốc
      if (el.dataset[FIXED]) {
        el.style.marginTop = ''
        el.style.marginBottom = ''
      }
      delete el.dataset.tbmark
    }
    const todo = []
    for (const el of els) {
      const cs = getComputedStyle(el)
      if (cs.getPropertyValue('--tb').trim() !== '1') continue
      if (cs.display === 'inline' || cs.display === 'none') continue
      if (!el.dataset[FIXED] && (el.style.marginTop || el.style.marginBottom)) continue // margin inline có chủ đích
      // khối lồng trong khối cũng có dấu: dòng đầu (cuối) của lớp ngoài nằm ở con đầu (cuối) — phần
      // đó lớp ngoài đã cắt, con không bù lần nữa; các con giữa vẫn tự cắt như thường
      const outer = el.parentElement?.closest('[data-tbmark]')
      const noTop = !!outer && el.parentElement === outer && el === outer.firstElementChild
      const noBottom = !!outer && el.parentElement === outer && el === outer.lastElementChild
      el.dataset.tbmark = ''
      const m = METRICS.find(([re]) => re.test(cs.fontFamily))?.[1]
      if (!m) continue
      const fs = parseFloat(cs.fontSize)
      const lh = cs.lineHeight === 'normal' ? fs * (m.a + m.d) : parseFloat(cs.lineHeight)
      const half = (lh - (m.a + m.d) * fs) / 2
      todo.push([el, parseFloat(cs.marginTop) - (noTop ? 0 : half + (m.a - m.c) * fs), parseFloat(cs.marginBottom) - (noBottom ? 0 : half + m.d * fs)])
    }
    // ghi sau khi đọc hết (tránh tính lại bố cục từng phần tử)
    for (const [el, top, bottom] of todo) {
      el.style.marginTop = `${top}px`
      el.style.marginBottom = `${bottom}px`
      el.dataset[FIXED] = '1'
    }
  }

  const run = () => fix(document)
  run()
  document.fonts?.ready.then(run)
  let t = 0
  let lastW = innerWidth
  addEventListener('resize', () => {
    if (innerWidth === lastW) return // thanh địa chỉ iOS co / giãn: không đổi cỡ chữ
    lastW = innerWidth
    clearTimeout(t)
    t = setTimeout(run, 120)
  })
  if (window.barba?.hooks) window.barba.hooks.afterEnter((data) => fix(data.next.container))
  window.CHANDE_TEXTBOX = { fix }
})()
