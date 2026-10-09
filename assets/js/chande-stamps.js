/* =============================================================================
 * CHANDE — Hai con dấu 3D ở góc canvas gallery
 * -----------------------------------------------------------------------------
 * Hai con dấu cao su (đế tròn có vành + cán tiện tròn, nhựa bóng) đứng ở hai
 * góc màn — góc dưới trái và góc trên phải, chừa thanh header. Mỗi con in ra
 * một mẫu SVG (assets/img/gallery/stamps/*.svg), mặt núm cán in sẵn mẫu đó để
 * biết con nào in hình gì. Phối màu theo bảng màu Chande (xanh lá, kem, lime).
 *   • Rê chuột vào: dấu nhấc nhẹ lên.
 *   • Bấm giữ + kéo: nhấc dấu lên theo tay, nghiêng theo quán tính; thả ra là
 *     dập xuống đúng chỗ đó, để lại vết mực trên lưới (đè lên cả ảnh), rồi tự
 *     bay về góc.
 *   • Bấm một cái (không kéo): dấu nhảy vào trong màn một đoạn, dập, quay về.
 * Vết mực gắn toạ độ thế giới gallery nên kéo lưới thì vết trôi theo ảnh; giữ
 * tối đa CONFIG.maxPrints vết, vết cũ nhất mờ đi rồi mất.
 * Camera trực giao nghiêng CONFIG.tilt độ như vịt (chande-duck.js): điểm sàn
 * (X, 0, Z) hiện ở màn (X, Z·sin tilt), độ cao Y đẩy lên màn Y·cos tilt.
 * Module — nạp three từ assets/vendor/three. Mount / gỡ theo Barba.
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

const CONFIG = {
  size: 66, // px — bán kính đế dấu trên màn (khổ desktop)
  tilt: 62, // độ — góc camera so với mặt sàn
  margin: 30, // px — cách mép màn
  lift: 0.95, // × bán kính — nhấc cao bao nhiêu khi cầm
  hover: 0.12, // × bán kính — nhấc khi rê chuột
  hop: 2.4, // × bán kính — bấm một cái thì nhảy vào trong màn bấy nhiêu
  maxPrints: 48,
  ink: [0.84, 0.96], // độ đậm vết mực (ngẫu nhiên trong khoảng)
  spin: 28, // độ — vết mực xoay ngẫu nhiên ±spin
  stamps: [
    {
      svg: 'assets/img/gallery/stamps/stamp-001.svg',
      corner: 'bl', // bl | br | tl | tr
      handle: '#68f12b', // lime
      base: '#245535', // xanh lá Chande
      label: '#245535', // mẫu in trên mặt núm
      ink: '#245535', // màu mực
    },
    {
      svg: 'assets/img/gallery/stamps/stamp-002.svg',
      corner: 'tr',
      handle: '#e8e2cb', // kem
      base: '#1b2625', // xanh đen (panel)
      label: '#1b2625',
      ink: '#1b2625',
    },
  ],
}
// Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
window.CHANDE_SETTINGS_APPLY?.('stamps', CONFIG)
const DEFAULTS = structuredClone(CONFIG)

/* ------------------------------------------------------------- hình khối -- */
// Toàn bộ dựng với bán kính đế = 1, gốc = tâm mặt cao su chạm sàn.
const PAD_H = 0.05 // lớp cao su đen dưới đáy
const WELL_Y = 0.17 // mặt lõm trong vành đế (chân cán đứng ở đây)
const TOP_Y = 1.5 // mặt núm cán
const TOP_R = 0.33 // bán kính phần phẳng trên mặt núm

// Mặt cắt đế: vành ngoài nhô cao, lòng trong lõm xuống (như dấu mẫu).
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
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    sheen: 0.3,
    sheenColor: new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.5),
  })

