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
 *   - khung vẽ lấy đúng tỉ lệ khối dính (ratio 'custom') để OUTRO của tool (vòng
 *     màu nở phủ màn sau tờ cuối) phủ full màn;
 *   - 2 tag Agenda / Bootcamp nằm "dưới" các vòng: cắt theo hình tròn của vòng TRONG
 *     CÙNG (màu kem), vòng nở tới đâu lộ tới đó (cụm ngày thì không — luôn hiện đủ).
 *
 * LƯU Ý api.applyParams(patch): runtime ghép patch vào RUNTIME_DEFAULTS chứ không
 * vào thông số đang chạy — gửi thiếu là mọi khoá khác bị reset (đã dính: đổi một
 * màu nền làm outro / khung / stack về mặc định). Luôn gửi đủ qua params() bên dưới.
 *
 * Không có WebGL hoặc danh sách rỗng thì section giữ nguyên ảnh tĩnh `poster.webp`.
 *
 * MOBILE (≤ 899px): KHÔNG dựng chồng giấy 3D — các tờ thành ảnh tĩnh đặt theo khung 375 × 748·n
 * (n = data-m-screens của section, 2 hoặc 3 màn): mỗi tờ có mx, my (góc trên trái), mw (bề rộng),
 * mr (độ xoay) — sửa ở poster-edit.html, chế độ Mobile; CSS co theo --s (home.css). mimg = bản ảnh nhẹ
 * cho mobile (scripts/wall-optimize.py tạo, đuôi -m<bề rộng>.webp), chỉ dùng khi khớp ảnh và đủ nét.
 */
import { mount as mountStack, easeCurve, RUNTIME_DEFAULTS } from './paper-stack.js'

const CONFIG = {
  /** Quãng cuộn (vh) cho mỗi tờ đáp (tờ đầu nằm sẵn thì n tờ = n − 1 quãng). */
  perSheet: 90,
  /** Đè lên RUNTIME_DEFAULTS của paper-stack — chỉ ghi khoá khác mặc định. */
  params: {
    // ratio 'custom' + cw/ch do fit() điền theo cỡ khối dính -> canvas phủ kín
    // bgImage: nền đường đồng mức (Figma "BG" — kem + topo 10%), phủ kín khung
    frame: { ratio: 'custom', cw: 16, ch: 9, bg: '#fffef8', margin: 0.06, bgImage: 'assets/img/home/poster-bg.webp' },
    // startLaid false: tờ 1 cũng bay vào khi cuộn (true = tờ đầu nằm sẵn trên bàn)
    stack: { size: 0.84, startLaid: false },
    // Lenis đã làm mượt scroll trang. Để runtime trễ thêm một tầng nữa thì tờ giấy
    // đi sau ngón tay hai nhịp — mượt hai lần là ì.
    motion: { damping: 0 },
    // Outro (vòng màu phủ màn sau tờ cuối): dùng nguyên mặc định của tool —
    // màu, tâm, nhịp. Tắt: { on: false }.
    outro: { on: true },
  },
}

// Thông số đã Lưu từ trang chỉnh riêng (poster-edit.html) nằm trong chande-settings.js
// dạng "poster.params.<nhóm>.<khoá>" / "poster.perSheet". APPLY chỉ ghi vào nhóm ĐÃ
// có -> dựng đủ nhóm của runtime trước (rỗng = giữ mặc định runtime).
for (const g of Object.keys(RUNTIME_DEFAULTS)) CONFIG.params[g] ??= {}
const CODE = structuredClone(CONFIG) // mặc định trong code (trang chỉnh so với bản này)
window.CHANDE_SETTINGS_APPLY?.('poster', CONFIG)

let live = null
const mobileMQ = matchMedia('(max-width: 899px)')

