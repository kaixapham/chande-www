/* =============================================================================
 * CHANDE — 3 vòng tròn ở About: bubble hút vào, lộ ảnh khác loang lổ
 * -----------------------------------------------------------------------------
 * Chuột lại gần lõi một vòng tròn -> giọt bubble bị hút về tâm (hơi nhích theo
 * chuột), phình to hơn lõi một chút; trong vòng tròn hiện ảnh .peek với mép loang
 * (mask nhiễu SVG trong home.css) — nhìn qua thấu kính của giọt nên ảnh còn bị bẻ.
 * Rời xa thì ảnh tan, giọt về theo chuột. Dùng CHANDE_BUBBLE.lure(fn, 'circles').
 *
 * API: window.CHANDE_CIRCLES = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    near: 1.25, // bắt đầu hút khi chuột cách tâm < near × bán kính lõi
    far: 1.6, // thả ra khi xa hơn far × bán kính lõi
    size: 1.12, // bán kính giọt = size × bán kính lõi
    follow: 0.15, // giọt nhích theo chuột bao nhiêu (0 = đứng giữa tâm)
  }
  window.CHANDE_SETTINGS_APPLY?.('circles', CONFIG)
  const api = { config: CONFIG, mount() {}, destroy() {} }
  window.CHANDE_CIRCLES = api
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  let live = null

  function mount(root = document) {
    destroy()
    const circles = [...(root.querySelector ? root : document).querySelectorAll('.hs-about .circle')]
    if (!circles.length) return
    const ptr = { x: -1e4, y: -1e4 }
    let active = null
    const core = (c) => {
      const el = c.querySelector('.core') || c
      const r = el.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 }
    }
    const setActive = (c) => {
      if (c === active) return
      active?.classList.remove('is-peek')
      active = c
      active?.classList.add('is-peek')
    }
    const check = () => {
      if (active) {
        const k = core(active)
        if (Math.hypot(ptr.x - k.x, ptr.y - k.y) > k.r * CONFIG.far) setActive(null)
      }
      if (!active)
        for (const c of circles) {
          const k = core(c)
          if (Math.hypot(ptr.x - k.x, ptr.y - k.y) < k.r * CONFIG.near) {
            setActive(c)
            break
          }
        }
    }
    const onMove = (e) => {
      ptr.x = e.clientX
      ptr.y = e.clientY
      check()
    }
    const onLeave = () => {
      ptr.x = ptr.y = -1e4
      setActive(null)
    }
    // điểm hút cho bubble: tâm lõi (nhích theo chuột), bán kính lớn hơn lõi một chút
    const lureFn = () => {
      if (!active) return null
      const k = core(active)
      return {
        x: k.x + (ptr.x - k.x) * CONFIG.follow,
        y: k.y + (ptr.y - k.y) * CONFIG.follow,
        r: k.r * CONFIG.size,
        hide: false,
      }
    }
    addEventListener('pointermove', onMove, { passive: true })
    addEventListener('scroll', check, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)
    window.CHANDE_BUBBLE?.lure?.(lureFn, 'circles')

    live = {
      circles,
      stop() {
        removeEventListener('pointermove', onMove)
        removeEventListener('scroll', check)
        document.documentElement.removeEventListener('pointerleave', onLeave)
        window.CHANDE_BUBBLE?.lure?.(null, 'circles')
        setActive(null)
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
      if (live && data.current.container?.contains(live.circles[0])) destroy()
    })
  }
})()
