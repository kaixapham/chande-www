/* =============================================================================
 * CHANDE — Hộp dụng cụ 3D ở góc dưới phải gallery (con dấu, bút, tẩy)
 * -----------------------------------------------------------------------------
 * Như khay bút của app vẽ: một khay bo tròn ở góc dưới phải canvas, đứng sẵn
 * hai con dấu cao su, một cây bút và một cục tẩy — tất cả 3D (three.js, nhựa
 * bóng). Bấm một món trong khay là cầm nó ra (to lên, lơ lửng theo chuột);
 * bấm lại hoặc Esc là cất về khay.
 *   • Con dấu: bấm (không kéo) vào canvas là dập xuống đúng chỗ đó; kéo thì vẫn
 *     kéo lưới. Điện thoại: chạm chỗ nào dấu bay tới dập chỗ đó.
 *   • Bút: giữ và kéo để viết / vẽ lên canvas (ngòi bám đúng con trỏ).
 *   • Tẩy: giữ và chà lên nét bút hoặc vết dấu để xoá.
 *   Đang cầm bút / tẩy thì kéo là vẽ / tẩy, không kéo lưới — lăn chuột vẫn đi
 *   được, hoặc cất về khay rồi kéo.
 * Màu, cỡ, độ nhoè, độ hằn… chỉnh ở bảng H (devtools) → tab Gallery → các mục
 * "Dụng cụ". Mực dấu mặc định đỏ như mẫu SVG gốc.
 * Vết in: tô màu mẫu SVG (assets/img/gallery/stamps/*.svg) bằng canvas — mực
 * nhoè loang nhẹ ra mép, ăn mực không đều (một phía đậm một phía nhạt, lốm đốm
 * chỗ thiếu mực), và giấy bị HẰN theo nét mẫu (bóng tối trong mép trên-trái,
 * gờ sáng mép dưới-phải). Mỗi vết loang / lốm đốm một kiểu. Vết in và nét bút
 * gắn toạ độ thế giới gallery nên trôi theo lưới.
 * Camera trực giao nghiêng CONFIG.tilt độ như vịt (chande-duck.js): điểm sàn
 * (X, 0, Z) hiện ở màn (X, Z·sin tilt), độ cao Y đẩy lên màn Y·cos tilt.
 * Module — nạp three từ assets/vendor/three. Mount / gỡ theo Barba.
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

const CONFIG = {
  size: 60, // px — bán kính đế dấu khi cầm ra (khổ desktop)
  tilt: 62, // độ — góc camera so với mặt sàn
  lift: 0.9, // × bán kính — độ cao lơ lửng của dấu khi cầm
  maxPrints: 48,
  ink: [0.86, 0.97], // độ đậm vết mực (ngẫu nhiên trong khoảng)
  spin: 24, // độ — vết mực xoay ngẫu nhiên ±spin
  bleed: 1, // độ nhoè mực (0 = nét sắc)
  deboss: 1, // độ hằn giấy (0 = phẳng)
  stamps: [
    { name: 'Dấu 1', svg: 'assets/img/gallery/stamps/stamp-001.svg', handle: '#68f12b', base: '#245535', ink: '#d00000' },
    { name: 'Dấu 2', svg: 'assets/img/gallery/stamps/stamp-002.svg', handle: '#e8e2cb', base: '#1b2625', ink: '#d00000' },
  ],
  pen: {
    name: 'Bút',
    size: 34, // px — một đơn vị hình bút khi cầm (bút dài ~3 đơn vị)
    color: '#1b2625', // màu mực (ngòi, vòng, nắp)
    body: '#e8e2cb', // thân bút
    width: 3, // px — độ dày nét
  },
  eraser: {
    name: 'Tẩy',
    size: 34, // px — một đơn vị hình tẩy khi cầm
    body: '#f4f3eb', // cao su
    sleeve: '#245535', // vỏ bọc
    radius: 18, // px — bán kính vùng tẩy
  },
}
// Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
window.CHANDE_SETTINGS_APPLY?.('stamps', CONFIG)
const DEFAULTS = structuredClone(CONFIG)

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255
}
// Mẫu in trên mặt núm: màu mực, trừ khi mực gần màu cán quá thì dùng màu đế.
const labelColor = (d) => (Math.abs(lum(d.ink) - lum(d.handle)) > 0.22 ? d.ink : d.base)

/* ------------------------------------------------------------- hình khối -- */
// Dựng với bán kính đế = 1, gốc = tâm mặt cao su chạm sàn.
const PAD_H = 0.05
const WELL_Y = 0.17
const TOP_Y = 1.5
const TOP_R = 0.33

// Mặt cắt đế: vành ngoài nhô cao, lòng trong lõm xuống.
const BASE_PROFILE = [
  [0.965, PAD_H],
  [0.995, 0.1],
  [1.0, 0.16],
  [0.985, 0.225],
  [0.945, 0.27],
  [0.88, 0.292],
  [0.8, 0.29],
  [0.745, 0.268],
  [0.71, 0.225],
  [0.675, 0.188],
  [0.62, WELL_Y + 0.004],
  [0.4, WELL_Y],
  [0, WELL_Y],
]
// Mặt cắt cán: chân loe, cổ thắt, núm tròn dẹt (mép bo).
const HANDLE_PROFILE = [
  [0.4, WELL_Y],
  [0.4, WELL_Y + 0.04],
  [0.37, WELL_Y + 0.12],
  [0.29, WELL_Y + 0.2],
  [0.215, 0.5],
  [0.19, 0.68],
  [0.205, 0.84],
  [0.27, 0.97],
  [0.37, 1.06],
  [0.425, 1.14],
  [0.44, 1.26],
  [0.435, 1.38],
  [0.41, 1.45],
  [0.37, 1.488],
  [TOP_R, TOP_Y],
]