/* ------------------------------------------------------------ bản mobile tĩnh -- */
const stem = (path) => String(path || '').replace(/\.(png|webp|jpe?g)$/i, '')
function mobileSrc(s) {
  const m = /-m(\d+)\.webp$/.exec(s.mimg || '')
  return m && s.mimg.startsWith(`${stem(s.img)}-m`) && +m[1] >= 2.4 * (+s.mw || 0) ? s.mimg : s.img
}
function rawSheets(section) {
  try {
    return JSON.parse(section.querySelector('[data-poster-sheets]')?.textContent || '[]').filter((s) => s && s.img)
  } catch {
    return []
  }
}
function renderMobile(section) {
  if (section._m) return
  const box = document.createElement('div')
  box.className = 'hs-poster__m'
  for (const s of rawSheets(section)) {
    if (!Number.isFinite(+s.mx) || s.mx === null || s.mx === '') continue // chưa dàn cho mobile
    const im = document.createElement('img')
    im.className = 'poster__m'
    im.src = mobileSrc(s)
    im.alt = s.name || ''
    im.loading = 'lazy'
    im.decoding = 'async'
    for (const [k, v] of Object.entries({ mx: s.mx, my: s.my, mw: s.mw || 160, mr: s.mr || 0 })) im.style.setProperty(`--${k}`, +v || 0)
    box.append(im)
  }
  const bg = CONFIG.params.frame?.bgImage
  // đường dẫn tuyệt đối: url() trong biến CSS được hiểu theo file CSS dùng nó (assets/css/), không theo trang
  if (bg) section.style.setProperty('--poster-bg', `url("${new URL(bg, document.baseURI).href}")`)
  section.append(box)
  section._m = box
  section.classList.add('is-m')
}
function clearMobile(section) {
  section._m?.remove()
  section._m = null
  section.classList.remove('is-m')
}

// Có WebGL VÀ chạy bằng GPU thật. Máy không có / bị chặn GPU (và máy chấm điểm như
// PageSpeed) vẽ WebGL bằng phần mềm (SwiftShader, llvmpipe…): chồng poster 3D làm đứng
// trang cả giây -> dùng ảnh poster tĩnh như máy không có WebGL.
let glOK = null
function hasWebGL() {
  if (glOK !== null) return glOK
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info')
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
    glOK = !!gl && !/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    glOK = false
  }
  return glOK
}

function readSheets(section) {
  let list = []
  try {
    list = JSON.parse(section.querySelector('[data-poster-sheets]')?.textContent || '[]')
  } catch {}
  // CMS lưu ảnh ở khoá `img`; runtime gọi là `src`. Vị trí (x, y, rot, scale, from)
  // copy từ tool paper-stack — thiếu thì runtime tự rải.
  // Bỏ khoá không ghi: runtime trộn {...SHEET_DEFAULTS, ...tờ}, một `scale: undefined`
  // đè mất mặc định 1 -> kích thước NaN, tờ biến mất (đã dính ở tờ không ghi scale).
  return list
    .filter((s) => s && s.img)
    .map(({ img, x, y, rot, scale, from, together, cut }) =>
      Object.fromEntries(Object.entries({ src: img, x, y, rot, scale, from, together, cut }).filter(([, v]) => v !== undefined)),
    )
}

// Bộ thông số ĐẦY ĐỦ để gửi runtime (xem lưu ý applyParams ở đầu file).
function params(pin) {
  const p = structuredClone(CONFIG.params)
  if (pin && pin.clientWidth > 1 && pin.clientHeight > 1) {
    p.frame.cw = pin.clientWidth
    p.frame.ch = pin.clientHeight
  }
  return p
}

// Chốt chiều cao cuối cùng của section NGAY từ đầu (is-sized) — để lúc chồng poster
// chuyển sang bản chạy (is-live) trang không bị đẩy đi một đoạn khi người xem đang lướt.
function presize(section, sheets) {
  // mỗi tờ một quãng (tờ đầu nằm sẵn thì bớt một); outro thêm một quãng
  const laid = CONFIG.params.stack?.startLaid ?? RUNTIME_DEFAULTS.stack.startLaid
  // số LƯỢT rơi (tờ "cùng lượt" — together — đi chung nấc với tờ trước), không phải số tờ
  const turns = sheets.filter((t, i) => i === 0 || !t.together).length
  const steps = Math.max(0, turns - (laid ? 1 : 0)) + (CONFIG.params.outro?.on ? 1 : 0)
  section.style.setProperty('--poster-scroll', `${steps * CONFIG.perSheet}vh`)
  section.classList.add('is-sized')
}

