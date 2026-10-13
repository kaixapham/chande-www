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
    style.textContent = `${SEL.map((x) => `html.film-on ${x}:not(.film-baked)`).join(', ')}{filter:${filterCSS()}}`
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
  // pxScale: số điểm ảnh canvas / 1 px CSS (để hạt cùng cỡ như bản lọc CSS).
  // iOS giới hạn tổng bộ nhớ canvas rất chặt -> KHÔNG tạo canvas tạm mỗi lần: dùng MỘT canvas nháp
  // chung, xong thì thu về 1×1 trả bộ nhớ. Không vẽ canvas lên chính nó ở chế độ 'copy' (Safari xoá
  // đích trước khi đọc nguồn -> ảnh trắng). Mọi chỗ gọi đều là ảnh kín. Lỗi gì thì giữ ảnh gốc.
  let scratch = null
  function bake(canvas, pxScale = 1) {
    if (!CONFIG.enabled || !canvas?.width) return canvas
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) return canvas
      const w = canvas.width
      const h = canvas.height
      if ('filter' in ctx) {
        scratch = scratch || document.createElement('canvas')
        scratch.width = w
        scratch.height = h
        const sx = scratch.getContext('2d')
        if (sx) {
          sx.drawImage(canvas, 0, 0)
          ctx.save()
          ctx.filter = colorCSS()
          ctx.drawImage(scratch, 0, 0)
          ctx.restore()
        }
        scratch.width = scratch.height = 1
      }
      grainOver(ctx, w, h, pxScale)
    } catch (e) {}
    return canvas
  }
  function grainOver(ctx, w, h, pxScale) {
    if (!(CONFIG.grain * k() > 0)) return
    const pat = ctx.createPattern(grainCanvas(), 'repeat')
    const sc = pxScale * Math.max(0.5, CONFIG.grainScale || 1)
    pat?.setTransform?.(new DOMMatrix().scale(sc, sc))
    ctx.save()
    ctx.globalCompositeOperation = 'overlay'
    ctx.fillStyle = pat
    ctx.fillRect(0, 0, w, h)
    ctx.restore()
  }

  // Màu film tính tay trên từng điểm ảnh — đúng công thức các hàm lọc CSS (Filter Effects: contrast,
  // saturate, brightness, sepia, hue-rotate theo thứ tự, kẹp 0…1 sau mỗi bước, hệ sRGB). Cho trình
  // duyệt chưa có ctx.filter (Safari < 18).
  function colorPixels(ctx, w, h) {
    const c = mix(CONFIG.contrast, 1)
    const s = mix(CONFIG.saturate, 1)
    const b = mix(CONFIG.brightness, 1)
    const q = 1 - Math.min(1, Math.max(0, mix(CONFIG.sepia, 0)))
    const a = (mix(CONFIG.hue, 0) * Math.PI) / 180
    const S = [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s, 0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s]
    const P = [0.393 + 0.607 * q, 0.769 - 0.769 * q, 0.189 - 0.189 * q, 0.349 - 0.349 * q, 0.686 + 0.314 * q, 0.168 - 0.168 * q, 0.272 - 0.272 * q, 0.534 - 0.534 * q, 0.131 + 0.869 * q]
    const co = Math.cos(a)
    const si = Math.sin(a)
    const H = [
      0.213 + co * 0.787 - si * 0.213, 0.715 - co * 0.715 - si * 0.715, 0.072 - co * 0.072 + si * 0.928,
      0.213 - co * 0.213 + si * 0.143, 0.715 + co * 0.285 + si * 0.14, 0.072 - co * 0.072 - si * 0.283,
      0.213 - co * 0.213 - si * 0.787, 0.715 - co * 0.715 + si * 0.715, 0.072 + co * 0.928 + si * 0.072,
    ]
    const cl = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)
    const im = ctx.getImageData(0, 0, w, h)
    const d = im.data
    for (let i = 0; i < d.length; i += 4) {
      let r = cl((d[i] / 255 - 0.5) * c + 0.5)
      let g = cl((d[i + 1] / 255 - 0.5) * c + 0.5)
      let l = cl((d[i + 2] / 255 - 0.5) * c + 0.5)
      let r2 = cl(S[0] * r + S[1] * g + S[2] * l)
      let g2 = cl(S[3] * r + S[4] * g + S[5] * l)
      let l2 = cl(S[6] * r + S[7] * g + S[8] * l)
      r = cl(r2 * b)
      g = cl(g2 * b)
      l = cl(l2 * b)
      r2 = cl(P[0] * r + P[1] * g + P[2] * l)
      g2 = cl(P[3] * r + P[4] * g + P[5] * l)
      l2 = cl(P[6] * r + P[7] * g + P[8] * l)
      d[i] = cl(H[0] * r2 + H[1] * g2 + H[2] * l2) * 255
      d[i + 1] = cl(H[3] * r2 + H[4] * g2 + H[5] * l2) * 255
      d[i + 2] = cl(H[6] * r2 + H[7] * g2 + H[8] * l2) * 255
    }
    ctx.putImageData(im, 0, 0)
  }

  // Safari / iPhone-iPad (WebKit): lọc CSS trên ảnh đang chạy / dính (dải hành trình chạy ngang, ảnh sự
  // kiện sticky + clip-path) bị lọc lại MỖI KHUNG — section Events trang About còn ~8 khung/giây (đo trên
  // Safari: 44 khung có lọc, 101 không lọc). -> nướng màu + hạt vào ảnh MỘT lần lúc rảnh: srcset = bản
  // đã nướng (src giữ nguyên cho các script so đường dẫn / CMS), ảnh đó gỡ lọc (.film-baked). Trông y hệt.
  const WEBKIT = /^((?!chrome|chromium|android|edg).)*safari/i.test(navigator.userAgent) || /iP(hone|ad|od)/.test(navigator.userAgent)
  const BAKE_SEL = '.ab-journey__track img, .ab-events__img img'
  const baked = new Map() // src -> objectURL ('' = đang làm / hỏng)
  let bakeCv = null
  async function bakeImage(img) {
    const W0 = img.naturalWidth
    const H0 = img.naturalHeight
    // phần ảnh đang hiện (object-fit: cover) rộng bao nhiêu px CSS -> chỉ nướng đúng cỡ đó × mật độ màn
    // (dải hành trình hiện ~175 px: nhẹ hơn ~10 lần so với ảnh gốc — iPhone tính điểm ảnh chậm)
    const r = img.getBoundingClientRect()
    const shownW = Math.max(r.width, (r.height * W0) / H0)
    const f = Math.min(1, 1100 / Math.max(W0, H0), shownW ? (shownW * Math.min(devicePixelRatio || 1, 2)) / W0 : 1)
    const w = Math.max(1, Math.round(W0 * f))
    const h = Math.max(1, Math.round(H0 * f))
    bakeCv ||= document.createElement('canvas')
    bakeCv.width = w
    bakeCv.height = h
    const ctx = bakeCv.getContext('2d', { willReadFrequently: true })
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    colorPixels(ctx, w, h)
    // hạt cùng cỡ như bản lọc CSS: tính theo px CSS của phần ảnh đang hiện
    grainOver(ctx, w, h, w / (shownW || w))
    const blob = await new Promise((res) => bakeCv.toBlob(res, 'image/jpeg', 0.92))
    bakeCv.width = bakeCv.height = 1 // iOS: nhả bộ nhớ canvas
    if (!blob) return ''
    const url = URL.createObjectURL(blob)
    bakedW.set(url, w)
    return url
  }
  const bakedW = new Map() // objectURL -> bề rộng đã nướng (px ảnh)
  // cửa sổ to ra nhiều -> ảnh nướng theo cỡ cũ bị mờ: nướng lại những ảnh thiếu điểm ảnh
  let rzT = 0
  if (WEBKIT)
    addEventListener('resize', () => {
      clearTimeout(rzT)
      rzT = setTimeout(() => {
        let again = false
        document.querySelectorAll(BAKE_SEL).forEach((im) => {
          const url = im.dataset.filmUrl
          if (!url || !im.naturalWidth) return
          const r = im.getBoundingClientRect()
          const need = Math.max(r.width, (r.height * im.naturalWidth) / im.naturalHeight) * Math.min(devicePixelRatio || 1, 2)
          if (need <= (bakedW.get(url) || 0) * 1.25) return
          baked.delete(im.getAttribute('src'))
          again = true
        })
        if (again) bakeAll()
      }, 600)
    })
  function useBaked(img, url) {
    if (img.dataset.filmUrl === url) return
    img.dataset.filmUrl = url
    img.addEventListener('load', () => img.dataset.filmUrl === url && img.classList.add('film-baked'), { once: true })
    img.srcset = url
  }
  let bakeBusy = false
  function bakeAll() {
    if (!WEBKIT || !CONFIG.enabled || bakeBusy) return
    const imgs = [...document.querySelectorAll(BAKE_SEL)]
    imgs.forEach((im) => baked.get(im.getAttribute('src')) && useBaked(im, baked.get(im.getAttribute('src'))))
    const todo = [...new Set(imgs.map((im) => im.getAttribute('src')))].filter((x) => x && !baked.has(x))
    if (!todo.length) return
    bakeBusy = true
    const step = async () => {
      const src = todo.shift()
      if (!src) {
        bakeBusy = false
        return bakeAll() // bản sao mới (dải chạy nhân ảnh) / ảnh vừa đổi
      }
      baked.set(src, '')
      const all = [...document.querySelectorAll(BAKE_SEL)].filter((im) => im.getAttribute('src') === src)
      const img = all[0]
      try {
        if (img && !img.naturalWidth) {
          img.loading = 'eager'
          await img.decode().catch(() => {})
        }
        if (img?.naturalWidth) {
          const url = await bakeImage(img)
          if (url) {
            baked.set(src, url)
            all.forEach((im) => useBaked(im, url))
          }
        }
      } catch (e) {}
      setTimeout(step, 60) // mỗi lượt một ảnh, nhả luồng chính giữa các ảnh
    }
    step()
  }
  // CMS / script đổi src: bỏ bản nướng cũ của ảnh đó, nướng lại
  if (WEBKIT && typeof MutationObserver !== 'undefined')
    new MutationObserver((ms) => {
      let again = false
      for (const m of ms) {
        const im = m.target
        if (!(im instanceof HTMLImageElement) || !im.dataset.filmUrl) continue
        im.removeAttribute('srcset')
        im.classList.remove('film-baked')
        delete im.dataset.filmUrl
        again = true
      }
      if (again) setTimeout(bakeAll, 200)
    }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['src'] })
  if (WEBKIT) {
    const later = () => setTimeout(bakeAll, 1200)
    if (document.readyState === 'complete') later()
    else addEventListener('load', later, { once: true })
    document.addEventListener('chande-transition:done', () => setTimeout(bakeAll, 400))
  }

  window.CHANDE_FILM = { config: CONFIG, defaults: DEFAULTS, apply, filterCSS, bake }
  if (document.body) apply()
  else addEventListener('DOMContentLoaded', apply, { once: true })
})()
