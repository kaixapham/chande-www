/* =============================================================================
 * CHANDE — Hộp con dấu 3D ở góc dưới phải gallery
 * -----------------------------------------------------------------------------
 * Như khay bút của app vẽ: một khay bo tròn ở góc dưới phải canvas, đứng sẵn
 * hai con dấu cao su 3D (three.js — đế tròn có vành, cán tiện tròn, nhựa bóng)
 * và một nút màu.
 *   • Bấm một con dấu trong khay: cầm dấu ra — dấu to lên, lơ lửng theo chuột
 *     (vòng ngắm mờ dưới sàn chỉ chỗ sẽ in). Bấm lại / Esc: cất dấu về khay.
 *   • Đang cầm dấu: bấm (không kéo) vào canvas là dập xuống đúng chỗ đó. Kéo
 *     thì vẫn kéo lưới như thường. Điện thoại: chạm chỗ nào dấu bay tới dập.
 *   • Nút màu: chọn màu cán / đế / mực cho từng dấu (bảng màu Chande hoặc màu
 *     tự chọn) — nhớ theo trình duyệt. Bảng H (devtools) cũng chỉnh được.
 * Vết in: tô màu mẫu SVG (assets/img/gallery/stamps/*.svg) bằng canvas — mực
 * nhoè loang nhẹ ra mép, ăn mực không đều (một phía đậm một phía nhạt, lốm đốm
 * chỗ thiếu mực), và giấy bị HẰN theo nét mẫu (bóng tối trong mép trên-trái,
 * gờ sáng mép dưới-phải). Mỗi vết loang / lốm đốm một kiểu. Vết gắn toạ độ thế
 * giới gallery nên trôi theo lưới; giữ tối đa CONFIG.maxPrints vết.
 * Camera trực giao nghiêng CONFIG.tilt độ như vịt (chande-duck.js): điểm sàn
 * (X, 0, Z) hiện ở màn (X, Z·sin tilt), độ cao Y đẩy lên màn Y·cos tilt.
 * Module — nạp three từ assets/vendor/three. Mount / gỡ theo Barba.
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

const CONFIG = {
  size: 60, // px — bán kính đế khi cầm ra (khổ desktop)
  tilt: 62, // độ — góc camera so với mặt sàn
  lift: 0.9, // × bán kính — độ cao lơ lửng khi cầm
  maxPrints: 48,
  ink: [0.86, 0.97], // độ đậm vết mực (ngẫu nhiên trong khoảng)
  spin: 24, // độ — vết mực xoay ngẫu nhiên ±spin
  bleed: 1, // độ nhoè mực (0 = nét sắc)
  deboss: 1, // độ hằn giấy (0 = phẳng)
  stamps: [
    { name: 'Dấu 1', svg: 'assets/img/gallery/stamps/stamp-001.svg', handle: '#68f12b', base: '#245535', ink: '#245535' },
    { name: 'Dấu 2', svg: 'assets/img/gallery/stamps/stamp-002.svg', handle: '#e8e2cb', base: '#1b2625', ink: '#1b2625' },
  ],
  // Ô màu trong bảng chọn — bảng màu Chande.
  swatches: ['#0f1513', '#1b2625', '#364b3c', '#245535', '#4b6f52', '#9aa587', '#d6ceab', '#e8e2cb', '#f4f3eb', '#68f12b'],
}
// Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
window.CHANDE_SETTINGS_APPLY?.('stamps', CONFIG)
const DEFAULTS = structuredClone(CONFIG)

const PARTS = [
  ['handle', 'Cán'],
  ['base', 'Đế'],
  ['ink', 'Mực'],
]
const HEX = /^#[0-9a-f]{6}$/i

/* ------------------------------------------------- màu riêng của người xem -- */
const COLOR_KEY = 'chande-stamps-colors'
function saveColors() {
  try {
    const o = {}
    CONFIG.stamps.forEach((d, i) => (o[i] = { handle: d.handle, base: d.base, ink: d.ink }))
    localStorage.setItem(COLOR_KEY, JSON.stringify(o))
  } catch {}
}
try {
  const saved = JSON.parse(localStorage.getItem(COLOR_KEY) || 'null') || {}
  CONFIG.stamps.forEach((d, i) => {
    for (const [k] of PARTS) if (HEX.test(saved[i]?.[k] || '')) d[k] = saved[i][k]
  })
} catch {}

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

