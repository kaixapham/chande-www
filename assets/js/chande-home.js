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

  // Nạp sẵn ảnh dùng sau (ảnh kế của slider, ảnh hover…) — CHỈ sau khi trang tải xong và
  // trình duyệt rảnh, để không chen vào lúc loading (làm màn loading chờ lâu, giật).
  const preloadQ = []
  let preloadOn = false // đã qua mốc tải xong
  let preloadBusy = false
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200))
  const preloadStep = () => {
    preloadQ.splice(0, 3).forEach((src) => (new Image().src = src))
    if (preloadQ.length) idle(preloadStep)
    else preloadBusy = false
  }
  const preloadRun = () => {
    preloadOn = true
    if (preloadBusy || !preloadQ.length) return
    preloadBusy = true
    idle(preloadStep)
  }
  // chạy khi trang tải xong HOẶC sau tối đa `max` ms (một file treo trên mạng chậm có thể
  // làm 'load' tới rất muộn / không tới — đừng để phần sau trang chờ theo)
  const afterLoad = (fn, max = 4000) => {
    let done = false
    const go = () => !done && ((done = true), fn())
    if (document.readyState === 'complete') return setTimeout(go, 0)
    addEventListener('load', go, { once: true })
    setTimeout(go, max)
  }
  afterLoad(() => setTimeout(preloadRun, 1200))
  // Video (ô recap): chỉ tải + phát sau khi trang tải xong — trước đó hiện ảnh bìa
  const startVideos = () =>
    document.querySelectorAll('video[data-src]').forEach((v) => {
      v.src = v.dataset.src
      v.removeAttribute('data-src')
      v.autoplay = true
      v.play?.().catch(() => {})
    })
  afterLoad(() => setTimeout(startVideos, 300), 2500)
  window.barba?.hooks?.afterEnter(() => setTimeout(startVideos, 300))

  function preloadLater(list) {
    preloadQ.push(...(list || []).filter(Boolean))
    if (preloadOn) preloadRun()
  }

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
    // dải đi từ 85% xuống 55% chiều cao màn (lật xong khi dải lên 45% màn) thì các khối lăn 0 -> 90° (lệch nhau
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
        const t = Math.min(Math.max((innerHeight * 0.85 - c) / (innerHeight * 0.3), 0), 1)
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
        preloadLater(list.slice(1))
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
      // Parallax ảnh (chande-parallax.js) phóng + dịch + cắt ảnh bằng translate /
      // scale / clip-path: khung tạm chép theo từng khung hình để khớp ảnh bên dưới.
      const follow = (img, el) => {
        let raf = 0
        const copy = () => {
          el.style.translate = img.style.translate
          el.style.scale = img.style.scale
          el.style.clipPath = img.style.clipPath
          raf = el.isConnected ? requestAnimationFrame(copy) : 0
        }
        copy()
        return () => cancelAnimationFrame(raf)
      }
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
        const stop = follow(img, box)
        try {
          await R.play(box, { from, to, levels: 0, delay }).finished
          img.src = src
          await img.decode?.().catch(() => {})
        } finally {
          stop()
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
        const stop = follow(img, top)
        const from = d > 0 ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)'
        const a = top.animate([{ clipPath: from }, { clipPath: 'inset(0 0 0 0)' }], {
          duration: reducedMotion ? 0 : 700, delay: reducedMotion ? 0 : delay,
          easing: 'cubic-bezier(.76,0,.24,1)', fill: 'both',
        })
        return a.finished.then(() => {
          img.src = src
          return img.decode?.().catch(() => {})
        }).finally(() => {
          stop()
          top.remove()
        })
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
        name: quote.querySelector('.hs-quote__name'),
        img: quote.querySelector('.hs-quote__card img'),
        cap: quote.querySelectorAll('.hs-quote__card p span'),
        bar: quote.querySelector('.hs-quote__bar span'),
      }
      // Khối chữ ĐANG hiện (đổi người là thay bằng khối mới, xem go()).
      let cur = { text: q.text, by: quote.querySelector('.hs-quote__by') }
      const parts = (t) => ({
        text: t.text,
        name: t.by.querySelector('.hs-quote__name') || t.by.querySelector('p'),
        role: t.by.querySelectorAll('p')[1],
      })
      // Danh sách ở <script data-quotes> (CMS sửa). Rỗng thì dùng phần HTML.
      let list = []
      try {
        list = JSON.parse(quote.querySelector('[data-quotes]')?.textContent || '[]').filter(Boolean)
      } catch {}
      if (!list.length)
        list = [{
          num: q.cap[0]?.textContent,
          name: q.cap[1]?.textContent,
          role: q.by[1]?.textContent,
          text: q.text.textContent,
          img: q.img.getAttribute('src'),
        }]
      preloadLater(list.slice(1).map((it) => it.img))

      // Dòng tên / vai trò: chữ thật giữ ở dataset.t để hiệu ứng code đọc lại.
      const setLine = (el, t) => {
        if (!el) return
        el.dataset.t = t
        el.textContent = t
      }
      const fillText = (t, it) => {
        const p = parts(t)
        p.text.textContent = it.text || ''
        setLine(p.name, `[ ${it.name || ''} ]`)
        setLine(p.role, it.role || '')
        // có website thì tên thành link (mở tab mới), không thì chỉ là chữ
        if (p.name?.tagName === 'A') {
          const url = (it.url || '').trim()
          if (url) p.name.href = /^https?:\/\//i.test(url) ? url : `https://${url}`
          else p.name.removeAttribute('href')
        }
      }
      const render = (it, idx) => {
        fillText(cur, it)
        if (q.cap[0]) q.cap[0].textContent = it.num || String(idx + 1).padStart(2, '0')
        if (q.cap[1]) q.cap[1].textContent = it.name || ''
        q.img.alt = it.name || ''
      }
      const setImg = (src) => {
        if (src && q.img.getAttribute('src') !== src) q.img.src = src
      }
      // Đổi ảnh thẻ bằng đoàn shape của 4 ảnh hero (CHANDE_REVEAL.play) — như cặp
      // ảnh Agenda: ảnh cũ / mới vẽ cover thành canvas đúng cỡ khung, shape chạy
      // trong khung tạm chồng khít lên ảnh. Không có REVEAL / giảm chuyển động thì
      // đổi thẳng.
      const coverCanvas = (src, w, h) =>
        new Promise((res) => {
          const im = new Image()
          im.onload = () => {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const k = Math.max(w / im.naturalWidth, h / im.naturalHeight)
            c.getContext('2d').drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k)
            res(c)
          }
          im.onerror = () => res(null)
          im.src = src
        })
      // Đổi ảnh của một thẻ <img> bằng đoàn shape. Mỗi ảnh một hàng đợi riêng (ảnh
      // thẻ + ảnh nền chạy song song). Khung tạm chép transform / translate / scale /
      // clip-path của ảnh (ảnh nền bị lật scaleX(-1); ảnh thẻ có parallax) để shape
      // khớp đúng hình bên dưới.
      const swapEl = (el, src) => {
        const setSrc = () => src && el.getAttribute('src') !== src && (el.src = src)
        const R = window.CHANDE_REVEAL
        if (!src || el.getAttribute('src') === src) return
        if (!R?.play || matchMedia('(prefers-reduced-motion: reduce)').matches) return setSrc()
        el._swapQ = (el._swapQ || Promise.resolve()).then(async () => {
          if (el.getAttribute('src') === src) return
          const dpr = Math.min(devicePixelRatio || 1, 2)
          const w = Math.max(1, Math.round(el.offsetWidth * dpr))
          const h = Math.max(1, Math.round(el.offsetHeight * dpr))
          const [from, to] = await Promise.all([coverCanvas(el.currentSrc || el.src, w, h), coverCanvas(src, w, h)])
          if (!to) return setSrc()
          const box = document.createElement('div')
          const cs = getComputedStyle(el)
          Object.assign(box.style, {
            position: 'absolute', left: `${el.offsetLeft}px`, top: `${el.offsetTop}px`,
            width: `${el.offsetWidth}px`, height: `${el.offsetHeight}px`, pointerEvents: 'none',
            transform: cs.transform === 'none' ? '' : cs.transform,
            translate: el.style.translate, scale: el.style.scale, clipPath: el.style.clipPath,
          })
          el.after(box)
          try {
            await R.play(box, { from, to, levels: 0 }).finished
            setSrc()
            await el.decode?.().catch(() => {})
          } finally {
            box.remove()
          }
        })
      }
      const swapImg = (src) => swapEl(q.img, src)
      // Ảnh nền riêng của từng người (CMS: bg); thiếu thì về ảnh nền mặc định.
      // Đổi kiểu đơn giản: ảnh mới (bản sao chồng khít, giữ lật scaleX(-1) của CSS)
      // mờ dần hiện lên, xong thì gán vào ảnh thật rồi gỡ. Không phóng: ảnh lật
      // phóng ra sẽ tràn sang khung chữ.
      const strip = quote.querySelector('.hs-quote__strip')
      const stripDefault = strip?.getAttribute('src')
      let bgTop = null
      const swapBg = (it) => {
        const src = it.bg || stripDefault
        if (!strip || !src || strip.getAttribute('src') === src) return
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) return void (strip.src = src)
        bgTop?.remove()
        const top = strip.cloneNode()
        top.removeAttribute('data-cms')
        top.removeAttribute('loading')
        top.src = src
        strip.after(top)
        bgTop = top
        const go = () => {
          if (bgTop !== top) return
          const a = top.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 900, easing: 'cubic-bezier(.33,0,.2,1)', fill: 'both' },
          )
          a.finished.then(() => {
            if (bgTop !== top) return
            strip.src = src
            return strip.decode?.().catch(() => {})
          }).catch(() => {}).finally(() => {
            if (bgTop === top) {
              top.remove()
              bgTop = null
            }
          })
        }
        top.decode ? top.decode().then(go, go) : go()
      }
      // Chữ ký viết tay (chande-sign.js). Trống thì lấy tên đầu + chữ cái đầu của
      // chữ cuối: "Huy Phan" -> "HuyP".
      const sign = quote.querySelector('.hs-quote__sign')
      const signText = (it) => {
        if ((it.sign || '').trim()) return it.sign.trim()
        const w = (it.name || '').split(/\s+/).filter((x) => /[\p{L}\d]/u.test(x))
        return w.length > 1 ? w[0] + w.at(-1)[0] : w[0] || ''
      }
      let signShown = false
      const writeSign = (it, delay = 0) => {
        const S = window.CHANDE_SIGN
        if (!sign || !S) return
        clearTimeout(sign._t)
        sign.getAnimations().forEach((a) => a.cancel())
        const fadeOut = sign.childElementCount
          ? sign.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' }).finished
          : Promise.resolve()
        fadeOut.catch(() => {}).then(() => {
          sign._t = setTimeout(() => {
            sign.getAnimations().forEach((a) => a.cancel())
            S.write(sign, signText(it))
          }, delay)
        })
      }
      if (sign) {
        // lần đầu: viết khi section vào màn
        const io = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting || signShown) return
          signShown = true
          io.disconnect()
          writeSign(cur.it || list[0], 300)
        }, { threshold: 0.35 })
        io.observe(quote)
      }

      render(list[0], 0)
      cur.it = list[0]
      setImg(list[0].img)
      if (strip && list[0].bg) strip.src = list[0].bg
      preloadLater(list.map((it) => it.bg))

      // Hover cụm tên: cả hai dòng chạy hiệu ứng "giải mã" — ký tự code ngẫu nhiên
      // chốt dần từ trái sang phải về chữ thật.
      const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$01'
      const scramble = (el, delay = 0) => {
        if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return
        const target = el.dataset.t ?? el.textContent
        const t0 = performance.now() + delay
        const dur = 280 + target.length * 22
        cancelAnimationFrame(el._scr)
        const tick = (now) => {
          if (el.dataset.t !== target) return // đã đổi sang cảm nhận khác
          const k = Math.max(0, (now - t0) / dur)
          let out = ''
          for (let c = 0; c < target.length; c++) {
            const ch = target[c]
            if (ch === ' ' || c < k * target.length) out += ch
            else out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
          }
          el.textContent = out
          if (k < 1) el._scr = requestAnimationFrame(tick)
          else el.textContent = target
        }
        el._scr = requestAnimationFrame(tick)
      }
      // bắt ở cả section: khối tên được thay bằng khối mới mỗi lần đổi người
      quote.addEventListener('pointerover', (e) => {
        const by = e.target.closest?.('.hs-quote__by')
        if (!by || by.classList.contains('is-out') || by.contains(e.relatedTarget)) return
        const p = parts({ text: cur.text, by })
        scramble(p.name)
        scramble(p.role, 90)
      })

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
      // Chữ đổi kiểu "line reveal" (GSAP, mask theo dòng): dòng cũ trượt
      // lên khuất, dòng mới trượt từ dưới lên, mỗi dòng trễ một nhịp; hai lượt gối
      // nhau 0.3s. Cũ / mới cùng tồn tại lúc chuyển -> khối mới là bản sao chồng
      // đúng chỗ (abs), xong thì gỡ khối cũ và trả chữ về thường (revert split).
      // Không có GSAP hoặc giảm chuyển động: mờ đi rồi hiện như cũ.
      let animating = false
      const lineTargets = (t) => [t.text, ...t.by.querySelectorAll('p')]
      const go = (d) => {
        if (!many || animating) return
        i = (i + d + list.length) % list.length
        const it = list[i]
        swapImg(it.img)
        swapBg(it)
        restartBar()
        if (signShown) writeSign(it, 450) // viết sau khi chữ mới bắt đầu trượt vào
        const G = window.gsap
        if (!G || matchMedia('(prefers-reduced-motion: reduce)').matches) {
          clearTimeout(busy)
          quote.classList.add('is-swap')
          busy = setTimeout(() => {
            render(it, i)
            quote.classList.remove('is-swap')
          }, 350)
          return
        }
        animating = true
        const old = cur
        const nxt = { text: old.text.cloneNode(false), by: old.by.cloneNode(true) }
        nxt.by.classList.add('is-enter') // vạch lime chạy từ dưới lên cùng chữ mới
        fillText(nxt, it)
        old.text.after(nxt.text)
        old.by.after(nxt.by)
        old.text.classList.add('is-out')
        old.by.classList.add('is-out')
        // Tách dòng theo ĐÚNG chỗ trình duyệt đang xuống dòng (đo từng ký tự bằng
        // Range trên chữ đang hiện) rồi bọc mỗi dòng: .text-line-mask > .text-line.
        // Không dùng SplitText: nó đo từng từ rời rồi cộng, mất co chữ giữa các từ ->
        // dòng vừa khít rớt chữ cuối ("for me." của Huy Phan) và nhảy lúc trả về.
        // Một dòng thì bọc nguyên con (giữ <a> tên). Khung che có padding chặn
        // text-box: trim của khối -> đo chữ đầu trước / sau rồi kéo khung đầu về.
        const firstGlyph = (el) => {
          const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          while (w.nextNode()) {
            if (!w.currentNode.data.trim()) continue
            const r = document.createRange()
            r.setStart(w.currentNode, 0)
            r.setEnd(w.currentNode, 1)
            return r.getBoundingClientRect().top
          }
          return 0
        }
        const wrap = (nodes) => {
          const m = document.createElement('div')
          m.className = 'text-line-mask'
          const l = document.createElement('div')
          l.className = 'text-line'
          l.append(...nodes)
          m.append(l)
          return m
        }
        const split = (el) => {
          const html = el.innerHTML
          const y0 = firstGlyph(el)
          const nodes = []
          const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
          while (tw.nextNode()) nodes.push(tw.currentNode)
          const r = document.createRange()
          let rows = [] // [{ top, text }]
          if (nodes.length === 1 && el.firstChild === nodes[0]) {
            const n = nodes[0]
            for (let i = 0; i < n.length; i++) {
              r.setStart(n, i)
              r.setEnd(n, i + 1)
              const b = r.getClientRects()[0]
              const top = b ? Math.round(b.top) : rows.at(-1)?.top ?? 0
              const row = rows.at(-1)
              if (!row || (b && Math.abs(top - row.top) > b.height / 2)) rows.push({ top, text: n.data[i] })
              else row.text += n.data[i]
            }
          } else rows = null
          if (rows && rows.length > 1) el.replaceChildren(...rows.map((x) => wrap([document.createTextNode(x.text)])))
          else el.replaceChildren(wrap([...el.childNodes]))
          const first = el.querySelector('.text-line-mask')
          const dy = firstGlyph(el) - y0
          if (first && Math.abs(dy) > 0.1) first.style.marginTop = `${parseFloat(getComputedStyle(first).marginTop) - dy}px`
          return {
            lines: [...el.querySelectorAll('.text-line')],
            revert() {
              el.innerHTML = html
            },
          }
        }
        const sOut = lineTargets(old).map(split)
        const sIn = lineTargets(nxt).map(split)
        const linesIn = sIn.flatMap((x) => x.lines)
        // ±150% (source: 110%): khung che đã nới .12em / .2em cho nét chữ tràn, 110%
        // chưa ra khỏi khung -> sót mẩu chữ thành sọc
        G.set(linesIn, { yPercent: 150 })
        cur = nxt
        cur.it = it
        if (q.cap[0]) q.cap[0].textContent = it.num || String(i + 1).padStart(2, '0')
        if (q.cap[1]) q.cap[1].textContent = it.name || ''
        q.img.alt = it.name || ''
        G.timeline({
          onComplete: () => {
            old.text.remove()
            old.by.remove()
            // gỡ sau khi vạch chạy xong (đổi tên animation khi hover không làm chạy lại lượt vào)
            setTimeout(() => nxt.by.classList.remove('is-enter'), 900)
            sIn.forEach((x) => x.revert())
            animating = false
          },
        })
          .to(sOut.flatMap((x) => x.lines), { yPercent: -150, duration: 0.6, ease: 'power4.inOut', stagger: { amount: 0.25 } }, 0)
          .to(linesIn, { yPercent: 0, duration: 0.7, ease: 'power4.inOut', stagger: { amount: 0.4 } }, '>-=0.3')
      }
      quote.querySelector('.hs-quote__nav--prev')?.addEventListener('click', () => go(-1))
      quote.querySelector('.hs-quote__nav--next')?.addEventListener('click', () => go(1))
      // hết một vòng thanh thì sang cảm nhận kế
      q.bar?.addEventListener('animationiteration', () => go(1))
      // Thanh chờ ở 0 tới LẦN ĐẦU section vào màn (≥ 60%) thì chạy từ đầu; từ đó chạy
      // bình thường (ra khỏi màn cũng không dừng).
      if (q.bar) {
        const barIo = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting) return
          barIo.disconnect()
          restartBar()
          q.bar.parentElement.classList.add('is-run')
        }, { threshold: 0.6 })
        barIo.observe(quote)
      }
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
      preloadLater(pool) // nạp trước (sau khi trang tải xong), hover là có ngay
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
      // Khung đang mở mà trỏ sang tên khác: đổi ảnh bằng đoàn shape của 4 ảnh hero
      // (CHANDE_REVEAL.play, như ảnh thẻ Cảm nhận). Một lượt đang chạy thì KHÔNG cắt
      // ngang (cắt là giật về ảnh cũ) — ghi lại tên mới nhất, chạy xong thì sang
      // thẳng ảnh đó. Khung đang đóng thì đặt ảnh rồi mở khung như cũ.
      const coverCanvas = (src, w, h) =>
        new Promise((res) => {
          const im = new Image()
          im.onload = () => {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const k = Math.max(w / im.naturalWidth, h / im.naturalHeight)
            c.getContext('2d').drawImage(im, (w - im.naturalWidth * k) / 2, (h - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k)
            res(c)
          }
          im.onerror = () => res(null)
          im.src = src
        })
      let want = '' // ảnh cần hiện (tên đang trỏ)
      let running = false
      const pump = async () => {
        const R = window.CHANDE_REVEAL
        if (running) return
        running = true
        try {
          while (want && face.classList.contains('is-on') && img.getAttribute('src') !== want) {
            const src = want
            if (!R?.play || matchMedia('(prefers-reduced-motion: reduce)').matches) {
              img.src = src
              break
            }
            const dpr = Math.min(devicePixelRatio || 1, 2)
            const w = Math.max(1, Math.round(img.offsetWidth * dpr))
            const h = Math.max(1, Math.round(img.offsetHeight * dpr))
            const [from, to] = await Promise.all([coverCanvas(img.currentSrc || img.src, w, h), coverCanvas(src, w, h)])
            if (!to) {
              img.src = src
              break
            }
            const box = document.createElement('div')
            box.style.cssText = 'position:absolute;inset:0;pointer-events:none'
            face.append(box)
            try {
              await R.play(box, { from, to, levels: 0 }).finished
              img.src = src
              await img.decode?.().catch(() => {})
            } finally {
              box.remove()
            }
          }
        } finally {
          running = false
        }
      }
      let active = null
      foot.addEventListener('pointerover', (e) => {
        const nm = e.target.closest('.nm')
        if (!nm || nm === active || !nm.dataset.photo) return
        active?.classList.remove('is-active')
        active = nm
        nm.classList.add('is-active')
        img.alt = nm.textContent
        want = nm.dataset.photo
        if (!face.classList.contains('is-on')) {
          img.src = want
          face.classList.add('is-on')
        } else pump()
      })
      foot.querySelectorAll('.names').forEach((block) =>
        block.addEventListener('pointerleave', () => {
          active?.classList.remove('is-active')
          active = null
          want = ''
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
