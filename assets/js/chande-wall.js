/* =============================================================================
 * CHANDE — Bảng collage kéo thả (section "Kỷ niệm" trang chủ: [data-wall])
 * -----------------------------------------------------------------------------
 * Mỗi mảnh = một ảnh (PNG / WebP nền trong suốt: tem, sticker, ảnh…) đặt tự do trên bảng.
 * Danh sách ở <script type="application/json" data-wall-pieces> ngay trong bảng — sửa bằng
 * trình sửa wall-edit.html (kéo dời, Shift + kéo xoay, lăn chuột đổi cỡ, thêm / xoá ảnh):
 *   { "num", "name", "img", "x", "y", "w", "rot" }
 *   x, y = góc trên trái, w = bề rộng — đơn vị px của bản thiết kế 1920 (co theo --u như mọi
 *   thứ trong section); rot = độ xoay quanh tâm; thứ tự trong danh sách = thứ tự chồng (sau = trên).
 * Bản mobile (≤ 899px) là ảnh TĨNH dàn riêng: mx, my, mw, mr = cùng ý nghĩa nhưng theo khung 375 ×
 *   748·n (n = data-m-screens của section, 2 hoặc 3 màn; CSS co theo --s như các khung "một màn").
 *   mimg = bản ảnh nhẹ cho mobile (scripts/wall-optimize.py tạo, đuôi -m<bề rộng>.webp) — chỉ dùng khi
 *   còn khớp ảnh gốc và đủ nét cho mw; không có mx thì mảnh ẩn trên mobile.
 * Không có hiệu ứng cuộn: cuộn tới là mọi mảnh đã nằm sẵn. Người xem kéo thả được (chuột / bút):
 * kéo đi, thả là nằm đó (giữ nguyên lớp chồng — mảnh dưới không tự trồi lên trên; không lưu,
 * tải lại trang về như cũ).
 * Màn cảm ứng: không kéo (để vuốt cuộn trang như thường).
 *
 * API: window.CHANDE_WALL = { mount(root), render(board, pieces, opts) }
 * ========================================================================== */
;(() => {
  'use strict'

  const CONFIG = {
    lift: 1.04, // phóng nhẹ lúc đang cầm
  }
  window.CHANDE_SETTINGS_APPLY?.('wall', CONFIG)

  const canDrag = () => matchMedia('(hover: hover) and (pointer: fine)').matches
  const mobileMQ = matchMedia('(max-width: 899px)')

  // Ảnh nhẹ cho mobile (mimg): phải sinh từ đúng ảnh đang dùng (đổi ảnh ở CMS / trình sửa thì bản cũ
  // lệch -> bỏ) và đủ nét: bề rộng ghi trong tên ≥ 2.4 × mw (màn 3x, khung co ~0.8).
  const stem = (path) => String(path || '').replace(/(-d\d+)?\.(png|webp|jpe?g)$/i, '')
  function mobileSrc(p) {
    const m = /-m(\d+)\.webp$/.exec(p.mimg || '')
    const ok = m && p.mimg.startsWith(`${stem(p.orig || p.img)}-m`) && +m[1] >= 2.4 * (+p.mw || 0)
    return ok ? p.mimg : p.img
  }

  // Vẽ danh sách mảnh vào bảng. opts.src(path) -> đường dẫn hiển thị (trình sửa dùng ảnh chưa lưu);
  // opts.mobile = dùng ảnh mobile (mặc định theo cỡ màn).
  function render(board, pieces, opts = {}) {
    board.querySelectorAll('.wall__piece').forEach((el) => el.remove())
    const mobile = opts.mobile ?? mobileMQ.matches
    const frag = document.createDocumentFragment()
    pieces.forEach((p, i) => {
      if (!p?.img) return
      const el = document.createElement('img')
      el.className = 'wall__piece'
      const src = mobile ? mobileSrc(p) : p.img
      el.src = opts.src ? opts.src(src) : src
      el.alt = p.name || ''
      el.draggable = false
      el.decoding = 'async'
      if (!opts.eager) el.loading = 'lazy'
      el.dataset.i = i
      place(el, p)
      frag.append(el)
    })
    board.append(frag)
  }
  // Toạ độ ghi thành biến CSS; home.css (và trình sửa) chọn bộ desktop (--x…) hay mobile (--mx…).
  function place(el, p) {
    const st = el.style
    st.setProperty('--x', +p.x || 0)
    st.setProperty('--y', +p.y || 0)
    st.setProperty('--w', Math.max(8, +p.w || 300))
    st.setProperty('--r', +p.rot || 0)
    const has = Number.isFinite(+p.mx) && p.mx !== null && p.mx !== ''
    el.toggleAttribute('data-nom', !has) // chưa dàn cho mobile -> ẩn trên mobile
    if (!has) return
    st.setProperty('--mx', +p.mx || 0)
    st.setProperty('--my', +p.my || 0)
    st.setProperty('--mw', Math.max(8, +p.mw || 120))
    st.setProperty('--mr', +p.mr || 0)
  }

  // Kéo thả cho người xem: dời bằng translate (px), không đụng toạ độ gốc
  function bindDrag(board) {
    if (board._wallDrag) return
    board._wallDrag = true
    board.addEventListener('pointerdown', (e) => {
      const el = e.target.closest?.('.wall__piece')
      if (!el || !canDrag() || e.button !== 0) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      const base = (el._d ||= { x: 0, y: 0 })
      const sx = e.clientX - base.x
      const sy = e.clientY - base.y
      el.classList.add('is-drag')
      const move = (ev) => {
        base.x = ev.clientX - sx
        base.y = ev.clientY - sy
        el.style.translate = `${base.x}px ${base.y}px`
      }
      const up = () => {
        el.classList.remove('is-drag')
        el.removeEventListener('pointermove', move)
        el.removeEventListener('pointerup', up)
        el.removeEventListener('pointercancel', up)
      }
      el.addEventListener('pointermove', move)
      el.addEventListener('pointerup', up)
      el.addEventListener('pointercancel', up)
    })
  }

  function mount(root = document) {
    const scope = root.querySelectorAll ? root : document
    scope.querySelectorAll('[data-wall]').forEach((board) => {
      let list = []
      try {
        list = JSON.parse(board.querySelector('[data-wall-pieces]')?.textContent || '[]')
      } catch (e) {
        console.warn('[chande-wall] danh sách mảnh lỗi:', e)
      }
      board._wallList = list
      render(board, list)
      bindDrag(board)
    })
  }
  // qua lại mốc 900px (xoay iPad, kéo cửa sổ): đổi bộ ảnh desktop / mobile
  mobileMQ.addEventListener?.('change', () =>
    document.querySelectorAll('[data-wall]').forEach((b) => b._wallList && render(b, b._wallList)),
  )

  window.CHANDE_WALL = { config: CONFIG, mount, render, place, mobileSrc }
  mount(document)
  window.barba?.hooks?.beforeEnter((data) => mount(data.next.container))
})()
