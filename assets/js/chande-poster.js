/**
 * Section 7 · Poster — chồng poster thả từng tờ theo scroll.
 *
 * Hiệu ứng KHÔNG nằm ở đây: `paper-stack.js` là bản chép nguyên văn runtime của tool
 * paper-stack (~/Projects/paper-stack, port 3117), chỉ khác dòng import three. Chỉnh
 * hiệu ứng ở tool rồi chép số vào CONFIG.params dưới đây; đổi logic thì sửa
 * src/runtime.js của tool và chạy lại scripts/export-runtime.mjs.
 *
 * File này chỉ làm bốn việc:
 *   - đọc danh sách tờ trong <script data-poster-sheets> (CMS sửa được, key `poster-stack`);
 *   - kéo section dài ra đủ cho số tờ, khối trong dính dưới header, mount driver 'page'
 *     (head đi theo vị trí cuộn trang — Lenis cuộn window thật nên đọc được);
 *   - gỡ / dựng lại khi Barba đổi trang;
 *   - tờ cuối đáp xong thì nền chuyển dần sang `doneBg` (cuộn ngược lên thì về
 *     nền kem), rồi OUTRO của tool chạy: các vòng màu nở từ mép trên phủ kín màn.
 *     Khung vẽ lấy đúng tỉ lệ khối dính (ratio 'custom') nên outro phủ full màn.
 *
 * LƯU Ý api.applyParams(patch): runtime ghép patch vào RUNTIME_DEFAULTS chứ không
 * vào thông số đang chạy — gửi thiếu là mọi khoá khác bị reset (đã dính: đổi màu
 * nền làm outro / khung / stack về mặc định). Luôn gửi đủ qua params() bên dưới.
 *
 * Không có WebGL hoặc danh sách rỗng thì section giữ nguyên ảnh tĩnh `poster.webp`.
 */
import { mount as mountStack } from './paper-stack.js'

const CONFIG = {
  /** Quãng cuộn (vh) cho mỗi tờ đáp. Tờ đầu nằm sẵn nên n tờ = n − 1 quãng. */
  perSheet: 90,
  /** Nền khi mọi tờ đã đáp xong (null = giữ nền kem) và thời gian chuyển (ms). */
  doneBg: '#0f1513',
  doneFade: 600,
  /** Đè lên RUNTIME_DEFAULTS của paper-stack — chỉ ghi khoá khác mặc định. */
  params: {
    // ratio 'custom' + cw/ch do fit() điền theo cỡ khối dính -> canvas phủ kín
    frame: { ratio: 'custom', cw: 16, ch: 9, bg: '#fffef8', margin: 0.06 },
    stack: { size: 0.84 },
    // Lenis đã làm mượt scroll trang. Để runtime trễ thêm một tầng nữa thì tờ giấy
    // đi sau ngón tay hai nhịp — mượt hai lần là ì.
    motion: { damping: 0 },
    // Outro (vòng màu phủ màn sau tờ cuối): dùng nguyên mặc định của tool —
    // màu, tâm, nhịp. Tắt: { on: false }.
    outro: { on: true },
  },
}

let live = null

function hasWebGL() {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
}

function readSheets(section) {
  let list = []
  try {
    list = JSON.parse(section.querySelector('[data-poster-sheets]')?.textContent || '[]')
  } catch {}
  // CMS lưu ảnh ở khoá `img`; runtime gọi là `src`. Vị trí (x, y, rot, scale, from)
  // copy từ tool paper-stack — thiếu thì runtime tự rải.
  return list
    .filter((s) => s && s.img)
    .map(({ img, x, y, rot, scale, from }) => ({ src: img, x, y, rot, scale, from }))
}

// Bộ thông số ĐẦY ĐỦ để gửi runtime (xem lưu ý applyParams ở đầu file).
function params(pin, bg) {
  const p = structuredClone(CONFIG.params)
  if (pin && pin.clientWidth > 1 && pin.clientHeight > 1) {
    p.frame.cw = pin.clientWidth
    p.frame.ch = pin.clientHeight
  }
  if (bg) p.frame.bg = bg
  return p
}