function lathe(profile, smooth) {
  let pts = profile.map(([r, y]) => new THREE.Vector2(r, y))
  if (smooth) pts = new THREE.SplineCurve(pts).getPoints(smooth)
  pts.push(new THREE.Vector2(0, pts[pts.length - 1].y))
  const geo = new THREE.LatheGeometry(pts, 96)
  geo.computeVertexNormals()
  return geo
}

const plastic = (hex) =>
  new THREE.MeshPhysicalMaterial({
    color: hex,
    roughness: 0.34,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    sheen: 0.3,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.5),
  })
function paint(mat, hex) {
  mat.color.set(hex)
  mat.sheenColor.set(hex).lerp(new THREE.Color('#ffffff'), 0.5)
}

// Bộ khung chung của mọi dụng cụ:
// root (vị trí sàn + tỉ lệ px) > hover (độ nhấc) > tip (nghiêng theo quán tính)
// > orient (tư thế: bút lật ngược khi nằm khay) > squash (nảy khi chạm).
function rig() {
  const root = new THREE.Group()
  const hover = new THREE.Group()
  const tip = new THREE.Group()
  const orient = new THREE.Group()
  const squash = new THREE.Group()
  root.add(hover)
  hover.add(tip)
  tip.add(orient)
  orient.add(squash)
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    squash.add(m)
    return m
  }
  return { root, hover, tip, orient, squash, add }
}

// Vòng ngắm dưới sàn (chỉ chỗ sẽ in / vẽ / tẩy) — nằm ngoài khối nhấc.
function ringOf(hex, r0 = 0.9, r1 = 0.97) {
  const ringMat = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 72), ringMat)
  ring.rotation.x = -Math.PI / 2
  return { ring, ringMat }
}

function buildStamp(def) {
  const R = rig()
  const { add, squash } = R
  const pad = new THREE.CylinderGeometry(0.955, 0.94, PAD_H, 96)
  pad.translate(0, PAD_H / 2, 0)
  add(pad, new THREE.MeshStandardMaterial({ color: '#0f1513', roughness: 0.85 }))
  const baseMat = plastic(def.base)
  const handleMat = plastic(def.handle)
  add(lathe(BASE_PROFILE, 72), baseMat)
  add(lathe(HANDLE_PROFILE, 110), handleMat)

  // Mặt núm: mẫu in (texture tô từ SVG khi nạp xong).
  const labelMat = new THREE.MeshStandardMaterial({
    transparent: true,
    opacity: 0,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  const label = new THREE.Mesh(new THREE.CircleGeometry(TOP_R * 0.92, 64), labelMat)
  label.rotation.x = -Math.PI / 2
  label.position.y = TOP_Y + 0.002
  squash.add(label)

  return { ...R, ...ringOf(def.ink), baseMat, handleMat, labelMat, top: TOP_Y, wide: 2, foot: 2 }
}

// Bút: ngòi ở gốc toạ độ, thân dọc +Y. Ngòi + vòng + nắp màu mực, thân kem,
// phần vót màu gỗ.
const PEN_L = 2.97
function buildPen(def) {
  const R = rig()
  const { add } = R
  const inkMat = plastic(def.color)
  const bodyMat = plastic(def.body)
  const woodMat = new THREE.MeshStandardMaterial({ color: '#d6ceab', roughness: 0.7 })
  add(lathe([[0.001, 0], [0.045, 0.05], [0.09, 0.22]], 0), inkMat)
  add(lathe([[0.09, 0.22], [0.15, 0.42], [0.2, 0.62]], 16), woodMat)
  add(lathe([[0.2, 0.62], [0.2, 2.5]], 0), bodyMat)
  const band = new THREE.CylinderGeometry(0.206, 0.206, 0.16, 48)
  band.translate(0, 2.08, 0)
  add(band, inkMat)
  add(lathe([[0.206, 2.5], [0.208, 2.8], [0.19, 2.9], [0.12, 2.96], [0.001, PEN_L]], 24), inkMat)
  // Thân gốc không có mặt dưới / trên — lathe kín từ đầu này tới đầu kia là đủ.
  return { ...R, ...ringOf(def.color, 0.55, 0.75), inkMat, bodyMat, top: PEN_L, wide: 0.42, foot: 0.42 }
}

// Tẩy: khối chữ nhật bo góc dựng đứng — nửa dưới cao su, nửa trên bọc vỏ.
const ERASER_H = 1.7
function roundRect(w, h, r) {
  const s = new THREE.Shape()
  const x = -w / 2
  const y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}
function block(w, d, y0, y1, r, bevel) {
  const g = new THREE.ExtrudeGeometry(roundRect(w, d, r), {
    depth: y1 - y0 - 2 * bevel,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 8,
  })
  g.rotateX(-Math.PI / 2) // trục đùn (z) -> trục đứng (y)
  g.translate(0, y0 + bevel, 0)
  return g
}
function buildEraser(def) {
  const R = rig()
  const { add } = R
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: def.body, roughness: 0.62, sheen: 0.4, sheenColor: new THREE.Color('#ffffff') })
  const sleeveMat = plastic(def.sleeve)
  add(block(0.72, 0.5, 0, ERASER_H, 0.12, 0.06), bodyMat)
  add(block(0.8, 0.58, ERASER_H * 0.42, ERASER_H * 0.96, 0.14, 0.035), sleeveMat)
  return { ...R, ...ringOf(def.sleeve, 0.62, 0.7), bodyMat, sleeveMat, top: ERASER_H, wide: 0.8, foot: 0.6 }
}

