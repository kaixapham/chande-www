/* =============================================================================
 * CHANDE — Page transition (rèm cột)
 * -----------------------------------------------------------------------------
 * Hai biến thể, chọn bằng `CONFIG.variant`:
 *
 *   'sweep' — 4 cột quét LIÊN TỤC từ trên xuống rồi trôi khỏi mép dưới màn:
 *               yPercent   0 -> nghỉ ngay trên mép màn (CSS top:-100%)
 *               yPercent 100 -> phủ kín màn
 *               yPercent 200 -> trôi hẳn xuống dưới
 *
 *   'split' — 4 cột thả từ trên + 4 cột đẩy từ dưới, GẶP NHAU ở đường `splitAt`;
 *             lúc rút thì tách ra hai phía, ai về chỗ nghỉ của người nấy:
 *               khối trên   0 -> nghỉ trên mép,  100 -> vào chỗ
 *               khối dưới   0 -> nghỉ dưới mép, -100 -> vào chỗ
 *
 * `fromTo` ở bước phủ luôn đặt lại mốc 0 nên không cần dọn dẹp giữa các lần.
 *
 * **Bề rộng cột lấy đúng bề rộng 4 ô của thanh loading**
 * (`CHANDE_LOADING.config.cellWidths`), nên mỗi cột thẳng hàng với một ô của
 * header. Rèm có z-index thấp hơn thanh loading -> chạy DƯỚI header, header
 * đứng yên suốt lúc chuyển trang.
 *
 * Stack: Barba (swap DOM) + GSAP/CustomEase (tween) + Lenis (smooth scroll).
 * Bản demo nhúng vendor tại `assets/vendor/`; lên production thay bằng đúng mấy
 * thẻ CDN cùng version — xem README.
 *
 * Markup cần có:
 *   <body data-barba="wrapper">
 *     <div data-transition-wrap></div>     <- rèm mount vào đây, NGOÀI container
 *     <main data-barba="container"> ... </main>
 *   </body>
 * Không có [data-transition-wrap] thì module tự tạo rồi gắn vào body.
 *
 * API: xem cuối file (window.CHANDE_TRANSITION).
 * Sự kiện trên document: 'chande-transition:cover', 'chande-transition:done'
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,

    // Biến thể đang dùng — bảng devtools đổi giá trị này khi bạn chuyển tab.
    variant: 'stack', // 'sweep' (rèm quét) | 'split' (rèm chẻ) | 'stack' (trượt thẻ)

    // ---- Dùng chung cho cả hai biến thể -------------------------------------
    // null = bám theo 4 ô của thanh loading. Đặt mảng % để tách rời.
    widths: null,
    fallbackWidths: [25.625, 24.375, 24.375, 25.625],
    ease: '0.625, 0.05, 0, 1', // CustomEase
    zIndex: 9997, // < 9998 của thanh loading -> rèm chạy DƯỚI header
    fontDir: 'assets/fonts/',

    // ---- Chữ trên cột --------------------------------------------------------
    // Số là px của bản thiết kế khổ 1920, quy ra em bằng cách chia 16 — giống
    // hệt thanh loading, nên chữ co giãn cùng thang với cả site.
    label: {
      fontSize: 24,
      padding: 24, // căn trái sát mép trái cột, cách mép 24
      lineHeight: 1,
      weight: 700, // Phudu Bold — có file riêng, không để trình duyệt giả bold
      color: '#dad0a7', // chữ kem, mặc định đặt trên các cột tối
    },

    // ---- Biến thể 1: rèm quét ------------------------------------------------
    sweep: {
      colors: ['#dad0a7', '#97a180', '#1c2725', '#144626'],
      // Chữ của từng cột — để rỗng thì cột đó không có chữ.
      labels: ['', '', '01', 'GALLERY'],
      labelAlign: 'center', // 'top' | 'center' | 'bottom'
      duration: 1.12, // s — mỗi chặng của rèm
      stagger: 0.06, // s giữa các cột
      leaveFrom: 'end', // 'start' | 'end' | 'center' | 'edges'
      revealFrom: 'start',
      enterAt: 1, // s — mốc tráo trang và bắt đầu rút rèm
      dither: {
        enabled: true, style: 'bayer16', size: 1, levels: 12,
        brightness: 1, contrast: 1, mono: false, monoColor: '#ffffff',
      },
    },

    // ---- Biến thể 2: rèm chẻ -------------------------------------------------
    split: {
      colors: ['#dad0a7', '#97a180', '#1c2725', '#144626'], // 4 cột trên
      colorsBottom: ['#144626', '#1c2725', '#97a180', '#dad0a7'], // 4 cột dưới
      labels: ['', '', '01', ''], // chữ 4 cột trên
      labelsBottom: ['', 'ABOUT', '', ''], // chữ 4 cột dưới
      // Chữ bám vào đường gặp: khối trên căn đáy, khối dưới căn đỉnh, nên hai
      // dòng nằm sát nhau hai bên đường chẻ.
      labelAlign: 'bottom',
      labelAlignBottom: 'top',
      splitAt: 30, // % — đường hai bên gặp nhau
      duration: 1.6,
      stagger: 0.3,
      leaveFrom: 'center',
      revealFrom: 'edges',
      enterAt: 2.5,
      dither: {
        enabled: true, style: 'bayer16', size: 1, levels: 15,
        brightness: 1, contrast: 1, mono: false, monoColor: '#ffffff',
      },
    },

    // ---- Biến thể 3: trượt thẻ -----------------------------------------------
    // Trang cũ được bọc lại, co nhỏ + bo góc rồi trượt xuống khỏi màn; tấm màu
    // ở giữa theo sau; trang mới phóng từ nhỏ lên đúng chỗ. Ba lớp xếp chồng:
    //   wrapper (trang cũ) z3  >  tấm giữa z2  >  trang mới z1
    stack: {
      color: '#ef6322', // màu tấm giữa
      // Nền lộ ra phía sau lúc ba lớp co nhỏ lại. Mặc định trùng nền trang nên
      // không đổi gì so với trước; chỉnh để lấy màu khác hẳn lúc chuyển trang.
      bg: '#f4f3eb',
      radius: 1, // em — bo góc lúc ba lớp co lại
      // chữ trên tấm giữa (góc trên trái) — luôn được thay bằng TÊN trang sắp tới; để rỗng
      // thì không có chữ. Góc trên phải: số thứ tự trang (001 / 002 / 003).
      label: 'PAGE',
      labelAlign: 'top',
      order: true,
      zIndex: 2, // z-index của [data-transition-wrap] ở biến thể này

      clipDuration: 0.8, // bo góc vào / ra
      shrinkDuration: 1.2, // ba lớp co lại
      exitDuration: 1.2, // wrapper + tấm giữa trượt khỏi màn
      shrinkEase: 'expo.inOut',

      wrapperScale: 0.95, // trang cũ co còn
      wrapperY: 20, // và tụt xuống (%)
      middleScale: 0.875,
      middleY: 10,
      nextScale: 0.8, // trang mới bắt đầu từ cỡ này

      wrapperExitY: 130, // wrapper trượt hẳn xuống
      middleExitY: 120,
      exitAt: 0.9, // s — wrapper bắt đầu trượt (lệch so với lúc co)
      middleLag: 0.15, // s — tấm giữa và trang mới trễ hơn wrapper

      dither: {
        enabled: true, style: 'bayer16', size: 1, levels: 8,
        brightness: 1, contrast: 1, mono: false, monoColor: '#ffffff',
      },
    },

    // ---- Thanh menu lúc chuyển trang -----------------------------------------
    // Dùng chung cho cả ba biến thể.
    //   'static' — preset cũ: thanh đứng yên suốt lúc chuyển trang
    //   'hide'   — thanh trồi lên khuất khỏi màn lúc bắt đầu, rồi trồi xuống lại
    //              đúng chỗ cũ khi trang mới đã vào
    header: {
      mode: 'hide',
      selector: '[data-transition-header], .cl__bar',
      y: -100, // % chiều cao chính nó — âm là đi lên
      hideDuration: 0.5,
      showDuration: 0.7,
      showLag: 0, // s — trễ thêm so với lúc trang mới bắt đầu vào
      ease: 'expo.inOut',
    },

    // ---- Barba --------------------------------------------------------------
    debug: false,
    timeout: 7000,

    // ---- Lenis --------------------------------------------------------------
    // lerp càng nhỏ càng mượt / trôi lâu (0.1 = mặc định của Lenis); 0.3 gần như
    // cuộn thẳng, không thấy smooth.
    lenis: { enabled: true, lerp: 0.1, wheelMultiplier: 1 },
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('transition', CONFIG)

  if (!CONFIG.enabled) return

  const S = { ...CONFIG }
  const gsap = window.gsap
  if (!gsap) {
    console.warn('[chande-transition] thiếu GSAP — bỏ qua')
    return
  }

  const hasCustomEase = typeof window.CustomEase !== 'undefined'
  const hasBarba = typeof window.barba !== 'undefined'
  const hasLenis = typeof window.Lenis !== 'undefined'
  const hasScrollTrigger = typeof window.ScrollTrigger !== 'undefined'

  // Khối setting của biến thể đang dùng.
  const V = () => S[S.variant] || S.sweep
  // Bề rộng cột bám theo thanh loading để hai thứ không bao giờ lệch nhau.
  const widths = () => S.widths || window.CHANDE_LOADING?.config?.cellWidths || S.fallbackWidths

  function applyEase() {
    if (hasCustomEase) {
      gsap.registerPlugin(window.CustomEase)
      window.CustomEase.create('chande', S.ease)
    }
    gsap.defaults({ ease: hasCustomEase ? 'chande' : 'power3.inOut', duration: V().duration })
  }
  applyEase()

  history.scrollRestoration = 'manual'

  const rmMQ = matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = rmMQ.matches
  rmMQ.addEventListener?.('change', (e) => (reducedMotion = e.matches))

  /* -------------------------------------------------------------- dither --
   * Ordered dithering ma trận Bayer. Màu cột là màu PHẲNG nên kết quả chỉ phụ
   * thuộc (x mod N, y mod N) -> lát gạch được: mỗi cột chỉ cần một tile N×N
   * repeat, không cần canvas cao bằng cả màn.
   *
   * Phần toán này cố ý CHÉP LẠI thay vì dùng chung với chande-loading.js: hai
   * file hiệu ứng phải chạy độc lập, bỏ file nào thì file kia vẫn nguyên vẹn.
   */
  function bayer(n) {
    let m = [[0, 2], [3, 1]]
    while (m.length < n) {
      const k = m.length
      const out = Array.from({ length: k * 2 }, () => new Array(k * 2))
      for (let y = 0; y < k; y++)
        for (let x = 0; x < k; x++) {
          const v = m[y][x] * 4
          out[y][x] = v
          out[y][x + k] = v + 2
          out[y + k][x] = v + 3
          out[y + k][x + k] = v + 1
        }
      m = out
    }
    return m
  }

  const BAYER_N = { bayer2: 2, bayer4: 4, bayer8: 8, bayer16: 16 }
  const hex2rgb = (h) => {
    const v = parseInt(String(h).replace('#', ''), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }
  const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v)

  // Trả về { url, size } — ảnh tile và cạnh của nó tính bằng px CSS.
  function ditherTile(hex) {
    const D = V().dither
    const N = BAYER_N[D.style] || 16
    const mat = bayer(N)
    const cell = Math.max(1, D.size | 0)

    const cvs = document.createElement('canvas')
    cvs.width = N
    cvs.height = N
    const ctx = cvs.getContext('2d')
    const img = ctx.createImageData(N, N)
    const px = img.data

    const base = hex2rgb(hex).map((c) => c / 255)
    const mono = hex2rgb(D.monoColor).map((c) => c / 255)
    const baseLum = lum(base)
    const q = Math.max(2, D.levels | 0) - 1
    const n2 = N * N

    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const t = (mat[y][x] + 0.5) / n2 - 0.5 // ngưỡng Bayer, [-0.5, 0.5)
        const i = (y * N + x) * 4
        for (let c = 0; c < 3; c++) {
          let v = D.mono ? mono[c] * baseLum : base[c]
          v = (v - 0.5) * D.contrast + 0.5
          v *= D.brightness
          v = Math.round((v + t / q) * q) / q
          px[i + c] = Math.round(clamp01(v) * 255)
        }
        px[i + 3] = 255
      }

    ctx.putImageData(img, 0, 0)
    return { url: cvs.toDataURL(), size: N * cell }
  }

  /* ---------------------------------------------------------------- rèm ---- */
  const style = document.createElement('style')
  style.setAttribute('data-chande-transition', '')
  document.head.appendChild(style)

  let wrap = null
  const columns = (side) =>
    wrap
      ? [...wrap.querySelectorAll(
          side
            ? `[data-transition-set="${side}"] > [data-transition-column]`
            : '[data-transition-column]'
        )]
      : []

  function mount() {
    wrap = document.querySelector('[data-transition-wrap]')
    if (!wrap) {
      wrap = document.createElement('div')
      wrap.setAttribute('data-transition-wrap', '')
      document.body.appendChild(wrap)
    }
    wrap.setAttribute('aria-hidden', 'true')
  }

  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')

  // Chữ trên rèm theo TRANG SẮP TỚI: ô nào trong setting ghi số (vd. "01") là ô số, ô
  // ghi chữ (vd. "GALLERY") là ô tên. Mỗi lần chuyển trang điền số + tên của trang đích
  // (lấy từ menu của thanh header — CHANDE_LOADING.config.nav; trang chủ = 00 HOME).
  const slotOf = (t) => (/^\s*\d+\s*$/.test(String(t)) ? 'num' : 'name')
  const normPath = (p) => (p || '/').replace(/\/index\.html$/, '/').replace(/\.html$/, '').replace(/^\/*/, '/')
  // order: số thứ tự 3 chữ số — trang chủ 001, các trang trên menu tiếp theo (002, 003…)
  function destOf(path) {
    const here = normPath(new URL(path || '/', location.href).pathname)
    const nav = window.CHANDE_LOADING?.config?.nav || []
    const ord = (i) => String(i + 1).padStart(3, '0')
    for (let i = 0; i < nav.length; i++) {
      const n = nav[i]
      if (n.href && normPath(new URL(n.href, location.href).pathname) === here)
        return { num: n.num || '', name: n.after || n.during || '', order: ord(i + 1) }
    }
    const home = window.CHANDE_LOADING?.config?.home || 'index.html'
    if (here === normPath(new URL(home, location.href).pathname) || here === '/') return { num: '00', name: 'HOME', order: ord(0) }
    return null
  }
  function setDestLabels(path) {
    if (!wrap) return
    const d = destOf(path)
    wrap.querySelectorAll('[data-transition-label][data-slot]').forEach((el) => {
      if (!d) return
      const t = d[el.dataset.slot] || ''
      el.firstElementChild.textContent = t
      el.style.visibility = t ? '' : 'hidden'
    })
  }

  function makeMiddle(v) {
    const el = document.createElement('div')
    el.setAttribute('data-transition-middle', '')
    el.style.backgroundColor = v.color
    if (v.dither.enabled) {
      const tile = ditherTile(v.color)
      el.style.backgroundImage = `url("${tile.url}")`
      el.style.backgroundSize = `${tile.size}px ${tile.size}px`
    }
    let html = ''
    if (String(v.label).trim())
      html += `<span data-transition-label data-slot="${slotOf(v.label)}"><span>${esc(v.label)}</span></span>`
    // số thứ tự trang ở góc trên phải (điền theo trang sắp tới)
    if (v.order) html += `<span data-transition-label data-slot="order" data-transition-order><span></span></span>`
    el.innerHTML = html
    wrap.appendChild(el)
    gsap.set(el, { autoAlpha: 0 })
  }

  function makeSet(side, colors, labels) {
    const set = document.createElement('div')
    set.setAttribute('data-transition-set', side)
    widths().forEach((w, i) => {
      const color = colors[i % colors.length]
      const c = document.createElement('div')
      c.setAttribute('data-transition-column', '')
      c.style.width = `${w}%`
      c.style.backgroundColor = color
      if (V().dither.enabled) {
        const tile = ditherTile(color)
        c.style.backgroundImage = `url("${tile.url}")`
        c.style.backgroundSize = `${tile.size}px ${tile.size}px`
      }
      const text = (labels && labels[i]) || ''
      if (text.trim()) {
        // Hai lớp: lớp ngoài giữ cỡ chữ gốc để `padding` tính theo thang thiết
        // kế; lớp trong mới đặt cỡ 106. Nếu nhét chung một lớp thì padding sẽ
        // bị tính theo 106px chứ không phải 16px.
        c.innerHTML = `<span data-transition-label data-slot="${slotOf(text)}"><span>${esc(text)}</span></span>`
      }
      set.appendChild(c)
    })
    wrap.appendChild(set)
  }

  function build() {
    const v = V()
    const stack = S.variant === 'stack'
    const split = S.variant === 'split'
    const topH = split ? v.splitAt : 100

    const L = S.label
    const em = (px) => `${(px / 16).toFixed(4)}em`
    const posOf = (a) =>
      a === 'center'
        ? 'top:50%; transform:translateY(-50%)'
        : a === 'bottom'
        ? 'bottom:0'
        : 'top:0'

    style.textContent = `
@font-face{font-family:'Phudu';font-style:normal;font-weight:700;font-display:block;
  src:url('${S.fontDir}Phudu-Bold-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Phudu';font-style:normal;font-weight:700;font-display:block;
  src:url('${S.fontDir}Phudu-Bold-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Phudu';font-style:normal;font-weight:700;font-display:block;
  src:url('${S.fontDir}Phudu-Bold-vietnamese.woff2') format('woff2');
  unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}

[data-transition-wrap]{
  position:fixed; inset:0; z-index:${stack ? v.zIndex : S.zIndex};
  overflow:clip; pointer-events:none;
  /* Cùng thang Osmo với thanh loading: 1em = 1px-thiết-kế ở khổ 1920. */
  font-size:calc(clamp(1440px, 100vw, 1920px) / 120);
  /* Bù cap-height của Phudu Bold — measureLabel() ghi đè bằng metric thật. */
  --ct-tt:0em; --ct-tb:0em;
}

