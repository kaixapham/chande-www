/* =============================================================================
 * CHANDE — Icon trong 2 khung bo tròn ở Intro (cùng nhóm với con mắt)
 * -----------------------------------------------------------------------------
 * • Khung VÀNG = KẾT NỐI: dải sóng tín hiệu (dựng theo Shape-01.svg — đường kẻ 256×20
 *   với 5 hạt to / nhỏ xen kẽ). Mỗi khung hình tính lại cỡ từng hạt theo một làn sóng
 *   chạy trái -> phải: hạt to co dần thành hạt nhỏ rồi phình lại, lặp liên tục.
 * • Khung XANH = CHIẾC MIỆNG — 6 PRESET (CONFIG.preset, bảng H tab "Miệng (Intro)").
 *   Mỗi preset có dáng KHÉP và dáng CƯỜI; độ cười chạy LIÊN TỤC THEO CUỘN (khung từ
 *   đáy màn lên quá giữa màn: 0 -> 1), qua lò xo cho mượt (mở lố rồi dội), cộng các cử
 *   động nhỏ ngẫu nhiên mỗi idleMin–idleMax s. Mọi preset cùng một kiểu: NÉT + CHẤM —
 *   nét mảnh đầu tròn, chấm ở hai khoé, lòng miệng tô màu lòng trắng mắt. Nét trong (răng, lưỡi) luôn kết
 *   thúc ĐÚNG trên đường môi (hoặc bị cắt theo lòng miệng) -> không có đầu thừa chọc ra.
 *   Một cái miệng = 2 khoé (L, R) + môi trên / môi dưới là 2 đường cong quadratic giữa
 *   hai khoé (up / low = độ cong, âm = cong lên) + răng + lưỡi.
 * Toạ độ theo đơn vị thiết kế (u): khung trong (inset 10/12) = 278 × 54 (vàng),
 * 184 × 54 (xanh). Màu = currentColor (kem trên nền tối, đậm trên nền kem).
 * Chỉ chạy khi Intro gần màn; giảm chuyển động thì đứng ở hình cuối.
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    preset: 'swoosh', // swoosh · gape · buck · grin · talk · laugh · whistle · smirk · cheeky
    idleMin: 1.8, // giây — khoảng nghỉ giữa hai cử động nhỏ
    idleMax: 4,
    spring: 170, // độ cứng lò xo khi khép <-> cười
    waveSpeed: 1.7, // giây cho một nhịp dồn cục (khung vàng)
  }
  window.CHANDE_SETTINGS_APPLY?.('chips', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const NS = 'http://www.w3.org/2000/svg'

  const style = document.createElement('style')
  style.textContent =
    '.chip__icon{position:absolute; left:calc(12 * var(--u)); top:calc(10 * var(--u)); width:calc(100% - 24 * var(--u)); height:calc(100% - 20 * var(--u)); z-index:1; overflow:visible; color:#0f1513; transition:color .6s ease}' +
    'html.hero-row-dark .chip__icon{color:#f4f3eb}' +
    // miệng: nét + chấm cùng màu lòng miệng (= lòng trắng mắt) trên nền tối; răng màu
    // con ngươi cho nổi trên lòng miệng
    'html.hero-row-dark .chip__icon--mouth{color:var(--mouth-fill)}' +
    '.chip__teeth{stroke:var(--mouth-ink)}'
  document.head.appendChild(style)

  const svgIn = (chip, vb) => {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'chip__icon')
    svg.setAttribute('viewBox', vb)
    svg.setAttribute('aria-hidden', 'true')
    chip.append(svg)
    return svg
  }
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
    parent.append(n)
    return n
  }
  const clamp01 = (v) => Math.min(1, Math.max(0, v))

  /* ------------------------------------------------------------ sóng (vàng) */
  // Toạ độ u trong khung 278 × 54 (đường giữa y = 0): đường mảnh chạy SUỐT khung, hai đầu
  // cắm vào viền vàng (x -8…286), màu chuyển vàng -> trắng; là DÂY CHUN: chuột chạm vào thì
  // bị kéo theo, tuột ra thì bật tưng tưng rồi tắt dần (mô phỏng chuỗi lò xo). Ở giữa 3 cục to – nhỏ – to (tâm 95 · 139 · 183, cách 44). Animation DỒN TỪNG CỤC: cả
  // chuỗi cục bị đẩy sang phải đúng một nấc (44) rồi dừng một nhịp; cỡ cục theo VỊ TRÍ
  // (to ở 95 / 183, bóp nhỏ ở 139, xẹp hẳn ở 51 / 227) -> cục đi qua giữa bị bóp lại,
  // ra mép thì chìm vào đường kẻ, ở đầu kia cục mới phồng lên.
  const WAVE = { x0: -8, x1: 286, line: 1, step: 44, first: 51, push: 0.55 }
  // yAt(x): độ lệch dọc của dây chun tại x
  function wavePath(t, yAt = () => 0) {
    const period = Math.max(0.3, CONFIG.waveSpeed || 1.7)
    const k = (t / period) % 1
    const e = smooth(clamp01(k / WAVE.push)) // đẩy (ease) … rồi đứng
    const shift = e * WAVE.step // cỡ cục theo vị trí nên sau mỗi nấc hình lặp lại y hệt
    const A = WAVE.first
    const B = A + 4 * WAVE.step // 227
    const blobs = []
    for (let i = -1; i <= 4; i++) {
      const c = A + i * WAVE.step + shift
      if (c <= A || c >= B) continue
      const u = (c - A) / (B - A) // 0…1 dọc vùng cục
      const edge = smooth(clamp01(Math.min(u, 1 - u) / 0.25)) // đủ cỡ trong 95…183, xẹp về 0 ở hai mép
      const big = 0.5 - 0.5 * Math.cos(4 * Math.PI * u) // 1 ở 95 / 183, 0 ở giữa
      blobs.push({ c, H: edge * (4.9 + 5 * big), W: Math.max(1, edge * (11.5 + 9 * big)) })
    }
    const half = (x) => {
      let h = WAVE.line
      for (const b of blobs) {
        const v = (x - b.c) / b.W
        if (Math.abs(v) < 1) h = Math.max(h, WAVE.line + Math.max(0, b.H - WAVE.line) * Math.cos((v * Math.PI) / 2) ** 2)
      }
      return h
    }
    const top = []
    const bot = []
    for (let x = WAVE.x0; x <= WAVE.x1; x += 1) {
      const h = half(x)
      const y = yAt(x)
      top.push(`${x},${(y - h).toFixed(2)}`)
      bot.push(`${x},${(y + h).toFixed(2)}`)
    }
    return `M${top.join('L')}L${bot.reverse().join('L')}Z` // hai đầu chìm trong viền vàng
  }

  /* ------------------------------------------------------------ miệng (xanh) */
  // Toạ độ u quanh tâm khung trong (184 × 54, tâm 0,0). Một dáng miệng:
  //   lx ly rx ry  khoé trái / phải · up / low  độ cong môi trên / dưới (đáy cong cách
  //   đường nối hai khoé đúng giá trị này; âm = cong lên) · upX / lowX  lệch đỉnh cong
  //   sang ngang · teeth  hàng răng trên (0…1) · tongue  lưỡi (0…1)
  //   · tx  lệch lưỡi ngang · dots  chấm ở hai khoé (0…1).
  // upline: phần môi trên được vẽ (0…1, vẽ dần trái -> phải); 0 = chỉ còn môi dưới làm nét
  // chính (một nét duy nhất cong dần như Figma 762 -> 763).
  const BASE = { lx: -30, ly: 0, rx: 30, ry: 0, up: 0, low: 0, upX: 0, lowX: 0, teeth: 0, tongue: 0, tx: 0, dots: 1, upline: 1 }
  const shape = (o) => ({ ...BASE, ...o })
  const wave = (k, n = 1) => Math.sin(Math.PI * k * n)
  const bell = (k) => Math.sin(Math.PI * k)

  // Preset: closed / open = dáng; idleClosed / idleOpen = cử động nhỏ (hàm k 0…1, sgn ±1
  // -> phần CỘNG THÊM vào dáng), dur = thời lượng (ms).
  const PRESETS = {
    swoosh: {
      label: 'Vệt cười',
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, up: 3, upX: -26, low: 3, lowX: -26 }),
      open: shape({ lx: -64, ly: 5, rx: 64, ry: -16, up: 13, upX: -20, low: 13, lowX: -20 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ up: 4 * bell(k), low: 4 * bell(k), ry: -4 * bell(k) }) }],
      idleOpen: [
        { dur: 1000, fn: (k) => ({ lx: -4 * bell(k), rx: 4 * bell(k), up: 3.5 * bell(k), low: 3.5 * bell(k) }) },
        { dur: 700, fn: (k) => { const w = 3 * wave(k, 4) * (1 - k); return { up: w, low: w } } },
      ],
    },
    gape: {
      label: 'Há miệng',
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, up: 3, upX: -26, low: 3, lowX: -26 }),
      open: shape({ lx: -56, ly: 6, rx: 60, ry: -16, up: -4, upX: 10, low: 22, lowX: -6, tongue: 1 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ low: 4 * bell(k) }) }],
      idleOpen: [
        { dur: 1400, fn: (k) => { const a = Math.abs(Math.sin(k * 21) * Math.sin(k * 6.7)); return { low: -10 * (1 - a), up: 3 * (1 - a) } } },
        { dur: 800, fn: (k) => ({ tx: 7 * wave(k, 3) }) },
      ],
    },
    buck: {
      label: 'Răng thỏ',
      buck: true, // hai răng cửa thay cho cả hàng
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, up: 3, upX: -26, low: 3, lowX: -26 }),
      open: shape({ lx: -64, ly: 4, rx: 62, ry: -14, up: 1, low: 17, lowX: -10, teeth: 1 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ low: 4 * bell(k) }) }],
      idleOpen: [
        // nhai nhai
        { dur: 1000, fn: (k) => ({ low: -6 * Math.abs(wave(k, 3)) }) },
        { dur: 900, fn: (k) => ({ lx: -4 * bell(k), rx: 4 * bell(k) }) },
      ],
    },
    grin: {
      label: 'Toe (theo Figma)',
      // Theo nguyên tắc animation nụ cười: (1) khoé dẫn trước, khoé phải đi trước, bất
      // đối xứng; (2) lấy đà — mím nhẹ, khoé co vào rồi mới bung; (3) hai môi TÁCH nhau:
      // môi trên nhấc, môi dưới hạ, hàng răng trên gắn dưới môi trên lộ đúng bằng khe hở
      // (không mọc thêm vạch); (4) mở nhanh, khép chậm (lò xo); (5) lố nhẹ rồi dội.
      // Pha: 762 thẳng -> 763 cong (hai môi trùng nhau = một nét) -> lấy đà -> cười toe.
      closed: shape({ lx: -37.5, rx: 37.5 }),
      stages: [
        shape({ lx: -37.5, rx: 37.5 }),
        shape({ lx: -37.5, rx: 37.5, up: 14, low: 14 }),
        shape({ lx: -35.5, ly: 0.6, rx: 35.5, ry: 0.4, up: 12, low: 12 }),
        Object.assign(shape({ lx: -18.8, ly: 0.5, rx: 37, ry: -7.9, up: 0, low: 18.5, teeth: 1 }), {
          delay: { rx: [0, 0.6], ry: [0, 0.6], lx: [0.1, 0.75], ly: [0.1, 0.75], up: [0.22, 0.95], low: [0.12, 1], teeth: [0.2, 0.5] },
        }),
      ],
      open: shape({ lx: -18.8, ly: 0.5, rx: 37, ry: -7.9, low: 18.5, teeth: 1 }),
      idleClosed: [
        { dur: 900, fn: (k) => ({ low: 7 * bell(k) }) },
        { dur: 650, fn: (k, s) => ({ ry: -6 * s * bell(k), ly: 2 * s * bell(k) }) },
      ],
      idleOpen: [
        { dur: 800, fn: (k) => ({ low: 3.2 * wave(k, 6) * (1 - k) }) },
        { dur: 1200, fn: (k) => ({ low: -5 * bell(k), ry: 4 * bell(k), teeth: -0.7 * bell(k) }) },
      ],
    },
    talk: {
      label: 'Nói chuyện',
      closed: shape({ lx: -37.5, rx: 37.5 }), // như Figma 762: đường thẳng
      open: shape({ lx: -46, rx: 46, low: 20 }), // môi trên luôn thẳng, chỉ môi dưới cong
      // khi đã mở: NÓI một lúc (nhịp âm tiết lúc to lúc nhỏ) -> NGẬM lại nghỉ -> nói tiếp
      talk: { on: [2.6, 4.2], off: [1.2, 2.2] },
      idleClosed: [
        // lẩm bẩm: hé mở 2 nhịp nhỏ
        { dur: 900, fn: (k) => ({ low: 4 * Math.abs(wave(k, 2)) }) },
      ],
      idleOpen: [],
    },
    laugh: {
      label: 'Cười haha',
      closed: shape({ lx: -30, rx: 30, low: 8 }),
      open: shape({ lx: -32, ly: -3, rx: 32, ry: -3, up: -1, low: 20, teeth: 1, tongue: 0.7 }),
      idleClosed: [
        // cười khẩy: nảy nhẹ 2 nhịp
        { dur: 700, fn: (k) => ({ low: 4 * Math.abs(wave(k, 2)) * (1 - k * 0.5), ly: -1.5 * bell(k), ry: -1.5 * bell(k) }) },
      ],
      idleOpen: [
        // nắc nẻ: 4 nhịp to, cả miệng nảy lên xuống
        { dur: 1300, fn: (k) => { const b = Math.abs(wave(k, 4)) * (1 - k * 0.6); return { low: -7 * b, ly: 3 * b, ry: 3 * b, tongue: -0.3 * b } } },
        { dur: 900, fn: (k) => ({ lx: -3 * bell(k), rx: 3 * bell(k), low: 3 * bell(k) }) },
      ],
    },
    whistle: {
      label: 'Chu môi',
      closed: shape({ lx: -14, rx: 14, up: 1.5, low: 1.5 }),
      open: shape({ lx: -7, rx: 7, up: -7.5, low: 7.5, dots: 0.6 }),
      idleClosed: [
        { dur: 800, fn: (k) => ({ lx: 5 * bell(k), rx: -5 * bell(k), up: -3 * bell(k), low: 2 * bell(k) }) },
      ],
      idleOpen: [
        // phập phồng
        { dur: 1100, fn: (k) => { const b = wave(k, 3) * (1 - k * 0.3); return { lx: -1.6 * b, rx: 1.6 * b, up: -1.6 * b, low: 1.6 * b } } },
        // chu môi hôn: thu nhỏ rồi bật
        { dur: 700, fn: (k) => ({ lx: 3.5 * bell(k), rx: -3.5 * bell(k), up: 3.5 * bell(k), low: -3.5 * bell(k) }) },
      ],
    },
    smirk: {
      label: 'Nhếch mép',
      closed: shape({ lx: -26, ly: 1, rx: 26, ry: -1.5, up: 2, upX: 8, low: 2, lowX: 8 }),
      open: shape({ lx: -24, ly: 2, rx: 30, ry: -10, low: 8, lowX: 12, teeth: 1 }),
      idleClosed: [
        { dur: 700, fn: (k, s) => ({ ry: -5 * bell(k) * (s > 0 ? 1 : 0), ly: -5 * bell(k) * (s < 0 ? 1 : 0) }) },
      ],
      idleOpen: [
        // đổi bên: lật khoé cao sang trái rồi về
        { dur: 1300, fn: (k) => { const b = bell(k); return { ly: -11 * b, ry: 9 * b, lowX: -24 * b } } },
        { dur: 600, fn: (k) => ({ ry: -3 * wave(k, 2), low: 2 * bell(k) }) },
      ],
    },
    cheeky: {
      label: 'Lè lưỡi',
      closed: shape({ lx: -30, rx: 30, low: 9 }),
      open: shape({ lx: -30, ly: -2, rx: 30, ry: -2, low: 11, tongue: 1 }),
      idleClosed: [
        // thè lưỡi nhanh rồi thụt
        { dur: 800, fn: (k) => ({ tongue: 0.9 * bell(k) }) },
      ],
      idleOpen: [
        // ngoe nguẩy lưỡi
        { dur: 1200, fn: (k) => ({ tx: 6 * wave(k, 4) * (1 - k * 0.4) }) },
        { dur: 900, fn: (k) => ({ tongue: -0.85 * bell(k) }) },
      ],
    },
  }

  const KEYS = Object.keys(BASE)
  const mix = (a, b, t) => {
    const o = {}
    for (const k of KEYS) o[k] = a[k] + (b[k] - a[k]) * t
    return o
  }
  const smooth = (t) => t * t * (3 - 2 * t)
  // Nhiều pha: s 0…1 chia đều cho các chặng, mỗi chặng ease mượt; khoá nào có `delay`
  // ở pha đích thì chỉ chạy trong khoảng [a, b] của chặng đó (vẽ nét trước, răng sau).
  function mixStages(stages, s) {
    const n = stages.length - 1
    const x = Math.min(n, Math.max(0, s * n))
    const i = Math.min(n - 1, Math.floor(x))
    const A = stages[i]
    const B = stages[i + 1]
    const t = x - i
    const o = {}
    for (const k of KEYS) {
      const [a, b] = B.delay?.[k] || [0, 1]
      const tk = smooth(clamp01((t - a) / Math.max(0.01, b - a)))
      // lò xo có thể lố ra ngoài 0…1: phần lố kéo dài tuyến tính cho có độ nảy
      const extra = s > 1 && i === n - 1 ? (s - 1) * n : s < 0 && i === 0 ? s * n : 0
      o[k] = A[k] + (B[k] - A[k]) * (tk + extra)
    }
    return o
  }
  function mouthPaths(m, buck) {
    const L = [m.lx, m.ly]
    const R = [m.rx, m.ry]
    const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2]
    const cu = [mid[0] + m.upX, mid[1] + 2 * m.up] // quadratic: đáy cong ở mid + up
    const cl = [mid[0] + m.lowX, mid[1] + 2 * m.low]
    const q = (P0, C, P1, t) => [
      (1 - t) ** 2 * P0[0] + 2 * t * (1 - t) * C[0] + t * t * P1[0],
      (1 - t) ** 2 * P0[1] + 2 * t * (1 - t) * C[1] + t * t * P1[1],
    ]
    const f = (v) => v.toFixed(2)
    const pt = (P) => `${f(P[0])},${f(P[1])}`
    const down = (P, h) => [P[0], P[1] + h]
    const upper = `M${pt(L)}Q${pt(cu)} ${pt(R)}`
    // môi dưới luôn vẽ khi môi trên chưa vẽ hết (nó là nét chính lúc khép / cười)
    const lower = m.upline < 0.999 || Math.abs(m.low - m.up) > 0.1 || Math.abs(m.low) > 0.05 ? `M${pt(L)}Q${pt(cl)} ${pt(R)}` : ''
    // lòng miệng — tô màu lòng mắt + làm vùng cắt cho răng
    const inside = `M${pt(L)}Q${pt(cu)} ${pt(R)}Q${pt(cl)} ${pt(L)}Z`
    // Răng gắn dưới môi trên, cắt theo lòng miệng -> chỉ lộ đúng khe hở giữa hai môi.
    // Mọi vạch ngăn bắt đầu TRÊN môi trên và dừng ĐÚNG trên mép dưới răng (nối chữ T,
    // đầu tròn chìm trong nét) -> không có đầu thừa.
    let teeth = ''
    if (m.teeth > 0.01) {
      const TOOTH = 9
      if (buck) {
        // hai răng cửa: khung chữ U chung một vạch giữa
        const [a, b, c] = [0.42, 0.5, 0.58].map((t) => q(L, cu, R, t))
        teeth = `M${pt(a)}L${pt(down(a, TOOTH))}L${pt(down(c, TOOTH))}L${pt(c)}M${pt(b)}L${pt(down(b, TOOTH))}`
      } else {
        teeth = `M${pt(down(L, TOOTH))}Q${pt(down(cu, TOOTH))} ${pt(down(R, TOOTH))}`
        for (const t of [0.3, 0.45, 0.6, 0.75]) {
          const a = q(L, cu, R, t)
          teeth += `M${pt(a)}L${pt(down(a, TOOTH))}`
        }
      }
    }
    // lưỡi: chữ U treo trên môi dưới (hai đầu nằm đúng trên nét môi) + rãnh giữa
    let tongue = ''
    const tg = clamp01(m.tongue)
    if (tg > 0.02) {
      const shift = m.tx / Math.max(1, R[0] - L[0])
      const a = q(L, cl, R, 0.36 + shift)
      const b = q(L, cl, R, 0.64 + shift)
      const c = q(L, cl, R, 0.5 + shift)
      const drop = 3 + 9 * tg
      tongue = `M${pt(a)}C${pt(down(a, drop))} ${pt(down(b, drop))} ${pt(b)}M${pt(c)}L${pt(down(c, drop * 0.55))}`
    }
    return { upper, lower, inside, teeth, tongue, L, R }
  }

  let live = null

  function mount(root = document) {
    live?.stop()
    live = null
    const scope = root.querySelector ? root : document
    const yellow = scope.querySelector('.hs-intro .chip--yellow')
    const green = scope.querySelector('.hs-intro .chip--green')
    if (!yellow && !green) return
    scope.querySelectorAll('.chip__icon').forEach((n) => n.remove())

    // sóng
    let waveEl = null
    let ysvg = null
    if (yellow) {
      const svg = svgIn(yellow, '0 -27 278 54')
      ysvg = svg
      const gid = `wgrad${Math.random().toString(36).slice(2, 7)}`
      const grad = el('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: 0, y1: 0, x2: 278, y2: 0 }, el('defs', {}, svg))
      for (const [o, c] of [[0, '#fab700'], [0.2, 'currentColor'], [0.8, 'currentColor'], [1, '#fab700']]) el('stop', { offset: o, 'stop-color': c }, grad)
      waveEl = el('path', { fill: `url(#${gid})`, d: wavePath(0) }, svg)
    }
    // miệng
    let mouth = null
    if (green) {
      const svg = svgIn(green, '-92 -27 184 54')
      const eye = window.CHANDE_EYE?.config || {}
      svg.classList.add('chip__icon--mouth')
      svg.style.setProperty('--mouth-fill', eye.sclera || '#f8e7bf')
      svg.style.setProperty('--mouth-ink', eye.pupil || '#151611')
      const g = el('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg)
      const cid = `mclip${Math.random().toString(36).slice(2, 7)}`
      mouth = {
        svgEl: svg,
        // lòng miệng tô cùng màu lòng trắng con mắt (chande-eye.js · sclera), nằm dưới nét
        inside: el('path', { fill: 'var(--mouth-fill)', stroke: 'none' }, g),
        upper: el('path', {}, g),
        lower: el('path', {}, g),
        teeth: el('path', { class: 'chip__teeth', 'clip-path': `url(#${cid})` }, g),
        tongue: el('path', {}, g),
        clip: el('path', {}, el('clipPath', { id: cid }, el('defs', {}, svg))),
        dl: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
        dr: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
      }
    }
    const preset = () => PRESETS[CONFIG.preset] || PRESETS.grin
    const drawMouth = (m) => {
      if (!mouth) return
      const P = mouthPaths(m, preset().buck)
      // môi trên vẽ dần trái -> phải (pathLength 1 + dasharray)
      const ul = clamp01(m.upline)
      mouth.upper.setAttribute('d', ul > 0.005 ? P.upper : '')
      mouth.upper.setAttribute('pathLength', '1')
      mouth.upper.setAttribute('stroke-dasharray', ul < 0.999 ? `${ul.toFixed(3)} 2` : 'none')
      mouth.lower.setAttribute('d', P.lower)
      mouth.clip.setAttribute('d', P.inside)
      mouth.inside.setAttribute('d', P.inside)
      mouth.teeth.setAttribute('d', P.teeth)
      mouth.teeth.setAttribute('stroke-opacity', clamp01(m.teeth).toFixed(3))
      mouth.tongue.setAttribute('d', P.tongue)
      const r = (3 * clamp01(m.dots)).toFixed(2)
      for (const [c, Pt] of [[mouth.dl, P.L], [mouth.dr, P.R]]) {
        c.setAttribute('cx', Pt[0].toFixed(2))
        c.setAttribute('cy', Pt[1].toFixed(2))
        c.setAttribute('r', r)
      }
    }

    if (reduced) {
      drawMouth(preset().open)
      return
    }
    drawMouth(preset().closed)

    // ---- nói / ngậm (preset có `talk`): chu kỳ ngẫu nhiên trong khoảng on / off (giây)
    let talkCycle = null
    const rnd = ([a, b]) => a + Math.random() * (b - a)
    const talkAmt = (t, cfg) => {
      if (!talkCycle || t > talkCycle.t0 + talkCycle.on + talkCycle.off) talkCycle = { t0: talkCycle && t - talkCycle.t0 < 10 ? talkCycle.t0 + talkCycle.on + talkCycle.off : t, on: rnd(cfg.on), off: rnd(cfg.off) }
      const x = t - talkCycle.t0
      if (x > talkCycle.on) return 0
      const env = smooth(clamp01(x / 0.35)) * smooth(clamp01((talkCycle.on - x) / 0.4))
      const syl = 0.35 + 0.65 * Math.abs(Math.sin(x * 5.2) * Math.sin(x * 1.7 + 1.2)) // nhịp âm tiết — chậm, từ tốn
      return env * syl
    }
    // ---- dây chun (khung vàng): chuỗi N đoạn, hai đầu cố định trong viền vàng
    const STR = { n: 24, tension: 22000, damp: 7, grab: 5, snap: 8 } // snap = kéo xa tối đa trước khi tuột (nhỏ = nảy nhẹ)
    const SX = (i) => WAVE.x0 + ((WAVE.x1 - WAVE.x0) * i) / STR.n
    const sy = new Float32Array(STR.n + 1)
    const sv = new Float32Array(STR.n + 1)
    const pull = { on: false, x: 0, y: 0, ly: null }
    const stringY = (x) => {
      const f = clamp01((x - WAVE.x0) / (WAVE.x1 - WAVE.x0)) * STR.n
      const i = Math.min(STR.n - 1, Math.floor(f))
      return sy[i] + (sy[i + 1] - sy[i]) * (f - i)
    }
    const stepString = (dt) => {
      const sub = Math.ceil(dt / 0.002) // bước nhỏ cho ổn định (tension · h² < 1)
      const h = dt / sub
      for (let k = 0; k < sub; k++) {
        for (let i = 1; i < STR.n; i++) sv[i] += (STR.tension * (sy[i - 1] - 2 * sy[i] + sy[i + 1]) - STR.damp * sv[i]) * h
        for (let i = 1; i < STR.n; i++) sy[i] += sv[i] * h
      }
      if (pull.on) {
        // bị kéo tại một điểm: dây căng thành hình tam giác qua con trỏ
        for (let i = 1; i < STR.n; i++) {
          const x = SX(i)
          const w = x < pull.x ? (x - WAVE.x0) / (pull.x - WAVE.x0) : (WAVE.x1 - x) / (WAVE.x1 - pull.x)
          const y = pull.y * w
          sv[i] = (y - sy[i]) / Math.max(dt, 1e-3)
          sy[i] = y
        }
      }
    }
    const onString = (e) => {
      if (!ysvg) return
      const r = ysvg.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 278
      const y = ((e.clientY - r.top) / r.height) * 54 - 27
      const inX = x > 4 && x < 274
      if (pull.on) {
        // kéo quá xa hoặc ra khỏi khung -> tuột, dây bật lại
        if (!inX || Math.abs(y) > STR.snap) pull.on = false
        else Object.assign(pull, { x, y })
      } else if (inX && Math.abs(y) < 27) {
        const s0 = stringY(x)
        const crossed = pull.ly != null && (pull.ly - s0) * (y - s0) < 0
        if (Math.abs(y - s0) < STR.grab || crossed) Object.assign(pull, { on: true, x, y: Math.max(-STR.snap, Math.min(STR.snap, y)) })
      }
      pull.ly = inX && Math.abs(y) < 27 ? y : null
      kick()
    }
    addEventListener('pointermove', onString, { passive: true })

    // ---- theo chuột (u, quanh tâm khung xanh)
    const FOLLOW = { x: 14, y: 5, idle: 2500, ease: 6 }
    const mouse = { dx: 0, dy: 0, t: 0, on: false, cx: -1e4, cy: -1e4 }
    const look = { x: 0, y: 0 }
    const onMove = (e) => {
      if (!green) return
      const r = green.getBoundingClientRect()
      const nx = (e.clientX - (r.left + r.width / 2)) / (innerWidth * 0.5)
      const ny = (e.clientY - (r.top + r.height / 2)) / (innerHeight * 0.5)
      mouse.dx = FOLLOW.x * Math.max(-1, Math.min(1, nx))
      mouse.dy = FOLLOW.y * Math.max(-1, Math.min(1, ny))
      mouse.t = performance.now()
      mouse.on = true
      mouse.cx = e.clientX
      mouse.cy = e.clientY
    }

    // ---- nuốt giọt (bubble): chuột lại gần -> miệng HÁ, hút giọt vào, co vừa lòng miệng
    // -> ĐỚP ngậm lại (giọt tan) -> nhai một nhịp; chuột đi xa hẳn mới trả giọt.
    const EAT = { near: 0.45, far: 0.9, open: 650, chomp: 520 } // near / far × bề ngang khung
    const EAT_OPEN = shape({ lx: -27, rx: 27, up: -11, low: 15 })
    const eat = { phase: null, t0: 0, k: 0, mouth: null }
    const eatDist = () => {
      const r = green.getBoundingClientRect()
      const ex = Math.max(0, Math.abs(mouse.cx - (r.left + r.width / 2)) - r.width / 2)
      const ey = Math.max(0, Math.abs(mouse.cy - (r.top + r.height / 2)) - r.height / 2)
      return Math.hypot(ex, ey) / r.width
    }
    const updateEat = (now) => {
      if (!mouse.on) return
      const d = eatDist()
      if (!eat.phase && d < EAT.near) Object.assign(eat, { phase: 'open', t0: now })
      else if (eat.phase && d > EAT.far) eat.phase = null
      else if (eat.phase === 'open' && now - eat.t0 > EAT.open) Object.assign(eat, { phase: 'chomp', t0: now })
      else if (eat.phase === 'chomp' && now - eat.t0 > EAT.chomp) eat.phase = 'full'
    }
    // điểm hút cho chande-bubble.js: tâm lòng miệng (px màn hình) + bán kính vừa miệng
    const lureFn = () => {
      if (!inView || !eat.phase || !eat.mouth || !mouth) return null
      const m = eat.mouth
      const r = mouth.svgEl.getBoundingClientRect()
      const sc = r.width / 184
      const cx = (m.lx + m.rx) / 2
      const cy = (m.ly + m.ry) / 2 + (m.up + m.low) / 2
      return {
        x: r.left + (cx + 92) * sc,
        y: r.top + (cy + 27) * sc,
        r: Math.max(1, ((m.low - m.up) / 2) * sc * 0.75),
        hide: eat.phase !== 'open',
      }
    }
    window.CHANDE_BUBBLE?.lure?.(lureFn)
    addEventListener('pointermove', onMove, { passive: true })

    let raf = 0
    let inView = false
    // s: 0 khép … 1 cười, chạy bằng lò xo hơi thiếu tắt dần (mở lố rồi dội).
    let s = 0
    let v = 0
    let goal = 0
    let last = 0
    let act = null // cử động nhỏ đang chạy
    const idleGap = () => (CONFIG.idleMin + Math.random() * Math.max(0, CONFIG.idleMax - CONFIG.idleMin)) * 1000
    let nextAct = performance.now() + idleGap()
    const tick = (now) => {
      raf = 0
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      if (waveEl) {
        stepString(dt)
        waveEl.setAttribute('d', wavePath(now / 1000, stringY))
      }
      if (mouth) {
        const pr = preset()
        // mở nhanh (cứng, hơi lố) — khép chậm (mềm, gần như không lố)
        const opening = goal > s
        const k = Math.max(20, CONFIG.spring) * (opening ? 1 : 0.55)
        const z = opening ? 0.55 : 0.8
        v += (k * (goal - s) - 2 * z * Math.sqrt(k) * v) * dt
        s += v * dt
        let open = s
        if (pr.talk) open = s * talkAmt(now / 1000, pr.talk)
        let m = pr.stages ? mixStages(pr.stages, s) : mix(pr.closed, pr.open, open)
        if (act) {
          const t = clamp01((now - act.t0) / act.dur)
          const d = act.fn(t, act.sgn)
          for (const key in d) m[key] += d[key]
          if (t >= 1) {
            act = null
            nextAct = now + idleGap()
          }
        } else if (now > nextAct && Math.abs(goal - s) < 0.03 && Math.abs(v) < 0.1) {
          const list = goal >= 0.5 ? pr.idleOpen : pr.idleClosed
          const pick = list[(Math.random() * list.length) | 0]
          if (pick) act = { ...pick, t0: now, sgn: Math.random() < 0.5 ? -1 : 1 }
        }
        // nuốt giọt: há (phủ dáng EAT_OPEN) -> đớp ngậm lại + nhai một nhịp
        updateEat(now)
        const want = eat.phase === 'open' ? 1 : 0
        eat.k += (want - eat.k) * (1 - Math.exp(-dt * (want ? 9 : 16)))
        if (eat.k > 0.002) m = mix(m, EAT_OPEN, eat.k)
        if (eat.phase === 'chomp') {
          const c = clamp01((now - eat.t0) / EAT.chomp)
          m.low += 5 * Math.sin(Math.PI * c) * Math.sin(Math.PI * 2 * c)
          m.lx += 2 * Math.sin(Math.PI * c)
          m.rx -= 2 * Math.sin(Math.PI * c)
        }
        // theo chuột: cả miệng lệch nhẹ về phía con trỏ; chuột đứng yên lâu thì về giữa
        const still = now - mouse.t > FOLLOW.idle
        const tx = still || !mouse.on ? 0 : mouse.dx
        const ty = still || !mouse.on ? 0 : mouse.dy
        const f = 1 - Math.exp(-dt * FOLLOW.ease)
        look.x += (tx - look.x) * f
        look.y += (ty - look.y) * f
        m.lx += look.x
        m.rx += look.x
        m.ly += look.y
        m.ry += look.y
        eat.mouth = m
        drawMouth(m)
      }
      if (inView) raf = requestAnimationFrame(tick)
      else last = 0
    }
    const kick = () => {
      if (!raf && inView) raf = requestAnimationFrame(tick)
    }
    // miệng: độ cười theo cuộn — tâm khung xanh từ 95% màn (0, khép) lên 45% màn (1,
    // cười hẳn); lò xo trong tick() làm mượt. Đổi hẳn phía (qua 0.5) thì bỏ cử động dở.
    const check = () => {
      if (!green) return
      const r = green.getBoundingClientRect()
      const c = r.top + r.height / 2
      const g = clamp01((innerHeight * 0.95 - c) / (innerHeight * 0.5))
      if (Math.abs(g - goal) < 0.001) return
      if (g >= 0.5 !== goal >= 0.5) {
        act = null
        nextAct = performance.now() + idleGap()
      }
      goal = g
      kick()
    }
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      if (inView) {
        check()
        kick()
      }
    }, { rootMargin: '100px 0px' })
    io.observe((yellow || green).closest('section') || yellow || green)
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check, { passive: true })

    live = {
      stop() {
        io.disconnect()
        removeEventListener('scroll', check)
        removeEventListener('resize', check)
        removeEventListener('pointermove', onMove)
        removeEventListener('pointermove', onString)
        window.CHANDE_BUBBLE?.lure?.(null)
        cancelAnimationFrame(raf)
      },
      // thử ngay một cử động (bảng setting)
      poke() {
        const pr = preset()
        const list = goal >= 0.5 ? pr.idleOpen : pr.idleClosed
        const pick = list[(Math.random() * list.length) | 0]
        if (pick) act = { ...pick, t0: performance.now(), sgn: Math.random() < 0.5 ? -1 : 1 }
        kick()
      },
      setGoal(g) {
        goal = g
        act = null
        kick()
      },
    }
  }

  const api = {
    config: CONFIG,
    defaults: DEFAULTS,
    PRESETS,
    mount,
    refresh() {
      mount(document)
    },
    poke: () => live?.poke(),
    preview: (g) => live?.setGoal(g),
  }
  window.CHANDE_CHIPS = api
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