function buildStamp(def) {
  const root = new THREE.Group() // vị trí trên sàn + tỉ lệ (= bán kính px)
  const hover = new THREE.Group() // độ nhấc (y)
  const tip = new THREE.Group() // nghiêng theo quán tính
  const squash = new THREE.Group() // nảy khi dập
  root.add(hover)
  hover.add(tip)
  tip.add(squash)
  const add = (geo, mat) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = true
    m.receiveShadow = true
    squash.add(m)
  }
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

  // Vòng ngắm dưới sàn (chỉ chỗ sẽ in) — nằm ngoài khối nhấc.
  const ringMat = new THREE.MeshBasicMaterial({ color: def.ink, transparent: true, opacity: 0, depthWrite: false })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 0.97, 72), ringMat)
  ring.rotation.x = -Math.PI / 2

  return { root, hover, tip, squash, baseMat, handleMat, labelMat, ring, ringMat }
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

/* ---------------------------------------------------------------- khay UI -- */
function buildUI() {
  const tools = document.createElement('div')
  tools.className = 'gal-tools'
  tools.setAttribute('role', 'toolbar')
  tools.setAttribute('aria-label', 'Con dấu')
  tools.innerHTML =
    CONFIG.stamps
      .map(
        (d, i) =>
          `<button type="button" class="gal-tools__slot" data-slot="${i}" aria-pressed="false" aria-label="${d.name}" title="${d.name}"></button>`,
      )
      .join('') +
    '<span class="gal-tools__sep" aria-hidden="true"></span>' +
    '<button type="button" class="gal-tools__color" aria-expanded="false" aria-label="Màu con dấu" title="Màu con dấu"><span></span></button>'

  const pop = document.createElement('div')
  pop.className = 'gal-tools__pop'
  pop.hidden = true
  pop.setAttribute('role', 'dialog')
  pop.setAttribute('aria-label', 'Màu con dấu')
  pop.innerHTML =
    '<div class="gal-tools__tabs" role="tablist">' +
    CONFIG.stamps
      .map((d, i) => `<button type="button" role="tab" data-tab="${i}" aria-selected="${i === 0}">${d.name}</button>`)
      .join('') +
    '</div>' +
    PARTS.map(
      ([k, label]) =>
        `<div class="gal-tools__row" data-part="${k}"><span class="gal-tools__lbl">${label}</span><div class="gal-tools__sw">` +
        CONFIG.swatches
          .map((c) => `<button type="button" data-color="${c}" style="--c:${c}" aria-label="${label} ${c}"></button>`)
          .join('') +
        `<label class="gal-tools__pick" title="Màu khác"><input type="color" id="gal-stamp-${k}" aria-label="${label}: màu khác"></label>` +
        '</div></div>',
    ).join('') +
    '<button type="button" class="gal-tools__reset">Về màu mặc định</button>'
  return { tools, pop }
}

/* --------------------------------------------------------------- sân khấu -- */
let D = null