/* -------------------------------------------------------- mẫu in (canvas) -- */
// SVG gốc vẽ một màu (đỏ) — chỉ lấy hình (alpha), màu tô lại bằng canvas.
const imgCache = new Map()
function loadImage(src) {
  if (!imgCache.has(src))
    imgCache.set(
      src,
      new Promise((ok, fail) => {
        const im = new Image()
        im.onload = () => ok(im)
        im.onerror = () => fail(new Error('không nạp được ' + src))
        im.src = src
      }),
    )
  return imgCache.get(src)
}
const canvas = (n) => {
  const c = document.createElement('canvas')
  c.width = c.height = n
  return c
}
// Hình mẫu cỡ n×n tô một màu.
function shapeOf(img, n, hex) {
  const c = canvas(n)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0, n, n)
  g.globalCompositeOperation = 'source-in'
  g.fillStyle = hex
  g.fillRect(0, 0, n, n)
  return c
}
// Làm mềm bằng cách chồng các bản dời quanh một vòng (chạy cả Safari cũ,
// không cần ctx.filter).
function soften(g, src, n, r, alpha, dx = 0, dy = 0, taps = 10) {
  g.globalAlpha = alpha
  for (let i = 0; i < taps; i++) {
    const a = (i / taps) * Math.PI * 2
    g.drawImage(src, dx + Math.cos(a) * r, dy + Math.sin(a) * r, n, n)
  }
  g.globalAlpha = 1
}
// Nhiễu: lưới cells×cells điểm ngẫu nhiên, phóng lên n×n (ít ô = mảng to mềm).
function noise(n, cells, density, alpha) {
  const small = canvas(cells)
  const g = small.getContext('2d')
  const id = g.createImageData(cells, cells)
  for (let i = 0; i < id.data.length; i += 4)
    id.data[i + 3] = Math.random() < density ? Math.round(255 * alpha * (0.4 + Math.random() * 0.6)) : 0
  g.putImageData(id, 0, 0)
  const c = canvas(n)
  const cg = c.getContext('2d')
  cg.imageSmoothingEnabled = cells < n / 3
  cg.drawImage(small, 0, 0, n, n)
  return c
}

// Một vết in: hai canvas n×n — mực (multiply) + hằn giấy (đè lên).
function makePrint(img, n, hex) {
  const B = CONFIG.bleed
  const shape = shapeOf(img, n, hex)

  // ---- Mực ----
  const ink = canvas(n)
  const g = ink.getContext('2d')
  if (B > 0) {
    // Quầng loang: bản mờ rộng hơn nét một chút, bị nhiễu ăn lốm đốm.
    const halo = canvas(n)
    const hg = halo.getContext('2d')
    soften(hg, shape, n, n * 0.006 * B, 0.16)
    soften(hg, shape, n, n * 0.012 * B, 0.07, 0, 0, 14)
    hg.globalCompositeOperation = 'destination-out'
    hg.drawImage(noise(n, 40, 0.5, 0.9), 0, 0)
    g.drawImage(halo, 0, 0)
    soften(g, shape, n, n * 0.0018 * B, 0.22, 0, 0, 6) // nét chính nhoè rất nhẹ
  }
  g.drawImage(shape, 0, 0)
  // Ăn mực không đều: một phía nhạt dần (hướng ngẫu nhiên).
  g.globalCompositeOperation = 'destination-out'
  const a = Math.random() * Math.PI * 2
  const c = n / 2
  const gr = g.createLinearGradient(c - Math.cos(a) * c, c - Math.sin(a) * c, c + Math.cos(a) * c, c + Math.sin(a) * c)
  gr.addColorStop(0, 'rgba(0,0,0,0)')
  gr.addColorStop(0.55, 'rgba(0,0,0,0.05)')
  gr.addColorStop(1, `rgba(0,0,0,${0.12 + Math.random() * 0.22})`)
  g.fillStyle = gr
  g.fillRect(0, 0, n, n)
  // Mảng thiếu mực + hạt giấy.
  g.drawImage(noise(n, 18, 0.3, 0.2), 0, 0)
  g.drawImage(noise(n, Math.round(n / 2), 0.1, 0.4), 0, 0)
  g.globalCompositeOperation = 'source-over'

  // ---- Hằn giấy ----
  // Lõm theo nét mẫu, đèn từ trên-trái: trong mép trên-trái tối (vách che
  // bóng), trong mép dưới-phải sáng (vách hứng đèn), gờ giấy đùn nhẹ bên ngoài.
  const deb = canvas(n)
  const K = CONFIG.deboss
  if (K > 0) {
    const mask = shapeOf(img, n, '#000')
    const k = n * 0.006 * K
    const dg = deb.getContext('2d')
    const band = (hex2, dx, dy, alpha) => {
      const hole = canvas(n)
      const hg = hole.getContext('2d')
      hg.fillStyle = hex2
      hg.fillRect(0, 0, n, n)
      hg.globalCompositeOperation = 'destination-out'
      hg.drawImage(mask, 0, 0)
      const b = canvas(n)
      const bg = b.getContext('2d')
      soften(bg, hole, n, k * 0.5, alpha / 3, dx, dy, 6)
      bg.globalCompositeOperation = 'destination-in'
      bg.drawImage(mask, 0, 0)
      dg.drawImage(b, 0, 0)
    }
    band('#141a10', k, k, 0.38)
    band('#ffffff', -k, -k, 0.3)
    const rim = canvas(n)
    const rg = rim.getContext('2d')
    soften(rg, shapeOf(img, n, '#ffffff'), n, k * 0.6, 0.05, -k * 0.6, -k * 0.6, 6)
    soften(rg, mask, n, k * 0.6, 0.05, k * 0.8, k * 0.8, 6)
    rg.globalCompositeOperation = 'destination-out'
    rg.drawImage(mask, 0, 0)
    dg.drawImage(rim, 0, 0)
  }
  return { ink, deboss: deb }
}


