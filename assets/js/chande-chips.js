/* =============================================================================
 * CHANDE — Icon trong 2 khung bo tròn ở Intro (cùng nhóm với con mắt)
 * -----------------------------------------------------------------------------
 * • Khung VÀNG = KẾT NỐI: dải sóng tín hiệu (dựng theo Shape-01.svg — đường kẻ 256×20
 *   với 5 hạt to / nhỏ xen kẽ). Mỗi khung hình tính lại cỡ từng hạt theo một làn sóng
 *   chạy trái -> phải: hạt to co dần thành hạt nhỏ rồi phình lại, lặp liên tục.
 * • Khung XANH = CHIẾC MIỆNG (Figma frame 762 -> 763 -> 764): đường thẳng hai chấm ->
 *   mở ra cười -> nghiêng thành nụ cười toe có răng. Tâm khung qua 50% màn thì cười,
 *   cuộn ngược lên thì khép. Chuyển bằng lò xo (mở lố rồi dội). Đang trong màn thì cứ
 *   1.8–4 s có một cử động nhỏ: khép -> nhếch cười nửa chừng / giật khoé môi; cười
 *   toe -> khúc khích (đáy miệng rung) / dịu lại rồi toe lại.
 * Toạ độ theo đơn vị thiết kế (u): khung trong (inset 10/12) = 278 × 54 (vàng),
 * 184 × 54 (xanh). Màu = currentColor (kem trên nền tối, đậm trên nền kem).
 * Chỉ chạy khi Intro gần màn; giảm chuyển động thì đứng ở hình cuối.
 * ========================================================================== */
