/* =============================================================================
 * CHANDE — Ngăn "Quản lý ảnh" của Gallery 3D (chỉ admin; chande-g3.js nạp khi chạy local / ?admin=1)
 * -----------------------------------------------------------------------------
 *   01 Animation — easing (có sẵn / tự nhập cubic-bezier) + thời lượng cho lúc tem bay ra
 *      và lúc bay về; chỉnh là thấy ngay. Vào trang: tem toả từ tâm ra mép (easing, thời lượng mỗi tem,
 *      thời gian toả hết ra mép, nút chạy lại để xem).
 *   02 Ảnh — kéo thả / chọn nhiều ảnh: mỗi ảnh nén 2 bản (tem ≤ 720 px, ảnh lớn ≤ 1600 px), thêm vào
 *      không gian ngay; đổi tên, xoá (bấm 2 lần), ↑ ↓ đổi thứ tự.
 *   03 Bố cục ảnh — ảnh ở xa mờ dần vào sương / chỉ bé đi, ảnh đè nhau (tự do / chỉ đè mép / không đè /
 *      không đè trừ ảnh chính — số ảnh chính, mỗi ảnh chính đè tối đa mấy ảnh), tránh xếp thẳng hàng, mật độ,
 *      độ rải đều, cỡ tem, chênh lệch cỡ, xoay ngẫu nhiên, tầm nhìn xa; bướm bay (bật / tắt, cỡ); xáo lại bố
 *      cục (seed), về mặc định.
 *   Lưu — ghi danh sách ảnh (<script data-g3-items>) + animation (data-g3-anim) + bố cục (data-g3-layout) vào gallery.html cùng
 *   các file ảnh mới: chạy local (node serve.mjs) thì POST /__cms/save; trên site thì commit qua token
 *   GitHub đã nhập ở CMS (localStorage chande-cms-gh), chưa có thì hiện ô nhập.
 * Dựng trên Infinite Canvas của Edoardo Lunardi (MIT) — giữ dòng ghi công trong ngăn.
 * ========================================================================== */