function mount(root = document) {
  const scope = root.querySelector ? root : document
  const stage = scope.querySelector('[data-gallery]')
  if (!stage) return
  destroy()

  const world = stage.querySelector('[data-gallery-world]')
  const prints = document.createElement('div')
  prints.className = 'gal__prints'
  if (world) world.after(prints)
  else stage.prepend(prints)

  // Khay nằm DƯỚI canvas 3D (dấu đứng "trong" khay), bảng màu trên cùng.
  const { tools, pop } = buildUI()
  stage.appendChild(tools)
  const cv = document.createElement('canvas')
  cv.className = 'gal__stamps'
  stage.appendChild(cv)
  stage.appendChild(pop)

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

  const stamps = CONFIG.stamps.map((def, i) => {
    const s = buildStamp(def)
    scene.add(s.root, s.ring)
    return {
      i,
      def,
      ...s,
      slot: tools.querySelector(`[data-slot="${i}"]`),
      x: 0, // toạ độ màn (px) của tâm đáy dấu khi nằm trên sàn
      y: 0,
      r: 0, // bán kính hiện tại (px) — nhỏ trong khay, to khi cầm
      h: 0, // độ nhấc (× bán kính)
      hv: 0,
      tx: 0,
      tz: 0,
      vtx: 0,
      vtz: 0,
      sq: 0,
      vsq: 0,
      ringA: 0,
      state: 'tray', // tray | held | aim | press | back
      after: null,
      t0: 0,
      aim: null,
      hovered: false,
      img: null,
      printed: false,
    }
  })

  D = {
    stage,
    prints,
    tools,
    pop,
    canvas: cv,
    renderer,
    scene,
    cam,
    key,
    tilt,
    stamps,
    vw: 0,
    vh: 0,
    R: CONFIG.size,
    trayR: 22,
    ptr: null,
    down: null,
    held: null,
    tab: 0,
    eatClick: 0,
    printList: [],
    raf: 0,
    last: performance.now(),
    off: [],
    dirty: true,
  }

  stamps.forEach((s) => {
    loadImage(s.def.svg)
      .then((img) => {
        if (!D || D.stamps[s.i] !== s) return
        s.img = img
        updateLabel(s)
      })
      .catch((e) => console.warn('[chande-stamps]', e.message))
  })

  const on = (el, ev, fn, opt) => {
    el.addEventListener(ev, fn, opt)
    D.off.push(() => el.removeEventListener(ev, fn, opt))
  }
  // Khay / bảng màu không kéo lưới, không mở lightbox.
  for (const el of [tools, pop]) {
    on(el, 'pointerdown', (e) => e.stopPropagation())
    on(el, 'wheel', (e) => e.stopPropagation())
    on(el, 'click', (e) => e.stopPropagation())
  }
  stamps.forEach((s) => {
    on(s.slot, 'click', () => toggle(s))
    on(s.slot, 'pointerenter', () => (s.hovered = true))
    on(s.slot, 'pointerleave', () => (s.hovered = false))
  })
  on(tools.querySelector('.gal-tools__color'), 'click', () => openPop(pop.hidden))
  pop.querySelectorAll('[data-tab]').forEach((b) => on(b, 'click', () => setTab(+b.dataset.tab)))
  pop.querySelectorAll('[data-part]').forEach((row) => {
    const part = row.dataset.part
    row.querySelectorAll('[data-color]').forEach((b) => on(b, 'click', () => setColor(D.tab, part, b.dataset.color)))
    const inp = row.querySelector('input[type=color]')
    on(inp, 'input', () => setColor(D.tab, part, inp.value))
  })
  on(pop.querySelector('.gal-tools__reset'), 'click', () => {
    for (const [k] of PARTS) setColor(D.tab, k, DEFAULTS.stamps[D.tab][k])
  })

  on(window, 'pointerdown', onDown, true)
  on(window, 'pointermove', onMove, { passive: true })
  on(window, 'pointerup', onUp, true)
  on(window, 'pointercancel', () => D && (D.down = null), true)
  on(window, 'click', onClickEat, true)
  on(window, 'keydown', (e) => {
    if (e.key !== 'Escape' || !D) return
    if (!D.pop.hidden) openPop(false)
    else if (D.held) putBack()
  })
  on(window, 'resize', () => resize())
  resize()
  stamps.forEach((s) => {
    const h = home(s)
    s.x = h.x
    s.y = h.y
    s.r = D.trayR
  })
  syncUI()

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
  D.tools.remove()
  D.pop.remove()
  D.stage.classList.remove('is-stamping')
  D = null
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
  const tile = D.stage.querySelector('.gal__probe')?.offsetWidth || 160
  D.R = Math.max(30, Math.min(CONFIG.size, D.vw * 0.11, tile * 0.75))
  // Trong khay: dấu vừa ô (cỡ ô do CSS quyết theo khổ màn).
  const slot = D.stamps[0]?.slot?.getBoundingClientRect()
  const tall = 2 * Math.sin(D.tilt) + TOP_Y * Math.cos(D.tilt) // chiều cao khối dấu trên màn (× bán kính)
  D.trayR = slot?.width ? Math.min(slot.width * 0.42, (slot.height / tall) * 0.9) : 22
  const span = Math.max(D.vw, D.vh / Math.sin(D.tilt)) * 0.6 + D.R * 3
  key.position.set(-420, 1100, -380)
  const sc = key.shadow.camera
  sc.left = sc.bottom = -span
  sc.right = sc.top = span
  sc.near = 1
  sc.far = 4000
  sc.updateProjectionMatrix()
}