(() => {
  'use strict'

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const NS = 'http://www.w3.org/2000/svg'

  const style = document.createElement('style')
  style.textContent =
    '.chip__icon{position:absolute; left:calc(12 * var(--u)); top:calc(10 * var(--u)); width:calc(100% - 24 * var(--u)); height:calc(100% - 20 * var(--u)); z-index:1; overflow:visible; color:#0f1513; transition:color .6s ease}' +
    'html.hero-row-dark .chip__icon{color:#f4f3eb}'
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
    const sizes = WAVE.centers.map((_, i) => 0.5 + 0.5 * Math.sin((t / WAVE.period) * Math.PI * 2 - i * WAVE.phase))
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
  // Toạ độ u quanh tâm khung trong (184 × 54). Đo từ Figma (khung 208u ≈ 843px).
  const M = {
    neutral: { L: [-37.5, 0], R: [37.5, 0], d: 0 },
    smile: { L: [-37.5, 0], R: [37.5, 0], d: 14 },
    grin: { L: [-18.8, 0.5], R: [37, -7.9], d: 18.5 },
  }
  const lerp = (a, b, t) => a + (b - a) * t
  const lerp2 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)]
  // p: 0 khép · 1 mở cười · 2 cười toe (cho phép lố một chút — lò xo dội). fx: cử động
  // nhỏ chồng lên: tilt (radian, nghiêng khoé môi), dAdd (độ sâu thêm — rung cười).
  function mouthAt(p, fx = {}) {
    let L, R, d, teeth
    if (p <= 1) {
      const q = Math.max(-0.15, p)
      ;({ L, R } = M.neutral)
      d = Math.max(0, lerp(M.neutral.d, M.smile.d, q))
      teeth = 0
    } else {
      const q = Math.min(1.2, p - 1)
      L = lerp2(M.smile.L, M.grin.L, q)
      R = lerp2(M.smile.R, M.grin.R, q)
      d = lerp(M.smile.d, M.grin.d, q)
      teeth = clamp01((p - 1) * 1.6 - 0.3)
    }
    d = Math.max(0, d + (fx.dAdd || 0))
    const mid = [(L[0] + R[0]) / 2, (L[1] + R[1]) / 2]
    if (fx.tilt) {
      const c = Math.cos(fx.tilt)
      const sn = Math.sin(fx.tilt)
      const rot = (P) => [mid[0] + (P[0] - mid[0]) * c - (P[1] - mid[1]) * sn, mid[1] + (P[0] - mid[0]) * sn + (P[1] - mid[1]) * c]
      L = rot(L)
      R = rot(R)
    }
    const C = [mid[0], mid[1] + 2 * d] // đáy cong quadratic ở mid + d
    const curve = (t) => [
      (1 - t) ** 2 * L[0] + 2 * t * (1 - t) * C[0] + t * t * R[0],
      (1 - t) ** 2 * L[1] + 2 * t * (1 - t) * C[1] + t * t * R[1],
    ]
    const teethD = [0.24, 0.43, 0.62, 0.8]
      .map((t) => {
        const top = lerp2(L, R, t)
        const bt = curve(t)
        const bot = lerp2(top, bt, teeth)
        return `M${top[0].toFixed(2)},${top[1].toFixed(2)}L${bot[0].toFixed(2)},${bot[1].toFixed(2)}`
      })
      .join('')
    return { L, R, C, d, teethD, teeth }
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
    let wave = null
    if (yellow) {
      const svg = svgIn(yellow, '-11 -17 278 54') // 256 × 20 canh giữa khung 278 × 54
      wave = el('path', { fill: 'currentColor', d: wavePath(0) }, svg)
    }
    // miệng
    let mouth = null
    if (green) {
      const svg = svgIn(green, '-92 -27 184 54')
      const g = el('g', { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg)
      mouth = {
        line: el('path', {}, g),
        low: el('path', {}, g),
        teeth: el('path', {}, g),
        dl: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
        dr: el('circle', { r: 3, fill: 'currentColor', stroke: 'none' }, svg),
      }
    }
    const drawMouth = (p, fx) => {
      if (!mouth) return
      const m = mouthAt(p, fx)
      const f = (v) => v.toFixed(2)
      mouth.line.setAttribute('d', `M${f(m.L[0])},${f(m.L[1])}L${f(m.R[0])},${f(m.R[1])}`)
      mouth.low.setAttribute('d', m.d > 0.05 ? `M${f(m.L[0])},${f(m.L[1])}Q${f(m.C[0])},${f(m.C[1])} ${f(m.R[0])},${f(m.R[1])}` : '')
      mouth.teeth.setAttribute('d', m.teeth > 0.01 ? m.teethD : '')
      mouth.dl.setAttribute('cx', m.L[0])
      mouth.dl.setAttribute('cy', m.L[1])
      mouth.dr.setAttribute('cx', m.R[0])
      mouth.dr.setAttribute('cy', m.R[1])
    }

    if (reduced) {
      drawMouth(2)
      return
    }
    drawMouth(0)

    let raf = 0
    let inView = false
    // Lò xo cho tiến độ miệng p (0 khép … 2 cười toe): hơi thiếu tắt dần -> mở lố một
    // chút rồi dội về như cơ mặt. `goal` theo cuộn; `bias` = cử động ngẫu nhiên chồng
    // lên (nhếch cười nửa chừng / dịu lại), tilt + rung (dAdd) là lớp riêng.
    let p = 0
    let v = 0
    let goal = 0
    let bias = 0
    let last = 0
    const fx = { tilt: 0, dAdd: 0 }
    let act = null // cử động đang chạy { t0, dur, run(k) }
    let nextAct = performance.now() + 1500 + Math.random() * 1500
    const ACTS = {
      // đang khép: nhếch cười nửa chừng rồi khép
      peek: { dur: 900, run: (k) => (bias = 0.55 * Math.sin(Math.PI * k)) },
      // đang khép: khoé môi giật lệch một bên
      twitch: { dur: 650, run: (k, sgn) => (fx.tilt = sgn * 0.12 * Math.sin(Math.PI * k) * (1 - 0.35 * Math.sin(3 * Math.PI * k))) },
      // đang cười toe: khúc khích — đáy miệng rung 3 nhịp, nhỏ dần
      chuckle: { dur: 800, run: (k) => (fx.dAdd = 3.2 * Math.sin(k * Math.PI * 6) * (1 - k)) },
      // đang cười toe: dịu thành nụ cười nhẹ rồi toe lại
      relax: { dur: 1200, run: (k) => (bias = -0.8 * Math.sin(Math.PI * k)) },
    }
    const pickAct = (now) => {
      const names = goal === 0 ? ['peek', 'twitch', 'peek'] : ['chuckle', 'relax', 'chuckle']
      const name = names[(Math.random() * names.length) | 0]
      act = { ...ACTS[name], t0: now, sgn: Math.random() < 0.5 ? -1 : 1 }
    }
    const tick = (now) => {
      raf = 0
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60)
      last = now
      if (wave) wave.setAttribute('d', wavePath(now / 1000))
      if (mouth) {
        // cử động ngẫu nhiên (chỉ khi lò xo đã gần đứng)
        if (act) {
          const k = clamp01((now - act.t0) / act.dur)
          act.run(k, act.sgn)
          if (k >= 1) {
            act = null
            bias = 0
            fx.tilt = 0
            fx.dAdd = 0
            nextAct = now + 1800 + Math.random() * 2200
          }
        } else if (now > nextAct && Math.abs(p - goal) < 0.05 && Math.abs(v) < 0.2) pickAct(now)
        const target = goal + bias
        const acc = 170 * (target - p) - 15 * v
        v += acc * dt
        p += v * dt
        drawMouth(p, fx)
      }
      if (inView) raf = requestAnimationFrame(tick)
      else last = 0
    }
    const kick = () => {
      if (!raf && inView) raf = requestAnimationFrame(tick)
    }
    // miệng: tâm khung xanh qua nửa màn -> cười; lùi lên trên nửa màn -> khép
    const check = () => {
      if (!green) return
      const r = green.getBoundingClientRect()
      const g = r.top + r.height / 2 < innerHeight * 0.5 ? 2 : 0
      if (g !== goal) {
        goal = g
        act = null
        bias = 0
        fx.tilt = 0
        fx.dAdd = 0
        nextAct = performance.now() + 1800 + Math.random() * 1500
        kick()
      }
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
    }
  }

  window.CHANDE_CHIPS = { mount }
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
