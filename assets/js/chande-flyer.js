/* =============================================================================
 * CHANDE — Bướm bay ra khỏi vòng tròn 1 rồi bay theo người xem tới cuối trang chủ
 * -----------------------------------------------------------------------------
 * Con bướm 3D trong lõi vòng tròn 1 (chande-koi.js) "thoát" ra khi:
 *   • nó đã hiện đủ lâu trong vòng (bubble đậu giữa lõi), hoặc
 *   • người xem cuộn qua cụm vòng tròn mà chưa thả nó (vòng 1 trôi lên quá mốc).
 * Từ đó bướm bay trên một canvas phủ cả màn (fixed, không bắt chuột): mỗi section trang
 * chủ có một ĐIỂM ĐẬU riêng trên màn (CONFIG.pos — chỉnh trong bảng setting, tab "Bướm
 * bay"); cuộn tới section nào thì bướm lượn về điểm của section đó, quanh điểm thì chao
 * lượn nhẹ (wander), đầu hướng theo đường bay, nghiêng cánh khi đổi hướng, vỗ cánh nhanh
 * hơn khi bay xa. Section = section đang nằm ở giữa màn.
 * Dùng chung ảnh bướm + cách dựng hai cánh với chande-koi.js (dựng lại ở đây — module
 * kia không xuất hàm).
 *
 * Module — nạp three (động) khi bướm thoát. Chỉ trang chủ; mount / gỡ theo Barba.
 * API: window.CHANDE_FLYER = { config, defaults, refresh(), mount(root), destroy(), release() }
 * ========================================================================== */
let THREE = null
const loadThree = () => import('../vendor/three/three.module.min.js').then((m) => (THREE = m))

// điểm đậu theo section: x, y = phần của màn (0 = trái / trên, 1 = phải / dưới)
const SECTIONS = [
  ['hero', 'Hero'],
  ['intro', 'Intro'],
  ['story', 'Story (06 years)'],
  ['scheme', 'Scheme'],
  ['strip', 'Dải ảnh'],
  ['land', 'Phong cảnh'],
  ['about', 'About (3 vòng tròn)'],
  ['poster', 'Poster 3D'],
  ['agenda', 'Agenda'],
  ['wall', 'Tường ảnh'],
  ['quote', 'Cảm nhận'],
  ['colors', 'Dải màu'],
  ['foot', 'Footer'],
]
const CONFIG = {
  enabled: true,
  size: 180, // sải cánh (px ở khổ 1920, co theo bề ngang màn)
  speed: 520, // tốc độ bay tối đa (px/s ở khổ 1920)
  steer: 2.4, // độ bám điểm đậu (cao = rẽ gắt, tới nhanh)
  wander: 70, // bán kính chao lượn quanh điểm đậu (px ở khổ 1920)
  flap: 1.1, // nhịp vỗ cánh khi lượn (lần / giây) — bay nhanh thì vỗ nhanh hơn
  holdIn: 1.2, // bướm hiện trong vòng 1 đủ bao nhiêu giây thì bay ra (s)
  shadow: 0.22, // độ đậm bóng mờ dưới bướm
  // BIẾN HÌNH: theo cụm vòng tròn màu ở cuối section Poster 3D (outro của paper-stack —
  // CHANDE_POSTER.api.outroProgress(): 0 = chưa nở, 1 = đã phủ kín). Lúc vòng tròn đang nở, bướm
  // chui xuống DƯỚI canvas poster (bị vòng tròn đè, khuất) và hoá thành bướm cánh lime
  // (assets/img/home/butterfly-lime.webp) — tan dạng hạt, mép tan ánh neon. Cuộn ngược lên tới
  // các poster (vòng tròn thu về) thì hoá ngược lại thành bướm cũ.
  morph: {
    on: true,
    section: 'poster', // section có cụm vòng tròn
    under: true, // vòng tròn đè lên bướm (phần bướm trong vòng bị che)
    time: 0.6, // thời gian tan hạt (s)
    grain: 46, // độ mịn hạt tan (số hạt trên sải cánh)
    edge: '#5BE83B', // màu mép tan
  },

  // ĐẬU (trên hình bướm ở poster — posterPerch): chọc chuột thì bay lên lượn rồi đậu lại
  perch: {
    poke: 0.6, // chuột cách bướm chưa tới (× sải cánh) là bị chọc
    away: 3.5, // bay lượn bao lâu (s) rồi mới quay lại đậu
    rest: 0.35, // lúc đậu: nhịp đung đưa (khép mở nhẹ) giữa các lần vỗ (lần / giây)
    gap: 4, // lúc đậu: trung bình bao nhiêu giây thì vỗ cánh một lần (ngẫu nhiên 0.5–1.5 lần số này)
  },
  // ĐẬU LÊN HÌNH BƯỚM Ở POSTER: ở section Poster (lúc các tờ poster đang bày, chưa nở vòng tròn),
  // bướm đáp đúng lên hình con bướm ghép ô màu in trên tờ poster 1 (tờ "Sơn Tùng"), giữ cỡ
  // thường, đầu theo chiều tờ giấy (tờ xoay / cong thì bám theo). Chọc vào cũng bay như ở footer.
  posterPerch: {
    on: true,
    section: 'poster',
    sheet: 0, // tờ thứ mấy trong chồng poster (0 = tờ đầu)
    u: 0.5, // tâm hình bướm trên tờ: ngang (0 = trái, 1 = phải)
    v: 0.34, // dọc, tính từ mép TRÊN tờ (0 = trên, 1 = dưới)
    flat: 0.15, // độ khép mở cánh lúc đậu (0 = phẳng hẳn như in trên giấy)
  },
  pos: {
    hero: { x: 0.82, y: 0.3 },
    intro: { x: 0.78, y: 0.28 },
    story: { x: 0.18, y: 0.3 },
    scheme: { x: 0.85, y: 0.25 },
    strip: { x: 0.15, y: 0.7 },
    land: { x: 0.8, y: 0.35 },
    about: { x: 0.5, y: 0.22 },
    poster: { x: 0.2, y: 0.25 },
    agenda: { x: 0.86, y: 0.3 },
    wall: { x: 0.14, y: 0.35 },
    quote: { x: 0.82, y: 0.7 },
    colors: { x: 0.5, y: 0.3 },
    foot: { x: 0.78, y: 0.28 },
  },
}
window.CHANDE_SETTINGS_APPLY?.('flyer', CONFIG)
const DEFAULTS = structuredClone(CONFIG)
const api = { config: CONFIG, defaults: DEFAULTS, sections: SECTIONS, refresh() {}, mount() {}, destroy() {}, release() {} }
window.CHANDE_FLYER = api

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

