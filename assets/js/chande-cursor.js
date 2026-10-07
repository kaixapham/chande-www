/* =============================================================================
 * CHANDE — Con trỏ nhân vật (Figma node 513:34052)
 * -----------------------------------------------------------------------------
 * Nhân vật chạy theo chuột, trễ một nhịp (lerp) và nghiêng theo hướng đi.
 * Con trỏ thật vẫn là con trỏ của trình duyệt (bấm link chính xác, không trễ)
 * nhưng đổi HÌNH sang kiểu Figma: mũi tên tam giác không đuôi, bo góc, nền
 * `arrowColor` viền `arrowStroke` — bằng CSS cursor: url(svg). Ô gõ chữ vẫn
 * là con trỏ chữ I. Trỏ vào link / nút thì nhân vật phóng to một chút.
 *
 * Không chồng lên Bubble (chande-bubble.js): nhân vật là một hình tròn, mỗi khung
 * bị đẩy ra khỏi mọi cầu của giọt (đầu + vệt đuôi) cộng thêm khoảng hở `gap` —
 * giọt to cỡ nào nhân vật cũng nằm ngoài, đi nhanh thì bị vệt đuôi hất ra.
 *
 * Nhân vật chỉ bật với chuột thật (pointer: fine) và khi không reduced-motion
 * (con trỏ Figma thì chỉ cần chuột thật). Mỗi khung
 * chỉ ghi một transform lên một phần tử; đứng yên đủ gần thì tự dừng rAF.
 *
 * API: window.CHANDE_CURSOR = { config, defaults, refresh() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    size: 120, // px
    lerp: 0.16, // 0..1 — càng nhỏ càng trễ
    offsetX: 18, // px — lệch khỏi đầu con trỏ để không che chỗ bấm
    offsetY: 18,
    tilt: 0.6, // độ nghiêng theo vận tốc
    hoverScale: 1.25,
    avoidBubble: true, // né giọt bubble
    gap: 6, // px — khoảng hở tối thiểu giữa nhân vật và mép giọt
    body: 0.38, // bán kính "thân" nhân vật để va chạm, theo tỉ lệ size
    src: 'assets/img/cursor-mascot.webp',
    figma: true, // con trỏ hình mũi tên kiểu Figma
    arrowColor: '#000000',
    arrowStroke: '#ffffff',
    arrowSize: 24, // px
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('cursor', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)

  const fine = matchMedia('(pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  /* ---------------------------------------------- con trỏ mũi tên Figma ---- */
  // Mũi tên đầu nhọn ở (3, 3) của viewBox 24 — cũng là điểm bấm (hotspot).
  const ARROW =
    'M3.6 2.9C3.2 2.7 2.7 3.2 2.9 3.6L9.3 20.3C9.5 20.9 10.4 20.9 10.6 20.3L12.9 13.5' +
    'C13 13.2 13.2 13 13.5 12.9L20.3 10.6C20.9 10.4 20.9 9.5 20.3 9.3Z'
  const arrowStyle = document.createElement('style')
  function arrowCss() {
    if (!CONFIG.figma || !fine.matches) return ''
    const n = Math.round(CONFIG.arrowSize)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}" viewBox="0 0 24 24">` +
      `<path d="${ARROW}" transform="translate(.6 .9)" fill="rgba(0,0,0,.25)"/>` + // bóng đổ mềm
      `<path d="${ARROW}" fill="${CONFIG.arrowColor}" stroke="${CONFIG.arrowStroke}" stroke-width="1.5" stroke-linejoin="round"/></svg>`
    const hot = Math.round((3 * n) / 24)
    const url = `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hot} ${hot}, auto`
    // !important để thắng các cursor:pointer rải rác trong CSS của trang.
    return (
      `html, html *{cursor:${url} !important}` +
      `html :is(textarea, [contenteditable=""], [contenteditable=true],` +
      ` input:not([type=range], [type=checkbox], [type=radio], [type=color], [type=button], [type=submit], [type=file])){cursor:text !important}`
    )
  }
  arrowStyle.textContent = arrowCss()
  document.head.appendChild(arrowStyle)

  if (!fine.matches || reduced.matches) {
    window.CHANDE_CURSOR = {
      config: CONFIG,
      defaults: DEFAULTS,
      refresh() {
        arrowStyle.textContent = arrowCss()
      },
    }
    return
  }

  const el = document.createElement('img')
  el.src = CONFIG.src
  el.alt = ''
  el.setAttribute('aria-hidden', 'true')
  el.className = 'cmascot'
  const style = document.createElement('style')
  style.textContent = `
.cmascot{position:fixed; left:0; top:0; z-index:10001; pointer-events:none; user-select:none;
  width:var(--cm-size); height:auto; opacity:0; transition:opacity .25s ease;
  will-change:transform}
.cmascot.is-on{opacity:1}
html.cl-loading .cmascot{visibility:hidden}`
  document.head.appendChild(style)
  document.body.appendChild(el)

  const pos = { x: innerWidth / 2, y: innerHeight / 2 }
  const target = { ...pos }
  // Lượng bị giọt đẩy ra (px), cộng vào vị trí vẽ. Giữ riêng để lerp vẫn bám
  // chuột còn phần né thì mượt.
  const push = { x: 0, y: 0 }
  let scale = 1
  let raf = 0

  // Đẩy tâm (cx, cy) bán kính r ra khỏi các cầu của giọt. Trả về true nếu có
  // chạm (để rAF chạy tiếp tới khi tách hẳn).
  function avoid(cx, cy, r) {
    const b = window.CHANDE_BUBBLE?.state
    let wantX = 0
    let wantY = 0
    if (CONFIG.avoidBubble && b && b.presence > 0.02 && b.size > 0) {
      const c = b.count
      let x = cx
      let y = cy
      // vài vòng lặp để thoát cả khi bị kẹp giữa đầu và đuôi
      for (let it = 0; it < 3; it++) {
        let moved = false
        for (let i = 0; i < c; i++) {
          const sx = i === 0 ? b.x : b.trailX[i]
          const sy = i === 0 ? b.y : b.trailY[i]
          const R = (b.size * (c - i) / c + b.swell) * b.presence + r + CONFIG.gap
          let dx = x - sx
          let dy = y - sy
          const d = Math.hypot(dx, dy)
          if (d >= R) continue
          if (d < 0.001) {
            dx = 1
            dy = 1
          }
          const k = R / Math.max(d, 0.001)
          x = sx + dx * (d < 0.001 ? R / Math.SQRT2 : k)
          y = sy + dy * (d < 0.001 ? R / Math.SQRT2 : k)
          moved = true
        }
        if (!moved) break
      }
      wantX = x - cx
      wantY = y - cy
    }
    // ra nhanh (không để lọt vào trong giọt), về chậm (không giật khi giọt co lại)
    const out = wantX * wantX + wantY * wantY > push.x * push.x + push.y * push.y
    const k = out ? 0.6 : 0.15
    push.x += (wantX - push.x) * k
    push.y += (wantY - push.y) * k
    return Math.abs(wantX - push.x) + Math.abs(wantY - push.y) > 0.3 || !!b?.moving
  }

  function refresh() {
    arrowStyle.textContent = arrowCss()
    el.style.setProperty('--cm-size', `${CONFIG.size}px`)
    el.style.display = CONFIG.enabled ? '' : 'none'
    kick()
  }

  function frame() {
    raf = 0
    const dx = target.x - pos.x
    const dy = target.y - pos.y
    pos.x += dx * CONFIG.lerp
    pos.y += dy * CONFIG.lerp
    const wantScale = hovering ? CONFIG.hoverScale : 1
    scale += (wantScale - scale) * 0.2
    const rot = Math.max(-25, Math.min(25, dx * CONFIG.tilt * 0.2))
    const half = CONFIG.size / 2
    const x = pos.x + CONFIG.offsetX
    const y = pos.y + CONFIG.offsetY
    const busy = avoid(x + half, y + half, CONFIG.size * CONFIG.body * scale)
    el.style.transform =
      `translate3d(${x + push.x}px, ${y + push.y}px, 0) rotate(${rot}deg) scale(${scale})`
    if (busy || Math.abs(dx) + Math.abs(dy) > 0.3 || Math.abs(wantScale - scale) > 0.01) raf = requestAnimationFrame(frame)
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  let hovering = false
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      target.x = e.clientX
      target.y = e.clientY
      hovering = !!e.target.closest?.('a, button, [role=tab], label, input, select')
      el.classList.add('is-on')
      kick()
    },
    { passive: true },
  )
  document.addEventListener('pointerleave', () => el.classList.remove('is-on'))
  addEventListener('blur', () => el.classList.remove('is-on'))

  refresh()
  window.CHANDE_CURSOR = { config: CONFIG, defaults: DEFAULTS, refresh }
})()
