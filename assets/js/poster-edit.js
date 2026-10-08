/* =============================================================================
 * Poster Editor (poster-edit.html) — chỉnh kỹ section Poster (chồng giấy rơi)
 * -----------------------------------------------------------------------------
 * Chạy ĐÚNG runtime của site (paper-stack.js) ở chế độ edit:
 *   • khung xem cùng tỉ lệ khối dính trên site (màn − menu), chọn cỡ màn;
 *   • thanh tua = cuộn trang (head), ‹ › nhảy từng tờ, ▶ chạy từ đầu tới hết outro;
 *   • kéo tờ trên khung để dời, Shift + kéo để xoay; bảng tờ chỉnh x / y / xoay /
 *     cỡ / hướng bay;
 *   • mọi nhóm thông số của runtime (giấy, bay vào, cong, vật lý, ánh sáng, camera,
 *     outro…) + quãng cuộn mỗi tờ.
 *
 * Lưu:
 *   • thông số khác mặc định trong code -> chande-settings.js, khoá "poster.params.
 *     <nhóm>.<khoá>" / "poster.perSheet" (chande-poster.js đọc qua SETTINGS_APPLY);
 *   • vị trí tờ -> JSON <script data-poster-sheets> trong index.html (giữ ảnh / tên);
 *   • local (node serve.mjs): ghi thẳng file; GitHub Pages: commit bằng token chung
 *     với CMS ('chande-cms-gh').
 * ========================================================================== */
import { mount, RUNTIME_DEFAULTS } from './paper-stack.js'
import './chande-poster.js' // chỉ để lấy CONFIG (code + đã lưu); trang này không có section poster