const BUTTERFLY_IMG = new URL('../img/home/butterfly-top.webp', import.meta.url).href
const BF_ASPECT = 764 / 1024 // cao / rộng ảnh
// bướm sau biến hình — cùng khung 1024 × 764, thân đúng giữa, đầu ở mép trên
const BUTTERFLY2_IMG = new URL('../img/home/butterfly-lime.webp', import.meta.url).href

// Bướm sải cánh 1 đơn vị (trục Y), thân dọc trục X (đầu về +X), lưng hướng +Z — như chande-koi.js
function buildButterfly() {
  const group = new THREE.Group()
  const tex = new THREE.TextureLoader().load(BUTTERFLY_IMG)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, roughness: 0.75, depthWrite: false })
  // Biến hình (CONFIG.morph): ảnh bướm thứ hai cùng khung (thân giữa ảnh, đầu ở mép trên), tan
  // dạng hạt từ ảnh 1 sang ảnh 2 theo uMix (0..1), mép tan ánh màu uEdge
  const tex2 = new THREE.TextureLoader().load(BUTTERFLY2_IMG)
  tex2.colorSpace = THREE.SRGBColorSpace
  tex2.anisotropy = 4
  const U = {
    uMix: { value: 0 },
    uMap2: { value: tex2 },
    uGrain: { value: 46 },
    uEdge: { value: new THREE.Color('#5BE83B') },
  }
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U)
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uMix, uGrain;\nuniform sampler2D uMap2;\nuniform vec3 uEdge;')
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
  if (uMix > 0.001) {
    // hạt vuông theo uv (gần tâm thân tan trước một chút -> lan từ thân ra mép cánh)
    vec2 g = floor(vMapUv * vec2(uGrain, uGrain * 0.75));
    float n = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
    float r = length((vMapUv - vec2(0.5, 0.45)) * vec2(1.0, 0.75));
    float th = n * 0.55 + r * 0.9;
    float k = uMix * 1.45;
    vec4 t2 = texture2D(uMap2, vMapUv) * vec4(diffuse, opacity);
    vec4 c = k > th ? t2 : diffuseColor;
    // mép tan: dải mỏng quanh ngưỡng -> ánh neon (chỉ ở chỗ có cánh)
    float e = 1.0 - smoothstep(0.0, 0.06, abs(k - th));
    float a = max(diffuseColor.a, t2.a);
    c.rgb = mix(c.rgb, uEdge, e * step(0.05, a) * step(0.001, uMix) * (1.0 - step(0.999, uMix)));
    c.a = (k > th ? t2.a : diffuseColor.a);
    c.a = max(c.a, e * a);
    diffuseColor = c;
  }
