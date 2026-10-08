/* =============================================================================
 * CHANDE — Chữ ký viết tay (font script Herr Von Muellerhoff) — "vẽ theo viền chữ"
 * -----------------------------------------------------------------------------
 * Font chỉ lưu ĐƯỜNG VIỀN chữ chứ không có đường bút, nên không có thứ tự nét
 * thật. Cách làm: lấy viền thật của từng chữ bằng opentype.js, rồi cho một nét
 * bút DÀY (cover × cỡ chữ) chạy dọc theo từng viền, viền nào xong mới tới viền sau
 * (trái -> phải theo thứ tự chữ), làm MASK cho phần tô đặc của chữ. Nét script
 * mảnh nên bút chạy dọc viền phủ kín luôn thân nét -> nhìn như đang được viết
 * tay. Tốc độ bút đều: độ trễ mỗi viền = tổng chiều dài các viền trước nó.
 *
 * Font + opentype.js nạp lúc cần (lần viết đầu), từ CDN; lỗi thì hiện chữ bằng
 * @font-face cùng font, không chạy hiệu ứng.
 *
 * API: window.CHANDE_SIGN = { config, defaults, write(box, text) -> Promise, clear(box) }
 *   box  : phần tử chứa (đặt cỡ / vị trí bằng CSS; SVG chữ ký vẽ vào trong)
 *   text : chữ ký (vd "HuyP")
 * ========================================================================== */
