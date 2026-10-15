/* =============================================================================
 * CHANDE — Trang menu (nút 4 chấm trên thanh header) — Figma node 603:47667
 * -----------------------------------------------------------------------------
 * Nền đen, lưới 12 cột × 6 hàng (viền mảnh kem mờ) dưới thanh header. Gồm:
 *   • ô member: hàng 1–3 + hàng 4–5 cột 6–12 — điền tên theo ĐÚNG thứ tự người ở hero
 *     trang chủ (danh sách [data-hero-people] — CMS quản lý; trang khác tải từ
 *     index.html). Rê vào ô: các dải màu (như đổi ảnh ở hero) rồi ảnh chân dung của người
 *     đó trồi từ dưới lên, tên ẩn; rời ô thì đọng lại rồi mờ dần (lướt qua nhiều ô = vệt ảnh).
 *   • 03 Become a partner · 04 Register for the next event · 05 Contact
 *   • hàng cuối: Facebook / YouTube / Instagram / LinkedIn / Made by Lumen Studio / Patreon
 * Bấm nút menu: lưới trượt mở từ trên xuống; bấm lại / Esc / bấm link thì đóng.
 * Mobile (< 900px — Figma 688:53293): bản riêng .cmenu__m, không dùng lưới — Home / Gallery / About /
 * Contact + Become a partner chữ lớn; ô kẻ 2 cột (mạng xã hội | Register for the next event); dòng
 * credit Kaixa / Lumen Studio ở đáy. Thanh header lúc mở menu chuyển nền tối (site.css).
 * Menu nằm ngoài container Barba nên dùng chung mọi trang. Mở thì khoá cuộn (Lenis).
 *
 * API: window.CHANDE_MENU = { open(), close(), toggle(), get isOpen() }
 * ========================================================================== */