const EASINGS = [
  ['linear', 'Linear', [0, 0, 1, 1]],
  ['ease', 'Ease', [0.25, 0.1, 0.25, 1]],
  ['easeIn', 'Ease in', [0.42, 0, 1, 1]],
  ['easeOut', 'Ease out', [0, 0, 0.58, 1]],
  ['easeInOut', 'Ease in-out', [0.42, 0, 0.58, 1]],
  ['sineInOut', 'Sine in-out', [0.37, 0, 0.63, 1]],
  ['cubicOut', 'Cubic out', [0.33, 1, 0.68, 1]],
  ['cubicInOut', 'Cubic in-out', [0.65, 0, 0.35, 1]],
  ['quartOut', 'Quart out', [0.25, 1, 0.5, 1]],
  ['quartInOut', 'Quart in-out', [0.76, 0, 0.24, 1]],
  ['expoOut', 'Expo out', [0.16, 1, 0.3, 1]],
  ['expoInOut', 'Expo in-out', [0.87, 0, 0.13, 1]],
  ['backOut', 'Back out (overshoot)', [0.34, 1.56, 0.64, 1]],
  ['backInOut', 'Back in-out', [0.68, -0.6, 0.32, 1.6]],
  ['custom', 'Custom cubic-bezier', null],
]
const ANIM_DEFAULTS = {
  open: { ms: 680, preset: 'expoOut', bez: [0.16, 1, 0.3, 1] },
  close: { ms: 520, preset: 'quartInOut', bez: [0.76, 0, 0.24, 1] },
  intro: { ms: 1200, preset: 'expoOut', bez: [0.16, 1, 0.3, 1], spread: 900 },
}
const LIMITS = { min: 100, max: 3000 }
const GROUPS = [
  ['open', 'Mở rộng', 'Ảnh bay từ canvas ra giữa màn hình'],
  ['close', 'Thu nhỏ', 'Ảnh bay ngược về vị trí cũ'],
  ['intro', 'Vào trang', 'Ảnh hiện lần lượt từ tâm toả ra mép (Duration = thời gian mỗi tem)'],
]
const SIZES = { img: 720, full: 1600 }
const GH_KEY = 'chande-cms-gh'
const PAGE = 'gallery.html'

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const num = (v, d) => (Number.isFinite(+v) ? +v : d)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
function cleanAnim(raw, base) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const preset = EASINGS.some((e) => e[0] === o.preset) ? o.preset : base.preset
  const found = EASINGS.find((e) => e[0] === preset)
  let bez = found[2] || (Array.isArray(o.bez) && o.bez.length === 4 ? o.bez.map((n, i) => num(n, base.bez[i])) : base.bez)
  bez = [clamp(bez[0], 0, 1), bez[1], clamp(bez[2], 0, 1), bez[3]]
  return { ms: clamp(Math.round(num(o.ms, base.ms)), LIMITS.min, LIMITS.max), preset, bez }
}
// thẻ <section ... data-g3 ...> của gallery.html: ghi lại data-g3-anim / data-g3-layout. Gỡ sạch mọi bản cũ
// (kể cả mảnh "-anim='…'" / "-layout='…'" do bản lưu lỗi trước để lại) rồi gắn một bộ mới ngay sau class.
// Lưu ý: không dùng \bdata-g3\b — "-" cũng là ranh giới từ nên nó khớp nhầm vào giữa data-g3-anim.
const G3_TAG = /<section\b[^>]*\sdata-g3[\s>-][^>]*>/
function g3Tag(tag, anim, layout) {
  const attr = (o) => esc(JSON.stringify(o)).replace(/&quot;/g, '"')
  const t = tag.replace(/\s*(?:data-g3)?-(?:anim|layout)='[^']*'/g, '').replace(/\s+data-g3(?=[\s>])/g, '')
  const add = ` data-g3 data-g3-anim='${attr(anim)}' data-g3-layout='${attr(layout)}'`
  return /\sclass="[^"]*"/.test(t) ? t.replace(/(\sclass="[^"]*")/, `$1${add}`) : t.replace(/^<section\b/, `<section${add}`)
}
function curveSvg(b) {
  const X = (x) => 8 + x * 56
  const Y = (y) => 8 + 14 + (1 - y) * 56
  return `<svg viewBox="0 0 72 92" width="72" height="92" aria-hidden="true">
    <rect x="8" y="22" width="56" height="56" fill="none" stroke="rgba(15,21,19,.18)"/>
    <path d="M${X(0)} ${Y(0)}L${X(b[0])} ${Y(b[1])}M${X(1)} ${Y(1)}L${X(b[2])} ${Y(b[3])}" stroke="rgba(15,21,19,.35)" stroke-width="1" fill="none"/>
    <path d="M${X(0)} ${Y(0)} C${X(b[0])} ${Y(b[1])}, ${X(b[2])} ${Y(b[3])}, ${X(1)} ${Y(1)}" stroke="#0f1513" stroke-width="2" fill="none"/>
    <circle cx="${X(b[0])}" cy="${Y(b[1])}" r="3" fill="#68f12b" stroke="#0f1513"/><circle cx="${X(b[2])}" cy="${Y(b[3])}" r="3" fill="#68f12b" stroke="#0f1513"/>
  </svg>`
}
const DOTS = '<svg viewBox="0 0 20 20" fill="currentColor"><circle cx="3" cy="3" r="3"/><circle cx="17" cy="3" r="3"/><circle cx="3" cy="17" r="3"/><circle cx="17" cy="17" r="3"/></svg>'
const CHEV = '<svg class="g3a-head__chev" viewBox="0 0 12 8" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 1.5l5 5 5-5"/></svg>'
const CLOSE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'

// [khoá, nhãn, min, max, bước, cách hiện số, gợi ý]
// thanh trượt riêng của chế độ 'hero' (nằm ngay dưới lựa chọn đè nhau, chỉ hiện khi chọn chế độ đó)
const HERO_SLIDERS = [
  ['heroes', '', 1, 4, 1, (v) => `${v} ảnh`],
  ['heroHits', '', 1, 4, 1, (v) => `${v} ảnh`],
  ['bfSize', '', 0.5, 2, 0.05, (v) => `× ${(+v).toFixed(2)}`], // nằm ở mục bướm bay, cùng cách nối
]
const SLIDERS = [
  ['density', 'Mật độ ảnh', 3, 9, 1, (v) => `${v} / khối`],
  ['even', 'Rải đều', 0, 1, 0.05, (v) => `${Math.round(v * 100)}%`, '0% = ngẫu nhiên hoàn toàn (dễ có chỗ dồn cục, chỗ trống) · 100% = trải đều khắp không gian'],
  ['size', 'Cỡ tem', 0.6, 1.6, 0.05, (v) => `× ${(+v).toFixed(2)}`],
  ['vary', 'Chênh lệch cỡ', 0, 0.6, 0.05, (v) => `± ${Math.round(v * 100)}%`, '0% = mọi tem bằng nhau'],
  ['tilt', 'Xoay ngẫu nhiên', 0, 15, 1, (v) => `± ${v}°`],
  ['depth', 'Tầm nhìn xa', 160, 300, 10, (v) => `${v}`, 'Nhỏ = chỉ thấy ảnh gần, thoáng hơn · lớn = thấy cả ảnh rất xa'],
]

