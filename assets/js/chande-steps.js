/* =============================================================================
 * CHANDE — Ảnh đổi theo nấc cuộn (About: ảnh sticky cạnh danh sách sự kiện)
 * -----------------------------------------------------------------------------
 * [data-steps] = khung ghim (cao hơn ảnh); [data-steps-media] = ảnh sticky bên trong,
 * chứa N <img>. Ảnh trượt từ đỉnh khung xuống đáy khung trong lúc ghim -> chia quãng
 * đó thành N nấc, nấc nào thì ảnh đó hiện.
 * Đổi ảnh = đoàn shape màu như ảnh hero / thẻ Cảm nhận trang chủ (CHANDE_REVEAL.play),
 * bay từ góc dưới-TRÁI; ảnh mới là toa cuối. Đang chạy mà sang nấc khác thì chạy xong
 * lượt này rồi đổi thẳng tới nấc mới nhất (không xếp hàng từng nấc).
 * Không có CHANDE_REVEAL / giảm chuyển động -> CSS: ảnh mới loang từ góc dưới trái.
 * Một rAF mỗi lần cuộn, chỉ làm gì khi sang nấc mới.
 * API: window.CHANDE_STEPS = { mount(root) }
 * ========================================================================== */
;(() => {
  let stop = null
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // ảnh -> canvas đúng cỡ khung, kiểu object-fit: cover
  const cover = (img, w, h) =>
    new Promise((res) => {
      const draw = () => {
        if (!img.naturalWidth) return res(null)
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const k = Math.max(w / img.naturalWidth, h / img.naturalHeight)
        const dw = img.naturalWidth * k
        const dh = img.naturalHeight * k
        c.getContext('2d').drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
        // ảnh sự kiện mang film màu bằng CSS -> nướng vào khung chuyển cho khớp màu (không lọc canvas đang chạy)
        window.CHANDE_FILM?.bake(c, w / Math.max(1, img.parentElement?.clientWidth || w))
        res(c)
      }
      if (img.complete) draw()
      else {
        img.loading = 'eager'
        img.addEventListener('load', draw, { once: true })
        img.addEventListener('error', () => res(null), { once: true })
      }
    })

  function mount(root = document) {
    stop?.()
    stop = null
    const box = (root.querySelector ? root : document).querySelector('[data-steps]')
    const media = box?.querySelector('[data-steps-media]')
    if (!media) return
    const stick = box.querySelector('[data-steps-stick]') || media // khối ghim (có thể kèm dòng chú thích)
    const yearEl = box.querySelector('[data-steps-year]')
    const nameEl = box.querySelector('[data-steps-name]')
    // dòng chú thích [ năm ] [ tên sự kiện ] đổi ngay khi sang nấc (ảnh thì chạy hiệu ứng)
    const caption = (i) => {
      const im = imgs[i]
      // đổi chữ kèm hiệu ứng "giải mã" (ký hiệu code chốt dần về chữ mới — chande-scramble.js)
      const put = (el, v, d) => {
        if (!el || !v || el.textContent === v) return
        el.textContent = v
        if (!reduced) window.CHANDE_SCRAMBLE?.run(el, d)
      }
      put(yearEl, im?.dataset.stepYear && `[ ${im.dataset.stepYear} ]`, 0)
      put(nameEl, im?.alt && `[ ${im.alt} ]`, 90)
    }
    const imgs = [...media.querySelectorAll('img')]
    if (imgs.length < 2) return
    let cur = Math.max(0, imgs.findIndex((im) => im.classList.contains('is-on')))
    let want = cur
    let busy = false
    let run = null
    let raf = 0
    let alive = true

    // đặt ảnh hiện ngay (không hiệu ứng CSS khi đoàn shape lo phần chuyển)
    const show = (i, animate) => {
      media.classList.toggle('no-anim', !animate)
      imgs.forEach((im, k) => {
        im.classList.toggle('is-prev', animate && k === cur)
        im.classList.toggle('is-on', k === i)
      })
      cur = i
    }

    const go = async () => {
      if (busy || want === cur || !alive) return
      const R = window.CHANDE_REVEAL
      if (!R || reduced) return show(want, true)
      busy = true
      const to = want
      try {
        const dpr = Math.min(devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(media.offsetWidth * dpr))
        const h = Math.max(1, Math.round(media.offsetHeight * dpr))
        const [a, b] = await Promise.all([cover(imgs[cur], w, h), cover(imgs[to], w, h)])
        if (!b || !alive) throw 0
        run = R.play(media, { from: a, to: b, levels: 8, fromLeft: true })
        run.canvas.style.zIndex = 3
        await run.finished
        show(to, false)
      } catch {
        if (alive) show(to, false)
      }
      run = null
      busy = false
      go() // trong lúc chạy đã cuộn sang nấc khác
    }

    const check = () => {
      raf = 0
      const travel = box.getBoundingClientRect().height - stick.offsetHeight
      let i = 0
      if (travel > 1) {
        // không ghim (màn hẹp) -> ảnh đầu
        const y = stick.getBoundingClientRect().top - box.getBoundingClientRect().top
        i = Math.floor(Math.min(0.9999, Math.max(0, y / travel)) * imgs.length)
      }
      if (i !== want) caption(i)
      want = i
      go()
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check)
    }
    addEventListener('scroll', onScroll, { passive: true })
    addEventListener('resize', onScroll)
    check()
    stop = () => {
      alive = false
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
      cancelAnimationFrame(raf)
      run?.cancel()
    }
  }

  window.CHANDE_STEPS = { mount }
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