function mount(scope = document) {
  const section = scope.querySelector('[data-poster-stack]')
  if (!section) return
  if (mobileMQ.matches) return renderMobile(section)
  clearMobile(section)
  if (live?.section === section) return
  const sheets = readSheets(section)
  // ảnh poster tĩnh chỉ dùng khi KHÔNG dựng được chồng poster (CSS ẩn sẵn, không lộ lúc chờ nạp)
  if (!sheets.length || !hasWebGL()) return void section.classList.add('is-fallback')
  const pin = section.querySelector('[data-poster-pin]')
  // Chỉ giữ một bản: về lại trang chủ khi bản cũ còn đó thì gỡ nó trước, không thì
  // afterLeave không còn trỏ tới nó nữa → rò WebGL context.
  destroy()

  presize(section, sheets)

  const api = mountStack(pin, { driver: 'page', params: params(pin), sheets })
  const me = { section, api, pin }
  // khung theo đúng cỡ khối dính (đổi khi is-live bật, khi đổi cỡ cửa sổ)
  let fitKey = ''
  me.fit = () => {
    if (live !== me) return
    // đang chuyển trang: trang cũ bị nhấc thành lớp cố định -> ResizeObserver báo đổi cỡ giả, resize WebGL
    // (~15 ms) giữa lúc trượt — đợi xong hẵng đo
    const T = window.CHANDE_TRANSITION
    if (T?.moving) return T.afterMove(me.fit)
    const key = `${pin.clientWidth}x${pin.clientHeight}`
    if (key === fitKey || pin.clientWidth < 2 || pin.clientHeight < 2) return
    fitKey = key
    api.applyParams(params(pin))
    api.renderOnce()
  }
  me.ro = new ResizeObserver(() => me.fit())
  me.ro.observe(pin)
  // 2 tag Agenda / Bootcamp + cụm ngày dính 2 bên (02 Oct · D-1 12-20) nằm DƯỚI các vòng: chỉ lộ trong vòng trong cùng
  // (Kaixa 2026-10-15: cụm ngày phải nằm dưới vòng tròn — bật lại sau khi từng bỏ ngày 14)
  me.under = [scope.querySelector('.agenda .pills'), scope.querySelector('.agenda__dates > div')].map((el) => underRings(api, pin, el))
  live = me
  // Chỉ đổi sang bản chạy khi ảnh đã nạp xong — trước đó vẫn là ảnh tĩnh, không nháy trắng.
  api.ready
    .then(() => {
      if (live !== me) return
      section.classList.add('is-live')
      // vẽ NGAY trong khung này (canvas vừa hết display:none) — chờ khung sau thì lộ
      // một khung canvas trống (đen)
      fitKey = ''
      me.fit()
      api.renderOnce()
    })
    .catch(() => {
      if (live === me) destroy()
    })
}

// Bán kính (px) và tâm của vòng TRONG CÙNG lúc này — cùng công thức updateOutro()
// của runtime: vòng i khởi hành ở i × stagger, nở tuyến tính (theo easing) tới
// rMax = khoảng cách từ tâm tới góc xa nhất của khung; đơn vị = chiều cao khung,
// gốc toạ độ ở ĐÁY (uv của plane).
function innerRing(api, rect) {
  const o = api.params.outro
  const op = api.outroProgress()
  const cols = (o.colors || []).filter((c) => typeof c === 'string' && c).slice(0, 16)
  const n = cols.length
  if (!o.on || !n || op <= 0) return null
  const aspect = rect.width / Math.max(1, rect.height)
  const ox = Math.min(Math.max(o.originX, 0), 1)
  const oy = Math.min(Math.max(o.originY, 0), 1)
  let rMax = 0
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) rMax = Math.max(rMax, Math.hypot((cx - ox) * aspect, cy - oy))
  rMax *= Math.max(1, o.scale)
  const stag = Math.min(Math.max(o.stagger, 0), n > 1 ? 0.9 / (n - 1) : 0.9)
  const span = Math.max(0.05, 1 - Math.min(Math.max(o.hold, 0), 0.6) - (n - 1) * stag)
  const local = Math.min(Math.max((op - (n - 1) * stag) / span, 0), 1)
  return {
    x: rect.left + ox * rect.width,
    y: rect.top + (1 - oy) * rect.height,
    r: easeCurve(o.easing, o.easeMode, local) * rMax * rect.height,
    full: local >= 1,
  }
}