// Chỗ đứng trong khay (toạ độ màn của tâm đáy) — để cả khối dấu nằm giữa ô.
function home(s) {
  const st = D.stage.getBoundingClientRect()
  const b = s.slot.getBoundingClientRect()
  const R = D.trayR
  return {
    x: b.left - st.left + b.width / 2,
    y: b.top - st.top + b.height / 2 + (R * TOP_Y * Math.cos(D.tilt)) / 2,
  }
}

const galleryView = () => window.CHANDE_GALLERY?.view?.() || null

/* --------------------------------------------------------------- màu dấu -- */
function updateLabel(s) {
  if (!s.img) return
  const tex = new THREE.CanvasTexture(shapeOf(s.img, 512, labelColor(s.def)))
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  s.labelMat.map?.dispose()
  s.labelMat.map = tex
  s.labelMat.opacity = 0.94
  s.labelMat.needsUpdate = true
  D.dirty = true
}

// Áp màu trong CONFIG lên khối 3D (sau khi đổi ở khay hoặc ở bảng H).
function applyColors() {
  D.stamps.forEach((s) => {
    paint(s.handleMat, s.def.handle)
    paint(s.baseMat, s.def.base)
    s.ringMat.color.set(s.def.ink)
    updateLabel(s)
  })
  syncUI()
  D.dirty = true
}

function setColor(i, part, hex) {
  const s = D?.stamps[i]
  if (!s || !HEX.test(hex)) return
  s.def[part] = hex.toLowerCase()
  applyColors()
  saveColors()
}

function setTab(i) {
  D.tab = i
  syncUI()
}

function openPop(open) {
  D.pop.hidden = !open
  D.tools.querySelector('.gal-tools__color').setAttribute('aria-expanded', String(open))
  if (open) syncUI()
}

function syncUI() {
  const d = CONFIG.stamps[D.tab]
  D.tools.querySelector('.gal-tools__color').style.setProperty('--c', d.ink)
  D.pop.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(+b.dataset.tab === D.tab)))
  D.pop.querySelectorAll('[data-part]').forEach((row) => {
    const v = d[row.dataset.part].toLowerCase()
    row.querySelectorAll('[data-color]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.color === v)))
    row.querySelector('input[type=color]').value = v
    row.querySelector('.gal-tools__pick').style.setProperty('--c', v)
  })
  D.stamps.forEach((s) => s.slot.setAttribute('aria-pressed', String(D.held === s)))
}

/* ------------------------------------------------------------- tương tác -- */
const localPt = (e) => {
  const r = D.stage.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top }
}
// Chỗ in được: trong canvas gallery, không phải khay / bảng màu / lightbox.
const onCanvas = (e) =>
  e.target instanceof Element &&
  D.stage.contains(e.target) &&
  !e.target.closest('.gal-tools, .gal-tools__pop') &&
  !document.querySelector('.gal-lb')

function toggle(s) {
  if (D.held === s) return putBack()
  if (D.held) putBack()
  if (s.state !== 'tray' && s.state !== 'back') return
  D.held = s
  s.state = 'held'
  D.tab = s.i
  D.stage.classList.add('is-stamping')
  syncUI()
}

function putBack() {
  const s = D.held
  if (!s) return
  D.held = null
  if (s.state === 'held') s.state = 'back'
  else s.after = 'back' // đang dập dở thì dập xong mới về
  D.stage.classList.remove('is-stamping')
  syncUI()
}

