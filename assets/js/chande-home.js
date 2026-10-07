/* =============================================================================
 * CHANDE — Hành vi nhỏ của các section trang chủ (sau hero)
 * -----------------------------------------------------------------------------
 *   • [data-marquee]   dải chạy ngang (CSS animation) — ngoài màn hình thì gắn
 *                      .is-off để dừng, đỡ việc cho trình duyệt
 *   • [data-scroll-pct] vòng % ở section phong cảnh = tiến độ cuộn cả trang
 *   • tab AGENDA / BOOTCAMP — đổi aria-selected (nội dung mới có một bộ)
 *   • Agenda: ngày dính (sticky) đổi theo ngày đang đọc (data-day trên từng
 *     .agenda__head: "ngày|tháng|D-x|giờ"); nút ‹ › đổi cặp ảnh ngày 2
 *     ([data-agenda-slides], danh sách ảnh ở data-photos — CMS sửa được)
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

    // Cụm chữ trôi của hero: chữ có HAI lớp chồng khít — sáng (.it-light) và tối
    // (.it-dark) — cắt theo mép dưới hero (ranh giới nền tối / nền kem ở cột này):
    // phần chữ còn trên nền tối là chữ sáng, phần đã sang nền kem là chữ tối, cắt
    // ngang được cả giữa một dòng. Hero đang ở chế độ nền tối (html.hero-row-dark)
    // thì cả cột tối -> chữ sáng hết. .is-on-light vẫn gắn (tâm khối qua ranh giới)
    // cho các thứ khác dùng.
    const travel = scope.querySelector('[data-travel]')
    const stage = scope.querySelector('.hero__stage')
    if (travel && stage) {
      const text = travel.querySelector('.hero__intro-text')
      if (!text.querySelector('.it-light')) {
        const html = text.innerHTML
        text.innerHTML = `<div class="it-light">${html}</div><div class="it-dark" aria-hidden="true">${html}</div>`
      }
      let light = null
      let split = -1
      jobs.push(() => {
        const t = text.getBoundingClientRect()
        const edge = stage.getBoundingClientRect().bottom
        const on = (t.top + t.bottom) / 2 > edge
        if (on !== light) travel.classList.toggle('is-on-light', (light = on))
        const dark = document.documentElement.classList.contains('hero-row-dark')
        const s = Math.round(dark ? t.height + 1 : Math.min(Math.max(edge - t.top, 0), t.height + 1))
        if (s !== split) text.style.setProperty('--split', `${(split = s)}px`)
      })
    }

    // Dải màu 3D [data-flip3d]: vạch i mặt trước màu i, mặt dưới màu (n−1−i). Tâm
    // dải đi từ 65% xuống 35% chiều cao màn thì các khối lăn 0 -> 90° (lệch nhau
    // `FLIP_STAGGER` mỗi vạch) — đảo thứ tự màu. Góc đuổi theo đích bằng lerp mỗi
    // khung cho mượt; cuộn ngược thì lăn về.
    const FLIP_STAGGER = 0.07
    scope.querySelectorAll('[data-flip3d]').forEach((sc) => {
      const lines = [...sc.children].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
      const n = lines.length
      if (n < 2) return
      const cols = lines.map((l) => getComputedStyle(l).backgroundColor)
      lines.forEach((l, i) => {
        l.style.setProperty('--cf', cols[i])
        l.style.setProperty('--cb', cols[n - 1 - i])
      })
      const setH = () => {
        const h = lines[0].offsetHeight
        const p = parseFloat(getComputedStyle(sc).perspective) || 1600
        sc.style.setProperty('--h', `${h}px`)
        sc.style.setProperty('--k', (p / (p + h / 2)).toFixed(5))
      }
      setH()
      sc.classList.add('is-3d')
      const cur = new Array(n).fill(0)
      const goal = new Array(n).fill(0)
      let raf = 0
      let last = 0
      const tick = (now) => {
        raf = 0
        const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
        last = now
        const k = 1 - Math.exp(-dt * 9)
        let moving = false
        lines.forEach((l, i) => {
          cur[i] += (goal[i] - cur[i]) * k
          if (Math.abs(goal[i] - cur[i]) < 0.001) cur[i] = goal[i]
          else moving = true
          l.style.setProperty('--t', cur[i].toFixed(4))
        })
        if (moving) raf = requestAnimationFrame(tick)
        else last = 0
      }
      jobs.push(() => {
        const r = sc.getBoundingClientRect()
        if (r.bottom < -innerHeight || r.top > innerHeight * 2) return
        const c = (r.top + r.bottom) / 2
        const t = Math.min(Math.max((innerHeight * 0.65 - c) / (innerHeight * 0.3), 0), 1)
        const span = 1 - (n - 1) * FLIP_STAGGER
        lines.forEach((_, i) => {
          const x = Math.min(Math.max((t - i * FLIP_STAGGER) / span, 0), 1)
          goal[i] = x * x * (3 - 2 * x)
        })
        if (!raf) raf = requestAnimationFrame(tick)
      })
      addEventListener('resize', setH, { passive: true })
    })

    // Phong cảnh: ghim 1 màn, chia (số món + 1) nhịp — nhịp 0 chỉ ảnh nền, nhịp i
    // dán món thứ i (trái -> phải), nhịp cuối giữ đủ.
    const land = scope.querySelector('.hs-land')
    if (land) {
      const items = [...land.querySelectorAll('[data-land-step]')].sort((a, b) => a.dataset.landStep - b.dataset.landStep)
      land.classList.add('is-staged')
      let shown = -1
      jobs.push(() => {
        const r = land.getBoundingClientRect()
        // trừ thêm 1 màn: nhịp cuối để section sau trồi lên phủ (home.css)
        const span = Math.max(1, r.height - innerHeight * 2)
        const p = Math.min(Math.max(-r.top / span, 0), 1)
        const n = Math.min(items.length, Math.floor(p * (items.length + 1)))
        if (n === shown) return
        shown = n
        items.forEach((el, i) => el.classList.toggle('is-in', i < n))
      })
    }

    // Agenda: ngày nào có đầu đề đã lên quá 60% màn hình là ngày đang đọc.
    const agenda = scope.querySelector('.hs-agenda')
    if (agenda) {
      const heads = [...agenda.querySelectorAll('.agenda__head[data-day]')]
      const dates = agenda.querySelector('.agenda__dates')
      // Nền tối: mép trên cụm ngày (dính) chạm mép trên CẶP ẢNH DƯỚI (ngày 2,
      // .agenda__pair) -> nền Agenda đen, chữ sáng, và GIỮ tối khi cuộn tiếp xuống;
      // chỉ cuộn ngược lên trên điểm đó mới về sáng. Ảnh ngày 1 không bật.
      const shots = [...agenda.querySelectorAll('.agenda__pair')]
      const dateTop = dates?.querySelector('p')
      let darkOn = null
      if (shots.length && dateTop)
        jobs.push(() => {
          const y = dateTop.getBoundingClientRect().top
          const on = shots.some((s) => {
            const r = s.getBoundingClientRect()
            return r.top <= y + 0.5
          })
          if (on !== darkOn) agenda.classList.toggle('is-dark', (darkOn = on))
        })
      const prev = agenda.querySelector('.agenda__nav--prev')
      const next = agenda.querySelector('.agenda__nav--next')
      let cur = -1
      // Mỗi cụm ngày (p) là một KHỐI HỘP: mặt trước = chữ đang hiện, đổi ngày thì
      // chữ mới nằm ở mặt dưới (sang ngày sau) / mặt trên (lùi ngày) và khối lật
      // 90° đưa mặt đó ra trước. Khối lùi vào −h/2 nên lúc đứng yên mặt trước ở
      // đúng chỗ cũ (không bị phối cảnh phóng to).
      const cubes = dates
        ? [...dates.querySelectorAll('p')].map((p) => {
            const lines = [...p.querySelectorAll('span')].map((s) => s.outerHTML).join('')
            p.innerHTML = `<span class="dc"><span class="dc__f">${lines}</span><span class="dc__b" aria-hidden="true"></span></span>`
            return { p, cube: p.firstElementChild, front: p.querySelector('.dc__f'), back: p.querySelector('.dc__b'), n: p.querySelectorAll('.dc__f span').length, anim: null }
          })
        : []
      const reducedFlip = matchMedia('(prefers-reduced-motion: reduce)').matches
      const escTxt = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      const show = (i) => {
        if (i === cur) return
        const dir = i > cur ? 1 : -1
        const first = cur < 0
        cur = i
        const parts = heads[i].dataset.day.split('|')
        let k = 0
        cubes.forEach((c) => {
          const html = parts.slice(k, k + c.n).map((t) => `<span>${escTxt(t)}</span>`).join('')
          k += c.n
          c.anim?.cancel()
          if (first || reducedFlip) {
            c.front.innerHTML = html
            return
          }
          const h = c.p.offsetHeight
          c.cube.style.setProperty('--dh', `${h}px`)
          c.back.innerHTML = html
          c.back.className = `dc__b ${dir > 0 ? 'is-down' : 'is-up'}`
          const timing = { duration: 750, easing: 'cubic-bezier(.7, 0, .25, 1)' }
          c.anim = c.cube.animate(
            [{ transform: `translateZ(${-h / 2}px) rotateX(0deg)` }, { transform: `translateZ(${-h / 2}px) rotateX(${dir * 90}deg)` }],
            timing,
          )
          // không có nền che: mặt quay đi mờ dần, mặt quay ra rõ dần
          c.front.animate([{ opacity: 1 }, { opacity: 0 }], timing)
          c.back.animate([{ opacity: 0 }, { opacity: 1 }], timing)
          c.anim.finished
            .then(() => {
              c.front.innerHTML = html
              c.back.innerHTML = ''
              c.anim = null
            })
            .catch(() => {})
        })
      }
      if (heads.length) {
        jobs.push(() => {
          const line = innerHeight * 0.6
          let i = 0
          heads.forEach((h, k) => h.getBoundingClientRect().top < line && (i = k))
          show(i)
        })
      }
      // Nút ‹ › hai bên: đổi cặp ảnh ngày 2 ([data-agenda-slides], danh sách ở
      // data-photos), quay vòng, hai bên lệch nhau một nhịp. Hiệu ứng = đoàn shape
      // của 4 ảnh hero (CHANDE_REVEAL.play): ảnh cũ / mới vẽ kiểu cover thành canvas
      // đúng cỡ khung ảnh, đoàn shape chạy trong một khung tạm chồng khít lên ảnh
      // (chèn ngay sau ảnh nên graphic xung quanh vẫn nằm trên). Không có
      // CHANDE_REVEAL / giảm chuyển động thì ảnh mới quét vào theo hướng bấm.
      const slides = [...agenda.querySelectorAll('[data-agenda-slides]')].map((box) => {
        let list = []
        try {
          list = JSON.parse(box.dataset.photos || '[]')
        } catch {}
        const img = box.querySelector('img')
        if (list[0] && img.getAttribute('src') !== list[0]) img.src = list[0]
        list.slice(1).forEach((src) => (new Image().src = src))
        return { box, img, list }
      })
      let slideIdx = 0
      let sliding = false
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
      const cover = (src, w, h) =>
        new Promise((res) => {
          const im = new Image()
          im.onload = () => {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const k = Math.max(w / im.naturalWidth, h / im.naturalHeight)
            const dw = im.naturalWidth * k
            const dh = im.naturalHeight * k
            c.getContext('2d').drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh)
            res(c)
          }
          im.onerror = () => res(null)
          im.src = src
        })
      const swapShapes = async (R, img, src, delay) => {
        const dpr = Math.min(devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(img.offsetWidth * dpr))
        const h = Math.max(1, Math.round(img.offsetHeight * dpr))
        const [from, to] = await Promise.all([cover(img.currentSrc || img.src, w, h), cover(src, w, h)])
        if (!to) return
        const box = document.createElement('div')
        Object.assign(box.style, {
          position: 'absolute', left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`,
          width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px`, pointerEvents: 'none',
        })
        img.after(box)
        try {
          await R.play(box, { from, to, levels: 0, delay }).finished
          img.src = src
          await img.decode?.().catch(() => {})
        } finally {
          box.remove()
        }
      }
      const swap = ({ img, list }, d, delay) => {
        if (list.length < 2) return Promise.resolve()
        const src = list[(((slideIdx % list.length) + list.length) % list.length)]
        const R = window.CHANDE_REVEAL
        if (R?.play && !reducedMotion) return swapShapes(R, img, src, delay)
        const top = img.cloneNode()
        top.removeAttribute('loading')
        top.src = src
        Object.assign(top.style, {
          position: 'absolute', left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`,
          width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px`, zIndex: 1,
        })
        img.after(top)
        const from = d > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'
        const a = top.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], {
          duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : delay,
          easing: 'cubic-bezier(.76,0,.24,1)', fill: 'both',
        })
        return a.finished.then(() => {
          img.src = src
          return img.decode?.().catch(() => {})
        }).finally(() => top.remove())
      }
      const slide = (d) => {
        if (sliding || !slides.some((s) => s.list.length > 1)) return
        sliding = true
        slideIdx += d
        Promise.all(slides.map((s, i) => swap(s, d, i * 150))).finally(() => (sliding = false))
      }
      prev?.addEventListener('click', () => slide(-1))
      next?.addEventListener('click', () => slide(1))
      prev?.setAttribute('aria-label', 'Ảnh trước')
      next?.setAttribute('aria-label', 'Ảnh sau')
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