// Cắt cụm ngày theo vòng trong cùng. Chỉ chạy rAF khi Agenda đang trong màn.
function underRings(api, pin, el) {
  if (!el) return null
  const agenda = el.closest('.hs-agenda')
  let raf = 0
  let on = false
  let lastClip = ''
  const set = (v) => {
    if (v === lastClip) return
    lastClip = v
    el.style.clipPath = v
  }
  let lastKey = ''
  const tick = () => {
    raf = 0
    if (!on) return
    // vòng tròn chưa đổi + chưa cuộn -> khỏi đo khung (getBoundingClientRect mỗi khung ép tính lại bố cục)
    const key = `${api.outroProgress().toFixed(4)}|${scrollY}|${innerHeight}`
    if (key === lastKey) {
      raf = requestAnimationFrame(tick)
      return
    }
    lastKey = key
    const ring = pin.isConnected ? innerRing(api, pin.getBoundingClientRect()) : null
    // tắt outro / outro đã phủ kín -> không cắt; outro chưa tới -> ẩn hẳn
    if (!api.params.outro.on || ring?.full || api.outroProgress() >= 1) set('')
    else if (!ring) set('circle(0 at 50% 100%)')
    else {
      const b = el.getBoundingClientRect()
      set(`circle(${ring.r.toFixed(1)}px at ${(ring.x - b.left).toFixed(1)}px ${(ring.y - b.top).toFixed(1)}px)`)
    }
    raf = requestAnimationFrame(tick)
  }
  const io = new IntersectionObserver(([e]) => {
    on = e.isIntersecting
    if (on && !raf) raf = requestAnimationFrame(tick)
  })
  io.observe(agenda)
  return {
    dispose() {
      io.disconnect()
      cancelAnimationFrame(raf)
      on = false
      el.style.removeProperty('clip-path')
    },
  }
}

function destroy() {
  if (!live) return
  live.ro?.disconnect()
  live.under?.forEach((u) => u?.dispose())
  live.api.dispose()
  live.section.classList.remove('is-live')
  live.section.style.removeProperty('--poster-scroll')
  live = null
}

// Chồng poster (three.js + 8 ảnh) nằm gần cuối trang và là phần nặng nhất (tải texture,
// dựng cảnh): chỉ dựng khi người xem cuộn tới gần (cách ~1.5 màn) — dựng ngay lúc tải
// trang làm đứng trang cả giây trên máy yếu. Chưa dựng xong thì ảnh poster tĩnh đứng chỗ.
// Chiều cao thì chốt ngay (presize) để bố cục trang không đổi lúc dựng xong.
function bootDesktop(sec) {
  if (!hasWebGL()) return
  const sh = readSheets(sec)
  if (sh.length) presize(sec, sh)
  let built = false
  const build = () => {
    if (built) return
    built = true
    io.disconnect()
    if (!mobileMQ.matches && sec.isConnected) mount(document)
  }
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && build(), { rootMargin: '150% 0px' })
  io.observe(sec)
  // Desktop: dựng sẵn lúc trang rảnh (~3 s sau khi tải xong, người xem còn ở đầu trang) — dựng lúc cuộn
  // tới thì đúng lúc đang lướt qua cụm vòng tròn, Safari giật rõ. Máy cảm ứng giữ cách cũ (đỡ bộ nhớ).
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50))
    const later = () => setTimeout(() => idle(build, { timeout: 2000 }), 3000)
    if (document.readyState === 'complete') later()
    else addEventListener('load', later, { once: true })
  }
}
{
  const sec = document.querySelector('[data-poster-stack]')
  if (sec) {
    if (mobileMQ.matches) renderMobile(sec)
    else bootDesktop(sec)
  }
  // qua lại mốc 900px (xoay iPad, kéo cửa sổ): đổi giữa ảnh tĩnh và chồng giấy 3D
  mobileMQ.addEventListener?.('change', () => {
    const s = document.querySelector('[data-poster-stack]')
    if (!s) return
    if (mobileMQ.matches) {
      destroy()
      s.classList.remove('is-sized')
      renderMobile(s)
    } else {
      clearMobile(s)
      bootDesktop(s)
    }
  })
}

if (window.barba?.hooks) {
  // Cùng nhịp với hero: dựng ở beforeEnter; `sync: true` nên afterLeave tới SAU
  // beforeEnter — chỉ gỡ khi section thuộc container cũ.
  // dựng chồng poster (WebGL, nạp ảnh) đợi chuyển trang xong — dựng giữa chừng làm khung trượt trang khựng
  window.barba.hooks.beforeEnter((data) => {
    const T = window.CHANDE_TRANSITION
    if (T?.moving) T.afterMove(() => data.next.container.isConnected && mount(data.next.container))
    else mount(data.next.container)
  })
  window.barba.hooks.afterLeave((data) => {
    if (live && data.current.container?.contains(live.section)) destroy()
  })
}

window.CHANDE_POSTER = {
  config: CONFIG,
  defaults: CODE,
  readSheets,
  mobileSrc,
  mount,
  destroy,
  get api() {
    return live?.api || null
  },
}
