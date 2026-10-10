/* =============================================================================
 * CHANDE — Chữ nghiêng theo quán tính khi cuộn ([data-tilt])
 * -----------------------------------------------------------------------------
 * Cụm tiêu đề lớn (Agenda) bị "lực cuộn" đẩy nghiêng xuống bên phải rồi nhún lại
 * như có lò xo — kiểu chữ phản ứng theo vận tốc cuộn hay gặp trên Awwwards
 * (Locomotive skew-on-scroll, các trang dòng chữ lắc theo lò xo, dòng sau trễ
 * dòng trước như một sợi dây).
 *
 * Cơ chế: vận tốc cuộn (px/s) × strength -> góc đích (kẹp ±max). Mỗi DÒNG (con
 * trực tiếp của [data-tilt]) là một lò xo tắt dần (stiffness / damping) đuổi
 * theo góc đích; lineLag > 0 thì dòng i đuổi theo dòng i − 1 thay vì đuổi thẳng
 * góc đích -> sóng lan từ dòng đầu xuống dòng cuối. Góc lò xo được đổi ra
 * transform theo các hệ số: rotate, skew (skewY), drag (px tụt xuống / độ),
 * stretch (giãn dọc theo độ lớn góc). Cuộn xuống: nghiêng xuống bên phải; cuộn
 * lên: ngược lại.
 *
 * Chỉ chạy rAF khi cụm chữ đang trong màn và lò xo chưa lắng; reduced-motion thì
 * tắt hẳn. Mỗi khung chỉ ghi transform lên các dòng.
 *
 * API: window.CHANDE_TILT = { config, defaults, refresh(), applyPreset(tên), PRESETS }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    preset: 'hinge',
    strength: 1.6, // độ / (1000 px/s)
    max: 6, // độ, kẹp góc đích
    stiffness: 140, // lò xo: lớn = bật về nhanh
    damping: 11, // tắt dần: nhỏ = nhún nhiều
    lineLag: 0, // 0 = cả cụm cùng lúc · 1 = dòng sau đuổi dòng trước (sóng)
    origin: 'left', // điểm xoay CHUNG của cả cụm: left · center · right (giữa chiều cao cụm)
    rotate: 1, // hệ số xoay
    skew: 0, // hệ số skewY
    drag: 0, // px tụt xuống trên mỗi độ
    stretch: 0, // giãn dọc trên mỗi độ (0.01 = 1%)
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('tilt', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  // Preset: bộ số chép vào CONFIG khi chọn ở bảng setting.
  const PRESETS = {
    // Bản lề — cả cụm gập quanh mép trái như cánh cửa, nhún vừa.
    hinge: { strength: 1.6, max: 6, stiffness: 140, damping: 11, lineLag: 0, origin: 'left', rotate: 1, skew: 0, drag: 0, stretch: 0 },
    // Con lắc — xoay quanh tâm, lò xo mềm, lắc qua lại vài nhịp mới đứng.
    pendulum: { strength: 1.4, max: 5, stiffness: 70, damping: 4.5, lineLag: 0, origin: 'center', rotate: 1, skew: 0, drag: 0, stretch: 0 },
    // Thạch — không xoay mà xô lệch (skewY) + giãn dọc, dòng sau trễ nhẹ.
    jelly: { strength: 2.2, max: 8, stiffness: 160, damping: 9, lineLag: 0.35, origin: 'center', rotate: 0, skew: 1, drag: 0.6, stretch: 0.012 },
    // Sợi dây — từng dòng đuổi dòng trên, sóng chạy dọc cụm chữ.
    rope: { strength: 1.8, max: 6, stiffness: 120, damping: 8, lineLag: 0.8, origin: 'left', rotate: 1, skew: 0, drag: 1.2, stretch: 0 },
    // Quán tính nặng — ngả chậm, không nảy, đứng lại êm.
    heavy: { strength: 1.2, max: 4, stiffness: 45, damping: 14, lineLag: 0.2, origin: 'left', rotate: 1, skew: 0.3, drag: 0.8, stretch: 0 },
    // Giật nảy — cứng, góc nhỏ, bật về rất nhanh, rung vài nhịp ngắn.
    snap: { strength: 2.4, max: 3.5, stiffness: 420, damping: 9, lineLag: 0, origin: 'left', rotate: 1, skew: 0.4, drag: 0, stretch: 0 },
  }
  function applyPreset(name) {
    const p = PRESETS[name]
    if (!p) return
    Object.assign(CONFIG, p)
    CONFIG.preset = name
  }

  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {}, applyPreset, PRESETS }
  window.CHANDE_TILT = api
  if (reduced.matches) return

  const style = document.createElement('style')
  // Dòng co đúng bề rộng chữ (vẫn căn giữa) để điểm xoay left / right là mép chữ
  // chứ không phải mép khối.
  style.textContent =
    '[data-tilt] > *{width:fit-content; margin-inline:auto; will-change:transform}'
  document.head.appendChild(style)

  let groups = [] // { el, lines: [{ el, x, v }] }
  let io = null
  let ro = null
  let raf = 0
  let visible = 0
  let lastY = scrollY
  let lastT = 0
  let vel = 0 // px/s, đã làm mượt

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

  function paint(line) {
    const a = line.x
    const parts = []
    if (CONFIG.drag) parts.push(`translate3d(0, ${(Math.abs(a) * CONFIG.drag).toFixed(2)}px, 0)`)
    if (CONFIG.rotate) parts.push(`rotate(${(a * CONFIG.rotate).toFixed(3)}deg)`)
    if (CONFIG.skew) parts.push(`skewY(${(a * CONFIG.skew).toFixed(3)}deg)`)
    if (CONFIG.stretch) parts.push(`scaleY(${(1 + Math.abs(a) * CONFIG.stretch).toFixed(4)})`)
    line.el.style.transform = parts.join(' ')
  }

  function frame(t) {
    raf = 0
    const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60
    lastT = t
    // vận tốc cuộn: đọc vị trí thật mỗi khung (Lenis cuộn window thật)
    const y = scrollY
    const raw = (y - lastY) / dt
    lastY = y
    vel += (raw - vel) * Math.min(1, dt * 18)
    const target = CONFIG.enabled ? clamp((vel / 1000) * CONFIG.strength, -CONFIG.max, CONFIG.max) : 0

    let moving = Math.abs(vel) > 2
    for (const g of groups) {
      if (!g.on) continue
      g.lines.forEach((ln, i) => {
        const goal = i === 0 ? target : target + (g.lines[i - 1].x - target) * CONFIG.lineLag
        const acc = -CONFIG.stiffness * (ln.x - goal) - CONFIG.damping * ln.v
        ln.v += acc * dt
        ln.x += ln.v * dt
        if (Math.abs(ln.x) > 0.002 || Math.abs(ln.v) > 0.002) moving = true
        else {
          ln.x = 0
          ln.v = 0
        }
        paint(ln)
      })
    }
    // tắt (enabled=false): mục tiêu 0, dòng về thẳng rồi DỪNG — trước đây tắt lại chạy rAF mãi
    if (visible && moving) raf = requestAnimationFrame(frame)
    else lastT = 0
  }
  const kick = () => {
    if (!raf && visible) {
      lastY = scrollY
      raf = requestAnimationFrame(frame)
    }
  }

  // Mọi dòng xoay quanh CÙNG một điểm của cả cụm (mép trái / giữa / mép phải,
  // giữa chiều cao) -> lineLag = 0 thì cả cụm nghiêng như một khối cứng; có trễ
  // thì từng dòng lệch nhau quanh trục chung đó. offsetLeft/Top không tính
  // transform nên đo lúc đang nghiêng vẫn đúng.
  function setOrigin(g) {
    const W = g.el.offsetWidth
    const H = g.el.offsetHeight
    const px = { left: 0, center: W / 2, right: W }[CONFIG.origin] ?? 0
    const py = H / 2
    g.lines.forEach((ln) => {
      const x = px - (ln.el.offsetLeft - g.el.offsetLeft)
      const y = py - (ln.el.offsetTop - g.el.offsetTop)
      ln.el.style.transformOrigin = `${x.toFixed(1)}px ${y.toFixed(1)}px`
    })
  }

  function mount(root = document) {
    destroy()
    const els = [...(root.querySelectorAll ? root : document).querySelectorAll('[data-tilt]')]
    if (!els.length) return
    groups = els.map((el) => ({ el, on: false, lines: [...el.children].map((c) => ({ el: c, x: 0, v: 0 })) }))
    groups.forEach(setOrigin)
    ro = new ResizeObserver(() => groups.forEach(setOrigin))
    groups.forEach((g) => ro.observe(g.el))
    io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          const g = groups.find((x) => x.el === e.target)
          if (g) g.on = e.isIntersecting
        })
        visible = groups.filter((g) => g.on).length
        kick()
      },
      { rootMargin: '20% 0px' },
    )
    groups.forEach((g) => io.observe(g.el))
    addEventListener('scroll', kick, { passive: true })
  }

  function destroy() {
    io?.disconnect()
    io = null
    ro?.disconnect()
    ro = null
    removeEventListener('scroll', kick)
    cancelAnimationFrame(raf)
    raf = 0
    groups.forEach((g) => g.lines.forEach((ln) => ln.el.style.removeProperty('transform')))
    groups = []
    visible = 0
  }

  api.refresh = () => {
    groups.forEach(setOrigin)
    groups.forEach((g) => g.lines.forEach(paint))
    kick()
  }

  mount(document)
  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  }
})()