/* Chữ căn trái sát mép trái cột, cách mép ${L.padding}. Cột cắt phần tràn để
   chữ không lấn sang cột bên cạnh. */
[data-transition-label]{
  position:absolute; left:0; right:0;
  padding:${em(L.padding)};
  color:${L.color}; text-transform:uppercase; text-align:left;
}
[data-transition-set="top"] [data-transition-label]{${posOf(v.labelAlign)}}
[data-transition-set="bottom"] [data-transition-label]{${posOf(
      v.labelAlignBottom || v.labelAlign
    )}}
/* Biến thể trượt thẻ: một tấm màu phủ toàn màn, mặc định trong suốt. */
[data-transition-middle]{
  position:fixed; inset:0; opacity:0;
  image-rendering:pixelated; image-rendering:crisp-edges; background-repeat:repeat;
}
[data-transition-middle] [data-transition-label]{${posOf(
      stack ? v.labelAlign : 'center'
    )}}
/* số thứ tự trang: góc trên phải tấm giữa */
[data-transition-middle] [data-transition-order]{top:0; bottom:auto; transform:none; text-align:right}

/* Thanh menu dịch bằng thuộc tính translate chứ KHÔNG phải transform:
   transform của thanh đang do Web Animations của chande-loading.js giữ với
   fill 'both', mà animation thắng khai báo inline — ghi transform vào là bị đè.
   translate là thuộc tính riêng, cộng dồn với transform nên hai bên không đụng
   nhau. */