function mount(scope = document) {
  const section = scope.querySelector('[data-poster-stack]')
  if (!section || live?.section === section) return
  const sheets = readSheets(section)
  if (!sheets.length || !hasWebGL()) return
  const pin = section.querySelector('[data-poster-pin]')
  // Chỉ giữ một bản: về lại trang chủ khi bản cũ còn đó thì gỡ nó trước, không thì
  // afterLeave không còn trỏ tới nó nữa → rò WebGL context.
  destroy()

  // tờ đầu nằm sẵn: n tờ = n − 1 quãng; outro thêm một quãng
  const steps = Math.max(0, sheets.length - 1) + (CONFIG.params.outro?.on ? 1 : 0)
  section.style.setProperty('--poster-scroll', `${steps * CONFIG.perSheet}vh`)

  const api = mountStack(pin, { driver: 'page', params: params(pin), sheets })
  const me = { section, api, pin, bgNow: null }
  me.bg = watchDone(me)
  // khung theo đúng cỡ khối dính (đổi khi is-live bật, khi đổi cỡ cửa sổ)
  let fitKey = ''
  me.fit = () => {
    const key = `${pin.clientWidth}x${pin.clientHeight}`
    if (key === fitKey || pin.clientWidth < 2 || pin.clientHeight < 2) return
    fitKey = key
    api.applyParams(params(pin, me.bgNow))
    api.renderOnce()
  }
  me.ro = new ResizeObserver(() => me.fit())
  me.ro.observe(pin)
  live = me
  // Chỉ đổi sang bản chạy khi ảnh đã nạp xong — trước đó vẫn là ảnh tĩnh, không nháy trắng.
  api.ready
    .then(() => {
      if (live !== me) return
      section.classList.add('is-live')
      requestAnimationFrame(() => me.fit()) // khối dính vừa đổi cỡ (100svh − header)
    })
    .catch(() => {
      if (live === me) destroy()
    })
}

// Nền tối khi tờ cuối đã đáp. Mỗi khung chỉ so head với maxHead; đổi màu bằng
// applyParams + renderOnce (runtime không tự vẽ lại khi đứng yên).
const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
function watchDone(me) {
  const { section, api, pin } = me
  if (!CONFIG.doneBg) return null
  const from = rgb(CONFIG.params.frame.bg)
  const to = rgb(CONFIG.doneBg)
  let mix = 0 // 0 = kem, 1 = tối
  let want = 0
  let last = 0
  let raf = 0
  const paint = () => {
    const c = hex(from.map((v, i) => v + (to[i] - v) * mix))
    me.bgNow = c
    api.applyParams(params(pin, c))
    api.renderOnce()
    section.style.backgroundColor = c
    section.classList.toggle('is-dark', mix > 0.5)
  }
  const step = (t) => {
    raf = 0
    const dt = last ? t - last : 16
    last = t
    const d = dt / Math.max(1, CONFIG.doneFade)
    mix = want ? Math.min(1, mix + d) : Math.max(0, mix - d)
    paint()
    if (mix !== want) raf = requestAnimationFrame(step)
    else last = 0
  }
  const check = () => {
    // Theo VỊ TRÍ CUỘN, cùng công thức driver 'page' của runtime (không đọc head:
    // head có lò xo, dao động qua lại ngưỡng). head = 1 + (max − 1) × tiến độ; tờ
    // cuối đáp khi head = số tờ -> tiến độ = (n − 1) / (max − 1). Có outro thì đó
    // là trước quãng outro; không có thì là hết quãng.
    const sb = section.getBoundingClientRect()
    const span = Math.max(1, sb.height - pin.offsetHeight)
    const top = parseFloat(getComputedStyle(pin).top) || 0
    const n = api.count()
    const at = Math.max(0, (n - 1) / Math.max(1, api.maxHead() - 1))
    const done = (top - sb.top) / span >= Math.min(0.995, at - 0.005) ? 1 : 0
    if (done === want) return
    want = done
    if (!raf) raf = requestAnimationFrame(step)
  }
  // head do runtime cập nhật theo cuộn; đọc ở khung kế để chắc đã cập nhật
  const onScroll = () => requestAnimationFrame(check)
  addEventListener('scroll', onScroll, { passive: true })
  api.ready.then(check).catch(() => {})
  return {
    dispose() {
      removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      section.style.removeProperty('background-color')
      section.classList.remove('is-dark')
    },
  }
}

function destroy() {
  if (!live) return
  live.ro?.disconnect()
  live.bg?.dispose()
  live.api.dispose()
  live.section.classList.remove('is-live')
  live.section.style.removeProperty('--poster-scroll')
  live = null
}

mount(document)

if (window.barba?.hooks) {
  // Cùng nhịp với hero: dựng ở beforeEnter; `sync: true` nên afterLeave tới SAU
  // beforeEnter — chỉ gỡ khi section thuộc container cũ.
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (live && data.current.container?.contains(live.section)) destroy()
  })
}

window.CHANDE_POSTER = {
  config: CONFIG,
  mount,
  destroy,
  get api() {
    return live?.api || null
  },
}
