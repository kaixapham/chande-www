/* =============================================================================
 * CHANDE — 3 vòng tròn ở About: nhìn qua bubble thấy ảnh khác, loang lổ
 * -----------------------------------------------------------------------------
 * Bubble vẫn đi theo chuột như thường (KHÔNG hút, không bắt đứng yên). Lại gần
 * vòng tròn thì bubble phình to hơn lõi một chút. Trong lõi mỗi vòng có ảnh .peek
 * nằm sẵn nhưng bị che bởi mask: mask là một vệt tròn mép loang (SVG nhiễu trong
 * home.css) đặt đúng chỗ + đúng cỡ bubble mỗi khung — bubble đè lên lõi tới đâu
 * thì lộ ảnh tới đó, chỉ đưa mép bubble vào cũng thấy một phần ảnh.
 *
 * API: window.CHANDE_CIRCLES = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    grow: 1.6, // bubble phình khi chuột cách tâm lõi < grow × bán kính lõi
    size: 1.12, // bán kính bubble lúc phình = size × bán kính lõi
    reveal: 1.1, // vệt lộ ảnh rộng bằng reveal × bán kính bubble
  }
  window.CHANDE_SETTINGS_APPLY?.('circles', CONFIG)
  const api = { config: CONFIG, mount() {}, destroy() {} }
  window.CHANDE_CIRCLES = api
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let live = null

  function mount(root = document) {
    destroy()
    const scope = root.querySelector ? root : document
    const circles = [...scope.querySelectorAll('.hs-about .circle')]
      .map((c) => ({ c, core: c.querySelector('.core') || c, peek: c.querySelector('.peek') }))
      .filter((o) => o.peek)
    if (!circles.length) return
    const ptr = { x: -1e4, y: -1e4 }
    const onMove = (e) => {
      ptr.x = e.clientX
      ptr.y = e.clientY
    }
    addEventListener('pointermove', onMove, { passive: true })

    // gần lõi vòng nào thì bubble phình bằng lõi đó (chỉ đổi cỡ, vẫn bám chuột)
    let near = null
    const lureFn = () => (near ? { r: near } : null)
    window.CHANDE_BUBBLE?.lure?.(lureFn, 'circles')

    let raf = 0
    let inView = false
    const tick = () => {
      raf = 0
      const B = window.CHANDE_BUBBLE?.state
      const R = B ? (B.size + B.swell) * B.presence * CONFIG.reveal : 0
      near = null
      for (const o of circles) {
        const k = o.core.getBoundingClientRect()
        const kr = k.width / 2
        if (Math.hypot(ptr.x - (k.left + kr), ptr.y - (k.top + kr)) < kr * CONFIG.grow) near = kr * CONFIG.size
        const p = o.peek.getBoundingClientRect()
        if (R < 1 || !B) {
          o.peek.style.setProperty('--ms', '0px')
          continue
        }
        o.peek.style.setProperty('--ms', `${(2 * R).toFixed(1)}px`)
        o.peek.style.setProperty('--mx', `${(B.x - p.left - R).toFixed(1)}px`)
        o.peek.style.setProperty('--my', `${(B.y - p.top - R).toFixed(1)}px`)
      }
      if (inView) raf = requestAnimationFrame(tick)
    }
    const io = new IntersectionObserver(([e]) => {
      inView = e.isIntersecting
      if (inView && !raf) raf = requestAnimationFrame(tick)
      if (!inView) near = null
    })
    io.observe(circles[0].c.closest('.circles') || circles[0].c)

    live = {
      el: circles[0].c,
      stop() {
        io.disconnect()
        cancelAnimationFrame(raf)
        removeEventListener('pointermove', onMove)
        window.CHANDE_BUBBLE?.lure?.(null, 'circles')
        for (const o of circles) o.peek.style.removeProperty('--ms')
      },
    }
  }

  function destroy() {
    live?.stop()
    live = null
  }

  api.mount = mount
  api.destroy = destroy
  mount(document)
  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => {
      if (live && data.current.container?.contains(live.el)) destroy()
    })
  }
})()