const $ = (s, r = document) => r.querySelector(s)
const clone = (v) => structuredClone(v)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
function deepMerge(base, over) {
  const out = clone(base)
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : clone(v)
  return out
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

const P = window.CHANDE_POSTER
const SETTINGS_FILE = 'assets/js/chande-settings.js'
const HIDDEN = new Set(['frame.ratio', 'frame.cw', 'frame.ch']) // khung do site tự đo

/* ---------------------------------------------------------------- lược đồ -- */
const EASE = ['linear', 'sine', 'power2', 'power3', 'power4', 'expo', 'circ', 'back']
const EASE_MODE = [['in', 'Vào (in)'], ['out', 'Ra (out)'], ['inOut', 'Vào + ra'], ['hold', 'Giữ (nhảy)']]
const GROUPS = {
  site: ['Cuộn trang', { perSheet: ['Quãng cuộn mỗi tờ (vh)', 30, 250, 1] }],
  frame: ['Khung', { bgImage: ['Ảnh nền', 'image'], bg: ['Màu nền (dưới ảnh)', 'color'], margin: ['Lề khung', 0, 0.3, 0.005] }],
  stack: ['Chồng giấy', {
    size: ['Cỡ tờ', 0.2, 1.5, 0.01], thickness: ['Độ dày mỗi lớp', 0, 0.03, 0.0005],
    scatter: ['Độ rải lệch', 0, 1, 0.01], startLaid: ['Tờ đầu nằm sẵn', 'bool'],
  }],
  entry: ['Bay vào', {
    from: ['Hướng bay tới (độ)', -180, 180, 1], travel: ['Quãng bay', 0, 3, 0.01], lift: ['Độ nhấc cao', 0, 2, 0.01],
    tilt: ['Chúi mũi (độ)', -90, 90, 1], spin: ['Xoay khi bay (độ)', -45, 45, 0.5], air: ['Phần thời gian bay', 0.02, 0.95, 0.01],
    flySpeed: ['Tốc độ bay', 0.2, 3, 0.05], fade: ['Hiện dần', 0, 1, 0.01],
    groupStagger: ['Lệch giữa ảnh cùng lượt', 0, 0.5, 0.01],
  }],
  curl: ['Cong giấy', {
    bend: ['Độ cong (độ)', 0, 180, 1], twist: ['Vặn', -1, 1, 0.01], cross: ['Cong ngang', 0, 1, 0.01],
    flutter: ['Rung phất', 0, 2, 0.01], flutterFreq: ['Tần số rung', 0, 20, 0.1],
  }],
  physics: ['Vật lý khi đáp', {
    push: ['Lực đè', 0, 3, 0.01], decay: ['Lan xuống lớp dưới', 0, 1, 0.01], freq: ['Tần số vỗ', 0, 10, 0.1],
    damping: ['Tắt dần', 0, 1, 0.01], slide: ['Trượt', 0, 2, 0.01], nudge: ['Xô lệch tờ dưới', 0, 0.6, 0.005],
    yaw: ['Xoay khi bị đè', 0, 2, 0.01], dip: ['Lún', 0, 2, 0.01],
  }],
  motion: ['Nhịp chuyển động', {
    mode: ['Kiểu (con lăn trong khung)', 'select', [['snap', 'Từng nấc'], ['free', 'Tự do']]],
    anim: ['Thời gian một tờ (ms)', 200, 4000, 10], easing: ['Đường cong', 'select', EASE], easeMode: ['Chiều cong', 'select', EASE_MODE],
    sensitivity: ['Độ nhạy', 0, 3, 0.05], damping: ['Độ trễ bám (0 = tức thì)', 0, 1000, 5], glide: ['Trôi (ms)', 0, 2000, 10],
    queue: ['Xếp hàng lượt', 0, 3, 1],
  }],
  force: ['Lực cuộn', {
    on: ['Bật', 'bool'], ref: ['Mốc lực 1×', 20, 400, 1], min: ['Lực tối thiểu', 0, 2, 0.05], max: ['Lực tối đa', 1, 5, 0.05],
    latch: ['Chốt lực (ms)', 0, 400, 5], speed: ['→ tốc độ', 0, 2, 0.05], travel: ['→ quãng bay', 0, 2, 0.05],
    lift: ['→ độ nhấc', 0, 2, 0.05], spin: ['→ xoay', 0, 2, 0.05], push: ['→ lực đè', 0, 2, 0.05], bend: ['→ độ cong', 0, 2, 0.05],
  }],
  camera: ['Camera', { tilt: ['Nghiêng (độ)', 0, 90, 0.5], yaw: ['Xoay ngang (độ)', -180, 180, 1], fov: ['Góc nhìn', 10, 90, 0.5] }],
  light: ['Ánh sáng', {
    key: ['Đèn chính', 0, 4, 0.05], azimuth: ['Hướng đèn (độ)', 0, 360, 1], elevation: ['Độ cao đèn (độ)', 0, 90, 1],
    ambient: ['Sáng nền', 0, 2, 0.05], shadow: ['Độ đậm bóng', 0, 1, 0.01], softness: ['Độ mềm bóng', 0, 10, 0.1], fill: ['Đèn phụ', 0, 2, 0.05],
  }],
  paper: ['Giấy', { roughness: ['Độ nhám', 0, 1, 0.01], back: ['Màu mặt sau', 'color'], segments: ['Độ mịn lưới', 8, 96, 1] }],
  outro: ['Vòng màu cuối (outro)', {
    on: ['Bật', 'bool'], colors: ['Các lớp màu', 'colors'], originX: ['Tâm X', 0, 1, 0.01], originY: ['Tâm Y (0 = đáy)', 0, 1, 0.01],
    stagger: ['Trễ giữa các lớp', 0, 0.3, 0.005], hold: ['Giữ cuối', 0, 0.6, 0.01], scale: ['Nở to', 0.5, 2, 0.01],
    dur: ['Thời gian (ms)', 200, 6000, 10], lead: ['Đệm (ms)', 0, 2000, 10], easing: ['Đường cong', 'select', EASE], easeMode: ['Chiều cong', 'select', EASE_MODE],
  }],
}

/* ------------------------------------------------------------------ trạng thái */
const code = { params: deepMerge(RUNTIME_DEFAULTS, P.defaults.params), perSheet: P.defaults.perSheet }
const saved = { params: deepMerge(RUNTIME_DEFAULTS, P.config.params), perSheet: P.config.perSheet }
let cur = clone(saved)
let sheetsSaved = []
let sheets = []
let api = null
let selected = -1
let cw = 1920
let ch = 1000

// Ảnh mới chưa lưu: đường dẫn sẽ ghi -> blob (để lưu) + objectURL (để xem trước)
const pending = new Map() // path -> { blob, url }
const shown = (src) => pending.get(src)?.url || src
const IMG_W = 900 // bề rộng hiển thị (như data-cms-w của danh sách) -> nén về 2×
async function processImage(file, w = IMG_W) {
  if (file.type === 'image/svg+xml') return { blob: file, ext: 'svg' }
  const bmp = await createImageBitmap(file)
  const width = Math.min(bmp.width, w * 2)
  const height = Math.round((bmp.height * width) / bmp.width)
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, width, height)
  const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.86))
  return { blob, ext: 'webp' }
}
async function useImage(i, file) {
  if (!file?.type?.startsWith('image/')) return
  msg('Đang nén ảnh…')
  const img = await processImage(file)
  const path = `assets/img/cms/index/poster-stack-${i + 1}-${Date.now().toString(36)}.${img.ext}`
  pending.set(path, { blob: img.blob, url: URL.createObjectURL(img.blob) })
  sheets[i].img = path
  await resetSheets()
  build()
  markDirty()
  msg(`Đã thay ảnh tờ ${i + 1} (chưa lưu).`)
}
async function useBg(file) {
  if (!file?.type?.startsWith('image/')) return
  msg('Đang nén ảnh nền…')
  const img = await processImage(file, 1920)
  const path = `assets/img/cms/index/poster-bg-${Date.now().toString(36)}.${img.ext}`
  pending.set(path, { blob: img.blob, url: URL.createObjectURL(img.blob) })
  cur.params.frame.bgImage = path
  applyLive('frame')
  build()
  markDirty()
  msg('Đã thay ảnh nền (chưa lưu).')
}
const pick = (fn) => {
  const inp = document.createElement('input')
  inp.type = 'file'
  inp.accept = 'image/*'
  inp.onchange = () => inp.files[0] && fn(inp.files[0])
  inp.click()
}
// đổi danh sách tờ (ảnh / thêm / xoá / đổi thứ tự) -> dựng lại tờ trong runtime, giữ nấc
async function resetSheets() {
  if (!api) return
  const head = api.getHead()
  await api.setSheets(sheets.map(toRuntime))
  $('[data-head]').max = api.maxHead()
  api.setHead(Math.min(head, api.maxHead()), true)
  syncHead(api.getHead())
}

