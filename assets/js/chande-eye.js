/* =============================================================================
 * CHANDE — Con mắt ở Intro (.hs-intro__eye): mở mắt rồi đảo mắt nhìn quanh
 * -----------------------------------------------------------------------------
 * Ảnh gốc là một mảnh cắt từ sprite (eye.webp) nên con ngươi không tách ra được:
 * vẽ lại bằng SVG đúng màu / tỉ lệ đo từ ảnh — lòng trắng kem hình lá, con ngươi
 * đen cắt theo viền mắt (đảo sát mép thì bị mí che như mắt thật).
 *
 * Mắt nhắm sẵn. Khi đỉnh con mắt lên tới mốc `at` của màn (0.7 = đi vào màn
 * khoảng 30%) thì mở ra (mí tách từ giữa, hơi nảy), rồi lặp: nhìn trái — nhìn
 * phải — về giữa — thỉnh thoảng chớp. Ra khỏi màn thì dừng vòng lặp.
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
      return a.finished.catch(() => {})
    }
    const wait = (ms) => new Promise((r) => (timer = setTimeout(r, ms)))
    const dx = RX * CONFIG.look

    const blink = () =>
      play(lid, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0.06)', offset: 0.45 }, { transform: 'scaleY(1)' }],
        { duration: 260, easing: 'ease-in-out' })
    const lookTo = (x, y, ms = 420) =>
      play(pupil, [{ transform: `translate(${x}px, ${y}px)` }], { duration: ms, easing: 'cubic-bezier(.5,0,.2,1)' })

    let loopId = 0
    async function loop() {
      const id = ++loopId
      const on = () => live === me && inView && id === loopId
      while (on()) {
        await lookTo(-dx, -1.5)
        await wait(700)
        if (!on()) break
        await lookTo(dx, 1)
        await wait(800)
        if (!on()) break
        await lookTo(0, 0, 350)
        await wait(500)
        if (!on()) break
        await blink()
        await wait(1400 + Math.random() * 1200)
      }
    }

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
      loop()
    }

    const check = () => {
      const r = box.getBoundingClientRect()
      const was = inView
      inView = r.bottom > 0 && r.top < innerHeight
      if (!opened && r.top < innerHeight * CONFIG.at && r.bottom > 0) open()
      else if (opened && inView && !was) loop()
    }
    addEventListener('scroll', check, { passive: true })
    addEventListener('resize', check, { passive: true })
    check()

    me.stop = () => {
      removeEventListener('scroll', check)
      removeEventListener('resize', check)
      clearTimeout(timer)
      anims.forEach((a) => a.cancel())
      anims = []
      inView = false
    }
  }

  api.mount = mount
  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