${S.header.selector}{translate:0 calc(var(--ct-header, 0) * 1%)}
[data-transition-label] > span{
  display:block;
  font-family:'Phudu',ui-sans-serif,system-ui,sans-serif; font-weight:${L.weight};
  font-size:${em(L.fontSize)}; line-height:${L.lineHeight};
  margin-top:calc(-1 * var(--ct-tt)); margin-bottom:calc(-1 * var(--ct-tb));
}
[data-transition-set]{position:absolute; left:0; right:0; display:flex}
[data-transition-set="top"]{top:0; height:${topH}%}
[data-transition-set="bottom"]{bottom:0; height:${100 - topH}%}
/* top:±100% là vị trí nghỉ (ngay ngoài mép khối). Đặt bằng thuộc tính top chứ
   không phải transform, vì GSAP ghi đè transform khi tween yPercent. */
[data-transition-set="top"] > [data-transition-column]{top:-100%}
[data-transition-set="bottom"] > [data-transition-column]{top:100%}
[data-transition-column]{
  position:relative; height:100%; flex:0 0 auto; overflow:hidden;
  /* Không đặt will-change thường trực: 4 cột cao bằng màn hình sẽ nằm trên GPU
     suốt đời trang. GSAP tự nâng lớp (force3D) trong lúc tween. */
  image-rendering:pixelated; image-rendering:crisp-edges; background-repeat:repeat;
}
`
    wrap.textContent = ''
    if (stack) {
      makeMiddle(v)
      return
    }
    makeSet('top', v.colors, v.labels)
    if (split) makeSet('bottom', v.colorsBottom, v.labelsBottom)
    gsap.set(columns(), { yPercent: 0 })
  }

  /* --------------------------------------------------- bù cap-height chữ ---
   * Figma trim text box theo cap-height, và lượng cắt trên / dưới KHÔNG bằng
   * nhau. Đo thẳng metric của Phudu Bold rồi ghi vào biến CSS, để `padding` 24
   * đo tới ĐỈNH CHỮ chứ không tới mép line box.
   */
  async function measureLabel() {
    const L = S.label
    try {
      await document.fonts?.load(`${L.weight} 100px Phudu`)
      await document.fonts?.ready
    } catch (e) {}
    let m
    try {
      const c = document.createElement('canvas').getContext('2d')
      c.font = `${L.weight} ${L.fontSize * 4}px Phudu, sans-serif`
      m = c.measureText('H')
    } catch (e) {
      return
    }
    const k = 0.25 // đo ở cỡ gấp 4 rồi thu về
    const asc = m.fontBoundingBoxAscent * k
    const desc = m.fontBoundingBoxDescent * k
    const cap = m.actualBoundingBoxAscent * k
    if (!(asc > 0 && desc >= 0 && cap > 0)) return

    const lineBox = L.fontSize * L.lineHeight
    const half = (lineBox - (asc + desc)) / 2
    const tt = half + (asc - cap)
    const tb = desc + half
    wrap.style.setProperty('--ct-tt', `${(tt / L.fontSize).toFixed(5)}em`)
    wrap.style.setProperty('--ct-tb', `${(tb / L.fontSize).toFixed(5)}em`)
  }

  /* -------------------------------------------------------------- lenis ---- */
  let lenis = null
  function initLenis() {
    if (lenis || !hasLenis || !S.lenis.enabled) return
    lenis = new window.Lenis({ lerp: S.lenis.lerp, wheelMultiplier: S.lenis.wheelMultiplier })
    if (hasScrollTrigger) lenis.on('scroll', window.ScrollTrigger.update)
    gsap.ticker.add((time) => lenis.raf(time * 1000))
    gsap.ticker.lagSmoothing(0)

    // Màn loading khoá cuộn; Lenis mà chạy sớm là gỡ mất cái khoá đó. Giữ Lenis
    // im cho tới khi loading xong.
    const CLmod = window.CHANDE_LOADING
    if (CLmod && !CLmod.state.done) {
      lenis.stop()
      document.addEventListener('chande-loading:done', () => lenis.start(), { once: true })
    }
  }

  /* ------------------------------------------------------- registry hooks -- */
  let nextPage = document
  let onceDone = false

  function initOnceFunctions() {
    initLenis()
    if (onceDone) return
    onceDone = true
    // Chạy đúng một lần ở lần tải đầu.
  }

  function initBeforeEnterFunctions(next) {
    nextPage = next || document
    // Chạy trước animation enter.
  }

  function initAfterEnterFunctions(next) {
    nextPage = next || document
    // Chạy sau khi animation enter xong.
    if (lenis) lenis.resize()
    if (hasScrollTrigger) window.ScrollTrigger.refresh()
  }

  function resetPage(container) {
    scrollTo(0, 0)
    gsap.set(container, { clearProps: 'position,top,left,right' })
    if (lenis) {
      lenis.resize()
      lenis.start()
    }
  }

  /* --------------------------------------------------------- animation ----- */
  function runPageOnceAnimation(next) {
    const tl = gsap.timeline()
    tl.call(() => resetPage(next), null, 0)
    return tl
  }

  // Rèm phủ vào.
  function coverTl() {
    const v = V()
    const tl = gsap.timeline()
    const stagger = { each: v.stagger, from: v.leaveFrom }
    if (S.variant === 'split') {
      tl.fromTo(columns('top'), { yPercent: 0 },
        { yPercent: 100, duration: v.duration, stagger }, 0)
      tl.fromTo(columns('bottom'), { yPercent: 0 },
        { yPercent: -100, duration: v.duration, stagger }, 0)
    } else {
      tl.fromTo(columns(), { yPercent: 0 },
        { yPercent: 100, duration: v.duration, stagger }, 0)
    }
    return tl
  }

  // Rèm rút ra. 'sweep' quét tiếp xuống rồi trôi khỏi màn; 'split' tách hai phía.
  function revealTl() {
    const v = V()
    const tl = gsap.timeline()
    const stagger = { each: v.stagger, from: v.revealFrom }
    const opt = { duration: v.duration, stagger, overwrite: 'auto' }
    if (S.variant === 'split') {
      tl.to(columns('top'), { yPercent: 0, ...opt }, 0)
      tl.to(columns('bottom'), { yPercent: 0, ...opt }, 0)
    } else {
      tl.to(columns(), { yPercent: 200, ...opt }, 0)
    }
    return tl
  }

  /* ------------------------------------------------- biến thể trượt thẻ ----
   * Ba lớp xếp chồng, tất cả position:fixed nên cuộn trang không ảnh hưởng:
   *   wrapper (bọc trang cũ) z3  >  tấm giữa z2  >  trang mới z1
   * Trang cũ được bọc thêm một lớp để dời đi mà không phá layout của chính nó,
   * và bị ghim `top:-scrollY` để trông như đứng yên đúng chỗ đang cuộn.
   */
  function prepareStack(parent, current, next) {
    const v = V()
    const wrapper = document.createElement('div')
    wrapper.setAttribute('data-transition-page', '')
    parent.insertBefore(wrapper, current)
    wrapper.appendChild(current)

    const scrollY = scrollY0()
    scrollTo(0, 0)

    const middle = wrap.querySelector('[data-transition-middle]')
    const flat = 'rect(0% 100% 100% 0% round 0em)'

    // minHeight BẮT BUỘC: trang cũ vừa bị nhấc ra khỏi luồng (wrapper là
    // position:fixed) nên `parent` co về chiều cao 0. `perspective` biến parent
    // thành containing block của mọi con position:fixed, và `overflow:clip` thì
    // cắt theo cái hộp 0px đó — mất sạch cả header lẫn hai trang. Ghim 100vh là
    // hết.
    gsap.set(parent, {
      perspective: '100vw',
      transformStyle: 'preserve-3d',
      overflow: 'clip',
      minHeight: '100vh',
      backgroundColor: v.bg,
    })

    gsap.set(wrapper, {
      position: 'fixed', top: 0, left: 0, right: 0, width: '100%', height: '100vh',
      overflow: 'clip', zIndex: 3, transformStyle: 'preserve-3d',
      willChange: 'transform', clipPath: flat,
    })

    gsap.set(current, {
      position: 'absolute', top: -scrollY, left: 0, width: '100%',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden',
    })

    gsap.set(middle, {
      willChange: 'transform, opacity', autoAlpha: 1,
      yPercent: 0, scale: 1, clipPath: flat,
    })

    gsap.set(next, {
      position: 'fixed', top: 0, left: 0, right: 0, width: '100%', height: '100vh',
      overflow: 'clip', zIndex: 1, transformStyle: 'preserve-3d',
      willChange: 'transform, opacity', backfaceVisibility: 'hidden',
      autoAlpha: 1, yPercent: 0, scale: 1, clipPath: flat,
    })

    return { wrapper, middle, scrollY }
  }

  const scrollY0 = () => window.scrollY || 0

  function runStackLeave(current, next) {
    const v = V()
    const parent = current.parentElement || document.body
    const { wrapper, middle } = prepareStack(parent, current, next)

    const round = (r) => `rect(0% 100% 100% 0% round ${r}em)`
    const tExit = v.exitAt
    const tMiddle = tExit + v.middleLag
    const tNext = tExit + v.middleLag * 2
    const tUnclip = tNext + v.exitDuration - v.clipDuration

    const tl = gsap.timeline({
      onComplete: () => {
        wrapper.remove()
        gsap.set(parent, {
          clearProps: 'perspective,transformStyle,overflow,minHeight,backgroundColor',
        })
        gsap.set(next, {
          clearProps:
            'position,inset,top,left,right,width,height,overflow,zIndex,transformStyle,willChange,backfaceVisibility,transform,clipPath',
        })
        gsap.set(middle, { autoAlpha: 0, clearProps: 'transform,clipPath,willChange' })
        stackDone?.()
        stackDone = null
      },
    })

    // Ba lớp cùng bo góc rồi cùng co lại.
    tl.to([wrapper, middle, next], { clipPath: round(v.radius), duration: v.clipDuration }, 0)
    tl.to(wrapper, { scale: v.wrapperScale, yPercent: v.wrapperY,
      duration: v.shrinkDuration, ease: v.shrinkEase, overwrite: 'auto' }, 0)
    tl.to(middle, { scale: v.middleScale, yPercent: v.middleY,
      duration: v.shrinkDuration, ease: v.shrinkEase, overwrite: 'auto' }, 0)
    tl.to(next, { scale: v.nextScale, yPercent: 0,
      duration: v.shrinkDuration, ease: v.shrinkEase, overwrite: 'auto' }, 0)

    // Wrapper trượt khỏi màn, tấm giữa theo sau, trang mới phóng lên đúng chỗ.
    tl.to(wrapper, { yPercent: v.wrapperExitY, duration: v.exitDuration }, tExit)
    tl.to(middle, { yPercent: v.middleExitY, duration: v.exitDuration }, tMiddle)
    tl.to(next, { scale: 1, yPercent: 0, duration: v.exitDuration,
      ease: v.shrinkEase, overwrite: 'auto' }, tNext)

    // Bỏ bo góc đúng lúc trang mới về cỡ thật.
    tl.to([wrapper, middle, next], { clipPath: round(0), duration: v.clipDuration }, tUnclip)

    addHeaderMotion(tl, tNext)
    return tl
  }

  // Ở biến thể trượt thẻ, `enter` phải ĐỢI `leave` xong mới resetPage — nếu
  // không, sync:true cho enter chạy ngay từ giây 0 và clearProps sẽ gỡ mất
  // position:fixed của trang mới ngay giữa lúc đang animate.
  let stackDone = null

  /* Thanh menu trồi lên lúc bắt đầu, trồi xuống lại khi trang mới đã vào.
   * Tween qua một object trung gian rồi tự ghi biến CSS — chắc ăn hơn là trông
   * chờ GSAP nội suy trực tiếp custom property. */
  function addHeaderMotion(tl, showAt) {
    const H = S.header
    if (H.mode !== 'hide' || reducedMotion) return
    const el = document.querySelector(H.selector)
    if (!el) return

    const proxy = { v: 0 }
    const write = () => el.style.setProperty('--ct-header', proxy.v)
    write()

    tl.to(proxy, { v: H.y, duration: H.hideDuration, ease: H.ease, onUpdate: write }, 0)
    tl.to(
      proxy,
      { v: 0, duration: H.showDuration, ease: H.ease, onUpdate: write },
      showAt + H.showLag
    )
  }

  function runPageLeaveAnimation(current, next, path) {
    setDestLabels(path)
    if (S.variant === 'stack' && !reducedMotion) {
      document.dispatchEvent(new CustomEvent('chande-transition:cover'))
      return runStackLeave(current, next)
    }

    const tl = gsap.timeline({ onComplete: () => current.remove() })

    if (reducedMotion) return tl.set(current, { autoAlpha: 0 })

    tl.set(next, { autoAlpha: 0 }, 0)
    tl.call(() => document.dispatchEvent(new CustomEvent('chande-transition:cover')), null, 0)
    tl.add(coverTl(), 0)
    addHeaderMotion(tl, V().enterAt)
    return tl
  }

  function runPageEnterAnimation(next) {
    if (S.variant === 'stack' && !reducedMotion) {
      return new Promise((resolve) => {
        stackDone = () => {
          resetPage(next)
          document.dispatchEvent(new CustomEvent('chande-transition:done'))
          resolve()
        }
      })
    }

    const tl = gsap.timeline()

    if (reducedMotion) {
      tl.set(next, { autoAlpha: 1 })
      tl.add('pageReady')
      tl.call(resetPage, [next], 'pageReady')
      return new Promise((resolve) => tl.call(resolve, null, 'pageReady'))
    }

    // Rèm đã kín ở mốc này -> tráo trang rồi mở rèm.
    tl.add('startEnter', V().enterAt)
    tl.set(next, { autoAlpha: 1 }, 'startEnter')
    tl.add(revealTl(), 'startEnter')

    tl.add('pageReady')
    tl.call(resetPage, [next], 'pageReady')
    tl.call(() => document.dispatchEvent(new CustomEvent('chande-transition:done')), null, 'pageReady')

    return new Promise((resolve) => tl.call(resolve, null, 'pageReady'))
  }

  /* -------------------------------------------------------------- barba --- */
  function initBarba() {
    if (!hasBarba) {
      console.warn('[chande-transition] thiếu Barba — rèm vẫn chạy tay qua play()')
      initOnceFunctions()
      return
    }
    const barba = window.barba

    barba.hooks.beforeEnter((data) => {
      // Đặt container mới nằm đè lên trên trong lúc hai bên cùng tồn tại.
      // Biến thể trượt thẻ tự lo phần này trong prepareStack() — đụng vào đây
      // là ghi đè mất trạng thái nó vừa dựng.
      if (S.variant !== 'stack')
        gsap.set(data.next.container, { position: 'fixed', top: 0, left: 0, right: 0 })
      if (lenis) lenis.stop()
      initBeforeEnterFunctions(data.next.container)
    })

    barba.hooks.afterLeave(() => {
      if (hasScrollTrigger) window.ScrollTrigger.getAll().forEach((t) => t.kill())
    })

    barba.hooks.enter((data) => markCurrentNav(data.next.url?.path))

    barba.hooks.afterEnter((data) => {
      initAfterEnterFunctions(data.next.container)
      if (lenis) {
        lenis.resize()
        lenis.start()
      }
      if (hasScrollTrigger) window.ScrollTrigger.refresh()
    })

    barba.init({
      debug: S.debug,
      timeout: S.timeout,
      preventRunning: true,
      transitions: [
        {
          name: 'chande-columns',
          sync: true,
          async once(data) {
            initOnceFunctions()
            markCurrentNav(location.pathname)
            return runPageOnceAnimation(data.next.container)
          },
          async leave(data) {
            return runPageLeaveAnimation(data.current.container, data.next.container, data.next.url?.path)
          },
          async enter(data) {
            return runPageEnterAnimation(data.next.container)
          },
        },
      ],
    })
  }

  /* ------------------------------------------- bấm link về chính trang -- */
  // Barba bỏ qua link trỏ về CHÍNH trang đang mở (sameUrl) và để trình duyệt tải lại cả
  // trang -> hiện lại màn loading tổng (vd. đang ở Gallery bấm tiếp "Gallery" trên menu).
  // Chặn lại: chỉ cuộn mượt lên đầu trang. Link có #mục, mở tab mới, phím bổ trợ: để nguyên.
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = e.target.closest?.('a[href]')
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const u = new URL(a.getAttribute('href'), location.href)
      if (u.origin !== location.origin || u.hash) return
      const norm = (p) => (p || '/').replace(/\/index\.html$/, '/').replace(/\.html$/, '')
      if (norm(u.pathname) !== norm(location.pathname) || u.search !== location.search) return
      e.preventDefault()
      if (lenis) lenis.scrollTo(0)
      else scrollTo({ top: 0, behavior: 'smooth' })
    },
    true,
  )

  /* -------------------------------------------------------------- helper -- */
  // Header nằm NGOÀI container nên không được Barba thay; tự gắn aria-current
  // theo đường dẫn trang mới.
  function markCurrentNav(path) {
    if (!path) return
    const norm = (p) => (p || '/').replace(/\/index\.html$/, '/').replace(/\.html$/, '')
    const here = norm(path)
    document.querySelectorAll('.cl__bar a[href]').forEach((a) => {
      const same = norm(new URL(a.href, location.origin).pathname) === here
      if (same) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    })
  }

  /* --------------------------------------------------------------- API ---- */
  let busy = false

  const API = {
    config: S,
    defaults: structuredClone(CONFIG),
    get lenis() {
      return lenis
    },
    get variant() {
      return S.variant
    },
    // Đổi biến thể rèm rồi dựng lại DOM cho nó.
    setVariant(name) {
      if (!S[name]) return
      S.variant = name
      API.refresh()
    },
    cover: coverTl,
    reveal: revealTl,
    // Chạy trọn một vòng rèm tại chỗ, không chuyển trang — để xem thử.
    // Biến thể 'stack' cần hai container thật nên không xem tại chỗ được, phải
    // bấm sang trang khác.
    canPlayInPlace: () => S.variant !== 'stack',
    async play() {
      if (busy || S.variant === 'stack') return
      busy = true
      const v = V()
      document.dispatchEvent(new CustomEvent('chande-transition:cover'))
      await coverTl()
      const covered = v.duration + v.stagger * (widths().length - 1)
      await new Promise((r) => setTimeout(r, Math.max(0, v.enterAt - covered) * 1000))
      await revealTl()
      document.dispatchEvent(new CustomEvent('chande-transition:done'))
      busy = false
    },
    go: (href) => (hasBarba ? window.barba.go(href) : (location.href = href)),
    // Sau khi sửa `config`, gọi refresh() để dựng lại cột và ease.
    refresh() {
      applyEase()
      build()
      measureLabel()
    },
  }
  window.CHANDE_TRANSITION = API

  /* ----------------------------------------------------------- khởi động - */
  function boot() {
    mount()
    build()
    measureLabel()
    initBarba()
  }

  if (document.body) boot()
  else document.addEventListener('DOMContentLoaded', boot, { once: true })
})()