const msg = (t, kind = '') => {
  const el = $('[data-msg]')
  el.textContent = t
  el.className = `side__msg${kind ? ` is-${kind}` : ''}`
}

/* -------------------------------------------------------------- danh sách tờ - */
const SHEETS_RE = /(<script\b[^>]*data-poster-sheets[^>]*>)([\s\S]*?)(<\/script>)/
async function loadSheets() {
  const html = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
  const m = html.match(SHEETS_RE)
  const list = m ? JSON.parse(m[2]) : []
  return list.filter((s) => s && s.img)
}
const toRuntime = (s) => ({ src: shown(s.img), x: s.x ?? 0, y: s.y ?? 0, rot: s.rot ?? 0, scale: s.scale ?? 1, from: s.from ?? null, together: !!s.together })
// nấc rơi của từng tờ (tờ "cùng lượt" đi chung nấc với tờ trước)
function turnOf(i) {
  let t = -1
  for (let k = 0; k <= i; k++) if (k === 0 || !sheets[k].together) t++
  return t
}

/* ------------------------------------------------------------------ runtime -- */
function fullParams() {
  const p = clone(cur.params)
  p.frame = { ...p.frame, ratio: 'custom', cw, ch, bgImage: shown(p.frame.bgImage || '') }
  return p
}
function sizeFrame() {
  const view = $('.stage__view')
  const vw = view.clientWidth - 40
  const vh = view.clientHeight - 40
  const k = Math.min(vw / cw, vh / ch)
  const f = $('[data-frame]')
  f.style.width = `${Math.floor(cw * k)}px`
  f.style.height = `${Math.floor(ch * k)}px`
  $('[data-hint]').textContent = `${cw} × ${ch}`
}
function pickAspect() {
  const v = $('[data-aspect]').value
  const custom = v === 'custom'
  $('[data-cw]').hidden = $('[data-ch]').hidden = !custom
  if (v === 'screen') {
    const bar = 80 * Math.min(1, innerWidth / 1920) // menu ~5rem
    cw = screen.width
    ch = Math.round(screen.height - bar - 90) // trừ thanh trình duyệt ~90
  } else if (custom) {
    cw = +$('[data-cw]').value || 1920
    ch = +$('[data-ch]').value || 1000
  } else [cw, ch] = v.split('x').map(Number)
  sizeFrame()
  api?.applyParams(fullParams())
}

