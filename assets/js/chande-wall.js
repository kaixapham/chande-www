/* =============================================================================
 * CHANDE — Bảng collage kéo thả (section "Kỷ niệm" trang chủ: [data-wall])
 * -----------------------------------------------------------------------------
 * Mỗi mảnh = một ảnh (PNG / WebP nền trong suốt: tem, sticker, ảnh…) đặt tự do trên bảng.
 * Danh sách ở <script type="application/json" data-wall-pieces> ngay trong bảng — sửa bằng
 * trình sửa wall-edit.html (kéo dời, Shift + kéo xoay, lăn chuột đổi cỡ, thêm / xoá ảnh):
 *   { "num", "name", "img", "x", "y", "w", "rot" }
 *   x, y = góc trên trái, w = bề rộng — đơn vị px của bản thiết kế 1920 (co theo --u như mọi
 *   thứ trong section); rot = độ xoay quanh tâm; thứ tự trong danh sách = thứ tự chồng (sau = trên).
 * Không có hiệu ứng cuộn: cuộn tới là mọi mảnh đã nằm sẵn. Người xem kéo thả được (chuột / bút):
 * nhấc mảnh lên trên cùng, kéo đi, thả là nằm đó (không lưu — tải lại trang về như cũ).
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

  // Vẽ danh sách mảnh vào bảng. opts.src(path) -> đường dẫn hiển thị (trình sửa dùng ảnh chưa lưu).
  function render(board, pieces, opts = {}) {
    board.querySelectorAll('.wall__piece').forEach((el) => el.remove())
    const frag = document.createDocumentFragment()
    pieces.forEach((p, i) => {
      if (!p?.img) return
      const el = document.createElement('img')
      el.className = 'wall__piece'
      el.src = opts.src ? opts.src(p.img) : p.img
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
  function place(el, p) {
    el.style.left = `calc(${+p.x || 0} * var(--u))`
    el.style.top = `calc(${+p.y || 0} * var(--u))`
    el.style.width = `calc(${Math.max(8, +p.w || 300)} * var(--u))`
    el.style.rotate = `${+p.rot || 0}deg`
  }

  // Kéo thả cho người xem: dời bằng translate (px), không đụng toạ độ gốc
  function bindDrag(board) {
    if (board._wallDrag) return
    board._wallDrag = true
    let top = 1000
    board.addEventListener('pointerdown', (e) => {
      const el = e.target.closest?.('.wall__piece')
      if (!el || !canDrag() || e.button !== 0) return
      e.preventDefault()
      el.setPointerCapture(e.pointerId)
      const base = (el._d ||= { x: 0, y: 0 })
      const sx = e.clientX - base.x
      const sy = e.clientY - base.y
      el.style.zIndex = ++top
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
      render(board, list)
      bindDrag(board)
    })
  }

  window.CHANDE_WALL = { config: CONFIG, mount, render, place }
  mount(document)
  window.barba?.hooks?.beforeEnter((data) => mount(data.next.container))
})()