function onDown(e) {
  if (!D) return
  if (!D.pop.hidden && !e.target.closest?.('.gal-tools__pop, .gal-tools__color')) openPop(false)
  if (!D.held || e.button !== 0 || !onCanvas(e)) return
  const p = localPt(e)
  D.down = { ...p, id: e.pointerId }
  D.ptr = p // chạm (điện thoại): dấu bay tới chỗ chạm
}

function onMove(e) {
  if (D) D.ptr = localPt(e)
}

function onUp(e) {
  const d = D?.down
  if (!d || e.pointerId !== d.id) return
  D.down = null
  const p = localPt(e)
  if (Math.hypot(p.x - d.x, p.y - d.y) > 6) return // kéo lưới, không in
  const s = D.held
  if (!s || s.state !== 'held') return
  D.eatClick = performance.now() + 400 // không mở lightbox ảnh bên dưới
  s.aim = p
  s.state = 'aim'
  s.t0 = performance.now()
}

function onClickEat(e) {
  if (!D || performance.now() > D.eatClick) return
  D.eatClick = 0
  e.stopPropagation()
  e.preventDefault()
}

/* ---------------------------------------------------------------- vết mực -- */
function print(s) {
  const view = galleryView()
  if (!s.img || !view) return
  const d = D.R * 2 * 0.955 // đường kính mặt cao su
  const n = Math.round(Math.min(640, d * Math.min(2, devicePixelRatio || 1)))
  const { ink, deboss } = makePrint(s.img, n, s.def.ink)
  const el = document.createElement('div')
  el.className = 'gal__print'
  ink.className = 'gal__print-ink'
  deboss.className = 'gal__print-deboss'
  el.append(ink, deboss)
  const rot = (Math.random() * 2 - 1) * CONFIG.spin
  const a = CONFIG.ink[0] + Math.random() * (CONFIG.ink[1] - CONFIG.ink[0])
  el.style.width = el.style.height = d + 'px'
  el.style.left = s.aim.x - view.x - d / 2 + 'px'
  el.style.top = s.aim.y - view.y - d / 2 + 'px'
  el.style.setProperty('--rot', rot.toFixed(1) + 'deg')
  el.style.setProperty('--ink', a.toFixed(2))
  D.prints.appendChild(el)
  D.printList.push(el)
  while (D.printList.length > CONFIG.maxPrints) {
    const old = D.printList.shift()
    old.classList.add('is-gone')
    setTimeout(() => old.remove(), 700)
  }
}

/* -------------------------------------------------------------- mỗi frame -- */
function tick(now) {
  if (!D) return
  const dt = Math.min(0.05, (now - D.last) / 1000)
  D.last = now
  D.raf = requestAnimationFrame(tick)

  const view = galleryView()
  if (view) D.prints.style.transform = `translate3d(${view.x.toFixed(2)}px, ${view.y.toFixed(2)}px, 0)`

  // Chỉ vẽ lại khi có dấu đang động.
  let busy = D.dirty
  for (const s of D.stamps) busy = step(s, now, dt) || busy
  if (busy) D.renderer.render(D.scene, D.cam)
  D.dirty = false
}

const PRESS = { down: 0.1, hold: 0.2 } // s — dập xuống / đè giữ