function remount() {
  const head = api?.getHead() ?? 1
  api?.dispose()
  api = mount($('[data-frame]'), {
    params: fullParams(),
    sheets: sheets.map(toRuntime),
    edit: true,
    driver: 'wheel',
    selected,
    onHead: (h) => syncHead(h),
    onSelect: (i) => select(i),
    onMoveSheet: (i, patch) => {
      Object.assign(sheets[i], patch)
      api.updateSheet(i, patch)
      fillSheet(i)
      markDirty()
    },
  })
  api.ready.then(() => {
    $('[data-head]').max = api.maxHead()
    api.setHead(Math.min(head, api.maxHead()), true)
    syncHead(api.getHead())
  })
}
function syncHead(h) {
  $('[data-head]').value = h
  $('[data-head-out]').textContent = `${h.toFixed(2)} / ${api ? api.maxHead() : 0}`
}

/* --------------------------------------------------------------------- bảng -- */
const fmt = (v, step) => (typeof v === 'number' ? +v.toFixed(Math.max(0, (String(step).split('.')[1] || '').length)) : v)
function getVal(g, k) {
  return g === 'site' ? cur[k] : cur.params[g]?.[k]
}
function setVal(g, k, v) {
  if (g === 'site') cur[k] = v
  else cur.params[g][k] = v
}
function savedVal(g, k) {
  return g === 'site' ? saved[k] : saved.params[g]?.[k]
}

function control(g, k, spec) {
  const [label, a, b, step] = spec
  const v = getVal(g, k)
  const id = `f-${g}-${k}`
  let input = ''
  if (a === 'image')
    return `<div class="row row--wide"><label data-l="${g}.${k}">${label}</label><div class="imgfield"><div class="sheet__ph" data-pick-bg="${g}.${k}" title="Bấm hoặc thả ảnh để thay" style="width:100%; height:54px; background-image:${v ? `url('${shown(v)}')` : 'none'}"><em>${v ? 'Thay ảnh' : 'Chọn ảnh'}</em></div>${v ? `<button class="btn" type="button" data-clear-bg="${g}.${k}" title="Bỏ ảnh nền (chỉ còn màu)">✕</button>` : ''}</div></div>`
  if (a === 'bool') input = `<input type="checkbox" id="${id}" ${v ? 'checked' : ''}>`
  else if (a === 'color') input = `<input type="color" id="${id}" value="${v}">`
  else if (a === 'select')
    input = `<select id="${id}">${b.map((o) => {
      const [val, txt] = Array.isArray(o) ? o : [o, o]
      return `<option value="${val}" ${val === v ? 'selected' : ''}>${txt}</option>`
    }).join('')}</select>`
  else if (a === 'colors')
    return `<div class="row row--wide"><label data-l="${g}.${k}">${label}</label><div class="colors" data-colors="${g}.${k}">${v
      .map((c, i) => `<input type="color" value="${c}" data-ci="${i}">`).join('')}<button class="btn" type="button" data-cadd>+</button><button class="btn" type="button" data-cdel>−</button></div></div>`
  else
    return `<div class="row"><label data-l="${g}.${k}" for="${id}">${label}</label><input type="range" id="${id}" min="${a}" max="${b}" step="${step}" value="${v}" data-g="${g}" data-k="${k}"><input type="number" min="${a}" max="${b}" step="${step}" value="${fmt(v, step)}" data-g="${g}" data-k="${k}" data-num></div>`
  return `<div class="row row--wide"><label data-l="${g}.${k}" for="${id}">${label}</label><div data-g="${g}" data-k="${k}">${input}</div></div>`
}

