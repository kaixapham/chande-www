/* =============================================================================
 * CHANDE — Gallery 3D: không gian vô tận các tem ảnh (trang gallery.html, [data-g3])
 * -----------------------------------------------------------------------------
 * Dựng trên Infinite Canvas của Edoardo Lunardi (MIT, github.com/edoardolunardi/infinite-canvas):
 * không gian chia khối (chunk) 3D, mỗi khối rải 5 tem ảnh theo hạt giống cố định; camera bay theo
 * kéo / lăn chuột / vuốt / phím (W A S D, mũi tên, Q E), tem xa mờ dần theo sương.
 * Bấm một tem: tem bay từ chỗ của nó ra giữa màn (lightbox), vẽ lại cỡ thật — ảnh lớn (`full`) nạp
 * xong thì vẽ đè cho nét. Mặt sau tem là tường lời nhắn theo từng ảnh: đọc / gửi qua /api/messages
 * (Vercel -> Google Sheet, tab "Messages"; gõ x ở cột Hide để ẩn). API chưa bật thì ẩn nút lời nhắn.
 *
 * Ảnh: <script type="application/json" data-g3-items> trong trang — [{ name, img, full }]
 *   img  = bản vừa giữ tỉ lệ (≤ 720 px) làm texture tem · full = ảnh lớn mở ở lightbox (CMS sửa được).
 * Animation tem bay ra / về: data-g3-anim='{"open":{"ms","bez"},"close":{…}}' trên [data-g3] (ngăn Quản lý ảnh lưu).
 * Admin (chạy local / ?admin=1): phím J mở ngăn "Quản lý ảnh" — nạp chande-g3-admin.js (tải ảnh lên, đổi tên, xoá,
 * chỉnh animation; Lưu ghi thẳng gallery.html + ảnh: local qua serve.mjs, site qua token GitHub như CMS).
 *
 * Mount / gỡ theo Barba (gỡ: huỷ rAF, listener, texture, renderer). Đang chuyển trang thì đợi xong
 * mới dựng (CHANDE_TRANSITION.afterMove) — dựng WebGL giữa lúc trang trượt làm khựng.
 *
 * API: window.CHANDE_G3 = { config, mount(root), destroy(), live }
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

const CONFIG = {
  open: { ms: 680, ease: 'cubic-bezier(0.16, 1, 0.3, 1)' }, // tem bay ra (nhanh rồi đáp chậm)
  close: { ms: 520, ease: 'cubic-bezier(0.76, 0, 0.24, 1)' }, // tem bay về
  // vào trang: tem hiện lần lượt từ tâm màn toả ra mép — mỗi tem trượt từ phía tâm ra đúng chỗ, vừa hiện vừa nở
  intro: { ms: 1200, ease: 'cubic-bezier(0.16, 1, 0.3, 1)', bez: [0.16, 1, 0.3, 1], spread: 900 },
  // bố cục không gian (ngăn Quản lý ảnh · 03 lưu vào data-g3-layout)
  layout: {
    far: 'fade', // 'fade' = ảnh xa mờ dần vào sương · 'shrink' = ảnh xa chỉ bé đi, vẫn rõ nét
    overlap: 'free', // 'free' = đè tự do · 'edge' = chỉ đè mép, mỗi cụm ≤ 3 ảnh · 'none' = không đè
    //                  'hero' = không đè, trừ các ảnh chính (to nhất trên màn) được đè lên vài ảnh khác
    heroes: 2, // 'hero': số ảnh chính cùng lúc (1–4)
    heroHits: 2, // 'hero': mỗi ảnh chính đè tối đa bấy nhiêu ảnh (1–4)
    align: 'avoid', // 'avoid' = hai tem đứng gần mà mép / tâm gần thẳng hàng thì ẩn tem xa hơn · 'free' = kệ
    butterfly: 'on', // bướm bay lượn trong không gian ('on' / 'off')
    bfSize: 1, // cỡ bướm (0.5–2)
    density: 5, // số tem mỗi khối không gian (3–9)
    even: 0, // 0 = rải ngẫu nhiên hoàn toàn · 1 = rải đều (mỗi tem một làn riêng theo x / y / z)
    size: 1, // hệ số cỡ tem (0.6–1.6)
    vary: 0.25, // chênh lệch cỡ giữa các tem: ± tỉ lệ (0–0.6)
    tilt: 0, // xoay ngẫu nhiên tối đa, độ (0–15)
    depth: 260, // tầm nhìn xa: ảnh xa hơn chừng này thì ẩn (160–300)
    seed: 0, // số xáo bố cục — đổi số là ra một cách rải khác
  },
}
const LAYOUT_DEFAULTS = { ...CONFIG.layout }
window.CHANDE_SETTINGS_APPLY?.('g3', CONFIG)

// ---------- hằng số (src/infinite-canvas/constants.ts) ----------
const CHUNK_SIZE = 110
const RENDER_DISTANCE = 2
const CHUNK_FADE_MARGIN = 1
const MAX_VELOCITY = 3.2
const NEAR_FADE = [0.55, 0.85] // tem chiếm quá 55% chiều cao màn thì mờ dần, tới 85% là ẩn (khỏi to vỡ hạt sát màn)
const INVIS_THRESHOLD = 0.01
const KEYBOARD_SPEED = 0.18
const VELOCITY_LERP = 0.16
const VELOCITY_DECAY = 0.9
const INITIAL_CAMERA_Z = 50
const CHUNK_OFFSETS = []
{
  const m = RENDER_DISTANCE + CHUNK_FADE_MARGIN
  for (let dx = -m; dx <= m; dx++)
    for (let dy = -m; dy <= m; dy++)
      for (let dz = -m; dz <= m; dz++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))
        if (dist <= m) CHUNK_OFFSETS.push({ dx, dy, dz, dist })
      }
}
// tem: lề giấy răng cưa (bán kính lỗ 7, bước 22, lề 14 — "đơn vị tem", khớp mặt lời nhắn trong CSS)
const PERF = { r: 7, step: 22, margin: 14 }
const STAMP_REF = 730 // tem trên tường vẽ như thể cạnh dài ảnh = 730 đơn vị
const FLIP_MS = 750

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const lerp = (a, b, t) => a + (b - a) * t
const seededRandom = (seed) => {
  const x = Math.sin(seed * 9999) * 10000
  return x - Math.floor(x)
}
const hashString = (str) => {
  let h = 0
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0
  return Math.abs(h)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// cubic-bezier(x1, y1, x2, y2) như CSS -> hàm t (0–1) -> tiến độ; giải x bằng Newton, trượt thì chia đôi
function bezier([x1, y1, x2, y2]) {
  const A = (a, b) => 1 - 3 * b + 3 * a
  const B = (a, b) => 3 * b - 6 * a
  const C = (a) => 3 * a
  const at = (t, a, b) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t
  const slope = (t, a, b) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a)
  return (x) => {
    if (x <= 0 || x >= 1) return clamp(x, 0, 1)
    let t = x
    for (let i = 0; i < 6; i++) {
      const d = slope(t, x1, x2)
      if (Math.abs(d) < 1e-6) break
      t -= (at(t, x1, x2) - x) / d
    }
    if (!(t >= 0 && t <= 1) || Math.abs(at(t, x1, x2) - x) > 1e-4) {
      let lo = 0
      let hi = 1
      t = x
      for (let i = 0; i < 24; i++) {
        if (at(t, x1, x2) < x) lo = t
        else hi = t
        t = (lo + hi) / 2
      }
    }
    return at(t, y1, y2)
  }
}
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches

function paperStamp(img, iw, ih, u) {
  const m = Math.round(PERF.margin * u)
  const r = PERF.r * u
  const pitch = PERF.step * u
  const W = iw + 2 * m
  const H = ih + 2 * m
  const paper = document.createElement('canvas')
  paper.width = W
  paper.height = H
  const pc = paper.getContext('2d')
  pc.fillStyle = '#FFFFFF'
  pc.fillRect(0, 0, W, H)
  pc.globalCompositeOperation = 'destination-out'
  const holes = (len, place) => {
    const n = Math.max(3, Math.round(len / pitch))
    const step = len / n
    for (let i = 0; i <= n; i++) {
      pc.beginPath()
      place(i * step)
      pc.fill()
    }
  }
  holes(W, (t) => {
    pc.arc(t, 0, r, 0, Math.PI * 2)
    pc.moveTo(t + r, H)
    pc.arc(t, H, r, 0, Math.PI * 2)
  })
  holes(H, (t) => {
    pc.arc(0, t, r, 0, Math.PI * 2)
    pc.moveTo(W + r, t)
    pc.arc(W, t, r, 0, Math.PI * 2)
  })
  pc.globalCompositeOperation = 'source-over'
  pc.imageSmoothingQuality = 'high'
  pc.drawImage(img, m, m, iw, ih)
  pc.strokeStyle = 'rgba(60, 45, 30, 0.18)'
  pc.lineWidth = Math.max(1, u)
  pc.strokeRect(m, m, iw, ih)
  return paper
}

let live = null

function mount(root = document) {
  const scope = root.querySelector ? root : document
  const el = scope.querySelector('[data-g3]')
  if (!el) return
  const T = window.CHANDE_TRANSITION
  if (T?.moving) return T.afterMove(() => el.isConnected && mount(root))
  destroy()

  let items = []
  try {
    items = JSON.parse(el.querySelector('[data-g3-items]')?.textContent || '[]')
  } catch (e) {
    console.warn('[chande-g3] danh sách ảnh lỗi:', e)
  }
  const toMedia = (list) => list.filter((it) => it && it.img).map((it) => ({ url: it.img, full: it.full || it.img, key: it.img, title: it.name || '' }))
  let media = toMedia(items)
  try {
    const L = JSON.parse(el.dataset.g3Layout || 'null')
    if (L && typeof L === 'object') Object.assign(CONFIG.layout, L)
  } catch {}
  try {
    const a = JSON.parse(el.dataset.g3Anim || 'null')
    for (const k of ['open', 'close', 'intro']) if (a?.[k]?.ms && Array.isArray(a[k].bez)) CONFIG[k] = { ...CONFIG[k], ms: +a[k].ms, ease: `cubic-bezier(${a[k].bez.join(',')})`, bez: a[k].bez, preset: a[k].preset }
    if (Number.isFinite(+a?.intro?.spread)) CONFIG.intro.spread = +a.intro.spread
  } catch {}

  const ac = new AbortController()
  const on = (t, type, fn, opt = {}) => t.addEventListener(type, fn, { ...opt, signal: ac.signal })
  const q = (sel) => el.querySelector(sel)
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
  // texture tem: cạnh dài tối đa — 110 ảnh cùng nạp lên GPU, 1024 như bản gốc là vài trăm MB
  const STAMP_MAX = isTouch ? 360 : 512
  document.documentElement.classList.add('g3-on')
  // bướm bay của trang chủ (chande-flyer.js) không bao giờ được sống sót sang gallery
  window.CHANDE_FLYER?.destroy?.()
  document.querySelectorAll('canvas.cflyer').forEach((c) => c.remove())
  window.CHANDE_TRANSITION?.lenis?.stop()

  // ---------- three.js ----------
  const stage = q('[data-g3-stage]')
  // canvas trong suốt: nền topo (CSS của .g3-stage) nằm yên phía sau không gian
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' })
  renderer.setClearColor(0x000000, 0)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isTouch ? 1.25 : 1.5))
  renderer.toneMapping = THREE.NoToneMapping
  stage.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  const FLOOR = getComputedStyle(el).getPropertyValue('--g3-floor').trim() || '#F7F3ED'
  const depthEnd = () => clamp(+CONFIG.layout.depth || 260, 160, 300)
  const FOG = new THREE.Fog(FLOOR, 120, 320)
  const applyFog = () => {
    FOG.near = depthEnd() - 140
    FOG.far = depthEnd() + 60
    scene.fog = CONFIG.layout.far === 'shrink' ? null : FOG
  }
  applyFog()
  const camera = new THREE.PerspectiveCamera(60, 1, 1, 500)
  const VIEW_TAN2 = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) // chiều cao khung nhìn / khoảng cách
  camera.position.set(0, 0, INITIAL_CAMERA_Z)
  const resize = () => {
    const w = stage.clientWidth
    const h = stage.clientHeight
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  on(window, 'resize', resize)
  resize()

  const PLANE_GEOMETRY = new THREE.PlaneGeometry(1, 1)
  const textureCache = new Map()
  const imageLoader = new THREE.ImageLoader()

  function makeStamp(img, max = STAMP_MAX) {
    const k = Math.min(1, max / Math.max(img.width, img.height))
    const iw = Math.round(img.width * k)
    const ih = Math.round(img.height * k)
    const paper = paperStamp(img, iw, ih, Math.max(iw, ih) / STAMP_REF)
    const W = paper.width
    const H = paper.height
    // bóng: X 0, Y 2, nhoè 50, #000 20% — cho tem cạnh dài 512 px
    const sc = Math.max(W, H) / 512
    const pad = Math.ceil(56 * sc)
    const out = document.createElement('canvas')
    out.width = W + 2 * pad
    out.height = H + 2 * pad
    const oc = out.getContext('2d')
    oc.shadowColor = 'rgba(0, 0, 0, 0.2)'
    oc.shadowBlur = 50 * sc
    oc.shadowOffsetY = 2 * sc
    oc.drawImage(paper, pad, pad)
    out.stampPad = pad
    out.sourceImage = img
    return out
  }

  function getTexture(url, onLoad) {
    let entry = textureCache.get(url)
    if (entry) {
      if (entry.loaded) onLoad(entry.tex)
      else entry.cbs.add(onLoad)
      return
    }
    entry = { tex: null, loaded: false, cbs: new Set([onLoad]) }
    textureCache.set(url, entry)
    imageLoader.load(
      url,
      (img) => {
        if (ac.signal.aborted) return
        const tex = new THREE.CanvasTexture(makeStamp(img))
        entry.tex = tex
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = 4
        tex.colorSpace = THREE.SRGBColorSpace
        tex.needsUpdate = true
        entry.loaded = true
        entry.cbs.forEach((cb) => {
          try {
            cb(tex)
          } catch (e) {
            console.error(e)
          }
        })
        entry.cbs.clear()
      },
      undefined,
      () => textureCache.delete(url),
    )
  }

  // ---------- tem to trên màn: đổi sang bản nét ----------
  // Tem thường dựng ở cạnh dài 512 px; bay lại gần, tem phóng to hơn độ phân giải đó là nhoè. Tem nào hiện to hơn
  // texture của nó thì dựng thêm một bản từ ảnh lớn (full) — chỉ vẽ lại tờ giấy ở độ phân giải cao, đè lên bản
  // thường phóng to (bóng vốn đã nhoè nên dùng lại được) — rồi thay map. Giữ tối đa HI_MAX bản (bỏ bản ít dùng nhất,
  // tem đang dùng nó quay về bản thường).
  const STAMP_HI = isTouch ? 960 : 1400
  const HI_MAX = isTouch ? 4 : 8
  const hiCache = new Map() // ảnh full -> { tex, loaded, users: Set<plane>, used }
  let hiFrame = 0
  function makeHiStamp(img, lo) {
    const paper = makeStamp(img, STAMP_HI)
    const pad = lo.stampPad
    const s = (paper.width - 2 * paper.stampPad) / (lo.width - 2 * pad)
    const out = document.createElement('canvas')
    out.width = Math.round(lo.width * s)
    out.height = Math.round(lo.height * s)
    const oc = out.getContext('2d')
    oc.drawImage(lo, 0, 0, out.width, out.height) // bóng (và tờ giấy cũ, sẽ bị phủ)
    const pw = paper.width - 2 * paper.stampPad
    const ph = paper.height - 2 * paper.stampPad
    oc.drawImage(paper, paper.stampPad, paper.stampPad, pw, ph, pad * s, pad * s, out.width - 2 * pad * s, out.height - 2 * pad * s)
    out.stampPad = pad * s
    out.sourceImage = img
    return out
  }
  function useHi(p, entry) {
    entry.users.add(p)
    p.hi = entry
    p.material.map = entry.tex
    p.mesh.userData.stamp = entry.tex.image
  }
  function dropHi(entry) {
    for (const p of entry.users) {
      p.hi = null
      p.material.map = p.lo
      p.mesh.userData.stamp = p.lo.image
    }
    entry.users.clear()
    entry.tex?.dispose()
  }
  function wantHi(p, now) {
    const { item } = p.mesh.userData
    if (!item.full || item.full === item.url) return
    let entry = hiCache.get(item.full)
    if (entry) {
      entry.used = now
      if (entry.loaded) useHi(p, entry)
      else entry.users.add(p)
      return
    }
    for (const e of hiCache.values()) if (!e.loaded) return // dựng lần lượt từng bản, khỏi dồn việc vào một khung
    const url = item.full
    entry = { tex: null, loaded: false, users: new Set([p]), used: now }
    hiCache.set(url, entry)
    const img = new Image()
    img.decoding = 'async'
    img.onload = () =>
      idle(() => {
        if (ac.signal.aborted || hiCache.get(url) !== entry) return
        const tex = new THREE.CanvasTexture(makeHiStamp(img, p.lo.image))
        tex.minFilter = THREE.LinearMipmapLinearFilter
        tex.magFilter = THREE.LinearFilter
        tex.generateMipmaps = true
        tex.anisotropy = 4
        tex.colorSpace = THREE.SRGBColorSpace
        entry.tex = tex
        entry.loaded = true
        for (const u of [...entry.users]) if (u.dead) entry.users.delete(u)
          else useHi(u, entry)
        // quá số bản cho phép: bỏ bản lâu không dùng nhất
        while (hiCache.size > HI_MAX) {
          let old = null
          for (const [k, e] of hiCache) if (e.loaded && e !== entry && (!old || e.used < old[1].used)) old = [k, e]
          if (!old) break
          hiCache.delete(old[0])
          dropHi(old[1])
        }
      })
    img.onerror = () => hiCache.delete(url)
    img.src = url
  }
  // mỗi 8 khung, lúc camera gần như đứng yên (đang bay vèo qua thì không ai thấy nhoè — khỏi tải ảnh lớn của mọi
  // tem lướt qua): tem đang hiện mà to hơn texture của nó ~15% (theo pixel thật của canvas) thì xin bản nét
  function checkHi(now) {
    if ((hiFrame = (hiFrame + 1) % 8)) return
    if (Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z) > 0.12 || lbOpen) return
    const H = renderer.domElement.height
    for (const c of chunks.values())
      for (const p of c.planes) {
        if (!p.on || p.opacity < 0.5) continue
        if (p.hi) {
          p.hi.used = now
          continue
        }
        const d = camera.position.z - p.z
        if (d > 1 && (p.size / d / VIEW_TAN2) * H > p.lo.image.height * 1.15) wantHi(p, now)
      }
  }

  // Ảnh cho từng tem: không bốc ngẫu nhiên (100 ảnh mà ~60 tem trên màn thì kiểu gì cũng có ảnh trùng đứng
  // cạnh nhau). Mỗi khối nhận một nhóm n ảnh liền nhau theo lưới lệch f = (cx + b·cy + c·cz) mod M, M = ⌊số ảnh / n⌋;
  // b, c chọn sao cho hai khối cùng nhóm cách nhau xa nhất có thể -> một ảnh không bao giờ lặp lại ở gần.
  // Thứ tự ảnh xáo theo seed bố cục; mỗi 6 khối theo chiều sâu dịch nhóm đi một vòng để ảnh dư (số ảnh không chia
  // hết cho n) vẫn được hiện.
  const latticeCache = new Map()
  function lattice(M) {
    if (latticeCache.has(M)) return latticeCache.get(M)
    let best = [0, 0]
    let bestD = -1
    for (let b = 0; b < M; b++)
      for (let c = 0; c < M; c++) {
        let d = Infinity
        scan: for (let dx = -3; dx <= 3; dx++)
          for (let dy = -3; dy <= 3; dy++)
            for (let dz = -3; dz <= 3; dz++) {
              if ((!dx && !dy && !dz) || (((dx + b * dy + c * dz) % M) + M) % M) continue
              d = Math.min(d, dx * dx + dy * dy + dz * dz)
              if (d <= bestD) break scan
            }
        if (d > bestD) {
          bestD = d
          best = [b, c]
        }
      }
    latticeCache.set(M, best)
    return best
  }
  const orderCache = new Map()
  function photoOrder(N, seed) {
    const key = `${N}:${seed}`
    if (!orderCache.has(key)) {
      const a = [...Array(N).keys()]
      for (let i = N - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(9173 + (+seed || 0) * 131 + i * 7.77) * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      orderCache.set(key, a)
    }
    return orderCache.get(key)
  }
  function photoFor(cx, cy, cz, i, count) {
    const N = media.length
    if (!N) return 0
    const M = Math.max(1, Math.floor(N / count))
    const [b, c] = lattice(M)
    const f = (((cx + b * cy + c * cz) % M) + M) % M
    const rot = Math.floor(cz / 6) * M * count
    return photoOrder(N, CONFIG.layout.seed)[(((f * count + i + rot) % N) + N) % N]
  }

  // vị trí: giá trị mặc định (rải ngẫu nhiên, ±25% cỡ, không xoay, seed 0) cho ra đúng bố cục gốc của Infinite Canvas
  function generateChunkPlanes(cx, cy, cz) {
    const planes = []
    const L = CONFIG.layout
    const seed = hashString(+L.seed ? `${L.seed}:${cx},${cy},${cz}` : `${cx},${cy},${cz}`)
    const count = clamp(Math.round(+L.density || 5), 3, 9)
    const k = clamp(+L.size || 1, 0.6, 1.6)
    const vary = clamp(+(L.vary ?? 0.25), 0, 0.6)
    const even = clamp(+L.even || 0, 0, 1)
    const tilt = (clamp(+L.tilt || 0, 0, 15) * Math.PI) / 180
    // rải đều = lấy mẫu siêu khối Latin: mỗi tem một làn riêng theo x, y, z (xáo theo seed của khối)
    const lanes = (salt) => {
      const a = [...Array(count).keys()]
      for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(seededRandom(seed + salt + i * 7.31) * (i + 1))
        ;[a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }
    const lx = lanes(101)
    const ly = lanes(202)
    const lz = lanes(303)
    for (let i = 0; i < count; i++) {
      const s = seed + i * 1000
      const r = (n) => seededRandom(s + n)
      const at = (free, lane, n) => lerp(free, (lane + r(n)) / count, even)
      planes.push({
        x: cx * CHUNK_SIZE + at(r(0), lx[i], 6) * CHUNK_SIZE,
        y: cy * CHUNK_SIZE + at(r(1), ly[i], 7) * CHUNK_SIZE,
        z: cz * CHUNK_SIZE + at(r(2), lz[i], 8) * CHUNK_SIZE,
        size: 16 * (1 + (r(4) - 0.5) * 2 * vary) * 1.4 * k,
        rot: tilt ? (r(9) - 0.5) * 2 * tilt : 0,
        mediaIndex: photoFor(cx, cy, cz, i, count),
      })
    }
    return planes
  }

  const chunks = new Map()
  const cameraGrid = { cx: 0, cy: 0, cz: 0, camZ: INITIAL_CAMERA_Z }
  const idle = window.requestIdleCallback ? (f) => ({ id: requestIdleCallback(f, { timeout: 100 }), idle: true }) : (f) => ({ id: setTimeout(f, 0), idle: false })

  function buildChunk(cx, cy, cz) {
    const chunk = { cx, cy, cz, group: new THREE.Group(), planes: [], dead: false }
    scene.add(chunk.group)
    chunk.idle = idle(() => {
      if (chunk.dead || !media.length) return
      for (const p of generateChunkPlanes(cx, cy, cz)) {
        const item = media[p.mediaIndex % media.length]
        if (!item) continue
        getTexture(item.url, (tex) => {
          if (chunk.dead) return
          const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, alphaTest: 0.004 })
          const mesh = new THREE.Mesh(PLANE_GEOMETRY, material)
          const aspect = tex.image.width / tex.image.height
          mesh.position.set(p.x, p.y, p.z)
          mesh.scale.set(p.size * aspect, p.size, 1)
          mesh.rotation.z = p.rot
          mesh.visible = false
          mesh.userData = { item, stamp: tex.image }
          chunk.group.add(mesh)
          // khung tờ giấy (bỏ bóng nướng quanh tem) để tính đè nhau trên màn — xoay thì lấy khung bao
          const st = tex.image
          const pw = p.size * aspect * (1 - (2 * (st.stampPad || 0)) / st.width)
          const ph = p.size * (1 - (2 * (st.stampPad || 0)) / st.height)
          const cos = Math.abs(Math.cos(p.rot))
          const sin = Math.abs(Math.sin(p.rot))
          chunk.planes.push({
            mesh, material, lo: tex, hi: null, dead: false, x: p.x, y: p.y, z: p.z, size: p.size, sx: mesh.scale.x, sy: mesh.scale.y, ir: -1,
            bw: pw * cos + ph * sin, bh: pw * sin + ph * cos,
            opacity: 0, frame: 0, base: 0, on: false, block: false,
          })
          intro.loaded++
        })
      }
    })
    return chunk
  }
  function destroyChunk(chunk) {
    chunk.dead = true
    if (chunk.idle.idle) cancelIdleCallback(chunk.idle.id)
    else clearTimeout(chunk.idle.id)
    for (const p of chunk.planes) {
      p.dead = true
      p.hi?.users.delete(p)
      p.material.dispose()
    }
    scene.remove(chunk.group)
  }
  function setChunksAround(ucx, ucy, ucz) {
    const want = new Set()
    for (const o of CHUNK_OFFSETS) {
      const cx = ucx + o.dx
      const cy = ucy + o.dy
      const cz = ucz + o.dz
      const key = `${cx},${cy},${cz}`
      want.add(key)
      if (!chunks.has(key)) chunks.set(key, buildChunk(cx, cy, cz))
    }
    for (const [key, c] of chunks)
      if (!want.has(key)) {
        destroyChunk(c)
        chunks.delete(key)
      }
  }

  // ---------- vào trang: toả từ tâm ----------
  // 'wait' = giấu hết tới khi đủ tem nạp xong (hoặc 1 s) · 'run' = đang toả · 'done' = chạy như thường
  const intro = { state: reduceMotion ? 'done' : 'wait', t0: 0, mountT: performance.now(), cx: 0, cy: 0, ease: null, loaded: 0 }
  let frameNow = performance.now()
  function startIntro() {
    for (const c of chunks.values()) for (const p of c.planes) p.ir = -1
    Object.assign(intro, { state: 'run', t0: frameNow, cx: camera.position.x, cy: camera.position.y, ease: bezier(CONFIG.intro.bez || [0.16, 1, 0.3, 1]) })
    bfSync() // bướm bay vào cùng lúc tem toả ra
  }
  // lần tải đầu: màn loading còn che thì chưa toả (đi tới bằng Barba thì mount đã đợi rèm chuyển trang xong)
  const loaderDone = () => {
    const L = window.CHANDE_LOADING
    return !L || L.config?.enabled === false || document.documentElement.classList.contains('cl-done')
  }
  function stepIntro() {
    if (intro.state === 'wait') {
      if (!loaderDone()) intro.mountT = frameNow // đếm 1 s chờ tem tính từ lúc loading xong
      else if (intro.loaded >= 12 || frameNow - intro.mountT > 1000) startIntro()
    } else if (intro.state === 'run' && frameNow - intro.t0 > CONFIG.intro.spread + CONFIG.intro.ms + 60) {
      intro.state = 'done'
      for (const c of chunks.values())
        for (const p of c.planes) {
          p.mesh.position.set(p.x, p.y, p.z)
          p.mesh.scale.set(p.sx, p.sy, 1)
        }
    }
  }
  // tiến độ (0–1, đã easing) của một tem; đặt luôn vị trí / cỡ đang toả
  function introAt(p) {
    if (intro.state === 'wait') return 0
    if (p.ir < 0) {
      // khoảng cách tới tâm màn lúc bắt đầu, chuẩn hoá theo nửa khung nhìn (0 = tâm, ~1 = mép)
      const d = Math.max(camera.position.z - p.z, 1)
      const ty = VIEW_TAN2 / 2
      p.ir = Math.min(Math.hypot((p.x - intro.cx) / d / (ty * camera.aspect), (p.y - intro.cy) / d / ty), 1.3) / 1.3
    }
    const raw = clamp((frameNow - intro.t0 - p.ir * CONFIG.intro.spread) / Math.max(CONFIG.intro.ms, 1), 0, 1)
    const e = intro.ease(raw)
    const pull = lerp(0.45, 1, e) // bắt đầu ở 45% quãng từ tâm ra chỗ của nó
    const k = lerp(0.6, 1, e)
    p.mesh.position.set(intro.cx + (p.x - intro.cx) * pull, intro.cy + (p.y - intro.cy) * pull, p.z)
    p.mesh.scale.set(p.sx * k, p.sy * k, 1)
    if (raw >= 1) {
      p.mesh.position.set(p.x, p.y, p.z)
      p.mesh.scale.set(p.sx, p.sy, 1)
    }
    return raw
  }

  let lbMesh = null
  function updatePlane(chunk, p) {
    const { mesh, material } = p
    p.frame = (p.frame + 1) & 1
    if (p.opacity < INVIS_THRESHOLD && !mesh.visible && p.frame === 0) return
    if (mesh === lbMesh) {
      mesh.visible = false // tem đang mở nằm ở lightbox
      return
    }
    const dist = Math.max(Math.abs(chunk.cx - cameraGrid.cx), Math.abs(chunk.cy - cameraGrid.cy), Math.abs(chunk.cz - cameraGrid.cz))
    const absDepth = Math.abs(p.z - cameraGrid.camZ)
    const fadeEnd = depthEnd()
    if (absDepth > fadeEnd + 50) {
      p.opacity = 0
      p.base = 0
      p.on = false
      material.opacity = 0
      mesh.visible = false
      return
    }
    const gridFade = dist <= RENDER_DISTANCE ? 1 : Math.max(0, 1 - (dist - RENDER_DISTANCE) / Math.max(CHUNK_FADE_MARGIN, 0.0001))
    // 'shrink': ảnh xa không nhạt dần (chỉ bé đi theo phối cảnh) — chỉ dải mỏng ở mép xa nhất mờ ra cho
    // khỏi bật hiện / biến mất đột ngột
    const fs = CONFIG.layout.far === 'shrink' ? fadeEnd - 30 : fadeEnd - 120
    const depthFade = absDepth <= fs ? 1 : Math.max(0, 1 - (absDepth - fs) / Math.max(fadeEnd - fs, 0.0001))
    // quá gần: tem phình to chiếm gần hết màn (và vỡ hạt) -> mờ đi trước khi lướt qua; sau lưng camera thì ẩn
    const front = cameraGrid.camZ - p.z
    const fill = front > 1 ? p.size / (front * VIEW_TAN2) : Infinity
    const nearFade = clamp((NEAR_FADE[1] - fill) / (NEAR_FADE[1] - NEAR_FADE[0]), 0, 1)
    p.base = Math.min(gridFade, depthFade * depthFade, nearFade)
    // đứng yên là mọi tem rõ hẳn: tem chỉ có hiện hẳn / ẩn hẳn (ngưỡng có trễ cho khỏi chớp) — các dải mờ ở
    // trên chỉ quyết định lúc nào bật / tắt, còn mờ chỉ là thoáng chốc lúc tem hiện ra / biến đi khi đang bay
    if (p.base > 0.55) p.on = true
    else if (p.base < 0.35) p.on = false
    const target = p.on && !p.block ? 1 : 0
    if (intro.state !== 'done') {
      const k = introAt(p)
      if (k < 1) {
        // trong lúc toả: độ hiện đi thẳng theo nhịp intro (không trễ theo lerp)
        p.opacity = target * clamp(k / 0.35, 0, 1)
        material.opacity = p.opacity
        mesh.visible = p.opacity > INVIS_THRESHOLD
        return
      }
    }
    p.opacity = target < INVIS_THRESHOLD && p.opacity < INVIS_THRESHOLD ? 0 : lerp(p.opacity, target, 0.18)
    material.opacity = p.opacity > 0.99 ? 1 : p.opacity
    mesh.visible = p.opacity > INVIS_THRESHOLD
  }

  // ---------- điều khiển (SceneController) ----------
  const s = {
    velocity: { x: 0, y: 0, z: 0 }, targetVel: { x: 0, y: 0, z: 0 },
    basePos: { x: 0, y: 0, z: INITIAL_CAMERA_Z }, drift: { x: 0, y: 0 },
    mouse: { x: 0, y: 0 }, lastMouse: { x: 0, y: 0 }, scrollAccum: 0, isDragging: false,
    lastTouches: [], lastTouchDist: 0, lastChunkKey: '', lastChunkUpdate: 0, pendingChunk: null,
  }
  const canvas = renderer.domElement
  const touchDist = (t) => (t.length < 2 ? 0 : Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY))
  // bấm / chạm một tem (gần như không dời, nhanh) thì mở lightbox
  let press = null
  const isTap = (x, y) => press && Math.hypot(x - press.x, y - press.y) < 6 && performance.now() - press.t < 350
  let lbOpen = false

  on(canvas, 'mousedown', (e) => {
    press = { x: e.clientX, y: e.clientY, t: performance.now() }
    s.isDragging = true
    s.lastMouse = { x: e.clientX, y: e.clientY }
    canvas.style.cursor = 'grabbing'
  })
  on(window, 'mouseup', (e) => {
    if (s.isDragging && isTap(e.clientX, e.clientY)) openLightboxAt(e.clientX, e.clientY)
    press = null
    s.isDragging = false
    canvas.style.cursor = 'grab'
  })
  on(canvas, 'mouseleave', () => {
    s.mouse = { x: 0, y: 0 }
    s.isDragging = false
    canvas.style.cursor = 'grab'
  })
  on(window, 'mousemove', (e) => {
    if (lbOpen) return
    s.mouse = { x: (e.clientX / innerWidth) * 2 - 1, y: -(e.clientY / innerHeight) * 2 + 1 }
    if (s.isDragging) {
      s.targetVel.x -= (e.clientX - s.lastMouse.x) * 0.025
      s.targetVel.y += (e.clientY - s.lastMouse.y) * 0.025
      s.lastMouse = { x: e.clientX, y: e.clientY }
    }
  })
  on(canvas, 'wheel', (e) => {
    e.preventDefault()
    s.scrollAccum += e.deltaY * 0.006
  }, { passive: false })
  on(canvas, 'touchstart', (e) => {
    e.preventDefault()
    press = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() } : null
    s.lastTouches = [...e.touches]
    s.lastTouchDist = touchDist(s.lastTouches)
  }, { passive: false })
  on(canvas, 'touchmove', (e) => {
    e.preventDefault()
    const t = [...e.touches]
    if (t.length === 1 && s.lastTouches.length >= 1) {
      s.targetVel.x -= (t[0].clientX - s.lastTouches[0].clientX) * 0.02
      s.targetVel.y += (t[0].clientY - s.lastTouches[0].clientY) * 0.02
    } else if (t.length === 2 && s.lastTouchDist > 0) {
      const d = touchDist(t)
      s.scrollAccum += (s.lastTouchDist - d) * 0.006
      s.lastTouchDist = d
    }
    s.lastTouches = t
  }, { passive: false })
  on(canvas, 'touchend', (e) => {
    const t = e.changedTouches[0]
    if (e.touches.length === 0 && t && isTap(t.clientX, t.clientY)) openLightboxAt(t.clientX, t.clientY)
    if (e.touches.length === 0) press = null
    s.lastTouches = [...e.touches]
    s.lastTouchDist = touchDist(s.lastTouches)
  }, { passive: false })

  const keys = new Set()
  const KEYMAP = { w: 'forward', arrowup: 'forward', s: 'backward', arrowdown: 'backward', a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right', e: 'up', q: 'down' }
  const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
  on(window, 'keydown', (e) => {
    const k = KEYMAP[e.key.toLowerCase()]
    if (k && !typing(e) && !lbOpen) keys.add(k)
  })
  on(window, 'keyup', (e) => {
    const k = KEYMAP[e.key.toLowerCase()]
    if (k) keys.delete(k)
  })
  on(window, 'blur', () => keys.clear())

  // ---------- lightbox ----------
  const lb = q('[data-g3-lb]')
  const lbFrame = q('[data-g3-frame]')
  const lbCanvas = q('[data-g3-lbcanvas]')
  const lbCard = q('[data-g3-card]')
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  let lbItem = null
  let lbBusy = false
  let frontSize = { w: 0, h: 0 }
  let lbToken = 0

  function pickAt(x, y) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const list = []
    for (const c of chunks.values()) for (const p of c.planes) if (p.mesh.visible && p.opacity > 0.3) list.push(p.mesh)
    return raycaster.intersectObjects(list, false)[0]?.object || null
  }
  const corner = new THREE.Vector3()
  function screenRect(mesh) {
    const r = canvas.getBoundingClientRect()
    let x0 = Infinity
    let y0 = Infinity
    let x1 = -Infinity
    let y1 = -Infinity
    mesh.updateMatrixWorld()
    for (const [cx, cy] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
      corner.set(cx, cy, 0).applyMatrix4(mesh.matrixWorld).project(camera)
      const sx = r.left + ((corner.x + 1) / 2) * r.width
      const sy = r.top + ((1 - corner.y) / 2) * r.height
      x0 = Math.min(x0, sx)
      y0 = Math.min(y0, sy)
      x1 = Math.max(x1, sx)
      y1 = Math.max(y1, sy)
    }
    // bỏ phần bóng trong suốt nướng sẵn quanh tem, chỉ còn tờ giấy
    const st = mesh.userData.stamp
    const fx = st.stampPad / st.width
    const fy = st.stampPad / st.height
    const w = x1 - x0
    const h = y1 - y0
    return { left: x0 + w * fx, top: y0 + h * fy, width: w * (1 - 2 * fx), height: h * (1 - 2 * fy) }
  }
  const flip = (from, to) => `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
  function setFrameSize(w, h, animate) {
    if (!animate) lbFrame.style.transition = 'none'
    lbFrame.style.width = `${w}px`
    lbFrame.style.height = `${h}px`
    if (!animate) {
      void lbFrame.offsetWidth
      lbFrame.style.transition = ''
    }
  }
  // vẽ mặt ảnh của tem ở cỡ đang hiện (răng cưa đúng 7 / 22 px như mặt lời nhắn)
  function drawFront(src, iw, ih) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const paper = paperStamp(src, Math.round(iw * dpr), Math.round(ih * dpr), dpr)
    lbCanvas.width = paper.width
    lbCanvas.height = paper.height
    lbCanvas.getContext('2d').drawImage(paper, 0, 0)
  }

  function openLightboxAt(x, y) {
    if (lbOpen || lbBusy) return
    const mesh = pickAt(x, y)
    if (!mesh) return
    const { item, stamp } = mesh.userData
    lbOpen = true
    lbMesh = mesh
    lbItem = item
    keys.clear()
    Object.assign(s.targetVel, { x: 0, y: 0, z: 0 })
    s.scrollAccum = 0

    const src = stamp.sourceImage
    const imgAspect = src.width / src.height
    const M2 = PERF.margin * 2
    const maxW = Math.min(innerWidth * 0.92, innerWidth - 32)
    const maxH = innerHeight * 0.74
    const iw = Math.round(Math.min(maxW - M2, (maxH - M2) * imgAspect))
    const ih = Math.round(iw / imgAspect)
    drawFront(src, iw, ih)
    frontSize = { w: iw + M2, h: ih + M2 }
    setFrameSize(frontSize.w, frontSize.h, false)
    // ảnh lớn nạp xong thì vẽ đè cho nét (mở rồi đóng nhanh thì bỏ)
    const token = ++lbToken
    if (item.full && item.full !== item.url) {
      const big = new Image()
      big.decoding = 'async'
      big.onload = () => token === lbToken && lbOpen && drawFront(big, iw, ih)
      big.src = item.full
    }
    q('[data-g3-title]').textContent = item.title || 'Untitled'

    lbFrame.getAnimations().forEach((a) => a.cancel())
    lb.hidden = false
    const to = lbFrame.getBoundingClientRect()
    const from = screenRect(mesh)
    mesh.visible = false
    mesh.material.opacity = 0
    lb.style.setProperty('--lb-ms', `${reduceMotion ? 0 : CONFIG.open.ms}ms`)
    if (!reduceMotion) lbFrame.animate([{ transform: flip(from, to) }, { transform: 'none' }], { duration: CONFIG.open.ms, easing: CONFIG.open.ease })
    requestAnimationFrame(() => lb.classList.add('is-open'))
    q('[data-g3-close]').focus({ preventScroll: true })
    showNotes(item, to, reduceMotion ? 0 : CONFIG.open.ms * 0.55)
  }

  async function closeLightbox() {
    if (!lbOpen || lbBusy) return
    lbBusy = true
    lbToken++
    if (chatOpen) {
      closeChat()
      if (!reduceMotion) await wait(FLIP_MS)
    }
    lbFrame.getAnimations().forEach((a) => a.cancel())
    const to = lbFrame.getBoundingClientRect()
    hideNotes()
    lb.style.setProperty('--lb-ms', `${reduceMotion ? 0 : CONFIG.close.ms}ms`)
    lb.classList.remove('is-open')
    if (!reduceMotion && lbMesh) {
      const a = lbFrame.animate([{ transform: 'none' }, { transform: flip(screenRect(lbMesh), to) }], { duration: CONFIG.close.ms, easing: CONFIG.close.ease, fill: 'forwards' })
      await a.finished.catch(() => {})
      a.cancel()
    }
    lb.hidden = true
    lbOpen = false
    lbMesh = null
    lbBusy = false
  }
  on(lb, 'click', (e) => {
    if (e.target === lb || e.target === lbCanvas) closeLightbox()
  })
  on(window, 'keydown', (e) => {
    if (e.key !== 'Escape' || !lbOpen) return
    if (chatOpen) closeChat()
    else closeLightbox()
  })
  on(q('[data-g3-close]'), 'click', () => closeLightbox())

  // ---------- tải ảnh ----------
  const slug = (t) =>
    (t || 'anh').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 60) || 'anh'
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' }
  const dlBtn = q('[data-g3-download]')
  on(dlBtn, 'click', async () => {
    if (!lbItem) return
    dlBtn.disabled = true
    try {
      const url = lbItem.full || lbItem.url
      const blob = await fetch(url).then((r) => {
        if (!r.ok) throw new Error()
        return r.blob()
      })
      const ext = EXT[blob.type] || (url.match(/\.(jpe?g|png|webp|gif)$/i)?.[1].toLowerCase() ?? 'jpg')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `chande-${slug(lbItem.title)}-${slug(url.split('/').pop().replace(/\.[^.]+$/, ''))}.${ext}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(a.href), 4000)
    } catch {
      toast('Could not download this photo.')
    } finally {
      dlBtn.disabled = false
    }
  })

  // ---------- lời nhắn (mặt sau tem) — /api/messages (Vercel -> Google Sheet) ----------
  const MSG_API = '/api/messages'
  let msgOn = false
  let chatOpen = false
  let chatPoll = 0
  let chatAt = 0
  let chatLocal = [] // lời nhắn vừa gửi: hiện ngay, không đợi Sheet / bộ đệm CDN
  // lời nhắn trùng (cùng tên + cùng nội dung, bỏ khác biệt hoa / thường, dấu cách) chỉ hiện một — khớp api/messages.js
  const msgKey = (m) => `${String(m.name || 'Anonymous').replace(/\s+/g, ' ').trim().toLowerCase()}|${String(m.text || '').replace(/\s+/g, ' ').trim().toLowerCase()}`
  const uniqMsgs = (list) => {
    const seen = new Set()
    return list.filter((m) => !seen.has(msgKey(m)) && seen.add(msgKey(m)))
  }
  let sending = false // đang gửi: bấm thêm / Enter thêm không gửi lần nữa
  let unsure = null // lần gửi trước báo lỗi (có thể Sheet đã ghi): { key, k } — gửi lại y nguyên thì kiểm tra Sheet trước
  const chatEl = q('[data-g3-chat]')
  const wall = q('[data-g3-wall]')
  const wallEmpty = q('[data-g3-wallempty]')
  const chatBtn = q('[data-g3-chatbtn]')
  const chatStatus = q('[data-g3-status]')
  const chatName = q('[data-g3-name]')
  const chatText = q('[data-g3-text]')
  const chatSend = q('[data-g3-send]')
  const chatHp = q('[data-g3-hp]')
  // avatar người viết (Figma 688:49086) — thành emoji trên note; nhớ lựa chọn ở máy này
  const AVATARS = ['🐺', '🐻', '🦊', '🐯', '🐶', '🐟', '🐷', '👨‍🌾']
  const avatarBox = q('[data-g3-avatars]')
  let avatar = AVATARS[0]
  try {
    if (AVATARS.includes(localStorage.getItem('ic-avatar'))) avatar = localStorage.getItem('ic-avatar')
  } catch {}
  const paintAvatar = () => avatarBox.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.textContent === avatar)))
  paintAvatar()
  on(avatarBox, 'click', (e) => {
    const b = e.target.closest('button')
    if (!b || !AVATARS.includes(b.textContent)) return
    avatar = b.textContent
    paintAvatar()
    try {
      localStorage.setItem('ic-avatar', avatar)
    } catch {}
  })
  chatBtn.hidden = true
  // Bật lời nhắn: thử lấy MỌI lời nhắn một lần (?all=1 — vừa là ping, vừa để note của ảnh nào mở ra cũng hiện
  // ngay); Apps Script bản cũ chưa có thì chỉ ping, note lấy theo từng ảnh. Lỗi vặt thì thử lại (3 lượt) — trước
  // đây ping hỏng một lần là cả phiên không có lời nhắn.
  let msgAll = null // { ảnh: [lời nhắn…] } hoặc null
  const msgCache = new Map() // ảnh -> { at, p: Promise<list> } (khi không có msgAll)
  const getJSON = (url) =>
    fetch(url, { signal: ac.signal })
      .then((r) => r.json())
      .catch(() => null)
  const msgReady = (async () => {
    for (let i = 0; i < 3 && !ac.signal.aborted; i++) {
      const all = await getJSON(`${MSG_API}?all=1`)
      if (all?.ok) {
        msgAll = all.all || {}
        return true
      }
      if ((await getJSON(`${MSG_API}?ping=1`))?.ok) return true
      await wait(1500 * (i + 1))
    }
    return false
  })()
  msgReady.then((ok) => {
    if (!ok || ac.signal.aborted) return
    msgOn = true
    chatBtn.hidden = false
  })
  // giữ bộ "mọi lời nhắn" mới (bộ đệm CDN 15 s): lời nhắn người khác vừa viết cũng hiện thành note
  const msgTimer = setInterval(async () => {
    if (!msgAll || document.hidden || ac.signal.aborted) return
    const all = await getJSON(`${MSG_API}?all=1`)
    if (all?.ok) msgAll = all.all || {}
  }, 60000)
  ac.signal.addEventListener('abort', () => clearInterval(msgTimer))
  // lời nhắn của một ảnh: có bộ "mọi lời nhắn" thì lấy luôn; không thì hỏi theo ảnh (nhớ 60 s, lỗi thì thử lại 1 lần)
  function getMessages(key) {
    if (msgAll) return Promise.resolve(msgAll[key] || [])
    const c = msgCache.get(key)
    if (c && Date.now() - c.at < 60000) return c.p
    const p = (async () => {
      for (let i = 0; i < 2 && !ac.signal.aborted; i++) {
        const j = await getJSON(`${MSG_API}?image=${encodeURIComponent(key)}`)
        if (j?.ok) return j.messages || []
        await wait(800)
      }
      msgCache.delete(key)
      return []
    })()
    msgCache.set(key, { at: Date.now(), p })
    return p
  }
  // chữ trên nút: tách từng chữ để trồi lên lần lượt (CSS đọc --i)
  {
    const l = q('[data-g3-label]')
    const text = l.textContent
    l.textContent = ''
    ;[...text].forEach((ch, i) => {
      const sp = document.createElement('i')
      sp.textContent = ch === ' ' ? '\u00a0' : ch
      sp.style.setProperty('--i', i)
      l.appendChild(sp)
    })
  }
  function flipCard(toBack) {
    if (reduceMotion) return
    const a = toBack ? 0 : 180
    const b = toBack ? 180 : 0
    lbCard.animate(
      [{ transform: `rotateY(${a}deg) scale(1)` }, { transform: `rotateY(${(a + b) / 2}deg) scale(0.9)`, offset: 0.5 }, { transform: `rotateY(${b}deg) scale(1)` }],
      { duration: FLIP_MS, easing: 'cubic-bezier(.65, 0, .25, 1)' },
    )
  }
  function renderWall(list) {
    wall.replaceChildren()
    if (list === null) {
      wallEmpty.textContent = 'Loading messages…'
      wallEmpty.hidden = false
      return
    }
    wallEmpty.textContent = 'No messages on this photo yet. Be the first.'
    wallEmpty.hidden = list.length > 0
    for (const m of list) {
      const card = document.createElement('article')
      card.className = 'g3-note'
      const who = document.createElement('div')
      who.className = 'g3-note__name'
      who.textContent = `${AVATARS.includes(m.avatar) ? `${m.avatar} ` : ''}${String(m.name || 'Anonymous').slice(0, 40)}`
      const text = document.createElement('p')
      text.className = 'g3-note__text'
      text.textContent = String(m.text || '').slice(0, 500)
      card.append(who, text)
      wall.append(card)
    }
  }
  async function loadWall(key) {
    try {
      const r = await fetch(`${MSG_API}?image=${encodeURIComponent(key)}`, { signal: ac.signal })
      const j = await r.json()
      if (!chatOpen || lbItem?.key !== key) return
      const got = Array.isArray(j.messages) ? j.messages : []
      if (j.ok) {
        if (msgAll) msgAll[key] = got
        else msgCache.set(key, { at: Date.now(), p: Promise.resolve(got) })
      }
      // bản vừa gửi chưa có trong Sheet (bộ đệm 10 s) thì giữ ở đầu
      const seen = new Set(got.map(msgKey))
      chatLocal = chatLocal.filter((m) => m.image === key && !seen.has(msgKey(m)) && Date.now() - m.createdAt < 120000)
      renderWall(uniqMsgs([...chatLocal, ...got]))
    } catch {
      if (chatOpen && !ac.signal.aborted && !wall.children.length) renderWall([])
    }
  }
  // Cỡ mặt lời nhắn: vừa khoảng giữa thanh nav trên cùng và thanh nút dưới (chừa khoảng thở hai đầu — trước đây
  // cố định cao 624 / màn − 140 nên trên điện thoại đè nav, lọt xuống dưới thanh nút). Rộng / cao làm tròn xuống
  // bội số bước răng cưa (--step 22 px): mask răng cưa co giãn ô cho vừa, không chia hết là hàng lỗ mép dưới lệch
  // khỏi mép -> trông như răng cưa ngược.
  const PERF_STEP = 22
  function chatSize() {
    const cs = getComputedStyle(lb)
    const bar = q('.g3-bar')
    const air = innerWidth < 600 ? 12 : 24
    const free = innerHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0) - (bar.offsetHeight || 60) - (parseFloat(getComputedStyle(bar).marginTop) || 14) - air * 2
    const snap = (v) => Math.floor(v / PERF_STEP) * PERF_STEP
    return [snap(Math.min(920, innerWidth - 32)), snap(Math.max(264, Math.min(624, free)))]
  }
  function openChat() {
    if (!lbItem || lbBusy || !msgOn) return
    chatOpen = true
    hideNotes()
    chatAt = Date.now()
    setFrameSize(...chatSize(), !reduceMotion)
    flipCard(true)
    lb.classList.add('is-chat')
    chatEl.inert = false
    chatBtn.setAttribute('aria-pressed', 'true')
    renderWall(null)
    chatStatus.textContent = ''
    const key = lbItem.key
    loadWall(key)
    clearInterval(chatPoll)
    chatPoll = setInterval(() => chatOpen && loadWall(key), 15000)
    setTimeout(() => chatOpen && chatName.focus({ preventScroll: true }), reduceMotion ? 0 : FLIP_MS)
  }
  function closeChat() {
    if (!chatOpen) return
    chatOpen = false
    clearInterval(chatPoll)
    setFrameSize(frontSize.w, frontSize.h, !reduceMotion)
    // quay về mặt ảnh: rải lại note (có cả lời vừa gửi) khi khung đã thu về cỡ ảnh
    if (lbItem && !lbBusy) {
      const item = lbItem
      setTimeout(() => lbOpen && !chatOpen && lbItem === item && showNotes(item, lbFrame.getBoundingClientRect(), 0), reduceMotion ? 0 : FLIP_MS)
    }
    flipCard(false)
    lb.classList.remove('is-chat')
    chatEl.inert = true
    chatBtn.setAttribute('aria-pressed', 'false')
  }
  on(chatBtn, 'click', () => (chatOpen ? closeChat() : openChat()))
  on(q('[data-g3-form]'), 'submit', async (e) => {
    e.preventDefault()
    if (!msgOn || !lbItem || sending) return
    const name = chatName.value.trim().slice(0, 40)
    const text = chatText.value.trim().slice(0, 500)
    if (!text) {
      chatStatus.textContent = 'Write a few words first.'
      chatText.focus()
      return
    }
    sending = true
    chatSend.disabled = true
    chatStatus.textContent = 'Sending…'
    const key = lbItem.key
    const k = msgKey({ name, text })
    const done = () => {
      unsure = null
      chatText.value = ''
      chatStatus.textContent = 'Sent.'
      chatLocal.unshift({ image: key, name: name || 'Anonymous', text, avatar, createdAt: Date.now() })
      if (chatOpen && lbItem?.key === key) loadWall(key)
      try {
        localStorage.setItem('ic-name', name)
      } catch {}
    }
    try {
      // lần trước báo lỗi mà gửi lại y nguyên: Sheet chậm có khi vẫn đã ghi -> xem trên Sheet trước (bỏ qua bộ đệm)
      if (unsure && unsure.key === key && unsure.k === k) {
        const r0 = await fetch(`${MSG_API}?image=${encodeURIComponent(key)}&fresh=${Date.now()}`)
        const j0 = await r0.json().catch(() => ({}))
        if ((j0.messages || []).some((m) => msgKey(m) === k)) return done()
      }
      const r = await fetch(MSG_API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ image: key, name, text, avatar, hp: chatHp?.value || '', t: Date.now() - chatAt }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || !j.ok) throw Object.assign(new Error(), { code: j.error })
      done()
    } catch (err) {
      if (err.code !== 'rate_limited') unsure = { key, k }
      chatStatus.textContent = err.code === 'rate_limited' ? 'Too many messages — try again in a few minutes.' : 'Could not send. Try again in a few seconds.'
    } finally {
      sending = false
      chatSend.disabled = false
    }
  })
  try {
    chatName.value = localStorage.getItem('ic-name') || ''
  } catch {}

  // ---------- note lời nhắn rải hai bên tem (Figma 688:48951) ----------
  // Lấy các lời nhắn của ảnh (tối đa MAX_NOTES, mới nhất trước), dựng mẩu giấy 176 px, đặt vào khoảng
  // trống hai bên tem: thử nhiều chỗ ngẫu nhiên (hạt giống theo ảnh -> mỗi ảnh một bố cục cố định),
  // chọn chỗ ít đè lên note khác nhất, xen phải / trái, nghiêng ±2…7°. Không đủ chỗ (màn hẹp) thì bỏ.
  // Bấm một note = lật sang mặt lời nhắn để đọc hết.
  const MAX_NOTES = 8
  const NOTE_EMOJI = ['🥃', '🤵‍♂️', '💃', '🌿', '🍵', '🔥', '🌼', '🎧', '🍻', '🫶', '🌙', '🍃', '📸', '🏕️', '✨']
  const notesBox = q('[data-g3-notes]')
  let notesToken = 0
  let notesFor = null
  function noteEl(m) {
    const a = document.createElement('article')
    const NOTE_BG = ['cream', 'beige', 'white', 'slate', 'green']
    a.className = `g3-pn g3-pn--${NOTE_BG[hashString(`${m.text}|${m.name}|bg`) % NOTE_BG.length]}`
    a.innerHTML = '<div class="g3-pn__sheet"><img class="g3-pn__holes" src="assets/img/gallery/note-holes.svg" width="154" height="10" alt=""><div class="g3-pn__body"><p></p><p class="g3-pn__text"></p><p></p></div></div>'
    const torn = tearPaths(hashString(`${m.name}|${m.text}|tear`))
    a.style.setProperty('--tear', torn.tear)
    a.style.setProperty('--tear-fiber', torn.fiber)
    if (torn.side === 'bottom') a.classList.add('g3-pn--tear-b') // rách to ở mép dưới: đệm đáy gấp đôi
    const [emo, text, name] = a.querySelectorAll('.g3-pn__body p')
    // avatar người viết chọn; lời nhắn cũ (chưa có avatar) lấy emoji theo nội dung
    emo.textContent = AVATARS.includes(m.avatar) ? m.avatar : NOTE_EMOJI[hashString(`${m.name}|${m.text}`) % NOTE_EMOJI.length]
    text.textContent = String(m.text || '').slice(0, 220)
    name.textContent = String(m.name || 'Anonymous').slice(0, 40)
    a.addEventListener('click', (e) => {
      e.stopPropagation()
      openChat()
    })
    return a
  }
  // Vân giấy: một ô 160 px dựng bằng canvas (hạt li ti + vài sợi xơ), dùng chung cho mọi note —
  // bản sáng trộn multiply lên giấy sáng, bản xám giữa trộn overlay lên giấy tối.
  function paperTiles() {
    if (notesBox.style.getPropertyValue('--g3-paper')) return
    const N = 160
    const make = (base, spread, fiberAlpha, fiberShade) => {
      const c = document.createElement('canvas')
      c.width = c.height = N
      const x = c.getContext('2d')
      const img = x.createImageData(N, N)
      for (let i = 0; i < img.data.length; i += 4) {
        const v = base + (Math.random() - 0.5) * spread
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v
        img.data[i + 3] = 255
      }
      x.putImageData(img, 0, 0)
      x.lineCap = 'round'
      for (let i = 0; i < 46; i++) {
        const px = Math.random() * N
        const py = Math.random() * N
        const a = Math.random() * Math.PI
        const len = 4 + Math.random() * 14
        x.strokeStyle = `rgba(${fiberShade}, ${fiberShade}, ${fiberShade}, ${fiberAlpha * (0.4 + Math.random() * 0.6)})`
        x.lineWidth = 0.6 + Math.random() * 0.6
        x.beginPath()
        x.moveTo(px, py)
        x.quadraticCurveTo(px + Math.cos(a + 0.6) * len * 0.5, py + Math.sin(a + 0.6) * len * 0.5, px + Math.cos(a) * len, py + Math.sin(a) * len)
        x.stroke()
      }
      return `url(${c.toDataURL('image/png')})`
    }
    notesBox.style.setProperty('--g3-paper', make(244, 22, 0.35, 150))
    notesBox.style.setProperty('--g3-paper-dark', make(128, 34, 0.3, 190))
  }
  // Mép rách: cả 4 cạnh răng cưa ngẫu nhiên theo hạt giống — MỘT cạnh rách to (dưới / trái / phải, sâu
  // 3–7 px, thỉnh thoảng vết sâu), 3 cạnh còn lại sờn nhỏ (0.5–2 px). Lớp xơ giấy rách nông hơn tờ giấy
  // 2.5 px ở cạnh to -> lộ viền xơ sáng như giấy màu bị xé. Trả về { tear, fiber, side } (clip-path).
  function tearPaths(seed) {
    let r = seed || 7
    const rand = () => ((r = (r * 16807) % 2147483647), r / 2147483647)
    const side = ['bottom', 'bottom', 'right', 'left'][Math.floor(rand() * 4)]
    const edge = (big) => {
      const n = big ? 18 + Math.floor(rand() * 8) : 14 + Math.floor(rand() * 8)
      const depth = big ? 3 + rand() * 4 : 0.5 + rand() * 1.5
      const pts = []
      for (let i = 0; i <= n; i++) {
        const d = depth * (0.25 + rand() * 0.75) + (big && rand() < 0.12 ? rand() * 4 : 0) // cạnh to: thỉnh thoảng một vết sâu
        pts.push([(i / n) * 100, d])
      }
      return pts
    }
    const E = { top: edge(false), right: edge(side === 'right'), bottom: edge(side === 'bottom'), left: edge(side === 'left') }
    const poly = (extra) => {
      const cut = (k, d) => Math.max(0, d - (k === side ? extra : Math.min(extra, 0.4))).toFixed(1)
      const top = E.top.map(([t, d]) => `${t.toFixed(1)}% ${cut('top', d)}px`)
      const right = E.right.map(([t, d]) => `calc(100% - ${cut('right', d)}px) ${t.toFixed(1)}%`)
      const bottom = E.bottom.slice().reverse().map(([t, d]) => `${t.toFixed(1)}% calc(100% - ${cut('bottom', d)}px)`)
      const left = E.left.slice().reverse().map(([t, d]) => `${cut('left', d)}px ${t.toFixed(1)}%`)
      return `polygon(${[...top, ...right, ...bottom, ...left].join(', ')})`
    }
    return { tear: poly(0), fiber: poly(2.5), side }
  }
  function hideNotes() {
    notesToken++
    notesFor = null
    for (const n of [...notesBox.children]) {
      if (reduceMotion) n.remove()
      else n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' }).finished.then(() => n.remove(), () => {})
    }
  }
  async function showNotes(item, frame, delay) {
    const token = ++notesToken
    notesBox.replaceChildren()
    if (!item) return
    // mở ảnh lúc lời nhắn chưa bật xong (vài giây đầu vào trang) thì đợi — trước đây bỏ luôn, ảnh đó không có note
    if (!msgOn && !(await msgReady)) return
    let list = []
    try {
      list = await getMessages(item.key)
    } catch {}
    const seen = new Set(list.map(msgKey))
    const all = uniqMsgs([...chatLocal.filter((m) => m.image === item.key && !seen.has(msgKey(m))), ...list])
    list = all.slice(0, MAX_NOTES)
    if (token !== notesToken || !lbOpen || chatOpen || lbItem !== item || !list.length) return
    notesFor = item
    paperTiles()
    // màn hẹp (điện thoại) không còn chỗ dán note quanh tem -> nhãn "N messages on this photo" phía trên tem,
    // bấm vào là lật sang mặt lời nhắn
    if (!placeNotes(list.map(noteEl), item, frame, delay)) countTag(all.length, frame, delay)
  }
  function countTag(n, frame, delay) {
    const tag = document.createElement('button')
    tag.type = 'button'
    tag.className = 'g3-count'
    tag.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5a8.5 8.5 0 0 0-7.4 12.7L3.5 20.5l4.4-1.1A8.5 8.5 0 1 0 12 3.5Z"/><path d="M8.5 10.5h7M8.5 14h4.5"/></svg><span>${n} message${n > 1 ? 's' : ''} on this photo</span>`
    notesBox.appendChild(tag)
    // phía trên tem nếu đủ chỗ (dưới thanh nav); ảnh dọc cao không còn chỗ thì dán vào trong ảnh — qua hẳn lề
    // giấy răng cưa (PERF.margin) thêm 16 px, không chạm mép tem
    const top = parseFloat(getComputedStyle(lb).paddingTop) || 76
    const h = tag.offsetHeight
    const y = frame.top - 14 - h >= top - 8 ? frame.top - 14 - h : frame.top + PERF.margin + 16
    tag.style.transform = `translate(${Math.round(frame.left + frame.width / 2 - tag.offsetWidth / 2)}px, ${Math.round(y)}px)`
    tag.addEventListener('click', (e) => {
      e.stopPropagation()
      openChat()
    })
    if (!reduceMotion) tag.animate([{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 420, delay, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: 'backwards' })
  }
  function placeNotes(els, item, frame, delay) {
    const vw = innerWidth
    const vh = innerHeight
    const gap = 28
    const edge = 16
    const top = parseFloat(getComputedStyle(lb).paddingTop) || 92
    const bottom = vh - 24
    els.forEach((n) => ((n.style.visibility = 'hidden'), notesBox.appendChild(n)))
    const placed = []
    let rnd = hashString(item.key) || 1
    const rand = () => ((rnd = (rnd * 16807) % 2147483647), rnd / 2147483647)
    const sides = {
      right: [frame.right + gap, vw - edge],
      left: [edge, frame.left - gap],
    }
    let k = 0
    // Note dán CHỒNG thành cụm (note sau đè lên góc giấy của note trước, như ảnh mẫu của Kaixa) nhưng
    // không bao giờ che CHỮ: vùng cấm = từng dòng chữ thật (emoji · từng dòng lời · tên, đo bằng Range,
    // nới 10 px cho độ nghiêng). Mỗi note bị che tối đa ~45 % diện tích. Chấm điểm: thưởng phần đè lên
    // giấy note khác (cho tụm lại), ưu tiên gần tem.
    const PAD = 10 // hai note cùng nghiêng ±7° lệch nhau tới ~10 px ở góc
    const inter = (a, b) => {
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
      return ox > 0 && oy > 0 ? ox * oy : 0
    }
    const range = document.createRange()
    for (const n of els) {
      const w = n.offsetWidth
      const h = n.offsetHeight
      // các dòng chữ của note này (toạ độ trong note)
      const nr = n.getBoundingClientRect()
      const lines = []
      for (const para of n.querySelectorAll('.g3-pn__body p')) {
        range.selectNodeContents(para)
        for (const r of range.getClientRects()) if (r.width && r.height) lines.push({ x: r.left - nr.left - PAD, y: r.top - nr.top - PAD, w: r.width + PAD * 2, h: r.height + PAD * 2 })
      }
      const order = k % 2 ? ['left', 'right'] : ['right', 'left']
      // khoảng một nửa số note dán ĐÈ lên mép ảnh: 20–40 % bề ngang note nằm trong tem (dải x khoá chặt để
      // chắc chắn đè); không có chỗ (che chữ note khác) thì đặt ra ngoài như thường
      const inMax = rand() < 0.5 ? w * (0.2 + rand() * 0.2) : 0
      const search = (edgeIn) => {
        let found = null
        for (const side of order) {
          let [x0, x1] = sides[side]
          if (edgeIn) {
            if (side === 'right') ((x0 = frame.right - edgeIn), (x1 = frame.right - edgeIn * 0.4 + w))
            else ((x1 = frame.left + edgeIn), (x0 = frame.left + edgeIn * 0.4 - w))
            x0 = Math.max(x0, edge)
            x1 = Math.min(x1, vw - edge)
          }
          if (x1 - x0 < w || bottom - top < h) continue
          for (let t = 0; t < 90; t++) {
            const x = x0 + rand() * (x1 - x0 - w)
            const y = top + rand() * (bottom - top - h)
            const me = { x, y, w, h }
            let hit = 0
            let over = 0
            let cover = 0
            for (const p of placed) {
              for (const l of p.lines) hit += inter(me, l) // che chữ note dưới: cấm
              const o = inter(me, p)
              over += o
              cover = Math.max(cover, o / (p.w * p.h))
            }
            if (hit || cover > 0.45) continue
            // ưu tiên chỗ gần tem (note bám quanh ảnh như dán lên); thưởng phần đè lên giấy note khác
            const near = side === 'right' ? x - x0 : x1 - (x + w)
            const score = near * 0.5 - over * 0.03
            if (!found || score < found.score) found = { x, y, w, h, score, side, lines: lines.map((l) => ({ x: x + l.x, y: y + l.y, w: l.w, h: l.h })) }
          }
          if (found) break // bên này có chỗ
        }
        return found
      }
      const best = (inMax && search(inMax)) || search(0)
      if (!best) {
        n.remove() // hết chỗ không che chữ
        continue
      }
      placed.push(best)
      const sign = rand() < 0.5 ? -1 : 1
      const rot = sign * (2 + rand() * 5)
      n.style.transform = `translate(${best.x}px, ${best.y}px) rotate(${rot.toFixed(2)}deg)`
      n.style.visibility = ''
      if (!reduceMotion) {
        // bay ra từ sau tem
        const fx = frame.left + frame.width / 2 - (best.x + w / 2)
        const fy = frame.top + frame.height / 2 - (best.y + h / 2)
        n.animate(
          [
            { opacity: 0, transform: `translate(${best.x + fx * 0.6}px, ${best.y + fy * 0.6}px) rotate(0deg) scale(0.6)` },
            { opacity: 1, transform: n.style.transform },
          ],
          { duration: 620, delay: delay + k * 70, easing: 'cubic-bezier(.2, 1.25, .35, 1)', fill: 'backwards' },
        )
      }
      k++
    }
    return placed.length
  }
  // đổi cỡ cửa sổ lúc đang mở: rải lại theo khung mới
  let notesRz = 0
  on(window, 'resize', () => {
    clearTimeout(notesRz)
    notesRz = setTimeout(() => {
      if (lbOpen && chatOpen) setFrameSize(...chatSize(), false)
      else if (lbOpen && notesFor) showNotes(notesFor, lbFrame.getBoundingClientRect(), 0)
    }, 250)
  })

  const toastEl = q('[data-g3-toast]')
  let toastT = 0
  function toast(msg) {
    toastEl.textContent = msg
    toastEl.hidden = false
    clearTimeout(toastT)
    toastT = setTimeout(() => (toastEl.hidden = true), 3000)
  }

  // ---------- bướm bay ----------
  // Bướm của trang chủ (cùng ảnh cánh butterfly-top.webp, cách dựng hai cánh + vỗ cánh như chande-flyer.js), sống
  // trong không gian này: lượn tới một điểm ngẫu nhiên trong khung nhìn (cách camera 26–42 đơn vị), vài giây đổi
  // điểm; camera bay thì bướm bay theo nhưng tụt lại một chút cho có quán tính. Đầu hướng theo đường bay, nghiêng
  // cánh khi rẽ, bay nhanh thì vỗ cánh nhanh. Nằm giữa các tem nên tem gần hơn che được bướm.
  const BF_IMG = new URL('../img/home/butterfly-top.webp', import.meta.url).href
  const BF_ASPECT = 764 / 1024 // cao / rộng ảnh
  const BF_SPAN = 4.6 // sải cánh (đơn vị không gian; tem cao ~17–31)
  const BF_SPEED = 16 // tốc độ lượn tối đa (đơn vị / s, so với camera)
  function buildButterfly() {
    const group = new THREE.Group()
    const tex = new THREE.TextureLoader().load(BF_IMG)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 4
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, depthWrite: false, fog: false })
    const geos = []
    const half = (sd) => {
      const geo = new THREE.PlaneGeometry(0.5, BF_ASPECT)
      geo.translate(sd > 0 ? -0.25 : 0.25, 0, 0)
      const uv = geo.attributes.uv
      for (let i = 0; i < uv.count; i++) uv.setX(i, sd > 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
      geo.rotateZ(-Math.PI / 2)
      geos.push(geo)
      const pivot = new THREE.Group()
      pivot.add(new THREE.Mesh(geo, mat))
      group.add(pivot)
      return { pivot, sd }
    }
    const wings = [half(1), half(-1)]
    const bodyMat = new THREE.MeshBasicMaterial({ color: '#4c4a2a', fog: false })
    const bodyGeo = new THREE.CapsuleGeometry(0.014, 0.22, 4, 8)
    const headGeo = new THREE.SphereGeometry(0.019, 10, 8)
    const body = new THREE.Mesh(bodyGeo, bodyMat)
    body.rotation.z = Math.PI / 2
    body.position.set(-0.07, 0, 0.012)
    const head = new THREE.Mesh(headGeo, bodyMat)
    head.position.set(0.055, 0, 0.014)
    group.add(body, head)
    group.renderOrder = 1
    let ph = 0
    function flap(dt, rate) {
      ph = (ph + dt * rate) % 1
      const e = ph < 0.42 ? ph / 0.42 : 1 - (ph - 0.42) / 0.58
      const k = e * e * (3 - 2 * e)
      const lift = -0.12 + 1.15 * k
      for (const { pivot, sd } of wings) pivot.rotation.x = sd * lift
    }
    flap(0, 0)
    const dispose = () => {
      tex.dispose()
      mat.dispose()
      bodyMat.dispose()
      for (const g of [...geos, bodyGeo, headGeo]) g.dispose()
    }
    return { group, flap, dispose }
  }
  const bf = { obj: null, rel: new THREE.Vector3(), vel: new THREE.Vector3(), off: new THREE.Vector3(), next: 0, yaw: 0, bank: 0, lastCam: new THREE.Vector3(), t: 0 }
  function bfSync() {
    const want = !reduceMotion && CONFIG.layout.butterfly !== 'off'
    if (want && !bf.obj) {
      bf.obj = buildButterfly()
      scene.add(bf.obj.group)
      // bay vào từ mép trái màn
      const D = 34
      bf.rel.set(-1.25 * (VIEW_TAN2 / 2) * camera.aspect * D, -0.1 * D, -D)
      bf.vel.set(BF_SPEED * 0.6, 0, 0)
      bf.next = 0
      bf.lastCam.copy(camera.position)
    } else if (!want && bf.obj) {
      scene.remove(bf.obj.group)
      bf.obj.dispose()
      bf.obj = null
    }
    if (bf.obj) bf.obj.group.scale.setScalar(BF_SPAN * clamp(+CONFIG.layout.bfSize || 1, 0.5, 2))
  }
  const tmpV = new THREE.Vector3()
  function bfTick(dt, now) {
    if (!bf.obj) return
    const ty = VIEW_TAN2 / 2
    const tx = ty * camera.aspect
    if (now > bf.next || tmpV.copy(bf.off).sub(bf.rel).length() < 2.5) {
      const D = 26 + Math.random() * 16
      bf.off.set((Math.random() * 2 - 1) * 0.6 * tx * D, (Math.random() * 2 - 1) * 0.45 * ty * D, -D)
      bf.next = now + 2600 + Math.random() * 3400
    }
    // camera bay: bướm tụt lại 25% quãng camera vừa đi (rồi tự đuổi theo)
    tmpV.copy(camera.position).sub(bf.lastCam)
    bf.lastCam.copy(camera.position)
    const camSpeed = tmpV.length() / Math.max(dt, 1e-3)
    bf.rel.addScaledVector(tmpV, -0.25)
    // lái về điểm đích (chậm dần khi tới gần)
    const to = tmpV.copy(bf.off).sub(bf.rel)
    const dist = to.length()
    const max = BF_SPEED + camSpeed * 0.3
    to.multiplyScalar(dist > 1e-3 ? (max * Math.min(1, dist / 10)) / dist : 0)
    bf.vel.lerp(to, 1 - Math.exp(-dt * 2.2))
    bf.rel.addScaledVector(bf.vel, dt)
    bf.rel.z = Math.min(bf.rel.z, -12) // không bay ra sau camera
    // đầu theo đường bay trên mặt màn, nghiêng cánh khi rẽ
    const sp = Math.hypot(bf.vel.x, bf.vel.y)
    if (sp > 0.4) {
      const yaw = Math.atan2(bf.vel.y, bf.vel.x)
      let dy = yaw - bf.yaw
      dy = Math.atan2(Math.sin(dy), Math.cos(dy))
      bf.yaw += dy * (1 - Math.exp(-dt * 5))
      bf.bank = lerp(bf.bank, clamp(-dy * 1.4, -0.7, 0.7), 1 - Math.exp(-dt * 4))
    }
    bf.t += dt
    const g = bf.obj.group
    g.position.copy(camera.position).add(bf.rel)
    g.position.y += Math.sin(bf.t * 5.5) * 0.25 // nhấp nhô theo nhịp cánh
    g.rotation.set(0, 0, bf.yaw)
    g.rotateX(bf.bank)
    bf.obj.flap(dt, 1.3 + Math.min(1, (sp + camSpeed * 0.2) / BF_SPEED) * 2.4)
  }

  // ---------- ảnh đè nhau (bố cục 'edge' / 'none') ----------
  // Đè nhau là chuyện trên màn: tem gần che tem xa tuỳ chỗ camera đứng. Mỗi 2 khung, chiếu khung tờ giấy của
  // các tem đang hiện lên màn, xét từ gần ra xa: tem gần luôn được giữ; tem xa hơn bị che quá ngưỡng (theo tỉ lệ
  // tem nhỏ hơn), hoặc làm cụm đè vượt số ảnh cho phép, thì mờ đi — camera dịch đi là nó hiện lại. Ngưỡng hiện
  // lại chặt hơn ngưỡng giữ để tem không chớp tắt ở sát ngưỡng.
  const OVERLAP = {
    edge: { show: 0.18, keep: 0.3, touch: 0.01, max: 3 },
    none: { show: 0, keep: 0.03, touch: Infinity, max: Infinity },
    // ảnh thường với nhau như 'none'; có ảnh chính trong cặp thì được che tới ~40% tem nhỏ hơn
    hero: { show: 0, keep: 0.03, hShow: 0.3, hKeep: 0.42, touch: 0.01, minFill: 0.15 },
  }
  // tránh thẳng hàng: hai tem đứng gần nhau (trên dưới / cạnh nhau, khe hở < 80% tem nhỏ hơn) mà mép trái, mép
  // phải hoặc tâm (theo chiều ngang; cạnh nhau thì mép trên / dưới / tâm dọc) lệch nhau ít hơn ngưỡng (theo bề tem
  // nhỏ hơn) thì trông như cố căn mà căn hụt -> lệch thì phải lệch hẳn. Ngưỡng hiện lại lớn hơn ngưỡng giữ.
  const ALIGN = { keep: 0.18, show: 0.26, near: 0.8 }
  function aligned(c, k, t) {
    const w = Math.min(c.x1 - c.x0, k.x1 - k.x0)
    const h = Math.min(c.y1 - c.y0, k.y1 - k.y0)
    if (Math.min(c.x1, k.x1) > Math.max(c.x0, k.x0) && Math.max(c.y0, k.y0) - Math.min(c.y1, k.y1) < h * ALIGN.near) {
      const T = w * t
      if (Math.abs(c.x0 - k.x0) < T || Math.abs(c.x1 - k.x1) < T || Math.abs(c.x0 + c.x1 - k.x0 - k.x1) / 2 < T) return true
    }
    if (Math.min(c.y1, k.y1) > Math.max(c.y0, k.y0) && Math.max(c.x0, k.x0) - Math.min(c.x1, k.x1) < w * ALIGN.near) {
      const T = h * t
      if (Math.abs(c.y0 - k.y0) < T || Math.abs(c.y1 - k.y1) < T || Math.abs(c.y0 + c.y1 - k.y0 - k.y1) / 2 < T) return true
    }
    return false
  }
  const cand = []
  let olFrame = 0
  function resolveOverlap() {
    const mode = OVERLAP[CONFIG.layout.overlap]
    const align = CONFIG.layout.align !== 'free'
    if (!mode && !align) return
    if ((olFrame = (olFrame + 1) & 1)) return
    const camX = camera.position.x
    const camY = camera.position.y
    const camZ = camera.position.z
    const ty = VIEW_TAN2 / 2
    const tx = ty * camera.aspect
    cand.length = 0
    for (const c of chunks.values())
      for (const p of c.planes) {
        if (!p.on || p.mesh === lbMesh) continue
        const d = camZ - p.z
        if (d <= 1) continue
        const hw = p.bw / 2 / d
        const hh = p.bh / 2 / d
        const u = (p.x - camX) / d
        const v = (p.y - camY) / d
        if (Math.abs(u) - hw > tx || Math.abs(v) - hh > ty) continue // ngoài màn
        cand.push({ p, d, x0: u - hw, x1: u + hw, y0: v - hh, y1: v + hh, area: 4 * hw * hh, root: null, n: 1, hero: false, hits: 0 })
      }
    cand.sort((a, b) => a.d - b.d)
    if (mode === OVERLAP.hero) return resolveHeroes(mode, ty, align)
    const kept = []
    const find = (k) => {
      while (k.root) k = k.root
      return k
    }
    for (const c of cand) {
      const at = c.p.block ? ALIGN.show : ALIGN.keep
      let ok = true
      const roots = new Set()
      for (const k of kept) {
        if (align && aligned(c, k, at)) {
          ok = false
          break
        }
        if (!mode) continue
        const thr = c.p.block ? mode.show : mode.keep
        const ox = Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0)
        if (ox <= 0) continue
        const oy = Math.min(c.y1, k.y1) - Math.max(c.y0, k.y0)
        if (oy <= 0) continue
        const f = (ox * oy) / Math.min(c.area, k.area)
        if (f > thr) {
          ok = false
          break
        }
        if (f > mode.touch) roots.add(find(k))
      }
      if (ok && mode && roots.size) {
        let n = 1
        for (const r of roots) n += r.n
        ok = n <= mode.max
        if (ok)
          for (const r of roots) {
            r.root = c
            c.n += r.n
          }
      }
      c.p.block = !ok
      if (ok) kept.push(c)
    }
  }
  // 'hero': chọn vài tem to nhất trên màn làm ảnh chính (đang là ảnh chính thì được cộng 30% cho khỏi đổi qua
  // đổi lại), xét ảnh chính trước rồi tới các ảnh khác từ gần ra xa. Ảnh thường đè ảnh thường -> mờ; đè ảnh
  // chính thì được, miễn ảnh chính đó chưa đủ số ảnh bị đè và phần che không quá ngưỡng.
  function resolveHeroes(mode, ty, align) {
    const L = CONFIG.layout
    const K = clamp(Math.round(+L.heroes || 2), 1, 4)
    const B = clamp(Math.round(+L.heroHits || 2), 1, 4)
    const rank = (c) => c.area * (c.p.hero ? 1.3 : 1)
    const big = cand.slice().sort((a, b) => rank(b) - rank(a))
    for (let i = 0; i < big.length && i < K; i++) {
      const c = big[i]
      if ((c.y1 - c.y0) / (2 * ty) < mode.minFill * (c.p.hero ? 0.85 : 1)) break // tem còn bé thì chưa là nhân vật chính
      c.hero = true
    }
    const kept = []
    for (const c of [...cand.filter((c) => c.hero), ...cand.filter((c) => !c.hero)]) {
      c.p.hero = c.hero
      let ok = true
      const hits = []
      const at = c.p.block ? ALIGN.show : ALIGN.keep
      for (const k of kept) {
        if (align && aligned(c, k, at)) {
          ok = false
          break
        }
        const ox = Math.min(c.x1, k.x1) - Math.max(c.x0, k.x0)
        if (ox <= 0) continue
        const oy = Math.min(c.y1, k.y1) - Math.max(c.y0, k.y0)
        if (oy <= 0) continue
        const f = (ox * oy) / Math.min(c.area, k.area)
        if (!c.hero && !k.hero) {
          if (f > (c.p.block ? mode.show : mode.keep)) ok = false
        } else if (f > (c.p.block ? mode.hShow : mode.hKeep)) ok = false
        else if (f > mode.touch) hits.push(k)
        if (!ok) break
      }
      // ngân sách đè: mỗi ảnh chính trong cặp còn chỗ (cặp hai ảnh chính thì tính cho cả hai)
      if (ok && hits.length) ok = hits.every((k) => !k.hero || k.hits < B) && (!c.hero || c.hits + hits.length <= B)
      if (ok)
        for (const k of hits) {
          k.hits++
          c.hits++
        }
      c.p.block = !ok
      if (ok) kept.push(c)
    }
  }

  // ---------- vòng chạy ----------
  let raf = 0
  let lastT = performance.now()
  function tick() {
    raf = requestAnimationFrame(tick)
    const now = performance.now()
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now
    if (keys.has('forward')) s.targetVel.z -= KEYBOARD_SPEED
    if (keys.has('backward')) s.targetVel.z += KEYBOARD_SPEED
    if (keys.has('left')) s.targetVel.x -= KEYBOARD_SPEED
    if (keys.has('right')) s.targetVel.x += KEYBOARD_SPEED
    if (keys.has('down')) s.targetVel.y -= KEYBOARD_SPEED
    if (keys.has('up')) s.targetVel.y += KEYBOARD_SPEED

    const isZooming = Math.abs(s.velocity.z) > 0.05
    const zoomFactor = clamp(s.basePos.z / 50, 0.3, 2.0)
    const driftAmount = 8.0 * zoomFactor
    const driftLerp = isZooming ? 0.2 : 0.12
    if (!s.isDragging) {
      const tx = isTouch ? 0 : s.mouse.x * driftAmount
      const ty = isTouch ? 0 : s.mouse.y * driftAmount
      s.drift.x = lerp(s.drift.x, tx, driftLerp)
      s.drift.y = lerp(s.drift.y, ty, driftLerp)
    }
    s.targetVel.z += s.scrollAccum
    s.scrollAccum *= 0.8
    for (const a of ['x', 'y', 'z']) {
      s.targetVel[a] = clamp(s.targetVel[a], -MAX_VELOCITY, MAX_VELOCITY)
      s.velocity[a] = lerp(s.velocity[a], s.targetVel[a], VELOCITY_LERP)
      s.basePos[a] += s.velocity[a]
    }
    camera.position.set(s.basePos.x + s.drift.x, s.basePos.y + s.drift.y, s.basePos.z)
    for (const a of ['x', 'y', 'z']) s.targetVel[a] *= VELOCITY_DECAY

    const cx = Math.floor(s.basePos.x / CHUNK_SIZE)
    const cy = Math.floor(s.basePos.y / CHUNK_SIZE)
    const cz = Math.floor(s.basePos.z / CHUNK_SIZE)
    Object.assign(cameraGrid, { cx, cy, cz, camZ: s.basePos.z })
    const key = `${cx},${cy},${cz}`
    if (key !== s.lastChunkKey) {
      s.pendingChunk = { cx, cy, cz }
      s.lastChunkKey = key
    }
    const throttle = Math.abs(s.velocity.z) > 1 ? 500 : isZooming ? 400 : 100
    if (s.pendingChunk && now - s.lastChunkUpdate >= throttle && media.length) {
      const p = s.pendingChunk
      s.pendingChunk = null
      s.lastChunkUpdate = now
      setChunksAround(p.cx, p.cy, p.cz)
    }
    frameNow = now
    stepIntro()
    resolveOverlap()
    for (const c of chunks.values()) for (const p of c.planes) updatePlane(c, p)
    checkHi(now)
    bfTick(dt, now)
    renderer.render(scene, camera)
  }

  q('[data-g3-empty]').hidden = media.length > 0
  if (media.length) setChunksAround(0, 0, 0)
  raf = requestAnimationFrame(tick)

  // đổi danh sách ảnh tại chỗ (ngăn Quản lý ảnh): dựng lại các khối, texture ảnh cũ vẫn giữ trong bộ đệm
  function setItems(list) {
    media = toMedia(list)
    for (const c of chunks.values()) destroyChunk(c)
    chunks.clear()
    q('[data-g3-empty]').hidden = media.length > 0
    if (media.length) setChunksAround(cameraGrid.cx, cameraGrid.cy, cameraGrid.cz)
  }

  // Quản lý ảnh: chỉ admin (chạy local hoặc đã mở ?admin=1 — cùng quy ước bảng setting)
  let admin = null
  let isAdmin = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/.test(location.hostname)
  try {
    isAdmin = isAdmin || localStorage.getItem('chande-admin') === '1'
  } catch {}
  if (isAdmin) {
    import(new URL(`./chande-g3-admin.js${new URL(import.meta.url).search}`, import.meta.url).href)
      .then((m) => {
        if (ac.signal.aborted) return
        admin = m.mountAdmin({
          el, config: CONFIG, getItems: () => items, setItems: (list) => ((items = list), setItems(list)),
          // đổi bố cục tại chỗ: sương theo chế độ ảnh xa, dựng lại các khối (mật độ / cỡ tem)
          layoutDefaults: LAYOUT_DEFAULTS,
          replayIntro: () => !reduceMotion && startIntro(),
          setLayout: (patch) => {
            const L = CONFIG.layout
            const rebuild = ['density', 'even', 'size', 'vary', 'tilt', 'seed'].some((k) => k in patch && patch[k] !== L[k])
            Object.assign(L, patch)
            applyFog()
            bfSync()
            if (!OVERLAP[L.overlap] && L.align === 'free') for (const c of chunks.values()) for (const p of c.planes) p.block = false
            if (!rebuild) return
            for (const c of chunks.values()) destroyChunk(c)
            chunks.clear()
            if (media.length) setChunksAround(cameraGrid.cx, cameraGrid.cy, cameraGrid.cz)
          },
        })
      })
      .catch((e) => console.warn('[chande-g3] không nạp được ngăn Quản lý ảnh:', e))
  }

  live = {
    el,
    stop() {
      ac.abort()
      cancelAnimationFrame(raf)
      clearTimeout(toastT)
      clearInterval(chatPoll)
      clearTimeout(notesRz)
      admin?.destroy?.()
      for (const c of chunks.values()) destroyChunk(c)
      chunks.clear()
      for (const e of textureCache.values()) e.tex?.dispose()
      textureCache.clear()
      for (const e of hiCache.values()) e.tex?.dispose()
      hiCache.clear()
      bf.obj?.dispose()
      PLANE_GEOMETRY.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
      canvas.remove()
      document.documentElement.classList.remove('g3-on')
    },
  }
}

function destroy() {
  live?.stop()
  live = null
}

window.CHANDE_G3 = { config: CONFIG, mount, destroy }
mount(document)
if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (live && data.current.container?.contains(live.el)) {
      destroy()
      window.CHANDE_TRANSITION?.lenis?.start()
    }
  })
}