#endif`)
  }
  const half = (sd) => {
    const geo = new THREE.PlaneGeometry(0.5, BF_ASPECT)
    geo.translate(sd > 0 ? -0.25 : 0.25, 0, 0)
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, sd > 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
    geo.rotateZ(-Math.PI / 2)
    const pivot = new THREE.Group()
    pivot.add(new THREE.Mesh(geo, mat))
    group.add(pivot)
    return { pivot, sd }
  }
  const wings = [half(1), half(-1)]
  // transparent: thân / đầu mờ CÙNG cánh lúc chui vào vòng 1 (không bật thì opacity bị bỏ qua -> cánh
  // tan trước, còn trơ mỗi thân)
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#4c4a2a', roughness: 0.7, transparent: true })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.22, 6, 12), bodyMat)
  body.rotation.z = Math.PI / 2
  body.position.set(-0.07, 0, 0.012)
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), bodyMat)
  head.position.set(0.055, 0, 0.014)
  group.add(head)
  let ph = 0
  function update(dt, rate, amp = 1) {
    ph = (ph + dt * rate) % 1
    const e = ph < 0.42 ? ph / 0.42 : 1 - (ph - 0.42) / 0.58
    const k = e * e * (3 - 2 * e)
    const lift = (-0.12 + 1.15 * k) * amp + (1 - amp) * 0.1 // amp < 1: đậu, cánh mở gần phẳng, khép mở nhẹ
    wings.forEach(({ pivot, sd }) => (pivot.rotation.x = sd * lift))
    return k
  }
  update(0, 0)
  // m = mức biến hình (0 = bướm gốc, 1 = bướm lime)
  function morph(m) {
    const M = CONFIG.morph
    U.uMix.value = m
    U.uGrain.value = Math.max(4, +M.grain || 46)
    U.uEdge.value.set(M.edge || '#5BE83B')
  }
  const setPhase = (v) => (ph = v)
  return { group, update, morph, setPhase }
}

let live = null

