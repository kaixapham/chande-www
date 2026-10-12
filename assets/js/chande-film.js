/* =============================================================================
 * CHANDE — Lớp màu phim Fuji + hạt nhẹ cho ảnh người ở hero trang chủ
 * -----------------------------------------------------------------------------
 * Không đụng tới ảnh gốc (nhiều script so đường dẫn ảnh) — chỉ phủ bộ lọc:
 *   • màu: chuỗi CSS filter (tương phản · bão hoà · sáng · ấm · xoay sắc) — chạy bằng
 *     GPU, gần như không tốn;
 *   • hạt: bộ lọc SVG #film-grain — một ô hạt 128 px (canvas -> data URL) lát kín ảnh,
 *     hoà kiểu overlay, chỉ trên phần ảnh có màu (ảnh tách nền giữ trong suốt). Bộ lọc
 *     chỉ tính khi ảnh được VẼ, cuộn / parallax (transform) không vẽ lại.
 * Chỉ áp cho 4 ô ảnh người ở hero trang chủ (canvas chân dung + ảnh dự phòng), dải ảnh hành trình
 * + ảnh sự kiện (Events) ở About và lớp vỡ ô (chande-imgtiles.js) lúc đang rê các ảnh đó.
 * Bật / tắt + chỉnh số ở trang film.html (lưu vào chande-settings.js, khoá "film.*").
 *
 * API: window.CHANDE_FILM = { config, defaults, apply(), filterCSS() }
 * ========================================================================== */