(() => {
  'use strict'

  const FONT_URL = 'https://cdn.jsdelivr.net/npm/@fontsource/herr-von-muellerhoff/files/herr-von-muellerhoff-latin-400-normal.woff'
  const LIB_URL = 'https://cdnjs.cloudflare.com/ajax/libs/opentype.js/1.3.4/opentype.min.js'

  const CONFIG = {
    enabled: true,
    duration: 1.4, // giây cho cả chữ ký (bút chạy đều theo chiều dài viền)
    cover: 0.14, // bề dày bút (theo cỡ chữ) — đủ phủ thân nét khi chạy dọc viền
    ease: 'cubic-bezier(.45,.05,.55,.95)', // nhịp bút của từng viền
    // Gọt mỏng nét (feMorphology erode, đơn vị = cỡ chữ 100). Font chỉ có một độ
    // đậm; nét script dày 1.25 (nét mảnh) … 6 (nét đậm) -> gọt > ~0.6 là nét mảnh đứt.
    thin: 0.18, // nét trung bình ~2.64 (bản 0.45: 2.1 -> +15% 0.3: 2.4 -> +10%)
  }
  window.CHANDE_SETTINGS_APPLY?.('sign', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  // @font-face dự phòng (khi không có JS / opentype lỗi thì vẫn ra đúng font)
  const style = document.createElement('style')
  style.textContent =
    `@font-face{font-family:'Herr Von Muellerhoff'; src:url(${FONT_URL}) format('woff'); font-display:swap}` +
    '.csign-svg{display:block; overflow:visible}'
  document.head.appendChild(style)

  let fontP = null
  function loadFont() {
    if (fontP) return fontP
    fontP = new Promise((res, rej) => {
      const go = () =>
        fetch(FONT_URL)
          .then((r) => r.arrayBuffer())
          .then((buf) => res(window.opentype.parse(buf)))
          .catch(rej)
      if (window.opentype) return go()
      const s = document.createElement('script')
      s.src = LIB_URL
      s.onload = go
      s.onerror = rej
      document.head.appendChild(s)
    })
    return fontP
  }

  const SIZE = 100 // cỡ chữ trong hệ toạ độ SVG; CSS co giãn theo bề cao box
  let uid = 0

  function fallback(box, text) {
    box.replaceChildren()
    const s = document.createElement('span')
    s.textContent = text
    s.style.cssText = "font-family:'Herr Von Muellerhoff',cursive; font-size:var(--sign-size,4rem); line-height:1; white-space:nowrap"
    box.append(s)
  }

  function clear(box) {
    box._signAnims?.forEach((a) => a.cancel())
    box._signAnims = []
    box.replaceChildren()
  }

  async function write(box, text, { instant = false } = {}) {
    if (!box) return
    const token = (box._signToken = (box._signToken || 0) + 1)
    clear(box)
    text = (text || '').trim()
    if (!text) return
    let font
    try {
      font = await loadFont()
    } catch {
      return fallback(box, text)
    }
    if (box._signToken !== token) return // đã có lượt viết mới
    const path = font.getPath(text, 0, 0, SIZE, { kerning: true, letterSpacing: -0.02 })
    const bb = path.getBoundingBox()
    const d = path.toPathData(2)
    const pad = SIZE * 0.1
    const vb = [bb.x1 - pad, bb.y1 - pad, bb.x2 - bb.x1 + pad * 2, bb.y2 - bb.y1 + pad * 2]
    const id = `csign${++uid}`
    const ns = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(ns, 'svg')
    svg.setAttribute('class', 'csign-svg')
    svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '))
    // bề cao box = cỡ chữ (CSS --sign-size); bề ngang theo tỉ lệ chữ
    svg.style.height = `calc(var(--sign-size, 4rem) * ${(vb[3] / SIZE).toFixed(4)})`
    svg.style.width = `calc(var(--sign-size, 4rem) * ${(vb[2] / SIZE).toFixed(4)})`
    svg.style.margin = `calc(var(--sign-size, 4rem) * ${(-pad / SIZE).toFixed(4)})`
    const mask = document.createElementNS(ns, 'mask')
    mask.id = id
    mask.setAttribute('maskUnits', 'userSpaceOnUse')
    mask.setAttribute('x', vb[0])
    mask.setAttribute('y', vb[1])
    mask.setAttribute('width', vb[2])
    mask.setAttribute('height', vb[3])
    // tách từng viền (mỗi "M" là một viền) để bút chạy lần lượt
    const contours = d.split(/(?=M)/).filter((s) => s.trim())
    const strokes = contours.map((c) => {
      const p = document.createElementNS(ns, 'path')
      p.setAttribute('d', c)
      p.setAttribute('fill', 'none')
      p.setAttribute('stroke', '#fff')
      p.setAttribute('stroke-width', (SIZE * CONFIG.cover).toFixed(2))
      p.setAttribute('stroke-linecap', 'round')
      p.setAttribute('stroke-linejoin', 'round')
      mask.append(p)
      return p
    })
    const defs = document.createElementNS(ns, 'defs')
    defs.append(mask)
    const fill = document.createElementNS(ns, 'path')
    fill.setAttribute('d', d)
    fill.setAttribute('fill', 'currentColor')
    fill.setAttribute('mask', `url(#${id})`)
    if (CONFIG.thin > 0) {
      const f = document.createElementNS(ns, 'filter')
      f.id = `${id}t`
      f.setAttribute('filterUnits', 'userSpaceOnUse') // vùng lọc = cả khung, không cắt đuôi chữ
      f.setAttribute('x', vb[0])
      f.setAttribute('y', vb[1])
      f.setAttribute('width', vb[2])
      f.setAttribute('height', vb[3])
      const m = document.createElementNS(ns, 'feMorphology')
      m.setAttribute('operator', 'erode')
      m.setAttribute('radius', CONFIG.thin)
      f.append(m)
      defs.append(f)
      fill.setAttribute('filter', `url(#${f.id})`)
    }
    svg.append(defs, fill)
    box.append(svg)

    const lens = strokes.map((p) => p.getTotalLength())
    const total = lens.reduce((a, b) => a + b, 0) || 1
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (instant || reduced || !CONFIG.enabled) {
      fill.removeAttribute('mask')
      return
    }
    const ms = Math.max(0.1, CONFIG.duration) * 1000
    let acc = 0
    const anims = strokes.map((p, i) => {
      const len = lens[i] + 1
      p.style.strokeDasharray = `${len} ${len}`
      p.style.strokeDashoffset = `${len}`
      const delay = (acc / total) * ms
      const dur = Math.max(30, (lens[i] / total) * ms)
      acc += lens[i]
      return p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
        delay,
        duration: dur,
        easing: CONFIG.ease,
        fill: 'both',
      })
    })
    box._signAnims = anims
    await Promise.all(anims.map((a) => a.finished)).catch(() => {})
    // xong: bỏ mask (đỡ tốn khi vẽ lại)
    if (box._signToken === token && fill.isConnected) fill.removeAttribute('mask')
  }

  window.CHANDE_SIGN = { config: CONFIG, defaults: DEFAULTS, write, clear, refresh() {} }
})()