export function mountAdmin({ el, config, getItems, setItems, setLayout, layoutDefaults = {}, replayIntro }) {
  const ac = new AbortController()
  const on = (t, type, fn, opt = {}) => t.addEventListener(type, fn, { ...opt, signal: ac.signal })
  let items = structuredClone(getItems())
  let savedItems = JSON.stringify(items)
  let anim = {
    open: cleanAnim({ ms: config.open.ms, preset: config.open.preset, bez: config.open.bez }, ANIM_DEFAULTS.open),
    close: cleanAnim({ ms: config.close.ms, preset: config.close.preset, bez: config.close.bez }, ANIM_DEFAULTS.close),
    intro: {
      ...cleanAnim({ ms: config.intro?.ms, preset: config.intro?.preset, bez: config.intro?.bez }, ANIM_DEFAULTS.intro),
      spread: clamp(Math.round(num(config.intro?.spread, ANIM_DEFAULTS.intro.spread)), 0, 2500),
    },
  }
  let savedAnim = JSON.stringify(anim)
  let layout = { ...layoutDefaults, ...config.layout }
  let savedLayout = JSON.stringify(layout)
  const pending = new Map() // đường dẫn -> { blob, url } — ảnh mới chưa lưu
  const shown = (p) => pending.get(p)?.url || p
  const applyAnim = () => {
    for (const k of ['open', 'close', 'intro']) config[k] = { ...config[k], ...anim[k], ease: `cubic-bezier(${anim[k].bez.join(',')})` }
  }

  // ---------- khung ----------
  const btn = document.createElement('button')
  btn.className = 'g3a-edit'
  btn.type = 'button'
  btn.innerHTML = `<span>Quản lý ảnh</span><i aria-hidden="true">${DOTS}</i>`
  const drawer = document.createElement('aside')
  drawer.className = 'g3a-drawer'
  drawer.setAttribute('aria-label', 'Quản lý ảnh')
  drawer.setAttribute('aria-hidden', 'true')
  drawer.innerHTML = `
    <div class="g3a-drawer__head"><h2>Quản lý ảnh</h2>
      <button class="g3a-save" type="button" data-save>Lưu</button>
      <button class="g3a-icon" type="button" data-close aria-label="Đóng">${CLOSE}</button></div>
    <div class="g3a-drawer__body">
      <section class="g3a-sec" data-sec="anim">
        <button class="g3a-head" type="button" aria-expanded="true"><b>01</b><span>Animation</span>${CHEV}</button>
        <div class="g3a-sec__body"><div class="g3a-sec__inner"><div data-anim></div></div></div>
      </section>
      <section class="g3a-sec" data-sec="photos">
        <button class="g3a-head" type="button" aria-expanded="true"><b>02</b><span>Ảnh</span>${CHEV}</button>
        <div class="g3a-sec__body"><div class="g3a-sec__inner">
          <label class="g3a-drop" data-drop><strong>Kéo thả ảnh vào đây hoặc bấm để chọn</strong>
            <span class="g3a-sub">JPG, PNG, WebP · chọn nhiều ảnh cùng lúc được · mỗi ảnh nén thành tem 720 px + ảnh lớn 1600 px</span>
            <input data-file type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
          <div class="g3a-queue" data-queue></div>
          <div class="g3a-count" data-count></div>
          <div class="g3a-grid" data-grid></div>
        </div></div>
      </section>
      <section class="g3a-sec" data-sec="layout">
        <button class="g3a-head" type="button" aria-expanded="true"><b>03</b><span>Bố cục ảnh</span>${CHEV}</button>
        <div class="g3a-sec__body"><div class="g3a-sec__inner">
          <div class="g3a-f"><span>Ảnh ở xa</span>
            <div class="g3a-opts" role="radiogroup" aria-label="Ảnh ở xa">
              <label class="g3a-opt"><input type="radio" name="g3-far" value="fade"><span>Sương (ảnh xa ám màu nền)</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-far" value="shrink"><span>Không sương · ảnh nào cũng rõ</span></label>
            </div></div>
          <div class="g3a-f"><span>Ảnh đè nhau</span>
            <div class="g3a-opts" role="radiogroup" aria-label="Ảnh đè nhau">
              <label class="g3a-opt"><input type="radio" name="g3-overlap" value="free"><span>Tự do</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-overlap" value="edge"><span>Chỉ đè mép · tối đa 3 ảnh</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-overlap" value="none"><span>Không đè</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-overlap" value="hero"><span>Không đè · trừ ảnh chính</span></label>
            </div>
            <div class="g3a-hero" data-hero-opts>
              <label class="g3a-f"><span>Số ảnh chính <b data-lv="heroes"></b></span><input data-l="heroes" type="range" min="1" max="4" step="1">
                <small class="g3a-sub">Ảnh chính = những tem to nhất đang hiện trên màn (đủ lớn mới tính).</small></label>
              <label class="g3a-f"><span>Mỗi ảnh chính đè tối đa <b data-lv="heroHits"></b></span><input data-l="heroHits" type="range" min="1" max="4" step="1"></label>
            </div>
            <small class="g3a-sub">Ảnh gần luôn được giữ; ảnh xa bị che nhiều thì mờ đi, camera dịch đi là hiện lại.</small></div>
          <div class="g3a-f"><span>Xếp thẳng hàng</span>
            <div class="g3a-opts" role="radiogroup" aria-label="Xếp thẳng hàng">
              <label class="g3a-opt"><input type="radio" name="g3-align" value="avoid"><span>Tránh · lệch là lệch hẳn</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-align" value="free"><span>Để tự nhiên</span></label>
            </div>
            <small class="g3a-sub">Hai tem đứng gần (trên dưới / cạnh nhau) mà mép hoặc tâm gần thẳng hàng thì tem xa hơn ẩn đi.</small></div>
          ${SLIDERS.map(([k, label, min, max, step, , hint]) => `<label class="g3a-f"><span>${label} <b data-lv="${k}"></b></span><input data-l="${k}" type="range" min="${min}" max="${max}" step="${step}">${hint ? `<small class="g3a-sub">${hint}</small>` : ''}</label>`).join('')}
          <div class="g3a-f"><span>Bướm bay</span>
            <div class="g3a-opts" role="radiogroup" aria-label="Bướm bay">
              <label class="g3a-opt"><input type="radio" name="g3-bf" value="on"><span>Có bướm lượn</span></label>
              <label class="g3a-opt"><input type="radio" name="g3-bf" value="off"><span>Không</span></label>
            </div></div>
          <label class="g3a-f"><span>Cỡ bướm <b data-lv="bfSize"></b></span><input data-l="bfSize" type="range" min="0.5" max="2" step="0.05"></label>
          <div class="g3a-f"><span>Cách rải <b data-seedv></b></span>
            <div class="g3a-row">
              <button class="g3a-reset" type="button" data-shuffle>Xáo lại bố cục</button>
              <button class="g3a-reset" type="button" data-lreset>Về mặc định</button>
            </div>
            <small class="g3a-sub">Mỗi lần xáo ra một cách rải khác (cùng các setting trên) — xáo tới khi ưng thì Lưu.</small></div>
          <span class="g3a-sub">Chỉnh là thấy ngay trên không gian phía sau; bấm Lưu để ghi.</span>
        </div></div>
      </section>
      <p class="g3a-note" data-msg></p>
      <p class="g3a-note">Bấm Lưu để ghi vào gallery.html (chạy local: ghi xuống máy · trên site: commit qua token GitHub của CMS). Ảnh cũng sửa được ở CMS → Gallery 3D.<br>Dựng trên <a href="https://github.com/edoardolunardi/infinite-canvas" target="_blank" rel="noopener">Infinite Canvas</a> của Edoardo Lunardi (MIT).</p>
      <form class="g3a-gh" data-gh hidden>
        <b>Lưu thẳng lên GitHub</b>
        <input name="repo" placeholder="owner/repo">
        <input name="token" type="password" placeholder="token (fine-grained, Contents: read & write)" autocomplete="off">
        <label><input type="checkbox" name="remember"> nhớ trên máy này</label>
        <button class="g3a-save" type="submit">Lưu</button>
      </form>
    </div>`
  el.append(btn, drawer)
  const $ = (s) => drawer.querySelector(s)
  // không có nút trên màn: admin bấm J để mở / đóng (khách xem không nạp file này nên J không làm gì)
  btn.hidden = true
  const isOpen = () => drawer.classList.contains('is-open')
  const open = (v) => {
    drawer.classList.toggle('is-open', v)
    drawer.setAttribute('aria-hidden', String(!v))
    if (v) $('[data-close]').focus()
  }
  on(btn, 'click', () => open(true))
  on($('[data-close]'), 'click', () => open(false))
  on(window, 'keydown', (e) => {
    if (e.key === 'Escape' && isOpen()) return open(false)
    if (e.key.toLowerCase() !== 'j' || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
    e.preventDefault()
    open(!isOpen())
  })
  // con lăn / kéo trong ngăn không lọt xuống không gian 3D
  ;['wheel', 'mousedown', 'touchstart', 'touchmove'].forEach((t) => on(drawer, t, (e) => e.stopPropagation(), { passive: true }))
  for (const sec of drawer.querySelectorAll('[data-sec]')) {
    const head = sec.querySelector('.g3a-head')
    const key = `ch-sec-${sec.dataset.sec}`
    const set = (v) => {
      sec.classList.toggle('is-collapsed', !v)
      head.setAttribute('aria-expanded', String(v))
      sec.querySelector('.g3a-sec__body').inert = !v
    }
    let saved = true
    try {
      saved = localStorage.getItem(key) !== '0'
    } catch {}
    set(saved)
    on(head, 'click', () => {
      const v = head.getAttribute('aria-expanded') !== 'true'
      set(v)
      try {
        localStorage.setItem(key, v ? '1' : '0')
      } catch {}
    })
  }
  const msg = (t, bad) => {
    const m = $('[data-msg]')
    m.textContent = t
    m.classList.toggle('is-bad', !!bad)
  }
  const dirty = () => JSON.stringify(items) !== savedItems || JSON.stringify(anim) !== savedAnim || JSON.stringify(layout) !== savedLayout
  const markDirty = () => ($('[data-save]').textContent = dirty() ? 'Lưu •' : 'Lưu')

  // ---------- 01 animation ----------
  const ctl = {}
  const animBox = $('[data-anim]')
  for (const [key, title, hint] of GROUPS) {
    const g = document.createElement('div')
    g.className = 'g3a-anim'
    g.innerHTML = `<div class="g3a-anim__head"><strong>${title}</strong><span class="g3a-sub">${hint}</span></div>
      <div class="g3a-anim__row"><div class="g3a-anim__fields">
        <label class="g3a-f"><span>Easing</span><select data-ease>${EASINGS.map(([id, label]) => `<option value="${id}">${label}</option>`).join('')}</select></label>
        <div class="g3a-bez" data-bez hidden>${[0, 1, 2, 3].map((i) => `<label class="g3a-f"><span>${['x1', 'y1', 'x2', 'y2'][i]}</span><input data-b="${i}" type="number" step="0.01" ${i % 2 === 0 ? 'min="0" max="1"' : 'min="-3" max="3"'}></label>`).join('')}</div>
        <label class="g3a-f"><span>Duration <b data-msv></b></span><input data-ms type="range" min="${LIMITS.min}" max="${LIMITS.max}" step="10"></label>
        ${key === 'intro' ? `<label class="g3a-f"><span>Toả từ tâm ra mép trong <b data-spv></b></span><input data-spread type="range" min="0" max="2500" step="50"></label>
        <button class="g3a-reset" type="button" data-replay>Chạy lại để xem</button>` : ''}
      </div><div class="g3a-anim__curve" data-curve></div></div>`
    animBox.appendChild(g)
    const c = { ease: g.querySelector('[data-ease]'), bez: g.querySelector('[data-bez]'), b: [...g.querySelectorAll('[data-b]')], ms: g.querySelector('[data-ms]'), msv: g.querySelector('[data-msv]'), curve: g.querySelector('[data-curve]') }
    ctl[key] = c
    const read = () => {
      const preset = c.ease.value
      const spread = anim[key].spread
      anim[key] = cleanAnim({ ms: +c.ms.value, preset, bez: preset === 'custom' ? c.b.map((x, i) => num(x.value, anim[key].bez[i])) : null }, anim[key])
      if (spread != null) anim[key].spread = spread
      paint(key, preset === 'custom')
      applyAnim()
      markDirty()
    }
    on(c.ease, 'change', () => {
      if (c.ease.value === 'custom') c.b.forEach((x, i) => (x.value = anim[key].bez[i]))
      read()
    })
    on(c.ms, 'input', read)
    c.b.forEach((x) => on(x, 'input', read))
    if (key === 'intro') {
      const sp = g.querySelector('[data-spread]')
      const spv = g.querySelector('[data-spv]')
      c.paintSpread = () => {
        sp.value = anim.intro.spread
        spv.textContent = `${anim.intro.spread} ms`
      }
      on(sp, 'input', () => {
        anim.intro.spread = +sp.value
        c.paintSpread()
        applyAnim()
        markDirty()
      })
      on(g.querySelector('[data-replay]'), 'click', () => replayIntro?.())
    }
  }
  const reset = document.createElement('button')
  reset.type = 'button'
  reset.className = 'g3a-reset'
  reset.textContent = 'Đặt lại mặc định'
  on(reset, 'click', () => {
    anim = structuredClone(ANIM_DEFAULTS)
    for (const [k] of GROUPS) paint(k, false)
    applyAnim()
    markDirty()
  })
  animBox.appendChild(reset)
  function paint(key, keepBez) {
    const c = ctl[key]
    const a = anim[key]
    if (document.activeElement !== c.ease) c.ease.value = a.preset
    c.bez.hidden = a.preset !== 'custom'
    if (!keepBez) c.b.forEach((x, i) => document.activeElement !== x && (x.value = a.bez[i]))
    if (document.activeElement !== c.ms) c.ms.value = a.ms
    c.msv.textContent = `${a.ms} ms`
    c.curve.innerHTML = curveSvg(a.bez)
    c.paintSpread?.()
  }
  for (const [k] of GROUPS) paint(k, false)

  // ---------- 03 bố cục ----------
  const radios = (name) => [...drawer.querySelectorAll(`input[name="${name}"]`)]
  const farInputs = radios('g3-far')
  const olInputs = radios('g3-overlap')
  const alInputs = radios('g3-align')
  const bfInputs = radios('g3-bf')
  const paintLayout = () => {
    farInputs.forEach((x) => (x.checked = x.value === layout.far))
    olInputs.forEach((x) => (x.checked = x.value === layout.overlap))
    alInputs.forEach((x) => (x.checked = x.value === layout.align))
    bfInputs.forEach((x) => (x.checked = x.value === layout.butterfly))
    $('[data-hero-opts]').hidden = layout.overlap !== 'hero'
    for (const [k, , , , , fmt] of [...HERO_SLIDERS, ...SLIDERS]) {
      $(`[data-l="${k}"]`).value = layout[k]
      $(`[data-lv="${k}"]`).textContent = fmt(layout[k])
    }
    $('[data-seedv]').textContent = +layout.seed ? `#${layout.seed}` : 'gốc'
  }
  const changeLayout = (patch) => {
    layout = { ...layout, ...patch }
    paintLayout()
    setLayout?.(patch)
    markDirty()
  }
  farInputs.forEach((x) => on(x, 'change', () => x.checked && changeLayout({ far: x.value })))
  olInputs.forEach((x) => on(x, 'change', () => x.checked && changeLayout({ overlap: x.value })))
  alInputs.forEach((x) => on(x, 'change', () => x.checked && changeLayout({ align: x.value })))
  bfInputs.forEach((x) => on(x, 'change', () => x.checked && changeLayout({ butterfly: x.value })))
  for (const [k, , , , , fmt] of [...HERO_SLIDERS, ...SLIDERS]) {
    const inp = $(`[data-l="${k}"]`)
    on(inp, 'input', () => ($(`[data-lv="${k}"]`).textContent = fmt(+inp.value)))
    on(inp, 'change', () => changeLayout({ [k]: +inp.value })) // thả tay mới dựng lại không gian
  }
  on($('[data-shuffle]'), 'click', () => changeLayout({ seed: 1 + Math.floor(Math.random() * 9999) }))
  on($('[data-lreset]'), 'click', () => changeLayout({ ...layoutDefaults }))
  paintLayout()

  // ---------- 02 ảnh ----------
  const grid = $('[data-grid]')
  function renderGrid() {
    $('[data-count]').textContent = `${items.length} ảnh trong không gian`
    grid.innerHTML = items
      .map(
        (it, i) => `<div class="g3a-tile" data-i="${i}">
        <div class="g3a-tile__img"><img src="${esc(shown(it.img))}" alt="" loading="lazy"></div>
        <input class="g3a-tile__name" data-name type="text" maxlength="80" value="${esc(it.name)}" aria-label="Tên ảnh" placeholder="Tên">
        <div class="g3a-tile__meta"><span class="g3a-tile__num">${String(i + 1).padStart(3, '0')}</span>
          <span><button type="button" data-mv="-1" title="Lên">↑</button><button type="button" data-mv="1" title="Xuống">↓</button>
          <button class="g3a-del" type="button" data-del>Xoá</button></span></div></div>`,
      )
      .join('')
    markDirty()
  }
  const commit = () => {
    setItems(items.map((it) => ({ ...it, img: shown(it.img), full: shown(it.full) })))
    renderGrid()
  }
  on(grid, 'change', (e) => {
    if (!e.target.matches('[data-name]')) return
    const i = +e.target.closest('[data-i]').dataset.i
    items[i].name = e.target.value.trim()
    markDirty()
  })
  on(grid, 'click', (e) => {
    const tile = e.target.closest('[data-i]')
    if (!tile) return
    const i = +tile.dataset.i
    const mv = e.target.closest('[data-mv]')
    if (mv) {
      const j = i + +mv.dataset.mv
      if (j < 0 || j >= items.length) return
      ;[items[i], items[j]] = [items[j], items[i]]
      return commit()
    }
    const del = e.target.closest('[data-del]')
    if (!del) return
    if (!del.classList.contains('is-armed')) {
      del.classList.add('is-armed')
      del.textContent = 'Chắc chắn xoá?'
      setTimeout(() => del.isConnected && (del.classList.remove('is-armed'), (del.textContent = 'Xoá')), 3000)
      return
    }
    items.splice(i, 1)
    commit()
  })

  // nén ảnh: bản tem (≤ 720) + ảnh lớn (≤ 1600), WebP (Safari chưa xuất WebP thì JPEG)
  async function encode(bmp, max) {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(bmp, 0, 0, c.width, c.height)
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.84))
    if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88))
    return { blob, ext: blob.type === 'image/webp' ? 'webp' : 'jpg' }
  }
  const queue = $('[data-queue]')
  const note = (t, bad) => {
    const row = document.createElement('div')
    row.textContent = t
    if (bad) row.className = 'is-bad'
    queue.appendChild(row)
    if (!bad) setTimeout(() => row.remove(), 4000)
    return row
  }
  async function addFiles(files) {
    for (const file of files) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        note(`${file.name}: định dạng không hỗ trợ`, true)
        continue
      }
      const row = note(`Đang xử lý ${file.name}…`)
      try {
        const bmp = await createImageBitmap(file)
        const [m, f] = [await encode(bmp, SIZES.img), await encode(bmp, SIZES.full)]
        bmp.close?.()
        const base = `assets/img/cms/gallery/g3-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
        const img = `${base}-m.${m.ext}`
        const full = `${base}-full.${f.ext}`
        pending.set(img, { blob: m.blob, url: URL.createObjectURL(m.blob) })
        pending.set(full, { blob: f.blob, url: URL.createObjectURL(f.blob) })
        items.push({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 80), img, full })
        row.textContent = `Đã thêm ${file.name} (chưa lưu)`
      } catch {
        row.remove()
        note(`${file.name}: không xử lý được`, true)
      }
    }
    commit()
  }
  const fileInput = $('[data-file]')
  const drop = $('[data-drop]')
  on(fileInput, 'change', () => {
    addFiles([...fileInput.files])
    fileInput.value = ''
  })
  on(drop, 'dragover', (e) => {
    e.preventDefault()
    drop.classList.add('is-over')
  })
  on(drop, 'dragleave', () => drop.classList.remove('is-over'))
  on(drop, 'drop', (e) => {
    e.preventDefault()
    drop.classList.remove('is-over')
    addFiles([...e.dataTransfer.files])
  })
  renderGrid()

  // ---------- lưu ----------
  const ITEMS_RE = /(<script\b[^>]*data-g3-items[^>]*>)([\s\S]*?)(<\/script>)/
  function pageText(html) {
    if (!ITEMS_RE.test(html)) throw new Error('không thấy danh sách ảnh (data-g3-items) trong gallery.html')
    const json = `[\n${items.map((it) => `        ${JSON.stringify({ name: it.name || '', img: it.img, full: it.full || it.img })}`).join(',\n')}\n      ]`
    html = html.replace(ITEMS_RE, (_, a, __, c) => `${a}\n      ${json}\n      ${c}`)
    return html.replace(G3_TAG, (tag) => g3Tag(tag, anim, layout))
  }
  async function imageFiles() {
    const used = new Set(items.flatMap((it) => [it.img, it.full]))
    const out = []
    for (const [path, p] of pending) {
      if (!used.has(path)) continue
      const buf = new Uint8Array(await p.blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      out.push({ path, base64: btoa(bin) })
    }
    return out
  }
  function ghConfig() {
    let cfg = {}
    try {
      cfg = JSON.parse(localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY) || '{}')
    } catch {}
    return { repo: cfg.repo || 'kaixapham/chande-www', branch: cfg.branch || 'main', token: cfg.token || '' }
  }
  async function save() {
    const b = $('[data-save]')
    b.disabled = true
    msg('Đang lưu…')
    try {
      const ping = await fetch('__cms/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const imgs = await imageFiles()
      let done
      if (ping?.local) {
        const html = await fetch(`${PAGE}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
        const r = await fetch('__cms/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files: [...imgs, { path: PAGE, text: pageText(html) }] }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        done = `Đã ghi${imgs.length ? ` ${imgs.length} ảnh +` : ''} gallery.html xuống máy — commit + push để lên live.`
      } else {
        const cfg = ghConfig()
        if (!cfg.token) {
          $('[data-gh]').hidden = false
          $('[data-gh] [name=repo]').value = cfg.repo
          msg('Trên site cần token GitHub để lưu thẳng vào repo — nhập bên dưới.')
          return
        }
        const gh = (path, opts = {}) =>
          fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
            ...opts,
            headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
          }).then(async (r) => {
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`)
            return j
          })
        const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
        const enc = (text) => {
          const bytes = new TextEncoder().encode(text)
          let s = ''
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          return btoa(s)
        }
        for (const f of imgs) await gh(`/contents/${f.path}`, { method: 'PUT', body: JSON.stringify({ message: `Gallery: ảnh ${f.path.split('/').pop()}`, content: f.base64, branch: cfg.branch }) })
        const cur = await gh(`/contents/${PAGE}?ref=${encodeURIComponent(cfg.branch)}`)
        const res = await gh(`/contents/${PAGE}`, { method: 'PUT', body: JSON.stringify({ message: 'Gallery: cập nhật ảnh / animation', content: enc(pageText(dec(cur.content))), sha: cur.sha, branch: cfg.branch }) })
        done = `Đã commit ${res.commit.sha.slice(0, 7)} lên ${cfg.repo} — site cập nhật sau ~1 phút.`
      }
      savedItems = JSON.stringify(items)
      savedAnim = JSON.stringify(anim)
      savedLayout = JSON.stringify(layout)
      markDirty()
      msg(done)
    } catch (e) {
      msg(String(e.message || e), true)
      if (/GitHub 40[13]/.test(String(e.message))) $('[data-gh]').hidden = false
    } finally {
      b.disabled = false
    }
  }
  on($('[data-save]'), 'click', save)
  on($('[data-gh]'), 'submit', (e) => {
    e.preventDefault()
    const f = e.target
    const v = JSON.stringify({ repo: f.repo.value.trim(), branch: 'main', token: f.token.value.trim(), remember: f.remember.checked })
    try {
      sessionStorage.setItem(GH_KEY, v)
      if (f.remember.checked) localStorage.setItem(GH_KEY, v)
    } catch {}
    f.hidden = true
    save()
  })
  on(window, 'beforeunload', (e) => dirty() && e.preventDefault())

  return {
    destroy() {
      ac.abort()
      btn.remove()
      drawer.remove()
      for (const p of pending.values()) URL.revokeObjectURL(p.url)
    },
  }
}
