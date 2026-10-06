/* =============================================================================
 * CHANDE — Con trỏ nhân vật (Figma node 513:34052)
 * -----------------------------------------------------------------------------
 * Nhân vật chạy theo chuột, trễ một nhịp (lerp) và nghiêng theo hướng đi.
 * Con trỏ thật của hệ điều hành vẫn giữ nguyên — nhân vật là bạn đồng hành, không
 * thay thế nó, nên bấm link vẫn chính xác. Trỏ vào link / nút thì nhân vật phóng
 * to một chút.
 *
 * Chỉ bật với chuột thật (pointer: fine) và khi không reduced-motion. Mỗi khung
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
    src: 'assets/img/cursor-mascot.webp',
  }
  const DEFAULTS = structuredClone(CONFIG)

  const fine = matchMedia('(pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  if (!fine.matches || reduced.matches) {
    window.CHANDE_CURSOR = { config: CONFIG, defaults: DEFAULTS, refresh() {} }
    return
  }

  const el = document.createElement('img')
  el.src = CONFIG.src
  el.alt = ''
  el.setAttribute('aria-hidden', 'true')
  el.className = 'cmascot'
  const style = document.createElement('style')
  style.textContent = `
.cmascot{position:fixed; left:0; top:0; z-index:9997; pointer-events:none; user-select:none;
  width:var(--cm-size); height:auto; opacity:0; transition:opacity .25s ease;
  will-change:transform}
.cmascot.is-on{opacity:1}`
  document.head.appendChild(style)
  document.body.appendChild(el)

  const pos = { x: innerWidth / 2, y: innerHeight / 2 }
  const target = { ...pos }
  let scale = 1
  let raf = 0

  function refresh() {
    el.style.setProperty('--cm-size', `${CONFIG.size}px`)
    el.style.display = CONFIG.enabled ? '' : 'none'
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
    el.style.transform =
      `translate3d(${pos.x + CONFIG.offsetX}px, ${pos.y + CONFIG.offsetY}px, 0) rotate(${rot}deg) scale(${scale})`
    if (Math.abs(dx) + Math.abs(dy) > 0.3 || Math.abs(wantScale - scale) > 0.01) raf = requestAnimationFrame(frame)
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
