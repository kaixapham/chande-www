/* =============================================================================
 * CHANDE — Devtools (CHỈ DÙNG LÚC LÀM VIỆC)
 * -----------------------------------------------------------------------------
 * Một bảng duy nhất ở đáy màn, hai tab:
 *   • Loading    — play / pause / tua timeline + màu nền, dither, màu element
 *   • Transition — chạy thử rèm, đi Home / Page A / Page B, màu 4 cột, nhịp
 *                  chuyển động, và NẠP ẢNH DEMO cho page A / page B
 *
 * Bảng chỉ nói chuyện với API công khai của hai file hiệu ứng; hai file đó không
 * biết gì về bảng này. Bàn giao cho dev = xoá đúng một thẻ
 * <script src="assets/js/chande-devtools.js">.
 *
 * Giá trị đã chỉnh lưu ở localStorage khoá 'chande-devtools' (ảnh demo ở
 * 'chande-devtools-shots') và ĐÈ LÊN CONFIG trong file hiệu ứng — thấy hành vi
 * lạ thì đọc localStorage trước khi nghi code.
 * ========================================================================== */
(() => {
  'use strict'

  const CL = window.CHANDE_LOADING
  const CT = window.CHANDE_TRANSITION
  if (!CL && !CT) return

  const KEY = 'chande-devtools'
  const KEY_SHOTS = 'chande-devtools-shots'
  const MAX_SHOT = 1.5 * 1024 * 1024 // ảnh lớn hơn thì chỉ giữ trong phiên

  /* ------------------------------------------------------------ lược đồ ---- */
  // Ba tab. Hai tab rèm cùng trỏ về module transition, khác nhau ở `variant` —
  // chuyển tab là đổi luôn biến thể rèm sẽ chạy khi bấm link.
  const TABS = [
    CL && { id: 'loading', label: 'Loading', mod: 'loading' },
    CT && { id: 'sweep', label: 'Rèm quét', mod: 'transition', variant: 'sweep' },
    CT && { id: 'split', label: 'Rèm chẻ', mod: 'transition', variant: 'split' },
    CT && { id: 'stack', label: 'Trượt thẻ', mod: 'transition', variant: 'stack' },
  ].filter(Boolean)
  const TAB = (id) => TABS.find((t) => t.id === id) || TABS[0]

  const DITHER = (p) => [
    { path: `${p}.enabled`, label: 'Bật', type: 'bool' },
    { path: `${p}.style`, label: 'Style', type: 'select',
      options: ['bayer2', 'bayer4', 'bayer8', 'bayer16'] },
    { path: `${p}.size`, label: 'Size', type: 'range', min: 1, max: 8, step: 1 },
    { path: `${p}.levels`, label: 'Levels', type: 'range', min: 2, max: 16, step: 1 },
    { path: `${p}.brightness`, label: 'Brightness', type: 'range', min: 0, max: 2, step: 0.05 },
    { path: `${p}.contrast`, label: 'Contrast', type: 'range', min: 0, max: 3, step: 0.05 },
    { path: `${p}.mono`, label: 'Mono', type: 'bool' },
    { path: `${p}.monoColor`, label: 'Mono color', type: 'color' },
  ]

  const MOTION = (p, extra = []) => [
    { path: `${p}.duration`, label: 'Duration (s)', type: 'range', min: 0.2, max: 1.6, step: 0.02 },
    { path: `${p}.stagger`, label: 'Stagger (s)', type: 'range', min: 0, max: 0.3, step: 0.01 },
    { path: `${p}.enterAt`, label: 'Tráo trang lúc (s)', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
    { path: `${p}.leaveFrom`, label: 'Phủ từ', type: 'select',
      options: ['start', 'end', 'center', 'edges'] },
    { path: `${p}.revealFrom`, label: 'Rút từ', type: 'select',
      options: ['start', 'end', 'center', 'edges'] },
    ...extra,
    { path: 'lenis.lerp', label: 'Lenis lerp', type: 'range', min: 0.02, max: 0.5, step: 0.005 },
  ]

  const LABELS = (p, n = 4) =>
    Array.from({ length: n }, (_, i) => ({
      path: `${p}.${i}`, label: `Cột ${i + 1}`, type: 'text',
    }))

  const ALIGN = ['top', 'center', 'bottom']

  const COLORS = (p, n = 4) =>
    Array.from({ length: n }, (_, i) => ({
      path: `${p}.${i}`, label: `Cột ${i + 1}`, type: 'color',
    }))

  const TYPE = (tab) => ({
    tab, mod: 'transition', title: 'Kiểu chữ (dùng chung 2 rèm)',
    items: [
      { path: 'label.fontSize', label: 'Cỡ chữ (px)', type: 'range', min: 24, max: 200, step: 1 },
      { path: 'label.padding', label: 'Padding (px)', type: 'range', min: 0, max: 96, step: 1 },
      { path: 'label.lineHeight', label: 'Line-height', type: 'range', min: 0.8, max: 1.6, step: 0.01 },
      { path: 'label.color', label: 'Màu chữ', type: 'color' },
    ],
  })

  // Thanh menu: dùng chung cho cả ba biến thể, nên hiện ở cả ba tab rèm.
  const HEADER = (tab) => ({
    tab, mod: 'transition', title: 'Thanh menu (dùng chung)',
    items: [
      { path: 'header.mode', label: 'Kiểu', type: 'select', options: ['hide', 'static'] },
      { path: 'header.y', label: 'Trồi lên (%)', type: 'range', min: -140, max: 0, step: 1 },
      { path: 'header.hideDuration', label: 'Lên (s)', type: 'range', min: 0.1, max: 1.6, step: 0.02 },
      { path: 'header.showDuration', label: 'Xuống (s)', type: 'range', min: 0.1, max: 1.6, step: 0.02 },
      { path: 'header.showLag', label: 'Trễ xuống (s)', type: 'range', min: 0, max: 1.2, step: 0.02 },
    ],
  })

  const GROUPS = [
    { tab: 'loading', mod: 'loading', title: 'Nền',
      items: [{ path: 'bg', label: 'Background', type: 'color' }] },
    { tab: 'loading', mod: 'loading', title: 'Dither', items: DITHER('dither') },
    { tab: 'loading', mod: 'loading', title: 'Element — lúc loading',
      items: [
        { path: 'stroke', label: 'Stroke', type: 'color' },
        { path: 'strokeOpacity', label: 'Stroke mờ', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'fill', label: 'Khối loading', type: 'color' },
      ] },
    { tab: 'loading', mod: 'loading', title: 'Element — sau finish',
      items: [
        { path: 'cream', label: 'Ô thương hiệu', type: 'color' },
        { path: 'green', label: 'Chữ trên nền kem', type: 'color' },
        { path: 'ink', label: 'Ô track', type: 'color' },
        { path: 'track', label: 'Ô nav 01', type: 'color' },
        { path: 'navDone', label: 'Ô nav 02', type: 'color' },
      ] },

    // ---- Rèm quét: 4 cột trôi từ trên xuống rồi ra khỏi mép dưới ----
    { tab: 'sweep', mod: 'transition', title: 'Màu 4 cột', items: COLORS('sweep.colors') },
    { tab: 'sweep', mod: 'transition', title: 'Dither cột', items: DITHER('sweep.dither') },
    { tab: 'sweep', mod: 'transition', title: 'Chữ trên cột',
      items: [
        ...LABELS('sweep.labels'),
        { path: 'sweep.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    TYPE('sweep'),
    HEADER('sweep'),
    { tab: 'sweep', mod: 'transition', title: 'Chuyển động', items: MOTION('sweep') },

    // ---- Rèm chẻ: 4 cột trên thả xuống + 4 cột dưới đẩy lên, gặp ở giữa ----
    { tab: 'split', mod: 'transition', title: 'Màu 4 cột trên', items: COLORS('split.colors') },
    { tab: 'split', mod: 'transition', title: 'Màu 4 cột dưới', items: COLORS('split.colorsBottom') },
    { tab: 'split', mod: 'transition', title: 'Chữ 4 cột trên',
      items: [
        ...LABELS('split.labels'),
        { path: 'split.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'split', mod: 'transition', title: 'Chữ 4 cột dưới',
      items: [
        ...LABELS('split.labelsBottom'),
        { path: 'split.labelAlignBottom', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'split', mod: 'transition', title: 'Dither cột', items: DITHER('split.dither') },
    TYPE('split'),
    HEADER('split'),

    // ---- Trượt thẻ ----
    { tab: 'stack', mod: 'transition', title: 'Tấm giữa',
      items: [
        { path: 'stack.color', label: 'Màu', type: 'color' },
        { path: 'stack.radius', label: 'Bo góc (em)', type: 'range', min: 0, max: 4, step: 0.05 },
        { path: 'stack.label', label: 'Chữ', type: 'text' },
        { path: 'stack.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'stack', mod: 'transition', title: 'Dither tấm giữa', items: DITHER('stack.dither') },
    { tab: 'stack', mod: 'transition', title: 'Co lại',
      items: [
        { path: 'stack.shrinkDuration', label: 'Duration (s)', type: 'range', min: 0.3, max: 2.5, step: 0.02 },
        { path: 'stack.clipDuration', label: 'Bo góc (s)', type: 'range', min: 0.1, max: 2, step: 0.02 },
        { path: 'stack.wrapperScale', label: 'Trang cũ · scale', type: 'range', min: 0.5, max: 1, step: 0.005 },
        { path: 'stack.wrapperY', label: 'Trang cũ · Y (%)', type: 'range', min: 0, max: 60, step: 1 },
        { path: 'stack.middleScale', label: 'Tấm giữa · scale', type: 'range', min: 0.5, max: 1, step: 0.005 },
        { path: 'stack.middleY', label: 'Tấm giữa · Y (%)', type: 'range', min: 0, max: 60, step: 1 },
        { path: 'stack.nextScale', label: 'Trang mới · scale', type: 'range', min: 0.4, max: 1, step: 0.005 },
      ] },
    HEADER('stack'),
    { tab: 'stack', mod: 'transition', title: 'Trượt ra',
      items: [
        { path: 'stack.exitDuration', label: 'Duration (s)', type: 'range', min: 0.3, max: 2.5, step: 0.02 },
        { path: 'stack.exitAt', label: 'Bắt đầu lúc (s)', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'stack.middleLag', label: 'Trễ từng lớp (s)', type: 'range', min: 0, max: 0.6, step: 0.01 },
        { path: 'stack.wrapperExitY', label: 'Trang cũ · Y (%)', type: 'range', min: 100, max: 200, step: 1 },
        { path: 'stack.middleExitY', label: 'Tấm giữa · Y (%)', type: 'range', min: 100, max: 200, step: 1 },
        { path: 'stack.zIndex', label: 'z-index tấm giữa', type: 'range', min: 0, max: 10, step: 1 },
        { path: 'lenis.lerp', label: 'Lenis lerp', type: 'range', min: 0.02, max: 0.5, step: 0.005 },
      ] },
    { tab: 'split', mod: 'transition', title: 'Chuyển động',
      items: MOTION('split', [
        { path: 'split.splitAt', label: 'Đường gặp (%)', type: 'range', min: 10, max: 90, step: 1 },
      ]) },
  ]

  const MODS = { loading: CL, transition: CT }
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
  const set = (o, p, v) => {
    const k = p.split('.')
    const last = k.pop()
    k.reduce((a, x) => a[x], o)[last] = v
  }
  const live = (g) => MODS[g.mod]
  const groups = () => GROUPS.filter((g) => live(g))

  /* ------------------------------------------------------------ lưu trữ ---- */
  function loadSettings() {
    let saved
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) {}
    if (!saved) return
    if (saved.__tab && TABS.some((t) => t.id === saved.__tab)) tab = saved.__tab
    const touched = new Set()
    for (const g of groups())
      for (const f of g.items) {
        const k = `${g.mod}.${f.path}`
        if (saved[k] !== undefined) {
          set(live(g).config, f.path, saved[k])
          touched.add(g.mod)
        }
      }
    const t = TAB(tab)
    if (t.variant && CT) CT.setVariant(t.variant)
    touched.forEach((m) => MODS[m]?.refresh?.())
  }

  function saveSettings() {
    const out = { __tab: tab }
    for (const g of groups())
      for (const f of g.items) out[`${g.mod}.${f.path}`] = get(live(g).config, f.path)
    try { localStorage.setItem(KEY, JSON.stringify(out)) } catch (e) {}
  }

  /* ---------------------------------------------------------- ảnh demo ----- */
  // Ghi vào biến CSS ở <html> nên ảnh sống sót qua mọi lần Barba swap container.
  function applyShot(slot, url) {
    const el = document.documentElement
    const prop = `--shot-${slot}`
    const flag = slot === 'a' ? 'shotA' : 'shotB'
    if (url) {
      el.style.setProperty(prop, `url("${url}")`)
      el.dataset[flag] = '1'
    } else {
      el.style.removeProperty(prop)
      delete el.dataset[flag]
    }
  }

  function loadShots() {
    let s
    try { s = JSON.parse(localStorage.getItem(KEY_SHOTS) || 'null') } catch (e) {}
    if (!s) return
    if (s.a) applyShot('a', s.a)
    if (s.b) applyShot('b', s.b)
  }

  function saveShot(slot, dataUrl) {
    let s = {}
    try { s = JSON.parse(localStorage.getItem(KEY_SHOTS) || '{}') } catch (e) {}
    if (dataUrl) s[slot] = dataUrl
    else delete s[slot]
    try { localStorage.setItem(KEY_SHOTS, JSON.stringify(s)) } catch (e) {}
  }

  function readShot(slot, file, note) {
    // Hiển thị ngay bằng object URL, không phải chờ đọc xong.
    applyShot(slot, URL.createObjectURL(file))
    if (file.size > MAX_SHOT) {
      note(`${(file.size / 1048576).toFixed(1)}MB — chỉ giữ trong phiên này`)
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      applyShot(slot, fr.result)
      saveShot(slot, fr.result)
      note(file.name)
    }
    fr.readAsDataURL(file)
  }

  /* ---------------------------------------------------------------- CSS ---- */
  const style = document.createElement('style')
  style.textContent = `
.cdev{
  position:fixed; left:50%; bottom:20px; transform:translateX(-50%); z-index:10000;
  width:min(1060px, calc(100vw - 40px));
  background:#f5f0e3; color:#245535; border:1px solid rgba(36,85,53,.22);
  font:600 12px/1.2 'Phudu',ui-sans-serif,system-ui,sans-serif;
  text-transform:uppercase; letter-spacing:.02em;
  display:flex; flex-direction:column;
}
.cdev button{
  font:inherit; color:#245535; background:transparent;
  border:1px solid rgba(36,85,53,.28); padding:8px 10px; cursor:pointer; white-space:nowrap;
  transition:background .16s ease,color .16s ease,border-color .16s ease;
}
.cdev button:hover{background:#68f12b; color:#0f1513; border-color:#68f12b}
.cdev button:focus-visible{outline:2px solid #68f12b; outline-offset:2px}
.cdev button[aria-pressed=true]{background:#245535; color:#f5f0e3; border-color:#245535}

.cdev__bar{display:flex; align-items:center; gap:10px; padding:10px; flex-wrap:wrap}
.cdev__tabs{display:flex; gap:5px}
.cdev__ctrl{display:flex; align-items:center; gap:8px; flex:1; min-width:180px}
.cdev__play{min-width:78px}
.cdev__range{flex:1; appearance:none; -webkit-appearance:none; height:5px; min-width:80px;
  background:rgba(36,85,53,.18); cursor:pointer}
.cdev__range::-webkit-slider-thumb{-webkit-appearance:none; width:10px; height:17px;
  background:#245535; border:0; cursor:grab}
.cdev__range::-moz-range-thumb{width:10px; height:17px; background:#245535; border:0; border-radius:0}
.cdev__time{font-variant-numeric:tabular-nums; min-width:88px; text-align:right}

.cdev__panel{
  border-bottom:1px solid rgba(36,85,53,.18); padding:4px 10px 12px;
  max-height:44vh; overflow:auto;
  display:grid; grid-template-columns:repeat(auto-fill, minmax(238px, 1fr)); gap:0 20px;
}
.cdev.is-closed .cdev__panel{display:none}
.cdev__g{margin-top:10px; break-inside:avoid}
.cdev__g > h4{margin:0 0 6px; font-size:10px; opacity:.55; letter-spacing:.08em}
.cdev__r{display:flex; align-items:center; gap:8px; padding:3px 0}
.cdev__r > label{flex:1; font-size:11px; text-transform:none}
.cdev__r input[type=color]{width:30px; height:22px; padding:0;
  border:1px solid rgba(36,85,53,.28); background:none; cursor:pointer}
.cdev__txt{
  font:inherit; font-size:11px; text-transform:uppercase; letter-spacing:.02em;
  width:108px; padding:3px 5px; color:#245535; background:#fff;
  border:1px solid rgba(36,85,53,.28);
}
.cdev__txt:focus{outline:2px solid #68f12b; outline-offset:-1px}
.cdev__hex{
  font:inherit; font-size:11px; text-transform:uppercase; letter-spacing:.04em;
  width:72px; padding:3px 5px; color:#245535; background:#fff;
  border:1px solid rgba(36,85,53,.28);
}
.cdev__hex:focus{outline:2px solid #68f12b; outline-offset:-1px}
.cdev__r input[type=range]{width:92px; accent-color:#245535}
.cdev__r select{font:inherit; font-size:11px; text-transform:none; color:#245535;
  background:#fff; border:1px solid rgba(36,85,53,.28); padding:2px 4px}
.cdev__v{width:36px; text-align:right; font-variant-numeric:tabular-nums; font-size:11px}
.cdev__file{display:flex; align-items:center; gap:6px}
.cdev__file input{display:none}
.cdev__file .cdev__pick{padding:4px 8px; font-size:11px}
.cdev__note{font-size:10px; text-transform:none; opacity:.55;
  max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

@media (max-width:899px){
  .cdev{bottom:12px; width:calc(100vw - 24px)}
  .cdev__ctrl{order:3; flex-basis:100%}
  .cdev__panel{grid-template-columns:1fr; max-height:52vh}
}`
  document.head.appendChild(style)

  /* ---------------------------------------------------------------- DOM ---- */
  const dev = document.createElement('div')
  dev.className = 'cdev is-closed'
  dev.innerHTML = `
  <div class="cdev__panel"></div>
  <div class="cdev__bar">
    <div class="cdev__tabs">
      ${TABS.map((t) => `<button type="button" data-tab="${t.id}">${t.label}</button>`).join('')}
    </div>
    <div class="cdev__ctrl"></div>
    <button type="button" data-reset>Reset</button>
    <button type="button" data-fold>Settings</button>
  </div>`
  const panel = dev.querySelector('.cdev__panel')
  const ctrl = dev.querySelector('.cdev__ctrl')

  let tab = TABS[0].id

  /* ------------------------------------------------------------- các ô ---- */
  function row(g, f) {
    const cfg = live(g).config
    const v = get(cfg, f.path)
    const r = document.createElement('div')
    r.className = 'cdev__r'
    const id = `cdev-${g.mod}-${f.path.replace(/\./g, '-')}`
    let input
    if (f.type === 'color')
      input =
        `<input class="cdev__hex" type="text" maxlength="7" spellcheck="false" ` +
        `value="${v}" aria-label="Mã màu ${f.label}">` +
        `<input id="${id}" type="color" value="${v}">`
    else if (f.type === 'text')
      input = `<input id="${id}" class="cdev__txt" type="text" value="${String(v).replace(/"/g, '&quot;')}" placeholder="—">`
    else if (f.type === 'bool') input = `<input id="${id}" type="checkbox" ${v ? 'checked' : ''}>`
    else if (f.type === 'select')
      input = `<select id="${id}">${f.options
        .map((o) => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    else
      input = `<input id="${id}" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">` +
              `<span class="cdev__v">${v}</span>`
    r.innerHTML = `<label for="${id}">${f.label}</label>${input}`

    const out = r.querySelector('.cdev__v')
    const commit = (nv) => {
      set(cfg, f.path, nv)
      if (out) out.textContent = nv
      live(g).refresh?.()
      saveSettings()
    }

    if (f.type === 'color') {
      // Hai ô cùng sửa một giá trị: bảng chọn màu và ô gõ/dán mã hex.
      const hex = r.querySelector('.cdev__hex')
      const pick = r.querySelector('input[type=color]')
      pick.addEventListener('input', () => {
        hex.value = pick.value
        commit(pick.value)
      })
      const fromHex = () => {
        const t = hex.value.trim().replace(/^#?/, '')
        // Chấp nhận cả dạng 3 kí tự (#abc -> #aabbcc).
        const full =
          t.length === 3 && /^[0-9a-f]{3}$/i.test(t)
            ? t.replace(/./g, (c) => c + c)
            : t
        if (!/^[0-9a-f]{6}$/i.test(full)) {
          hex.value = get(cfg, f.path) // gõ sai thì trả về giá trị đang dùng
          hex.classList.remove('is-bad')
          return
        }
        const nv = `#${full.toLowerCase()}`
        hex.value = nv
        pick.value = nv
        commit(nv)
      }
      hex.addEventListener('change', fromHex)
      hex.addEventListener('blur', fromHex)
      hex.addEventListener('keydown', (e) => e.key === 'Enter' && fromHex())
      return r
    }

    const el = r.querySelector('input,select')
    el.addEventListener('input', () =>
      commit(f.type === 'bool' ? el.checked : f.type === 'range' ? parseFloat(el.value) : el.value)
    )
    return r
  }

  function shotRow(slot, label) {
    const r = document.createElement('div')
    r.className = 'cdev__r'
    r.innerHTML = `
      <label>${label}</label>
      <span class="cdev__note"></span>
      <span class="cdev__file">
        <button class="cdev__pick" type="button">Chọn</button>
        <button class="cdev__pick" type="button" data-clear>✕</button>
        <input type="file" accept="image/*">
      </span>`
    const note = r.querySelector('.cdev__note')
    const file = r.querySelector('input[type=file]')
    const say = (t) => (note.textContent = t)
    r.querySelectorAll('.cdev__pick')[0].addEventListener('click', () => file.click())
    r.querySelector('[data-clear]').addEventListener('click', () => {
      applyShot(slot, null); saveShot(slot, null); file.value = ''; say('')
    })
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      if (f) readShot(slot, f, say)
    })
    if (document.documentElement.dataset[slot === 'a' ? 'shotA' : 'shotB']) say('đã nạp')
    return r
  }

  function buildPanel() {
    panel.textContent = ''
    for (const g of groups()) {
      if (g.tab !== tab) continue
      const box = document.createElement('div')
      box.className = 'cdev__g'
      const h = document.createElement('h4')
      h.textContent = g.title
      box.appendChild(h)
      for (const f of g.items) box.appendChild(row(g, f))
      panel.appendChild(box)
    }
    if (TAB(tab).mod === 'transition' && CT) {
      const box = document.createElement('div')
      box.className = 'cdev__g'
      box.innerHTML = '<h4>Ảnh demo</h4>'
      box.appendChild(shotRow('a', 'Page A — Gallery'))
      box.appendChild(shotRow('b', 'Page B — About'))
      panel.appendChild(box)
    }
  }

  /* ------------------------------------------------- điều khiển theo tab --- */
  let unbind = null

  function buildCtrl() {
    unbind?.()
    unbind = null
    ctrl.textContent = ''

    if (tab === 'loading' && CL) {
      ctrl.innerHTML = `
        <button class="cdev__play" type="button" data-toggle>▶ Play</button>
        <button type="button" data-restart>Restart</button>
        <input class="cdev__range" type="range" min="0" max="1000" value="0" step="1"
               aria-label="Tua timeline">
        <span class="cdev__time">0.00 / 0.00s</span>`
      const range = ctrl.querySelector('.cdev__range')
      const timeEl = ctrl.querySelector('.cdev__time')
      const playEl = ctrl.querySelector('.cdev__play')
      const secs = (ms) => (ms / 1000).toFixed(2)
      let dragging = false
      range.addEventListener('pointerdown', () => (dragging = true))
      range.addEventListener('pointerup', () => (dragging = false))
      range.addEventListener('input', () => CL.seekTime((range.value / 1000) * CL.duration))
      unbind = CL.onUpdate((s) => {
        if (!dragging) range.value = Math.round((s.time / CL.duration) * 1000)
        timeEl.textContent = `${secs(s.time)} / ${secs(CL.duration)}s`
        playEl.textContent = s.playing ? '❚❚ Pause' : '▶ Play'
      })
    } else if (CT) {
      const canPlay = CT.canPlayInPlace ? CT.canPlayInPlace() : true
      ctrl.innerHTML = `
        ${canPlay ? '<button class="cdev__play" type="button" data-play-ct>▶ Chạy rèm</button>' : ''}
        <button type="button" data-go="index.html">Home</button>
        <button type="button" data-go="gallery.html">Page A</button>
        <button type="button" data-go="about.html">Page B</button>`
    }
  }

  /* ------------------------------------------------------------- sự kiện -- */
  dev.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.dataset.tab) {
      tab = b.dataset.tab
      const t = TAB(tab)
      if (t.variant) CT.setVariant(t.variant)
      syncTabs()
      buildCtrl()
      buildPanel()
      saveSettings()
    } else if (b.hasAttribute('data-fold')) {
      dev.classList.toggle('is-closed')
      b.setAttribute('aria-pressed', String(!dev.classList.contains('is-closed')))
    } else if (b.hasAttribute('data-reset')) {
      for (const g of groups())
        if (g.tab === tab)
          for (const f of g.items)
            set(live(g).config, f.path, structuredClone(get(live(g).defaults, f.path)))
      saveSettings()
      MODS[TAB(tab).mod]?.refresh?.()
      buildPanel()
    } else if (b.hasAttribute('data-toggle')) CL.toggle()
    else if (b.hasAttribute('data-restart')) CL.restart()
    else if (b.hasAttribute('data-play-ct')) CT.play()
    else if (b.dataset.go) CT.go(b.dataset.go)
  })

  function syncTabs() {
    dev.querySelectorAll('[data-tab]').forEach((t) =>
      t.setAttribute('aria-pressed', String(t.dataset.tab === tab))
    )
  }

  addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select')) return
    if (!CL) return
    if (e.code === 'Space') { e.preventDefault(); CL.toggle() }
    else if (e.code === 'ArrowRight') CL.seekTime(CL.state.time + 100)
    else if (e.code === 'ArrowLeft') CL.seekTime(CL.state.time - 100)
  })

  /* ----------------------------------------------------------- khởi động - */
  loadSettings()
  loadShots()
  document.body.appendChild(dev)
  syncTabs()
  buildCtrl()
  buildPanel()
})()