function buildStamp(def) {
  const root = new THREE.Group() // vị trí trên sàn + tỉ lệ (= bán kính px)
  const hover = new THREE.Group() // độ nhấc (y)
  const tip = new THREE.Group() // nghiêng theo quán tính — quay quanh tâm đáy
  const squash = new THREE.Group() // nảy khi dập
  root.add(hover)
  hover.add(tip)
  tip.add(squash)

  const meshes = []
  const add = (geo, mat, shadow = true) => {
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = shadow
    m.receiveShadow = true
    squash.add(m)
    meshes.push(m)
    return m
  }
  // Cao su đáy (màu mực đậm) + đế + cán.
  const pad = new THREE.CylinderGeometry(0.955, 0.94, PAD_H, 96)
  pad.translate(0, PAD_H / 2, 0)
  add(pad, new THREE.MeshStandardMaterial({ color: '#0f1513', roughness: 0.85 }))
  add(lathe(BASE_PROFILE, 72), plastic(def.base))
  add(lathe(HANDLE_PROFILE, 110), plastic(def.handle))

  // Mặt núm: mẫu in (texture vẽ từ SVG khi nạp xong).
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

  // Khối bắt chuột (vô hình) — rộng hơn hình một chút cho dễ bấm.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, TOP_Y + 0.1, 24).translate(0, (TOP_Y + 0.1) / 2, 0),
    new THREE.MeshBasicMaterial({ visible: false }),
  )
  squash.add(hit)

  return { root, hover, tip, squash, meshes, label, labelMat, hit }
}

/* ------------------------------------------------------------- mẫu in SVG -- */
const svgCache = new Map()
function loadSvg(url) {
  if (!svgCache.has(url)) svgCache.set(url, fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(r.status))))
  return svgCache.get(url)
}
// Đổi mọi màu đỏ của file gốc sang một màu, bỏ blend của Figma.
function tint(text, hex) {
  return text
    .replace(/style="mix-blend-mode:\s*\w+"/g, '')
    .replace(/(fill|stroke)="#(?!fff\b|ffffff\b)[0-9a-f]{3,6}"/gi, `$1="${hex}"`)
}
const svgUrl = (text) => URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }))

function loadImage(src) {
  return new Promise((ok, fail) => {
    const im = new Image()
    im.onload = () => ok(im)
    im.onerror = fail
    im.src = src
  })
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
  // Lớp vết mực: ngay trên lưới ảnh, dưới canvas vịt / dấu.
  if (world) world.after(prints)
  else stage.prepend(prints)

  const canvas = document.createElement('canvas')
  canvas.className = 'gal__stamps'
  stage.appendChild(canvas)

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
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
    scene.add(s.root)
    return {
      i,
      def,
      ...s,
      x: 0, // toạ độ màn (px) của tâm đáy dấu, khi nằm trên sàn
      y: 0,
      h: 0, // độ nhấc (× bán kính)
      hv: 0,
      tx: 0, // nghiêng (rad) + vận tốc lò xo
      tz: 0,
      vtx: 0,
      vtz: 0,
      sq: 0, // nén khi dập
      vsq: 0,
      state: 'idle', // idle | hold | aim | press | back
      t0: 0,
      aim: null,
      grab: null,
      hovered: false,
      printSrc: null,
    }
  })

  D = {
    stage,
    world,
    prints,
    canvas,
    renderer,
    scene,
    cam,
    key,
    floor,
    tilt,
    stamps,
    vw: 0,
    vh: 0,
    R: CONFIG.size,
    ptr: null,
    held: null,
    eatClick: 0,
    printList: [],
    urls: [],
    raf: 0,
    last: performance.now(),
    off: [],
    ray: new THREE.Raycaster(),
    dirty: true,
  }

  // Mẫu in: vết mực (màu ink) + nhãn trên núm (màu label).
  stamps.forEach((s) => {
    loadSvg(s.def.svg)
      .then(async (text) => {
        if (!D || D.stamps[s.i] !== s) return
        const ink = svgUrl(tint(text, s.def.ink))
        const lab = svgUrl(tint(text, s.def.label))
        D.urls.push(ink, lab)
        s.printSrc = ink
        const im = await loadImage(lab)
        if (!D || D.stamps[s.i] !== s) return
        const c = document.createElement('canvas')
        c.width = c.height = 512
        c.getContext('2d').drawImage(im, 0, 0, 512, 512)
        const tex = new THREE.CanvasTexture(c)
        tex.colorSpace = THREE.SRGBColorSpace
        tex.anisotropy = 4
        s.labelMat.map = tex
        s.labelMat.opacity = 0.92
        s.labelMat.needsUpdate = true
        D.dirty = true
      })
      .catch((e) => console.warn('[chande-stamps] không nạp được', s.def.svg, e))
  })

  const on = (el, ev, fn, opt) => {
    el.addEventListener(ev, fn, opt)
    D.off.push(() => el.removeEventListener(ev, fn, opt))
  }
  // Bắt ở pha capture của window: bấm trúng dấu thì lưới không bị kéo theo.
  on(window, 'pointerdown', onDown, true)
  on(window, 'pointermove', onMove, { passive: true })
  on(window, 'pointerup', onUp, true)
  on(window, 'pointercancel', onUp, true)
  on(window, 'click', onClickEat, true)
  on(document, 'pointerleave', () => D && !D.held && (D.ptr = null))
  on(window, 'resize', () => resize())
  resize()
  stamps.forEach((s) => {
    const h = home(s)
    s.x = h.x
    s.y = h.y
  })

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
  D.urls.forEach((u) => URL.revokeObjectURL(u))
  D.stage.classList.remove('is-stamp-hover', 'is-stamp-hold')
  D = null
}