const SVGNS = 'http://www.w3.org/2000/svg'

/* ---------------------------------------------------------------- khay UI -- */
function buildUI(tools) {
  const el = document.createElement('div')
  el.className = 'gal-tools'
  el.setAttribute('role', 'toolbar')
  el.setAttribute('aria-label', 'Dụng cụ')
  el.innerHTML = tools
    .map(
      (t, i) =>
        `<button type="button" class="gal-tools__slot gal-tools__slot--${t.kind}" data-slot="${i}" aria-pressed="false" aria-label="${t.def.name}" title="${t.def.name}"></button>`,
    )
    .join('')
  return el
}

/* --------------------------------------------------------------- sân khấu -- */
let D = null

function mount(root = document) {
  const scope = root.querySelector ? root : document
  const stage = scope.querySelector('[data-gallery]')
  if (!stage) return
  destroy()

  // Lớp vẽ trên lưới ảnh: nét bút (SVG) + vết dấu, trôi theo lưới.
  const world = stage.querySelector('[data-gallery-world]')
  const prints = document.createElement('div')
  prints.className = 'gal__prints'
  const ink = document.createElementNS(SVGNS, 'svg')
  ink.setAttribute('class', 'gal__ink')
  ink.setAttribute('width', '1')
  ink.setAttribute('height', '1')
  prints.appendChild(ink)
  if (world) world.after(prints)
  else stage.prepend(prints)

  const defs = [
    ...CONFIG.stamps.map((def) => ['stamp', def]),
    ['pen', CONFIG.pen],
    ['eraser', CONFIG.eraser],
  ]
  const build = { stamp: buildStamp, pen: buildPen, eraser: buildEraser }
  const items = defs.map(([kind, def], i) => ({ kind, def, i, ...build[kind](def) }))

  // Khay nằm DƯỚI canvas 3D (dụng cụ đứng "trong" khay).
  const tray = buildUI(items)
  stage.appendChild(tray)
  const cv = document.createElement('canvas')
  cv.className = 'gal__stamps'
  stage.appendChild(cv)

  const renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(2, devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000)
  const tilt = (CONFIG.tilt * Math.PI) / 180
  cam.position.set(0, Math.sin(tilt) * 1000, Math.cos(tilt) * 1000)
  cam.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(0xfffdf4, 0x8f9a80, 1.35))
  const key = new THREE.DirectionalLight(0xffffff, 2.4)
  key.castShadow = true
  key.shadow.mapSize.set(1024, 1024)
  key.shadow.radius = 6
  key.shadow.bias = -0.0005
  scene.add(key, key.target)
  const rim = new THREE.DirectionalLight(0xf4f3eb, 0.9)
  rim.position.set(500, 300, -600)
  scene.add(rim)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), new THREE.ShadowMaterial({ opacity: 0.2 }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const tools = items.map((t) => {
    scene.add(t.root, t.ring)
    return Object.assign(t, {
      slot: tray.querySelector(`[data-slot="${t.i}"]`),
      x: 0, // toạ độ màn (px) của điểm chạm sàn (tâm đáy dấu / ngòi bút / đáy tẩy)
      y: 0,
      u: 0, // cỡ hiện tại (px mỗi đơn vị hình) — nhỏ trong khay, to khi cầm
      h: 0, // độ nhấc (đơn vị hình)
      hv: 0,
      tx: 0,
      tz: 0,
      vtx: 0,
      vtz: 0,
      sq: 0,
      vsq: 0,
      ringA: 0,
      pose: 0, // 0 = tư thế trong khay, 1 = tư thế khi cầm (bút: lật ngòi xuống, nghiêng)
      state: 'tray', // tray | held | aim | press | back
      after: null,
      t0: 0,
      aim: null,
      hovered: false,
      img: null,
      printed: false,
    })
  })

  D = {
    stage,
    prints,
    ink,
    tray,
    canvas: cv,
    renderer,
    scene,
    cam,
    key,
    tilt,
    tools,
    vw: 0,
    vh: 0,
    trayU: {},
    ptr: null,
    down: null,
    held: null,
    stroke: null, // nét bút đang vẽ
    strokes: [], // {pts: [[x, y]...] (toạ độ thế giới), el}
    printList: [], // {el, x, y, r} (toạ độ thế giới)
    eatClick: 0,
    raf: 0,
    last: performance.now(),
    off: [],
    dirty: true,
  }

  tools
    .filter((t) => t.kind === 'stamp')
    .forEach((t) => {
      loadImage(t.def.svg)
        .then((img) => {
          if (!D || D.tools[t.i] !== t) return
          t.img = img
          updateLabel(t)
        })
        .catch((e) => console.warn('[chande-stamps]', e.message))
    })

  const on = (el, ev, fn, opt) => {
    el.addEventListener(ev, fn, opt)
    D.off.push(() => el.removeEventListener(ev, fn, opt))
  }
  // Khay không kéo lưới, không mở lightbox.
  on(tray, 'pointerdown', (e) => e.stopPropagation())
  on(tray, 'wheel', (e) => e.stopPropagation())
  on(tray, 'click', (e) => e.stopPropagation())
  tools.forEach((t) => {
    on(t.slot, 'click', () => toggle(t))
    on(t.slot, 'pointerenter', () => (t.hovered = true))
    on(t.slot, 'pointerleave', () => (t.hovered = false))
  })
  on(window, 'pointerdown', onDown, true)
  on(window, 'pointermove', onMove, true)
  on(window, 'pointerup', onUp, true)
  on(window, 'pointercancel', onUp, true)
  on(window, 'click', onClickEat, true)
  on(window, 'keydown', (e) => e.key === 'Escape' && D?.held && putBack())
  on(window, 'resize', () => resize())
  resize()
  tools.forEach((t) => {
    const h = home(t)
    t.x = h.x
    t.y = h.y
    t.u = D.trayU[t.kind]
  })
  applyColors()

  D.raf = requestAnimationFrame(tick)
}

