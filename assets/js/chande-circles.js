/* =============================================================================
 * CHANDE — 3 vòng tròn ở About: nhìn qua bubble thấy ảnh khác, tách thành lưới ô
 * -----------------------------------------------------------------------------
 * Bubble vẫn đi theo chuột như thường (KHÔNG hút, không bắt đứng yên). Lại gần
 * vòng tròn thì bubble phình to hơn lõi một chút. Ảnh .peek (giữ cho CMS) được vẽ
 * lên canvas phủ lõi thành LƯỚI Ô TÁCH RỜI (như các mảng gạch mosaic ở hero): ô nằm
 * trong bubble thì hiện đủ, càng ra mép bubble ô càng co nhỏ lại (mép hơi so le theo
 * từng ô) — bubble đè lên lõi tới đâu thì lộ ảnh tới đó, chạm mép cũng thấy vài ô.
 *
 * API: window.CHANDE_CIRCLES = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    grow: 1.6, // bubble phình khi chuột cách tâm lõi < grow × bán kính lõi
    size: 1.12, // bán kính bubble lúc phình = size × bán kính lõi
    reveal: 1.05, // vùng lộ ảnh rộng bằng reveal × bán kính bubble
    cells: 18, // số ô theo bề ngang lõi
    gap: 0.12, // khe giữa các ô (× cạnh ô)
    edge: 2.2, // ô co dần trong dải mép rộng bằng edge × cạnh ô
  }
  window.CHANDE_SETTINGS_APPLY?.('circles', CONFIG)
  const api = { config: CONFIG, mount() {}, destroy() {} }
  window.CHANDE_CIRCLES = api
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let live = null

  function mount(root = document) {
    destroy()
    const scope = root.querySelector ? root : document
    const circles = [...scope.querySelectorAll('.hs-about .circle')]
      .map((c) => ({ c, core: c.querySelector('.core') || c, peek: c.querySelector('.peek') }))
      .filter((o) => o.peek)
    const dpr = Math.min(devicePixelRatio || 1, 2)
    for (const o of circles) {
      o.peek.loading = 'eager' // ảnh nguồn bị ẩn (display:none) — lazy thì không bao giờ tải
      o.cv = document.createElement('canvas')
      o.cv.className = 'peek-cv'
      o.cv.setAttribute('aria-hidden', 'true')
      o.peek.after(o.cv)
      o.ctx = o.cv.getContext('2d')
      o.drawn = false
      // so le mép theo từng ô (cố định, không nhấp nháy)
      o.jit = Array.from({ length: CONFIG.cells * CONFIG.cells }, () => Math.random() - 0.5)
    }
    // vẽ ảnh thành lưới ô: (bx, by, R) = bubble trong toạ độ canvas (px CSS)
    const paint = (o, bx, by, R) => {
      const W = o.cv.clientWidth
      if (!W) return
      if (o.cv.width !== Math.round(W * dpr)) o.cv.width = o.cv.height = Math.round(W * dpr)
      const ctx = o.ctx
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, W, W)
      o.drawn = false
      const img = o.peek
      if (!img.complete || !img.naturalWidth || R < 1) return
      const n = CONFIG.cells
      const c = W / n
      // ảnh phủ kín lõi (cover)
      const sc = Math.max(W / img.naturalWidth, W / img.naturalHeight)
      const ox = (W - img.naturalWidth * sc) / 2
      const oy = (W - img.naturalHeight * sc) / 2
      const band = c * CONFIG.edge
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * c
          const y = (j + 0.5) * c
          const e = (R + o.jit[j * n + i] * c * 0.9 - Math.hypot(x - bx, y - by)) / band
          if (e <= 0) continue
          const k = Math.min(1, e)
          const sz = c * (1 - CONFIG.gap) * (0.35 + 0.65 * k)
          const dx = x - sz / 2
          const dy = y - sz / 2
          ctx.drawImage(img, (dx - ox) / sc, (dy - oy) / sc, sz / sc, sz / sc, dx, dy, sz, sz)
          o.drawn = true
        }
    }
    if (!circles.length) return
    const ptr = { x: -1e4, y: -1e4 }
    const onMove = (e) => {
      ptr.x = e.clientX
      ptr.y = e.clientY
    }
    addEventListener('pointermove', onMove, { passive: true })

    // gần lõi vòng nào thì bubble phình bằng lõi đó (chỉ đổi cỡ, vẫn bám chuột)
    let near = null
    const lureFn = () => (near ? { r: near } : null)
    window.CHANDE_BUBBLE?.lure?.(lureFn, 'circles')

    let raf = 0
    let inView = false
    const tick = () => {
      raf = 0
      const B = window.CHANDE_BUBBLE?.state
      const R = B ? (B.size + B.swell) * B.presence * CONFIG.reveal : 0
      near = null
      for (const o of circles) {
        const k = o.core.getBoundingClientRect()
        const kr = k.width / 2
        if (Math.hypot(ptr.x - (k.left + kr), ptr.y - (k.top + kr)) < kr * CONFIG.grow) near = kr * CONFIG.size
        const p = o.cv.getBoundingClientRect()
        const over = B && R >= 1 && Math.hypot(B.x - (p.left + p.width / 2), B.y - (p.top + p.height / 2)) < R + p.width / 2
        if (over) paint(o, B.x - p.left, B.y - p.top, R)
        else if (o.drawn) paint(o, 0, 0, 0)
      }
      if (inView) raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      if (inView && !raf) raf = requestAnimationFrame(tick)
      if (!inView) near = null
    })
    io.observe(circles[0].c.closest('.circles') || circles[0].c)

    live = {
      el: circles[0].c,
      stop() {
        io.disconnect()
        cancelAnimationFrame(raf)
        removeEventListener('pointermove', onMove)
        window.CHANDE_BUBBLE?.lure?.(null, 'circles')
        for (const o of circles) o.cv.remove()
      },
    }
  }

  function destroy() {
    live?.stop()
    live = null
  }

  api.mount = mount
  api.destroy = destroy
  mount(document)
  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => {
      if (live && data.current.container?.contains(live.el)) destroy()
    })
  }
})()