function resize() {
  const r = D.stage.getBoundingClientRect()
  D.vw = r.width
  D.vh = r.height
  D.renderer.setSize(D.vw, D.vh, false)
  D.dirty = true
  D.canvas.style.width = D.vw + 'px'
  D.canvas.style.height = D.vh + 'px'
  const { cam, key } = D
  cam.left = -D.vw / 2
  cam.right = D.vw / 2
  cam.top = D.vh / 2
  cam.bottom = -D.vh / 2
  cam.updateProjectionMatrix()
  // Màn hẹp thì dấu nhỏ lại: không quá 10% bề ngang màn, không quá 0.75 cạnh ô ảnh.
  const tile = D.stage.querySelector('.gal__probe')?.offsetWidth || 160
  D.R = Math.max(26, Math.min(CONFIG.size, D.vw * 0.1, tile * 0.75))
  D.stamps.forEach((s) => s.root.scale.setScalar(D.R))
  // Đèn chính chiếu chéo từ trên-trái-sau; khung bóng phủ cả màn.
  const span = Math.max(D.vw, D.vh / Math.sin(D.tilt)) * 0.6 + D.R * 3
  key.position.set(-420, 1100, -380)
  key.target.position.set(0, 0, 0)
  const sc = key.shadow.camera
  sc.left = sc.bottom = -span
  sc.right = sc.top = span
  sc.near = 1
  sc.far = 4000
  sc.updateProjectionMatrix()
}

// Vị trí nghỉ ở góc (toạ độ màn của tâm đáy).
function home(s) {
  const R = D.R
  const m = Math.min(CONFIG.margin, D.vw * 0.05)
  const sin = Math.sin(D.tilt)
  const cos = Math.cos(D.tilt)
  const c = s.def.corner || 'bl'
  const bar = document.querySelector('.cl__bar')?.getBoundingClientRect()
  const top = (bar && bar.bottom > 0 && bar.bottom < D.vh * 0.4 ? bar.bottom : 0) + m
  const x = c.includes('l') ? m + R : D.vw - m - R
  const y = c.includes('t') ? top + R * TOP_Y * cos + R * sin : D.vh - m - R * sin
  return { x, y }
}

const galleryView = () => window.CHANDE_GALLERY?.view?.() || null

/* ------------------------------------------------------------- tương tác -- */
const localPt = (e) => {
  const r = D.stage.getBoundingClientRect()
  return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp }
}

