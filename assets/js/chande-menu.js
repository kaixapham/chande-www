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
  const DOTS =
    '<svg class="cmenu__dots" viewBox="0 0 20 6" aria-hidden="true"><circle cx="3" cy="3" r="3" fill="currentColor"/><circle cx="17" cy="3" r="3" fill="currentColor"/></svg>'
  const dots2 = `<span class="cmenu__dd" aria-hidden="true">${DOTS}${DOTS}</span>`

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
  for (let r = 1; r <= ROWS; r++) for (let c = 1; c <= COLS; c++) cells += `<i style="${at(r, c)}"></i>`
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
      <a class="cmenu__big" style="${at(4, 2, 1, 4)}" href="${esc(LINKS.partner)}">Become a<br>partner</a>
      <span class="cmenu__num" style="${at(5, 1)}">04</span>
      <a class="cmenu__big" style="${at(5, 2, 1, 4)}" href="${esc(LINKS.register)}">Register for<br>the next event</a>
      ${socials}
      <a class="cmenu__contact" style="${at(6, 10, 1, 3)}" href="${esc(LINKS.contact)}"><span class="cmenu__num">05</span><span class="cmenu__huge">Contact</span></a>
    </div>`
  document.body.appendChild(root)
  const items = root.querySelector('.cmenu__items')
  // Rê vào ô member: gắn .is-on (đoàn dải màu + ảnh trồi lên). Rời ô KHÔNG tắt ngay: giữ tới
  // khi animation chạy trọn (RUN) + đọng một chút (HOLD) rồi mới gỡ -> CSS cho mờ dần (vệt).
  const RUN = 900
  const HOLD = 350
  items.addEventListener('pointerover', (e) => {
    const m = e.target.closest?.('.cmenu__member')
    if (!m || m.contains(e.relatedTarget)) return
    clearTimeout(m._off)
    if (!m.classList.contains('is-on')) m._t0 = performance.now()
    m.classList.add('is-on')
  })
  items.addEventListener('pointerout', (e) => {
    const m = e.target.closest?.('.cmenu__member')
    if (!m || m.contains(e.relatedTarget)) return
    const left = Math.max(0, RUN - (performance.now() - (m._t0 || 0))) + HOLD
    m._off = setTimeout(() => m.classList.remove('is-on'), left)
  })

  let filled = false
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
  }

  let isOpen = false
  let closeT = 0
  const btn = () => document.querySelector('.cl__menu')
  function open() {
    if (isOpen) return
    isOpen = true
    clearTimeout(closeT)
    fill()
    root.hidden = false
    root.getBoundingClientRect() // để transition chạy từ trạng thái đóng
    root.classList.add('is-open')
    document.documentElement.classList.add('menu-open')
    btn()?.setAttribute('aria-expanded', 'true')
    window.CHANDE_TRANSITION?.lenis?.stop()
  }
  function close() {
    if (!isOpen) return
    isOpen = false
    root.classList.remove('is-open')
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
