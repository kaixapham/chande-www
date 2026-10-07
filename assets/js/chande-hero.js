/* =============================================================================
 * CHANDE BOOTCAMP — Hero trang chủ
 * -----------------------------------------------------------------------------
 * Dựng theo Figma "Chande WWW" node 513:33865. Phần dựng hình nằm trong
 * site.css (.hero*); file này chỉ lo ba việc:
 *
 *   1. DITHER — Figma phủ effect "Dither" (Bayer 16×16, pixel size 1) lên 4 ảnh
 *      chân dung (6 / 4 / 4 / 6 mức) và hai mảng nền tối (8 mức). Runtime
 *      shader của Figma cần WebGPU + HTML-in-Canvas nên không chạy được trên
 *      trình duyệt thật; ở đây chép lại ĐÚNG phép tính của nhánh "ordered"
 *      trong shader đó, chạy bằng canvas 2D:
 *          q = clamp(round((c + (t - 0.5) / L) * L) / L, 0, 1),  L = levels - 1
 *      Canvas vẽ ở 2× cỡ CSS (xem CONFIG.scale) cho khớp độ mịn của Figma.
 *
 *   2. VÒNG ĐỔI ẢNH — thanh process xanh neon chạy hết thì cả 4 ô nhận 4 người
 *      kế tiếp trong danh sách <script type="application/json" data-hero-people>.
 *      Danh sách ≤ 4 người thì xoay vòng từng người một. Mặc định mỗi ô đổi
 *      bằng đoàn shape màu của chande-reveal.js (tools/profile-reveal), chạy
 *      lần lượt từ ô thấp nhất lên ô cao nhất, lệch nhau CONFIG.revealStagger.
 *
 *   3. VÒNG ĐỜI QUA BARBA — header nằm ngoài container nên trang chủ có thể
 *      được Barba nạp vào sau; module tự mount khi gặp [data-hero] và gỡ khi
 *      rời trang. Vì vậy file phải được nhúng ở CẢ BA trang.
 *
 * Chỉ bắt đầu chạy vòng đổi ảnh sau 'chande-loading:done' — lượt đầu không bị
 * nuốt mất dưới màn loading.
 *
 * API lúc chạy:
 *   window.CHANDE_HERO = { config, defaults, mount(root), destroy(), refresh(),
 *                          next(), pause(), play() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    // Chiều cao ẢNH (không tính thanh tên), chung cho cả 4 ô, % chiều cao
    // viewport đầu. 25 = 270 / 1080 như Figma. Ghi vào biến CSS --img của
    // .hero__stage; vị trí ảnh dưới, mảng nền và thanh process đều suy ra từ
    // đây (xem site.css).
    imageHeight: 25,
    // Nền tối (html.hero-row-dark): khi 4 ảnh đã thành MỘT HÀNG và hàng đó CHẠM
    // ĐÁY hero (hết đoạn sticky, ảnh bắt đầu trôi lên theo trang). Từ đó cuộn
    // xuống tiếp vẫn giữ tối; chỉ cuộn NGƯỢC lên trên điểm đó mới về nền kem.
    // Tắt ở bảng setting (phím H) → Hero home.
    darkOnRow: true,
    cycle: 6000, // ms — thanh process chạy từ 0 tới đầy
    // Cách đổi ảnh: 'shapes' = đoàn shape màu bay chéo (chande-reveal.js, cấu
    // hình ở CHANDE_REVEAL.config); 'wipe' = ảnh mới quét lên như bản đầu.
    // Thiếu chande-reveal.js thì tự lùi về 'wipe'.
    effect: 'shapes',
    // Thứ tự 4 ô theo vị trí dọc trên màn: 'bottomUp' = ô thấp nhất chạy trước
    // rồi đẩy dần lên ô cao nhất (04 -> 01); 'topDown' ngược lại.
    order: 'bottomUp',
    // ms — ô sau bắt đầu chạy shape trễ hơn ô trước. Để nhỏ (0.1–0.3s) cho 4 ô
    // gần như cùng lúc; 0 = cả 4 ô bật một lượt. To quá thì thành leo bậc thang.
    revealStagger: 150,
    // Block reveal của thanh tên — cùng nhịp với chữ màn loading.
    capReveal: { stagger: 55, inDuration: 320, hold: 90, outDuration: 380, ease: 'cubic-bezier(0.86, 0, 0.07, 1)' },
    swapDuration: 900, // ms — kiểu 'wipe': ảnh mới quét lên phủ ảnh cũ
    swapStagger: 90, // ms — kiểu 'wipe': lệch giữa 4 ô (trái -> phải)
    retract: 520, // ms — thanh process rút về sau mỗi lượt
    ease: 'cubic-bezier(.76,0,.24,1)',
    bayer: 16, // cỡ ma trận Bayer, khớp "Bayer 16x16" của Figma
    // Figma chạy shader ở 2x rồi thu về 1x, nên hạt dither mịn hơn hẳn so với
    // dither thẳng ở 1 CSS-px (đo trên bản export: mảng #182220 ra các giá trị
    // trung gian 12..36 chứ không chỉ 0 / 36). Vẽ canvas gấp `scale` lần cỡ CSS
    // rồi để trình duyệt thu nhỏ: màn retina thấy đúng 1 hạt = 1 điểm ảnh.
    scale: 2,
    // Dither trên 4 ảnh chân dung. Tắt để đỡ lag: dither phải đọc/ghi lại từng
    // điểm ảnh (getImageData) mỗi lần vẽ, và `willReadFrequently` ép canvas chạy
    // bằng CPU thay vì GPU. Tắt thì ảnh vẽ thẳng, canvas vẫn tăng tốc phần cứng.
    ditherImages: false,
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('hero', CONFIG)

  const DEFAULTS = structuredClone(CONFIG)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  /* ------------------------------------------------------------- Dither --- */
  // Ma trận Bayer dựng đúng như bayerMatrix() trong shader của Figma
  // (thứ tự góc phần tư 0 / 2 / 3 / 1), chuẩn hoá về (m + 0.5) / N².
  const BAYER = (() => {
    const build = (n) => {
      if (n === 1) return [[0]]
      const small = build(n / 2)
      const m = n / 2
      const out = []
      for (let y = 0; y < n; y++) {
        out[y] = []
        for (let x = 0; x < n; x++) {
          const qx = Math.floor(x / m)
          const qy = Math.floor(y / m)
          const q = qy === 0 && qx === 0 ? 0 : qy === 0 && qx === 1 ? 2 : qy === 1 && qx === 0 ? 3 : 1
          out[y][x] = small[y % m][x % m] * 4 + q
        }
      }
      return out
    }
    const N = CONFIG.bayer
    const m = build(N)
    const t = new Float32Array(N * N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = (m[y][x] + 0.5) / (N * N)
    return t
  })()

  function ditherPixels(img, levels) {
    const N = CONFIG.bayer
    const L = levels - 1
    const d = img.data
    const w = img.width
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const x = p % w
      const y = (p / w) | 0
      const off = (BAYER[(y % N) * N + (x % N)] - 0.5) / L
      for (let c = 0; c < 3; c++) {
        const v = Math.round((d[i + c] / 255 + off) * L) / L
        d[i + c] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
      }
    }
    return img
  }

  // Màu phẳng: kết quả chỉ phụ thuộc (x mod N, y mod N) nên chỉ cần một tile N×N.
  const tileCache = new Map()
  function flatTile(hex, levels) {
    const key = hex + '/' + levels
    if (tileCache.has(key)) return tileCache.get(key)
    const N = CONFIG.bayer
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d')
    ctx.fillStyle = hex
    ctx.fillRect(0, 0, N, N)
    ctx.putImageData(ditherPixels(ctx.getImageData(0, 0, N, N), levels), 0, 0)
    const url = `url(${c.toDataURL()})`
    tileCache.set(key, url)
    return url
  }

  // object-position "50% 100%" -> [0.5, 1]
  function parsePos(pos) {
    const p = String(pos || '50% 50%').split(/\s+/).map((s) => parseFloat(s) / 100)
    return [isFinite(p[0]) ? p[0] : 0.5, isFinite(p[1]) ? p[1] : 0.5]
  }

  const imgCache = new Map()
  function loadImage(src) {
    if (!imgCache.has(src)) {
      imgCache.set(
        src,
        new Promise((res, rej) => {
          const im = new Image()
          im.decoding = 'async'
          im.onload = () => res(im)
          im.onerror = rej
          im.src = src
        }),
      )
    }
    return imgCache.get(src)
  }

  // Vẽ ảnh kiểu object-fit: cover vào canvas đúng cỡ CSS của khung rồi dither.
  async function renderPortrait(canvas, box, person, levels) {
    const im = await loadImage(person.img)
    const cw = Math.round(box.clientWidth)
    const ch = Math.round(box.clientHeight)
    const dither = CONFIG.ditherImages
    const scale = dither ? CONFIG.scale : Math.min(window.devicePixelRatio || 1, 2)
    const w = Math.max(1, Math.round(cw * scale))
    const h = Math.max(1, Math.round(ch * scale))
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', dither ? { willReadFrequently: true } : undefined)
    const s = Math.max(w / im.naturalWidth, h / im.naturalHeight)
    const dw = im.naturalWidth * s
    const dh = im.naturalHeight * s
    const [px, py] = parsePos(person.pos)
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(im, (w - dw) * px, (h - dh) * py, dw, dh)
    if (dither) ctx.putImageData(ditherPixels(ctx.getImageData(0, 0, w, h), levels), 0, 0)
    canvas.dataset.w = cw
    canvas.dataset.h = ch
    return canvas
  }

  /* --------------------------------------------------------------- Hero --- */
  let H = null // trạng thái của lần mount hiện tại

  function readPeople(root, slots) {
    const tag = root.querySelector('[data-hero-people]')
    try {
      const list = JSON.parse(tag?.textContent || '[]')
      if (Array.isArray(list) && list.length) return list
    } catch (e) {
      console.warn('[chande-hero] JSON danh sách người lỗi:', e)
    }
    // Không có danh sách thì lấy luôn 4 ô đang có trong HTML.
    return slots.map((s) => {
      const [num, name] = s.querySelectorAll('.hero-card__cap > span')
      const img = s.querySelector('.hero-card__media img')
      return { num: num?.textContent, name: name?.textContent, img: img?.getAttribute('src'), pos: img?.style.objectPosition }
    })
  }

  function mount(root) {
    const hero = root.querySelector?.('[data-hero]') || (root.matches?.('[data-hero]') ? root : null)
    if (!hero || H?.hero === hero) return
    destroy()

    const slots = [...hero.querySelectorAll('[data-hero-slot]')]
    const people = readPeople(hero, slots)
    const state = (H = {
      hero,
      slots,
      people,
      offset: 0,
      fill: hero.querySelector('[data-hero-fill]'),
      bar: hero.querySelector('.hero__progress'),
      anims: new Set(),
      fillAnim: null,
      paused: false,
      alive: true,
    })

    applyHeights()

    // CSS để thanh ở 402/492 như Figma cho bản không JS; có JS thì nó đứng ở 0
    // chờ loading xong, không nhảy từ 82% về 0 lúc bắt đầu chạy.
    state.fill.style.transform = 'scaleX(0)'

    // Nền tối: gắn tile dither.
    hero.querySelectorAll('[data-hero-dither]').forEach((el) => {
      el.style.backgroundImage = flatTile(el.dataset.heroDither, +el.dataset.levels || 8)
      el.style.backgroundSize = `${CONFIG.bayer / CONFIG.scale}px`
    })

    // Ảnh chân dung: thay <img> bằng canvas đã dither (img giữ lại làm dự phòng).
    slots.forEach((slot, i) => {
      const box = slot.querySelector('.hero-card__media')
      const person = people[i % people.length]
      slot.dataset.idx = i % people.length
      const c = document.createElement('canvas')
      c.setAttribute('aria-hidden', 'true')
      renderPortrait(c, box, person, +slot.dataset.levels || 4)
        .then(() => {
          if (!state.alive) return
          box.replaceChildren(c)
        })
        .catch(() => {})
      slot.setAttribute('aria-label', `${person.num} ${person.name}`)
    })

    // Đổi cỡ: vẽ lại dither theo cỡ mới (khung đổi theo bề rộng màn).
    let rt = 0
    state.ro = new ResizeObserver(() => {
      clearTimeout(rt)
      rt = setTimeout(redraw, 150)
    })
    state.ro.observe(hero)

    state.onVis = () => (document.hidden ? pauseFill() : resumeFill())
    document.addEventListener('visibilitychange', state.onVis)

    // Nền tối khi 4 ảnh thành hàng — một listener cuộn, một rAF, chỉ đọc 4 rect.
    state.onRowScroll = () => {
      if (state.rowTick) return
      state.rowTick = requestAnimationFrame(() => {
        state.rowTick = 0
        checkRow()
      })
    }
    addEventListener('scroll', state.onRowScroll, { passive: true })
    checkRow()

    const start = () => state.alive && runFill()
    const loading = window.CHANDE_LOADING
    if (!loading || loading.config?.enabled === false || document.documentElement.classList.contains('cl-done')) start()
    else {
      state.onDone = start
      document.addEventListener('chande-loading:done', start, { once: true })
    }
  }

  // Tối khi: mép trên 4 thẻ bằng nhau (thành hàng) VÀ đáy hàng chạm đáy
  // .hero__stage. Từ lúc chạm, thẻ và stage dính nhau trôi lên nên điều kiện giữ
  // nguyên dù hàng đã ra khỏi màn hình — cuộn xuống không bị trả về nền kem.
  // Cuộn ngược lên, thẻ sticky lại tách khỏi đáy stage -> về kem. Bố cục mobile
  // (lưới 2×2) không bao giờ thành hàng nên tự tắt.
  function checkRow() {
    const root = document.documentElement
    if (!H || !CONFIG.darkOnRow) return void root.classList.remove('hero-row-dark')
    const stage = H.hero.querySelector('.hero__stage')
    if (!stage) return
    const rects = H.slots.map((s) => s.getBoundingClientRect())
    const tops = rects.map((r) => r.top)
    const row = Math.max(...tops) - Math.min(...tops) < 1.5
    const touch = stage.getBoundingClientRect().bottom <= Math.max(...rects.map((r) => r.bottom)) + 1.5
    root.classList.toggle('hero-row-dark', row && touch)
  }

  function applyHeights() {
    const stage = H?.hero.querySelector('.hero__stage')
    if (!stage) return
    stage.style.setProperty('--img', CONFIG.imageHeight)
  }

  // Gọi sau khi sửa CONFIG lúc đang chạy (bảng setting gọi hàm này).
  function refresh() {
    if (!H) return
    applyHeights()
    redraw()
    checkRow()
  }

  function redraw() {
    if (!H) return
    H.slots.forEach((slot) => {
      const box = slot.querySelector('.hero-card__media')
      const c = box.lastElementChild
      if (!(c instanceof HTMLCanvasElement)) return
      if (+c.dataset.w === Math.round(box.clientWidth) && +c.dataset.h === Math.round(box.clientHeight)) return
      renderPortrait(c, box, H.people[+(slot.dataset.idx || 0)] || H.people[0], +slot.dataset.levels || 4).catch(() => {})
    })
  }

  function destroy() {
    if (!H) return
    H.alive = false
    H.ro?.disconnect()
    removeEventListener('scroll', H.onRowScroll)
    if (H.rowTick) cancelAnimationFrame(H.rowTick)
    document.documentElement.classList.remove('hero-row-dark')
    document.removeEventListener('visibilitychange', H.onVis)
    if (H.onDone) document.removeEventListener('chande-loading:done', H.onDone)
    H.fillAnim?.cancel()
    H.anims.forEach((a) => a.cancel())
    H = null
  }

  /* ------------------------------------------------- Thanh process ------- */
  function track(anim) {
    H.anims.add(anim)
    anim.finished.catch(() => {}).finally(() => H?.anims.delete(anim))
    return anim
  }

  function runFill() {
    if (!H) return
    const state = H
    state.fill.style.transformOrigin = '0 50%'
    const a = state.fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: CONFIG.cycle,
      easing: 'linear',
      fill: 'forwards',
    })
    state.fillAnim = a
    if (state.paused || document.hidden) a.pause()
    // aria-valuenow chỉ cần cho trình đọc màn hình: cập nhật 4 lần/giây và chỉ
    // khi số đổi — ghi thuộc tính ở mọi khung hình là bắt trình duyệt tính lại
    // style liên tục.
    let lastPct = -1
    const tick = setInterval(() => {
      if (H !== state || state.fillAnim !== a) return clearInterval(tick)
      const pct = Math.round(Math.min(1, (a.currentTime || 0) / CONFIG.cycle) * 100)
      if (pct !== lastPct) state.bar.setAttribute('aria-valuenow', (lastPct = pct))
    }, 250)
    a.finished.then(() => H === state && next()).catch(() => {})
  }

  function pauseFill() {
    H?.fillAnim?.pause()
  }
  function resumeFill() {
    if (H && !H.paused && !document.hidden) H.fillAnim?.play()
  }

  /* ------------------------------------------------- Đổi 4 ảnh ----------- */
  async function next() {
    if (!H || H.swapping) return
    const state = H
    state.swapping = true
    // Chờ effect xanh (chande-field.js) chạy NỐT vòng của nó và đỗ ở điểm nghỉ
    // rồi mới đổi ảnh — không bao giờ bắt nó khựng giữa chừng. Nó tự chạy vòng
    // mới khi nhận 'chande-hero:swap-end'.
    if (window.CHANDE_FIELD?.park) await window.CHANDE_FIELD.park()
    if (H !== state) {
      // Rời trang trong lúc chờ: trả effect về chạy, đừng để nó đỗ mãi.
      window.CHANDE_FIELD?.release?.()
      return
    }
    document.dispatchEvent(new CustomEvent('chande-hero:swap-start'))
    const n = state.people.length
    state.offset = (state.offset + (n > state.slots.length ? state.slots.length : 1)) % n

    // Thanh rút về phía phải rồi chạy lượt mới từ trái.
    state.fillAnim?.cancel()
    state.fill.style.transformOrigin = '100% 50%'
    const back = track(
      state.fill.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], {
        duration: reduced.matches ? 0 : CONFIG.retract,
        easing: CONFIG.ease,
        fill: 'forwards',
      }),
    )

    const rank = slotOrder(state.slots)
    const swaps = state.slots.map((slot, i) => swapSlot(slot, i, (state.offset + i) % n, rank[i]))
    await Promise.all([back.finished.catch(() => {}), ...swaps])
    document.dispatchEvent(new CustomEvent('chande-hero:swap-end'))
    state.swapping = false
    if (H !== state) return
    back.cancel()
    runFill()
  }

  // Thứ tự chạy của từng ô, đo theo mép trên THẬT của ảnh trên màn (không theo
  // thứ tự trong HTML) — đổi layout thì thứ tự tự đúng theo.
  function slotOrder(slots) {
    const tops = slots.map((s) => s.querySelector('.hero-card__media').getBoundingClientRect().top)
    const ids = slots.map((_, i) => i)
    // Hoà nhau (cuộn xuống, 4 ảnh cùng dính sticky một hàng) thì theo thứ tự
    // HTML, chiều bottomUp đọc ngược: 04 -> 01.
    if (CONFIG.order === 'random') {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
      }
    } else {
      const up = CONFIG.order !== 'topDown'
      ids.sort((a, b) => (up ? tops[b] - tops[a] || b - a : tops[a] - tops[b] || a - b))
    }
    const rank = []
    ids.forEach((slotIndex, r) => (rank[slotIndex] = r))
    return rank
  }

  async function swapSlot(slot, i, idx, rank = i) {
    const state = H
    const person = state.people[idx]
    const box = slot.querySelector('.hero-card__media')
    const c = document.createElement('canvas')
    c.setAttribute('aria-hidden', 'true')
    try {
      await renderPortrait(c, box, person, +slot.dataset.levels || 4)
    } catch {
      return
    }
    if (H !== state) return
    slot.dataset.idx = idx
    slot.setAttribute('aria-label', `${person.num} ${person.name}`)

    const R = window.CHANDE_REVEAL
    if (CONFIG.effect === 'shapes' && R && !reduced.matches) {
      // Đoàn shape phủ lên ảnh đang hiện, toa cuối là ảnh mới. Tên người đổi
      // đúng lúc lớp đầu vừa phủ kín khung.
      const delay = rank * CONFIG.revealStagger
      const from = box.lastElementChild
      const run = track(R.play(box, { from, to: c, levels: +slot.dataset.levels || 4, delay }))
      swapCaption(slot, person, delay + run.timing.coverAt)
      try {
        await run.finished
      } catch {
        return
      }
      if (H === state) box.replaceChildren(c)
      return
    }

    const delay = reduced.matches ? 0 : i * CONFIG.swapStagger
    const dur = reduced.matches ? 0 : CONFIG.swapDuration
    box.append(c)
    const wipe = track(
      c.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0% 0 0 0)' }], {
        duration: dur,
        delay,
        easing: CONFIG.ease,
        fill: 'backwards',
      }),
    )
    // Ảnh cũ trôi lên một chút cho có chiều sâu.
    const old = [...box.children].filter((el) => el !== c)
    old.forEach((el) =>
      track(el.animate([{ transform: 'none' }, { transform: 'translateY(-12%)' }], { duration: dur, delay, easing: CONFIG.ease, fill: 'forwards' })),
    )
    swapCaption(slot, person, delay + dur * 0.35)

    await wipe.finished.catch(() => {})
    if (H === state) old.forEach((el) => el.remove())
  }

  // Thanh tên đổi người bằng BLOCK REVEAL giống chữ màn loading (chande-loading
  // textReveal): khối màu quét từ trái phủ kín chữ cũ -> đổi chữ dưới khối ->
  // khối quét tiếp sang phải lộ chữ mới. Số rồi tên, lệch nhau `stagger`.
  // transform-origin đổi left -> right đúng lúc scaleX = 1 (identity) nên không
  // thấy giật; easing đặt trên từng keyframe để mốc offset không bị bóp méo.
  function swapCaption(slot, person, delay) {
    const spans = [...slot.querySelectorAll('.hero-card__cap > span')]
    const text = [person.num, person.name]
    const R = CONFIG.capReveal
    spans.forEach((sp, k) => {
      if (sp.textContent === text[k]) return
      if (reduced.matches) return void (sp.textContent = text[k])
      sp.classList.add('cap-w')
      const block = document.createElement('i')
      block.className = 'cap-w__b'
      sp.appendChild(block)
      const total = R.inDuration + R.hold + R.outDuration
      const a = R.inDuration / total
      const b = (R.inDuration + R.hold) / total
      const anim = track(
        block.animate(
          [
            { transform: 'scaleX(0)', transformOrigin: 'left', offset: 0, easing: R.ease },
            { transform: 'scaleX(1)', transformOrigin: 'left', offset: a },
            { transform: 'scaleX(1)', transformOrigin: 'right', offset: b, easing: R.ease },
            { transform: 'scaleX(0)', transformOrigin: 'right', offset: 1 },
          ],
          { duration: total, delay: delay + k * R.stagger, fill: 'both' },
        ),
      )
      // Đổi chữ giữa lúc khối đang phủ kín.
      setTimeout(() => {
        if (sp.firstChild?.nodeType === 3) sp.firstChild.nodeValue = text[k]
        else sp.insertBefore(document.createTextNode(text[k]), block)
      }, delay + k * R.stagger + R.inDuration + R.hold / 2)
      anim.finished
        .then(() => {
          block.remove()
          sp.classList.remove('cap-w')
        })
        .catch(() => block.remove())
    })
  }

  /* ------------------------------------------------------------- Khởi động */
  mount(document)

  if (window.barba?.hooks) {
    // Mount ngay ở beforeEnter để trang chủ đã có dither khi rèm mở. Transition
    // chạy `sync: true` nên afterLeave tới SAU beforeEnter — chỉ gỡ hero nếu nó
    // thuộc container cũ.
    window.barba.hooks.beforeLeave(() => pauseFill())
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => {
      if (H && data.current.container?.contains(H.hero)) destroy()
    })
  }

  window.CHANDE_HERO = {
    config: CONFIG,
    defaults: DEFAULTS,
    refresh,
    mount,
    destroy,
    next,
    pause() {
      if (H) H.paused = true
      pauseFill()
    },
    play() {
      if (H) H.paused = false
      resumeFill()
    },
  }
})()
