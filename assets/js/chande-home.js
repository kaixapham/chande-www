/* =============================================================================
 * CHANDE — Hành vi nhỏ của các section trang chủ (sau hero)
 * -----------------------------------------------------------------------------
 *   • [data-marquee]   dải chạy ngang (CSS animation) — ngoài màn hình thì gắn
 *                      .is-off để dừng, đỡ việc cho trình duyệt
 *   • [data-scroll-pct] vòng % ở section phong cảnh = tiến độ cuộn cả trang
 *   • tab AGENDA / BOOTCAMP — đổi aria-selected (nội dung mới có một bộ)
 *   • Agenda: ngày dính (sticky) đổi theo ngày đang đọc (data-day trên từng
 *     .agenda__head: "ngày|tháng|D-x|giờ"); nút ‹ › cuộn tới ngày trước / sau
 *   • Cảm nhận: nút ‹ › + thanh chạy 6s đổi cảm nhận; danh sách thêm trong
 *     <script data-quotes> (cảm nhận đầu là HTML sẵn có, CMS vẫn thay ảnh được)
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

    // Agenda: ngày nào có đầu đề đã lên quá 60% màn hình là ngày đang đọc.
    const agenda = scope.querySelector('.hs-agenda')
    if (agenda) {
      const heads = [...agenda.querySelectorAll('.agenda__head[data-day]')]
      const dates = agenda.querySelector('.agenda__dates')
      const spans = dates ? [...dates.querySelectorAll('p span')] : []
      const prev = agenda.querySelector('.agenda__nav--prev')
      const next = agenda.querySelector('.agenda__nav--next')
      let cur = -1
      let swapT = 0
      const show = (i) => {
        if (i === cur) return
        const first = cur < 0
        cur = i
        prev?.setAttribute('aria-disabled', String(i <= 0))
        next?.setAttribute('aria-disabled', String(i >= heads.length - 1))
        const parts = heads[i].dataset.day.split('|')
        const write = () => spans.forEach((s, k) => parts[k] != null && (s.textContent = parts[k]))
        if (first) return write()
        clearTimeout(swapT)
        dates.classList.add('is-swap')
        swapT = setTimeout(() => {
          write()
          dates.classList.remove('is-swap')
        }, 250)
      }
      if (heads.length) {
        jobs.push(() => {
          const line = innerHeight * 0.6
          let i = 0
          heads.forEach((h, k) => h.getBoundingClientRect().top < line && (i = k))
          show(i)
        })
        const go = (d) => {
          const h = heads[Math.min(Math.max(cur + d, 0), heads.length - 1)]
          const lenis = window.CHANDE_TRANSITION?.lenis
          const off = -innerHeight * 0.25
          if (lenis) lenis.scrollTo(h, { offset: off })
          else scrollTo({ top: h.getBoundingClientRect().top + scrollY + off, behavior: 'smooth' })
        }
        prev?.addEventListener('click', () => go(-1))
        next?.addEventListener('click', () => go(1))
      }
    }

    // Cảm nhận: mục 0 đọc từ HTML, các mục sau từ <script data-quotes>.
    const quote = scope.querySelector('.hs-quote')
    if (quote) {
      const q = {
        text: quote.querySelector('.hs-quote__text'),
        by: quote.querySelectorAll('.hs-quote__by p'),
        img: quote.querySelector('.hs-quote__card img'),
        cap: quote.querySelectorAll('.hs-quote__card p span'),
        bar: quote.querySelector('.hs-quote__bar span'),
      }
      const list = [{
        num: q.cap[0]?.textContent,
        name: q.cap[1]?.textContent,
        role: q.by[1]?.textContent,
        text: q.text.textContent,
        img: q.img.getAttribute('src'),
      }]
      try {
        list.push(...JSON.parse(quote.querySelector('[data-quotes]')?.textContent || '[]'))
      } catch {}
      list.slice(1).forEach((it) => it.img && (new Image().src = it.img))
      const many = list.length > 1
      quote.classList.toggle('is-single', !many)
      quote.querySelectorAll('.hs-quote__nav').forEach((b) => b.setAttribute('aria-disabled', String(!many)))
      let i = 0
      let busy = 0
      const restartBar = () => {
        q.bar.style.animation = 'none'
        void q.bar.offsetWidth
        q.bar.style.animation = ''
      }
      const go = (d) => {
        if (!many) return
        i = (i + d + list.length) % list.length
        const it = list[i]
        clearTimeout(busy)
        quote.classList.add('is-swap')
        busy = setTimeout(() => {
          q.text.textContent = it.text || ''
          if (q.by[0]) q.by[0].textContent = `[ ${it.name || ''} ]`
          if (q.by[1]) q.by[1].textContent = it.role || ''
          if (q.cap[0]) q.cap[0].textContent = it.num || String(i + 1).padStart(2, '0')
          if (q.cap[1]) q.cap[1].textContent = it.name || ''
          if (it.img) q.img.src = it.img
          q.img.alt = it.name || ''
          quote.classList.remove('is-swap')
        }, 350)
        restartBar()
      }
      quote.querySelector('.hs-quote__nav--prev')?.addEventListener('click', () => go(-1))
      quote.querySelector('.hs-quote__nav--next')?.addEventListener('click', () => go(1))
      // hết một vòng thanh 6s thì sang cảm nhận kế
      q.bar?.addEventListener('animationiteration', () => go(1))
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
