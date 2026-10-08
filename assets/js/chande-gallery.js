/* =============================================================================
 * CHANDE — Gallery: lưới ảnh vô tận (bố cục theo 197historiasilustradas.com)
 * -----------------------------------------------------------------------------
 *   • [data-gallery]        sân khấu cố định toàn màn; kéo chuột / vuốt / lăn
 *                           chuột / trackpad để đi mọi hướng, thả tay có quán tính
 *   • [data-gallery-items]  danh sách ảnh JSON: {name, img, full?} — `img` là thumb
 *                           vuông, `full` mở ở lightbox (CMS sửa được)
 *   • Lưới: ô vuông cạnh --g-size, cột cách CONFIG.colGap × ô, ô cột lẻ lệch
 *     xuống CONFIG.zig × ô, mỗi hàng lệch ngang một đoạn khác nhau. Lưới không có
 *     biên: ô (cột c, hàng r) hiện ảnh số (c + r·step) mod N, `step` tự chọn sao
 *     cho cùng một ảnh lặp lại ở xa nhau nhất. Chỉ dựng DOM cho ô trong màn
 *     (dùng lại phần tử qua pool).
 *   • Intro: các ô bật lên lan từ tâm màn, rồi caption hiện — chờ loading xong
 *     (lần tải đầu) hoặc rèm chuyển trang mở (đi tới bằng Barba).
 *   • Bấm một ô: lightbox phóng ảnh từ đúng vị trí ô; bấm bất kỳ / Esc để đóng.
 * Mount / gỡ theo Barba giống chande-hero.js. File nạp ở cả ba trang.
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    colGap: 2.02, // khoảng cách cột / cạnh ô
    rowGap: 2.2, // khoảng cách hàng / cạnh ô
    zig: 0.53, // ô cột lẻ lệch xuống bao nhiêu × cạnh ô
    rowShift: 0.618, // hàng r lệch ngang frac(r × rowShift) × khoảng cột
    ease: 0.12, // độ bám theo đích mỗi frame 60fps (0..1)
    throw: 280, // quán tính khi thả tay: px / (px/ms)
    dragThreshold: 5, // px — dưới mức này là bấm, không phải kéo
    introSpread: 1.1, // s — ô xa tâm nhất bật lên trễ bấy nhiêu
  }

  const gsap = window.gsap
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let G = null

  const mod = (a, n) => ((a % n) + n) % n
  const frac = (v) => v - Math.floor(v)

  function mount(root = document, viaBarba = false) {
    const scope = root.querySelector ? root : document
    const stage = scope.querySelector('[data-gallery]')
    if (!stage) return
    destroy()

    let items = []
    try {
      items = JSON.parse(stage.querySelector('[data-gallery-items]')?.textContent || '[]')
    } catch (e) {
      console.warn('[chande-gallery] JSON ảnh lỗi', e)
    }
    items = items.filter((it) => it && it.img)
    if (!items.length) return

    const world = stage.querySelector('[data-gallery-world]') || stage
    const probe = document.createElement('div')
    probe.className = 'gal__probe'
    stage.appendChild(probe)

    // Nạp sẵn mọi thumb (nhẹ) để ô mới hiện ra khi kéo không bị nháy trắng.
    items.forEach((it) => {
      const im = new Image()
      im.decoding = 'async'
      im.src = it.img
    })

    G = {
      stage,
      world,
      probe,
      items,
      N: items.length,
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      vw: 0,
      vh: 0,
      S: 0,
      cap: 0,
      px: 0,
      py: 0,
      step: 1,
      active: new Map(), // "c,r" -> phần tử
      pool: [],
      raf: 0,
      last: 0,
      dirty: true,
      intro: reduce || !gsap ? 'done' : 'pending',
      drag: null,
      justDragged: false,
      lb: null,
      off: [],
    }

    measure()
    G.x = G.tx = G.vw / 2 - G.S / 2
    G.y = G.ty = G.vh / 2 - (G.S + G.cap) / 2
    render()

    const on = (el, ev, fn, opt) => {
      el.addEventListener(ev, fn, opt)
      G.off.push(() => el.removeEventListener(ev, fn, opt))
    }
    on(stage, 'pointerdown', onDown)
    on(window, 'pointermove', onMove)
    on(window, 'pointerup', onUp)
    on(window, 'pointercancel', onUp)
    on(stage, 'wheel', onWheel, { passive: false })
    on(stage, 'click', onClick, true)
    on(stage, 'dragstart', (e) => e.preventDefault())
    on(window, 'resize', () => {
      measure()
      G.dirty = true
    })
    on(window, 'keydown', onKey)

    G.last = performance.now()
    G.raf = requestAnimationFrame(tick)

    // Intro: lần tải đầu chờ loading; đi tới bằng Barba thì chờ rèm mở.
    if (G.intro === 'pending') {
      const start = () => G && G.stage === stage && playIntro()
      const loading = window.CHANDE_LOADING
      const loadingDone =
        !loading || loading.config?.enabled === false || document.documentElement.classList.contains('cl-done')
      if (viaBarba) on(document, 'chande-transition:done', start, { once: true })
      else if (loadingDone) start()
      else on(document, 'chande-loading:done', start, { once: true })
    }
  }

  function destroy() {
    if (!G) return
    cancelAnimationFrame(G.raf)
    G.off.forEach((f) => f())
    closeLightbox(true)
    if (gsap) G.world.querySelectorAll('.gal__media, .gal__cap').forEach((el) => gsap.killTweensOf(el))
    G.world.innerHTML = ''
    G.probe.remove()
    G = null
  }

  /* ------------------------------------------------------------ hình học -- */
  function measure() {
    const r = G.stage.getBoundingClientRect()
    G.vw = r.width
    G.vh = r.height
    G.S = G.probe.offsetWidth || 160
    G.cap = G.probe.offsetHeight || 28
    G.px = G.S * CONFIG.colGap
    G.py = G.S * CONFIG.rowGap
    G.step = bestStep()
  }

  // Chọn bước nhảy giữa các hàng sao cho cùng một ảnh lặp lại ở xa nhất có thể.
  function bestStep() {
    const { N, px, py } = G
    if (N < 3) return 1
    let best = 1
    let bestD = -1
    for (let s = 1; s < N; s++) {
      let d = Infinity
      for (let r = 1; r <= 8; r++) {
        const c = mod(-r * s, N) // ô (c, r) trùng ảnh với ô (0, 0)
        d = Math.min(d, Math.hypot(c * px, r * py), Math.hypot((c - N) * px, r * py))
      }
      if (d > bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  const rowOff = (r) => frac(r * CONFIG.rowShift) * G.px
  const cellX = (c, r) => c * G.px + rowOff(r)
  const cellY = (c, r) => r * G.py + (mod(c, 2) ? G.S * CONFIG.zig : 0)

  /* -------------------------------------------------------------- vẽ ------ */
  function tick(now) {
    if (!G) return
    const dt = Math.min(64, now - G.last) / (1000 / 60)
    G.last = now
    const k = 1 - Math.pow(1 - CONFIG.ease, dt)
    const dx = G.tx - G.x
    const dy = G.ty - G.y
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) {
      G.x += dx * k
      G.y += dy * k
      G.dirty = true
    }
    if (G.dirty) render()
    G.raf = requestAnimationFrame(tick)
  }

  function render() {
    G.dirty = false
    const { S, cap, px, py, vw, vh, x, y } = G
    const h = S + cap
    const used = new Set()
    const r0 = Math.floor((-y - h - S * CONFIG.zig) / py)
    const r1 = Math.ceil((vh - y) / py)
    for (let r = r0; r <= r1; r++) {
      const off = rowOff(r)
      const c0 = Math.floor((-x - off - S) / px)
      const c1 = Math.ceil((vw - x - off) / px)
      for (let c = c0; c <= c1; c++) {
        const sx = cellX(c, r) + x
        const sy = cellY(c, r) + y
        if (sx > vw || sx + S < 0 || sy > vh || sy + h < 0) continue
        const key = c + ',' + r
        used.add(key)
        let el = G.active.get(key)
        if (!el) {
          el = acquire(mod(c + r * G.step, G.N))
          G.active.set(key, el)
        }
        el.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0)`
      }
    }
    for (const [key, el] of G.active) {
      if (used.has(key)) continue
      G.active.delete(key)
      if (gsap) gsap.killTweensOf([el._media, el._cap])
      el.style.display = 'none'
      G.pool.push(el)
    }
  }

  function acquire(idx) {
    let el = G.pool.pop()
    if (!el) {
      el = document.createElement('a')
      el.className = 'gal__item'
      el.draggable = false
      el.innerHTML =
        '<div class="gal__card"><div class="gal__cap"><span class="gal__num"></span><span class="gal__name"></span></div>' +
        '<div class="gal__media"><img alt="" draggable="false" decoding="async"></div></div>'
      el._media = el.querySelector('.gal__media')
      el._cap = el.querySelector('.gal__cap')
      el._img = el.querySelector('img')
      G.world.appendChild(el)
    }
    if (el._idx !== idx) {
      const it = G.items[idx]
      el._idx = idx
      el.href = it.full || it.img
      el.querySelector('.gal__num').textContent = String(idx + 1).padStart(2, '0') + '.'
      el.querySelector('.gal__name').textContent = it.name || ''
      el._img.src = it.img
      el._img.alt = it.name || ''
    }
    el.style.display = ''
    if (gsap) {
      if (G.intro === 'done') gsap.set([el._media, el._cap], { clearProps: 'transform,opacity' })
      else {
        gsap.set(el._media, { scale: 0 })
        gsap.set(el._cap, { opacity: 0 })
      }
    }
    return el
  }

  function playIntro() {
    if (G.intro !== 'pending') return
    G.intro = 'done'
    const cx = G.vw / 2
    const cy = G.vh / 2
    const els = [...G.active.values()]
    const dist = els.map((el) => {
      const r = el._media.getBoundingClientRect()
      return Math.hypot(r.left + r.width / 2 - cx, r.top + r.height / 2 - cy)
    })
    const max = Math.max(1, ...dist)
    els.forEach((el, i) => {
      const d = (dist[i] / max) * CONFIG.introSpread
      gsap.fromTo(el._media, { scale: 0 }, { scale: 1, duration: 0.8, delay: d, ease: 'expo.out', clearProps: 'transform' })
      gsap.fromTo(el._cap, { opacity: 0 }, { opacity: 1, duration: 0.6, delay: CONFIG.introSpread * 0.6 + d, ease: 'power2.out', clearProps: 'opacity' })
    })
  }

  /* --------------------------------------------------------- tương tác ---- */
  function onDown(e) {
    if (e.button !== 0 || G.lb) return
    G.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, vx: 0, vy: 0, moved: false }
  }

  function onMove(e) {
    const d = G?.drag
    if (!d || e.pointerId !== d.id) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < CONFIG.dragThreshold) return
      d.moved = true
      G.stage.classList.add('is-dragging')
      try {
        G.stage.setPointerCapture(e.pointerId)
      } catch {}
    }
    const dx = e.clientX - d.lx
    const dy = e.clientY - d.ly
    const dt = Math.max(1, e.timeStamp - d.lt)
    d.vx = d.vx * 0.6 + (dx / dt) * 0.4
    d.vy = d.vy * 0.6 + (dy / dt) * 0.4
    d.lx = e.clientX
    d.ly = e.clientY
    d.lt = e.timeStamp
    G.tx += dx
    G.ty += dy
  }

  function onUp(e) {
    const d = G?.drag
    if (!d || e.pointerId !== d.id) return
    G.drag = null
    if (!d.moved) return
    // Dừng tay lâu trước khi thả thì không ném.
    if (e.timeStamp - d.lt < 80) {
      G.tx += d.vx * CONFIG.throw
      G.ty += d.vy * CONFIG.throw
    }
    G.stage.classList.remove('is-dragging')
    G.justDragged = true
    setTimeout(() => G && (G.justDragged = false), 0)
  }

  function onWheel(e) {
    e.preventDefault()
    if (G.lb) return
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? G.vh : 1
    let dx = e.deltaX * unit
    let dy = e.deltaY * unit
    if (e.shiftKey && !dx) [dx, dy] = [dy, 0]
    G.tx -= dx
    G.ty -= dy
  }

  function onClick(e) {
    const item = e.target.closest('.gal__item')
    if (!item && !G.justDragged) return
    e.preventDefault()
    e.stopPropagation()
    if (G.justDragged || !item) return
    openLightbox(item)
  }

  function onKey(e) {
    if (e.key === 'Escape') return closeLightbox()
    if (G.lb) return
    const m = { ArrowLeft: [1, 0], ArrowRight: [-1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key]
    if (!m) return
    G.tx += m[0] * G.px
    G.ty += m[1] * G.py
  }

  /* ---------------------------------------------------------- lightbox ---- */
  function openLightbox(item) {
    if (G.lb) return
    const it = G.items[item._idx]
    const lb = document.createElement('div')
    lb.className = 'gal-lb'
    lb.innerHTML =
      '<figure class="gal-lb__fig"><img class="gal-lb__img" alt=""><figcaption class="gal-lb__cap"><span></span><span></span></figcaption></figure>'
    const img = lb.querySelector('img')
    const [num, name] = lb.querySelectorAll('figcaption span')
    num.textContent = String(item._idx + 1).padStart(2, '0') + '.'
    name.textContent = it.name || ''
    img.alt = it.name || ''
    G.lb = { el: lb, img, item }
    lb.addEventListener('click', () => closeLightbox())
    document.body.appendChild(lb)

    const show = () => {
      if (!G?.lb || G.lb.el !== lb || !gsap) return
      gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.35, ease: 'power2.out' })
      const from = flipFrom(item, img)
      if (from) gsap.fromTo(img, from, { x: 0, y: 0, scale: 1, duration: 0.8, ease: 'expo.out' })
      gsap.fromTo(lb.querySelector('figcaption'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.5, delay: 0.3 })
    }
    if (gsap) gsap.set(lb, { opacity: 0 })
    img.onload = show
    img.onerror = () => {
      if (img.src.endsWith(it.img)) return
      img.src = it.img
    }
    img.src = it.full || it.img
    if (img.complete && img.naturalWidth) show()
  }

  // Biến đổi để ảnh lightbox trùm đúng chỗ ô trên lưới (FLIP, gốc 0 0).
  function flipFrom(item, img) {
    const a = item._media.getBoundingClientRect()
    const b = img.getBoundingClientRect()
    if (!b.width || !a.width) return null
    const s = Math.max(a.width / b.width, a.height / b.height)
    return { x: a.left + a.width / 2 - (b.left + (b.width * s) / 2), y: a.top + a.height / 2 - (b.top + (b.height * s) / 2), scale: s }
  }

  function closeLightbox(instant) {
    const lb = G?.lb
    if (!lb) return
    G.lb = null
    const done = () => lb.el.remove()
    if (instant || !gsap) return done()
    gsap.killTweensOf([lb.el, lb.img])
    // Ô gốc còn trên màn thì thu ảnh về đúng chỗ ô; flipFrom đo từ trạng thái gốc.
    gsap.set(lb.img, { x: 0, y: 0, scale: 1 })
    const target = lb.item.isConnected && lb.item.style.display !== 'none' ? flipFrom(lb.item, lb.img) : null
    if (target) gsap.to(lb.img, { ...target, duration: 0.55, ease: 'expo.inOut' })
    gsap.to(lb.el.querySelector('figcaption'), { opacity: 0, duration: 0.2 })
    gsap.to(lb.el, { opacity: 0, duration: 0.45, delay: target ? 0.15 : 0, ease: 'power2.in', onComplete: done })
  }

  /* ------------------------------------------------------------ Khởi động */
  mount(document)

  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container, true))
    window.barba.hooks.afterLeave((data) => {
      if (G && data.current.container?.contains(G.stage)) destroy()
    })
  }

  window.CHANDE_GALLERY = {
    config: CONFIG,
    mount,
    destroy,
    refresh: () => G && (measure(), (G.dirty = true)),
    // Độ dời hiện tại của lưới: điểm thế giới (wx, wy) đang ở màn (wx + x, wy + y).
    view: () => (G ? { x: G.x, y: G.y } : null),
  }
})()
