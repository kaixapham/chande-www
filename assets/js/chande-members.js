/* =============================================================================
 * CHANDE — Vòng "Key members" trang About
 * -----------------------------------------------------------------------------
 * Cung neon quanh ảnh là THANH TIẾN TRÌNH: chạy đủ một vòng (CONFIG.duration) thì
 * đổi sang người kế tiếp trong <script type="application/json" data-member-list>
 * (CMS sửa được: tên · vai trò · năm sinh - quê · ảnh · ảnh lộ qua bubble), quay vòng.
 * Đổi ảnh: các lớp màu (bảng màu đoàn shape của chande-reveal.js) TOẢ RA TỪ TÂM thành vòng
 * tròn nối đuôi nhau, lớp cuối là ảnh người mới; chữ đổi bằng hiệu ứng giải mã (chande-scramble.js).
 * Chỉ chạy khi vòng ở gần màn; giảm chuyển động thì đổi thẳng, không chạy thanh.
 * API: window.CHANDE_MEMBERS = { config, mount(root) }
 * ========================================================================== */
;(() => {
  const CONFIG = {
    duration: 6000, // ms — một vòng thanh tiến trình
    ring: 750, // ms — mỗi lớp màu toả từ tâm ra kín khung
    stagger: 120, // ms — lớp sau toả sau lớp trước
  }
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)

  // Các lớp màu toả từ tâm ra (vòng tròn đồng tâm, lớp sau đè lớp trước), lớp cuối là ảnh mới.
  function radial(face, from, to) {
    return new Promise((res) => {
      const w = to.width
      const cv = document.createElement('canvas')
      cv.width = cv.height = w
      cv.className = 'ab-member__shape'
      cv.setAttribute('aria-hidden', 'true')
      face.append(cv)
      const ctx = cv.getContext('2d')
      const colors = window.CHANDE_REVEAL?.config?.colors || ['#68f12b', '#f4f3eb', '#236c3c', '#c4ff6b', '#182220']
      const n = colors.length
      const R = (w / 2) * Math.SQRT2
      const total = n * CONFIG.stagger + CONFIG.ring
      const t0 = performance.now()
      const frame = (now) => {
        const t = now - t0
        ctx.clearRect(0, 0, w, w)
        if (from) ctx.drawImage(from, 0, 0, w, w)
        for (let k = 0; k <= n; k++) {
          const p = ease(Math.min(1, Math.max(0, (t - k * CONFIG.stagger) / CONFIG.ring)))
          if (p <= 0) break
          ctx.save()
          ctx.beginPath()
          ctx.arc(w / 2, w / 2, p * R, 0, Math.PI * 2)
          if (k < n) {
            ctx.fillStyle = colors[k]
            ctx.fill()
          } else {
            ctx.clip()
            ctx.drawImage(to, 0, 0, w, w)
          }
          ctx.restore()
        }
        if (t < total) requestAnimationFrame(frame)
        else res(cv)
      }
      requestAnimationFrame(frame)
    })
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  let stop = null

  const cover = (src, w, h) =>
    new Promise((res) => {
      const im = new Image()
      im.onload = () => {
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const k = Math.max(w / im.naturalWidth, h / im.naturalHeight)
        c.getContext('2d').drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k)
        res(c)
      }
      im.onerror = () => res(null)
      im.src = src
    })

  function mount(root = document) {
    stop?.()
    stop = null
    const box = (root.querySelector ? root : document).querySelector('[data-members]')
    if (!box) return
    let list = []
    try {
      list = JSON.parse(box.querySelector('[data-member-list]')?.textContent || '[]')
    } catch {}
    if (list.length < 2) return
    const $ = (s) => box.querySelector(s)
    const face = $('[data-member-face]')
    const img = face.querySelector('img')
    const bar = $('[data-member-bar]')
    // đổi chữ + hiệu ứng "giải mã" (ký hiệu code chốt dần về chữ mới — chande-scramble.js), lệch nhịp từng dòng
    let nth = 0
    const set = (sel, v) => {
      const el = $(sel)
      if (!el) return
      el.textContent = `[ ${v} ]`
      if (!reduced) window.CHANDE_SCRAMBLE?.run(el, 90 * nth++)
    }
    // nạp trước ảnh cả danh sách (lúc rảnh)
    setTimeout(() => list.forEach((m) => (new Image().src = m.img)), 1500)

    let i = 0
    let t = 0 // ms đã chạy của vòng hiện tại
    let last = 0
    let raf = 0
    let inView = false
    let busy = false
    const next = async () => {
      busy = true
      const prev = list[i]
      i = (i + 1) % list.length
      const m = list[i]
      nth = 0
      set('[data-member-name]', m.name)
      set('[data-member-role]', m.role)
      set('[data-member-meta]', m.meta)
      img.alt = `${m.name} — ${m.role}`
      const peek = box.querySelector('[data-member-peek]')
      if (peek && m.peek) peek.src = m.peek // ảnh lộ qua bubble của người này
      if (!reduced) {
        const dpr = Math.min(devicePixelRatio || 1, 2)
        const w = Math.round(face.offsetWidth * dpr)
        const [from, to] = await Promise.all([cover(prev.img, w, w), cover(m.img, w, w)])
        if (to) {
          const cv = await radial(face, from, to)
          img.src = m.img
          requestAnimationFrame(() => cv.remove())
        } else img.src = m.img
      } else img.src = m.img
      busy = false
    }
    const tick = (now) => {
      raf = 0
      const dt = last ? Math.min(100, now - last) : 0
      last = now
      if (!busy) {
        t += dt
        const p = Math.min(1, t / CONFIG.duration)
        bar.style.strokeDashoffset = `${100 - p * 100}`
        if (p >= 1) {
          t = 0
          next().then(() => (bar.style.strokeDashoffset = '100'))
        }
      }
      if (inView) raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      last = 0
      if (inView && !raf && !reduced) raf = requestAnimationFrame(tick)
    }, { rootMargin: '100px 0px' })
    io.observe(box)
    if (reduced) bar.style.strokeDashoffset = '0'
    stop = () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }

  // Dải ảnh chạy vô tận ([data-loop], dải "An exciting journey"): nhân bản bộ ảnh cho tới khi một
  // bộ dài hơn màn, rồi nhân đôi cả bộ -> CSS dịch −50% là khớp nối đuôi liền mạch. Bản sao bỏ
  // data-cms (CMS chỉ sửa ảnh gốc) + aria-hidden. Tốc độ đều ~CONFIG.loopSpeed px/giây.
  CONFIG.loopSpeed = 45
  function loops(root = document) {
    ;(root.querySelectorAll ? root : document).querySelectorAll('[data-loop]').forEach((track) => {
      if (track.dataset.loopReady) return
      const items = [...track.children]
      if (!items.length) return
      const copy = () =>
        items.map((n) => {
          const c = n.cloneNode(true)
          c.removeAttribute('data-cms')
          c.removeAttribute('data-cms-label')
          c.removeAttribute('data-cms-w')
          c.setAttribute('aria-hidden', 'true')
          c.alt = ''
          return c
        })
      const one = () => items.reduce((w, n) => w + n.getBoundingClientRect().width, 0)
      const w1 = one() || innerWidth
      const sets = Math.max(1, Math.ceil((innerWidth + 50) / w1))
      for (let k = 1; k < sets; k++) track.append(...copy()) // bộ A đủ dài hơn màn
      const setW = w1 * sets
      for (let k = 0; k < sets; k++) track.append(...copy()) // nhân đôi bộ A
      track.style.setProperty('--loop-dur', `${(setW / CONFIG.loopSpeed).toFixed(1)}s`)
      track.dataset.loopReady = '1'
    })
    window.CHANDE_IMGTILES?.mount(document) // ảnh nhân bản cũng vỡ ô khi rê chuột
  }

  window.CHANDE_MEMBERS = { config: CONFIG, mount: (r) => (mount(r), loops(r)) }
  loops(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => loops(data.next.container))
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
