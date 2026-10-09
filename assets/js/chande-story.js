/* =============================================================================
 * CHANDE — Story (06 years / Chande.): dính lại, ẢNH NHỎ NỞ RA lấp khung
 * -----------------------------------------------------------------------------
 * Lúc đầu chỉ có ảnh nền; cuộn vào quãng dính thì ảnh nhỏ bật ra ở giữa (chỗ .hs-story__small).
 * Khi khung ảnh chạm thanh menu thì khung + cột chữ ĐỨNG YÊN (dịch xuống bù cuộn); cuộn
 * tiếp thì ảnh nền đứng im, chỉ ảnh nhỏ nở ra (cỡ chạy đều theo log, tâm trôi về giữa
 * khung) tới khi phủ kín. Chỉ 2 ảnh: ảnh nền + ảnh nhỏ (ảnh nổi giữa chỉ dùng ở mobile;
 * thêm ảnh vào danh sách imgs thì tự lặp: ảnh vừa phủ kín thành nền, ảnh kế nở tiếp).
 * Hết ảnh thì hết dính, trang cuộn tiếp. Mỗi ảnh được bọc trong ô cắt (.hs-story__cell)
 * đặt left/top/width/height mỗi khung (luôn nét); hình trong ô TRƯỢT dọc từ dưới lên
 * suốt đời ảnh (từ lúc nở tới lúc bị ảnh sau phủ kín) cho có độ trôi khi cuộn.
 * Gần nở kín thì các DẢI MÀU (bảng màu shape reveal ở hero) trồi ra quanh ảnh và chạy
 * trước nó như đoàn shape: dải ngoài cùng phủ kín khung trước, ảnh là toa cuối. Màn ≤ 899px (xếp dọc) thì không chạy.
 *
 * API: window.CHANDE_STORY = { config, mount(root), destroy() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    stepScroll: 1, // quãng cuộn cho mỗi lần một ảnh nở kín khung (× chiều cao khung)
    slide: 10, // độ trượt hình trong ô (% chiều cao ô, tổng quãng)
    zoom: 1.2, // phóng hình trong ô để có chỗ trượt (cả parallax trước / sau quãng dính)
    appear: 0.12, // ảnh nhỏ bật ra trong đoạn đầu này của quãng nở (0…1)
    bandsFrom: 0.62, // dải màu bắt đầu trồi ra khi ảnh cao tới bao nhiêu chiều cao khung (0…1)
    bandPx: 0.006, // độ dày mỗi dải (× chiều cao khung) — CỐ ĐỊNH, không đổi theo cỡ ảnh
    bandRamp: 0.05, // dải bung từ 0 lên đủ dày trong quãng này (theo tỉ lệ cao ảnh / khung)
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
    ].filter(Boolean)
    if (!media || !small || imgs.length < 2) return

    // bọc từng ảnh trong ô cắt — ô nở / đặt chỗ, hình trong ô trượt
    const cells = imgs.map((img) => {
      const cell = document.createElement('span')
      cell.className = 'hs-story__cell'
      img.before(cell)
      cell.append(img)
      return cell
    })
    // dải màu: lấy bảng màu của shape reveal (hero), dải đầu = ngoài cùng, chạy trước
    // chỉ 3 màu cuối của bảng (xanh rêu · lime nhạt · mực)
    const colors = (window.CHANDE_REVEAL?.config?.colors || ['#68f12b', '#f4f3eb', '#236c3c', '#c4ff6b', '#182220']).slice(-3)
    const bands = colors.map((c) => {
      const b = document.createElement('span')
      b.className = 'hs-story__band-c'
      b.style.background = c
      media.append(b)
      return b
    })
    let W = 0
    let H = 0
    let bar = 0
    let pin = 0
    let seed = [0, 0, 0, 0] // ô ảnh nhỏ lúc đầu: x, y, w, h (trong khung)

    // Đo ô ảnh nhỏ theo CSS gốc (gỡ style tự đặt trước khi đo)
    const measure = () => {
      const on = wide.matches
      section.classList.toggle('is-zoom', on)
      for (const el of [...imgs, ...cells]) el.style.cssText = ''
      for (const b of bands) b.style.visibility = 'hidden'
      media.style.transform = ''
      if (col) col.style.transform = ''
      section.classList.toggle('is-cells', on)
      if (!on) return
      W = media.clientWidth
      H = media.clientHeight
      bar = innerHeight - H
      const box = media.getBoundingClientRect()
      section.classList.remove('is-cells') // đo ô ảnh nhỏ theo CSS gốc
      const r = small.getBoundingClientRect()
      section.classList.add('is-cells')
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
      // parallax: cả TRƯỚC và SAU quãng dính hình trong ô vẫn trôi theo cuộn (như ảnh
      // khác trên trang) — nối liền với độ trượt trong quãng dính
      const xr = Math.min(n + 1.5, Math.max(-1.5, ((bar - top) / pin) * n))
      const k = Math.min(n - 1, Math.floor(x)) // ảnh nền hiện tại
      const f = x - k // ảnh k + 1 nở ra được bao nhiêu
      // nở đều theo log: rộng / cao đi từ ô nhỏ tới cỡ khung, tâm trôi theo cùng nhịp
      const [sx, sy, sw, sh] = seed
      const grow = (q) => {
        q = Math.min(1, Math.max(0, q))
        const w = sw * (W / sw) ** q
        const h = sh * (H / sh) ** q
        const g = (h - sh) / Math.max(1e-3, H - sh)
        return [sx + sw / 2 + (W / 2 - (sx + sw / 2)) * g - w / 2, sy + sh / 2 + (H / 2 - (sy + sh / 2)) * g - h / 2, w, h]
      }
      const [ix, iy, gw, gh] = grow(f)
      const cx = ix + gw / 2
      const cy = iy + gh / 2
      // lúc chưa cuộn vào quãng dính chưa có ảnh nhỏ: nó bật ra từ một chấm ở giữa
      // trong đoạn đầu (appear) rồi mới nở tiếp
      const a = Math.min(1, Math.max(0, f / CONFIG.appear))
      const pop = t <= 0 ? 0 : 1 - (1 - a) ** 3
      const w = gw * pop
      const h = gh * pop
      // dải màu: trồi dần từ mép ảnh (độ đi trước tăng từ 0), dải ngoài cùng đi trước nhất
      // dải màu: viền dày CỐ ĐỊNH quanh ảnh (bung nhanh lên đủ dày rồi giữ), dải ngoài cùng trước
      const e = Math.min(1, Math.max(0, (gh / H - CONFIG.bandsFrom) / Math.max(0.01, CONFIG.bandRamp)))
      const lead = e * e * (3 - 2 * e)
      const T = H * CONFIG.bandPx * lead
      let bandFull = -1
      bands.forEach((b, j) => {
        if (lead <= 0.001 || k + 1 >= imgs.length || f >= 1) {
          b.style.visibility = 'hidden'
          return
        }
        const d = (bands.length - j) * T
        const bx = cx - gw / 2 - d
        const by = cy - gh / 2 - d
        const bw = gw + 2 * d
        const bh = gh + 2 * d
        if (bx <= 0.5 && by <= 0.5 && bx + bw >= W - 0.5 && by + bh >= H - 0.5) bandFull = j
        b.style.visibility = 'visible'
        b.style.left = `${bx.toFixed(2)}px`
        b.style.top = `${by.toFixed(2)}px`
        b.style.width = `${bw.toFixed(2)}px`
        b.style.height = `${bh.toFixed(2)}px`
      })
      // dải đã phủ kín khung thì mọi dải ngoài nó (và ảnh nền) không còn thấy
      bands.forEach((b, j) => j < bandFull && (b.style.visibility = 'hidden'))
      cells.forEach((el, i) => {
        if (i === k) {
          place(el, 0, 0, W, H)
          if (bandFull >= 0) el.style.visibility = 'hidden'
        }
        else if (i === k + 1) {
          if (pop <= 0) {
            el.style.visibility = 'hidden'
            return
          }
          place(el, cx - w / 2, cy - h / 2, w, h)
          el.style.zIndex = '2' // trên các dải màu
        } else {
          el.style.visibility = 'hidden'
          return
        }
        // đời ảnh i: nở trong chặng i − 1, làm nền trong chặng i -> u 0…1
        const u = Math.min(1.3, Math.max(-0.3, (xr - (i - 1)) / 2))
        imgs[i].style.transform = `translate3d(0, ${((0.5 - u) * CONFIG.slide).toFixed(2)}%, 0) scale(${CONFIG.zoom})`
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
        for (const el of [...imgs, ...cells]) el.style.cssText = ''
        bands.forEach((b) => b.remove())
        cells.forEach((cell, i) => cell.replaceWith(imgs[i]))
        section.classList.remove('is-cells')
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
