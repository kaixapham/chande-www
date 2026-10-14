/* =============================================================================
 * CHANDE — Hành vi nhỏ của các section trang chủ (sau hero)
 * -----------------------------------------------------------------------------
 *   • [data-marquee]   dải chạy ngang (CSS animation) — ngoài màn hình thì gắn
 *                      .is-off để dừng, đỡ việc cho trình duyệt
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
  const WEBKIT = /^((?!chrome|chromium|android|edg).)*safari/i.test(navigator.userAgent) || /iP(hone|ad|od)/.test(navigator.userAgent)

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
  // Canh video: để trang lâu (tab nền, máy ngủ, trình duyệt thu hồi bộ giải mã / mạng đứt giữa
  // chừng) video có thể đứng / lỗi / mất khung -> ô recap trống. Quay lại tab, cứ vài giây, hoặc khi
  // video báo lỗi / nghẽn: nếu không chạy được thì nạp lại nguồn và phát tiếp đúng chỗ.
  const reviveVideos = () => {
    if (document.hidden) return
    document.querySelectorAll('video[autoplay][src]').forEach((v) => {
      if (!v.isConnected) return
      const broken = v.error || v.networkState === 3 /* NO_SOURCE */ || (v.readyState < 2 && !v.seeking && v._kick > 1)
      if (broken) {
        const t = v.currentTime || 0
        v._kick = 0
        v.load()
        v.addEventListener('loadedmetadata', () => { try { v.currentTime = t } catch {} }, { once: true })
      }
      if (v.readyState < 2) v._kick = (v._kick || 0) + 1
      else v._kick = 0
      if (v.paused) v.play?.().catch(() => {})
    })
  }
  document.addEventListener('visibilitychange', reviveVideos)
  addEventListener('focus', reviveVideos)
  addEventListener('pageshow', reviveVideos)
  setInterval(reviveVideos, 4000)
  document.addEventListener('error', (e) => e.target.tagName === 'VIDEO' && setTimeout(reviveVideos, 500), true)
  document.addEventListener('stalled', (e) => e.target.tagName === 'VIDEO' && setTimeout(reviveVideos, 3000), true)
  window.barba?.hooks?.afterEnter(() => setTimeout(startVideos, 300))

  function preloadLater(list) {
    preloadQ.push(...(list || []).filter(Boolean))
    if (preloadOn) preloadRun()
  }

  let io = null
  let decodeIo = null
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

    // Giải mã trước ảnh lazy khi còn cách màn ~1.5 màn (img.decode() — luồng nền). Không có
    // bước này thì ảnh to (About: 1500 × 2000, 2000 × 1501…) bị giải mã ngay khung đầu nó
    // lên màn -> lần cuộn đầu tới cụm 3 vòng tròn đứng trang ~100 ms.
    decodeIo = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return
          decodeIo.unobserve(e.target)
          e.target.loading = 'eager'
          // Safari (WebKit): đang decode() dở mà script khác vẽ cùng ảnh đó lên canvas thì ra canvas RỖNG
          // (ảnh dither cả nhóm trang About thành mảng đen) -> chỉ tải sớm, không decode trước
          if (!WEBKIT) e.target.decode?.().catch(() => {})
        }),
      { rootMargin: '150% 0px' },
    )
    scope.querySelectorAll('img[loading="lazy"]:not([src$=".svg"])').forEach((img) => decodeIo.observe(img))

    // Việc chạy theo cuộn: gom chung MỘT listener + một rAF, mỗi việc chỉ ghi DOM
    // khi giá trị đổi.
    const jobs = []

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
          // mobile (≤ 899px) ẩn cụm ngày dính -> không có nền tối (Figma mobile giữ nền trắng)
          const y = dateTop.offsetParent ? dateTop.getBoundingClientRect().top : null
          const on = y !== null && shots.some((s) => {
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
          if (dates && !dates.offsetParent) return // cụm ngày đang ẩn (mobile)
          const line = innerHeight * 0.6
          let i = 0
          heads.forEach((h, k) => h.getBoundingClientRect().top < line && (i = k))
          show(i)
        })
      }
      // Nút ‹ › hai bên: đổi sang cặp ảnh ngày 2 kế tiếp ([data-agenda-slides]), quay vòng. Đoàn shape màu
      // chạy từ góc dưới phải (prepCorner / runCorner); giảm chuyển động thì quét ngang theo hướng bấm.
      // danh sách CẶP (trái · phải) ở <script data-agenda-pairs> — CMS sửa từng cặp; bên nào trống thì
      // lấy ảnh bên kia. Không có thì đọc data-photos riêng từng bên như trước.
      let pairs = null
      try {
        pairs = JSON.parse(agenda.querySelector('script[data-agenda-pairs]')?.textContent || 'null')
      } catch {}
      if (!Array.isArray(pairs) || !pairs.length) pairs = null
      const slides = [...agenda.querySelectorAll('[data-agenda-slides]')].map((box, side) => {
        let list = []
        try {
          list = pairs
            ? pairs.map((p) => (side ? p.right || p.left : p.left || p.right)).filter(Boolean)
            : JSON.parse(box.dataset.photos || '[]')
        } catch {}
        const img = box.querySelector('img')
        if (list[0] && img.getAttribute('src') !== list[0]) img.src = list[0]
        preloadLater(list.slice(1))
        return { box, img, list }
      })
      let slideIdx = 0
      let sliding = false
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
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
      // ảnh kế tiếp của một bên. Bên nào có < 2 ảnh (CMS mới nhập 1) thì mượn thêm ảnh của bên kia
      // (ảnh của chính nó đứng đầu) -> bấm ‹ › lúc nào cũng đổi CẢ HAI ảnh; trùng ảnh bên kia thì nhảy tiếp
      const pick = (s, avoid) => {
        const own = s.list.length ? s.list : [s.img.getAttribute('src')]
        const pool = own.length > 1 ? own : [...new Set([...own, ...slides.flatMap((o) => o.list)])]
        const at = (k) => pool[((k % pool.length) + pool.length) % pool.length]
        let src = at(slideIdx)
        for (let k = 1; avoid.has(src) && k < pool.length; k++) src = at(slideIdx + k)
        return src
      }
      // Đổi ảnh: đoàn shape màu của hero (CHANDE_REVEAL.play) chạy từ góc dưới phải, toa cuối là ảnh mới
      // (phóng mượt — ảnh chụp thường, không dither). Ảnh cũ / mới vẽ kiểu cover
      // (đúng object-position của ảnh thật) thành canvas cỡ khung; khung tạm chép parallax (follow).
      const cover = (src, w, h, pos) =>
        new Promise((res) => {
          const im = new Image()
          im.onload = () => {
            const c = document.createElement('canvas')
            c.width = w
            c.height = h
            const k = Math.max(w / im.naturalWidth, h / im.naturalHeight)
            const dw = im.naturalWidth * k
            const dh = im.naturalHeight * k
            const x = c.getContext('2d')
            x.imageSmoothingQuality = 'high'
            x.drawImage(im, (w - dw) * pos[0], (h - dh) * pos[1], dw, dh)
            res(c)
          }
          im.onerror = () => res(null)
          im.src = src
        })
      // chuẩn bị (nạp + vẽ ảnh cũ / mới) rồi trả về run() — cặp ảnh chuẩn bị xong cả hai mới cùng chạy
      const prepCorner = async (img, src) => {
        const R = window.CHANDE_REVEAL
        if (!R?.play) return () => ((img.src = src), Promise.resolve())
        const dpr = Math.min(devicePixelRatio || 1, 2)
        const w = Math.max(1, Math.round(img.offsetWidth * dpr))
        const h = Math.max(1, Math.round(img.offsetHeight * dpr))
        const op = getComputedStyle(img).objectPosition.split(/\s+/).map((v) => (/%$/.test(v) ? parseFloat(v) / 100 : 0.5))
        const pos = [op[0] ?? 0.5, op[1] ?? 0.5]
        const [from, to] = await Promise.all([cover(img.currentSrc || img.src, w, h, pos), cover(src, w, h, pos)])
        if (!to) return () => ((img.src = src), Promise.resolve())
        return () => runCorner(R, img, src, from, to)
      }
      const runCorner = async (R, img, src, from, to) => {
        const box = document.createElement('div')
        Object.assign(box.style, {
          position: 'absolute', left: `${img.offsetLeft}px`, top: `${img.offsetTop}px`,
          width: `${img.offsetWidth}px`, height: `${img.offsetHeight}px`, pointerEvents: 'none',
        })
        img.after(box) // ngay sau ảnh: lớp graphic phía sau (thanh, dải viên, ô khảm) vẫn nằm trên
        const stop = follow(img, box)
        try {
          await R.play(box, { from, to, levels: 0, smooth: true }).finished
          img.src = src
          await img.decode?.().catch(() => {})
        } finally {
          stop()
          box.remove()
        }
      }
      const swap = ({ img }, d, delay, src) => {
        if (!src || src === img.getAttribute('src')) return Promise.resolve()
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
        if (sliding || !slides.length || new Set(slides.flatMap((s) => s.list)).size < 2) return
        sliding = true
        slideIdx += d
        const used = new Set()
        const srcs = slides.map((s) => {
          const src = pick(s, used)
          used.add(src)
          return src
        })
        // hai ảnh chạy CÙNG LÚC: chuẩn bị xong cả hai rồi mới bấm chạy (giảm chuyển động: quét ngang)
        const go = reducedMotion
          ? Promise.all(slides.map((s, i) => swap(s, d, 0, srcs[i])))
          : Promise.all(slides.map((s, i) => {
              if (!srcs[i] || srcs[i] === s.img.getAttribute('src')) return null
              if (!s.img.getClientRects().length) return void (s.img.src = srcs[i]) // bên đang ẩn (mobile chỉ hiện ảnh phải): đổi thẳng
              return prepCorner(s.img, srcs[i])
            })).then((runs) =>
              Promise.all(runs.map((run) => run?.())),
            )
        go.catch(() => {}).finally(() => (sliding = false))
      }
      // Ảnh ngày 1 ([data-agenda-auto]): thanh process neon ở mép trên, chạy hết (AUTO ms) thì tự đổi
      // sang ảnh kế tiếp (ảnh trong <img> + data-photos, quay vòng; hiệu ứng như cặp ảnh ngày 2) rồi
      // chạy lại. Chỉ chạy khi ảnh đang trong màn.
      const AUTO = 6000
      const auto = agenda.querySelector('[data-agenda-auto]')
      if (auto) {
        const aimg = auto.querySelector('img')
        let alist = []
        try {
          alist = JSON.parse(auto.dataset.photos || '[]')
        } catch {}
        // danh sách (CMS) là nguồn: ảnh đầu danh sách hiện trước; danh sách trống thì giữ ảnh trong <img>
        alist = [...new Set(alist.filter(Boolean))]
        if (!alist.length) alist = [aimg.getAttribute('src')]
        else if (aimg.getAttribute('src') !== alist[0]) aimg.src = alist[0]
        preloadLater(alist.slice(1))
        if (alist.length > 1) {
          let ai = 0
          const prog = document.createElement('i')
          prog.className = 'agenda__prog'
          prog.setAttribute('aria-hidden', 'true')
          prog.innerHTML = '<b></b>'
          auto.append(prog)
          let anim = null
          let seen = false
          const advance = () => {
            ai = (ai + 1) % alist.length
            const src = alist[ai]
            if (!reducedMotion) return prepCorner(aimg, src).then((run) => run()).catch(() => {})
            aimg.src = src
          }
          const run = () => {
            anim?.cancel()
            anim = prog.firstChild.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: AUTO, easing: 'linear', fill: 'forwards' })
            if (!seen) anim.pause()
            anim.onfinish = () => {
              if (!agenda.isConnected) return
              advance()
              run()
            }
          }
          new IntersectionObserver(([e]) => {
            seen = e.isIntersecting
            if (anim) seen ? anim.play() : anim.pause()
          }).observe(auto)
          run()
        }
      }
      // Ảnh ngày 3 (chỉ bản mobile, [data-agenda-night]): nút ‹ › trên dải effect đổi lần lượt ảnh trong
      // data-photos (CMS "Ảnh ngày 3"), quay vòng, cùng hiệu ứng đoàn shape như ảnh ngày 1 / cặp ảnh ngày 2.
      const night = agenda.querySelector('[data-agenda-night]')
      if (night) {
        const nimg = night.querySelector('img')
        let nlist = []
        try {
          nlist = JSON.parse(night.dataset.photos || '[]')
        } catch {}
        nlist = [...new Set(nlist.filter(Boolean))]
        if (!nlist.length) nlist = [nimg.getAttribute('src')]
        else if (nimg.getAttribute('src') !== nlist[0]) nimg.src = nlist[0]
        const navs = night.querySelectorAll('[data-night-nav]')
        if (nlist.length < 2) navs.forEach((b) => (b.hidden = true))
        let ni = 0
        let busy = false
        const go = (d) => {
          if (busy || nlist.length < 2) return
          busy = true
          ni = (ni + d + nlist.length) % nlist.length
          const src = nlist[ni]
          const run = reducedMotion ? Promise.resolve((nimg.src = src)) : prepCorner(nimg, src).then((r) => r())
          run.catch(() => {}).finally(() => (busy = false))
        }
        navs.forEach((b) => b.addEventListener('click', () => go(+b.dataset.nightNav)))
        // nạp trước các ảnh kế khi khung sắp vào màn (desktop ẩn khung -> không nạp)
        const nio = new IntersectionObserver(([e]) => {
          if (!e.isIntersecting || !night.getClientRects().length) return
          nio.disconnect()
          preloadLater(nlist.slice(1))
        }, { rootMargin: '100% 0px' })
        nio.observe(night)
      }
      prev?.addEventListener('click', () => slide(-1))
      next?.addEventListener('click', () => slide(1))
      prev?.setAttribute('aria-label', 'Ảnh trước')
      next?.setAttribute('aria-label', 'Ảnh sau')
    }

    // Cảm nhận: mục 0 đọc từ HTML, các mục sau từ <script data-quotes>.
    const quote = scope.querySelector('.hs-quote')
    if (quote) {
      // Màn hẹp (Figma Testimonial mobile): cỡ lời cảm nhận = 36 ở khổ 375, co theo bề ngang; màn
      // thấp thì nhỏ lại cho vừa phần còn lại của một màn (100svh − header, đọc từ min-height của
      // section). Chiều cao khối chữ ~ k · cỡ² / bề ngang (k ≈ 105 đo ở khổ 375: lời dài nhất 362px @36; dùng 120 cho dư — dòng ngắt không đều)
      // -> cỡ tối đa = √(chỗ trống · bề ngang / k). CSS không có căn của độ dài nên tính ở đây.
      const fitQuote = () => {
        if (!quote.isConnected) return removeEventListener('resize', fitQuote)
        if (!matchMedia('(max-width: 899px)').matches) return quote.style.removeProperty('--qfs')
        const W = quote.clientWidth
        const room = parseFloat(getComputedStyle(quote).minHeight) - (174 / 375) * W - 56 - 75 - 16 - 24
        const fs = Math.max(24, Math.min((36 / 375) * W, Math.sqrt(Math.max(0, room) * W / 120)))
        quote.style.setProperty('--qfs', `${fs.toFixed(2)}px`)
      }
      fitQuote()
      addEventListener('resize', fitQuote)
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
      // Đổi ảnh thẻ bằng đoàn shape của 4 ảnh hero (CHANDE_REVEAL.play):
      // ảnh cũ / mới vẽ cover thành canvas đúng cỡ khung, shape chạy
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
      const foot = face.closest('.hs-foot')
      const nms = []
      foot.querySelectorAll('.names span').forEach((line) => {
        if (line.children.length || !line.textContent.trim()) return
        const parts = line.textContent.split(/(\s\/\s?)/)
        line.textContent = ''
        parts.forEach((part) => {
          if (/^\s\/\s?$/.test(part) || !part.trim()) return void line.append(part)
          const nm = document.createElement('span')
          nm.className = 'nm'
          nm.textContent = part
          line.append(nm)
          nms.push(nm)
        })
      })
      // Ảnh lấy theo danh sách người ở hero trang chủ ([data-hero-people], CMS "Người tham gia ở
      // hero"): tên footer trùng tên người nào (bỏ dấu / hoa thường / ngoặc) thì đúng ảnh người đó,
      // không trùng ai thì lấy lần lượt ảnh trong danh sách. Trang khác không có danh sách -> đọc từ
      // index.html (một lần). Không đọc được thì dùng data-photos như cũ.
      // tên -> chữ thường không dấu, các từ cách nhau một khoảng trắng
      const norm = (t) => ' ' + t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '
      const flat = (k) => k.replace(/ /g, '').replace(/(.)\1+/g, '$1') // bỏ chữ gõ lặp: Buixxii = BuiXii
      // Biệt danh ở footer -> tên trong danh sách hero (viết thường, không dấu)
      const ALIAS = {
        'dinh tren duong tau': 'huong pham',
        'thu sinh phap': 'huu phap', // Thu Sinh (Pháp) = Huu Phap
        'nguyen v hung': 'van hung', // Nguyen V.Hung = Van Hung
      }
      // Ảnh riêng cho tên footer KHÔNG có trong danh sách hero
      const OWN = {
        'nhatminh p': 'assets/img/home/foot-nhatminh-p.webp',
        'tuyen n': 'assets/img/home/foot-tuyen-n.webp',
        'duongg vu': 'assets/img/home/foot-duongg-vu.webp', // Duongg Vu (2 chữ g) — khác Duong Vu ở hero
        justhiutwokay: 'assets/img/home/foot-justhiutwokay.webp',
      }
      const assign = (people) => {
        const list = people.filter((p) => p && p.img && !/\.svg$/i.test(p.img))
        const photos = list.length ? list.map((p) => p.img) : pool
        const keys = list.map((p) => [norm(p.name || ''), p.img]).filter(([k]) => k.trim())
        const miss = []
        nms.forEach((nm) => {
          if (nm.dataset.photo) return
          let k = norm(nm.textContent)
          // người không có trong danh sách hero nhưng có ảnh riêng
          if (OWN[k.trim()]) return void (nm.dataset.photo = OWN[k.trim()])
          if (ALIAS[k.trim()]) k = norm(ALIAS[k.trim()])
          // trùng hẳn (kể cả viết liền: "minhsharing" = "Minh Sharing") > tên hero là cụm từ nguyên vẹn
          // trong tên footer ("Huy Ta (remote)" ∋ "Huy Ta"), ưu tiên cụm dài nhất
          const hit =
            keys.find(([h]) => flat(h) === flat(k)) ||
            keys.filter(([h]) => k.includes(h)).sort((a, b) => b[0].length - a[0].length)[0]
          if (hit) nm.dataset.photo = hit[1]
          else miss.push(nm)
        })
        // cặp tên (.pair): phần sau dùng ảnh phần đầu — trừ tên có ảnh riêng (OWN, vd. "(Tuyen.N)")
        const pairs = [...foot.querySelectorAll('.pair')].map((pair) => [...pair.querySelectorAll('.nm')])
        pairs.forEach(([, ...rest]) => rest.forEach((nm) => miss.includes(nm) && miss.splice(miss.indexOf(nm), 1)))
        // tên không khớp ai: lấy lần lượt ảnh của người CHƯA có tên ở footer (khỏi trùng mặt người khác)
        const used = new Set(nms.map((nm) => nm.dataset.photo))
        const rest = photos.filter((src) => !used.has(src))
        const from = rest.length ? rest : photos
        miss.forEach((nm, i) => (nm.dataset.photo = from[i % Math.max(1, from.length)] || ''))
        pairs.forEach(([first, ...rest]) => rest.forEach((nm) => OWN[norm(nm.textContent).trim()] || (nm.dataset.photo = first?.dataset.photo || ''))) // tên có ảnh riêng thì giữ
        preloadLater([...new Set(nms.map((nm) => nm.dataset.photo).filter(Boolean))]) // nạp trước, hover là có ngay
      }
      const readPeople = (doc) => {
        try {
          return JSON.parse(doc.querySelector('[data-hero-people]')?.textContent || 'null')
        } catch {
          return null
        }
      }
      const here = readPeople(document)
      if (here) assign(here)
      else {
        assign([]) // tạm theo data-photos, có danh sách thì thay
        ;(window.__chandePeople ||= fetch('index.html')
          .then((r) => r.text())
          .then((html) => readPeople(new DOMParser().parseFromString(html, 'text/html')))
          .catch(() => null)
        ).then((people) => {
          if (!people) return
          nms.forEach((nm) => delete nm.dataset.photo)
          assign(people)
        })
      }
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
      const show = (nm) => {
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
      }
      foot.addEventListener('pointerover', (e) => show(e.target.closest('.nm')))
      // Màn cảm ứng (không rê chuột được): ô ảnh vào màn thì tự chạy lần lượt từng tên — tên sáng lên,
      // ảnh đổi bằng đoàn shape như lúc hover; ra khỏi màn thì dừng.
      if (matchMedia('(hover: none)').matches) {
        const AUTO = 2400 // ms mỗi người
        let k = -1
        let timer = 0
        const step = () => {
          if (!face.isConnected) return void (clearInterval(timer), io.disconnect())
          const list = nms.filter((nm) => nm.dataset.photo)
          if (!list.length) return
          k = (k + 1) % list.length
          show(list[k])
        }
        const io = new IntersectionObserver(([e]) => {
          clearInterval(timer)
          timer = 0
          if (!e.isIntersecting) return
          step()
          timer = setInterval(step, AUTO)
        }, { threshold: 0.2 })
        io.observe(face) // (khối cha .hs-foot__col trên mobile là display:contents — không quan sát được)
      }
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
    decodeIo?.disconnect()
    decodeIo = null
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

/* -----------------------------------------------------------------------------
 * Video đầy đủ: bấm ô có data-video (mã YouTube, vd. ô "Video recap" ở hero) -> khung xem toàn màn.
 * iframe YouTube chỉ nạp lúc bấm (youtube-nocookie: không cookie theo dõi trước khi phát; rel=0: hết
 * video chỉ gợi ý video cùng kênh). Đóng: nút ×, Esc, bấm nền, chuyển trang. Mở thì khoá cuộn (Lenis).
 * -------------------------------------------------------------------------- */
;(() => {
  let box = null
  let lastFocus = null
  const lenis = () => window.CHANDE_TRANSITION?.lenis
  function close() {
    if (!box) return
    const b = box
    box = null
    b.classList.remove('is-open')
    document.documentElement.classList.remove('vbox-open')
    lenis()?.start?.()
    setTimeout(() => b.remove(), 400)
    lastFocus?.focus?.({ preventScroll: true })
  }
  function open(id) {
    if (box || !/^[\w-]{6,20}$/.test(id)) return
    lastFocus = document.activeElement
    box = document.createElement('div')
    box.className = 'vbox'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-modal', 'true')
    box.setAttribute('aria-label', 'Video recap')
    const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&playsinline=1&modestbranding=1`
    box.innerHTML = `<div class="vbox__frame"><iframe src="${src}" title="Video recap Chande Bootcamp" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><button class="vbox__close" type="button" aria-label="Đóng video"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4l12 12M16 4L4 16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`
    document.body.append(box)
    document.documentElement.classList.add('vbox-open')
    lenis()?.stop?.()
    requestAnimationFrame(() => box?.classList.add('is-open'))
    box.querySelector('.vbox__close').focus({ preventScroll: true })
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('.vbox__close')) close()
    })
  }
  document.addEventListener('click', (e) => {
    const el = e.target.closest?.('[data-video]')
    if (el) {
      e.preventDefault()
      open(el.dataset.video)
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') return close()
    const el = (e.key === 'Enter' || e.key === ' ') && e.target.closest?.('[data-video]')
    if (el) {
      e.preventDefault()
      open(el.dataset.video)
    }
  })
  window.barba?.hooks?.before(() => close())
})()
