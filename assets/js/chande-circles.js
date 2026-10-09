/* =============================================================================
 * CHANDE — 3 vòng tròn ở About: nhìn qua bubble thấy ảnh khác, tách thành lưới ô
 * -----------------------------------------------------------------------------
 * Bubble vẫn đi theo chuột như thường (KHÔNG hút, không bắt đứng yên). Lại gần
 * vòng tròn thì bubble phình to hơn lõi một chút. Ảnh .peek (giữ cho CMS) được vẽ
 * lên canvas (phủ cả vòng): lòng bubble là ảnh LIỀN, chỉ dải sát MÉP bubble tách thành ô
 * (như các mảng gạch mosaic ở hero) — càng ra ngoài ô càng co nhỏ và ngả dần sang màu
 * lõi, mép so le theo từng ô. Bubble đè lên lõi tới đâu thì lộ ảnh tới đó, chạm mép cũng thấy vài ô.
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
    const CORE = 324 / 468 // lõi / vòng ngoài (home.css)
    // so le mép theo từng ô (cố định, không nhấp nháy)
    const jit = Array.from({ length: 997 }, () => Math.random() - 0.5)
    for (const o of circles) {
      o.peek.loading = 'eager' // ảnh nguồn bị ẩn (display:none) — lazy thì không bao giờ tải
      o.cv = document.createElement('canvas')
      o.cv.className = 'peek-cv'
      o.cv.setAttribute('aria-hidden', 'true')
      o.peek.after(o.cv)
      o.ctx = o.cv.getContext('2d')
      o.drawn = false
      // màu lõi (đọc điểm giữa hình lõi) — ô ngoài cùng hoà dần vào màu này
      o.tint = null
      const readTint = () => {
        try {
          const t = document.createElement('canvas')
          t.width = t.height = 8
          const tc = t.getContext('2d')
          tc.drawImage(o.core, 0, 0, 8, 8)
          const d = tc.getImageData(4, 4, 1, 1).data
          o.tint = `${d[0]},${d[1]},${d[2]}`
        } catch {}
      }
      if (o.core.complete && o.core.naturalWidth) readTint()
      else o.core.addEventListener('load', readTint, { once: true })
    }
    // Vẽ lên canvas phủ cả vòng tròn ngoài; (bx, by, R) = bubble trong toạ độ canvas (px CSS).
    // Lớp 1: phần vòng NGOÀI nằm dưới bubble đổi sang màu lõi (hình tròn trơn theo bubble).
    // Lớp 2 (cắt theo lõi): ảnh — lòng bubble liền, dải sát mép bubble tách ô co nhỏ dần.
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
      const D = W * CORE // đường kính lõi
      const co = (W - D) / 2
      const c = D / CONFIG.cells
      const nn = Math.ceil(W / c)
      const band = c * CONFIG.edge
      const inner = R - band
      // ảnh phủ kín lõi (cover)
      const sc = Math.max(D / img.naturalWidth, D / img.naturalHeight)
      const ox = co + (D - img.naturalWidth * sc) / 2
      const oy = co + (D - img.naturalHeight * sc) / 2
      const tint = o.tint ? `rgb(${o.tint})` : null
      // các ô trong dải mép bubble: cb(dx, dy, sz, k)
      const edgeCells = (cb) => {
        for (let j = 0; j < nn; j++)
          for (let i = 0; i < nn; i++) {
            const x = (i + 0.5) * c
            const y = (j + 0.5) * c
            const d = Math.hypot(x - bx, y - by)
            const e = (R + jit[(j * 97 + i) % jit.length] * c * 0.9 - d) / band
            if (e <= 0 || d + c * 0.71 < inner) continue
            const k = Math.min(1, e)
            const sz = c * (1 - CONFIG.gap) * (0.35 + 0.65 * k)
            cb(x - sz / 2, y - sz / 2, sz, k)
          }
      }
      const disc = (r) => {
        ctx.beginPath()
        ctx.arc(bx, by, r, 0, Math.PI * 2)
      }
      // lớp 1: vòng ngoài dưới bubble -> màu lõi
      if (tint) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2)
        ctx.clip()
        ctx.fillStyle = tint
        disc(R) // trơn theo mép bubble, không tách ô
        ctx.fill()
        ctx.restore()
        o.drawn = true
      }
      // lớp 2: ảnh, chỉ trong lõi
      ctx.save()
      ctx.beginPath()
      ctx.arc(W / 2, W / 2, D / 2, 0, Math.PI * 2)
      ctx.clip()
      if (inner > 0) {
        ctx.save()
        disc(inner)
        ctx.clip()
        ctx.drawImage(img, ox, oy, img.naturalWidth * sc, img.naturalHeight * sc)
        ctx.restore()
      }
      edgeCells((dx, dy, sz, k) => {
        ctx.drawImage(img, (dx - ox) / sc, (dy - oy) / sc, sz / sc, sz / sc, dx, dy, sz, sz)
        // càng ra ngoài càng phủ màu lõi
        if (o.tint && k < 1) {
          ctx.fillStyle = `rgba(${o.tint},${((1 - k) * 0.95).toFixed(3)})`
          ctx.fillRect(dx, dy, sz, sz)
        }
      })
      ctx.restore()
      o.drawn = true
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
