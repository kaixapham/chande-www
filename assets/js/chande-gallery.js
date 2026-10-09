/* =============================================================================
 * CHANDE — Gallery: lưới ảnh vô tận (bố cục theo 197historiasilustradas.com)
 * -----------------------------------------------------------------------------
 *   • [data-gallery]        sân khấu cố định toàn màn; kéo chuột / vuốt / lăn
 *                           chuột / trackpad để đi mọi hướng, thả tay có quán tính
 *   • [data-gallery-items]  danh sách ảnh JSON: {name, img, full?} — `img` là thumb
 *                           vuông, `full` mở ở lightbox (CMS sửa được)
 *   • Lưới không có biên, 5 kiểu đặt ảnh (CONFIG.layout, xem LAYOUTS):
 *       zigzag  — kiểu 197historiasilustradas: cột lẻ lệch xuống, hàng lệch ngang
 *       grid    — hàng cột thẳng tắp
 *       brick   — gạch xây: hàng lẻ lệch nửa khoảng cột
 *       scatter — lưới thẳng bị xô lệch + xoay ngẫu nhiên (ảnh vứt trên cỏ)
 *       cluster — cụm 2×2 sát nhau, các cụm cách xa
 *     + các lớp ngẫu nhiên dùng được cho mọi kiểu (cố định theo ô, kéo qua lại
 *       ảnh vẫn nằm yên): jitter (lệch từng ô), warp (trường nhiễu mượt kéo cả
 *       vùng trôi theo nhau -> chỗ dồn chỗ thưa), sizeVar (to nhỏ, tấm to nằm
 *       trên), holes (bỏ trống ô), rotate (xoay: nửa theo vùng, nửa từng ô) +
 *       tiltWild (thỉnh thoảng một tấm nghiêng hẳn).
 *     Ô (cột c, hàng r) hiện ảnh số (c + r·step) mod N, `step` tự chọn sao cho
 *     cùng một ảnh lặp lại ở xa nhau nhất. Chỉ dựng DOM cho ô trong màn (pool).
 *     chande-grass.js tính lại đúng công thức place() trong shader — sửa một bên
 *     phải sửa bên kia.
 *   • Intro: các ô bật lên lan từ tâm màn, rồi caption hiện — chờ loading xong
 *     (lần tải đầu) hoặc rèm chuyển trang mở (đi tới bằng Barba).
 *   • Bấm một ô: lightbox phóng ảnh từ đúng vị trí ô; bấm bất kỳ / Esc để đóng.
 *   • data-floor trên [data-gallery] — preset mặt sàn:
 *       "grass-3d"    thảm cỏ 3D lá thật (chande-grass.js vẽ)
 *       "grass-pixel" thảm cỏ pixel 8-bit (file này vẽ ô cỏ canvas, lát liền mạch)
 *       bỏ trống      nền kem có đường đồng mức địa hình (ảnh Figma "BG" 564:43828,
 *                     lát lật gương 2×2 cho liền mạch)
 *     Cả hai kiểu cỏ trôi cùng lưới như sàn thật. Chọn preset ở bảng setting
 *     (CONFIG.floor). Nếu trang có nút chuyển ([data-floor-switch] chứa các
 *     [data-floor-set]) thì nút đổi tại chỗ và nhớ theo trình duyệt. Mọi module
 *     nghe sự kiện 'chande-floor' trên document.
 * Mount / gỡ theo Barba giống chande-hero.js. File nạp ở cả ba trang.
 * ========================================================================== */