function sheetRow(s, i) {
  const f = (k, step) => `<label>${k}<input type="number" step="${step}" value="${s[k] ?? ''}" data-si="${i}" data-sk="${k}" ${k === 'from' ? 'placeholder="mặc định"' : ''}></label>`
  return `<div class="sheet${i === selected ? ' is-sel' : ''}" data-sheet="${i}">
    <div class="sheet__ph" data-pick="${i}" title="Bấm hoặc thả ảnh vào để thay" style="background-image:url('${shown(s.img)}')"><em>Thay ảnh</em></div>
    <div class="sheet__fields">
      <div class="sheet__name"><span>${i + 1}. ${s.name || ''} · ${turnOf(i) === 0 && cur.params.stack.startLaid ? 'nằm sẵn' : `lượt ${turnOf(i) + 1}`}</span><span class="sheet__ops"><button type="button" data-addwith="${i}" title="Thêm ảnh rơi cùng lượt, ngay sau tờ này" style="width:auto; padding:0 5px">+ ảnh cùng lượt</button><button type="button" data-mv="-1" data-i="${i}" title="Lên">↑</button><button type="button" data-mv="1" data-i="${i}" title="Xuống">↓</button><button type="button" data-del="${i}" title="Xoá tờ này">✕</button></span></div>
      ${f('x', 0.005)}${f('y', 0.005)}${f('rot', 0.5)}${f('scale', 0.01)}${f('from', 1)}
      ${i > 0 ? `<label class="sheet__with"><input type="checkbox" data-together="${i}" ${s.together ? 'checked' : ''}> cùng lượt với tờ trên</label>` : ''}
    </div>
  </div>`
}

function build() {
  let h = `<details open><summary>Các tờ (${sheets.length})</summary><div class="sheets" data-sheets>${sheets.map(sheetRow).join('')}<button class="btn" type="button" data-add>+ Thêm tờ (chọn ảnh)</button></div>
    <div style="padding:0 12px 12px; color:var(--dim); font-size:12px">x / y: vị trí theo phần khung (−0.5 … 0.5) · rot: độ · scale: cỡ · from: hướng bay tới (trống = theo "Bay vào"). Bấm / thả ảnh vào ô ảnh để thay; tờ trên rơi trước.</div></details>`
  for (const [g, [title, fields]] of Object.entries(GROUPS)) {
    const rows = Object.entries(fields)
      .filter(([k]) => !HIDDEN.has(`${g}.${k}`))
      .map(([k, spec]) => control(g, k, spec)).join('')
    h += `<details ${g === 'site' || g === 'entry' ? 'open' : ''}><summary>${title}</summary><div class="grp">${rows}</div></details>`
  }
  $('[data-body]').innerHTML = h
  markDirty()
}
function fillSheet(i) {
  document.querySelectorAll(`[data-si="${i}"]`).forEach((inp) => {
    const v = sheets[i][inp.dataset.sk]
    if (document.activeElement !== inp) inp.value = v ?? ''
  })
}
function select(i) {
  selected = i
  api?.setSelected(i)
  document.querySelectorAll('[data-sheet]').forEach((el) => el.classList.toggle('is-sel', +el.dataset.sheet === i))
  if (i >= 0) document.querySelector(`[data-sheet="${i}"]`)?.scrollIntoView({ block: 'nearest' })
}

function markDirty() {
  document.querySelectorAll('[data-l]').forEach((l) => {
    const [g, k] = l.dataset.l.split('.')
    l.classList.toggle('is-changed', !same(getVal(g, k), savedVal(g, k)))
  })
  const dirty = !same(cur, saved) || !same(sheets, sheetsSaved)
  $('[data-save]').textContent = dirty ? 'Lưu •' : 'Lưu'
}

// áp một thay đổi thông số vào runtime (site.perSheet không ảnh hưởng xem trước)
function applyLive(g) {
  if (g === 'site') return
  api?.applyParams(fullParams())
  // đổi startLaid / outro.on làm đổi số nấc
  if (api) {
    $('[data-head]').max = api.maxHead()
    syncHead(api.getHead())
  }
}

