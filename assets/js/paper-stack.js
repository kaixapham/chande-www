// FILE SINH TỰ ĐỘNG từ paper-stack/src/runtime.js — ĐỪNG SỬA Ở ĐÂY.
// Sửa ở tool rồi chạy lại: node scripts/export-runtime.mjs <file này> ../vendor/three/three.module.min.js
// Khác bản gốc đúng một dòng: import three.

/**
 * Runtime của Paper Stack — toàn bộ phần "tờ giấy đáp xuống và cả chồng động dậy".
 *
 * File này CỐ TÌNH tự chứa: import duy nhất là three. Tool dùng nó để dựng preview,
 * còn khi xuất snippet nhúng thì `embed.js` đọc nguyên văn file này, chỉ đổi dòng
 * import sang CDN. Nhờ vậy cái nhúng vào site chạy đúng bằng cái đang xem trong tool —
 * không có hai bản logic để lệch nhau.
 *
 * Ba mảng chính, đọc theo thứ tự này sẽ hiểu cả file:
 *   1. `deform()` — hình học tờ giấy: uốn CUNG TRÒN (giữ nguyên chiều dài sợi giấy),
 *      mép trước chạm mặt phẳng rồi đường tiếp xúc quét dần về mép sau.
 *   2. `impact()` + `integrate()` — lò xo giảm chấn cho những tờ bị đè: mép xa VỖ lên
 *      (uốn bản lề, không xoay cứng nên không xuyên qua mặt bàn), trượt nhẹ theo đà
 *      của tờ vừa rơi, xoay nhẹ, và xê dịch một chút không về chỗ cũ.
 *   3. `head` — một con số duy nhất điều khiển mọi thứ: head = 2.5 nghĩa là hai tờ đã
 *      nằm yên, tờ thứ ba đang đáp được nửa đường. Snap hay scroll liên tục chỉ là hai
 *      cách đẩy con số đó.
 */

import * as THREE from '../vendor/three/three.module.min.js'

/* ------------------------------------------------------------------ tham số */

export const RATIOS = {
  '4:5': [4, 5],
  '1:1': [1, 1],
  '3:4': [3, 4],
  '6:7': [6, 7],
  '9:16': [9, 16],
  '16:9': [16, 9],
  '3:2': [3, 2],
}

export const EASINGS = [
  ['linear', 'Linear'],
  ['sine', 'Sine — rất nhẹ'],
  ['power2', 'Power2 — mềm'],
  ['power3', 'Power3 — mặc định'],
  ['power4', 'Power4 — dứt khoát'],
  ['expo', 'Expo — bắn rất nhanh'],
  ['circ', 'Circ — tròn đều'],
  ['back', 'Back — vượt rồi lùi'],
]

export const EASE_MODES = [
  ['hold', 'Hold — nhảy cóc'],
  ['in', 'Ease in — nhanh dần'],
  ['out', 'Ease out — chậm dần'],
  ['inOut', 'Ease in and out'],
]

/** Mặc định của runtime. state.js của tool phủ thêm phần `output` lên trên. */
export const RUNTIME_DEFAULTS = {
  // bgImage (chande-www thêm): ảnh nằm phẳng trên mặt bàn, phủ kín khung; '' = chỉ màu bg
  frame: { ratio: '4:5', cw: 4, ch: 5, bg: '#171717', margin: 0.06, bgImage: '' },
  stack: { size: 0.74, thickness: 0.007, scatter: 0.3, startLaid: true },
  // groupStagger (chande-www thêm): các tờ "cùng lượt" rơi lệch nhau bao nhiêu (phần một nấc)
  entry: { from: 42, travel: 1.2, lift: 0.5, tilt: 24, spin: 7, air: 0.42, flySpeed: 1, fade: 0, groupStagger: 0.18 },
  curl: { bend: 88, twist: 0.16, cross: 0.35, flutter: 0.55, flutterFreq: 7 },
  physics: { push: 1, decay: 0.55, freq: 3.2, damping: 0.24, slide: 0.35, nudge: 0.12, yaw: 0.6, dip: 0.5 },
  motion: { mode: 'snap', anim: 1150, easing: 'power2', easeMode: 'inOut', sensitivity: 1, damping: 240, glide: 420, queue: 1 },
  /*
   * Lực cuộn → chuyến bay của tờ giấy.
   * `ref` là tổng delta (px) trong cửa sổ ~140ms ứng với lực 1× — một nấc con lăn chuột
   * đúng bằng 120px, nên mặc định 120 là "cuộn bình thường = 1×". Các khoá còn lại là
   * ĐỘ GHÉP: 0 = lực không ảnh hưởng gì tới đại lượng đó, 1 = ảnh hưởng đủ.
   */
  force: {
    on: true, ref: 120, min: 0.5, max: 2.2, latch: 80,
    speed: 0.6, travel: 0.5, lift: 0.7, spin: 0.9, push: 0.8, bend: 0.4,
  },
  camera: { tilt: 24, yaw: 0, fov: 30 },
  light: { key: 1.4, azimuth: 318, elevation: 54, ambient: 0.6, shadow: 0.5, softness: 2.6, fill: 0.22 },
  paper: { roughness: 0.86, back: '#E8E2D6', segments: 40 },
  /*
   * Cảnh sau: chồng poster bày xong thì một chùm vòng tròn đồng tâm nở ra từ giữa đáy
   * viewport, màu cuối cùng trùm kín màn hình. Nó là MỘT NẤC `head` nữa (n → n+1), nhờ
   * vậy cuộn tay, thanh tua, video xuất ra và snippet nhúng đều tự chạy nó, không cần
   * đường điều khiển riêng.
   */
  outro: {
    on: true,
    colors: ['#0B0B0B', '#C8F08A', '#FFFFFF', '#1D4A2B', '#C8F08A', '#5BE83B', '#FDFBF4'],
    originX: 0.5,
    originY: 0,
    stagger: 0.05,
    hold: 0.14,
    scale: 1.06,
    dur: 2200,
    lead: 320,
    easing: 'linear',
    easeMode: 'out',
  },
}

/** Mặc định của một tờ: vị trí trên artboard tính theo phần khung (-0.5…0.5). */
// together (chande-www thêm): true = rơi CÙNG NẤC cuộn với tờ ngay trước (nhiều ảnh một lượt)
export const SHEET_DEFAULTS = { x: 0, y: 0, rot: 0, scale: 1, from: null, together: false }

/* ------------------------------------------------------------------ tiện ích */

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
const clamp01 = (v) => clamp(v, 0, 1)
const lerp = (a, b, t) => a + (b - a) * t
const RAD = Math.PI / 180

const BASE = {
  linear: (t) => t,
  sine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  power2: (t) => t * t,
  power3: (t) => t * t * t,
  power4: (t) => t * t * t * t,
  expo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  circ: (t) => 1 - Math.sqrt(1 - t * t),
  back: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
}

/** Họ đường cong × chiều, ghép ra đúng danh sách của Figma ("Ease out back"…). */
export function easeCurve(kind, mode, t) {
  const x = clamp01(t)
  if (mode === 'hold') return x >= 1 ? 1 : 0
  const f = BASE[kind] || BASE.power3
  if (kind === 'linear') return x
  if (mode === 'in') return f(x)
  if (mode === 'out') return 1 - f(1 - x)
  return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2
}

/*
 * Ánh xạ thời gian → tiến độ `q` của MỘT lượt đáp.
 *
 * Chặng bay chiếm `fly` ms và ứng với q ∈ [0, air]; chặng trải chiếm `lay` ms và ứng với
 * q ∈ [air, 1]. Trong mỗi chặng, q chạy THẲNG theo thời gian — đường cong easing chỉ
 * được áp MỘT lần, ở lúc tính `ap`/`pr` trong update().
 *
 * Trước đây `head` đã bị ease rồi update() lại ease lần nữa: ease∘ease làm power3/out
 * dồn 86% quãng bay vào 20% thời gian đầu. Tách `fly` khỏi `lay` vừa cho ra tham số
 * "tốc độ bay" vừa dọn luôn cái ease hai lần đó.
 */
function phaseU(t, fly, lay, air) {
  if (t <= 0) return 0
  if (fly > 0 && t < fly) return air * (t / fly)
  const r = lay > 0 ? clamp01((t - fly) / lay) : 1
  return air + (1 - air) * r
}

/** Thời lượng hai chặng của một lượt, tính theo tham số + lực đã chốt. */
function phaseTimes(params, force, fmulFn) {
  const air = clamp(params.entry.air, 0.02, 0.95)
  const base = Math.max(60, params.motion.anim) / (fmulFn ? fmulFn(force, 'speed') : 1)
  const fly = (base * air) / Math.max(0.1, params.entry.flySpeed)
  const lay = base * (1 - air)
  return { air, fly, lay, total: fly + lay }
}