function destroy() {
  if (!D) return
  cancelAnimationFrame(D.raf)
  D.off.forEach((f) => f())
  D.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) {
      o.material.map?.dispose()
      o.material.dispose()
    }
  })
  D.renderer.dispose()
  D.canvas.remove()
  D.prints.remove()
  D.tray.remove()
  document.documentElement.classList.remove('gal-tool-held')
  D = null
}

// Cỡ khi cầm (px mỗi đơn vị hình) — màn hẹp thì nhỏ lại theo ô ảnh.
function heldU(t) {
  const tile = D.stage.querySelector('.gal__probe')?.offsetWidth || 160
  const k = Math.min(1, (D.vw * 0.11) / CONFIG.size, (tile * 0.75) / CONFIG.size)
  const base = t.kind === 'stamp' ? CONFIG.size : t.def.size
  return Math.max(base * 0.5, base * k)
}

function resize() {
  const r = D.stage.getBoundingClientRect()
  D.vw = r.width
  D.vh = r.height
  D.renderer.setSize(D.vw, D.vh, false)
  D.canvas.style.width = D.vw + 'px'
  D.canvas.style.height = D.vh + 'px'
  D.dirty = true
  const { cam, key } = D
  cam.left = -D.vw / 2
  cam.right = D.vw / 2
  cam.top = D.vh / 2
  cam.bottom = -D.vh / 2
  cam.updateProjectionMatrix()
  // Trong khay: mỗi món vừa ô của nó (cỡ ô do CSS quyết theo khổ màn).
  const sin = Math.sin(D.tilt)
  const cos = Math.cos(D.tilt)
  D.tools.forEach((t) => {
    const b = t.slot.getBoundingClientRect()
    const tall = t.top * cos + t.foot * sin // chiều cao trên màn (đơn vị hình)
    const fit = t.kind === 'eraser' ? 0.62 : 0.8 // tẩy khối đặc, nhìn to hơn -> thu bớt
    D.trayU[t.kind] = b.width ? Math.min((b.width * 0.84) / t.wide, (b.height * fit) / tall) : 20
  })
  const span = Math.max(D.vw, D.vh / sin) * 0.6 + CONFIG.size * 3
  key.position.set(-420, 1100, -380)
  const sc = key.shadow.camera
  sc.left = sc.bottom = -span
  sc.right = sc.top = span
  sc.near = 1
  sc.far = 4000
  sc.updateProjectionMatrix()
}

// Chỗ đứng trong khay (toạ độ màn của điểm chạm sàn) — cả khối nằm giữa ô.
function home(t) {
  const st = D.stage.getBoundingClientRect()
  const b = t.slot.getBoundingClientRect()
  const u = D.trayU[t.kind]
  return {
    x: b.left - st.left + b.width / 2,
    y: b.top - st.top + b.height / 2 + (u * t.top * Math.cos(D.tilt)) / 2,
  }
}

const galleryView = () => window.CHANDE_GALLERY?.view?.() || null

/* -------------------------------------------------------------- màu dụng cụ -- */
function updateLabel(t) {
  if (!t.img) return
  const tex = new THREE.CanvasTexture(shapeOf(t.img, 512, labelColor(t.def)))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  t.labelMat.map?.dispose()
  t.labelMat.map = tex
  t.labelMat.opacity = 0.94
  t.labelMat.needsUpdate = true
  D.dirty = true
}