function step(s, now, dt) {
  const t = (now - s.t0) / 1000
  let hT = 0
  let gx = s.x
  let gy = s.y
  let rT = D.R
  let follow = 8
  let ringT = 0
  const px = s.x
  const py = s.y

  if (s.state === 'tray' || s.state === 'back') {
    const h = home(s)
    gx = h.x
    gy = h.y
    rT = D.trayR
    hT = s.hovered && s.state === 'tray' ? 0.18 : 0
    if (s.state === 'back') {
      const d = Math.hypot(h.x - s.x, h.y - s.y)
      hT = d > 3 ? CONFIG.lift * 0.6 * Math.min(1, d / 120) : 0
      follow = 7
      if (d < 1 && Math.abs(s.r - rT) < 0.2) s.state = 'tray'
    }
  } else if (s.state === 'held') {
    hT = CONFIG.lift
    follow = 16
    ringT = 0.42
    if (D.ptr) {
      gx = D.ptr.x
      gy = D.ptr.y
    }
  } else if (s.state === 'aim') {
    gx = s.aim.x
    gy = s.aim.y
    hT = CONFIG.lift
    follow = 18
    ringT = 0.6
    if (Math.hypot(gx - s.x, gy - s.y) < 2 || t > 0.5) {
      s.state = 'press'
      s.t0 = now
      s.printed = false
    }
  } else if (s.state === 'press') {
    gx = s.aim.x
    gy = s.aim.y
    follow = 24
    if (t < PRESS.down) {
      const k = t / PRESS.down
      s.h = CONFIG.lift * (1 - k * k) // rơi nhanh dần
      s.hv = 0
    } else {
      s.h = 0
      s.hv = 0
      if (!s.printed) {
        s.printed = true
        s.vsq -= 9 // nén lại khi chạm
        print(s)
      }
      if (t > PRESS.down + PRESS.hold) {
        s.state = s.after || (D.held === s ? 'held' : 'back')
        s.after = null
        s.t0 = now
      }
    }
  }

  const k = 1 - Math.exp(-dt * follow)
  s.x += (gx - s.x) * k
  s.y += (gy - s.y) * k
  s.r += (rT - s.r) * (1 - Math.exp(-dt * 9))
  // Quán tính: thân ngả ngược hướng di chuyển.
  let ax = 0
  let az = 0
  if (dt > 0 && s.state !== 'tray') {
    ax = (-(s.y - py) / dt / Math.sin(D.tilt)) * 0.00035
    az = ((s.x - px) / dt) * 0.00035
  }
  if (s.state !== 'press') {
    s.hv += ((hT - s.h) * 170 - s.hv * 18) * dt
    s.h += s.hv * dt
  }
  s.vtx += ((ax - s.tx) * 120 - s.vtx * 11) * dt
  s.vtz += ((az - s.tz) * 120 - s.vtz * 11) * dt
  s.tx += s.vtx * dt
  s.tz += s.vtz * dt
  s.vsq += (-s.sq * 260 - s.vsq * 14) * dt
  s.sq += s.vsq * dt
  s.ringA += (ringT - s.ringA) * (1 - Math.exp(-dt * 10))

  // Đặt vào cảnh: điểm màn (x, y) -> điểm sàn (X, 0, Z).
  const X = s.x - D.vw / 2
  const Z = (s.y - D.vh / 2) / Math.sin(D.tilt)
  s.root.position.set(X, 0, Z)
  s.root.scale.setScalar(s.r)
  s.hover.position.y = Math.max(0, s.h)
  const lim = 0.45
  s.tip.rotation.x = Math.max(-lim, Math.min(lim, s.tx))
  s.tip.rotation.z = Math.max(-lim, Math.min(lim, s.tz))
  const q = Math.max(-0.12, Math.min(0.12, s.sq * 0.06))
  s.squash.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5)
  s.ring.position.set(X, 0.3, Z)
  s.ring.scale.setScalar(s.r)
  s.ringMat.opacity = s.ringA
  s.ring.visible = s.ringA > 0.01

  const e = 1e-3
  return (
    s.state !== 'tray' ||
    Math.abs(gx - s.x) + Math.abs(gy - s.y) > 0.05 ||
    Math.abs(rT - s.r) > 0.02 ||
    Math.abs(hT - s.h) + Math.abs(s.hv) > e ||
    Math.abs(s.tx) + Math.abs(s.tz) + Math.abs(s.vtx) + Math.abs(s.vtz) > e ||
    Math.abs(s.sq) + Math.abs(s.vsq) > e ||
    s.ringA > 0.01
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
    saveColors()
    resize()
  },
  setColor: (i, part, hex) => setColor(i, part, hex),
  // Cầm dấu thứ i ra (null = cất về khay).
  pick(i) {
    if (!D) return
    if (i == null) return putBack()
    toggle(D.stamps[i])
  },
  // Xoá hết vết mực trên lưới.
  clear() {
    if (!D) return
    D.printList.forEach((el) => el.remove())
    D.printList = []
  },
  get state() {
    return D
  },
}
