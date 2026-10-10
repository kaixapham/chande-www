/* =============================================================================
 * CHANDE — Trang menu (nút 4 chấm trên thanh header) — Figma node 603:47667
 * -----------------------------------------------------------------------------
 * Nền đen, lưới 12 cột × 6 hàng (viền mảnh kem mờ) dưới thanh header. Gồm:
 *   • ô member: hàng 1–3 + hàng 4–5 cột 6–12 — điền tên theo ĐÚNG thứ tự người ở hero
 *     trang chủ (danh sách [data-hero-people] — CMS quản lý; trang khác tải từ
 *     index.html). Rê vào ô: các dải màu (như đổi ảnh ở hero) rồi ảnh chân dung của người
 *     đó trồi từ dưới lên, tên ẩn; rời ô thì đọng lại rồi mờ dần (lướt qua nhiều ô = vệt ảnh).
 *   • 03 Become a partner · 04 Register for the next event · 05 Contact
 *   • hàng cuối: Facebook / YouTube / Instagram / LinkedIn / Patreon
 * Bấm nút menu: lưới trượt mở từ trên xuống; bấm lại / Esc / bấm link thì đóng.
 * Menu nằm ngoài container Barba nên dùng chung mọi trang. Mở thì khoá cuộn (Lenis).
 *
 * API: window.CHANDE_MENU = { open(), close(), toggle(), get isOpen() }
 * ========================================================================== */