// Áp màu trong CONFIG lên khối 3D (sau khi đổi ở bảng H).
function applyColors() {
  D.tools.forEach((t) => {
    const d = t.def
    if (t.kind === 'stamp') {
      paint(t.handleMat, d.handle)
      paint(t.baseMat, d.base)
      t.ringMat.color.set(d.ink)
      updateLabel(t)
    } else if (t.kind === 'pen') {
      paint(t.inkMat, d.color)
      paint(t.bodyMat, d.body)
      t.ringMat.color.set(d.color)
    } else {
      t.bodyMat.color.set(d.body)
      paint(t.sleeveMat, d.sleeve)
      t.ringMat.color.set(d.sleeve)
    }
  })
  D.ink.style.setProperty('--pen', CONFIG.pen.color)
  D.dirty = true
}

function syncUI() {
  D.tools.forEach((t) => t.slot.setAttribute('aria-pressed', String(D.held === t)))
  document.documentElement.classList.toggle('gal-tool-held', !!D.held)
  D.stage.dataset.tool = D.held?.kind || ''
}

/* ------------------------------------------------------------- tương tác -- */
const localPt = (e) => {
  const r = D.stage.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
// Chỗ dùng được: trong canvas gallery, không phải khay / lightbox.
const onCanvas = (e) =>
  e.target instanceof Element &&
  D.stage.contains(e.target) &&
  !e.target.closest('.gal-tools') &&
  !document.querySelector('.gal-lb')
const toWorld = (p) => {
  const v = galleryView() || { x: 0, y: 0 }
  return [p.x - v.x, p.y - v.y]
}

function toggle(t) {
  if (D.held === t) return putBack()
  if (D.held) putBack()
  if (t.state !== 'tray' && t.state !== 'back') return
  D.held = t
  t.state = 'held'
  syncUI()
}

function putBack() {
  const t = D.held
  if (!t) return
  endStroke()
  D.held = null
  if (t.state === 'held') t.state = 'back'
  else t.after = 'back' // dấu đang dập dở thì dập xong mới về
  syncUI()
}

function onDown(e) {
  const t = D?.held
  if (!t || e.button !== 0 || !onCanvas(e)) return
  const p = localPt(e)
  D.down = { ...p, id: e.pointerId }
  D.ptr = p // chạm (điện thoại): dụng cụ bay tới chỗ chạm
  if (t.kind === 'stamp') return // kéo vẫn kéo lưới, bấm mới in
  // Bút / tẩy: kéo là vẽ / tẩy -> không cho lưới nhận cú kéo này.
  e.stopPropagation()
  e.preventDefault()
  try {
    D.stage.setPointerCapture(e.pointerId)
  } catch {}
  if (t.kind === 'pen') startStroke(p)
  else erase(p, p)
}

function onMove(e) {
  if (!D) return
  const p = localPt(e)
  const last = D.ptr
  D.ptr = p
  const d = D.down
  if (!d || e.pointerId !== d.id || !D.held) return
  if (D.held.kind === 'pen') addPoint(p)
  else if (D.held.kind === 'eraser') erase(last || p, p)
}

function onUp(e) {
  const d = D?.down
  if (!d || e.pointerId !== d.id) return
  D.down = null
  const t = D.held
  if (!t) return
  D.eatClick = performance.now() + 400 // không mở lightbox ảnh bên dưới
  if (t.kind === 'pen') return endStroke()
  if (t.kind !== 'stamp' || e.type === 'pointercancel') return
  const p = localPt(e)
  if (Math.hypot(p.x - d.x, p.y - d.y) > 6) return void (D.eatClick = 0) // kéo lưới, không in
  if (t.state !== 'held') return
  t.aim = p
  t.state = 'aim'
  t.t0 = performance.now()
}

function onClickEat(e) {
  if (!D || performance.now() > D.eatClick) return
  D.eatClick = 0
  e.stopPropagation()
  e.preventDefault()
}

/* --------------------------------------------------------------- nét bút -- */
function startStroke(p) {
  const el = document.createElementNS(SVGNS, 'path')
  el.setAttribute('class', 'gal__stroke')
  el.style.stroke = CONFIG.pen.color
  el.style.strokeWidth = CONFIG.pen.width
  D.ink.appendChild(el)
  D.stroke = { pts: [toWorld(p)], el }
  D.strokes.push(D.stroke)
  drawStroke(D.stroke)
}
function addPoint(p) {
  const s = D.stroke
  if (!s) return
  const w = toWorld(p)
  const l = s.pts[s.pts.length - 1]
  if (Math.hypot(w[0] - l[0], w[1] - l[1]) < 1.5) return
  s.pts.push(w)
  drawStroke(s)
}
function endStroke() {
  D.stroke = null
}
// Đường cong mượt qua trung điểm các cặp điểm (chấm tròn nếu chỉ một điểm).
function drawStroke(s) {
  const P = s.pts
  const f = (n) => n.toFixed(1)
  let d = `M${f(P[0][0])} ${f(P[0][1])}`
  if (P.length === 1) d += `l0.01 0`
  for (let i = 1; i < P.length - 1; i++) {
    const mx = (P[i][0] + P[i + 1][0]) / 2
    const my = (P[i][1] + P[i + 1][1]) / 2
    d += `Q${f(P[i][0])} ${f(P[i][1])} ${f(mx)} ${f(my)}`
  }
  if (P.length > 1) d += `L${f(P[P.length - 1][0])} ${f(P[P.length - 1][1])}`
  s.el.setAttribute('d', d)
}

/* -------------------------------------------------------------------- tẩy -- */
// Khoảng cách điểm -> đoạn thẳng.
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax
  const dy = by - ay
  const L = dx * dx + dy * dy
  const k = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0
  return Math.hypot(px - ax - dx * k, py - ay - dy * k)
}
// Chà từ a tới b (toạ độ màn): nét bút / vết dấu nào chạm vùng tẩy thì mất.
function erase(a, b) {
  const [ax, ay] = toWorld(a)
  const [bx, by] = toWorld(b)
  const r = CONFIG.eraser.radius * (heldU(D.held) / CONFIG.eraser.size)
  D.strokes = D.strokes.filter((s) => {
    const w = r + CONFIG.pen.width / 2
    const hit = s.pts.some((p, i) => {
      const q = s.pts[i + 1] || p
      // Đoạn nét gần đoạn chà: thử hai đầu đoạn chà với đoạn nét, và ngược lại.
      return (
        segDist(ax, ay, p[0], p[1], q[0], q[1]) < w ||
        segDist(bx, by, p[0], p[1], q[0], q[1]) < w ||
        segDist(p[0], p[1], ax, ay, bx, by) < w
      )
    })
    if (hit) fadeOut(s.el)
    return !hit
  })
  D.printList = D.printList.filter((pr) => {
    const hit = segDist(pr.x, pr.y, ax, ay, bx, by) < pr.r * 0.85 + r * 0.5
    if (hit) fadeOut(pr.el)
    return !hit
  })
}
function fadeOut(el) {
  el.classList.add('is-gone')
  setTimeout(() => el.remove(), 450)
}

