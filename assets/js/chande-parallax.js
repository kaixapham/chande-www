/* =============================================================================
 * CHANDE — Parallax ảnh khi cuộn
 * -----------------------------------------------------------------------------
 * Ảnh trong các section trôi lệch so với trang theo khoảng cách từ tâm ảnh tới
 * tâm màn: lệch = (tâm ảnh − tâm màn) × speed. speed > 0 = trôi chậm hơn trang
 * (lùi sâu), < 0 = nhanh hơn (nổi lên). Ảnh tự đặt hệ số riêng: data-parallax="0.2".
 *
 * Hai kiểu (mode):
 *   'inner' (mặc định) — KHUNG ảnh đứng yên, chỉ hình bên trong trôi: ảnh phóng
 *     `zoom` lần + dịch, rồi clip-path cắt về đúng khung cũ (tính ngược qua phép
 *     scale / translate). Bố cục khít (ảnh giáp dải màu, mảng xanh…) không hở.
 *     Lệch tối đa = phần dư do phóng: (zoom − 1) × cao / 2.
 *   'move' — cả ảnh trôi, kẹp ±max px.
 * Dùng các thuộc tính CSS `translate` / `scale` (độc lập với `transform`) nên
 * không đụng các xoay / lật sẵn có của ảnh. Chỉ tính ảnh đang gần màn (IntersectionObserver),
 * một rAF cho mỗi lần cuộn; lerp cho mượt thêm.
 *
 * Ảnh nằm trong khối ghim (position: sticky — ảnh nền phong cảnh) đứng yên trên
 * màn nên đo theo tâm ảnh thì không lệch gì: lấy tiến độ cuộn qua cả section thay
 * thế — vào section hình lệch +lim, ra khỏi section lệch −lim.
 * Cặp ảnh Agenda đổi bằng nút: khung tạm của hiệu ứng đổi ảnh chép theo
 * translate / scale / clip-path của ảnh (chande-home.js) nên không giật lúc đổi.
 *
 * Ảnh đè liền với ảnh nền như một ảnh (data-parallax-follow, ví dụ ảnh đè góc trái
 * ngày 1 Agenda) đi theo ảnh đứng ngay trước nó: cùng độ dịch, phóng quanh tâm
 * ảnh nền, cắt theo khung ảnh nền -> cả cụm trôi như một tấm, mép không lệch nhau.
 *
 * Bỏ qua ảnh đã có chuyển động riêng: hero (sticky + đổi ảnh), tem / hoá đơn của
 * phong cảnh, chồng poster.
 *
 * API: window.CHANDE_PARALLAX = { config, defaults, refresh(), mount(root) }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    mode: 'inner', // 'inner' = hình trôi trong khung đứng yên · 'move' = cả ảnh trôi
    speed: 0.12, // độ lệch theo khoảng cách tới tâm màn (0 = tắt)
    zoom: 1.15, // inner: phóng ảnh để có chỗ trôi
    max: 80, // px — move: lệch tối đa
    smooth: 0.18, // 0..1 — độ bám (1 = tức thì)
    selector:
      '.hs-intro img, .hs-story img, .hs-land__bg, .hs-about img, .hs-agenda img, .hs-wall img, .hs-quote img, .hs-foot img, [data-parallax]',
    // ảnh có chuyển động / clip-path riêng, icon nhỏ (chấm, mũi tên, tem), và cả cụm vòng
    // tròn About (vòng, vạch .tex, lõi là hình vector xếp khít — trôi lệch là lệch tâm)
    exclude:
      '.hero *, .hs-land *:not(.hs-land__bg), .hs-poster *, .agenda__dates *, .cl *, [data-name-photo] *, ' +
      '.cta *, .pill *, .hs-quote__nav *, .hs-quote__strip, .agenda__nav *, .agenda__stamp, .hs-story__media *, .circle *, img[src$=".svg"]',
  }
  window.CHANDE_SETTINGS_APPLY?.('parallax', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {}, mount() {} }
  window.CHANDE_PARALLAX = api
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let items = [] // { el, k, cur, on, pin, followers }

  // Ảnh đi theo: áp đúng phép phóng / dịch của ảnh nền (tâm phóng = tâm ảnh nền,
  // quy về toạ độ riêng của ảnh đi theo) rồi cắt về khung ảnh nền.
  function paintFollower(f, lead, d, z) {
    if (!d && z === 1) {
      f.style.translate = f.style.scale = f.style.clipPath = f.style.transformOrigin = ''
      return
    }
    const W = lead.offsetWidth
    const H = lead.offsetHeight
    const fw = f.offsetWidth
    const fh = f.offsetHeight
    const lx = lead.offsetLeft - f.offsetLeft
    const ly = lead.offsetTop - f.offsetTop
    const ox = lx + W / 2
    const oy = ly + H / 2
    // điểm Y (toạ độ chưa biến đổi) -> toạ độ riêng: Y' = o + (Y − dịch − o) / z
    const inv = (Y, o, dd) => o + (Y - dd - o) / z
    const top = Math.max(0, inv(ly, oy, d))
    const bot = Math.max(0, fh - inv(ly + H, oy, d))
    const left = Math.max(0, inv(lx, ox, 0))
    const right = Math.max(0, fw - inv(lx + W, ox, 0))
    f.style.transformOrigin = `${ox.toFixed(2)}px ${oy.toFixed(2)}px`
    f.style.translate = `0 ${d.toFixed(2)}px`
    f.style.scale = z === 1 ? '' : String(z)
    f.style.clipPath = z === 1 ? '' : `inset(${top.toFixed(2)}px ${right.toFixed(2)}px ${bot.toFixed(2)}px ${left.toFixed(2)}px)`
  }
  let io = null
  let raf = 0
  let last = 0

  function frame(t) {
    raf = 0
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 1 / 60
    last = t
    const ease = 1 - Math.pow(1 - Math.min(Math.max(CONFIG.smooth, 0.01), 1), dt * 60)
    const mid = innerHeight / 2
    let moving = false
    for (const it of items) {
      if (!it.on) continue
      const inner = CONFIG.mode !== 'move'
      const H = it.el.offsetHeight
      const W = it.el.offsetWidth
      const z = inner ? Math.max(1, CONFIG.zoom) : 1
      let goal = 0
      if (CONFIG.enabled) {
        const lim = inner ? ((z - 1) * H) / 2 : CONFIG.max
        if (it.pin) {
          // ghim: tiến độ cuộn qua section, 0 = section vừa ló đáy màn, 1 = vừa khuất đỉnh
          const r = it.pin.getBoundingClientRect()
          const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (r.height + innerHeight)))
          goal = Math.max(-lim, Math.min(lim, (0.5 - p) * 2 * lim * (CONFIG.speed / 0.12) * it.k))
        } else {
          const r = it.el.getBoundingClientRect()
          // bù phần lệch đang áp để đo vị trí "gốc" của ảnh (move: cả khung trôi)
          const c = r.top + r.height / 2 - (inner ? 0 : it.cur)
          goal = Math.max(-lim, Math.min(lim, (c - mid) * CONFIG.speed * it.k))
        }
      }
      it.cur += (goal - it.cur) * ease
      if (Math.abs(goal - it.cur) < 0.05) it.cur = goal
      else moving = true
      const d = it.cur
      it.followers.forEach((f) => paintFollower(f, it.el, CONFIG.enabled ? d : 0, CONFIG.enabled ? z : 1))
      if (!CONFIG.enabled || (!d && z === 1)) {
        it.el.style.translate = it.el.style.scale = it.el.style.clipPath = ''
        continue
      }
      it.el.style.translate = `0 ${d.toFixed(2)}px`
      if (inner) {
        // khung cũ [0, H] trên trang, quy về toạ độ riêng của ảnh (trước scale z
        // quanh tâm và dịch d): y_riêng = H/2 + (y − d − H/2) / z
        const top = H / 2 - (H / 2 + d) / z
        const bot = H / 2 + (H / 2 - d) / z
        const side = W / 2 - W / (2 * z)
        it.el.style.scale = String(z)
        it.el.style.clipPath = `inset(${top.toFixed(2)}px ${side.toFixed(2)}px ${(H - bot).toFixed(2)}px ${side.toFixed(2)}px)`
      } else {
        it.el.style.scale = ''
        it.el.style.clipPath = ''
      }
    }
    if (moving) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  // Khối ghim gần nhất bao ảnh -> trả về section chứa nó (để đo tiến độ cuộn).
  function pinOf(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).position === 'sticky') return p.parentElement
    }
    return null
  }
  const repin = () => {
    items.forEach((it) => (it.pin = pinOf(it.el)))
    kick()
  }

  function mount(root = document) {
    destroy()
    const scope = root.querySelectorAll ? root : document
    const follow = [...scope.querySelectorAll('[data-parallax-follow]')]
    items = [...scope.querySelectorAll(CONFIG.selector)]
      .filter((el) => !el.matches(CONFIG.exclude) && !el.hasAttribute('data-parallax-follow'))
      .map((el) => ({
        el,
        k: el.dataset.parallax ? +el.dataset.parallax / CONFIG.speed || 1 : 1,
        cur: 0,
        on: false,
        pin: pinOf(el),
        followers: follow.filter((f) => f.previousElementSibling === el),
      }))
    io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          const it = items.find((x) => x.el === e.target)
          if (it) it.on = e.isIntersecting
        })
        kick()
      },
      { rootMargin: '25% 0px' },
    )
    items.forEach((it) => io.observe(it.el))
    addEventListener('scroll', kick, { passive: true })
    addEventListener('resize', repin, { passive: true })
    // phong cảnh chỉ ghim khi đã bật is-staged (JS trang chủ bật sau) -> đo lại
    setTimeout(repin, 300)
  }

  function destroy() {
    io?.disconnect()
    io = null
    removeEventListener('scroll', kick)
    removeEventListener('resize', repin)
    items.forEach((it) => {
      it.el.style.translate = it.el.style.scale = it.el.style.clipPath = ''
      it.followers.forEach((f) => (f.style.translate = f.style.scale = f.style.clipPath = f.style.transformOrigin = ''))
    })
    items = []
  }

  api.mount = mount
  api.refresh = () => {
    mount(document)
    kick()
  }

  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
