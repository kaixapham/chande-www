/* =============================================================================
 * CHANDE — Icon trong 2 khung bo tròn ở Intro (cùng nhóm với con mắt)
 * -----------------------------------------------------------------------------
 * • Khung VÀNG = KẾT NỐI: dải sóng tín hiệu (dựng theo Shape-01.svg — đường kẻ 256×20
 *   với 5 hạt to / nhỏ xen kẽ). Mỗi khung hình tính lại cỡ từng hạt theo một làn sóng
 *   chạy trái -> phải: hạt to co dần thành hạt nhỏ rồi phình lại, lặp liên tục.
 * • Khung XANH = CHIẾC MIỆNG — 6 PRESET (CONFIG.preset, bảng H tab "Miệng (Intro)").
 *   Mỗi preset có dáng KHÉP và dáng CƯỜI; độ cười chạy LIÊN TỤC THEO CUỘN (khung từ
 *   đáy màn lên quá giữa màn: 0 -> 1), qua lò xo cho mượt (mở lố rồi dội), cộng các cử
 *   động nhỏ ngẫu nhiên mỗi idleMin–idleMax s. Preset `hs` (kiểu poster Headspace): nét
 *   dày đầu tròn + dải viền nhạt to quanh môi; há miệng thì lòng tô đặc, lưỡi cam, răng.
 *   Một cái miệng = 2 khoé (L, R) + môi trên / môi dưới là 2 đường cong quadratic giữa
 *   hai khoé (up / low = độ cong, âm = cong lên) + lấp lòng miệng (fill) + răng + lưỡi.
 * Toạ độ theo đơn vị thiết kế (u): khung trong (inset 10/12) = 278 × 54 (vàng),
 * 184 × 54 (xanh). Màu = currentColor (kem trên nền tối, đậm trên nền kem).
 * Chỉ chạy khi Intro gần màn; giảm chuyển động thì đứng ở hình cuối.
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    preset: 'swoosh', // swoosh · gape · buck (kiểu Headspace) · grin · talk · laugh · whistle · smirk · cheeky
    idleMin: 1.8, // giây — khoảng nghỉ giữa hai cử động nhỏ
    idleMax: 4,
    spring: 170, // độ cứng lò xo khi khép <-> cười
    waveSpeed: 1.7, // giây cho một vòng sóng (khung vàng)
  }
  window.CHANDE_SETTINGS_APPLY?.('chips', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const NS = 'http://www.w3.org/2000/svg'

  const style = document.createElement('style')
  style.textContent =
    '.chip__icon{position:absolute; left:calc(12 * var(--u)); top:calc(10 * var(--u)); width:calc(100% - 24 * var(--u)); height:calc(100% - 20 * var(--u)); z-index:1; overflow:visible; color:#0f1513; transition:color .6s ease}' +
    'html.hero-row-dark .chip__icon{color:#f4f3eb}' +
    // lòng miệng (kiểu Headspace): nền kem -> đậm như nét; nền tối -> đen hẳn cho nổi dải viền
    '.chip__mouth-in{fill:#0f1513} html.hero-row-dark .chip__mouth-in{fill:#000}'
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
  // Hệ toạ độ = Shape-01.svg (0…256 × 0…20, đường giữa y = 10), canh giữa khung 278 × 54.
  const WAVE = { centers: [40, 84, 128, 172, 216], line: 1, period: 1.7, phase: 0.95 }
  function wavePath(t) {
    const period = Math.max(0.3, CONFIG.waveSpeed || WAVE.period)
    const sizes = WAVE.centers.map((_, i) => 0.5 + 0.5 * Math.sin((t / period) * Math.PI * 2 - i * WAVE.phase))
    const half = (x) => {
      let h = WAVE.line
      WAVE.centers.forEach((c, i) => {
        const s = sizes[i]
        const H = 5 + 5 * s // nửa cao: hạt nhỏ 5 … hạt to 10
        const W = 11.7 + 9.3 * s // nửa rộng: 11.7 … 21
        const u = (x - c) / W
        if (Math.abs(u) < 1) h = Math.max(h, WAVE.line + (H - WAVE.line) * Math.cos((u * Math.PI) / 2) ** 2)
      })
      return h
    }
    const top = []
    const bot = []
    for (let x = 0; x <= 256; x += 2) {
      const h = half(x)
      top.push(`${x},${(10 - h).toFixed(2)}`)
      bot.push(`${x},${(10 + h).toFixed(2)}`)
    }
    return `M${top.join('L')}L${bot.reverse().join('L')}Z`
  }

  /* ------------------------------------------------------------ miệng (xanh) */
  // Toạ độ u quanh tâm khung trong (184 × 54, tâm 0,0). Một dáng miệng:
  //   lx ly rx ry  khoé trái / phải · up / low  độ cong môi trên / dưới (đáy cong cách
  //   đường nối hai khoé đúng giá trị này; âm = cong lên) · upX / lowX  lệch đỉnh cong
  //   sang ngang · fill  lấp lòng miệng (0…1) · teeth  răng (0…1) · tongue  lưỡi (0…1)
  //   · tx  lệch lưỡi ngang · dots  chấm ở hai khoé (0…1).
  // upline: phần môi trên được vẽ (0…1, vẽ dần trái -> phải); 0 = chỉ còn môi dưới làm nét
  // chính (một nét duy nhất cong dần như Figma 762 -> 763).
  const BASE = { lx: -30, ly: 0, rx: 30, ry: 0, up: 0, low: 0, upX: 0, lowX: 0, fill: 0, teeth: 0, tongue: 0, tx: 0, dots: 1, upline: 1, teethGap: 0 }
  const shape = (o) => ({ ...BASE, ...o })
  const wave = (k, n = 1) => Math.sin(Math.PI * k * n)
  const bell = (k) => Math.sin(Math.PI * k)

  // Preset: closed / open = dáng; idleClosed / idleOpen = cử động nhỏ (hàm k 0…1, sgn ±1
  // -> phần CỘNG THÊM vào dáng), dur = thời lượng (ms).
  const PRESETS = {
    // --- kiểu Headspace (nét dày + dải viền nhạt) ---
    swoosh: {
      label: 'Vệt cười (Headspace)',
      hs: true,
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, low: 3, lowX: -26 }),
      open: shape({ lx: -64, ly: 5, rx: 64, ry: -16, low: 13, lowX: -20 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ low: 4 * bell(k), ry: -4 * bell(k) }) }],
      idleOpen: [
        { dur: 1000, fn: (k) => ({ lx: -4 * bell(k), rx: 4 * bell(k), low: 3.5 * bell(k) }) },
        { dur: 700, fn: (k) => ({ low: 3 * wave(k, 4) * (1 - k) }) },
      ],
    },
    gape: {
      label: 'Há miệng (Headspace)',
      hs: true,
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, low: 3, lowX: -26 }),
      open: shape({ lx: -56, ly: 6, rx: 60, ry: -16, up: -4, upX: 10, low: 22, lowX: -6, fill: 1, tongue: 1 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ low: 4 * bell(k) }) }],
      idleOpen: [
        { dur: 1400, fn: (k) => { const a = Math.abs(Math.sin(k * 21) * Math.sin(k * 6.7)); return { low: -10 * (1 - a), up: 3 * (1 - a) } } },
        { dur: 800, fn: (k) => ({ tx: 7 * wave(k, 3) }) },
      ],
    },
    buck: {
      label: 'Răng thỏ (Headspace)',
      hs: true,
      closed: shape({ lx: -64, ly: 9, rx: 62, ry: -11, low: 3, lowX: -26 }),
      open: shape({ lx: -64, ly: 4, rx: 62, ry: -14, up: 1, low: 17, lowX: -10, fill: 1, teeth: 1 }),
      idleClosed: [{ dur: 900, fn: (k) => ({ low: 4 * bell(k) }) }],
      idleOpen: [
        // nhai nhai
        { dur: 1000, fn: (k) => ({ low: -6 * Math.abs(wave(k, 3)) }) },
        { dur: 900, fn: (k) => ({ lx: -4 * bell(k), rx: 4 * bell(k) }) },
      ],
    },
    // --- kiểu nét mảnh ---
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
        Object.assign(shape({ lx: -18.8, ly: 0.5, rx: 37, ry: -7.9, up: 0, low: 18.5, teeth: 1, teethGap: 1 }), {
          delay: { rx: [0, 0.6], ry: [0, 0.6], lx: [0.1, 0.75], ly: [0.1, 0.75], up: [0.22, 0.95], low: [0.12, 1], teeth: [0.2, 0.5] },
        }),
      ],
      open: shape({ lx: -18.8, ly: 0.5, rx: 37, ry: -7.9, low: 18.5, teeth: 1, teethGap: 1 }),
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
      closed: shape({ lx: -22, rx: 22, low: 4 }),
      open: shape({ lx: -16, rx: 16, up: -6, low: 12, fill: 0.15 }),
      idleClosed: [
        // lẩm bẩm: hé mở 2 nhịp nhỏ
        { dur: 900, fn: (k) => ({ up: -2.5 * Math.abs(wave(k, 2)), low: 3 * Math.abs(wave(k, 2)) }) },
      ],
      idleOpen: [
        // lép bép: nhịp mở / khép không đều như âm tiết
        { dur: 1600, fn: (k) => { const a = Math.abs(Math.sin(k * 23) * Math.sin(k * 7.3)); return { up: 4 * (1 - a), low: -9 * (1 - a), lx: 3 * a, rx: -3 * a } } },
        { dur: 900, fn: (k) => ({ lx: -6 * bell(k), rx: 6 * bell(k), up: 4 * bell(k), low: -6 * bell(k) }) },
      ],
    },
    laugh: {
      label: 'Cười haha',
      closed: shape({ lx: -30, rx: 30, low: 8 }),
      open: shape({ lx: -32, ly: -3, rx: 32, ry: -3, up: -1, low: 20, fill: 0.18, teeth: 0.6, tongue: 0.7 }),
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
      closed: shape({ lx: -14, rx: 14, low: 1.5 }),
      open: shape({ lx: -7, rx: 7, up: -7.5, low: 7.5, fill: 0.12, dots: 0.6 }),
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
      closed: shape({ lx: -26, ly: 1, rx: 26, ry: -1.5, low: 2, lowX: 8 }),
      open: shape({ lx: -24, ly: 2, rx: 30, ry: -10, low: 8, lowX: 12, teeth: 0.3 }),
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
      open: shape({ lx: -30, ly: -2, rx: 30, ry: -2, low: 11, fill: 0.1, tongue: 1 }),
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
  function mouthPaths(m) {
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
    const upper = `M${pt(L)}Q${pt(cu)} ${pt(R)}`
    // môi dưới luôn vẽ khi môi trên chưa vẽ hết (nó là nét chính lúc khép / cười)
    const lower = m.upline < 0.999 || Math.abs(m.low - m.up) > 0.1 || Math.abs(m.low) > 0.05 ? `M${pt(L)}Q${pt(cl)} ${pt(R)}` : ''
    const fill = `M${pt(L)}Q${pt(cu)} ${pt(R)}Q${pt(cl)} ${pt(L)}Z`
    let teeth = ''
    const tk = clamp01(m.teeth)
    // teethGap: HÀNG RĂNG TRÊN gắn dưới môi trên (vạch ngăn + mép dưới răng, cao TOOTH),
    // cắt theo lòng miệng (clip) -> chỉ lộ đúng phần khe hở giữa hai môi.
    if (tk > 0.01 && m.teethGap > 0.5) {
      const TOOTH = 9
      const cu2 = [cu[0], cu[1] + TOOTH]
      const L2 = [L[0], L[1] + TOOTH]
      const R2 = [R[0], R[1] + TOOTH]
      teeth += `M${pt(L2)}Q${pt(cu2)} ${pt(R2)}`
      for (const t of [0.3, 0.45, 0.6, 0.75]) {
        const a = q(L, cu, R, t)
        teeth += `M${pt(a)}L${pt([a[0], a[1] + TOOTH + 2])}`
      }
    } else if (tk > 0.01)
      [0.24, 0.43, 0.62, 0.8].forEach((t, i) => {
        const g = smooth(clamp01((tk - i * 0.16) / 0.52))
        if (g <= 0.01) return
        const a = q(L, cu, R, t)
        const b = q(L, cl, R, t)
        teeth += `M${pt(a)}L${pt([a[0] + (b[0] - a[0]) * g, a[1] + (b[1] - a[1]) * g])}`
      })
    let tongue = ''
    const tg = clamp01(m.tongue)
    if (tg > 0.02) {
      const a = q(L, cl, R, 0.36)
      const b = q(L, cl, R, 0.64)
      const w = (b[0] - a[0]) / 2
      const cx = (a[0] + b[0]) / 2 + m.tx
      const cy = (a[1] + b[1]) / 2
      const drop = 3 + 9 * tg
      tongue = `M${f(cx - w)},${f(cy - 1)}C${f(cx - w)},${f(cy + drop)} ${f(cx + w)},${f(cy + drop)} ${f(cx + w)},${f(cy - 1)}M${f(cx)},${f(cy)}L${f(cx)},${f(cy + drop * 0.55)}`
    }
    return { upper, lower, fill, teeth, tongue, L, R }
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
    if (yellow) {
      const svg = svgIn(yellow, '-11 -17 278 54') // 256 × 20 canh giữa khung 278 × 54
      waveEl = el('path', { fill: 'currentColor', d: wavePath(0) }, svg)
    }
    // miệng
    let mouth = null
    if (green) {
      const svg = svgIn(green, '-92 -27 184 54')
      const g = el('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg)
      // lớp kiểu Headspace: dải viền nhạt (to) · lòng miệng · lưỡi + răng (cắt theo lòng) · nét
      const hs = el('g', { 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg)
      const cid = `mclip${Math.random().toString(36).slice(2, 7)}`
      const clip = el('clipPath', { id: cid }, el('defs', {}, hs))
      const clipPath = el('path', {}, clip)
      mouth = {
        hs,
        hsBand: el('path', { fill: 'currentColor', 'fill-opacity': 0.38, stroke: 'currentColor', 'stroke-opacity': 0.38, 'stroke-width': 15 }, hs),
        hsIn: el('path', { class: 'chip__mouth-in', stroke: 'none' }, hs),
        hsTongue: el('path', { fill: '#ff6a3d', stroke: 'none', 'clip-path': `url(#${cid})` }, hs),
        hsTeeth: el('path', { fill: '#fffef8', stroke: 'none', 'clip-path': `url(#${cid})` }, hs),
        hsLine: el('path', { fill: 'none', stroke: 'currentColor', 'stroke-width': 6.5 }, hs),
        clipPath,
        thin: [],
        fill: el('path', { fill: 'currentColor', stroke: 'none' }, g),
        upper: el('path', {}, g),
        lower: el('path', {}, g),
        teeth: el('path', {}, g),
        tongue: el('path', {}, g),
        teethClip: el('path', {}, el('clipPath', { id: `${cid}t` }, el('defs', {}, svg))),
        dl: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
        dr: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
      }
    }
    const preset = () => PRESETS[CONFIG.preset] || PRESETS.grin
    const drawHs = (m) => {
      const P = mouthPaths(m)
      const open = clamp01(m.fill)
      // khép: một vệt (môi dưới); há: hình kín (môi trên + môi dưới)
      const line = open > 0.02 ? P.fill : P.lower || P.upper
      mouth.hsBand.setAttribute('d', line)
      mouth.hsBand.setAttribute('fill-opacity', (0.38 * open).toFixed(3))
      mouth.hsIn.setAttribute('d', open > 0.02 ? P.fill : '')
      mouth.hsIn.setAttribute('fill-opacity', open.toFixed(3))
      mouth.clipPath.setAttribute('d', P.fill)
      // lưỡi: khối tròn ở góc dưới bên phải lòng miệng
      const tg = clamp01(m.tongue) * open
      if (tg > 0.02) {
        // tâm lưỡi trên môi dưới ở 62% bề ngang (lệch phải như poster), nhích lên trong lòng
        const mx = (m.lx + m.rx) / 2
        const my = (m.ly + m.ry) / 2
        const clx = mx + m.lowX
        const cly = my + 2 * m.low
        const t = 0.62
        const bx = (1 - t) ** 2 * m.lx + 2 * t * (1 - t) * clx + t * t * m.rx
        const by = (1 - t) ** 2 * m.ly + 2 * t * (1 - t) * cly + t * t * m.ry
        const r = 11 + 9 * tg
        const cx = bx + m.tx
        const cy = by + r * 0.35 // tâm dưới môi dưới -> chỉ lộ phần trên, như lưỡi thè từ đáy
        mouth.hsTongue.setAttribute('d', `M${(cx - r).toFixed(2)},${cy.toFixed(2)}a${r},${r} 0 1,0 ${(2 * r).toFixed(2)},0a${r},${r} 0 1,0 ${(-2 * r).toFixed(2)},0Z`)
      } else mouth.hsTongue.setAttribute('d', '')
      // răng: hai khối bo tròn treo dưới môi trên, gần giữa
      const tk = clamp01(m.teeth) * open
      if (tk > 0.02) {
        const mx = (m.lx + m.rx) / 2 + 4
        const my = (m.ly + m.ry) / 2 + m.up - 1
        const w = 9
        const h = 5 + 8 * tk
        let d = ''
        for (const x of [mx - w - 0.6, mx + 0.6]) d += `M${x.toFixed(2)},${(my - 3).toFixed(2)}h${w}v${(h + 3 - 2.5).toFixed(2)}q0,2.5 -2.5,2.5h-${w - 5}q-2.5,0 -2.5,-2.5Z`
        mouth.hsTeeth.setAttribute('d', d)
      } else mouth.hsTeeth.setAttribute('d', '')
      mouth.hsLine.setAttribute('d', open > 0.02 ? '' : line)
      mouth.hsLine.setAttribute('stroke-opacity', (1 - open).toFixed(3))
    }
    const drawMouth = (m) => {
      if (!mouth) return
      const isHs = !!preset().hs
      mouth.hs.style.display = isHs ? '' : 'none'
      for (const n of [mouth.fill, mouth.upper, mouth.lower, mouth.teeth, mouth.tongue, mouth.dl, mouth.dr]) n.style.display = isHs ? 'none' : ''
      if (isHs) return drawHs(m)
      const P = mouthPaths(m)
      // môi trên vẽ dần trái -> phải (pathLength 1 + dasharray)
      const ul = clamp01(m.upline)
      mouth.upper.setAttribute('d', ul > 0.005 ? P.upper : '')
      mouth.upper.setAttribute('pathLength', '1')
      mouth.upper.setAttribute('stroke-dasharray', ul < 0.999 ? `${ul.toFixed(3)} 2` : 'none')
      mouth.lower.setAttribute('d', P.lower)
      mouth.fill.setAttribute('d', P.fill)
      mouth.fill.setAttribute('fill-opacity', clamp01(m.fill).toFixed(3))
      mouth.teeth.setAttribute('d', P.teeth)
      mouth.teethClip.setAttribute('d', P.fill)
      if (m.teethGap > 0.5) mouth.teeth.setAttribute('clip-path', `url(#${cid}t)`)
      else mouth.teeth.removeAttribute('clip-path')
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
      if (waveEl) waveEl.setAttribute('d', wavePath(now / 1000))
      if (mouth) {
        const pr = preset()
        // mở nhanh (cứng, hơi lố) — khép chậm (mềm, gần như không lố)
        const opening = goal > s
        const k = Math.max(20, CONFIG.spring) * (opening ? 1 : 0.55)
        const z = opening ? 0.55 : 0.8
        v += (k * (goal - s) - 2 * z * Math.sqrt(k) * v) * dt
        s += v * dt
        let m = pr.stages ? mixStages(pr.stages, s) : mix(pr.closed, pr.open, s)
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
