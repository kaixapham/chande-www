/* =============================================================================
 * CHANDE — Story (06 years / Chande.): dính lại, ẢNH TRONG NỞ RA lấp khung, lặp 6 ảnh
 * -----------------------------------------------------------------------------
 * Lúc đầu chỉ có 2 ảnh: ảnh nền phủ khung + một ảnh nhỏ ở giữa (chỗ .hs-story__small).
 * Khi khung ảnh chạm thanh menu thì khung + cột chữ ĐỨNG YÊN (dịch xuống bù cuộn); cuộn
 * tiếp thì ảnh nền đứng im, chỉ ảnh nhỏ nở ra (cỡ chạy đều theo log, tâm trôi về giữa
 * khung) tới khi phủ kín -> nó thành ảnh nền, ảnh kế tiếp hiện nhỏ ở giữa, lặp lại.
 * Thứ tự: ảnh nền -> ảnh nhỏ -> ảnh nổi giữa -> 3 ảnh .hs-story__z (6 ảnh, sửa trong CMS).
 * Hết ảnh thì hết dính, trang cuộn tiếp. Ảnh đặt left/top/width/height mỗi khung nên
 * luôn nét. Màn ≤ 899px (xếp dọc) thì không chạy.
 *
 * API: window.CHANDE_STORY = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    stepScroll: 0.7, // quãng cuộn cho mỗi lần một ảnh nở kín khung (× chiều cao khung)
  }
  window.CHANDE_SETTINGS_APPLY?.('story', CONFIG)
  const api = { config: CONFIG, mount() {}, destroy() {} }
  window.CHANDE_STORY = api
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const wide = matchMedia('(min-width: 900px)')

  let live = null

  function mount(root = document) {
    destroy()
    const section = (root.querySelector ? root : document).querySelector('.hs-story[data-story-zoom]')
    if (!section) return
    const media = section.querySelector('.hs-story__media')
    const col = section.querySelector('.hs-story__col')
    const small = section.querySelector('.hs-story__small')
    const imgs = [
      section.querySelector('.hs-story__photo'),
      small,
      section.querySelector('.hs-story__card'),
      ...section.querySelectorAll('.hs-story__z'),
    ].filter(Boolean)
    if (!media || !small || imgs.length < 2) return

    let W = 0
    let H = 0
    let bar = 0
    let pin = 0
    let seed = [0, 0, 0, 0] // ô ảnh nhỏ lúc đầu: x, y, w, h (trong khung)

    // Đo ô ảnh nhỏ theo CSS gốc (gỡ style tự đặt trước khi đo)
    const measure = () => {
      const on = wide.matches
      section.classList.toggle('is-zoom', on)
      for (const el of imgs) el.style.cssText = ''
      media.style.transform = ''
      if (col) col.style.transform = ''
      if (!on) return
      W = media.clientWidth
      H = media.clientHeight
      bar = innerHeight - H
      const box = media.getBoundingClientRect()
      const r = small.getBoundingClientRect()
      seed = [r.left - box.left, r.top - box.top, r.width, r.height]
      pin = Math.round(H * CONFIG.stepScroll * (imgs.length - 1))
      section.style.setProperty('--story-pin', `${pin}px`)
      paint()
    }

    const place = (el, x, y, w, h) => {
      el.style.visibility = ''
      el.style.zIndex = ''
      el.style.left = `${x.toFixed(2)}px`
      el.style.top = `${y.toFixed(2)}px`
      el.style.width = `${w.toFixed(2)}px`
      el.style.height = `${h.toFixed(2)}px`
    }

    let raf = 0
    const paint = () => {
      raf = 0
      if (!wide.matches || !pin) return
      // mép trên khung khi chưa dịch (offsetTop không tính transform)
      const top = section.getBoundingClientRect().top + media.offsetTop
      const t = Math.min(pin, Math.max(0, bar - top))
      media.style.transform = `translate3d(0, ${t}px, 0)`
      if (col) col.style.transform = `translate3d(0, ${t}px, 0)`
      const n = imgs.length - 1
      const x = (t / pin) * n
      const k = Math.min(n - 1, Math.floor(x)) // ảnh nền hiện tại
      const f = x - k // ảnh k + 1 nở ra được bao nhiêu
      // nở đều theo log: rộng / cao đi từ ô nhỏ tới cỡ khung, tâm trôi theo cùng nhịp
      const [sx, sy, sw, sh] = seed
      const w = sw * (W / sw) ** f
      const h = sh * (H / sh) ** f
      const g = (h - sh) / Math.max(1e-3, H - sh)
      const cx = sx + sw / 2 + (W / 2 - (sx + sw / 2)) * g
      const cy = sy + sh / 2 + (H / 2 - (sy + sh / 2)) * g
      imgs.forEach((el, i) => {
        if (i === k) place(el, 0, 0, W, H)
        else if (i === k + 1) {
          place(el, cx - w / 2, cy - h / 2, w, h)
          el.style.zIndex = '1'
        } else el.style.visibility = 'hidden'
      })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    const ro = new ResizeObserver(() => measure())
    ro.observe(section)
    addEventListener('scroll', onScroll, { passive: true })
    wide.addEventListener('change', measure)
    measure()

    live = {
      section,
      stop() {
        ro.disconnect()
        removeEventListener('scroll', onScroll)
        wide.removeEventListener('change', measure)
        cancelAnimationFrame(raf)
        section.classList.remove('is-zoom')
        section.style.removeProperty('--story-pin')
        for (const el of imgs) el.style.cssText = ''
        media.style.transform = ''
        if (col) col.style.transform = ''
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
      if (live && data.current.container?.contains(live.section)) destroy()
    })
  }
})()