(() => {
  'use strict'

  // Các lớp ngẫu nhiên tắt hết (kiểu xếp gọn).
  const CALM = { jitter: 0, rotate: 0, warp: 0, sizeVar: 0, holes: 0, tiltWild: 0 }
  // Bộ số mặc định của từng kiểu đặt ảnh — chọn kiểu ở bảng setting = chép bộ này.
  const LAYOUTS = {
    zigzag: { colGap: 2.02, rowGap: 2.2, zig: 0.53, rowShift: 0.618, ...CALM },
    grid: { colGap: 1.6, rowGap: 1.78, ...CALM },
    brick: { colGap: 1.7, rowGap: 1.85, ...CALM },
    scatter: { colGap: 1.75, rowGap: 1.95, jitter: 0.28, rotate: 11, warp: 0.65, warpScale: 3.5, sizeVar: 0.4, holes: 0.12, tiltWild: 0.08 },
    cluster: { colGap: 1.5, rowGap: 1.62, clusterGap: 0.12, ...CALM },
  }

  const CONFIG = {
    layout: 'zigzag', // 'zigzag' | 'grid' | 'brick' | 'scatter' | 'cluster'
    colGap: 2.02, // khoảng cách cột / cạnh ô (cluster: khoảng trung bình)
    rowGap: 2.2, // khoảng cách hàng / cạnh ô
    zig: 0.53, // ô cột lẻ lệch xuống bao nhiêu × cạnh ô
    rowShift: 0.618, // hàng r lệch ngang frac(r × rowShift) × khoảng cột
    jitter: 0, // xô lệch từng ô tối đa (× cạnh ô) — mọi kiểu
    rotate: 0, // xoay ngẫu nhiên tối đa (độ) — mọi kiểu
    warp: 0, // trường nhiễu kéo cả vùng trôi theo nhau (× cạnh ô)
    warpScale: 3.5, // độ rộng một "vùng" của trường nhiễu (số ô)
    sizeVar: 0, // to nhỏ: 0 = đều, 0.4 = từ 0.8× tới 1.4×, tấm to nằm trên
    holes: 0, // tỉ lệ ô bị bỏ trống (0..0.5)
    tiltWild: 0, // tỉ lệ tấm nghiêng hẳn (góc × 2.5)
    clusterGap: 0.12, // cluster: khe giữa 4 ảnh trong cụm (× cạnh ô)
    ease: 0.12, // độ bám theo đích mỗi frame 60fps (0..1)
    throw: 280, // quán tính khi thả tay: px / (px/ms)
    dragThreshold: 5, // px — dưới mức này là bấm, không phải kéo
    introSpread: 1.1, // s — ô xa tâm nhất bật lên trễ bấy nhiêu
    size: 10, // rem — cạnh ô ảnh trên desktop (mobile cố định 88px trong CSS)
    floor: 'grass-3d', // preset sàn mặc định: 'grass-3d' | 'grass-pixel' | '' (nền kem)
    // Viền tem răng cưa quanh mọi ảnh (CSS ở gallery.css, số theo cạnh ảnh).
    stamp: {
      enabled: true,
      color: '#333333', // màu viền
      border: 0.06, // độ dày viền (× cạnh ảnh)
      teeth: 0.028, // bán kính một răng (× cạnh ảnh)
      gap: 3, // khoảng cách giữa hai răng (× bán kính răng)
    },
  }
  // Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('gallery', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  const gsap = window.gsap
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  let G = null

  const mod = (a, n) => ((a % n) + n) % n
  const frac = (v) => v - Math.floor(v)

  /* ---------------------------------------------------------- thảm cỏ ---- */
  // Một ô cỏ pixel 64×64 (mỗi pixel vẽ thành khối PX px) — lát liền mạch vì mọi
  // nhiễu đều tuần hoàn theo cạnh ô. Vẽ một lần, dùng lại cho mọi lần mount.
  const GRASS = {
    cells: 64,
    px: 4,
    base: ['#2f6a2b', '#367531', '#3d8136', '#448b3a', '#2a6027'],
    blade: ['#5aa646', '#68b84f', '#4f9a3f'],
    shade: '#24521f',
    flowers: ['#f4f3eb', '#f1e27a', '#f4f3eb'],
  }
  let grassURL = null
  function grassTile() {
    if (grassURL) return grassURL
    const { cells: N, px: P } = GRASS
    const cv = document.createElement('canvas')
    cv.width = cv.height = N * P
    const g = cv.getContext('2d')
    // Nhiễu giá trị tuần hoàn: lưới thô K×K nội suy mượt, quấn mép.
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    const field = (K) => {
      const v = Array.from({ length: K * K }, rnd)
      const at = (i, j) => v[mod(j, K) * K + mod(i, K)]
      return (x, y) => {
        const fx = (x / N) * K
        const fy = (y / N) * K
        const i = Math.floor(fx)
        const j = Math.floor(fy)
        const u = (fx - i) ** 2 * (3 - 2 * (fx - i))
        const w = (fy - j) ** 2 * (3 - 2 * (fy - j))
        const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u
        const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u
        return a + (b - a) * w
      }
    }
    const big = field(4)
    const mid = field(9)
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const n = big(x, y) * 0.6 + mid(x, y) * 0.4 + (rnd() - 0.5) * 0.35
        const k = Math.max(0, Math.min(GRASS.base.length - 1, Math.floor(n * GRASS.base.length)))
        g.fillStyle = GRASS.base[k === 4 ? 0 : k]
        if (n < 0.22) g.fillStyle = GRASS.base[4]
        g.fillRect(x * P, y * P, P, P)
      }
    // Ngọn cỏ: vệt dọc 2–3 pixel sáng, chân có bóng tối.
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(rnd() * N)
      const y = Math.floor(rnd() * N)
      const h = 2 + Math.floor(rnd() * 2)
      g.fillStyle = GRASS.blade[Math.floor(rnd() * GRASS.blade.length)]
      for (let k = 0; k < h; k++) g.fillRect(x * P, mod(y - k, N) * P, P, P)
      g.fillStyle = GRASS.shade
      g.fillRect(x * P, mod(y + 1, N) * P, P, P)
    }
    // Vài bông hoa nhỏ.
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rnd() * N)
      const y = Math.floor(rnd() * N)
      g.fillStyle = GRASS.flowers[i % GRASS.flowers.length]
      ;[[0, -1], [-1, 0], [1, 0], [0, 1]].forEach(([dx, dy]) => g.fillRect(mod(x + dx, N) * P, mod(y + dy, N) * P, P, P))
      g.fillStyle = '#e0b43c'
      g.fillRect(x * P, y * P, P, P)
    }
    return (grassURL = cv.toDataURL('image/png'))
  }

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
    // Preset sàn: lựa chọn ở nút góc (nếu có, nhớ theo trình duyệt) > CONFIG.floor.
    const saved = stage.querySelector('[data-floor-switch]') ? readFloor() : null
    stage.dataset.floor = saved ?? CONFIG.floor
    applySize()
    const probe = document.createElement('div')
    probe.className = 'gal__probe'
    stage.appendChild(probe)

    // Nạp sẵn mọi thumb để ô mới hiện ra khi kéo không bị nháy trắng — nhưng SAU khi các ô
    // đang thấy đã tải xong (nạp hết 110 ảnh cùng lúc thì ảnh trên màn phải xếp hàng chung
    // -> mãi mới hiện), mỗi lần vài ảnh lúc rảnh.
    {
      let i = 0
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 60))
      const step = () => {
        const batch = items.slice(i, (i += 4)).map(
          (it) => new Promise((ok) => {
            const im = new Image()
            im.decoding = 'async'
            im.onload = im.onerror = ok
            im.src = it.img
          }),
        )
        if (batch.length) Promise.all(batch).then(() => idle(step))
      }
      let begun = false
      const begin = () => !begun && ((begun = true), setTimeout(() => idle(step), 800))
      if (document.readyState === 'complete') begin()
      else {
        addEventListener('load', begin, { once: true })
        setTimeout(begin, 4000) // 'load' có thể rất muộn trên mạng chậm
      }
    }

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
      grass: false,
      cfgFloor: CONFIG.floor, // preset sàn của bảng setting lúc mount
    }
    applyFloor()

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
    stage.querySelectorAll('[data-floor-switch] [data-floor-set]').forEach((b) =>
      on(b, 'click', (e) => {
        e.stopPropagation()
        setFloor(b.dataset.floorSet)
      }),
    )
    on(stage.querySelector('[data-floor-switch]') || stage, 'pointerdown', (e) => e.target.closest('[data-floor-switch]') && e.stopPropagation())

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

  /* ---------------------------------------------------------- preset sàn -- */
  const FLOOR_KEY = 'chande-gallery-floor'
  function readFloor() {
    try {
      return localStorage.getItem(FLOOR_KEY)
    } catch {
      return null
    }
  }
  // remember = false: đổi từ bảng setting -> bỏ lựa chọn riêng của nút góc.
  function setFloor(name, remember = true) {
    if (!G) return
    G.stage.dataset.floor = name
    try {
      if (remember) localStorage.setItem(FLOOR_KEY, name)
      else localStorage.removeItem(FLOOR_KEY)
    } catch {}
    applyFloor()
    document.dispatchEvent(new CustomEvent('chande-floor', { detail: { floor: name } }))
  }
  // Nền kem địa hình: ảnh Figma 1920×1080 không lát liền được -> ghép lật gương
  // 2×2 trên canvas (mép nào cũng khớp mép kề), dùng làm nền lặp.
  const TOPO = { src: 'assets/img/gallery-bg/topo.webp', rem: 120 } // 120rem = 1920px khổ thiết kế
  let topoURL = null
  let topoLoading = null
  function topoTile() {
    if (topoURL || topoLoading) return topoLoading
    topoLoading = new Promise((done) => {
      const img = new Image()
      img.onload = () => {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const cv = document.createElement('canvas')
        cv.width = w * 2
        cv.height = h * 2
        const g = cv.getContext('2d')
        ;[
          [1, 1, 0, 0],
          [-1, 1, 2 * w, 0],
          [1, -1, 0, 2 * h],
          [-1, -1, 2 * w, 2 * h],
        ].forEach(([sx, sy, tx, ty]) => {
          g.setTransform(sx, 0, 0, sy, tx, ty)
          g.drawImage(img, 0, 0)
        })
        cv.toBlob((b) => done((topoURL = b ? URL.createObjectURL(b) : TOPO.src)), 'image/jpeg', 0.86)
      }
      img.onerror = () => done(null)
      img.src = TOPO.src
    })
    return topoLoading
  }

  function applyFloor() {
    const st = G.stage
    const floor = st.dataset.floor || ''
    G.grass = floor === 'grass-pixel'
    G.topo = floor === ''
    // Nền nào trôi cùng lưới (vẽ lại vị trí nền trong render()).
    G.bgPan = G.grass ? GRASS.cells * GRASS.px : 0
    st.style.backgroundImage = G.grass ? `url(${grassTile()})` : ''
    st.style.backgroundSize = G.grass ? `${GRASS.cells * GRASS.px}px` : ''
    st.style.backgroundPosition = ''
    if (G.topo) {
      const stage = st
      const apply = (url) => {
        if (!url || !G || G.stage !== stage || !G.topo) return
        stage.style.backgroundImage = `url(${url})`
        stage.style.backgroundSize = `${TOPO.rem * 2}rem auto`
        G.bgPan = 1
        G.dirty = true
      }
      if (topoURL) apply(topoURL)
      else topoTile().then(apply)
    }''
    st.querySelectorAll('[data-floor-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.floorSet === (st.dataset.floor || ''))))
    G.dirty = true
  }

  function applySize() {
    document.documentElement.style.setProperty('--gal-size', CONFIG.size + 'rem')
    applyStamp()
  }

  function applyStamp() {
    const st = G?.stage || document.querySelector('[data-gallery]')
    if (!st) return
    const s = CONFIG.stamp
    st.toggleAttribute('data-stamp', !!s.enabled)
    st.style.setProperty('--stamp-color', s.color)
    st.style.setProperty('--stamp-b', s.border)
    st.style.setProperty('--stamp-r', s.teeth)
    st.style.setProperty('--stamp-gap', Math.max(2.05, s.gap))
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

  // Băm 2 số -> [0,1) (hash12 của Dave Hoskins) — chande-grass.js dùng y hệt
  // trong GLSL để tính ra cùng độ xô lệch / góc xoay cho từng ô.
  function hash(a, b) {
    let x = frac(a * 0.1031)
    let y = frac(b * 0.1031)
    let z = x
    const d = x * (y + 33.33) + y * (z + 33.33) + z * (x + 33.33)
    x += d
    y += d
    z += d
    return frac((x + y) * z)
  }

  // Nhiễu giá trị mượt trên lưới số nguyên (cùng hash) — GLSL có bản y hệt.
  function vnoise(x, y) {
    const i = Math.floor(x)
    const j = Math.floor(y)
    const fx = x - i
    const fy = y - j
    const u = fx * fx * (3 - 2 * fx)
    const v = fy * fy * (3 - 2 * fy)
    const a = hash(i, j)
    const b = hash(i + 1, j)
    const c = hash(i, j + 1)
    const d = hash(i + 1, j + 1)
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
  }

  // Vị trí góc trên-trái của ô (cột c, hàng r) — caption ở trên, ảnh bắt đầu
  // ở y + cap — góc xoay (độ) và tỉ lệ (quanh tâm ảnh). null = ô bỏ trống.
  function place(c, r) {
    if (CONFIG.holes && hash(c + 91, r + 37) < CONFIG.holes) return null
    const { S, px, py, cap } = G
    let x
    let y
    switch (CONFIG.layout) {
      case 'grid':
      case 'scatter':
        x = c * px
        y = r * py
        break
      case 'brick':
        x = c * px + (mod(r, 2) ? px / 2 : 0)
        y = r * py
        break
      case 'cluster': {
        // Cụm 2×2: bước trong cụm sát nhau, bước giữa các cụm = 2 × khoảng.
        const t = S * (1 + CONFIG.clusterGap)
        x = Math.floor(c / 2) * px * 2 + mod(c, 2) * t
        y = Math.floor(r / 2) * py * 2 + mod(r, 2) * (t + cap)
        break
      }
      default: // zigzag
        x = c * px + frac(r * CONFIG.rowShift) * px
        y = r * py + (mod(c, 2) ? S * CONFIG.zig : 0)
    }
    if (CONFIG.jitter) {
      x += (hash(c, r) - 0.5) * 2 * CONFIG.jitter * S
      y += (hash(r + 17, c + 3) - 0.5) * 2 * CONFIG.jitter * S
    }
    const ws = Math.max(0.5, CONFIG.warpScale)
    if (CONFIG.warp) {
      x += (vnoise(c / ws, r / ws) - 0.5) * 2 * CONFIG.warp * S
      y += (vnoise(c / ws + 31.7, r / ws + 11.3) - 0.5) * 2 * CONFIG.warp * S
    }
    let rot = 0
    if (CONFIG.rotate) {
      // Nửa theo vùng (ảnh gần nhau nghiêng gần giống nhau), nửa riêng từng ô.
      rot = ((vnoise(c / ws + 7.1, r / ws + 3.9) - 0.5) + (hash(c + 5, r + 11) - 0.5)) * 2 * CONFIG.rotate
      if (CONFIG.tiltWild && hash(c + 61, r + 7) < CONFIG.tiltWild) rot *= 2.5
    }
    let k = 1
    if (CONFIG.sizeVar) {
      // Lệch về cỡ vừa / nhỏ, thỉnh thoảng một tấm to.
      const h = hash(c + 23, r + 41)
      k = 1 - CONFIG.sizeVar * 0.5 + CONFIG.sizeVar * 1.5 * h * h
    }
    return { x, y, rot, k }
  }

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
    // Sàn cỏ trôi cùng lưới (làm tròn px để ô pixel không nhoè).
    if (G.bgPan) G.stage.style.backgroundPosition = `${Math.round(G.x)}px ${Math.round(G.y)}px`
    const { S, cap, px, py, vw, vh, x, y } = G
    const h = S + cap
    const used = new Set()
    // Mọi kiểu đều có bước trung bình px × py; dư ra một khoảng cho lệch / xoay.
    const dev = 2 * Math.max(px, py) + S * (CONFIG.jitter + CONFIG.warp + CONFIG.sizeVar + 0.5)
    const r0 = Math.floor((-y - dev) / py)
    const r1 = Math.ceil((vh - y + dev) / py)
    const c0 = Math.floor((-x - dev) / px)
    const c1 = Math.ceil((vw - x + dev) / px)
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const p = place(c, r)
        if (!p) continue
        // To nhỏ: đổi CỠ khung ảnh (giữ tâm ảnh), không scale() — chữ caption giữ
        // nguyên cỡ, chỉ dài / ngắn theo bề ngang ảnh.
        const grow = (S * (p.k - 1)) / 2
        const sx = p.x + x - grow
        const sy = p.y + y - grow
        const pad = (p.rot ? S * 0.3 : 0) + Math.max(0, grow)
        if (sx - pad > vw || sx + S + pad < 0 || sy - pad > vh || sy + h + pad < 0) continue
        const key = c + ',' + r
        used.add(key)
        let el = G.active.get(key)
        if (!el) {
          el = acquire(mod(c + r * G.step, G.N))
          G.active.set(key, el)
        }
        el.style.transform =
          `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0)` +
          (p.rot ? ` rotate(${p.rot.toFixed(2)}deg)` : '')
        el.style.setProperty('--k', p.k.toFixed(3))
        // Tấm to nằm đè lên tấm nhỏ (lưới là một stacking context riêng).
        el.style.zIndex = p.k !== 1 ? String(Math.round(p.k * 100)) : '' 
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
        '<div class="gal__media"><img alt="" draggable="false" decoding="async" fetchpriority="high"></div></div>'
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
    defaults: DEFAULTS,
    mount,
    destroy,
    // Bảng setting gọi sau mỗi lần chỉnh.
    refresh() {
      applySize()
      if (!G) return
      // Chỉ đổi sàn khi chính ô preset sàn vừa đổi — chỉnh thanh khác không được
      // ghi đè sàn đang hiện.
      if (CONFIG.floor !== G.cfgFloor) {
        G.cfgFloor = CONFIG.floor
        setFloor(CONFIG.floor, false)
      }
      measure()
      G.dirty = true
    },
    // Độ dời hiện tại của lưới: điểm thế giới (wx, wy) đang ở màn (wx + x, wy + y).
    // + thông số lưới để module khác tính được vị trí ảnh (cỏ đan mép ảnh).
    view: () =>
      G
        ? {
            x: G.x,
            y: G.y,
            S: G.S,
            cap: G.cap,
            px: G.px,
            py: G.py,
            layout: ['zigzag', 'grid', 'brick', 'scatter', 'cluster'].indexOf(CONFIG.layout),
            zig: CONFIG.zig,
            rowShift: CONFIG.rowShift,
            jitter: CONFIG.jitter,
            rotate: CONFIG.rotate,
            clusterGap: CONFIG.clusterGap,
            warp: CONFIG.warp,
            warpScale: CONFIG.warpScale,
            sizeVar: CONFIG.sizeVar,
            holes: CONFIG.holes,
            tiltWild: CONFIG.tiltWild,
          }
        : null,
    layouts: LAYOUTS,
    // Chép bộ số mặc định của một kiểu đặt ảnh (bảng setting gọi khi đổi kiểu).
    applyLayout(name) {
      if (!LAYOUTS[name]) return
      CONFIG.layout = name
      Object.assign(CONFIG, structuredClone(LAYOUTS[name]))
      this.refresh()
    },
    setFloor,
    get floor() {
      return G?.stage.dataset.floor || ''
    },
  }
})()