;(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    strength: 1, // cường độ tổng 0…1: kéo mọi thông số về ảnh gốc theo tỉ lệ
    contrast: 1.06, // tương phản
    saturate: 0.9, // bão hoà (Fuji: màu dịu)
    brightness: 1.02,
    sepia: 0.12, // ngả ấm
    hue: -8, // độ — xoay sắc về xanh lục / lam (đặc trưng Fuji)
    grain: 0.1, // độ đậm hạt (0 = tắt hạt)
    grainScale: 1, // cỡ hạt (1 = 1 điểm ảnh)
  }
  window.CHANDE_SETTINGS_APPLY?.('film', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  // Bộ lọc CSS chỉ còn cho ẢNH TĨNH (ảnh dự phòng hero + dải ảnh hành trình About). Canvas chân
  // dung hero và lớp vỡ ô thì "nướng" màu + hạt thẳng vào điểm ảnh lúc vẽ (bake() bên dưới): để
  // bộ lọc CSS / SVG trên canvas đang chuyển động thì trình duyệt lọc lại cả 4 ô MỖI KHUNG lúc đổi
  // ảnh -> tụt còn 20–30 khung/giây.
  const SEL = ['.hero-card__media img', '.ab-journey__track img', '.ab-events__img img']

  // ô hạt xám ngẫu nhiên 128 × 128, alpha = độ đậm (overlay: xám giữa = không đổi)
  let tileKey = ''
  let tileURL = ''
  function grainTile() {
    const gr = CONFIG.grain * k()
    const key = `${gr}`
    if (key === tileKey) return tileURL
    const N = 128
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(N, N)
    const a = Math.round(Math.min(1, Math.max(0, gr)) * 255)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = a
    }
    ctx.putImageData(img, 0, 0)
    tileKey = key
    tileURL = c.toDataURL('image/png')
    return tileURL
  }

  function ensureSVG() {
    let svg = document.getElementById('film-svg')
    if (!svg) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.id = 'film-svg'
      svg.setAttribute('aria-hidden', 'true')
      svg.setAttribute('width', '0')
      svg.setAttribute('height', '0')
      svg.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden'
      document.body.append(svg)
    }
    const s = 128 * Math.max(0.5, CONFIG.grainScale || 1)
    svg.innerHTML = `<filter id="film-grain" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse">
      <feImage href="${grainTile()}" x="0" y="0" width="${s}" height="${s}" preserveAspectRatio="none" result="t"/>
      <feTile in="t" result="g"/>
      <feBlend in="SourceGraphic" in2="g" mode="overlay" result="b"/>
      <feComposite in="b" in2="SourceGraphic" operator="in"/>
    </filter>`
  }

  // cường độ tổng: mỗi thông số = gốc + (giá trị − gốc) × strength (gốc: 1 / 0 = không đổi ảnh)
  const k = () => Math.min(1, Math.max(0, CONFIG.strength ?? 1))
  const mix = (v, base) => +(base + (v - base) * k()).toFixed(3)
  function filterCSS(c = CONFIG) {
    const f = `contrast(${mix(c.contrast, 1)}) saturate(${mix(c.saturate, 1)}) brightness(${mix(c.brightness, 1)}) sepia(${mix(c.sepia, 0)}) hue-rotate(${mix(c.hue, 0)}deg)`
    return c.grain * k() > 0 ? `${f} url(#film-grain)` : f
  }

  const style = document.createElement('style')
  document.head.append(style)
  function apply() {
    document.documentElement.classList.toggle('film-on', !!CONFIG.enabled)
    if (CONFIG.enabled && CONFIG.grain * k() > 0) ensureSVG()
    style.textContent = `${SEL.map((x) => `html.film-on ${x}`).join(', ')}{filter:${filterCSS()}}`
  }

  // Nướng film vào nội dung canvas (một lần, lúc vẽ): màu = ctx.filter (cùng chuỗi CSS), hạt = ô
  // hạt lát kín hoà overlay, chỉ trên phần có điểm ảnh (giữ vùng trong suốt).
  const colorCSS = (c = CONFIG) =>
    `contrast(${mix(c.contrast, 1)}) saturate(${mix(c.saturate, 1)}) brightness(${mix(c.brightness, 1)}) sepia(${mix(c.sepia, 0)}) hue-rotate(${mix(c.hue, 0)}deg)`
  let grainCv = null
  let grainCvKey = ''
  function grainCanvas() {
    const gr = Math.min(1, Math.max(0, CONFIG.grain * k()))
    const key = `${gr}`
    if (grainCv && key === grainCvKey) return grainCv
    const N = 128
    grainCv = document.createElement('canvas')
    grainCv.width = grainCv.height = N
    const g = grainCv.getContext('2d')
    const img = g.createImageData(N, N)
    const a = Math.round(gr * 255)
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v
      img.data[i + 3] = a
    }
    g.putImageData(img, 0, 0)
    grainCvKey = key
    return grainCv
  }
  // pxScale: số điểm ảnh canvas / 1 px CSS (để hạt cùng cỡ như bản lọc CSS)
  function bake(canvas, pxScale = 1) {
    if (!CONFIG.enabled || !canvas?.width) return canvas
    const w = canvas.width
    const h = canvas.height
    const ctx = canvas.getContext('2d')
    const copy = document.createElement('canvas')
    copy.width = w
    copy.height = h
    const cx = copy.getContext('2d')
    if ('filter' in cx) cx.filter = colorCSS()
    cx.drawImage(canvas, 0, 0)
    cx.filter = 'none'
    if (CONFIG.grain * k() > 0) {
      // lớp hạt cắt theo hình (destination-in) rồi hoà overlay lên
      const gl = document.createElement('canvas')
      gl.width = w
      gl.height = h
      const gx = gl.getContext('2d')
      const pat = gx.createPattern(grainCanvas(), 'repeat')
      const sc = pxScale * Math.max(0.5, CONFIG.grainScale || 1)
      pat.setTransform?.(new DOMMatrix().scale(sc, sc))
      gx.fillStyle = pat
      gx.fillRect(0, 0, w, h)
      gx.globalCompositeOperation = 'destination-in'
      gx.drawImage(copy, 0, 0)
      cx.globalCompositeOperation = 'overlay'
      cx.drawImage(gl, 0, 0)
      cx.globalCompositeOperation = 'source-over'
    }
    ctx.clearRect(0, 0, w, h)
    ctx.drawImage(copy, 0, 0)
    return canvas
  }

  window.CHANDE_FILM = { config: CONFIG, defaults: DEFAULTS, apply, filterCSS, bake }
  if (document.body) apply()
  else addEventListener('DOMContentLoaded', apply, { once: true })
})()