function mount(root = document) {
  destroy()
  if (!CONFIG.enabled || reduced) return
  const scope = root.querySelector ? root : document
  const circle = scope.querySelector('.hs-about .circle[data-creature="butterfly"]')
  if (!circle) return
  const core = circle.querySelector('.core') || circle
  const sections = [...scope.querySelectorAll('.hero, .hs')]
    .map((el) => ({ el, key: el.classList.contains('hero') ? 'hero' : [...el.classList].find((c) => c.startsWith('hs-'))?.slice(3) }))
    .filter((o) => o.key)

  let gl = null
  let raf = 0
  let lastT = 0
  let t = 0
  let released = false
  let perched = false // đang đậu trên ô neon cuối trang
  let scaredUntil = 0 // bị chọc: bay lượn tới lúc này (giây của t) rồi mới về đậu
  let flee = null // điểm lượn khi bị chọc (phần màn)
  let returning = false // cuộn ngược lên tới vòng 1: bướm bay về, nhỏ dần rồi chui vào lõi
  let shownFor = 0
  // vị trí / vận tốc (px màn), hướng đầu (rad, trục màn: 0 = sang phải, y xuống)
  const P = { x: 0, y: 0, vx: 0, vy: 0, heading: -Math.PI / 2, roll: 0, s: 0, a: 0, m: 0, amp: 1, flapEnd: 0, nextFlap: 0 }

  const unit = () => innerWidth / 1920
  api.state = P

  function setup() {
    const canvas = document.createElement('canvas')
    canvas.className = 'cflyer'
    canvas.setAttribute('aria-hidden', 'true')
    // canvas NHỎ bao quanh con bướm (không phủ cả màn): mỗi khung chỉ vẽ ô S×S và dời ô theo bướm
    // bằng transform — canvas cả màn ở DPR 2 vẽ lại mỗi khung (kèm clip-path đổi liên tục) rất nặng
    canvas.style.cssText = 'position:fixed; left:0; top:0; pointer-events:none; z-index:9990; will-change:transform'
    document.body.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)) // bướm nhỏ, 1.5 đủ nét mà nhẹ hơn hẳn DPR 2
    const scene = new THREE.Scene()
    // camera trực giao theo px màn (gốc ở góc trên trái, y lên = -y màn)
    const camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000)
    scene.add(new THREE.HemisphereLight('#ffffff', '#5d6b4f', 1.15))
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(-2, 2.2, 1.6)
    scene.add(sun)
    const sc = document.createElement('canvas')
    sc.width = sc.height = 128
    const g = sc.getContext('2d')
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(0,0,0,1)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: CONFIG.shadow }),
    )
    shadow.renderOrder = -1
    scene.add(shadow)
    const bf = buildButterfly()
    bf.group.rotation.order = 'ZYX' // nghiêng (roll) quanh trục thân, rồi mới quay theo hướng bay
    scene.add(bf.group)
    // S = cạnh ô vẽ (px CSS, làm tròn bậc 64 cho đỡ cấp phát lại); vx, vy = góc trên trái ô trên màn
    const view = { S: 0, vx: 0, vy: 0 }
    const place = (cx, cy, size) => {
      const S = Math.max(128, Math.ceil((size * 2.6) / 64) * 64)
      if (S !== view.S) {
        view.S = S
        renderer.setSize(S, S, false)
        canvas.style.width = `${S}px`
        canvas.style.height = `${S}px`
      }
      view.vx = Math.round(cx - S / 2)
      view.vy = Math.round(cy - S / 2)
      camera.left = view.vx
      camera.right = view.vx + S
      camera.top = -view.vy
      camera.bottom = -(view.vy + S)
      camera.updateProjectionMatrix()
      canvas.style.transform = `translate3d(${view.vx}px, ${view.vy}px, 0)`
    }
    const resize = () => (view.S = 0)
    addEventListener('resize', resize)
    gl = { canvas, renderer, scene, camera, shadow, bf, resize, place, view }
  }

  // section đang ở giữa màn
  function currentKey() {
    const mid = innerHeight * 0.5
    let best = null
    for (const o of sections) {
      const r = o.el.getBoundingClientRect()
      if (r.top <= mid && r.bottom > mid) best = o.key
    }
    return best || (sections.length && sections[sections.length - 1].el.getBoundingClientRect().bottom < innerHeight ? sections[sections.length - 1].key : 'hero')
  }

  // Thả bướm: từ điểm (x, y) trên màn, cỡ s (sải cánh px), hướng h — mặc định tâm lõi vòng 1
  function release(from) {
    if (released) return
    released = true
    returning = false
    P.in = false
    if (window.CHANDE_KOI) window.CHANDE_KOI.escaped = true
    const k = core.getBoundingClientRect()
    P.x = from?.x ?? k.left + k.width / 2
    P.y = from?.y ?? k.top + k.height / 2
    P.s = from?.s ?? k.width * 0.42
    P.heading = from?.heading ?? -Math.PI / 2
    // bật lên khỏi vòng
    P.vx = Math.cos(P.heading) * 160 * unit()
    P.vy = -220 * unit()
    P.a = from ? 1 : 0
    loadThree().then(() => {
      if (live !== me) return
      if (!gl) setup()
      gl.bf.group.visible = true
      gl.shadow.visible = true
      start()
    })
  }

  const start = () => {
    if (raf) return
    lastT = 0
    raf = requestAnimationFrame(tick)
  }

  // Vòng ngoài cùng của cụm vòng tròn (outro poster) lúc này — cùng công thức paper-stack.js
  // (vòng 0 khởi hành đầu tiên, to nhất; mọi vòng khác nằm trong nó). Trả { x, y, r, pin }
  // theo px màn, hoặc null khi chưa nở / không có poster.
  let easeFn = (kind, mode, t) => t
  import('./paper-stack.js').then((m) => m.easeCurve && (easeFn = m.easeCurve)).catch(() => {})
  function outerRing() {
    const pa = window.CHANDE_POSTER?.api
    const o = pa?.params?.outro
    const op = outro()
    const sec = morphSec()
    const pinEl = sec?.querySelector('.hs-poster__pin') || sec
    if (!o?.on || op <= 0 || !pinEl) return null
    const n = (o.colors || []).filter((c) => typeof c === 'string' && c).slice(0, 16).length
    if (!n) return null
    const rect = pinEl.getBoundingClientRect()
    if (rect.bottom <= 0 || rect.top >= innerHeight) return null // khung poster đã trôi khỏi màn
    const aspect = rect.width / Math.max(1, rect.height)
    const ox = Math.min(Math.max(o.originX, 0), 1)
    const oy = Math.min(Math.max(o.originY, 0), 1)
    let rMax = 0
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) rMax = Math.max(rMax, Math.hypot((cx - ox) * aspect, cy - oy))
    rMax *= Math.max(1, o.scale)
    const stag = Math.min(Math.max(o.stagger, 0), n > 1 ? 0.9 / (n - 1) : 0.9)
    const span = Math.max(0.05, 1 - Math.min(Math.max(o.hold, 0), 0.6) - (n - 1) * stag)
    const rad = (i) => easeFn(o.easing, o.easeMode, Math.min(Math.max((op - i * stag) / span, 0), 1)) * rMax * rect.height
    // vòng trong cùng (màu kem) không che: Agenda hiện xuyên qua nó (chande-poster.js cắt Agenda
    // theo vòng này) -> vùng che = vành giữa vòng ngoài cùng và vòng trong cùng
    return { x: rect.left + ox * rect.width, y: rect.top + (1 - oy) * rect.height, r: rad(0), rIn: n > 1 ? rad(n - 1) : 0, pin: rect }
  }
  // Cắt canvas bướm: bỏ phần nằm trên vành vòng tròn màu (giữa vòng ngoài cùng và vòng trong cùng)
  // — vòng tròn đè lên bướm. Bướm vẫn bay bình thường: ngoài vành hay trong lòng vòng trong cùng
  // (Agenda đã hiện) thì vẫn thấy.
  let clipNow = ''
  function clipBy(ring, box) {
    // toạ độ màn -> toạ độ trong ô vẽ (canvas nhỏ theo bướm)
    const { S, vx, vy } = gl.view
    const f = (n) => n.toFixed(1)
    const X = (x) => f(x - vx)
    const Y = (y) => f(y - vy)
    const full = `M0 0H${S}V${S}H0Z`
    const rect = (l, t, r, b) => `M${X(l)} ${Y(t)}H${X(r)}V${Y(b)}H${X(l)}Z`
    let v = ''
    if (box && !ring) {
      // khối footer đè lên bướm: cắt bỏ phần bướm nằm trong khối
      if (box.r > vx && box.l < vx + S && box.b > vy && box.t < vy + S) v = `path(evenodd, "${full}${rect(box.l, box.t, box.r, box.b)}")`
    }
    if (ring && ring.r > 0.5) {
      const p = ring.pin
      const far = Math.hypot(Math.max(ring.x - p.left, p.right - ring.x), Math.max(ring.y - p.top, p.bottom - ring.y))
      const circ = (r) => `M${X(ring.x - r)} ${Y(ring.y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`
      // vòng trong cùng đã phủ kín khung -> Agenda hiện hết, không che gì nữa
      if (ring.rIn < far) {
        // evenodd: ngoài vòng ngoài = thấy, trên vành = khuất, trong vòng trong cùng = thấy
        const outer = ring.r >= far ? rect(p.left, p.top, p.right, p.bottom) : circ(ring.r)
        v = `path(evenodd, "${full}${outer}${ring.rIn > 0.5 ? circ(ring.rIn) : ''}")`
      }
    }
    if (v !== clipNow) gl.canvas.style.clipPath = clipNow = v
  }

  // mức biến hình theo vị trí cuộn: trước section = 0, qua section = 1
  const morphSec = () => sections.find((o) => o.key === CONFIG.morph?.section)?.el
  // độ nở của cụm vòng tròn (outro poster): 0..1; chưa có poster -> 0
  const outro = () => {
    try {
      return Math.min(1, Math.max(0, +window.CHANDE_POSTER?.api?.outroProgress?.() || 0))
    } catch {
      return 0
    }
  }
  // Cụm vòng tròn là CỬA CHUYỂN giữa hai dạng: phía poster (ngoài vòng ngoài cùng) = bướm cũ,
  // phía Agenda (trong lòng vòng trong cùng) = bướm mới; đổi dạng lúc đi qua DƯỚI vành màu (khuất).
  // Không có vòng (chưa nở / đã qua hẳn) thì theo section: trước Poster = cũ, sau Poster = mới.
  const keyIdx = (k) => SECTIONS.findIndex(([x]) => x === k)
  function formWant(ring, key, tx, ty) {
    const M = CONFIG.morph
    // vòng chưa có / đã trôi khỏi màn: trước Poster = cũ, sau Poster = mới; trong Poster mà cụm
    // vòng đã nở hết (phủ kín) cũng là đã qua cửa -> mới
    if (!ring) return keyIdx(key) > keyIdx(M.section) || (key === M.section && outro() >= 0.999) ? 1 : 0
    if (outro() >= 0.999) return 1
    const d = Math.hypot(P.x - ring.x, P.y - ring.y)
    if (d < ring.rIn) return 1
    if (d > ring.r) return 0
    // trên vành: theo phía đang bay tới
    return Math.hypot(tx - ring.x, ty - ring.y) < ring.rIn ? 1 : 0
  }
  function onBand(ring) {
    if (!ring) return false
    const d = Math.hypot(P.x - ring.x, P.y - ring.y)
    return d < ring.r - P.s * 0.15 && d > ring.rIn + P.s * 0.15
  }
  function morphStep(want, hidden, dt) {
    const M = CONFIG.morph
    if (!M?.on) return (P.m = 0)
    // đang khuất dưới vành: tan nhanh; đang lộ (hiếm — vd nhảy cuộn) thì tan chậm hơn
    const T = Math.max(0.05, M.time || 0.6) * (hidden ? 1 : 1.6)
    P.m += (want - P.m) * (1 - Math.exp((-dt / T) * 3))
    if (Math.abs(want - P.m) < 0.002) P.m = want
    return P.m
  }

  // Toạ độ màn của hình bướm trên tờ poster (chiếu đỉnh lưới tờ giấy — tờ đang cong cũng đúng)
  let vA = null
  function posterSpot(key) {
    const PP = CONFIG.posterPerch
    if (!PP?.on || key !== PP.section || outro() > 0.001) return null
    const pa = window.CHANDE_POSTER?.api
    const sh = pa?.sheets?.[PP.sheet]
    if (!sh?.geom || !sh.front || !pa.camera) return null
    vA ||= new THREE.Vector3()
    const pos = sh.geom.attributes.position
    const gx = sh.geom.parameters.widthSegments
    const gy = sh.geom.parameters.heightSegments
    const rc = pa.canvas.getBoundingClientRect()
    const pt = (u, vt) => {
      const ix = Math.min(gx, Math.max(0, Math.round(u * gx)))
      const iy = Math.min(gy, Math.max(0, Math.round(vt * gy))) // hàng 0 = mép trên ảnh
      vA.fromBufferAttribute(pos, iy * (gx + 1) + ix)
      sh.front.localToWorld(vA)
      vA.project(pa.camera)
      return { x: rc.left + ((vA.x + 1) / 2) * rc.width, y: rc.top + ((1 - vA.y) / 2) * rc.height, z: vA.z }
    }
    const c = pt(PP.u, PP.v)
    if (c.z > 1 || c.x < 0 || c.x > innerWidth || c.y < 0 || c.y > innerHeight) return null
    const up = pt(PP.u, PP.v - 0.06)
    // giữ nguyên cỡ bướm (không co / phóng theo hình in trên poster)
    return { x: c.x, y: c.y, s: CONFIG.size * unit(), heading: Math.atan2(up.y - c.y, up.x - c.x), amp: PP.flat }
  }

  function tick(now) {
    raf = 0
    if (live !== me || !gl) return
    const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0
    lastT = now
    t += dt
    const u = unit()
    const key = currentKey()
    const p = CONFIG.pos[key] || { x: 0.8, y: 0.3 }
    // điểm đậu + chao lượn (lissajous chậm); đang về vòng 1 thì điểm = tâm lõi, không chao
    const kr = core.getBoundingClientRect()
    const PC = CONFIG.perch
    // khối footer bướm chui vào (CONFIG.hide)
    let hiding = false
    const HD = CONFIG.hide
    let hideBox = null
    if (HD?.on) {
      const a = document.querySelector(HD.from)?.getBoundingClientRect()
      const f = document.querySelector('.hs-foot')?.getBoundingClientRect()
      if (a && f && a.width && f.bottom > 0 && a.top < innerHeight) hideBox = { l: a.left, t: a.top, r: innerWidth, b: f.bottom }
    }
    // chỗ đậu: hình bướm trên poster 1 (section Poster)
    let spot = !returning && t >= scaredUntil ? posterSpot(key) : null
    // lọc êm chỗ đậu: tờ poster rung / nảy mỗi lần có tờ mới tiếp đất -> điểm chiếu giật theo;
    // làm mượt (~0.5 s) để bướm không rung theo cú nảy, chỉ trôi theo khi tờ thật sự dời chỗ
    if (spot) {
      const F = P.spot
      if (!F || Math.hypot(F.x - spot.x, F.y - spot.y) > 200 * u) P.spot = { ...spot }
      else {
        const kf = 1 - Math.exp(-dt * 2)
        F.x += (spot.x - F.x) * kf
        F.y += (spot.y - F.y) * kf
        let dh = spot.heading - F.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        F.heading += dh * kf
        F.s = spot.s
        F.amp = spot.amp
      }
      spot = P.spot
    } else P.spot = null
    const perchHere = !!spot
    const W = returning || perchHere ? 0 : CONFIG.wander * u
    let tx = returning ? kr.left + kr.width / 2 : p.x * innerWidth + Math.sin(t * 0.53) * W + Math.sin(t * 1.31) * W * 0.35
    let ty = returning ? kr.top + kr.height / 2 : p.y * innerHeight + Math.sin(t * 0.71 + 1.3) * W * 0.6 + Math.cos(t * 1.7) * W * 0.25
    // vòng trong cùng (Agenda lộ ra) đã mở đủ rộng -> bướm (đã hoá xong dưới vành màu) bay ra vào
    // lòng vòng đó, lượn phía trên cụm chữ Agenda
    const ringNow = !returning && CONFIG.morph?.on && CONFIG.morph.under ? outerRing() : null
    // đang ở dưới vành mà chưa đổi dạng xong -> nấp lại trên vành tới khi xong rồi mới đi tiếp
    const midWant = ringNow ? formWant(ringNow, key, ringNow.x, ringNow.y - ringNow.rIn * 0.6) : 0
    const hideMid = ringNow && onBand(ringNow) && Math.abs(P.m - (ringNow.rIn > P.s * 1.6 ? midWant : 0)) > 0.02
    if (hideMid) {
      const ang = Math.atan2(P.y - ringNow.y, P.x - ringNow.x)
      const rm = (ringNow.r + ringNow.rIn) / 2
      tx = ringNow.x + Math.cos(ang) * rm
      ty = ringNow.y + Math.sin(ang) * rm
    } else if (ringNow && ringNow.rIn > P.s * 1.6 && ringNow.rIn < ringNow.r) {
      const ry = Math.max(innerHeight * 0.18, ringNow.y - ringNow.rIn * 0.62)
      tx = ringNow.x + ringNow.rIn * 0.28 + Math.sin(t * 0.6) * CONFIG.wander * u * 0.5
      ty = ry + Math.cos(t * 0.8) * CONFIG.wander * u * 0.3
    } else if (!returning && hideBox && key === HD.section && t >= scaredUntil) {
      hiding = true
      tx = hideBox.l + (hideBox.r - hideBox.l) * HD.x
      ty = hideBox.t + (hideBox.b - hideBox.t) * HD.y
    } else if (perchHere) {
      tx = spot.x
      ty = spot.y
    } else if (t < scaredUntil && flee) {
      tx = flee.x * innerWidth + Math.sin(t * 1.1) * CONFIG.wander * u
      ty = flee.y * innerHeight + Math.cos(t * 1.4) * CONFIG.wander * u * 0.6
    }
    // lái: vận tốc mong muốn hướng về điểm, chậm dần khi tới gần (arrive)
    const dx = tx - P.x
    const dy = ty - P.y
    const d = Math.hypot(dx, dy) || 1
    const vmax = CONFIG.speed * u
    const want = Math.min(vmax, d * CONFIG.steer)
    const ax = ((dx / d) * want - P.vx) * CONFIG.steer
    const ay = ((dy / d) * want - P.vy) * CONFIG.steer
    P.vx += ax * dt
    P.vy += ay * dt
    // đang chui vào khối footer: đã vào hẳn trong khối thì hãm mạnh, đứng yên khuất sau khối (không
    // nảy qua lại nhô ra mép trên)
    if (hiding && P.x > hideBox.l + P.s * 0.6 && P.y > hideBox.t + P.s * 0.6) {
      const k = Math.exp(-dt * 6)
      P.vx *= k
      P.vy *= k
    }
    P.x += P.vx * dt
    P.y += P.vy * dt
    // sát chỗ đậu thì đáp hẳn: đứng yên, đầu quay lên (bụng chạm mép)
    if (perchHere && Math.hypot(tx - P.x, ty - P.y) < 10 * u) perched = true
    if (!perchHere) perched = false
    if (perched) {
      P.x += (tx - P.x) * (1 - Math.exp(-dt * 10))
      P.y += (ty - P.y) * (1 - Math.exp(-dt * 10))
      P.vx = 0
      P.vy = 0
      let dh = spot.heading - P.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      P.heading += dh * (1 - Math.exp(-dt * 5))
    }
    // hướng đầu theo đường bay (chỉ khi đang bay đủ nhanh), nghiêng theo tốc độ rẽ
    const sp = Math.hypot(P.vx, P.vy)
    let turn = 0
    if (sp > 12 * u) {
      const h = Math.atan2(P.vy, P.vx)
      let dh = h - P.heading
      dh = Math.atan2(Math.sin(dh), Math.cos(dh))
      const step = dh * (1 - Math.exp(-dt * 6))
      P.heading += step
      turn = dt ? step / dt : 0
    }
    P.roll += (Math.max(-0.6, Math.min(0.6, -turn * 0.25)) - P.roll) * (1 - Math.exp(-dt * 5))
    // cỡ: từ cỡ trong vòng về cỡ bay; đang về thì nhỏ dần theo khoảng cách tới lõi (tới nơi = cỡ
    // bướm trong vòng), sát tâm thì mờ đi -> như chui vào lòng vòng tròn
    if (returning) {
      const inS = kr.width * 0.42
      const near = Math.min(1, d / (kr.width * 1.2))
      P.s += (inS + (CONFIG.size * u - inS) * near - P.s) * (1 - Math.exp(-dt * 4))
      if (d < kr.width * 0.12) P.in = true // đã tới tâm: chốt, lượn quá đà ra chút cũng không hiện lại
      const gone = P.in ? 0 : 1
      P.a += (gone - P.a) * (1 - Math.exp(-dt * (gone ? 4 : 5)))
      if (!gone && P.a < 0.02) {
        // đã chui vào: trả bướm cho vòng 1 (chande-koi.js vẽ lại khi bubble đậu giữa lõi), thôi bay
        returning = false
        released = false
        shownFor = 0
        if (window.CHANDE_KOI) window.CHANDE_KOI.escaped = false
        gl.bf.group.visible = false
        gl.shadow.visible = false
        gl.place(P.x, P.y, P.s)
        gl.renderer.render(gl.scene, gl.camera)
        return
      }
    } else {
      // tới gần chỗ đậu thì đổi dần về cỡ của chỗ đậu (hình bướm trên poster to / nhỏ theo tờ giấy)
      const near = perchHere ? Math.min(1, Math.hypot(spot.x - P.x, spot.y - P.y) / (260 * u)) : 1
      const sT = perchHere ? spot.s + (CONFIG.size * u - spot.s) * near : CONFIG.size * u
      P.s += (sT - P.s) * (1 - Math.exp(-dt * (perched ? 8 : 2)))
      P.a += (1 - P.a) * (1 - Math.exp(-dt * 4))
    }
    // Đậu: cánh đung đưa khép mở nhẹ (perch.rest), thỉnh thoảng (khoảng perch.gap giây) vỗ một–hai nhịp rồi lại nghỉ
    let rate = CONFIG.flap * (1 + Math.min(1, sp / Math.max(1, vmax)) * 0.4)
    let ampT = 1
    if (perched) {
      if (!P.flapEnd && t >= P.nextFlap) {
        const n = Math.random() < 0.35 ? 2 : 1
        gl.bf.setPhase(0)
        P.flapEnd = t + n / Math.max(0.1, CONFIG.flap * 1.3)
      }
      if (P.flapEnd && t < P.flapEnd) {
        rate = CONFIG.flap * 1.3
        ampT = 0.75
      } else {
        if (P.flapEnd) {
          gl.bf.setPhase(0) // vỗ xong: về đúng dáng nghỉ
          P.flapEnd = 0
          P.nextFlap = t + CONFIG.perch.gap * (0.5 + Math.random())
        }
        rate = CONFIG.perch.rest // đung đưa khép mở nhẹ như trước
        ampT = spot.amp
      }
    } else {
      P.flapEnd = 0
      P.nextFlap = t + 1.5 + Math.random() * 2
    }
    P.amp += (ampT - P.amp) * (1 - Math.exp(-dt * 6))
    const k = gl.bf.update(dt, rate, P.amp)
    // cụm vòng tròn màu (outro poster) đè lên bướm: cắt phần bướm nằm trong vòng; biến hình lúc khuất
    const ring = CONFIG.morph?.on && CONFIG.morph.under ? outerRing() : null
    gl.place(P.x, P.y, P.s) // ô vẽ theo bướm (trước khi cắt — toạ độ cắt tính theo ô)
    clipBy(ring, hideBox)
    // khuất hẳn (nằm trọn sau vành vòng tròn / trong khối footer) thì khỏi vẽ khung này
    const dRing = ring ? Math.hypot(P.x - ring.x, P.y - ring.y) : 0
    const behindRing = ring && dRing + P.s * 0.6 < ring.r && dRing - P.s * 0.6 > ring.rIn
    const inBox = hideBox && P.x - P.s * 0.6 > hideBox.l && P.x + P.s * 0.6 < hideBox.r && P.y - P.s * 0.6 > hideBox.t && P.y + P.s * 0.6 < hideBox.b
    const skipDraw = behindRing || inBox
    gl.bf.morph(morphStep(formWant(ring, key, tx, ty), onBand(ring), dt))
    const { group } = gl.bf
    // toạ độ màn -> cảnh (y lên)
    const bob = (0.5 - k) * P.s * 0.06
    group.position.set(P.x, -(P.y + bob), 10)
    group.rotation.set(P.roll, 0, -P.heading)
    group.scale.setScalar(P.s)
    group.traverse((o) => o.material && (o.material.opacity = P.a))
    const lift = P.s * (0.35 + 0.1 * k)
    gl.shadow.position.set(P.x + lift * 0.4, -(P.y + lift * 0.55), 0)
    gl.shadow.rotation.z = -P.heading
    gl.shadow.scale.set(P.s * 0.6, P.s * 0.45, 1)
    gl.shadow.material.opacity = CONFIG.shadow * P.a
    if (!skipDraw) gl.renderer.render(gl.scene, gl.camera)
    raf = requestAnimationFrame(tick)
  }

  // Chờ thả: bướm đã hiện đủ lâu trong vòng 1 (chande-koi.js báo vị trí qua sự kiện), hoặc
  // vòng 1 trôi lên quá 1/3 trên màn mà chưa thả -> bay ra từ tâm lõi.
  const onShown = (e) => {
    if (released) return
    shownFor = e.detail.for
    if (shownFor >= CONFIG.holdIn) release(e.detail)
  }
  document.addEventListener('chande-butterfly:shown', onShown)
  // chọc: chuột tới sát bướm đang đậu -> giật mình bay vọt lên, lượn quanh rồi mới về đậu lại
  const onPoke = (e) => {
    if (!released || !perched) return
    if (Math.hypot(e.clientX - P.x, e.clientY - P.y) > P.s * CONFIG.perch.poke) return
    perched = false
    scaredUntil = t + CONFIG.perch.away
    flee = { x: 0.25 + Math.random() * 0.5, y: 0.15 + Math.random() * 0.3 }
    const ang = Math.atan2(P.y - e.clientY, P.x - e.clientX)
    const v = CONFIG.speed * unit() * 0.9
    P.vx = Math.cos(ang) * v * 0.5
    P.vy = -Math.abs(Math.sin(ang) * v) - v * 0.5
  }
  addEventListener('pointermove', onPoke, { passive: true })
  addEventListener('pointerdown', onPoke, { passive: true })
  const onScroll = () => {
    const r = core.getBoundingClientRect()
    if (released) {
      // cuộn ngược lên, vòng 1 xuống lại quá nửa dưới màn -> bay về chui vào; cuộn xuống lại thì bay ra tiếp
      if (!returning && r.top > innerHeight * 0.2 && r.top < innerHeight) returning = true
      else if (returning && r.bottom < innerHeight * 0.35) (returning = false), (P.in = false)
      return
    }
    if (r.bottom < innerHeight * 0.35 && r.bottom > -innerHeight) release()
  }
  addEventListener('scroll', onScroll, { passive: true })

  const me = {
    el: circle,
    release,
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
      document.removeEventListener('chande-butterfly:shown', onShown)
      removeEventListener('scroll', onScroll)
      removeEventListener('pointermove', onPoke)
      removeEventListener('pointerdown', onPoke)
      if (gl) {
        removeEventListener('resize', gl.resize)
        gl.canvas.remove()
        gl.renderer.dispose()
        gl.renderer.forceContextLoss()
        gl = null
      }
      if (window.CHANDE_KOI) window.CHANDE_KOI.escaped = false
    },
  }
  live = me
  onScroll()
}

function destroy() {
  live?.stop()
  live = null
}

api.mount = mount
api.destroy = destroy
api.release = () => live?.release()
mount(document)
if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (live && data.current.container?.contains(live.el)) destroy()
  })
}