document.addEventListener('input', (e) => {
  const t = e.target
  if (t.dataset.together != null) {
    const i = +t.dataset.together
    if (t.checked) sheets[i].together = true
    else delete sheets[i].together
    resetSheets().then(() => build())
    return markDirty()
  }
  if (t.dataset.si != null) {
    const i = +t.dataset.si
    const k = t.dataset.sk
    const v = t.value === '' ? (k === 'from' ? null : 0) : +t.value
    if (k === 'from' && v === null) delete sheets[i].from
    else sheets[i][k] = v
    api?.updateSheet(i, { [k]: v })
    return markDirty()
  }
  if (t.dataset.ci != null) {
    const [g, k] = t.closest('[data-colors]').dataset.colors.split('.')
    const arr = [...getVal(g, k)]
    arr[+t.dataset.ci] = t.value
    setVal(g, k, arr)
    applyLive(g)
    return markDirty()
  }
  const holder = t.dataset.g ? t : t.closest('[data-g]')
  if (!holder) return
  const { g, k } = holder.dataset
  let v
  if (t.type === 'checkbox') v = t.checked
  else if (t.type === 'range' || t.type === 'number') v = +t.value
  else v = t.value
  setVal(g, k, v)
  // đồng bộ cặp thanh trượt / ô số
  document.querySelectorAll(`[data-g="${g}"][data-k="${k}"]`).forEach((o) => {
    if (o !== t && (o.type === 'range' || o.type === 'number')) o.value = o.type === 'number' ? fmt(v, o.step) : v
  })
  applyLive(g)
  markDirty()
})
document.addEventListener('change', (e) => {
  if (e.target.matches('select, input[type=checkbox], input[type=color]')) e.target.dispatchEvent(new Event('input', { bubbles: true }))
})
document.addEventListener('click', async (e) => {
  const ph = e.target.closest('[data-pick]')
  if (ph) return pick((f) => useImage(+ph.dataset.pick, f))
  const bgp = e.target.closest('[data-pick-bg]')
  if (bgp) return pick((f) => useBg(f))
  if (e.target.closest('[data-clear-bg]')) {
    cur.params.frame.bgImage = ''
    applyLive('frame')
    build()
    return markDirty()
  }
  const mv = e.target.closest('[data-mv]')
  if (mv) {
    const i = +mv.dataset.i
    const j = i + +mv.dataset.mv
    if (j < 0 || j >= sheets.length) return
    ;[sheets[i], sheets[j]] = [sheets[j], sheets[i]]
    selected = j
    await resetSheets()
    build()
    return markDirty()
  }
  const del = e.target.closest('[data-del]')
  if (del) {
    if (sheets.length <= 1) return msg('Cần ít nhất 1 tờ.', 'bad')
    sheets.splice(+del.dataset.del, 1)
    selected = -1
    await resetSheets()
    build()
    return markDirty()
  }
  const aw = e.target.closest('[data-addwith]')
  if (aw)
    return pick(async (f) => {
      const at = +aw.dataset.addwith + 1
      sheets.splice(at, 0, { num: String(at + 1).padStart(2, '0'), name: `Poster ${at + 1}`, img: '', x: 0, y: 0, rot: 0, together: true })
      await useImage(at, f)
      select(at)
    })
  if (e.target.closest('[data-add]'))
    return pick(async (f) => {
      const n = sheets.length
      sheets.push({ num: String(n + 1).padStart(2, '0'), name: `Poster ${n + 1}`, img: '', x: 0, y: 0, rot: 0 })
      await useImage(n, f)
      select(n)
    })
  const row = e.target.closest('[data-sheet]')
  if (row && !e.target.matches('input')) select(+row.dataset.sheet)
  const cbox = e.target.closest('[data-colors]')
  if (cbox && e.target.matches('[data-cadd],[data-cdel]')) {
    const [g, k] = cbox.dataset.colors.split('.')
    const arr = [...getVal(g, k)]
    if (e.target.matches('[data-cadd]')) arr.push(arr.at(-1) || '#ffffff')
    else if (arr.length > 1) arr.pop()
    setVal(g, k, arr)
    applyLive(g)
    build()
  }
})

document.addEventListener('dragover', (e) => {
  if (e.target.closest('[data-pick],[data-pick-bg]')) e.preventDefault()
})
document.addEventListener('drop', (e) => {
  const bgp = e.target.closest('[data-pick-bg]')
  if (bgp) {
    e.preventDefault()
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
    return f && useBg(f)
  }
  const ph = e.target.closest('[data-pick]')
  if (!ph) return
  e.preventDefault()
  const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
  if (f) useImage(+ph.dataset.pick, f)
})

