/* =============================================================================
 * CHANDE — Title Effect: chữ tô màu dần theo cuộn (kiểu unitedcarriers.com)
 * -----------------------------------------------------------------------------
 * Tiêu đề tách thành từng TỪ, gom theo DÒNG HIỂN THỊ (đo offset sau khi xuống
 * dòng thật). Mỗi dòng có tiến độ riêng theo vị trí của nó trên màn: dòng chạm
 * mốc `start` (phần màn từ trên xuống) thì bắt đầu, tới mốc `end` thì tô xong
 * -> dòng dưới tự trễ hơn dòng trên khi cuộn.
 *
 * Tô bằng gradient cắt theo chữ (background-clip: text), toạ độ tính theo cả dòng
 * nên các từ nối liền một vệt:  [màu chữ] —band— [màu chuyển] —band— [màu nền chữ]
 * Mép quét là một dải màu chuyển, phía trước là chữ mờ (màu nền chữ + độ đậm).
 *
 * dither: hai đoạn chuyển không mịn mà thành ô pixel (ma trận Bayer 8×8, mỗi ô
 * `ditherSize` px): màu trước thưa dần trên nền màu sau. Mỗi đoạn là một ảnh
 * dốc (canvas → data URL, cache theo số cột + màu) phủ lên nền màu đặc, lặp dọc.
 *
 * Chỉ tính khi tiêu đề đang gần màn; mỗi khung chỉ ghi background của các từ.
 * Giảm chuyển động / tắt -> chữ về màu gốc.
 *
 * API: window.CHANDE_TITLEFX = { config, defaults, refresh(), mount(root) }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    selector: '.hs-about__statement', // tiêu đề áp hiệu ứng (nhiều cái: cách nhau dấu phẩy)
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
  // background-clip:text chỉ tô trong hộp của từ, mà nét chữ Phudu tràn khỏi hộp
  // (dòng đặt rất sát; đỉnh A, mép phải P) -> nới hộp bằng padding, margin âm bù
  // lại nên chữ không xê dịch. Toạ độ gradient đo theo hộp đã nới nên vẫn khớp.
  style.textContent =
    '.tfx-w{display:inline !important; padding:.25em .15em; margin:0 -.15em}' +
    '.tfx-on .tfx-w{color:transparent; -webkit-background-clip:text; background-clip:text; background-repeat:no-repeat; image-rendering:pixelated}'
  document.head.appendChild(style)

  let titles = [] // { el, words: [{ el, line, x }], lines: [{ top, left, width, p }], on }
  let io = null
  let ro = null
  let raf = 0
  let last = 0

  const clamp01 = (v) => Math.min(1, Math.max(0, v))
  const rgba = (hex, a) => {
    const h = String(hex || '#000').replace('#', '')
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h.slice(0, 6), 16) || 0
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${clamp01(+a)})`
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

  // Gom từ theo dòng hiển thị: cùng top (sai số nửa dòng) là một dòng.
  function measure(t) {
    const base = t.el.getBoundingClientRect()
    const lines = []
    t.words.forEach((w) => {
      const r = w.el.getBoundingClientRect()
      const top = r.top - base.top
      let ln = lines.find((l) => Math.abs(l.top - top) < r.height / 4)
      if (!ln) {
        ln = { top, h: r.height, left: Infinity, right: -Infinity, p: t.lines?.[lines.length]?.p ?? 0 }
        lines.push(ln)
      }
      ln.left = Math.min(ln.left, r.left - base.left)
      ln.right = Math.max(ln.right, r.right - base.left)
      w.line = ln
      w.x = r.left - base.left
      w.w = r.width
      w.key = '' // đo lại -> vẽ lại
    })
    lines.forEach((l) => (l.width = Math.max(1, l.right - l.left)))
    t.lines = lines
  }

  function paint(t) {
    const fin = CONFIG.color
    const acc = CONFIG.accent
    const bas = rgba(CONFIG.base, CONFIG.baseAlpha)
    const dz = Math.max(1, Math.round(CONFIG.ditherSize))
    // Chỉ GHI LẠI nền của từ khi cần: từ đã tô xong / chưa tới lượt là màu đặc, chỉ
    // ghi một lần lúc đổi trạng thái; chỉ từ nằm dưới mép quét mới vẽ lại mỗi khung.
    // (ghi lại background-clip:text của cả đoạn chữ to mỗi khung là thứ làm giật cuộn)
    const solid = (w, key, c) => {
      if (w.key === key) return
      w.key = key
      const s = w.el.style
      s.backgroundImage = `linear-gradient(${c}, ${c})`
      s.backgroundSize = s.backgroundPosition = s.backgroundRepeat = ''
    }
    t.words.forEach((w) => {
      const l = w.line
      const s = w.el.style
      {
        const dzb = CONFIG.dither ? Math.max(1, Math.round((CONFIG.band * l.width) / dz)) * dz : Math.max(1, CONFIG.band * l.width)
        const F = l.p * (l.width + 2 * dzb) - (w.x - l.left)
        if (F - 2 * dzb >= w.w) return solid(w, 'fin', fin) // mép quét đã qua hết từ
        if (F <= 0) return solid(w, 'base', bas) // mép quét chưa tới từ
        w.key = 'mid'
      }
      if (CONFIG.dither) {
        // band làm tròn theo ô để ảnh dốc khớp đúng đoạn chuyển
        const cols = Math.max(1, Math.round((CONFIG.band * l.width) / dz))
        const b = cols * dz
        const F = l.p * (l.width + 2 * b) - (w.x - l.left)
        const x1 = (F - 2 * b).toFixed(1)
        const x2 = (F - b).toFixed(1)
        // dưới cùng: ba khối màu đặc; trên: hai ảnh dốc (màu chữ thưa dần trên màu
        // chuyển, màu chuyển thưa dần trên màu chưa tô)
        s.backgroundImage = `${ramp(cols, fin)}, ${ramp(cols, acc)}, ` +
          `linear-gradient(90deg, ${fin} ${x1}px, ${acc} ${x1}px ${x2}px, ${bas} ${x2}px)`
        s.backgroundSize = `${b}px ${8 * dz}px, ${b}px ${8 * dz}px, 100% 100%`
        s.backgroundPosition = `${x1}px 0, ${x2}px 0, 0 0`
        s.backgroundRepeat = 'repeat-y, repeat-y, no-repeat'
      } else {
        const b = Math.max(1, CONFIG.band * l.width)
        // mép quét F (toạ độ dòng) chạy từ 0 tới hết dòng + 2 band
        const F = l.p * (l.width + 2 * b) - (w.x - l.left)
        s.backgroundImage =
          `linear-gradient(90deg, ${fin} ${(F - 2 * b).toFixed(1)}px, ${acc} ${(F - b).toFixed(1)}px, ${bas} ${F.toFixed(1)}px)`
        s.backgroundSize = s.backgroundPosition = s.backgroundRepeat = ''
      }
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
      titles.forEach(measure)
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
      titles.forEach(measure)
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
      t.el.classList.remove('tfx-on')
      t.words.forEach((w) => {
        const s = w.el.style
        s.backgroundImage = s.backgroundSize = s.backgroundPosition = s.backgroundRepeat = ''
      })
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