/* ---------------------------------------------------------------- vết mực -- */
function print(t) {
  const view = galleryView()
  if (!t.img || !view) return
  const d = heldU(t) * 2 * 0.955 // đường kính mặt cao su
  const n = Math.round(Math.min(640, d * Math.min(2, devicePixelRatio || 1)))
  const { ink, deboss } = makePrint(t.img, n, t.def.ink)
  const el = document.createElement('div')
  el.className = 'gal__print'
  ink.className = 'gal__print-ink'
  deboss.className = 'gal__print-deboss'
  el.append(ink, deboss)
  const rot = (Math.random() * 2 - 1) * CONFIG.spin
  const a = CONFIG.ink[0] + Math.random() * (CONFIG.ink[1] - CONFIG.ink[0])
  const x = t.aim.x - view.x
  const y = t.aim.y - view.y
  el.style.width = el.style.height = d + 'px'
  el.style.left = x - d / 2 + 'px'
  el.style.top = y - d / 2 + 'px'
  el.style.setProperty('--rot', rot.toFixed(1) + 'deg')
  el.style.setProperty('--ink', a.toFixed(2))
  D.prints.appendChild(el)
  D.printList.push({ el, x, y, r: d / 2 })
  while (D.printList.length > CONFIG.maxPrints) fadeOut(D.printList.shift().el)
}

/* -------------------------------------------------------------- mỗi frame -- */
function tick(now) {
  if (!D) return
  const dt = Math.min(0.05, (now - D.last) / 1000)
  D.last = now
  D.raf = requestAnimationFrame(tick)

  const view = galleryView()
  if (view) D.prints.style.transform = `translate3d(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px, 0)`

  // Chỉ vẽ lại khi có món đang động.
  let busy = D.dirty
  for (const t of D.tools) busy = step(t, now, dt) || busy
  if (busy) D.renderer.render(D.scene, D.cam)
  D.dirty = false
}

const PRESS = { down: 0.1, hold: 0.2 } // s — dấu dập xuống / đè giữ
// Tư thế bút khi cầm: ngòi xuống, thân ngả sang phải + ra sau (trông dài, như tay phải cầm viết).
const PEN_HELD = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.38, 0, -0.5))
const PEN_TRAY = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI)) // ngòi chổng lên
const UP = new THREE.Vector3()

