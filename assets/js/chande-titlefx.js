/* =============================================================================
 * CHANDE — Title Effect: chữ tô màu dần theo cuộn (kiểu unitedcarriers.com)
 * -----------------------------------------------------------------------------
 * Tiêu đề tách thành từng TỪ, gom theo DÒNG HIỂN THỊ (đo offset sau khi xuống
 * dòng thật). Mỗi dòng có tiến độ riêng theo vị trí của nó trên màn: dòng chạm
 * mốc `start` (phần màn từ trên xuống) thì bắt đầu, tới mốc `end` thì tô xong
 * -> dòng dưới tự trễ hơn dòng trên khi cuộn.
 *
 * Tô bằng LỚP MÀU HOÀ TRỘN (mix-blend-mode: lighten) đặt trên từng dòng chữ, chữ
 * thật luôn đen và KHÔNG BAO GIỜ vẽ lại: lighten = max(nền, lớp) -> chỗ chữ đen hiện
 * đúng màu lớp, chỗ nền kem giữ nguyên (mọi màu tô phải tối hơn nền — kem 244,243,235
 * sáng hơn đen / lime #68f12b / xám 12%). Mỗi dòng: lớp màu chưa tô + khối màu đã tô +
 * khối dải chuyển, cuộn chỉ TRƯỢT hai khối bằng transform (compositor) — trước đây
 * ghi lại background-clip:text của từng từ mỗi khung, Safari vẽ lại chữ to nên giật.
 *   [màu chữ] —band— [màu chuyển] —band— [màu nền chữ]
 * Vùng các dòng chia theo điểm giữa hai dòng kề nhau (dòng đặt rất sát, line-height .8)
 * nên phủ kín chữ, không chồng nhau.
 *
 * dither: hai đoạn chuyển không mịn mà thành ô pixel (ma trận Bayer 8×8, mỗi ô
 * `ditherSize` px): màu trước thưa dần trên nền màu sau. Mỗi đoạn là một ảnh
 * dốc (canvas → data URL, cache theo số cột + màu) phủ lên nền màu đặc, lặp dọc.
 *
 * Chỉ tính khi tiêu đề đang gần màn; mỗi khung chỉ ghi transform của hai khối / dòng.
 * Giảm chuyển động / tắt -> chữ về màu gốc.
 *
 * API: window.CHANDE_TITLEFX = { config, defaults, refresh(), mount(root) }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    selector: '.hs-about__statement', // (Agenda, danh sách vai trò đã bỏ — quá nặng) tiêu đề áp hiệu ứng (nhiều cái: cách nhau dấu phẩy)
    color: '#000000', // màu chữ sau khi tô xong
    accent: '#68f12b', // màu chuyển (dải ở mép quét)
    base: '#000000', // màu chữ lúc chưa tô
    baseAlpha: 0.12, // độ đậm chữ lúc chưa tô (0 = ẩn hẳn)
    band: 0.18, // bề rộng mỗi đoạn chuyển, theo bề rộng dòng
    start: 0.95, // dòng bắt đầu tô khi đỉnh dòng ở mốc này (0 = mép trên màn, 1 = mép dưới)
    end: 0.45, // tô xong khi đỉnh dòng tới mốc này
    smooth: 0.2, // 0..1 — độ bám (1 = tức thì)
    dither: true, // đoạn chuyển thành ô pixel thay vì gradient mịn
    ditherSize: 4, // px — cỡ một ô dither
  }
  window.CHANDE_SETTINGS_APPLY?.('titlefx', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {}, mount() {} }
  window.CHANDE_TITLEFX = api

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  const style = document.createElement('style')
  // .hs-about__statement span{display:block} sẽ biến từng từ thành khối -> ép inline.
  style.textContent =
    '.tfx-w{display:inline !important}' +
    '.tfx-on{color:#000 !important}' +
    // nền TỐI: chữ thật trắng, lớp màu hoà trộn darken = min(nền, lớp) -> chỗ chữ
    // trắng hiện đúng màu lớp, chỗ nền tối giữ nguyên (màu tô phải SÁNG hơn nền)
    '.tfx-on.tfx-dark{color:#fff !important}' +
    '.tfx-dark .tfx-ln{mix-blend-mode:darken}' +
    '.tfx-ln{position:absolute; overflow:hidden; mix-blend-mode:lighten; pointer-events:none}' +
    '.tfx-ln > i{position:absolute; left:0; top:0; height:100%; will-change:transform; image-rendering:pixelated}'
  document.head.appendChild(style)

  let titles = [] // { el, words: [{ el, line, x }], lines: [{ top, left, width, p }], on }
  let io = null
  let ro = null
  let raf = 0
  let last = 0

  const clamp01 = (v) => Math.min(1, Math.max(0, v))

  // màu nền thật phía sau tiêu đề (tổ tiên gần nhất có nền đặc)
  const backdrop = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const m = getComputedStyle(e).backgroundColor.match(/[\d.]+/g)
      if (m && (m[3] === undefined || +m[3] > 0.5)) return m.slice(0, 3).map(Number)
    }
    return [255, 255, 255]
  }
  const solidOver = (hex, a, bg) => {
    const h = String(hex || '#000').replace('#', '')
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16) || 0
    const k = clamp01(+a)
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v, i) => Math.round(v * k + bg[i] * (1 - k)))
    return `rgb(${c.join(',')})`
  }

  // Ảnh dốc dither: `cols` cột × 8 hàng (1px = 1 ô), ô có màu `color` khi ngưỡng
  // Bayer < 1 − t -> đặc ở trái, thưa dần sang phải.
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
  const ramps = new Map()
  function ramp(cols, color) {
    const key = `${cols}|${color}`
    let url = ramps.get(key)
    if (url) return url
    const c = document.createElement('canvas')
    c.width = cols
    c.height = 8
    const g = c.getContext('2d')
    g.fillStyle = color
    for (let x = 0; x < cols; x++) {
      const t = (x + 0.5) / cols
      for (let y = 0; y < 8; y++) if ((BAYER[y * 8 + (x % 8)] + 0.5) / 64 < 1 - t) g.fillRect(x, y, 1, 1)
    }
    url = `url(${c.toDataURL()})`
    if (ramps.size > 200) ramps.clear()
    ramps.set(key, url)
    return url
  }

  // Tách text thành từ (giữ khoảng trắng là text node thường) — chỉ làm một lần.
  function split(el) {
    if (el.dataset.tfxSplit) return [...el.querySelectorAll('.tfx-w')]
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes = []
    while (walker.nextNode()) if (walker.currentNode.nodeValue.trim()) nodes.push(walker.currentNode)
    nodes.forEach((t) => {
      const frag = document.createDocumentFragment()
      t.nodeValue.split(/(\s+)/).forEach((part) => {
        if (!part) return
        if (/^\s+$/.test(part)) frag.appendChild(document.createTextNode(part))
        else {
          const w = document.createElement('span')
          w.className = 'tfx-w'
          w.textContent = part
          frag.appendChild(w)
        }
      })
      t.replaceWith(frag)
    })
    el.dataset.tfxSplit = '1'
    return [...el.querySelectorAll('.tfx-w')]
  }

  // Gom từ theo dòng hiển thị: cùng top (sai số nửa dòng) là một dòng. Rồi dựng lớp
  // màu cho từng dòng (chỉ lúc đo — đổi cỡ màn / font / setting).
  function measure(t) {
    const base = t.el.getBoundingClientRect()
    const lines = []
    t.words.forEach((w) => {
      const r = w.el.getBoundingClientRect()
      const top = r.top - base.top
      let ln = lines.find((l) => Math.abs(l.top - top) < r.height / 4)
      if (!ln) {
        ln = { top, h: r.height, left: Infinity, right: -Infinity, p: t.lines?.[lines.length]?.p ?? 0, word: w.el }
        lines.push(ln)
      }
      ln.left = Math.min(ln.left, r.left - base.left)
      ln.right = Math.max(ln.right, r.right - base.left)
    })
    lines.forEach((l) => (l.width = Math.max(1, l.right - l.left)))
    t.lines = lines
    build(t)
  }

  const lum = (c) => (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255
  function build(t) {
    t.layers?.forEach((n) => n.remove())
    t.layers = []
    if (getComputedStyle(t.el).position === 'static') t.el.style.position = 'relative'
    const acc = CONFIG.accent
    const bg = backdrop(t.el)
    const dark = lum(bg) < 0.45
    // màu thật của từng dòng (đọc lúc tạm gỡ lớp ép màu): dòng có màu riêng tô xong thành đúng màu
    // đó; dòng cùng màu khối chữ -> CONFIG.color (nền sáng) / màu chữ sáng của chính nó (nền tối)
    t.el.classList.remove('tfx-on', 'tfx-dark')
    const own = getComputedStyle(t.el).color
    const lineCol = t.lines.map((l) => (l.word ? getComputedStyle(l.word).color : own))
    t.el.classList.add('tfx-on')
    t.el.classList.toggle('tfx-dark', dark)
    t.dark = dark
    // màu chưa tô phải ĐẶC (hoà trộn với màu trong suốt không đổi gì): trộn sẵn với nền
    const bas = dark ? solidOver('#ffffff', CONFIG.baseAlpha, bg) : solidOver(CONFIG.base, CONFIG.baseAlpha, bg)
    const dz = Math.max(1, Math.round(CONFIG.ditherSize))
    const pad = (parseFloat(getComputedStyle(t.el).fontSize) || 16) * 0.2 // nét chữ tràn khỏi hộp từ
    const L = t.lines
    const mid = (i) => L[i].top + L[i].h / 2
    // mọi lớp rộng bằng CẢ khối chữ: nét chữ dòng dài thòi xuống vùng của dòng ngắn kề
    // nó (chân Y, ngoặc) vẫn có lớp phủ
    const x0 = Math.min(...L.map((l) => l.left)) - pad
    const W = Math.max(...L.map((l) => l.right)) + pad - x0
    L.forEach((l, i) => {
      const fin = lineCol[i] !== own ? lineCol[i] : dark ? own : CONFIG.color
      // vùng dọc: từ giữa dòng trên tới giữa dòng dưới (dòng đầu / cuối nới thêm)
      const y0 = i ? (mid(i - 1) + mid(i)) / 2 : mid(i) - l.h * 0.65
      const y1 = i < L.length - 1 ? (mid(i) + mid(i + 1)) / 2 : mid(i) + l.h * 0.65
      const cols = Math.max(1, Math.round((CONFIG.band * l.width) / dz))
      const b = CONFIG.dither ? cols * dz : Math.max(1, CONFIG.band * l.width)
      const ln = document.createElement('i')
      ln.className = 'tfx-ln'
      ln.setAttribute('aria-hidden', 'true')
      Object.assign(ln.style, {
        left: `${x0}px`,
        top: `${y0}px`,
        width: `${W}px`,
        height: `${y1 - y0}px`,
        background: bas,
      })
      const done = document.createElement('i') // khối màu đã tô, mép phải nối vào dải chuyển
      done.style.width = `${W + 2 * pad}px`
      done.style.background = fin
      const band = document.createElement('i') // dải chuyển: [màu chữ → màu chuyển][màu chuyển → chưa tô]
      band.style.width = `${2 * b}px`
      if (CONFIG.dither) {
        band.style.backgroundImage = `${ramp(cols, fin)}, ${ramp(cols, acc)}, linear-gradient(90deg, ${acc} ${b}px, ${bas} ${b}px)`
        band.style.backgroundSize = `${b}px ${8 * dz}px, ${b}px ${8 * dz}px, 100% 100%`
        band.style.backgroundPosition = `0 0, ${b}px 0, 0 0`
        band.style.backgroundRepeat = 'repeat-y, repeat-y, no-repeat'
      } else band.style.background = `linear-gradient(90deg, ${fin}, ${acc} ${b}px, ${bas} ${2 * b}px)`
      ln.append(done, band)
      t.el.append(ln)
      t.layers.push(ln)
      // o: đầu dòng trong lớp, run: quãng mép quét chạy hết dòng (đi từ trước đầu dòng tới sau cuối dòng)
      Object.assign(l, { W, dw: W + 2 * pad, b, o: l.left - pad - x0, run: l.width + 2 * pad + 2 * b, done, band, key: '' })
    })
  }

  function paint(t) {
    const dpr = devicePixelRatio || 1
    t.lines.forEach((l) => {
      if (!l.band) return
      // mép trái dải chuyển: p = 0 -> dải nằm ngay trước đầu dòng, p = 1 -> ra sau cuối dòng;
      // chưa bắt đầu / xong hẳn thì đẩy hẳn ra ngoài lớp (phủ cả phần nét tràn của dòng kề)
      let x = l.o - 2 * l.b + l.p * l.run
      if (l.p <= 0) x = -2 * l.b - 1
      else if (l.p >= 1) x = l.W + 1
      x = Math.round(x * dpr) / dpr
      if (l.key === x) return
      l.key = x
      l.band.style.transform = `translate3d(${x}px,0,0)`
      l.done.style.transform = `translate3d(${x - l.dw}px,0,0)`
    })
  }

  // tiến độ đích của từng dòng theo vị trí hiện tại
  function goals(t) {
    const vh = innerHeight
    const a = CONFIG.start * vh
    const span = Math.max(1, (CONFIG.start - CONFIG.end) * vh)
    const top = t.el.getBoundingClientRect().top
    return t.lines.map((l) => clamp01((a - (top + l.top)) / span))
  }

  function frame(t0) {
    raf = 0
    const dt = last ? Math.min(0.1, (t0 - last) / 1000) : 1 / 60
    last = t0
    const ease = 1 - Math.pow(1 - Math.min(Math.max(CONFIG.smooth, 0.01), 1), dt * 60)
    let moving = false
    for (const t of titles) {
      if (!t.on) continue
      const g = goals(t)
      t.lines.forEach((l, i) => {
        const goal = g[i]
        l.p += (goal - l.p) * ease
        if (Math.abs(goal - l.p) < 0.001) l.p = goal
        else moving = true
      })
      paint(t)
    }
    if (moving) raf = requestAnimationFrame(frame)
    else last = 0
  }
  const kick = () => {
    if (!raf && titles.length) raf = requestAnimationFrame(frame)
  }

  function mount(root = document) {
    destroy()
    if (!CONFIG.enabled || reduced) return
    const scope = root.querySelectorAll ? root : document
    let els = []
    try {
      els = [...scope.querySelectorAll(CONFIG.selector)]
    } catch {}
    titles = els.map((el) => {
      const t = { el, words: split(el).map((w) => ({ el: w, line: null, x: 0 })), lines: [], on: false }
      el.classList.add('tfx-on')
      measure(t)
      // mở trang / dựng lại giữa chừng: vào thẳng trạng thái đúng, không quét lại từ đầu
      goals(t).forEach((g, i) => (t.lines[i].p = g))
      paint(t)
      return t
    })
    if (!titles.length) return
    ro = new ResizeObserver(() => {
      titles.forEach((t) => (measure(t), paint(t)))
      kick()
    })
    titles.forEach((t) => ro.observe(t.el))
    io = new IntersectionObserver(
      (es) => {
        es.forEach((e) => {
          const t = titles.find((x) => x.el === e.target)
          if (t) t.on = e.isIntersecting
        })
        kick()
      },
      { rootMargin: '20% 0px' },
    )
    titles.forEach((t) => io.observe(t.el))
    addEventListener('scroll', kick, { passive: true })
    document.fonts?.ready.then(() => {
      titles.forEach((t) => (measure(t), paint(t)))
      kick()
    })
  }

  function destroy() {
    io?.disconnect()
    io = null
    ro?.disconnect()
    ro = null
    removeEventListener('scroll', kick)
    cancelAnimationFrame(raf)
    raf = 0
    last = 0
    titles.forEach((t) => {
      t.el.classList.remove('tfx-on', 'tfx-dark')
      t.layers?.forEach((n) => n.remove())
    })
    titles = []
  }

  api.mount = mount
  // bảng setting đổi số: dựng lại (đổi selector / bật tắt) rồi vẽ ngay
  api.refresh = () => {
    mount(document)
    titles.forEach(paint)
    kick()
  }

  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