;(() => {
  'use strict'

  const LINKS = {
    home: './',
    gallery: 'gallery',
    about: 'about',
    kaixa: 'https://www.instagram.com/kaixa.219/',
    partner: 'partner',
    register: 'register',
    contact: 'mailto:phap22011994@gmail.com',
    social: [
      ['Facebook', 'https://www.facebook.com/profile.php?id=61574988325950'],
      ['Youtube', 'https://www.youtube.com/@chandedesign'],
      ['Instagram', 'https://www.instagram.com/design.chande/'],
      ['LinkedIn', 'https://www.linkedin.com/company/chande123/posts/?viewAsMember=true'],
      { credit: 'Made by Lumen Studio', url: 'https://www.lumen-studio.co/' }, // cột 5: credit — chữ mono như dòng credit ở footer
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
      !s
        ? ''
        : s.credit
          ? `<p class="cmenu__credit mono" style="${at(6, i + 1)}"><a href="${esc(s.url)}" target="_blank" rel="noopener" data-scramble>${esc(s.credit)}</a></p>`
          : `<a class="cmenu__social" style="${at(6, i + 1)}" href="${esc(s[1])}" target="_blank" rel="noopener">${dots2}<span>${esc(s[0])}</span></a>`,
    )
    .join('')
  // chữ lớn tách từng dòng: mở menu / rê vào thì các dòng trồi lên lần lượt
  const lines = (...t) => t.map((x, i) => `<span class="cmenu__ln" style="--l:${i}"><i>${esc(x)}</i></span>`).join('')
  root.innerHTML = `
    <div class="cmenu__grid cmenu__lines" aria-hidden="true">${cells}</div>
    <div class="cmenu__grid cmenu__items">
      <span class="cmenu__num" style="${at(4, 1)}">03</span>
      <a class="cmenu__big" style="${at(4, 2, 1, 4)}; --d:.35s" href="${esc(LINKS.partner)}"><span class="cmenu__bt">${lines('Become a', 'partner')}</span>${dots2}</a>
      <span class="cmenu__num" style="${at(5, 1)}">04</span>
      <a class="cmenu__big" style="${at(5, 2, 1, 4)}; --d:.47s" href="${esc(LINKS.register)}"><span class="cmenu__bt">${lines('Register for', 'the next event')}</span>${dots2}</a>
      ${socials}
      <a class="cmenu__contact" style="${at(6, 10, 1, 3)}" href="${esc(LINKS.contact)}"><span class="cmenu__num">05</span><span class="cmenu__huge" style="--d:.6s">${lines('Contact')}</span>${dots2}</a>
    </div>
    <div class="cmenu__m">
      <div class="cmenu__mmain">
        <ul class="cmenu__mlinks">
          ${[['Home', LINKS.home], ['Gallery', LINKS.gallery], ['About', LINKS.about], ['Contact', LINKS.contact]]
            .map(([t, u], i) => `<li><a href="${esc(u)}" style="--d:${(0.3 + i * 0.06).toFixed(2)}s">${lines(t)}</a></li>`)
            .join('')}
        </ul>
        <a class="cmenu__mpartner" href="${esc(LINKS.partner)}" style="--d:.56s">${lines('Become a', 'partner')}</a>
      </div>
      <div class="cmenu__mgrid">
        <ul class="cmenu__msocial">
          ${LINKS.social
            .filter((x) => Array.isArray(x) && x[0] !== 'Patreon')
            .map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener"><span>${esc(t)}</span></a></li>`)
            .join('')}
        </ul>
        <a class="cmenu__mreg" href="${esc(LINKS.register)}">${dots2}<span>Register for<br>the next event</span></a>
      </div>
      <div class="cmenu__mfoot mono">
        <a href="${esc(LINKS.kaixa)}" target="_blank" rel="noopener" data-scramble>[ Kaixa ]</a>
        <a href="https://www.lumen-studio.co/" target="_blank" rel="noopener" data-scramble>[ Made by Lumen Studio ]</a>
      </div>
    </div>`
  document.body.appendChild(root)
  // lớp chữ ĐEN trùng khít, lộ ra theo đúng vệt quét của nền neon lúc rê (clip-path cùng nhịp với
  // ::before) -> không bao giờ có chữ trắng nằm trên neon (đổi màu cả khối thì lệch nhịp với vệt quét)
  root.querySelectorAll('.cmenu__big, .cmenu__contact').forEach((a) => {
    const ink = document.createElement('span')
    ink.className = 'cmenu__ink'
    ink.setAttribute('aria-hidden', 'true')
    ink.innerHTML = a.innerHTML
    a.append(ink)
  })
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
  // ô nằm dưới 2 nút lớn (Become a partner / Register: hàng 4–5, cột 1–5) và Contact (hàng 6, cột
  // 10–12): không sáng xám khi rê — nút có hover nền neon riêng, vệt xám quanh nó nhìn bẩn
  const NO_GLOW = new Set()
  for (let r = 3; r <= 4; r++) for (let c = 0; c <= 4; c++) NO_GLOW.add(r * COLS + c)
  for (let c = 9; c <= 11; c++) NO_GLOW.add(5 * COLS + c)
  const strike = (k, a, now) => {
    if (NO_GLOW.has(k)) return
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

  let filled = false
  // Menu hiện ra: chữ "giải mã code" (chande-scramble.js) — ký hiệu ngẫu nhiên chốt dần về chữ
  // thật, lần lượt theo vị trí (trên -> dưới, trái -> phải), khớp lúc nội dung trồi lên (.3s).
  // Tiêu đề lớn không giải mã — có kiểu xuất hiện riêng (trồi lên sau mép cắt, CSS)
  function codeIn() {
    const run = window.CHANDE_SCRAMBLE?.run
    if (!run || !isOpen) return
    const els = [...root.querySelectorAll(mobile() ? '.cmenu__msocial span, .cmenu__mreg > span' : '.cmenu__member > span, .cmenu__num, .cmenu__social > span:last-child')]
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .forEach(({ el, r }) => run(el, 250 + (r.left / innerWidth) * 260 + (r.top / innerHeight) * 320))
  }

  // Người có ở footer nhưng không có trong danh sách hero (CMS) -> thêm vào cuối lưới menu cho kín các ô member
  // (ảnh riêng như footer — chande-home.js OWN). Tên trùng người đã có trong danh sách thì bỏ qua.
  const MENU_EXTRA = [
    { name: 'Tuyen.N', img: 'assets/img/home/foot-tuyen-n-v2.webp' },
    { name: 'Nhatminh P', img: 'assets/img/home/foot-nhatminh-p.webp' },
  ]
  async function fill() {
    if (filled) return
    filled = true
    const base = await people()
    const norm = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]/g, '')
    const list = [...base, ...MENU_EXTRA.filter((x) => !base.some((p) => norm(p.name) === norm(x.name)))]
    const html = memberSlots
      .slice(0, list.length)
      .map(([r, c], i) => {
        const p = list[i]
        // 5 dải màu (bảng màu shape reveal ở hero) trồi lên trước, ảnh là lớp cuối
        return `<div class="cmenu__member" style="${at(r, c)}"><div class="cmenu__fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><img alt="" decoding="async" src="${esc(p.img)}"${p.pos ? ` style="object-position:${esc(p.pos)}"` : ''}></div><span>${esc(p.name)}</span></div>`
      })
      .join('')
    // ô TRỐNG (slot member dư + hàng cuối cột 7–9): cũng chạy đoàn dải màu khi rê, không ảnh / tên
    const empty = [...memberSlots.slice(list.length), [6, 7], [6, 8], [6, 9]]
    const blank = empty
      .map(([r, c]) => `<div class="cmenu__member cmenu__member--empty" style="${at(r, c)}" data-rc="${r},${c}"><div class="cmenu__fx" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div></div>`)
      .join('')
    items.insertAdjacentHTML('afterbegin', html + blank)
    items.querySelectorAll('.cmenu__member').forEach((m, i) => {
      const [r, c] = m.dataset.rc ? m.dataset.rc.split(',').map(Number) : memberSlots[i]
      memberAt[(r - 1) * COLS + (c - 1)] = m
    })
  }

  let isOpen = false
  let closeT = 0
  // mobile dùng bản .cmenu__m (không có ô member) -> không dựng / tải ảnh chân dung member
  const mobileMQ = matchMedia('(max-width: 899px)')
  const mobile = () => mobileMQ.matches
  mobileMQ.addEventListener?.('change', () => isOpen && !mobile() && fill())
  const btn = () => document.querySelector('.cl__menu')
  // Chiều cao thấy được LÚC MỞ menu (bản mobile neo cụm credit cách đáy 32): --vp của trang trừ sẵn thanh nổi
  // Safari iOS 26 (~56, cho lúc đang cuộn) — mở menu thường lúc thanh đang mở rộng, không đè trang -> trừ thừa,
  // cụm dưới hở quá. innerHeight lớn hơn lúc tải trang (thanh đã thu, trang vẽ xuống dưới thanh) mới trừ.
  const IOS_BAR = 56
  const ios26 = /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(navigator.userAgent) && +(navigator.userAgent.match(/Version\/(\d+)/)?.[1] || 0) >= 26
  const ihLoad = innerHeight
  function fitHeight() {
    const h = innerHeight
    root.style.setProperty('--mvh', `${ios26 && h > ihLoad + 10 ? h - IOS_BAR : h}px`)
  }
  addEventListener('resize', () => isOpen && fitHeight())
  function open() {
    if (isOpen) return
    isOpen = true
    fitHeight()
    clearTimeout(closeT)
    ;(mobile() ? Promise.resolve() : fill()).then(codeIn)
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