function pick(p) {
  const ndc = new THREE.Vector2((p.x / D.vw) * 2 - 1, -(p.y / D.vh) * 2 + 1)
  D.ray.setFromCamera(ndc, D.cam)
  const hits = D.ray.intersectObjects(
    D.stamps.map((s) => s.hit),
    false,
  )
  return hits.length ? D.stamps.find((s) => s.hit === hits[0].object) : null
}

function onDown(e) {
  if (!D || e.button !== 0 || document.querySelector('.gal-lb')) return
  const p = localPt(e)
  const s = pick(p)
  if (!s || (s.state !== 'idle' && s.state !== 'back')) return
  e.stopPropagation()
  e.preventDefault()
  D.held = s
  D.ptr = { ...p, vx: 0, vy: 0, sx: p.x, sy: p.y, moved: false, id: e.pointerId }
  s.state = 'hold'
  s.grab = { x: s.x - p.x, y: s.y - p.y }
  D.stage.classList.add('is-stamp-hold')
}

function onMove(e) {
  if (!D) return
  const p = localPt(e)
  const q = D.ptr
  const dt = q ? Math.max(1, p.t - q.t) / 1000 : 1
  D.ptr = {
    ...(q || {}),
    x: p.x,
    y: p.y,
    t: p.t,
    vx: q ? q.vx * 0.5 + ((p.x - q.x) / dt) * 0.5 : 0,
    vy: q ? q.vy * 0.5 + ((p.y - q.y) / dt) * 0.5 : 0,
  }
  if (D.held && Math.hypot(p.x - D.ptr.sx, p.y - D.ptr.sy) > 6) D.ptr.moved = true
  if (!D.held) {
    const hov = e.pointerType === 'mouse' ? pick(p) : null
    D.stamps.forEach((s) => (s.hovered = s === hov))
    D.stage.classList.toggle('is-stamp-hover', !!hov)
  }
}

function onUp(e) {
  if (!D || !D.held || (D.ptr?.id != null && e.pointerId !== D.ptr.id)) return
  e.stopPropagation()
  const s = D.held
  D.held = null
  // click đến sau pointerup (có khi trễ một nhịp) — nuốt trong 400ms.
  D.eatClick = performance.now() + 400
  D.stage.classList.remove('is-stamp-hold')
  if (e.type === 'pointercancel') return void (s.state = 'back')
  if (D.ptr?.moved) {
    s.aim = { x: s.x, y: s.y }
  } else {
    // Bấm một cái: nhảy vào phía trong màn (hướng về tâm) rồi dập.
    const h = home(s)
    const dx = D.vw / 2 - h.x
    const dy = D.vh / 2 - h.y
    const d = Math.hypot(dx, dy) || 1
    const j = (Math.random() - 0.5) * 0.6
    const ang = Math.atan2(dy, dx) + j
    const L = Math.min(d * 0.8, D.R * CONFIG.hop)
    s.aim = { x: h.x + Math.cos(ang) * L, y: h.y + Math.sin(ang) * L * Math.sin(D.tilt) }
  }
  s.state = 'aim'
  s.t0 = performance.now()
}

// Thả dấu trên một ảnh không được mở lightbox.
function onClickEat(e) {
  if (!D || performance.now() > D.eatClick) return
  D.eatClick = 0
  e.stopPropagation()
  e.preventDefault()
}

/* ---------------------------------------------------------------- vết mực -- */
function print(s) {
  const view = galleryView()
  if (!s.printSrc || !view) return
  const d = D.R * 2 * 0.955 // đường kính mặt cao su trên màn
  const el = document.createElement('img')
  el.className = 'gal__print'
  el.alt = ''
  el.draggable = false
  el.src = s.printSrc
  const rot = (Math.random() * 2 - 1) * CONFIG.spin
  const a = CONFIG.ink[0] + Math.random() * (CONFIG.ink[1] - CONFIG.ink[0])
  el.style.width = el.style.height = d + 'px'
  el.style.left = s.x - view.x - d / 2 + 'px'
  el.style.top = s.y - view.y - d / 2 + 'px'
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

  // Chỉ vẽ lại khi có dấu đang động (đứng yên ở góc thì khung hình giữ nguyên).
  let busy = D.dirty
  for (const s of D.stamps) busy = step(s, now, dt) || busy
  if (busy) D.renderer.render(D.scene, D.cam)
  D.dirty = false
}