;(() => {
  'use strict'

  const LINKS = {
    partner: '#',
    register: '#',
    contact: '#',
    social: [
      ['Facebook', 'https://www.facebook.com/profile.php?id=61574988325950'],
      ['Youtube', 'https://www.youtube.com/@chandedesign'],
      ['Instagram', 'https://www.instagram.com/design.chande/'],
      ['LinkedIn', 'https://www.linkedin.com/company/chande123/posts/?viewAsMember=true'],
      null, // cột 5 trống như Figma
      ['Patreon', 'https://www.patreon.com/cw/minggg'],
    ],
  }
  const COLS = 12
  const ROWS = 6
  // ô dành cho member: hàng 1–3 đủ 12 cột, hàng 4–5 cột 6–12 (cột 1–5 là chữ lớn)
  const memberSlots = []
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= COLS; c++) memberSlots.push([r, c])
  for (let r = 4; r <= 5; r++) for (let c = 6; c <= COLS; c++) memberSlots.push([r, c])

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
  // Icon ô mạng xã hội: 7 chấm. Lúc thường dồn thành 4 chấm 2×2 (vài chấm nằm chồng); rê vào thì
  // các chấm trượt ra thành mũi tên ↗ (hàng trên + cột phải + đường chéo) — vẫn kiểu chấm.
  // [x, y] lúc là mũi tên, [dx, dy] dời về chỗ 2×2 lúc thường
  const ARROW = [[3, 3, 0, 0], [10, 3, -7, 0], [17, 3, 0, 0], [17, 10, 0, -7], [17, 17, 0, 0], [10, 10, -7, 7], [3, 17, 0, 0]]
  const dots2 =
    '<svg class="cmenu__arr" viewBox="0 0 20 20" aria-hidden="true">' +
    ARROW.map(([x, y, dx, dy], i) => `<circle cx="${x}" cy="${y}" r="2.1" fill="currentColor" style="--dx:${dx}px; --dy:${dy}px; --i:${i}"/>`).join('') +
    '</svg>'

  // danh sách người: lấy ở trang hiện tại, không có thì tải index.html (một lần)
  let peopleP = null
  function people() {
    if (peopleP) return peopleP
    const read = (doc) => {
      try {
        return JSON.parse(doc.querySelector('[data-hero-people]')?.textContent || '[]')
      } catch {
        return []
      }
    }
    const here = read(document)
    peopleP = here.length
      ? Promise.resolve(here)
      : fetch('index.html', { credentials: 'same-origin' })
          .then((r) => r.text())
          .then((t) => read(new DOMParser().parseFromString(t, 'text/html')))
          .catch(() => [])
    return peopleP
  }

  const root = document.createElement('div')
  root.className = 'cmenu'
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.setAttribute('aria-label', 'Menu')
  root.hidden = true
  const at = (r, c, rs = 1, cs = 1) => `grid-row:${r} / span ${rs}; grid-column:${c} / span ${cs}`
  let cells = ''
  // --ld: trễ lúc ô kẻ quét ra khi mở menu — theo đường chéo trên-trái -> dưới-phải
  for (let r = 1; r <= ROWS; r++)
    for (let c = 1; c <= COLS; c++) cells += `<i style="${at(r, c)}; --ld:${(0.2 + (r - 1) * 0.06 + (c - 1) * 0.025).toFixed(3)}s"></i>`
  const socials = LINKS.social
    .map((s, i) =>
      s
        ? `<a class="cmenu__social" style="${at(6, i + 1)}" href="${esc(s[1])}" target="_blank" rel="noopener">${dots2}<span>${esc(s[0])}</span></a>`
        : '',
    )
    .join('')
  root.innerHTML = `
    <div class="cmenu__grid cmenu__lines" aria-hidden="true">${cells}</div>
    <div class="cmenu__grid cmenu__items">
      <span class="cmenu__num" style="${at(4, 1)}">03</span>
      <a class="cmenu__big" style="${at(4, 2, 1, 4)}; --d:.35s" href="${esc(LINKS.partner)}">Become a<br>partner</a>
      <span class="cmenu__num" style="${at(5, 1)}">04</span>
      <a class="cmenu__big" style="${at(5, 2, 1, 4)}; --d:.47s" href="${esc(LINKS.register)}">Register for<br>the next event</a>
      ${socials}
      <a class="cmenu__contact" style="${at(6, 10, 1, 3)}" href="${esc(LINKS.contact)}"><span class="cmenu__num">05</span><span class="cmenu__huge" style="--d:.6s">Contact</span></a>
    </div>`
  document.body.appendChild(root)
  const items = root.querySelector('.cmenu__items')
  // rê vào ô mạng xã hội: chữ tên bên dưới chạy hiệu ứng "giải mã code" (chande-scramble.js, không gạch chân)
  items.addEventListener('pointerover', (e) => {
    const a = e.target.closest?.('.cmenu__social')
    if (!a || a.contains(e.relatedTarget)) return
    window.CHANDE_SCRAMBLE?.run(a.querySelector('span:last-child'))
  })
  // Rê chuột trên lưới (kiểu "pixel trail"): mọi ô chuột đi qua bị "đánh sáng" tức thì (không
  // transition), đọng một nhịp rồi mới tối dần -> vệt. Ô quanh chuột sáng nhẹ theo khoảng cách
  // (tròn, mờ dần ra xa); ô đang sáng hơn không bị lần lướt sau làm tối đi. Giữa hai mẫu chuột
  // (kể cả các mẫu gộp — getCoalescedEvents) đi từng nửa ô -> lướt nhanh vẫn thành đường liền,
  // không đứt quãng / sót ô. Ô member chuột đi qua thì bật ảnh (.is-on): giữ tới khi animation
  // chạy trọn (RUN) + đọng (HOLD) rồi tua ngược.
  const RUN = 1050 // ms — animation xuất hiện chạy trọn (ô sáng .15s + dải .9s)
  const HOLD = 1000 // ms — ảnh đọng lại trước khi tua ngược biến mất (vệt ảnh dài, tắt lần lượt)
  const LIT = { color: '28,28,28', hold: 140, fade: 2400, radius: 1.25 } // radius: theo cạnh ô
  const lineCells = root.querySelectorAll('.cmenu__lines i')
  const linesBox = root.querySelector('.cmenu__lines')
  const memberAt = [] // chỉ số ô -> .cmenu__member
  const lit = [] // chỉ số ô -> { a, t } độ sáng lúc đánh + thời điểm bắt đầu tối
  const levelOf = (k, now) => {
    const L = lit[k]
    if (!L) return 0
    return now < L.t ? L.a : Math.max(0, L.a * (1 - (now - L.t) / LIT.fade))
  }
  const strike = (k, a, now) => {
    if (a <= levelOf(k, now) + 0.02) return
    const el = lineCells[k]
    lit[k] = { a, t: now + LIT.hold }
    // nền ô = rgba(màu, --la) (CSS); --lt = thời lượng transition của --la
    el.style.setProperty('--lt', '0s')
    el.style.setProperty('--la', a.toFixed(3))
    clearTimeout(el._f)
    el._f = setTimeout(() => {
      el.style.setProperty('--lt', `${LIT.fade}ms`)
      el.style.setProperty('--la', '0')
    }, LIT.hold)
  }
  const memberOn = (m) => {
    clearTimeout(m._off)
    if (!m.classList.contains('is-on')) m._t0 = performance.now()
    m.classList.add('is-on')
  }
  const memberOff = (m) => {
    const left = Math.max(0, RUN - (performance.now() - (m._t0 || 0))) + HOLD
    m._off = setTimeout(() => m.classList.remove('is-on'), left)
  }
  let box = null
  let last = null // điểm trước (toạ độ theo ô)
  let cur = -1 // ô đang có chuột
  const visit = (gx, gy, now) => {
    const c0 = Math.floor(gx)
    const r0 = Math.floor(gy)
    const R = LIT.radius
    for (let r = Math.max(0, Math.floor(gy - R)); r <= Math.min(ROWS - 1, Math.floor(gy + R)); r++)
      for (let c = Math.max(0, Math.floor(gx - R)); c <= Math.min(COLS - 1, Math.floor(gx + R)); c++) {
        const d = c === c0 && r === r0 ? 0 : Math.hypot(c + 0.5 - gx, r + 0.5 - gy)
        const a = d === 0 ? 1 : Math.max(0, 1 - d / R) * 0.45
        if (a > 0) strike(r * COLS + c, a, now)
      }
    const k = c0 >= 0 && c0 < COLS && r0 >= 0 && r0 < ROWS ? r0 * COLS + c0 : -1
    if (k === cur) return
    if (cur >= 0 && memberAt[cur]) memberOff(memberAt[cur])
    if (k >= 0 && memberAt[k]) memberOn(memberAt[k])
    cur = k
  }
  root.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch' || !isOpen) return
    box = box || linesBox.getBoundingClientRect()
    const now = performance.now()
    const pts = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e]
    for (const p of pts) {
      const gx = ((p.clientX - box.left) / box.width) * COLS
      const gy = ((p.clientY - box.top) / box.height) * ROWS
      if (last) {
        const steps = Math.ceil(Math.hypot(gx - last[0], gy - last[1]) / 0.5)
        for (let i = 1; i < steps; i++) visit(last[0] + ((gx - last[0]) * i) / steps, last[1] + ((gy - last[1]) * i) / steps, now)
      }
      visit(gx, gy, now)
      last = [gx, gy]
    }
  })
  const leaveGrid = () => {
    if (cur >= 0 && memberAt[cur]) memberOff(memberAt[cur])
    cur = -1
    last = null
    box = null
  }
  root.addEventListener('pointerleave', leaveGrid)
  addEventListener('resize', () => (box = null))
  addEventListener('scroll', () => (box = null), { passive: true })

  // Chữ lớn (Become a partner / Register / Contact): rê vào thì tô màu quét từ trái như tiêu
  // đề trang chủ (chande-titlefx.js) — [lime] —dither— [xanh đậm] —dither— [kem]. Cả dải vẽ một
  // lần ra canvas (mỗi điểm ảnh = một ô dither), làm nền chữ (background-clip:text); rê vào /
  // ra chỉ trượt background-position.
  const SWEEP = { done: '#f4f3eb', accent: '#68f12b', base: '#f4f3eb', band: 0.3, cell: 4 }
  const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
  function sweepPaint(el) {
    const r = document.createRange()
    r.selectNodeContents(el)
    const cs = getComputedStyle(el)
    const W = Math.ceil(r.getBoundingClientRect().width + parseFloat(cs.paddingLeft) + 8)
    if (!W || W === el._sw) return
    el._sw = W
    const n = Math.max(8, Math.round(W / SWEEP.cell)) // số cột ô trên một bề rộng chữ
    const b = Math.max(4, Math.round(n * SWEEP.band))
    const cols = 2 * n + 2 * b
    const c = document.createElement('canvas')
    c.width = cols
    c.height = 8
    const g = c.getContext('2d')
    const fill = (x0, w, col) => ((g.fillStyle = col), g.fillRect(x0, 0, w, 8))
    const band = (x0, a, z) => {
      fill(x0, b, a)
      g.fillStyle = z
      for (let x = 0; x < b; x++)
        for (let y = 0; y < 8; y++) if ((BAYER[y * 8 + (x % 8)] + 0.5) / 64 < (x + 0.5) / b) g.fillRect(x0 + x, y, 1, 1)
    }
    fill(0, n, SWEEP.done)
    band(n, SWEEP.done, SWEEP.accent)
    band(n + b, SWEEP.accent, SWEEP.base)
    fill(n + 2 * b, n, SWEEP.base)
    const px = cols * (W / n)
    el.style.backgroundImage = `url(${c.toDataURL()})`
    el.style.backgroundSize = `${px}px ${8 * (W / n)}px`
    el.style.setProperty('--sw-off', `${-(px - W)}px`) // vị trí chỉ thấy phần kem
  }
  const sweepEls = () => root.querySelectorAll('.cmenu__big, .cmenu__huge')
  const sweepAll = () => matchMedia('(min-width: 768px)').matches && sweepEls().forEach(sweepPaint)
  addEventListener('resize', () => isOpen && sweepAll())

  let filled = false
  // Menu hiện ra: chữ "giải mã code" (chande-scramble.js) — ký hiệu ngẫu nhiên chốt dần về chữ
  // thật, lần lượt theo vị trí (trên -> dưới, trái -> phải), khớp lúc nội dung trồi lên (.3s).
  // Tiêu đề lớn không giải mã — có kiểu xuất hiện riêng (trồi lên sau mép cắt, CSS)
  function codeIn() {
    const run = window.CHANDE_SCRAMBLE?.run
    if (!run || !isOpen) return
    const els = [...root.querySelectorAll('.cmenu__member > span, .cmenu__num, .cmenu__social > span:last-child')]
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .forEach(({ el, r }) => run(el, 250 + (r.left / innerWidth) * 260 + (r.top / innerHeight) * 320))
  }

  async function fill() {
    if (filled) return
    filled = true
    const list = await people()
    const html = memberSlots
      .slice(0, list.length)
      .map(([r, c], i) => {
        const p = list[i]
        // 5 dải màu (bảng màu shape reveal ở hero) trồi lên trước, ảnh là lớp cuối
        return `<div class="cmenu__member" style="${at(r, c)}"><div class="cmenu__fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><img alt="" decoding="async" src="${esc(p.img)}"${p.pos ? ` style="object-position:${esc(p.pos)}"` : ''}></div><span>${esc(p.name)}</span></div>`
      })
      .join('')
    items.insertAdjacentHTML('afterbegin', html)
    items.querySelectorAll('.cmenu__member').forEach((m, i) => {
      const [r, c] = memberSlots[i]
      memberAt[(r - 1) * COLS + (c - 1)] = m
    })
  }

  let isOpen = false
  let closeT = 0
  const btn = () => document.querySelector('.cl__menu')
  function open() {
    if (isOpen) return
    isOpen = true
    clearTimeout(closeT)
    fill().then(codeIn)
    root.hidden = false
    root.getBoundingClientRect() // để transition chạy từ trạng thái đóng
    root.classList.add('is-open')
    requestAnimationFrame(sweepAll)
    document.documentElement.classList.add('menu-open')
    btn()?.setAttribute('aria-expanded', 'true')
    window.CHANDE_TRANSITION?.lenis?.stop()
  }
  function close() {
    if (!isOpen) return
    isOpen = false
    root.classList.remove('is-open')
    leaveGrid() // thôi theo chuột (ô đang sáng vẫn tối dần)
    document.documentElement.classList.remove('menu-open')
    btn()?.setAttribute('aria-expanded', 'false')
    window.CHANDE_TRANSITION?.lenis?.start()
    closeT = setTimeout(() => !isOpen && (root.hidden = true), 700)
  }
  const toggle = () => (isOpen ? close() : open())

  document.addEventListener('click', (e) => {
    if (e.target.closest?.('.cl__menu')) {
      e.preventDefault()
      toggle()
      return
    }
    // bấm link trên thanh header (Gallery / About / logo) hoặc trong menu -> đóng menu
    if (isOpen && e.target.closest?.('.cl__bar a, .cmenu a')) close()
  })
  addEventListener('keydown', (e) => e.key === 'Escape' && close())
  window.barba?.hooks?.before(() => close())

  window.CHANDE_MENU = {
    open,
    close,
    toggle,
    get isOpen() {
      return isOpen
    },
  }
})()