/** Nhiễu tiền định theo chỉ số tờ — cùng một chồng thì lần nào mở cũng y hệt. */
function noise(i, salt) {
  const x = Math.sin((i + 1) * 127.1 + salt * 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** Gộp nông theo từng nhóm: chỉ nhận khoá đã có trong mặc định, bỏ qua khoá lạ. */
function deepMerge(base, patch) {
  const out = {}
  for (const key of Object.keys(base)) {
    const b = base[key]
    const p = patch ? patch[key] : undefined
    if (b && typeof b === 'object' && !Array.isArray(b)) out[key] = deepMerge(b, p && typeof p === 'object' ? p : {})
    else out[key] = p === undefined || p === null ? b : p
  }
  return out
}

export const mergeParams = (patch) => deepMerge(RUNTIME_DEFAULTS, patch)

export function ratioOf(frame) {
  if (frame.ratio === 'custom') return [Math.max(1, frame.cw), Math.max(1, frame.ch)]
  return RATIOS[frame.ratio] || RATIOS['4:5']
}

/* ------------------------------------------------------- hình học tờ giấy */

/**
 * Uốn một tờ giấy đang được trải xuống mặt phẳng.
 *
 * Mô hình: giấy KHÔNG giãn, nên phần còn lơ lửng là một CUNG TRÒN bán kính 1/κ tiếp
 * tuyến với mặt phẳng ngay tại đường tiếp xúc. Đường tiếp xúc quét từ mép trước
 * (`e = 0`) về mép sau khi `pr` chạy 0 → 1; phần đã tiếp xúc thì nằm bẹt.
 *
 *   e  = khoảng cách sau mép trước, đo theo hướng bay
 *   ec = vị trí đường tiếp xúc (lệch theo `twist` để một GÓC chạm trước, không phải cả mép)
 *   φ  = κ·(e − ec) → toạ độ dọc lùi lại sin(φ)/κ, cao lên (1 − cos φ)/κ
 *
 * `flap` là cú vỗ của tờ bị đè: mép nào lò xo đẩy thì cong lên theo q² — uốn bản lề
 * chứ không xoay cứng, nhờ vậy mép đối diện không bao giờ chọc xuống dưới mặt bàn.
 */
function deform(sheet, pr, params, fields) {
  const { geom, base, w, h } = sheet
  const pos = geom.attributes.position
  const arr = pos.array
  const n = base.length / 3

  // Hướng bay quy về hệ toạ độ riêng của tờ (đã trừ góc xoay của chính nó).
  const a = sheet.travelAngle - sheet.yawTotal
  const tx = Math.cos(a)
  const tz = Math.sin(a)
  const tmax = Math.abs(tx) * w * 0.5 + Math.abs(tz) * h * 0.5
  const L = 2 * tmax || 1
  const Lp = 2 * (Math.abs(tz) * w * 0.5 + Math.abs(tx) * h * 0.5) || 1

  const bend = Math.max(0.6, params.curl.bend * (sheet.bendMul || 1)) * RAD
  const k = bend / L
  const phiMax = 168 * RAD
  const dMax = phiMax / k
  const twist = params.curl.twist
  const cross = params.curl.cross * L * 0.12
  // Twist làm đường tiếp xúc nghiêng, nên phải cho `pr` chạy quá hai đầu một chút,
  // không thì góc cuối cùng vĩnh viễn không chạm đất.
  const prEff = pr * (1 + Math.abs(twist)) - Math.abs(twist) * 0.5

  const flutter = sheet.flutter * L
  // Toạ độ thế giới của đỉnh: cần để cộng trường vỗ của MỌI tờ nằm dưới (xem chú thích
  // ở đầu vòng lặp update). Tờ đã đáp thì node chỉ xoay quanh trục Y nên y cục bộ
  // trùng y thế giới, không phải đổi hệ.
  const cyaw = Math.cos(sheet.yawTotal)
  const syaw = Math.sin(sheet.yawTotal)
  const ox = sheet.node.position.x
  const oz = sheet.node.position.z
  const nf = fields ? fields.length : 0

  for (let i = 0; i < n; i++) {
    const x0 = base[i * 3]
    const z0 = base[i * 3 + 2]
    const t = x0 * tx + z0 * tz          // dọc theo hướng bay
    const nn = -x0 * tz + z0 * tx        // ngang với hướng bay
    const e = tmax - t
    const ec = (prEff + twist * (nn / Lp)) * L

    let tOut = t
    let y = 0
    const d = e - ec
    if (d > 0) {
      const dc = Math.min(d, dMax)
      const phi = k * dc
      tOut = tmax - ec - Math.sin(phi) / k
      y = (1 - Math.cos(phi)) / k
      if (d > dMax) {
        // Quá 168° thì giấy tự cuộn vào nhau — kéo thẳng tiếp tuyến cho gọn.
        const extra = d - dMax
        tOut -= Math.cos(phi) * extra
        y += Math.sin(phi) * extra
      }
      // Máng ngang: giấy lơ lửng luôn hơi cong theo chiều còn lại, phẳng dần khi đáp.
      const rise = clamp01(d / (0.35 * L))
      const un = nn / Lp
      y += cross * rise * 4 * un * un
    }

    if (nf) {
      const wx = ox + x0 * cyaw + z0 * syaw
      const wz = oz - x0 * syaw + z0 * cyaw
      for (let f = 0; f < nf; f++) {
        const fd = fields[f]
        const q = clamp01(((wx - fd.cx) * fd.dx + (wz - fd.cz) * fd.dz) / fd.reach)
        y += fd.amp * q * q
      }
    }
    if (Math.abs(flutter) > 1e-7) {
      const s = clamp01((e / L - 0.3) / 0.7)
      y += flutter * s * s
    }

    arr[i * 3] = tOut * tx - nn * tz
    arr[i * 3 + 1] = y
    arr[i * 3 + 2] = tOut * tz + nn * tx
  }

  pos.needsUpdate = true
  geom.computeVertexNormals()
  geom.computeBoundingSphere()
}

/** Trả tờ giấy về đúng mặt phẳng (dùng cho tờ đã nằm yên hẳn — khỏi tính lại mỗi frame). */
function flatten(sheet) {
  const pos = sheet.geom.attributes.position
  pos.array.set(sheet.base)
  pos.needsUpdate = true
  sheet.geom.computeVertexNormals()
  sheet.geom.computeBoundingSphere()
}

/* ---------------------------------------------------------------- vật lý */

function resetSpring(s) {
  s.flapX = 0
  s.flapZ = 0
  s.vFlapX = 0
  s.vFlapZ = 0
  s.slideX = 0
  s.slideZ = 0
  s.vSlideX = 0
  s.vSlideZ = 0
  s.dip = 0
  s.vDip = 0
  s.dyaw = 0
  s.vDyaw = 0
  s.flutter = 0
  s.vFlutter = 0
}

/**
 * Tờ `k` vừa chạm xuống → phát xung cho những tờ bên dưới.
 *
 * Điểm chạm là mép trước của tờ đang rơi. Với mỗi tờ bên dưới: mép NGƯỢC phía điểm
 * chạm vỗ lên (đè bên này thì bên kia dựng lên), cả tờ trượt theo đà của tờ rơi, và
 * xoay nhẹ theo mô-men lệch tâm. Biên độ giảm theo `decay^độ sâu`.
 */
function impact(sheets, k, params, gain) {
  const P = sheets[k]
  const px = P.restX + Math.cos(P.travelAngle) * P.reach
  const pz = P.restZ + Math.sin(P.travelAngle) * P.reach
  const tx = Math.cos(P.travelAngle)
  const tz = Math.sin(P.travelAngle)
  const ph = params.physics

  /*
   * Xung phát vào lò xo là VẬN TỐC, nhưng thứ người ta nhìn thấy là BIÊN ĐỘ. Với lò xo
   * giảm chấn, biên độ đỉnh ≈ v / ω — nên muốn "mép nhấc lên 7% chiều tờ" thì phải nhân
   * ω vào, không thì tần số càng cao biên độ càng bé đi. Lần đầu quên bước này, đo ra
   * mép chỉ nhấc 0.5% chiều tờ: vật lý chạy đúng mà mắt không thấy gì.
   */
  const w = 2 * Math.PI * Math.max(0.2, ph.freq)
  const kick = (target, omega) => target * omega

  for (let j = k - 1; j >= 0; j--) {
    const s = sheets[j]
    const amp = ph.push * Math.pow(ph.decay, k - j - 1) * gain
    if (amp < 1e-4) break
    const ref = (s.w + s.h) * 0.5
    const rx = px - s.restX
    const rz = pz - s.restZ
    const half = Math.max(1e-4, Math.hypot(s.w, s.h) * 0.5)
    const len = Math.hypot(rx, rz) || 1e-6
    const off = clamp(len / half, 0, 1)
    const lever = 0.35 + 0.65 * off

    // Mép xa điểm chạm là mép dựng lên → hướng vỗ ngược lại r.
    const flap = kick(ref * 0.075 * amp * lever, w)
    s.vFlapX += (-rx / len) * flap
    s.vFlapZ += (-rz / len) * flap

    const slide = kick(ref * 0.06 * amp * ph.slide, w * 0.7)
    s.vSlideX += tx * slide
    s.vSlideZ += tz * slide

    // Lún: cả chồng chỉ nén được ít hơn một nấc giấy, nên đo theo độ dày chứ không
    // theo cỡ tờ — lấy theo cỡ tờ là tờ dưới xuyên qua mặt bàn.
    s.vDip -= kick(params.stack.thickness * 0.8 * amp * ph.dip, w * 1.3)

    // Chồng giấy xếp gần đồng tâm nên cánh tay đòn rất ngắn: chỉ lấy mô-men lệch tâm
    // thì góc xoay ra 0.01°, không ai thấy. Cộng thêm một phần nhiễu tiền định theo
    // cặp (tờ bị đè, tờ đè lên) — đúng cái ngẫu nhiên của một cú vỗ thật.
    const nz = noise(j * 7 + k, 5)
    const twistDir =
      clamp((rx * tz - rz * tx) / (half * half), -1, 1) + Math.sign(nz || 1) * (0.4 + Math.abs(nz) * 0.5)
    s.vDyaw += kick(0.05 * amp * ph.yaw * twistDir, w * 0.8)
  }

  // Chính tờ vừa đáp: cú vỗ đuôi.
  const wf = 2 * Math.PI * Math.max(0.5, params.curl.flutterFreq)
  P.vFlutter += kick(0.035 * params.curl.flutter * gain, wf)
}

function integrate(sheets, params, dt) {
  const ph = params.physics
  const w = 2 * Math.PI * Math.max(0.2, ph.freq)
  const z = clamp(ph.damping, 0.02, 1)
  const wf = 2 * Math.PI * Math.max(0.5, params.curl.flutterFreq)
  const zf = 0.16
  const step = (x, v, omega, zeta) => {
    const acc = -omega * omega * x - 2 * zeta * omega * v
    const nv = v + acc * dt
    return [x + nv * dt, nv]
  }
  for (const s of sheets) {
    ;[s.flapX, s.vFlapX] = step(s.flapX, s.vFlapX, w, z)
    ;[s.flapZ, s.vFlapZ] = step(s.flapZ, s.vFlapZ, w, z)
    ;[s.slideX, s.vSlideX] = step(s.slideX, s.vSlideX, w * 0.7, z * 1.6)
    ;[s.slideZ, s.vSlideZ] = step(s.slideZ, s.vSlideZ, w * 0.7, z * 1.6)
    ;[s.dip, s.vDip] = step(s.dip, s.vDip, w * 1.3, z * 1.2)
    ;[s.dyaw, s.vDyaw] = step(s.dyaw, s.vDyaw, w * 0.8, z * 1.4)
    ;[s.flutter, s.vFlutter] = step(s.flutter, s.vFlutter, wf, zf)
  }
}

const quiet = (s) =>
  Math.abs(s.flapX) < 2e-5 && Math.abs(s.flapZ) < 2e-5 && Math.abs(s.flutter) < 2e-5 &&
  Math.abs(s.vFlapX) < 2e-4 && Math.abs(s.vFlapZ) < 2e-4 && Math.abs(s.vFlutter) < 2e-4

/* ------------------------------------------------------------------ mount */

/**
 * Dựng runtime vào một container.
 *
 * @param {HTMLElement} container
 * @param {object} config { params, sheets:[{src,x,y,rot,scale,from}], edit, driver, autoHead }
 * @returns {object} API điều khiển
 */
export function mount(container, config = {}) {
  const params = mergeParams(config.params)
  const state = {
    edit: !!config.edit,
    driver: config.driver || 'wheel',
    head: 0,
    target: 0,
    snap: null,
    script: null,
    landed: 0,
    lastForce: 1,
    queue: [],
    targetVel: 0,
    hover: -1,
    selected: config.selected ?? -1,
    onHead: config.onHead || null,
    onMoveSheet: config.onMoveSheet || null,
    onSelect: config.onSelect || null,
    dragging: null,
  }

  /* ---- three cơ bản ---- */

  const canvas = document.createElement('canvas')
  canvas.className = 'paper-stack-canvas'
  canvas.style.display = 'block'
  // Driver 'page' sống bằng chính cú cuộn trang: khoá touch là trên điện thoại khối
  // phủ kín màn hình thì không cuộn đi đâu được nữa.
  canvas.style.touchAction = state.driver === 'page' && !state.edit ? 'pan-y' : 'none'
  container.append(canvas)

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
  })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1, Math.sqrt(4.2e6 / Math.max(1, innerWidth * innerHeight)))) // ngân sách điểm ảnh cho màn rất lớn
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(params.frame.bg)

  /*
   * Nền ảnh (frame.bgImage — chande-www thêm, tool gốc không có): ảnh nằm PHẲNG TRÊN
   * MẶT BÀN (mặt phẳng y = 0, ngay dưới lớp hứng bóng) nên cùng phối cảnh với các tờ
   * giấy và bóng giấy đổ lên nó. Cỡ mặt phẳng: chiếu 4 góc khung hình xuống bàn rồi
   * phủ ảnh kiểu cover lên vùng đó -> luôn kín khung ở mọi tỉ lệ / góc camera.
   * Vật liệu không chiếu sáng (MeshBasic, không tone map) -> ra đúng màu ảnh.
   */
  let bgSrc = ''
  let bgImg = null
  let floor = null
  function drawBackground() {
    scene.background = new THREE.Color(params.frame.bg)
    const src = params.frame.bgImage || ''
    if (!src) {
      bgSrc = ''
      if (floor) floor.visible = false
      return
    }
    if (src !== bgSrc) {
      bgSrc = src
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        if (bgSrc !== src) return
        bgImg = img
        const tex = new THREE.Texture(img)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
        tex.needsUpdate = true
        if (!floor) {
          floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }))
          floor.rotation.x = -Math.PI / 2
          floor.position.y = -0.002 // dưới lớp hứng bóng (y = 0)
          scene.add(floor)
        } else {
          floor.material.map?.dispose()
          floor.material.map = tex
          floor.material.needsUpdate = true
        }
        fitFloor()
        dirty = true
      }
      img.src = src
    }
    fitFloor()
  }
  const _ray = new THREE.Raycaster()
  const _plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const _hit = new THREE.Vector3()
  function fitFloor() {
    if (!floor || !bgImg || !bgSrc) return
    floor.visible = true
    camera.updateMatrixWorld()
    let x0 = Infinity
    let x1 = -Infinity
    let z0 = Infinity
    let z1 = -Infinity
    for (const [nx, ny] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      _ray.setFromCamera({ x: nx, y: ny }, camera)
      // góc nhìn quá chân trời thì lấy điểm xa trên tia, hạ xuống bàn
      const p = _ray.ray.intersectPlane(_plane, _hit) || _ray.ray.at(30, _hit).setY(0)
      x0 = Math.min(x0, p.x)
      x1 = Math.max(x1, p.x)
      z0 = Math.min(z0, p.z)
      z1 = Math.max(z1, p.z)
    }
    const pad = 1.04
    let w = (x1 - x0) * pad
    let d = (z1 - z0) * pad
    const ia = bgImg.naturalWidth / bgImg.naturalHeight
    if (w / d > ia) d = w / ia
    else w = d * ia
    floor.scale.set(w, d, 1)
    floor.position.x = (x0 + x1) / 2
    floor.position.z = (z0 + z1) / 2
  }
  const camera = new THREE.PerspectiveCamera(params.camera.fov, 1, 0.05, 60)
  camera.up.set(0, 0, -1)

  // Sàn CHỈ hứng bóng; màu nền là scene.background nên ra đúng mã hex đã chọn. Sàn có
  // chiếu sáng thì luôn tối đi (~63%: #FFFEF8 ra #CDCCC7) — trong tool không ai thấy,
  // nhúng lên site nền kem là lộ ngay một khung xám giữa trang.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), new THREE.ShadowMaterial({ color: 0x000000 }))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const ambient = new THREE.AmbientLight(0xffffff, params.light.ambient)
  scene.add(ambient)
  const key = new THREE.DirectionalLight(0xffffff, params.light.key)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  // Tờ giấy dày 0 nên mặt nhận bóng và mặt tạo bóng trùng nhau — không đẩy normalBias
  // đủ lớn là cả tờ nổi đốm đen (đã dính đúng lỗi này lần dựng đầu).
  key.shadow.bias = -0.0006
  key.shadow.normalBias = 0.02
  scene.add(key)
  scene.add(key.target)
  const fill = new THREE.DirectionalLight(0xffffff, params.light.fill)
  scene.add(fill)

  const sheets = []
  const group = new THREE.Group()
  scene.add(group)

  /* ---- lớp phủ cảnh sau: một quad toàn màn hình + shader vòng đồng tâm ----
   *
   * Vẽ bằng shader chứ không bằng hình học: chỉ một draw call, mép vòng mượt ở mọi độ
   * phân giải, và quan trọng nhất là nó nằm TRONG canvas WebGL nên video xuất ra và
   * snippet nhúng đều có nó (lớp phủ bằng CSS thì MediaRecorder không quay được).
   */
  const MAX_RINGS = 16
  const overlayScene = new THREE.Scene()
  const overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const overlayUniforms = {
    uColors: { value: Array.from({ length: MAX_RINGS }, () => new THREE.Color(0x000000)) },
    uRadii: { value: new Float32Array(MAX_RINGS) },
    uCount: { value: 0 },
    uOrigin: { value: new THREE.Vector2(0.5, 0) },
    uAspect: { value: 1 },
    uAA: { value: 0.002 },
  }
  const overlayQuad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: overlayUniforms,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `
        #define MAX_RINGS ${MAX_RINGS}
        uniform vec3 uColors[MAX_RINGS];
        uniform float uRadii[MAX_RINGS];
        uniform int uCount;
        uniform vec2 uOrigin;
        uniform float uAspect;
        uniform float uAA;
        varying vec2 vUv;
        void main() {
          // Đo theo chiều CAO của khung rồi bù aspect cho x, không thì vòng thành elip.
          vec2 p = vec2((vUv.x - uOrigin.x) * uAspect, vUv.y - uOrigin.y);
          float d = length(p);
          vec3 rgb = vec3(0.0);
          float alpha = 0.0;
          // Vòng già nhất (to nhất) vẽ trước, vòng non hơn (nhỏ hơn) phủ lên: đúng thứ
          // tự nhiên của một chùm vòng nở ra, và tâm luôn là màu vòng non nhất.
          for (int i = 0; i < MAX_RINGS; i++) {
            if (i >= uCount) break;
            float r = uRadii[i];
            if (r <= 0.0) continue;
            float a = 1.0 - smoothstep(r - uAA, r + uAA, d);
            rgb = mix(rgb, uColors[i], a);
            alpha = max(alpha, a);
          }
          if (alpha <= 0.002) discard;
          gl_FragColor = vec4(rgb, alpha);
          // Uniform màu đã được three quy về không gian tuyến tính, nên đầu ra phải qua
          // bước chuyển ngược. Thiếu include này thì #FDFBF4 ra thành #FAF6E7.
          #include <colorspace_fragment>
        }
      `,
    }),
  )
  overlayQuad.frustumCulled = false
  overlayScene.add(overlayQuad)
  let outroAlive = false

  /* ---- khung + camera ---- */

  let AW = 1
  let AH = 1.25
  let aspect = 0.8

  function applyFrame() {
    const [rw, rh] = ratioOf(params.frame)
    aspect = rw / rh
    AW = 1
    AH = rh / rw
  }

  /**
   * Đặt camera sao cho artboard vừa khít viewport. Không có công thức đóng cho
   * trường hợp nghiêng + phối cảnh, nên chiếu 4 góc rồi co giãn khoảng cách vài
   * vòng — hội tụ sau 3-4 vòng, và chỉ chạy khi đổi tham số.
   */
  function fitCamera() {
    const tilt = clamp(params.camera.tilt, 0, 78) * RAD
    const yaw = params.camera.yaw * RAD
    const top = Math.max(0.02, (sheets.length + 1) * params.stack.thickness)
    camera.fov = params.camera.fov
    camera.aspect = aspect
    const dir = new THREE.Vector3(
      Math.sin(tilt) * Math.sin(yaw),
      Math.cos(tilt),
      Math.sin(tilt) * Math.cos(yaw),
    )
    const target = new THREE.Vector3(0, top * 0.5, 0)
    const corners = []
    for (const sx of [-0.5, 0.5]) {
      for (const sz of [-0.5, 0.5]) {
        corners.push(new THREE.Vector3(sx * AW, 0, sz * AH))
        corners.push(new THREE.Vector3(sx * AW, top, sz * AH))
      }
    }
    let d = 2.2
    for (let pass = 0; pass < 5; pass++) {
      camera.position.copy(dir).multiplyScalar(d).add(target)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      camera.updateProjectionMatrix()
      let extent = 0
      for (const c of corners) {
        const p = c.clone().project(camera)
        extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y))
      }
      d *= extent / (1 - clamp(params.frame.margin, 0, 0.4))
    }
    camera.position.copy(dir).multiplyScalar(d).add(target)
    camera.lookAt(target)
    camera.updateProjectionMatrix()
    fitFloor()

    const az = params.light.azimuth * RAD
    const el = clamp(params.light.elevation, 5, 89) * RAD
    const r = 3.2
    key.position.set(Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r)
    key.target.position.set(0, 0, 0)
    key.target.updateMatrixWorld()
    const span = Math.max(AW, AH) * 1.5
    const cam = key.shadow.camera
    cam.left = -span
    cam.right = span
    cam.top = span
    cam.bottom = -span
    cam.near = 0.1
    cam.far = 12
    cam.updateProjectionMatrix()
    key.shadow.radius = params.light.softness
    key.shadow.intensity = clamp(params.light.shadow, 0, 1)
    fill.position.set(-key.position.x, r * 0.7, -key.position.z)
    ground.material.opacity = groundShadowGain(el)
  }

  /**
   * Độ đậm bóng trên sàn sao cho giống hệt hồi sàn còn được chiếu sáng: bóng lấy đi
   * phần đèn chính trong tổng ánh sáng rơi lên sàn (tuyến tính), rồi quy về sRGB vì
   * ShadowMaterial hoà trộn trên màu đã mã hoá. ShadowMaterial tự nhân shadow.intensity
   * nên phải chia lại cho nó.
   */
  function groundShadowGain(el) {
    const I = clamp(params.light.shadow, 0, 1)
    if (I <= 0) return 0
    const k = params.light.key * Math.sin(el)
    const total = params.light.ambient + k + params.light.fill * fill.position.clone().normalize().y
    const share = total > 0 ? clamp(k / total, 0, 1) : 0
    return (1 - Math.pow(1 - I * share, 1 / 2.2)) / I
  }

  /* ---- tạo tờ ---- */

  function textureFrom(img) {
    const tex = new THREE.Texture(img)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy()
    tex.needsUpdate = true
    return tex
  }

  function buildSheet(entry, index, img) {
    const cfg = { ...SHEET_DEFAULTS, ...entry }
    const seg = clamp(Math.round(params.paper.segments), 8, 96)
    const box = params.stack.size * clamp(cfg.scale, 0.15, 3)
    const ar = (img.naturalWidth || 4) / (img.naturalHeight || 5)
    let w = AW * box
    let h = w / ar
    if (h > AH * box) {
      h = AH * box
      w = h * ar
    }
    const geom = new THREE.PlaneGeometry(w, h, seg, Math.max(6, Math.round(seg * (h / w))))
    geom.rotateX(-Math.PI / 2)
    const base = Float32Array.from(geom.attributes.position.array)

    const map = textureFrom(img)
    const front = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        map,
        roughness: params.paper.roughness,
        metalness: 0,
        side: THREE.FrontSide,
        // three vẽ shadow map bằng mặt NGƯỢC của `side` — FrontSide thì chỉ mặt sau vào
        // shadow map, mà tờ giấy nằm ngửa đón đèn từ trên nên bị loại hẳn: không tờ nào
        // đổ bóng, slider "bóng" kéo cũng không đổi một pixel.
        shadowSide: THREE.DoubleSide,
        transparent: params.entry.fade > 0,
      }),
    )
    front.castShadow = true
    front.receiveShadow = true
    // Mặt sau là giấy trắng, nhìn thấy đúng lúc mép đang cong lên — chi tiết này
    // là thứ làm người ta tin đó là tờ giấy chứ không phải cái ảnh bị bóp méo.
    const back = new THREE.Mesh(
      geom,
      new THREE.MeshStandardMaterial({
        color: params.paper.back,
        roughness: 0.95,
        metalness: 0,
        side: THREE.BackSide,
        transparent: params.entry.fade > 0,
      }),
    )
    const node = new THREE.Group()
    node.add(front, back)
    group.add(node)

    const s = {
      index,
      cfg,
      geom,
      base,
      front,
      back,
      node,
      w,
      h,
      reach: 0,
      restX: 0,
      restZ: 0,
      baseY: 0,
      yawTotal: 0,
      travelAngle: 0,
      prevPr: -1,
      needsGeom: true,
      flat: false,
      force: null,
      bendMul: 1,
    }
    resetSpring(s)
    return s
  }

  function disposeSheet(s) {
    group.remove(s.node)
    s.geom.dispose()
    if (s.front.material.map) s.front.material.map.dispose()
    s.front.material.dispose()
    s.back.material.dispose()
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Không nạp được ảnh'))
      img.src = src
    })
  }

  /** Nạp lại toàn bộ danh sách tờ. Ảnh đã có sẵn `img` thì dùng luôn, khỏi decode lại. */
  async function setSheets(list) {
    const imgs = await Promise.all(
      list.map((entry) => (entry.img ? Promise.resolve(entry.img) : loadImage(entry.src))),
    )
    while (sheets.length) disposeSheet(sheets.pop())
    list.forEach((entry, i) => sheets.push(buildSheet(entry, i, imgs[i])))
    state.head = clamp(state.head, minHead(), maxHead())
    state.target = state.head
    for (const s of sheets) {
      measure(s)
      restPose(s)
    }
    state.landed = countLanded()
    fitCamera()
    dirty = true
  }

  /** Đổi vị trí / góc / cỡ của một tờ mà không dựng lại cả chồng. */
  function updateSheet(index, patch) {
    const s = sheets[index]
    if (!s) return
    Object.assign(s.cfg, patch)
    if (patch.scale !== undefined) {
      const img = s.front.material.map.image
      rebuildGeometry(s, img)
    }
    dirty = true
  }

  function rebuildGeometry(s, img) {
    const seg = clamp(Math.round(params.paper.segments), 8, 96)
    const box = params.stack.size * clamp(s.cfg.scale, 0.15, 3)
    const ar = (img.naturalWidth || 4) / (img.naturalHeight || 5)
    let w = AW * box
    let h = w / ar
    if (h > AH * box) {
      h = AH * box
      w = h * ar
    }
    const geom = new THREE.PlaneGeometry(w, h, seg, Math.max(6, Math.round(seg * (h / w))))
    geom.rotateX(-Math.PI / 2)
    s.geom.dispose()
    s.geom = geom
    s.base = Float32Array.from(geom.attributes.position.array)
    s.front.geometry = geom
    s.back.geometry = geom
    s.w = w
    s.h = h
    s.needsGeom = true
  }

  /* ---- tư thế nghỉ + tiến độ ---- */

  /*
   * NẤC CUỘN của từng tờ (chande-www thêm "cùng lượt"): tờ có cfg.together rơi chung nấc
   * với tờ trước. Nấc = số lượt, không còn = số tờ. Trong một lượt nhiều tờ, tờ thứ j
   * lệch j × groupStagger và cả nhóm vẫn đáp xong trong đúng một nấc.
   */
  function slots() {
    const out = []
    let step = -1
    for (let i = 0; i < sheets.length; i++) {
      if (i === 0 || !sheets[i].cfg.together) out.push({ step: ++step, member: 0, size: 1 })
      else {
        const prev = out[i - 1]
        out.push({ step: prev.step, member: prev.member + 1, size: 1 })
      }
    }
    for (let i = out.length - 1; i >= 0; i--) out[i].size = i + 1 < out.length && out[i + 1].step === out[i].step ? out[i + 1].size : out[i].member + 1
    return out
  }
  const stepCount = () => (sheets.length ? slots().at(-1).step + 1 : 0)
  const progressOf = (index) => {
    const sl = slots()[index]
    if (!sl) return 0
    const st = clamp(params.entry.groupStagger ?? 0, 0, 0.5)
    const span = Math.max(0.2, 1 - (sl.size - 1) * st)
    return clamp01((state.head - sl.step - sl.member * st) / span)
  }

  /**
   * Sàn của `head`. Bật "tờ đầu nằm sẵn" thì chồng giấy không bao giờ rỗng — cuộn ngược
   * hết cỡ vẫn còn một tờ trên mặt bàn, đúng như khung đầu của mock.
   */
  const minHead = () => (params.stack.startLaid && sheets.length ? 1 : 0)

  /** Nấc cuối của `head`. Bật cảnh sau thì có thêm đúng một nấc: n → n+1 (n = số lượt). */
  const maxHead = () => stepCount() + (params.outro.on && sheets.length ? 1 : 0)

  /** Tiến độ cảnh sau, 0 khi chồng giấy chưa bày xong. */
  const outroProgress = () => (params.outro.on ? clamp01(state.head - stepCount()) : 0)

  /** Hướng bay + nửa đường chéo theo hướng đó. Phải có trước khi xét va đập. */
  function measure(s) {
    s.travelAngle = travelAngleOf(s)
    s.reach = (Math.abs(Math.cos(s.travelAngle)) * s.w + Math.abs(Math.sin(s.travelAngle)) * s.h) * 0.5
  }

  /** Số tờ đã CHẠM mặt phẳng — chính là mốc phát xung va đập. */
  function countLanded() {
    let n = 0
    for (let i = 0; i < sheets.length; i++) if (progressOf(i) > params.entry.air) n++
    return n
  }

  /**
   * Tư thế nghỉ của một tờ = vị trí người dùng đặt + nhiễu bày biện + xê dịch tích luỹ
   * từ những tờ đè lên nó.
   *
   * Xê dịch KHÔNG cộng dồn theo thời gian mà tính lại mỗi frame từ tập tờ đã đáp —
   * nhờ vậy tua ngược scroll thì chồng giấy quay về đúng trạng thái cũ, không lệch dần.
   */
  function restPose(s) {
    const sc = params.stack.scatter
    let x = s.cfg.x * AW + noise(s.index, 1) * sc * 0.03 * AW
    let z = s.cfg.y * AH + noise(s.index, 2) * sc * 0.03 * AH
    let yaw = (s.cfg.rot + noise(s.index, 3) * sc * 6) * RAD
    for (let k = s.index + 1; k < sheets.length; k++) {
      const above = sheets[k]
      const q = clamp01((progressOf(k) - params.entry.air) / Math.max(0.05, 1 - params.entry.air))
      if (q <= 0) continue
      const wgt = q * params.physics.nudge * Math.pow(params.physics.decay, k - s.index - 1) * above.h * 0.15
      x += Math.cos(above.travelAngle) * wgt
      z += Math.sin(above.travelAngle) * wgt
      yaw += noise(k * 7 + s.index, 4) * wgt * 1.6
    }
    s.restX = x
    s.restZ = z
    s.restYaw = yaw
  }

  const travelAngleOf = (s) => ((s.cfg.from === null || s.cfg.from === undefined ? params.entry.from : s.cfg.from) + 180) * RAD

  /* ---- vòng cập nhật ---- */

  const tiltAxis = new THREE.Vector3()
  const qYaw = new THREE.Quaternion()
  const qTilt = new THREE.Quaternion()
  const YAXIS = new THREE.Vector3(0, 1, 0)
  let dirty = true

  function update(dt) {
    if (!sheets.length) return
    const air = clamp(params.entry.air, 0.02, 0.95)
    const ease = (t) => easeCurve(params.motion.easing, params.motion.easeMode, t)

    for (const s of sheets) measure(s)

    // Xung va đập: phát khi mép trước của một tờ vừa chạm mặt phẳng.
    const landed = countLanded()
    // Cuộn mạnh thì cú đè cũng mạnh: lấy lực đã chốt của chính tờ vừa chạm.
    const hitGain = (k) => fmul(sheets[k].force === null ? 1 : sheets[k].force, 'push')
    if (landed > state.landed) {
      for (let k = state.landed; k < landed; k++) impact(sheets, k, params, hitGain(k))
    } else if (landed < state.landed) {
      // Tua ngược: vẫn phát xung nhưng nhẹ hơn, để chồng giấy phản ứng chứ không đứng chết.
      for (let k = landed; k < state.landed; k++) impact(sheets, k, params, hitGain(k) * 0.45)
    }
    state.landed = landed

    integrate(sheets, params, dt)

    /*
     * `fields` là danh sách trường vỗ của những tờ đã xử lý (tức là mọi tờ nằm DƯỚI tờ
     * đang xử lý, cộng cả chính nó). Tờ thứ i cộng đủ cả danh sách, nên độ cao của nó
     * tại mọi điểm luôn ≥ độ cao của tờ i-1 tại đúng điểm đó — GIẤY NẰM TRÊN CÁI GÌ THÌ
     * PHẢI NHẤC THEO CÁI ĐÓ.
     *
     * Trước khi có chỗ này, mép tờ dưới vỗ lên 7.5% chiều tờ mà hai tờ chỉ cách nhau
     * một nấc 0.7% → mép chọc xuyên qua tờ nằm trên. Chặn biên độ lại thì hết xuyên
     * nhưng cũng hết nhìn thấy gì; chở theo mới vừa đúng vật lý vừa giữ được cú vỗ.
     *
     * Vì thế trường phải tính ở TOẠ ĐỘ THẾ GIỚI: mỗi tờ có tâm và góc xoay riêng, quy
     * về hệ riêng của từng tờ thì phép cộng không còn bảo đảm thứ tự cao thấp nữa.
     */
    const fields = []

    for (const s of sheets) {
      restPose(s)
      /*
       * Hai chặng, mỗi chặng một đường cong — và ở đây điều đó ĐÚNG, khác với bài học
       * "một chuyển động liền mạch thì một đường cong": hai chặng này là hai đại lượng
       * KHÁC NHAU, không phải một đại lượng bị cắt đôi.
       *   `ap` = tờ giấy bay tới chỗ  (chuyển động tịnh tiến, giảm tốc để đặt xuống)
       *   `pr` = đường tiếp xúc quét từ mép trước về mép sau (không có đơn vị chung)
       * Tốc độ hai bên chỗ nối không cần khớp nhau, nên không có cú khựng nào.
       *
       * `air` vì thế là phần THỜI GIAN dành cho chặng bay — nếu ease cả lượt rồi mới
       * chia thì `air` biến thành phần của đường cong, và với ease-out thì 42% đường
       * cong chỉ ứng với 17% thời gian: chặng bay gần như không nhìn thấy.
       */
      const q = progressOf(s.index)
      const approach = clamp01(q / air)
      const ap = ease(approach)
      const pr = ease(clamp01((q - air) / (1 - air)))

      /*
       * Lực cuộn của TỜ NÀY: chốt đúng lúc nó bắt đầu bay và giữ nguyên tới khi đáp.
       * Rời khỏi khung (q về 0) thì bỏ chốt, để cuộn lại là đo lại lực mới.
       */
      if (q > 0) {
        if (s.force === null) s.force = params.force.on ? state.lastForce : 1
      } else {
        s.force = null
      }
      const f = s.force === null ? 1 : s.force
      s.bendMul = fmul(f, 'bend')

      const away = 1 - ap
      const dist = away * params.entry.travel * fmul(f, 'travel') * s.reach * 2
      s.yawTotal = s.restYaw + s.dyaw + away * params.entry.spin * fmul(f, 'spin') * RAD

      const px = s.restX + s.slideX - Math.cos(s.travelAngle) * dist
      const pz = s.restZ + s.slideZ - Math.sin(s.travelAngle) * dist
      // Tờ 0 phải nằm CAO HƠN mặt bàn một nấc: để nó ở đúng y = 0 là trùng mặt phẳng
      // nền, z-buffer không phân định được và cả tờ nhập nhoè với nền (đã dính thật).
      const rest = (s.index + 1) * params.stack.thickness
      const py = rest + s.dip + away * params.entry.lift * fmul(f, 'lift') * Math.max(s.w, s.h)
      s.node.position.set(px, Math.max(py, rest - params.stack.thickness * 0.6), pz)

      qYaw.setFromAxisAngle(YAXIS, s.yawTotal)
      const tiltAngle = away * params.entry.tilt * fmul(f, 'spin') * RAD
      if (Math.abs(tiltAngle) > 1e-5) {
        // Trục nghiêng vuông góc với hướng bay → tờ giấy chúi mũi xuống lúc lao tới.
        tiltAxis.set(-Math.sin(s.travelAngle), 0, Math.cos(s.travelAngle)).normalize()
        qTilt.setFromAxisAngle(tiltAxis, -tiltAngle)
        s.node.quaternion.copy(qTilt).multiply(qYaw)
      } else {
        s.node.quaternion.copy(qYaw)
      }

      const visible = q > 0
      s.node.visible = visible
      if (params.entry.fade > 0) {
        const o = clamp01(approach / Math.max(0.05, params.entry.fade))
        s.front.material.opacity = o
        s.back.material.opacity = o
      }

      const flapAmp = Math.hypot(s.flapX, s.flapZ)
      if (flapAmp > 1e-6) {
        const dx = s.flapX / flapAmp
        const dz = s.flapZ / flapAmp
        // Tầm với của trường đo trong hệ riêng của tờ phát ra nó (mỗi tờ một khổ).
        const lx = dx * Math.cos(-s.yawTotal) - dz * Math.sin(-s.yawTotal)
        const lz = dx * Math.sin(-s.yawTotal) + dz * Math.cos(-s.yawTotal)
        fields.push({
          cx: s.node.position.x,
          cz: s.node.position.z,
          dx,
          dz,
          amp: flapAmp,
          reach: Math.abs(lx) * s.w * 0.5 + Math.abs(lz) * s.h * 0.5 || 1,
        })
      }

      // Tờ nào cũng phải tính lại lưới nếu còn bất kỳ trường vỗ nào ở dưới — nó đang
      // được chở theo, dù bản thân đã nằm yên.
      const still = pr >= 1 && quiet(s) && !fields.length
      if (still) {
        if (!s.flat) {
          flatten(s)
          s.flat = true
        }
      } else if (visible) {
        deform(s, pr, params, fields)
        s.flat = false
      }
      s.prevPr = pr
    }
  }

  /* ---- cảnh sau ---- */

  /**
   * Bán kính từng vòng theo tiến độ cảnh sau.
   *
   * Vòng thứ i khởi hành ở `i * stagger` và nở tới `rMax` — khoảng cách từ tâm tới GÓC
   * XA NHẤT của khung, nên vòng cuối chắc chắn trùm kín màn hình dù tâm đặt ở đâu.
   * `hold` để dành phần cuối cho màn một màu, không thì màu cuối vừa kịp phủ kín là hết.
   */
  function updateOutro() {
    const op = outroProgress()
    if (op <= 0.0001) {
      outroAlive = false
      return
    }
    const o = params.outro
    const cols = (o.colors || []).filter((c) => typeof c === 'string' && c).slice(0, MAX_RINGS)
    const count = cols.length
    if (!count) {
      outroAlive = false
      return
    }
    outroAlive = true

    const ox = clamp(o.originX, 0, 1)
    const oy = clamp(o.originY, 0, 1)
    let rMax = 0
    for (const c of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      rMax = Math.max(rMax, Math.hypot((c[0] - ox) * aspect, c[1] - oy))
    }
    rMax *= Math.max(1, o.scale)

    const stag = clamp(o.stagger, 0, count > 1 ? 0.9 / (count - 1) : 0.9)
    const endAt = 1 - clamp(o.hold, 0, 0.6)
    const span = Math.max(0.05, endAt - (count - 1) * stag)
    for (let i = 0; i < count; i++) {
      const local = clamp01((op - i * stag) / span)
      overlayUniforms.uRadii.value[i] = easeCurve(o.easing, o.easeMode, local) * rMax
      overlayUniforms.uColors.value[i].set(cols[i])
    }
    overlayUniforms.uCount.value = count
    overlayUniforms.uOrigin.value.set(ox, oy)
    overlayUniforms.uAspect.value = aspect
    overlayUniforms.uAA.value = 1.2 / Math.max(1, canvas.height)
  }

  function draw() {
    renderer.render(scene, camera)
    if (outroAlive) {
      renderer.autoClear = false
      renderer.render(overlayScene, overlayCam)
      renderer.autoClear = true
    }
  }

  /* ---- điều khiển head ---- */

  function stepSnap(dir, forced) {
    const n = maxHead()
    // Lực CHỐT tại đây, không đọc lại mỗi frame: giữa lượt bay mà lực đổi thì tờ giấy
    // co giãn quãng đường ngay dưới mắt người xem.
    const f = forced === undefined ? forceNow() : forced
    if (state.snap) {
      const el = performance.now() - state.snap.t0
      if (el < state.snap.total * 0.55) {
        // Cuộn tiếp lúc tờ trước còn đang bay: XẾP HÀNG thay vì bỏ đi, để cuộn nhanh
        // liên tục thì giấy rơi thành chuỗi liền mạch chứ không mất nhịp.
        const cap = clamp(Math.round(params.motion.queue), 0, 3)
        if (cap > 0 && state.queue.length < cap) state.queue.push({ dir, f })
        return
      }
    }
    const from = state.head
    const goal = clamp(dir > 0 ? Math.floor(from) + 1 : Math.ceil(from) - 1, minHead(), n)
    if (Math.abs(goal - from) < 1e-4) return
    state.lastForce = f
    // Nấc cuối là cảnh sau: nó có nhịp riêng, không dùng thời gian đáp của một tờ giấy.
    const intoOutro = Math.min(from, goal) >= stepCount() - 1e-6 && sheets.length > 0
    const T = intoOutro
      ? { air: 1, fly: Math.max(120, params.outro.dur), lay: 0, total: Math.max(120, params.outro.dur) }
      : phaseTimes(params, f, fmul)
    state.snap = { from, to: goal, t0: performance.now(), ...T }
    state.target = goal
  }

  function tickHead(dt) {
    const n = maxHead()
    if (pending && performance.now() - pending.at >= params.force.latch) {
      const dir = pending.dir
      pending = null
      stepSnap(dir)
    }
    if (state.script) {
      const sc = state.script
      const t = performance.now() - sc.t0
      let acc = 0
      let head = sc.start
      for (const seg of sc.segs) {
        if (t < acc + seg.hold) {
          head = seg.from
          break
        }
        acc += seg.hold
        if (t < acc + seg.total) {
          head = lerp(seg.from, seg.to, phaseU(t - acc, seg.fly, seg.lay, seg.air))
          break
        }
        acc += seg.total
        head = seg.to
      }
      state.head = clamp(head, 0, n)
      if (t >= sc.total) {
        state.script.done = true
        if (sc.onDone) {
          const cb = sc.onDone
          sc.onDone = null
          cb()
        }
      }
      return
    }
    if (state.snap) {
      const sn = state.snap
      const t = performance.now() - sn.t0
      const span = Math.abs(sn.to - sn.from)
      // Bước lẻ (bị cắt giữa lượt trước) thì chia chặng không còn khớp mốc `air` nữa —
      // chạy thẳng cho gọn.
      const u = span > 0.9 ? phaseU(t, sn.fly, sn.lay, sn.air) : clamp01(t / sn.total)
      state.head = lerp(sn.from, sn.to, u)
      if (t >= sn.total) {
        state.head = sn.to
        state.snap = null
        const next = state.queue.shift()
        if (next) stepSnap(next.dir, next.f)
      }
      return
    }
    if (params.motion.mode === 'free') {
      const tau = Math.max(16, params.motion.damping) / 1000
      const glide = Math.max(0, params.motion.glide) / 1000
      if (glide > 0.001) {
        // Đà trượt: cú cuộn nạp vận tốc cho ĐÍCH, đích tự trôi thêm rồi ma sát hãm lại.
        // Đây là phần "smooth scroll" thật — chỉ nội suy head thì thả tay là dừng ngay.
        state.target = state.target + state.targetVel * dt
        const lo = minHead()
        if (state.target <= lo || state.target >= n) state.targetVel = 0
        state.target = clamp(state.target, lo, n)
        state.targetVel *= Math.exp(-dt / glide)
        if (Math.abs(state.targetVel) < 1e-4) state.targetVel = 0
      } else {
        state.targetVel = 0
      }
      state.head = lerp(state.head, clamp(state.target, minHead(), n), 1 - Math.exp(-dt / tau))
    }
  }

  function setHead(v, hard) {
    state.head = clamp(v, minHead(), maxHead())
    state.target = state.head
    if (hard) {
      state.snap = null
      state.script = null
      for (const s of sheets) {
        resetSpring(s)
        s.force = null
      }
      state.landed = countLanded()
      state.queue.length = 0
      state.targetVel = 0
      pending = null
      peak = 0
    }
    dirty = true
  }

  /* ---- kịch bản tự chạy (dùng khi xuất video) ---- */

  function playScript({ hold = 700, anim, from = null, tail = 900, onDone } = {}) {
    const n = stepCount()
    const start = from !== null ? from : params.stack.startLaid ? Math.min(1, n) : 0
    // Kịch bản dùng ĐÚNG cách chia chặng của lúc cuộn tay, chỉ khác là lực chốt 1×.
    const base = anim ? { ...params, motion: { ...params.motion, anim } } : params
    const T = phaseTimes(base, 1, null)
    const segs = []
    for (let k = Math.ceil(start); k < n; k++) segs.push({ hold, ...T, from: k, to: k + 1 })
    if (params.outro.on && n) {
      const dur = Math.max(120, params.outro.dur)
      segs.push({ hold: Math.max(0, params.outro.lead), air: 1, fly: dur, lay: 0, total: dur, from: n, to: n + 1 })
    }
    const total = segs.reduce((sum, s) => sum + s.hold + s.total, 0) + tail
    state.script = { t0: performance.now(), start, segs, total, onDone }
    state.head = start
    // Kịch bản phải TIỀN ĐỊNH: lực cuộn chốt bằng 1× cho mọi tờ, không thì video xuất
    // ra phụ thuộc vào cú lăn chuột cuối cùng của người dùng.
    state.lastForce = 1
    burst = 0
    peak = 0
    pending = null
    state.queue.length = 0
    state.targetVel = 0
    burstAt = performance.now()
    for (const s of sheets) {
      resetSpring(s)
      s.force = 1
    }
    state.landed = countLanded()
    return total
  }

  const cancelScript = () => {
    state.script = null
  }

  /* ---- input ---- */

  let wheelAcc = 0
  let wheelTimer = 0
  let pending = null

  /*
   * Đo lực cuộn bằng CỬA SỔ SUY GIẢM: mỗi lần lăn thì cộng |deltaY| vào `burst`, còn
   * `burst` tự tắt dần theo hằng số thời gian 140ms trong vòng render. Nhờ vậy cùng một
   * tổng delta, giật một cái thì `burst` cao, kéo chậm thì nó tan đi trước khi đủ ngưỡng.
   *
   * Đo theo |delta|/dt tức thời thì không dùng được: một nấc con lăn chuột là MỘT sự
   * kiện delta 120px, dt ~0 → vận tốc vô hạn, cú nào cũng thành mạnh nhất.
   */
  let burst = 0
  let burstAt = performance.now()

  /*
   * Suy giảm theo ĐỒNG HỒ THẬT, không theo frame: vòng rAF bị tạm dừng (tab nền, pane
   * ẩn) thì `burst` sẽ cộng dồn mãi không tan, và cú cuộn nhẹ đầu tiên lúc quay lại
   * thành lực tối đa. Đã đo đúng lỗi này: trackpad kéo chậm ra 1.68× thay vì 0.5×.
   */
  const BURST_TAU = 0.14
  let peak = 0

  function decayBurst(now) {
    const dt = Math.max(0, (now - burstAt) / 1000)
    if (dt > 0) {
      burst *= Math.exp(-dt / BURST_TAU)
      burstAt = now
    }
    // Cửa sổ tan hết = cú cuộn đã xong, đỉnh của cú đó không còn nghĩa gì nữa.
    if (burst < 1) peak = 0
  }

  /*
   * Lực đọc theo ĐỈNH của cú cuộn, không theo giá trị tức thời. Hai lý do:
   *   1. Ngưỡng thả tờ bị vượt ngay ở đầu cú cuộn, lúc cửa sổ đo mới hứng được đúng
   *      phần ngưỡng — đọc tức thời thì cú giật mạnh và cú cuộn vừa ra cùng một số.
   *   2. Đỉnh không bị chính đà suy giảm trừ bớt trong lúc chờ chốt.
   */
  const forceNow = () => {
    if (!params.force.on) return 1
    decayBurst(performance.now())
    const f = params.force
    return clamp(Math.max(burst, peak) / Math.max(1, f.ref), f.min, f.max)
  }

  /** Độ ghép: lực f tác động vào một đại lượng với trọng số params.force[key]. */
  const fmul = (f, key) => 1 + (f - 1) * params.force[key]

  function onWheel(e) {
    if (state.script) return
    e.preventDefault()
    const now = performance.now()
    decayBurst(now)
    burst += Math.abs(e.deltaY)
    if (burst > peak) peak = burst
    const sens = Math.max(0.05, params.motion.sensitivity)
    if (params.motion.mode === 'snap') {
      wheelAcc += e.deltaY
      clearTimeout(wheelTimer)
      wheelTimer = setTimeout(() => {
        wheelAcc = 0
      }, 140)
      const need = 42 / sens
      if (Math.abs(wheelAcc) >= need) {
        const dir = Math.sign(wheelAcc)
        wheelAcc = 0
        /*
         * HOÃN cú thả đúng `force.latch` ms rồi mới bay, để còn kịp nghe hết cú cuộn.
         * Trackpad đẩy hàng chục delta nhỏ: ngưỡng bị vượt sau 2-3 delta đầu, mà lúc đó
         * cú swipe mới đi được một phần — thả ngay thì cú giật mạnh cỡ nào cũng chỉ đo
         * ra lực bằng đúng ngưỡng. Tắt "lực cuộn" thì thả ngay, không có độ trễ nào.
         */
        if (params.force.on && params.force.latch > 0) {
          if (!pending) pending = { dir, at: now }
        } else {
          stepSnap(dir, 1)
        }
      }
    } else {
      state.lastForce = forceNow()
      const step = (e.deltaY / 480) * sens
      state.target = clamp(state.target + step, minHead(), maxHead())
      // Nạp thêm vận tốc cho đích: cuộn xong thả tay thì chồng giấy còn trôi tiếp.
      state.targetVel += (step * Math.max(0, params.motion.glide)) / 1000 * 3
    }
  }

  function onKey(e) {
    if (state.script) return
    const fwd = ['ArrowDown', 'ArrowRight', 'PageDown', ' '].includes(e.key)
    const back = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)
    if (!fwd && !back) return
    e.preventDefault()
    // Bàn phím không có "lực": truyền 1× thay vì đọc forceNow() — lúc không cuộn thì
    // cửa sổ đo đã tan về 0, đọc ra sẽ là lực YẾU NHẤT.
    if (params.motion.mode === 'snap') stepSnap(fwd ? 1 : -1, 1)
    else {
      state.lastForce = 1
      state.target = clamp(state.target + (fwd ? 1 : -1), minHead(), maxHead())
    }
  }

  /* ---- kéo tờ trong tool (chỉ khi edit) + kéo để scroll trên mobile ---- */

  const ray = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  const planeHit = new THREE.Vector3()

  function pointToPlane(e, y) {
    const rect = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    ray.setFromCamera(ndc, camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y)
    return ray.ray.intersectPlane(plane, planeHit) ? planeHit.clone() : null
  }

  /** Bắt tờ dưới con trỏ: xét hình chữ nhật ở hệ toạ độ riêng của tờ, từ trên xuống. */
  function pickSheet(e) {
    for (let i = sheets.length - 1; i >= 0; i--) {
      const s = sheets[i]
      if (!s.node.visible || progressOf(i) <= 0) continue
      const hit = pointToPlane(e, s.node.position.y)
      if (!hit) continue
      const dx = hit.x - s.node.position.x
      const dz = hit.z - s.node.position.z
      const c = Math.cos(-s.yawTotal)
      const sn = Math.sin(-s.yawTotal)
      const lx = dx * c - dz * sn
      const lz = dx * sn + dz * c
      if (Math.abs(lx) <= s.w / 2 && Math.abs(lz) <= s.h / 2) return { sheet: s, hit }
    }
    return null
  }

  function onPointerDown(e) {
    if (!state.edit && state.driver === 'page') return
    if (state.edit) {
      const pick = pickSheet(e)
      if (pick) {
        canvas.setPointerCapture(e.pointerId)
        state.dragging = {
          index: pick.sheet.index,
          mode: e.shiftKey ? 'rot' : 'move',
          ox: pick.hit.x - pick.sheet.node.position.x,
          oz: pick.hit.z - pick.sheet.node.position.z,
          startRot: pick.sheet.cfg.rot,
          startAngle: Math.atan2(pick.hit.z - pick.sheet.restZ, pick.hit.x - pick.sheet.restX),
        }
        if (state.onSelect) state.onSelect(pick.sheet.index)
        return
      }
      if (state.onSelect) state.onSelect(-1)
      return
    }
    // Ngoài tool: kéo dọc = scroll, cho cảm ứng.
    canvas.setPointerCapture(e.pointerId)
    state.dragging = { swipe: true, y: e.clientY, head: state.head, fired: false }
  }

  function onPointerMove(e) {
    const d = state.dragging
    if (!d) return
    if (d.swipe) {
      const dy = d.y - e.clientY
      if (params.motion.mode === 'snap') {
        if (!d.fired && Math.abs(dy) > 44) {
          stepSnap(Math.sign(dy))
          d.fired = true
        }
      } else {
        state.target = clamp(d.head + (dy / 260) * Math.max(0.05, params.motion.sensitivity), minHead(), maxHead())
      }
      return
    }
    const s = sheets[d.index]
    if (!s) return
    const hit = pointToPlane(e, s.node.position.y)
    if (!hit) return
    if (d.mode === 'rot') {
      const ang = Math.atan2(hit.z - s.restZ, hit.x - s.restX)
      const deg = d.startRot + ((ang - d.startAngle) * 180) / Math.PI
      if (state.onMoveSheet) state.onMoveSheet(d.index, { rot: Math.round(deg * 10) / 10 })
    } else {
      const x = (hit.x - d.ox - (s.restX - s.cfg.x * AW)) / AW
      const z = (hit.z - d.oz - (s.restZ - s.cfg.y * AH)) / AH
      if (state.onMoveSheet) {
        state.onMoveSheet(d.index, {
          x: Math.round(clamp(x, -1.2, 1.2) * 1000) / 1000,
          y: Math.round(clamp(z, -1.2, 1.2) * 1000) / 1000,
        })
      }
    }
  }

  function onPointerUp(e) {
    if (state.dragging) {
      try { canvas.releasePointerCapture(e.pointerId) } catch { /* con trỏ đã rời */ }
      state.dragging = null
    }
  }

  if (state.driver !== 'page') container.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  if (!state.edit) {
    canvas.tabIndex = 0
    canvas.addEventListener('keydown', onKey)
  }

  /* ---- driver theo scroll của trang (dùng cho snippet nhúng) ---- */

  function pageHead() {
    const box = container.getBoundingClientRect()
    const scroller = container.parentElement
    if (!scroller) return state.head
    const sb = scroller.getBoundingClientRect()
    const span = Math.max(1, sb.height - box.height)
    // Khối dính không nhất thiết ở top 0 (site có header cố định thì dính dưới header):
    // nó dính từ lúc sb.top = top tới lúc sb.top = top − span, nên phải bù đúng `top`.
    const top = parseFloat(getComputedStyle(container).top) || 0
    const done = clamp01((top - sb.top) / span)
    // Từ minHead chứ không từ 0: bật "tờ đầu nằm sẵn" thì khúc cuộn đầu tiên không bị
    // phí cho tờ đã nằm trên bàn — đúng như hai driver kia.
    return lerp(minHead(), maxHead(), done)
  }

  /* ---- kích cỡ ---- */

  let viewW = 0
  let viewH = 0

  function resize() {
    const cw = container.clientWidth || 640
    const ch = container.clientHeight || 800
    let w = cw
    let h = w / aspect
    if (h > ch) {
      h = ch
      w = h * aspect
    }
    viewW = Math.max(2, Math.floor(w))
    viewH = Math.max(2, Math.floor(h))
    canvas.style.width = `${viewW}px`
    canvas.style.height = `${viewH}px`
    renderer.setSize(viewW, viewH, false)
    camera.aspect = aspect
    camera.updateProjectionMatrix()
    drawBackground()
    dirty = true
  }

  /** Đổi sang độ phân giải xuất video (không đụng tới cỡ hiển thị). */
  function setRenderSize(w, h) {
    renderer.setPixelRatio(1)
    renderer.setSize(w, h, false)
    canvas.style.width = `${viewW}px`
    canvas.style.height = `${viewH}px`
    dirty = true
  }

  function restoreRenderSize() {
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1, Math.sqrt(4.2e6 / Math.max(1, innerWidth * innerHeight)))) // ngân sách điểm ảnh cho màn rất lớn
    renderer.setSize(viewW, viewH, false)
    canvas.style.width = `${viewW}px`
    canvas.style.height = `${viewH}px`
    dirty = true
  }

  /* ---- áp tham số ---- */

  const geomSig = () =>
    `${params.frame.ratio}:${params.frame.cw}:${params.frame.ch}:${params.stack.size}:${params.paper.segments}:` +
    sheets.map((s) => s.cfg.scale).join(',')

  function applyParams(patch) {
    const before = geomSig()
    if (patch) {
      const next = mergeParams(patch)
      for (const k of Object.keys(next)) Object.assign(params[k], next[k])
    }
    applyFrame()
    drawBackground()
    ambient.intensity = params.light.ambient
    key.intensity = params.light.key
    fill.intensity = params.light.fill
    for (const s of sheets) {
      s.front.material.roughness = params.paper.roughness
      s.back.material.color.set(params.paper.back)
      const fadeOn = params.entry.fade > 0
      s.front.material.transparent = fadeOn
      s.back.material.transparent = fadeOn
      if (!fadeOn) {
        s.front.material.opacity = 1
        s.back.material.opacity = 1
      }
    }
    // Dựng lại lưới là việc đắt nhất ở đây, chỉ làm khi kích thước thật sự đổi —
    // không thì kéo slider ánh sáng cũng dựng lại cả chồng mỗi frame.
    if (geomSig() !== before) for (const s of sheets) rebuildGeometry(s, s.front.material.map.image)
    fitCamera()
    resize()
    dirty = true
  }

  /* ---- vòng render ---- */

  let last = performance.now()
  let lastHead = -1
  let raf = 0
  let alive = true

  // Nhúng giữa một trang dài thì phần lớn thời gian khối nằm ngoài màn — khỏi vẽ WebGL
  // mỗi frame. Chỉ áp cho driver 'page': tool và driver wheel luôn đang được nhìn.
  let onScreen = true
  const io =
    state.driver === 'page' && typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver(([e]) => (onScreen = e.isIntersecting))
      : null
  io?.observe(container)

  function frame(now) {
    if (!alive) return
    raf = requestAnimationFrame(frame)
    const dt = Math.min(1 / 20, Math.max(1 / 480, (now - last) / 1000))
    last = now
    if (!onScreen) return
    if (state.driver === 'page') {
      // Scroll của trang nhảy theo từng nấc của hệ điều hành; nội suy bằng cùng hằng số
      // "độ trễ khi kéo" cho ra cảm giác smooth scroll mà không cần thư viện ngoài.
      const target = pageHead()
      const tau = Math.max(0, params.motion.damping) / 1000
      state.head = tau > 0.016 ? lerp(state.head, target, 1 - Math.exp(-dt / tau)) : target
    } else tickHead(dt)
    // Lò xo chạy 2 bước nhỏ mỗi frame: tần số cao mà bước lớn thì lò xo tự bung.
    update(dt / 2)
    update(dt / 2)
    updateOutro()
    draw()
    if (state.onHead && Math.abs(state.head - lastHead) > 1e-4) {
      lastHead = state.head
      state.onHead(state.head)
    }
  }

  applyFrame()
  fitCamera()
  resize()
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  raf = requestAnimationFrame(frame)

  const ready = config.sheets && config.sheets.length ? setSheets(config.sheets) : Promise.resolve()

  return {
    canvas,
    renderer,
    params,
    ready,
    sheets,
    setSheets,
    updateSheet,
    applyParams,
    setHead,
    getHead: () => state.head,
    getForce: () => forceNow(),
    /** Thời lượng hai chặng ở lực 1×, để panel hiện số thật. */
    phaseTimes: () => phaseTimes(params, 1, null),
    /** Tổng |delta| còn lại trong cửa sổ đo — để hiệu chuẩn `force.ref`. */
    scrollBurst: () => burst,
    lastForce: () => state.lastForce,
    count: () => sheets.length,
    steps: () => stepCount(),
    stepSnap,
    playScript,
    cancelScript,
    scriptDone: () => !state.script || state.script.done,
    setRenderSize,
    restoreRenderSize,
    resize,
    setEdit: (v) => {
      state.edit = !!v
    },
    setSelected: (i) => {
      state.selected = i
    },
    renderOnce: () => {
      updateOutro()
      draw()
    },
    maxHead: () => maxHead(),
    /** Ảnh chụp trạng thái điều khiển — để soi khi nhịp chạy không như mong đợi. */
    inspect: () => ({
      mode: params.motion.mode,
      head: state.head,
      target: state.target,
      script: state.script ? { t: performance.now() - state.script.t0, total: state.script.total, segs: state.script.segs.length, done: !!state.script.done } : null,
      snap: state.snap ? { from: state.snap.from, to: state.snap.to, total: state.snap.total } : null,
      queue: state.queue.length,
      pending: !!pending,
    }),
    outroProgress: () => outroProgress(),
    dispose() {
      alive = false
      cancelAnimationFrame(raf)
      ro.disconnect()
      io?.disconnect()
      container.removeEventListener('wheel', onWheel)
      while (sheets.length) disposeSheet(sheets.pop())
      floor?.material.map?.dispose()
      floor?.material.dispose()
      floor?.geometry.dispose()
      overlayQuad.geometry.dispose()
      overlayQuad.material.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