const PRESS = { down: 0.1, hold: 0.2 } // s — dập xuống / đè giữ

function step(s, now, dt) {
  const t = (now - s.t0) / 1000
  let hT = s.hovered ? CONFIG.hover : 0
  let gx = s.x
  let gy = s.y
  let follow = 6
  let ax = 0
  let az = 0

  if (s.state === 'idle' || s.state === 'back') {
    const h = home(s)
    gx = h.x
    gy = h.y
    if (s.state === 'back') {
      const d = Math.hypot(h.x - s.x, h.y - s.y)
      hT = d > 4 ? CONFIG.lift * 0.55 * Math.min(1, d / (R * 2)) : hT
      follow = 5
      if (d < 1.5) s.state = 'idle'
    }
  } else if (s.state === 'hold') {
    const p = D.ptr
    hT = CONFIG.lift
    follow = 16
    if (p) {
      gx = p.x + s.grab.x
      gy = p.y + s.grab.y
      // Kéo nhanh thì thân ngả ngược hướng kéo (quán tính).
      ax = (-p.vy / Math.sin(D.tilt)) * 0.00035
      az = p.vx * 0.00035
    }
  } else if (s.state === 'aim') {
    gx = s.aim.x
    gy = s.aim.y
    hT = CONFIG.lift
    follow = 12
    if (Math.hypot(gx - s.x, gy - s.y) < 2 || t > 0.6) {
      s.state = 'press'
      s.t0 = now
      s.printed = false
    }
  } else if (s.state === 'press') {
    gx = s.aim.x
    gy = s.aim.y
    follow = 20
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
        s.state = 'back'
        s.t0 = now
      }
    }
  }

  const k = 1 - Math.exp(-dt * follow)
  s.x += (gx - s.x) * k
  s.y += (gy - s.y) * k

  if (s.state !== 'press') {
    // Lò xo cho độ nhấc (có nảy nhẹ).
    s.hv += ((hT - s.h) * 170 - s.hv * 18) * dt
    s.h += s.hv * dt
  }
  // Lò xo nghiêng + nén.
  s.vtx += ((ax - s.tx) * 120 - s.vtx * 11) * dt
  s.vtz += ((az - s.tz) * 120 - s.vtz * 11) * dt
  s.tx += s.vtx * dt
  s.tz += s.vtz * dt
  s.vsq += (-s.sq * 260 - s.vsq * 14) * dt
  s.sq += s.vsq * dt

  // Đặt vào cảnh: điểm màn (x, y) -> điểm sàn (X, 0, Z).
  const X = s.x - D.vw / 2
  const Z = (s.y - D.vh / 2) / Math.sin(D.tilt)
  s.root.position.set(X, 0, Z)
  s.hover.position.y = Math.max(0, s.h)
  const lim = 0.45
  s.tip.rotation.x = Math.max(-lim, Math.min(lim, s.tx))
  s.tip.rotation.z = Math.max(-lim, Math.min(lim, s.tz))
  const q = Math.max(-0.12, Math.min(0.12, s.sq * 0.06))
  s.squash.scale.set(1 - q * 0.5, 1 + q, 1 - q * 0.5)
  const e = 1e-3
  return (
    s.state !== 'idle' ||
    Math.abs(gx - s.x) + Math.abs(gy - s.y) > 0.05 ||
    Math.abs(hT - s.h) + Math.abs(s.hv) > e ||
    Math.abs(s.tx) + Math.abs(s.tz) + Math.abs(s.vtx) + Math.abs(s.vtz) > e ||
    Math.abs(s.sq) + Math.abs(s.vsq) > e
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
