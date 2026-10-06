/* =============================================================================
 * CHANDE — Hành vi nhỏ của các section trang chủ (sau hero)
 * -----------------------------------------------------------------------------
 *   • [data-marquee]   dải chạy ngang (CSS animation) — ngoài màn hình thì gắn
 *                      .is-off để dừng, đỡ việc cho trình duyệt
 *   • [data-scroll-pct] vòng % ở section phong cảnh = tiến độ cuộn cả trang
 *   • tab AGENDA / BOOTCAMP — đổi aria-selected (nội dung mới có một bộ)
 *   • [data-back-top]  cuộn về đầu trang bằng Lenis nếu có
 * Mount / gỡ theo Barba giống chande-hero.js. File nạp ở cả ba trang.
 * ========================================================================== */
(() => {
  'use strict'

  let io = null
  let onScroll = null

  function mount(root = document) {
    const scope = root.querySelector ? root : document
    if (!scope.querySelector('.hs')) return
    destroy()

    io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle('is-off', !e.isIntersecting)),
      { rootMargin: '100px 0px' },
    )
    scope.querySelectorAll('[data-marquee]').forEach((el) => {
      el.classList.add('is-off')
      io.observe(el)
    })

    // Việc chạy theo cuộn: gom chung MỘT listener + một rAF, mỗi việc chỉ ghi DOM
    // khi giá trị đổi.
    const jobs = []

    // Vòng %: tiến độ cuộn cả trang, xoay vòng ngoài theo.
    const pct = scope.querySelector('[data-scroll-pct]')
    if (pct) {
      const num = pct.querySelector('[data-pct]')
      const ring = pct.querySelector('img')
      let last = -1
      jobs.push(() => {
        const max = document.documentElement.scrollHeight - innerHeight
        const p = max > 0 ? Math.round((scrollY / max) * 100) : 0
        if (p === last) return
        last = p
        num.textContent = p
        ring.style.transform = `rotate(${p * 3.6}deg)`
      })
    }

    // Cụm chữ trôi của hero: tâm khối chữ qua khỏi mép dưới hero (sang nền kem)
    // thì chữ chuyển màu tối.
    const travel = scope.querySelector('[data-travel]')
    const stage = scope.querySelector('.hero__stage')
    if (travel && stage) {
      const text = travel.querySelector('.hero__intro-text')
      let light = null
      jobs.push(() => {
        const t = text.getBoundingClientRect()
        const on = (t.top + t.bottom) / 2 > stage.getBoundingClientRect().bottom
        if (on !== light) travel.classList.toggle('is-on-light', (light = on))
      })
    }

    if (jobs.length) {
      let ticking = false
      const run = () => {
        ticking = false
        jobs.forEach((fn) => fn())
      }
      onScroll = () => {
        if (!ticking) {
          ticking = true
          requestAnimationFrame(run)
        }
      }
      addEventListener('scroll', onScroll, { passive: true })
      addEventListener('resize', onScroll, { passive: true })
      run()
    }

    // Footer: bọc từng tên (tách theo " / ") thành .nm; hover tên nào thì ô ảnh hiện
    // ảnh người đó, rời khỏi khối tên thì ô ảnh thu lại.
    const face = scope.querySelector('[data-name-photo]')
    if (face) {
      const img = face.querySelector('img')
      let pool = []
      try {
        pool = JSON.parse(face.dataset.photos || '[]')
      } catch {}
      pool.forEach((src) => (new Image().src = src)) // nạp trước, hover là có ngay
      let n = 0
      const foot = face.closest('.hs-foot')
      foot.querySelectorAll('.names span').forEach((line) => {
        if (line.children.length || !line.textContent.trim()) return
        const parts = line.textContent.split(/(\s\/\s?)/)
        line.textContent = ''
        parts.forEach((part) => {
          if (/^\s\/\s?$/.test(part) || !part.trim()) return void line.append(part)
          const nm = document.createElement('span')
          nm.className = 'nm'
          nm.textContent = part
          nm.dataset.photo = nm.dataset.photo || pool[n++ % Math.max(1, pool.length)] || ''
          line.append(nm)
        })
      })
      let active = null
      foot.addEventListener('pointerover', (e) => {
        const nm = e.target.closest('.nm')
        if (!nm || nm === active || !nm.dataset.photo) return
        active?.classList.remove('is-active')
        active = nm
        nm.classList.add('is-active')
        img.src = nm.dataset.photo
        img.alt = nm.textContent
        face.classList.add('is-on')
      })
      foot.querySelectorAll('.names').forEach((block) =>
        block.addEventListener('pointerleave', () => {
          active?.classList.remove('is-active')
          active = null
          face.classList.remove('is-on')
        }),
      )
    }

    scope.querySelectorAll('[role=tablist]').forEach((list) =>
      list.addEventListener('click', (e) => {
        const tab = e.target.closest('[role=tab]')
        if (!tab) return
        list.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t === tab)))
      }),
    )

    scope.querySelectorAll('[data-back-top]').forEach((a) =>
      a.addEventListener('click', (e) => {
        e.preventDefault()
        const lenis = window.CHANDE_TRANSITION?.lenis
        if (lenis) lenis.scrollTo(0)
        else scrollTo({ top: 0, behavior: 'smooth' })
      }),
    )
  }

  function destroy() {
    io?.disconnect()
    io = null
    if (onScroll) {
      removeEventListener('scroll', onScroll)
      removeEventListener('resize', onScroll)
    }
    onScroll = null
  }

  mount(document)
  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => {
      if (!data.next?.container?.querySelector('.hs')) destroy()
    })
  }

  window.CHANDE_HOME = { mount, destroy }
})()
