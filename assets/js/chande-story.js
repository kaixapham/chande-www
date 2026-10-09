/* =============================================================================
 * CHANDE — Story (06 years / Chande.): dính lại và ZOOM XUYÊN QUA 6 ẢNH LỒNG NHAU
 * -----------------------------------------------------------------------------
 * Như droste / khung trong khung: mỗi ảnh nằm giữa ảnh trước nó (ảnh nền -> ảnh nổi
 * giữa -> ảnh nhỏ -> 3 ảnh .hs-story__z). Khi khung ảnh chạm thanh menu thì khung +
 * cột chữ ĐỨNG YÊN (dịch xuống bù cuộn), cuộn tiếp = máy quay tiến vào trong: thang
 * phóng chạy đều theo log nên tốc độ zoom không đổi dù tỉ lệ các tầng chênh nhau;
 * tới ảnh cuối (vừa chiều cao khung) thì hết dính, trang cuộn tiếp.
 * Ảnh đặt lại left/top/width/height mỗi khung (không scale cả lớp) nên luôn nét.
 * Tầng nào đã phủ kín khung thì tầng sau nó ẩn đi; tầng bé hơn 1px cũng ẩn.
 * Màn ≤ 899px (xếp dọc) thì không chạy.
 *
 * API: window.CHANDE_STORY = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    stepScroll: 0.6, // quãng cuộn cho mỗi lần qua một ảnh (× chiều cao khung)
    ratio: 0.62, // ảnh thêm (.hs-story__z) cao bằng bao nhiêu ảnh chứa nó
    aspect: 0.75, // tỉ lệ rộng / cao của ảnh thêm
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
    const levels = [
      section.querySelector('.hs-story__photo'),
      section.querySelector('.hs-story__card'),
      section.querySelector('.hs-story__small'),
      ...section.querySelectorAll('.hs-story__z'),
    ].filter(Boolean)
    if (!media || levels.length < 2) return

    let W = 0
    let H = 0
    let bar = 0
    let pin = 0
    let C = [0, 0] // tâm zoom (tâm ảnh nổi giữa) trong khung
    let rects = [] // [x, y, w, h] tương đối với tâm, ở thang 1
    let logEnd = 0

    // Đo theo bố cục gốc trong CSS (ảnh nền phủ khung, ảnh giữa / nhỏ theo --k), rồi
    // lồng các ảnh thêm vào giữa ảnh trước. Phải gỡ style tự đặt trước khi đo.
    const measure = () => {
      const on = wide.matches
      section.classList.toggle('is-zoom', on)
      for (const el of levels) el.style.cssText = ''
      media.style.transform = ''
      if (col) col.style.transform = ''
      if (!on) return
      W = media.clientWidth
      H = media.clientHeight
      bar = innerHeight - H
      const box = media.getBoundingClientRect()
      const card = levels[1].getBoundingClientRect()
      C = [card.left - box.left + card.width / 2, card.top - box.top + card.height / 2]
      rects = levels.map((el, i) => {
        if (i === 0) return [-C[0], -C[1], W, H]
        if (el.classList.contains('hs-story__z')) return null
        const r = el.getBoundingClientRect()
        return [r.left - box.left - C[0], r.top - box.top - C[1], r.width, r.height]
      })
      for (let i = 0; i < rects.length; i++) {
        if (rects[i]) continue
        const h = rects[i - 1][3] * CONFIG.ratio
        const w = h * CONFIG.aspect
        rects[i] = [-w / 2, -h / 2, w, h]
      }
      for (const el of levels.slice(1)) {
        el.style.left = '0px'
        el.style.top = '0px'
        el.style.transformOrigin = '0 0'
      }
      // ảnh cuối vừa chiều cao khung
      logEnd = Math.log(H / rects[rects.length - 1][3])
      pin = Math.round(H * CONFIG.stepScroll * (levels.length - 1))
      section.style.setProperty('--story-pin', `${pin}px`)
      paint()
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
      const S = Math.exp(logEnd * (t / pin))
      // tầng sâu nhất đã phủ kín khung -> ẩn mọi tầng ngoài nó
      let cover = 0
      const out = rects.map(([x, y, w, h], i) => {
        const r = [C[0] + x * S, C[1] + y * S, w * S, h * S]
        if (r[0] <= 0.5 && r[1] <= 0.5 && r[0] + r[2] >= W - 0.5 && r[1] + r[3] >= H - 0.5) cover = i
        return r
      })
      levels.forEach((el, i) => {
        const [x, y, w, h] = out[i]
        const show = i >= cover && h >= 1
        el.style.visibility = show ? '' : 'hidden'
        if (!show) return
        el.style.width = `${w.toFixed(2)}px`
        el.style.height = `${h.toFixed(2)}px`
        el.style.left = `${x.toFixed(2)}px`
        el.style.top = `${y.toFixed(2)}px`
      })
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(paint)
    }
    const ro = new ResizeObserver(() => measure())
    ro.observe(section)
    addEventListener('scroll', onScroll, { passive: true })
    wide.addEventListener('change', measure)
    // ảnh tải xong mới có cỡ thật (ảnh giữa / nhỏ đo theo CSS nên không cần chờ)
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
        for (const el of levels) el.style.cssText = ''
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