/* --------------------------------------------------------------- tua / chạy - */
$('[data-head]').addEventListener('input', (e) => {
  stopPlay()
  api?.setHead(+e.target.value)
  syncHead(+e.target.value)
})
$('[data-prev]').addEventListener('click', () => (stopPlay(), api?.stepSnap(-1)))
$('[data-next]').addEventListener('click', () => (stopPlay(), api?.stepSnap(1)))
let playRaf = 0
function stopPlay() {
  cancelAnimationFrame(playRaf)
  playRaf = 0
  $('[data-play]').textContent = '▶ Chạy thử'
}
// chạy như cuộn trang đều tay: mỗi nấc ~ perSheet vh ở tốc độ cuộn ~1.6 màn/giây
$('[data-play]').addEventListener('click', () => {
  if (playRaf) return stopPlay()
  if (!api) return
  const start = cur.params.stack.startLaid ? 1 : 0
  const end = api.maxHead()
  const msPer = Math.max(300, (cur.perSheet / 100) * 625)
  api.setHead(start, true)
  const t0 = performance.now()
  $('[data-play]').textContent = '■ Dừng'
  const tick = (now) => {
    const h = Math.min(end, start + (now - t0) / msPer)
    api.setHead(h)
    syncHead(h)
    if (h < end) playRaf = requestAnimationFrame(tick)
    else stopPlay()
  }
  playRaf = requestAnimationFrame(tick)
})

/* -------------------------------------------------------- hoàn tác / mặc định - */
$('[data-reset]').addEventListener('click', () => {
  cur = clone(saved)
  sheets = clone(sheetsSaved)
  pending.clear()
  build()
  remount()
  msg('Đã về bản đang lưu.')
})
$('[data-defaults]').addEventListener('click', () => {
  cur = clone(code)
  build()
  remount()
  msg('Đã về mặc định trong code (vị trí tờ giữ nguyên) — bấm Lưu để áp lên site.')
})

/* --------------------------------------------------------------------- Lưu --- */
function posterSettings() {
  const out = {}
  if (cur.perSheet !== code.perSheet) out['poster.perSheet'] = cur.perSheet
  for (const [g, obj] of Object.entries(cur.params))
    for (const [k, v] of Object.entries(obj)) {
      if (HIDDEN.has(`${g}.${k}`)) continue
      if (!same(v, code.params[g]?.[k])) out[`poster.params.${g}.${k}`] = clone(v)
    }
  return out
}
function settingsValues() {
  const base = Object.fromEntries(Object.entries(window.CHANDE_SETTINGS || {}).filter(([k]) => !k.startsWith('poster.')))
  return Object.fromEntries(Object.entries({ ...base, ...posterSettings() }).sort(([a], [b]) => a.localeCompare(b)))
}
function settingsText(values, src) {
  const body = Object.keys(values).length
    ? `{\n${Object.entries(values).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`
    : '{}'
  const re = /window\.CHANDE_SETTINGS = (\{\}|\{\n[\s\S]*?\n\})\n/
  if (!re.test(src)) throw new Error('Không nhận ra cấu trúc chande-settings.js')
  return src.replace(re, () => `window.CHANDE_SETTINGS = ${body}\n`)
}
function indexText(html) {
  if (!SHEETS_RE.test(html)) throw new Error('Không thấy danh sách tờ trong index.html')
  const json = `[\n${sheets.map((s) => `        ${JSON.stringify(s)}`).join(',\n')}\n      ]`
  return html.replace(SHEETS_RE, (_, a, __, c) => `${a}\n      ${json}\n      ${c}`)
}

// ảnh chờ lưu mà danh sách tờ còn dùng
const usedImages = () => [...pending.keys()].filter((p) => sheets.some((s) => s.img === p) || cur.params.frame.bgImage === p)
async function imageFiles() {
  const out = []
  for (const path of usedImages()) {
    const buf = new Uint8Array(await pending.get(path).blob.arrayBuffer())
    let bin = ''
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
    out.push({ path, base64: btoa(bin) })
  }
  return out
}