function step(t, now, dt) {
  const time = (now - t.t0) / 1000
  const isStamp = t.kind === 'stamp'
  const lift = isStamp ? CONFIG.lift : t.kind === 'pen' ? 0.35 : 0.3 // đơn vị hình
  const using = D.held === t && !!D.down && !isStamp // đang vẽ / đang tẩy
  let hT = 0
  let gx = t.x
  let gy = t.y
  let uT = heldU(t)
  let follow = 8
  let ringT = 0
  let poseT = 1
  const px = t.x
  const py = t.y

  if (t.state === 'tray' || t.state === 'back') {
    const h = home(t)
    gx = h.x
    gy = h.y
    uT = D.trayU[t.kind]
    poseT = 0
    hT = t.hovered && t.state === 'tray' ? 0.18 : 0
    if (t.state === 'back') {
      const d = Math.hypot(h.x - t.x, h.y - t.y)
      hT = d > 3 ? Math.max(lift, 0.5) * 0.6 * Math.min(1, d / 120) : 0
      follow = 7
      if (d < 1 && Math.abs(t.u - uT) < 0.2) t.state = 'tray'
    }
  } else if (t.state === 'held') {
    hT = using ? 0 : lift
    follow = using ? 60 : 16 // đang vẽ thì ngòi bám sát con trỏ
    ringT = using ? 0.2 : 0.42
    if (D.ptr) {
      gx = D.ptr.x
      gy = D.ptr.y
    }
  } else if (t.state === 'aim') {
    gx = t.aim.x
    gy = t.aim.y
    hT = lift
    follow = 18
    ringT = 0.6
    if (Math.hypot(gx - t.x, gy - t.y) < 2 || time > 0.5) {
      t.state = 'press'
      t.t0 = now
      t.printed = false
    }
  } else if (t.state === 'press') {
    gx = t.aim.x
    gy = t.aim.y
    follow = 24
    if (time < PRESS.down) {
      const k = time / PRESS.down
      t.h = lift * (1 - k * k) // rơi nhanh dần
      t.hv = 0
    } else {
      t.h = 0
      t.hv = 0
      if (!t.printed) {
        t.printed = true
        t.vsq -= 9 // nén lại khi chạm
        print(t)
      }
      if (time > PRESS.down + PRESS.hold) {
        t.state = t.after || (D.held === t ? 'held' : 'back')
        t.after = null
        t.t0 = now
      }
    }
  }

  const k = 1 - Math.exp(-dt * follow)
  t.x += (gx - t.x) * k
  t.y += (gy - t.y) * k
  t.u += (uT - t.u) * (1 - Math.exp(-dt * 9))
  t.pose += (poseT - t.pose) * (1 - Math.exp(-dt * 8))
  // Quán tính: thân ngả ngược hướng di chuyển (tẩy đang chà thì lắc mạnh hơn).
  let ax = 0
  let az = 0
  if (dt > 0 && t.state !== 'tray') {
    const g = t.kind === 'eraser' && using ? 0.0011 : t.kind === 'pen' ? 0.00012 : 0.00035
    ax = (-(t.y - py) / dt / Math.sin(D.tilt)) * g
    az = ((t.x - px) / dt) * g
  }
  if (t.state !== 'press') {
    t.hv += ((hT - t.h) * 170 - t.hv * 18) * dt
    t.h += t.hv * dt
  }
  t.vtx += ((ax - t.tx) * 120 - t.vtx * 11) * dt
  t.vtz += ((az - t.tz) * 120 - t.vtz * 11) * dt
  t.tx += t.vtx * dt
  t.tz += t.vtz * dt
  t.vsq += (-t.sq * 260 - t.vsq * 14) * dt
  t.sq += t.vsq * dt
  t.ringA += (ringT - t.ringA) * (1 - Math.exp(-dt * 10))

  // Đặt vào cảnh: điểm màn (x, y) -> điểm sàn (X, 0, Z).
  const X = t.x - D.vw / 2
  const Z = (t.y - D.vh / 2) / Math.sin(D.tilt)
  t.root.position.set(X, 0, Z)
  t.root.scale.setScalar(t.u)
  t.hover.position.y = Math.max(0, t.h)
  const lim = 0.45
  t.tip.rotation.x = Math.max(-lim, Math.min(lim, t.tx))
  t.tip.rotation.z = Math.max(-lim, Math.min(lim, t.tz))
  if (t.kind === 'pen') {
    // Khay: ngòi chổng lên, đáy chạm sàn. Cầm: ngòi xuống, đúng điểm chạm sàn.
    t.orient.quaternion.slerpQuaternions(PEN_TRAY, PEN_HELD, t.pose)
    UP.set(0, PEN_L / 2, 0).applyQuaternion(t.orient.quaternion)
    t.orient.position.set(UP.x * t.pose, PEN_L / 2 + (UP.y - PEN_L / 2) * t.pose, UP.z * t.pose)
    t.squash.position.y = -PEN_L / 2
  }
  const q = Math.max(-0.12, Math.min(0.12, t.sq * 0.06))
  t.squash.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5)
  t.ring.position.set(X, 0.3, Z)
  t.ring.scale.setScalar(t.u)
  t.ringMat.opacity = t.ringA
  t.ring.visible = t.ringA > 0.01

  const e = 1e-3
  return (
    t.state !== 'tray' ||
    Math.abs(gx - t.x) + Math.abs(gy - t.y) > 0.05 ||
    Math.abs(uT - t.u) > 0.02 ||
    Math.abs(poseT - t.pose) > e ||
    Math.abs(hT - t.h) + Math.abs(t.hv) > e ||
    Math.abs(t.tx) + Math.abs(t.tz) + Math.abs(t.vtx) + Math.abs(t.vtz) > e ||
    Math.abs(t.sq) + Math.abs(t.vsq) > e ||
    t.ringA > 0.01
  )
}

/* -------------------------------------------------------------- Khởi động */
mount(document)

if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (D && data.current.container?.contains(D.stage)) destroy()
  })
}

window.CHANDE_STAMPS = {
  config: CONFIG,
  defaults: DEFAULTS,
  mount,
  destroy,
  // Bảng H gọi sau mỗi lần chỉnh: áp lại màu + cỡ.
  refresh() {
    if (!D) return
    applyColors()
    resize()
  },
  // Cầm món thứ i trong khay ra (0, 1 = dấu, 2 = bút, 3 = tẩy; null = cất về khay).
  pick(i) {
    if (!D) return
    if (i == null) return putBack()
    toggle(D.tools[i])
  },
  // Xoá hết vết dấu + nét bút trên lưới.
  clear() {
    if (!D) return
    D.printList.forEach((p) => p.el.remove())
    D.strokes.forEach((s) => s.el.remove())
    D.printList = []
    D.strokes = []
  },
  get state() {
    return D
  },
}
