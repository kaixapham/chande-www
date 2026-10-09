/* =============================================================================
 * CHANDE — Con mắt ở Intro (.hs-intro__eye): mở mắt rồi đảo mắt nhìn quanh
 * -----------------------------------------------------------------------------
 * Ảnh gốc là một mảnh cắt từ sprite (eye.webp) nên con ngươi không tách ra được:
 * vẽ lại bằng SVG đúng màu / tỉ lệ đo từ ảnh — lòng trắng kem hình lá, con ngươi
 * đen cắt theo viền mắt (đảo sát mép thì bị mí che như mắt thật).
 *
 * Mắt nhắm sẵn. Khi đỉnh con mắt lên tới mốc `at` của màn (0.7 = đi vào màn
 * khoảng 30%) thì mở ra (mí tách từ giữa, hơi nảy), nhìn trái — phải — giữa một
 * lượt, rồi con ngươi NHÌN THEO CHUỘT và chớp ngẫu nhiên (thỉnh thoảng chớp đúp).
 * Chuột đứng yên ~2.5 s thì mắt quay về nhìn quanh (lặp) tới khi chuột động lại.
 * Con trỏ (giọt bubble) đậu lên mắt thì mắt chớp liên tục (giọt co còn 50% — bubble).
 * Ra khỏi màn thì dừng.
 * Ảnh <img> giữ lại cho CMS nhưng ẩn khi bản SVG chạy.
 *
 * API: window.CHANDE_EYE = { config, mount(root) }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    at: 0.7, // mở khi đỉnh mắt lên tới mốc này (0 = mép trên màn, 1 = mép dưới)
    look: 0.42, // đảo xa bao nhiêu (theo nửa bề rộng mắt)
    sclera: '#f8e7bf',
    pupil: '#151611',
  }
  window.CHANDE_SETTINGS_APPLY?.('eye', CONFIG)
  const api = { config: CONFIG, mount() {} }
  window.CHANDE_EYE = api

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  // Hệ toạ độ = khung .hs-eye (70 × 42 đơn vị thiết kế), số đo từ ảnh gốc.
  const W = 70
  const H = 42
  const CX = 34.2
  const CY = 21.1
  const RX = 28.9 // nửa bề rộng lòng trắng
  const RY = 15.3 // nửa chiều cao
  const PR = 12.4 // bán kính con ngươi
  const ALMOND = `M${CX - RX} ${CY} Q${CX} ${CY - 2 * RY} ${CX + RX} ${CY} Q${CX} ${CY + 2 * RY} ${CX - RX} ${CY} Z`

  let live = null

  function mount(root = document) {
    live?.stop()
    live = null
    const box = (root.querySelector ? root : document).querySelector('.hs-intro__eye')
    if (!box || !CONFIG.enabled) return
    let svg = box.querySelector('svg.hs-eye')
    if (!svg) {
      const id = `eyeclip${Math.random().toString(36).slice(2, 7)}`
      box.insertAdjacentHTML(
        'beforeend',
        `<svg class="hs-eye" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"
              style="position:absolute; inset:0; width:100%; height:100%; overflow:visible">
          <defs><clipPath id="${id}"><path d="${ALMOND}"/></clipPath></defs>
          <g class="hs-eye__lid" style="transform-box:view-box; transform-origin:${CX}px ${CY}px">
            <path d="${ALMOND}" fill="${CONFIG.sclera}"/>
            <g clip-path="url(#${id})"><circle class="hs-eye__pupil" cx="${CX}" cy="${CY}" r="${PR}" fill="${CONFIG.pupil}"/></g>
          </g>
        </svg>`,
      )
      svg = box.querySelector('svg.hs-eye')
    }
    box.querySelector('img')?.style.setProperty('visibility', 'hidden')
    const lid = svg.querySelector('.hs-eye__lid')
    const pupil = svg.querySelector('.hs-eye__pupil')
    const me = { stop() {} }
    live = me

    if (reduced) return
    lid.style.transform = 'scaleY(0.04)'
    lid.style.opacity = '0'

    let opened = false
    let inView = false
    let timer = 0
    let anims = []
    const play = (el, kf, opt) => {
      const a = el.animate(kf, { fill: 'forwards', ...opt })
      anims.push(a)
      // fill 'none' (chớp) xong thì bỏ khỏi danh sách — chớp mãi không chồng chất
      return a.finished.catch(() => {}).then(() => {
        if (opt.fill === 'none') anims = anims.filter((x) => x !== a)
      })
    }
    const wait = (ms) => new Promise((r) => (timer = setTimeout(r, ms)))
    let timer2 = 0
    const wait2 = (ms) => new Promise((r) => (timer2 = setTimeout(r, ms)))
    const dx = RX * CONFIG.look
    let px = 0 // vị trí con ngươi đang ghi tay (nhìn theo chuột)
    let py = 0

    const blink = () =>
      play(lid, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.06)', offset: 0.45 }, { transform: 'scaleY(1)' }],
        { duration: 260, easing: 'ease-in-out', fill: 'none' })
    // Đảo con ngươi; xong thì ghi vị trí cuối vào style rồi bỏ animation (nhìn
    // quanh lặp mãi không chồng chất, nhìn theo chuột ghi tiếp từ đó).
    const lookTo = (x, y, ms = 420) => {
      const a = pupil.animate([{ transform: `translate(${x}px, ${y}px)` }],
        { duration: ms, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' })
      anims.push(a)
      return a.finished.then(() => {
        a.commitStyles()
        a.cancel()
        px = x
        py = y
      }).catch(() => {}).finally(() => (anims = anims.filter((v) => v !== a)))
    }

    // Nhìn quanh một lượt (trái — phải — giữa), xong chuyển sang nhìn theo chuột.
    async function intro() {
      await lookTo(-dx, -1.5)
      await wait(650)
      await lookTo(dx, 1)
      await wait(700)
      await lookTo(0, 0, 350)
      // bỏ animation của con ngươi (fill forwards đè style) — từ đây ghi tay
      anims.forEach((a) => a.effect?.target === pupil && a.cancel())
      following = true
      follow()
      blinks()
      armIdle()
    }

    // Nhìn theo chuột: hướng từ tâm mắt tới con trỏ, đi xa bao nhiêu theo khoảng
    // cách (xa ~ nửa màn là chạm mép), lerp cho mượt. Chỉ chạy khi mắt trong màn.
    let following = false
    let mx = null
    let my = null
    let raf = 0
    // Con trỏ đứng yên IDLE ms -> thôi nhìn theo, quay về nhìn quanh (trái — phải
    // — giữa, lặp). Động chuột lại thì bỏ dở, nhìn theo tiếp từ chỗ đang nhìn.
    const IDLE = 2500
    let idleTimer = 0
    let idling = false
    let idleId = 0
    const pupilAnims = () => anims.filter((a) => a.effect?.target === pupil)
    async function idleLoop() {
      const id = ++idleId
      const on = () => idling && id === idleId && live === me && inView
      while (on()) {
        await lookTo(-dx, -1.5)
        if (!on()) break
        await wait2(650)
        if (!on()) break
        await lookTo(dx, 1)
        if (!on()) break
        await wait2(700)
        if (!on()) break
        await lookTo(0, 0, 350)
        if (!on()) break
        await wait2(900)
      }
    }
    const goIdle = () => {
      if (!following || idling) return
      idling = true
      cancelAnimationFrame(raf)
      raf = 0
      idleLoop()
    }
    const armIdle = () => {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(goIdle, IDLE)
    }
    const onMove = (e) => {
      mx = e.clientX
      my = e.clientY
      if (idling) {
        idling = false
        idleId++
        // lấy vị trí con ngươi đang ở giữa chừng animation rồi mới bỏ animation
        const m = new DOMMatrix(getComputedStyle(pupil).transform)
        px = m.e
        py = m.f
        pupil.style.transform = `translate(${px}px, ${py}px)`
        pupilAnims().forEach((a) => a.cancel())
        anims = anims.filter((a) => a.effect?.target !== pupil)
      }
      if (following) armIdle()
      follow()
      // con trỏ (giọt bubble) đậu lên mắt -> chớp liên tục tới khi rời ra
      const r = box.getBoundingClientRect()
      const over = mx > r.left && mx < r.right && my > r.top && my < r.bottom
      if (over && !fluttering && opened) flutter()
      fluttering = over && opened
    }
    let fluttering = false
    async function flutter() {
      fluttering = true
      while (fluttering && live === me && inView) {
        await blink()
        await wait2(70 + Math.random() * 90)
      }
    }
    function follow() {
      if (raf || !following || idling || !inView || live !== me) return
      raf = requestAnimationFrame(step)
    }
    function step() {
      raf = 0
      if (!following || idling || !inView || live !== me) return
      let gx = 0
      let gy = 0
      if (mx !== null) {
        const r = box.getBoundingClientRect()
        const vx = mx - (r.left + (CX / W) * r.width)
        const vy = my - (r.top + (CY / H) * r.height)
        const d = Math.hypot(vx, vy) || 1
        const k = Math.min(1, d / (innerWidth * 0.35))
        gx = (vx / d) * k * dx
        gy = (vy / d) * k * RY * 0.35
      }
      px += (gx - px) * 0.18
      py += (gy - py) * 0.18
      pupil.style.transform = `translate(${px.toFixed(2)}px, ${py.toFixed(2)}px)`
      if (Math.abs(gx - px) + Math.abs(gy - py) > 0.02) raf = requestAnimationFrame(step)
    }
    // Chớp ngẫu nhiên mỗi 2.5–5.5 s khi mắt trong màn.
    let blinkId = 0
    async function blinks() {
      const id = ++blinkId
      while (live === me && inView && id === blinkId) {
        await wait(2500 + Math.random() * 3000)
        if (live !== me || !inView || id !== blinkId) break
        await blink()
        // thỉnh thoảng chớp đúp
        if (Math.random() < 0.25) await blink()
      }
    }
    addEventListener('pointermove', onMove, { passive: true })

    async function open() {
      opened = true
      lid.style.opacity = ''
      // mí tách từ giữa, hơi nảy quá rồi về
      await play(lid, [
        { transform: 'scaleY(0.04)', opacity: 0 },
        { transform: 'scaleY(0.04)', opacity: 1, offset: 0.12 },
        { transform: 'scaleY(1.08)', offset: 0.7 },
        { transform: 'scaleY(1)', opacity: 1 },
      ], { duration: 650, easing: 'cubic-bezier(.3,.7,.3,1)' })
      await wait(250)
      await blink()
      intro()
    }

    const check = () => {
      const r = box.getBoundingClientRect()
      const was = inView
      inView = r.bottom > 0 && r.top < innerHeight
      if (!opened && r.top < innerHeight * CONFIG.at && r.bottom > 0) open()
      else if (following && inView && !was) {
        if (idling) idleLoop()
        else follow()
        blinks()
      }
    }
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check, { passive: true })
    check()

    me.stop = () => {
      removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
      removeEventListener('scroll', check)
      removeEventListener('resize', check)
      clearTimeout(timer)
      clearTimeout(timer2)
      clearTimeout(idleTimer)
      anims.forEach((a) => a.cancel())
      anims = []
      inView = false
    }
  }

  api.mount = mount
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