const GH_KEY = 'chande-cms-gh'
function ghConfig() {
  let cfg = {}
  try { cfg = JSON.parse(localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY) || '{}') } catch {}
  const guess = location.hostname.endsWith('github.io')
    ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1] || ''}`
    : 'kaixapham/chande-www'
  return { repo: cfg.repo || guess, branch: cfg.branch || 'main', token: cfg.token || '', remember: !!cfg.remember }
}

async function save() {
  const btn = $('[data-save]')
  btn.disabled = true
  msg('Đang lưu…')
  try {
    const values = settingsValues()
    const ping = await fetch('__cms/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    let done
    if (ping?.local) {
      const [sSrc, html] = await Promise.all([
        fetch(`${SETTINGS_FILE}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()),
        fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()),
      ])
      const r = await fetch('__cms/save', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files: [...(await imageFiles()), { path: SETTINGS_FILE, text: settingsText(values, sSrc) }, { path: 'index.html', text: indexText(html) }] }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
      done = `Đã ghi${usedImages().length ? ` ${usedImages().length} ảnh +` : ''} chande-settings.js + index.html xuống máy — commit + push để lên live.`
    } else {
      const cfg = ghConfig()
      if (!cfg.token) {
        $('[data-gh]').hidden = false
        $('[data-gh] [name=repo]').value = cfg.repo
        msg('Trên GitHub Pages cần token GitHub để lưu thẳng vào repo — nhập bên dưới.')
        return
      }
      const api_ = (path, opts = {}) =>
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
      const put = async (path, make, message) => {
        const cur_ = await api_(`/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`)
        const before = dec(cur_.content)
        const text = make(before)
        if (text === before) return null
        const res = await api_(`/contents/${path}`, { method: 'PUT', body: JSON.stringify({ message, content: enc(text), sha: cur_.sha, branch: cfg.branch }) })
        return res.commit.sha.slice(0, 7)
      }
      // ảnh mới trước (index.html trỏ tới chúng), mỗi ảnh một commit tạo file
      for (const f of await imageFiles())
        await api_(`/contents/${f.path}`, { method: 'PUT', body: JSON.stringify({ message: `Poster editor: ảnh ${f.path.split('/').pop()}`, content: f.base64, branch: cfg.branch }) })
      const a = await put(SETTINGS_FILE, (src) => settingsText(values, src), 'Poster editor: lưu thông số')
      const b = await put('index.html', indexText, 'Poster editor: lưu vị trí các tờ')
      done = `Đã commit ${[a, b].filter(Boolean).join(' + ') || '(không có gì đổi)'} lên ${cfg.repo} — GitHub Pages cập nhật sau ~1 phút.`
    }
    usedImages().forEach((p) => pending.delete(p)) // đã thành file thật
    window.CHANDE_SETTINGS = values
    Object.assign(saved, clone(cur))
    sheetsSaved = clone(sheets)
    markDirty()
    msg(done, 'ok')
  } catch (e) {
    msg(String(e.message || e), 'bad')
    if (/GitHub 40[13]/.test(String(e.message))) $('[data-gh]').hidden = false
  } finally {
    btn.disabled = false
  }
}
$('[data-save]').addEventListener('click', save)
$('[data-gh]').addEventListener('submit', (e) => {
  e.preventDefault()
  const f = e.target
  const cfg = { repo: f.repo.value.trim(), branch: 'main', token: f.token.value.trim(), remember: f.remember.checked }
  const v = JSON.stringify(cfg)
  try {
    sessionStorage.setItem(GH_KEY, v)
    if (cfg.remember) localStorage.setItem(GH_KEY, v)
    else localStorage.removeItem(GH_KEY)
  } catch {}
  f.hidden = true
  save()
})
addEventListener('beforeunload', (e) => {
  if (!same(cur, saved) || !same(sheets, sheetsSaved) || usedImages().length) e.preventDefault()
})

/* -------------------------------------------------------------------- khởi động */
$('[data-aspect]').addEventListener('change', () => (pickAspect(), remount()))
$('[data-cw]').addEventListener('change', () => (pickAspect(), remount()))
$('[data-ch]').addEventListener('change', () => (pickAspect(), remount()))
addEventListener('resize', sizeFrame)

try {
  sheetsSaved = await loadSheets()
  sheets = clone(sheetsSaved)
  pickAspect()
  build()
  remount()
  msg(`${sheets.length} tờ · kéo tờ trên khung để dời, Shift + kéo để xoay. Số vàng = khác bản đang lưu.`)
} catch (e) {
  msg(`Không nạp được: ${e.message || e}`, 'bad')
}
