/* =============================================================================
 * CHANDE — Sinh vật 3D trong lõi vòng tròn About (cá koi, bướm)
 * -----------------------------------------------------------------------------
 * Vòng nào có data-creature thì có sinh vật: "butterfly" (vòng 1 — bướm vỗ cánh bay),
 * "koi" (vòng 2 — cá koi bướm bơi), "frog" (vòng 3 — ếch nhảy). Đưa bubble vào giữa lõi vòng đó (cùng điều kiện
 * làm vòng vạch xoay — chande-circles.js) thì sinh vật hiện dần trong lòng vòng;
 * bubble rời ra thì mờ dần. Một canvas three.js dùng chung, gắn vào vòng đang có
 * bubble, cắt theo hình tròn của lõi.
 *
 * Dựng bằng hình học + ảnh canvas (không cần file model):
 *   • koi: ảnh koi bướm thật nhìn từ trên (assets/img/home/koi-top.webp — loang cam trắng,
 *     có vảy, vây + đuôi dài trắng) dán lên dải mặt phẳng nhiều đoạn, uốn sóng khi bơi.
 *   • bướm: ảnh bướm thật nhìn từ trên (assets/img/home/butterfly-top.webp — tạo theo ảnh
 *     bướm của vòng 1), chia đôi thành hai cánh vỗ quanh trục thân + thân 3D mảnh;
 *     bay lượn hình số 8, nhấp nhô.
 *   • ếch: hai ảnh ếch thật nhìn từ trên (ngồi / đang nhảy, assets/img/home/frog-*.webp);
 *     ngồi thở -> quay về hướng điểm đến -> nhảy ngắn, thấp (hơi to lên, bóng tách nhẹ) -> đáp.
 * Camera phối cảnh nhìn thẳng xuống; bóng mờ in xuống ảnh phía dưới, lệch theo đèn.
 * Chỉ nạp / vẽ khi cụm vòng tròn trong màn và có sinh vật đang hiện.
 *
 * Module — nạp three (động) từ assets/vendor/three. Mount / gỡ theo Barba.
 * API: window.CHANDE_KOI = { config, mount(root), destroy() }
 * ========================================================================== */
// three nạp động khi cụm vòng tròn vào màn (không tải lúc mở trang)
let THREE = null
let threeLoading = null
const loadThree = () =>
  (threeLoading ||= import('../vendor/three/three.module.min.js').then((m) => (THREE = m)))

const CONFIG = {
  enabled: true,
  length: 0.55, // chiều dài cá cả đuôi (× đường kính lõi)
  orbit: 0.2, // bán kính vòng bơi (× đường kính lõi)
  speed: 0.55, // tốc độ bơi (vòng / 6 giây ≈ 0.55 rad/s)
  wiggle: 1, // biên độ uốn thân
  spinIn: 0.55, // tâm bubble cách tâm lõi < spinIn × bán kính lõi thì cá hiện
  shadow: 0.28, // độ đậm bóng cá trên ảnh
  // bướm
  wingspan: 0.42, // sải cánh (× đường kính lõi)
  flap: 2.6, // nhịp vỗ cánh (lần / giây)
  fly: 0.22, // phạm vi bay lượn (× đường kính lõi)
  // ếch
  frog: 0.24, // chiều dài ếch ngồi (× đường kính lõi)
  hop: 0.3, // phạm vi nhảy: bán kính quanh tâm (× đường kính lõi)
}
window.CHANDE_SETTINGS_APPLY?.('koi', CONFIG)
const api = { config: CONFIG, mount() {}, destroy() {} }
window.CHANDE_KOI = api

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

/* ------------------------------------------------------------- Con cá --- */
// Ảnh koi bướm thật nhìn từ trên (tạo theo ảnh mẫu, tách nền): đầu ở mép TRÊN ảnh, trục
// thân đúng giữa ảnh; loang cam trắng, có vảy, vây + đuôi dài trắng. Vảy nằm sẵn trong ảnh.
const KOI_IMG = new URL('../img/home/koi-top.webp', import.meta.url).href
const KOI_ASPECT = 532 / 1024 // rộng / cao ảnh

// Cá dài 1 đơn vị dọc trục X (mũi ở +0.5, ngọn đuôi ở -0.5), nằm trên mặt XY, lưng hướng +Z.
// Ảnh dán lên một dải mặt phẳng chia nhiều đoạn dọc thân -> uốn sóng khi bơi.
function buildKoi() {
  const group = new THREE.Group()
  const tex = new THREE.TextureLoader().load(KOI_IMG)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  // ảnh đã có sáng tối sẵn -> giữ nguyên màu (không chịu đèn)
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.03, side: THREE.DoubleSide, depthWrite: false })
  const geo = new THREE.PlaneGeometry(KOI_ASPECT, 1, 1, 64)
  geo.rotateZ(-Math.PI / 2) // ngang ảnh -> trục Y, trên ảnh (đầu) -> +X
  group.add(new THREE.Mesh(geo, mat))
  const p = geo.attributes.position
  const base = Float32Array.from(p.array)
  function update(t, amp) {
    for (let i = 0; i < p.count; i++) {
      const x = base[i * 3]
      // đuôi dài (nửa sau ảnh): thêm một lớp phất phơ chậm, mạnh dần về ngọn
      const u = Math.max(0, (0.05 - x) / 0.55)
      p.array[i * 3 + 1] = base[i * 3 + 1] + bend(x, t, amp) + amp * 0.035 * u * u * Math.sin(u * 3.5 - t * 3)
    }
    p.needsUpdate = true
  }
  update(0, 1)
  return { group, update }
}

// Độ lệch ngang (Y) của thân tại x (mũi +0.5 … đuôi -0.5): sóng chạy về đuôi,
// biên độ tăng mạnh về phía đuôi, đầu gần như đứng yên
function bend(x, t, amp) {
  const s = 0.5 - x // 0 ở mũi, 1 ở gốc đuôi, > 1 ở vây đuôi
  return amp * 0.06 * Math.pow(Math.max(0, s), 2) * Math.sin(s * 5.2 - t * 5)
}

/* ------------------------------------------------------------ Con bướm --- */
// Ảnh bướm thật nhìn từ trên, cánh xoè đối xứng (tạo theo ảnh bướm của vòng 1, tách nền):
// đầu ở mép TRÊN ảnh, thân đúng giữa ảnh theo chiều ngang. Mỗi nửa ảnh = một bên cánh.
const BUTTERFLY_IMG = new URL('../img/home/butterfly-top.webp', import.meta.url).href
const BF_ASPECT = 764 / 1024 // cao / rộng ảnh

// Bướm sải cánh 1 đơn vị (trục Y), thân dọc trục X (đầu về +X), lưng hướng +Z.
function buildButterfly() {
  const group = new THREE.Group()
  const tex = new THREE.TextureLoader().load(BUTTERFLY_IMG)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.04, side: THREE.DoubleSide, roughness: 0.75, depthWrite: false })
  const Lb = BF_ASPECT // chiều dài ảnh dọc thân, khi sải cánh = 1
  // nửa cánh: mặt phẳng nửa sải × Lb, mép trong (giáp thân) ở gốc toạ độ
  const half = (sd) => {
    // sd = +1: nửa TRÁI ảnh -> phía +Y; sd = -1: nửa PHẢI ảnh -> phía -Y
    const geo = new THREE.PlaneGeometry(0.5, Lb)
    geo.translate(sd > 0 ? -0.25 : 0.25, 0, 0)
    const uv = geo.attributes.uv
    for (let i = 0; i < uv.count; i++) uv.setX(i, sd > 0 ? uv.getX(i) * 0.5 : 0.5 + uv.getX(i) * 0.5)
    geo.rotateZ(-Math.PI / 2) // ngang ảnh -> trục Y (trái ảnh = +Y), trên ảnh (đầu) -> +X
    const pivot = new THREE.Group() // vỗ quanh trục thân (X)
    pivot.add(new THREE.Mesh(geo, mat))
    group.add(pivot)
    return { pivot, sd }
  }
  const wings = [half(1), half(-1)]
  // thân 3D mảnh đè lên giữa (ảnh thân bị chia đôi theo hai cánh — thân che đường nối khi gập)
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#4c4a2a', roughness: 0.7 })
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.22, 6, 12), bodyMat)
  body.rotation.z = Math.PI / 2
  body.position.set(-0.07, 0, 0.012)
  group.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 10), bodyMat)
  head.position.set(0.055, 0, 0.014)
  group.add(head)
  function update(t) {
    // vỗ cánh: nâng nhanh lên phía camera, hạ chậm gần phẳng
    const ph = (t * CONFIG.flap) % 1
    const e = ph < 0.42 ? ph / 0.42 : 1 - (ph - 0.42) / 0.58
    const k = e * e * (3 - 2 * e)
    const lift = -0.12 + 1.15 * k
    wings.forEach(({ pivot, sd }) => (pivot.rotation.x = sd * lift))
  }
  update(0)
  return { group, update }
}

/* ------------------------------------------------------------ Con ếch ---- */
// Hai ảnh ếch thật nhìn từ trên (tạo AI, tách nền), đầu ở mép TRÊN: ngồi (chân gập) và
// đang nhảy (chân sau duỗi, chân trước vươn). Hai ảnh đã cắt / thu cho KHOẢNG CÁCH HAI
// MẮT bằng nhau -> đổi dáng giữa chừng đầu không nhảy cỡ. Kích thước dưới đây theo
// "chiều dài ếch ngồi = 1", trục X = hướng đầu.
const FROG_SIT = new URL('../img/home/frog-sit.webp', import.meta.url).href
const FROG_JUMP = new URL('../img/home/frog-jump.webp', import.meta.url).href
// [rộng, dài, tâm ảnh lệch dọc thân (X)] — mắt ếch ngồi ở X ≈ +0.28; ảnh nhảy dời
// ra sau để mắt trùng chỗ đó
const FROG_SIT_DIM = [0.838, 1, 0]
const FROG_JUMP_DIM = [0.906, 1.8, -0.416]

// Ếch nhảy lung tung trong lõi: ngồi (thở) -> quay về hướng điểm đến -> bật nhảy theo
// đường vòng cung (to lên khi lên cao, bóng tách ra / nhỏ / mờ) -> đáp, ngồi tiếp.
function buildFrog() {
  const group = new THREE.Group()
  const load = (src) => {
    const t = new THREE.TextureLoader().load(src)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = 4
    return t
  }
  const mk = (src, [w, h, ox]) => {
    const geo = new THREE.PlaneGeometry(w, h)
    geo.rotateZ(-Math.PI / 2) // trên ảnh (đầu) -> +X
    geo.translate(ox, 0, 0)
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: load(src), transparent: true, alphaTest: 0.03, depthWrite: false }))
    group.add(m)
    return m
  }
  const sit = mk(FROG_SIT, FROG_SIT_DIM)
  const jump = mk(FROG_JUMP, FROG_JUMP_DIM)
  jump.visible = false

  // trạng thái (toạ độ cảnh)
  const st = { x: 0, y: 0, h: 0, heading: Math.PI / 2, phase: 'sit', time: 0, wait: 1.2, from: null, to: null, aim: 0 }
  const shadow = { x: 0, y: 0, k: 1, a: 1 }
  const pick = (A) => {
    // điểm đến: trong vòng bán kính A quanh tâm, cách chỗ đang đứng 15–30% A (nhảy ngắn)
    for (let i = 0; i < 12; i++) {
      const ang = Math.random() * Math.PI * 2
      const d = A * (0.15 + Math.random() * 0.15)
      const x = st.x + Math.cos(ang) * d
      const y = st.y + Math.sin(ang) * d
      if (Math.hypot(x, y) < A) return { x, y }
    }
    return { x: -st.x * 0.5, y: -st.y * 0.5 }
  }
  const angDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a))

  // A: phạm vi nhảy (bán kính, đơn vị cảnh); size: chiều dài ếch ngồi (đơn vị cảnh)
  function update(t, dt, show, A, size) {
    if (show < 0.01) {
      // ẩn hẳn: lần sau hiện lại ngồi giữa, nghỉ một chút rồi mới nhảy
      Object.assign(st, { x: 0, y: 0, h: 0, phase: 'sit', time: 0, wait: 0.8 })
    }
    st.time += dt
    let scale = 1
    if (st.phase === 'sit') {
      // thở: phập phồng nhẹ
      scale = 1 + 0.025 * Math.sin(t * 5)
      if (st.time > st.wait) {
        st.to = pick(A)
        st.from = { x: st.x, y: st.y }
        st.aim = Math.atan2(st.to.y - st.y, st.to.x - st.x)
        st.phase = 'turn'
        st.time = 0
      }
    } else if (st.phase === 'turn') {
      const d = angDiff(st.heading, st.aim)
      st.heading += d * Math.min(1, dt * 9)
      if (Math.abs(d) < 0.05 || st.time > 0.5) {
        st.phase = 'jump'
        st.time = 0
      }
    } else if (st.phase === 'jump') {
      const T = 0.4
      const p = Math.min(1, st.time / T)
      const e = p * p * (3 - 2 * p)
      st.x = st.from.x + (st.to.x - st.from.x) * e
      st.y = st.from.y + (st.to.y - st.from.y) * e
      st.h = Math.sin(Math.PI * p)
      scale = 1 + 0.1 * st.h // nhảy thấp: chỉ trồi lên một chút
      // duỗi chân khi đang ở trên không
      const air = p > 0.06 && p < 0.9
      jump.visible = air
      sit.visible = !air
      if (p >= 1) {
        st.phase = 'sit'
        st.time = 0
        st.h = 0
        st.wait = 0.9 + Math.random() * 1.3
        jump.visible = false
        sit.visible = true
      }
    }
    group.position.set(st.x, st.y, 0.1 + st.h * 0.12)
    group.rotation.set(0, 0, st.heading)
    group.scale.setScalar(size * scale)
    // bóng: ở đất ngay dưới ếch, lệch theo đèn xa dần khi lên cao, nhỏ + mờ đi
    shadow.x = st.x + (0.04 + 0.04 * st.h) * size
    shadow.y = st.y - (0.05 + 0.05 * st.h) * size
    shadow.k = 1 - 0.12 * st.h
    shadow.a = 1 - 0.25 * st.h
  }
  return { group, update, shadow, state: st }
}

/* ------------------------------------------------------------ Mount ------ */
let live = null

function mount(root = document) {
  destroy()
  if (!CONFIG.enabled || reduced) return
  const scope = root.querySelector ? root : document
  // vòng có data-creature: "butterfly" (vòng 1), "koi" (vòng 2), "frog" (vòng 3)
  const BUILD = { koi: buildKoi, butterfly: buildButterfly, frog: buildFrog }
  const circles = [...scope.querySelectorAll('.hs-about .circle[data-creature]')]
    .map((c) => ({ c, core: c.querySelector('.core'), kind: c.dataset.creature }))
    .filter((o) => o.core && BUILD[o.kind])
  if (!circles.length) return

  let three = null // dựng khi cần lần đầu
  const setup = () => {
    const canvas = document.createElement('canvas')
    canvas.className = 'ckoi'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:absolute; pointer-events:none; border-radius:50%; opacity:0; z-index:2'
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20)
    camera.position.set(0, 0, 4.2)
    camera.lookAt(0, 0, 0)
    scene.add(new THREE.HemisphereLight('#ffffff', '#5d6b4f', 1.15))
    const sun = new THREE.DirectionalLight('#ffffff', 1.6)
    sun.position.set(-2, 2.2, 1.6)
    scene.add(sun)
    // bóng mờ in xuống ảnh: elip gradient, dưới cá một chút, lệch theo đèn
    const sc = document.createElement('canvas')
    sc.width = sc.height = 128
    const g = sc.getContext('2d')
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64)
    grd.addColorStop(0, 'rgba(0,0,0,1)')
    grd.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = grd
    g.fillRect(0, 0, 128, 128)
    const shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: CONFIG.shadow })
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.34), shadowMat)
    shadow.renderOrder = -1
    scene.add(shadow)
    three = { canvas, renderer, scene, camera, shadow, owner: null, made: {}, cur: null }
  }

  let raf = 0
  let inView = false
  let lastT = 0
  let t = 0
  let show = 0 // độ hiện (0..1)
  let active = null // vòng đang có bubble
  let ang = Math.random() * Math.PI * 2

  const place = (o) => {
    // canvas phủ đúng lõi của vòng (toạ độ trong .circle)
    const cr = o.c.getBoundingClientRect()
    const k = o.core.getBoundingClientRect()
    const D = k.width
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const px = Math.max(1, Math.round(D * dpr))
    if (three.canvas.width !== px) {
      three.renderer.setPixelRatio(dpr)
      three.renderer.setSize(D, D, false)
    }
    Object.assign(three.canvas.style, {
      left: `${k.left - cr.left}px`, top: `${k.top - cr.top}px`, width: `${D}px`, height: `${D}px`,
    })
    if (three.owner !== o) {
      o.c.append(three.canvas)
      three.owner = o
      // sinh vật của vòng này (dựng lần đầu khi cần), ẩn con của vòng khác
      if (!three.made[o.kind]) {
        three.made[o.kind] = BUILD[o.kind]()
        three.scene.add(three.made[o.kind].group)
      }
      Object.entries(three.made).forEach(([k, c]) => (c.group.visible = k === o.kind))
      three.cur = three.made[o.kind]
    }
  }

  const tick = (now) => {
    raf = 0
    const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0
    lastT = now
    const B = window.CHANDE_BUBBLE?.state
    // vòng nào đang có bubble ở giữa lõi
    let hit = null
    if (B && B.presence > 0.3)
      for (const o of circles) {
        const k = o.core.getBoundingClientRect()
        const kr = k.width / 2
        if (Math.hypot(B.x - (k.left + kr), B.y - (k.top + kr)) < kr * CONFIG.spinIn) hit = o
      }
    if (hit && !three) {
      if (!THREE) hit = null // three chưa nạp xong — khung sau
      else setup()
    }
    // Sang vòng khác: sinh vật của vòng cũ mờ hẳn rồi mới chuyển sang vòng mới. (Trước đây
    // trong lúc mờ lại coi như bubble vẫn ở vòng cũ -> nó sáng lại và kẹt ở đó, vòng mới
    // không bao giờ hiện — "lúc có lúc không" tuỳ có đi ngang vòng kia trước hay không.)
    if (hit && !active) active = hit
    const on = !!hit && hit === active
    show += ((on ? 1 : 0) - show) * (1 - Math.exp(-dt * (on ? 3 : 5)))
    if (show < 0.003 && !on) {
      show = 0
      if (three) three.canvas.style.opacity = '0'
      active = hit // null nếu bubble đã rời hết, hoặc vòng mới đang chờ hiện
    } else if (three && active) {
      place(active)
      three.canvas.style.opacity = show.toFixed(3)
      t += dt
      // đơn vị cảnh: canvas (= lõi) rộng 2 · 4.2 · tan(13°) ≈ 1.94 ở camera này
      const Dw = 2 * 4.2 * Math.tan((13 * Math.PI) / 180)
      const { cur, shadow } = three
      let x, y, z, heading, s, sh
      if (active.kind === 'frog') {
        // ếch tự lo vị trí / hướng / cỡ (nhảy theo trạng thái riêng); chỉ đặt bóng
        const size = CONFIG.frog * Dw
        cur.update(t, dt, show, CONFIG.hop * Dw, size)
        const fs = cur.shadow
        shadow.position.set(fs.x, fs.y, -0.3)
        shadow.rotation.z = cur.state.heading
        shadow.scale.set(size * 0.95 * fs.k, size * 0.62 * fs.k / 0.34, 1)
        shadow.material.opacity = CONFIG.shadow * 1.3 * fs.a
        three.renderer.render(three.scene, three.camera)
        if (inView) raf = requestAnimationFrame(tick)
        return
      }
      shadow.material.opacity = CONFIG.shadow
      if (active.kind === 'koi') {
        // bơi vòng quanh tâm (ngược chiều kim đồng hồ), lượn nhẹ
        ang += dt * CONFIG.speed
        const R = CONFIG.orbit * Dw
        const wob = Math.sin(t * 0.7) * 0.06
        x = Math.cos(ang) * (R + wob)
        y = Math.sin(ang) * (R + wob)
        z = 0.08
        heading = ang + Math.PI / 2 + Math.sin(t * 1.3) * 0.12
        s = CONFIG.length * Dw
        sh = [0.05, -0.07, 1, 0.34]
        cur.update(t, CONFIG.wiggle)
      } else {
        // bướm: bay lượn hình số 8 quanh tâm, nhấp nhô theo nhịp cánh; đầu hướng theo đường bay
        const A = CONFIG.fly * Dw
        const w = 0.42
        const px = (q) => Math.sin(q * w) * A
        const py = (q) => Math.sin(q * w * 2) * A * 0.55
        x = px(t)
        y = py(t)
        const vx = px(t + 0.05) - x
        const vy = py(t + 0.05) - y
        heading = Math.atan2(vy, vx)
        z = 0.35 + 0.05 * Math.sin(t * CONFIG.flap * Math.PI * 2)
        s = CONFIG.wingspan * Dw
        sh = [0.09, -0.12, 0.55, 0.45]
        cur.update(t)
      }
      cur.group.position.set(x, y, z)
      cur.group.rotation.set(0, 0, heading)
      cur.group.scale.setScalar(s)
      shadow.position.set(x + sh[0], y + sh[1], -0.3)
      shadow.rotation.z = heading
      shadow.scale.set(s * sh[2], s * sh[3] / 0.34, 1)
      three.renderer.render(three.scene, three.camera)
    }
    if (inView) raf = requestAnimationFrame(tick)
  }

  const io = new IntersectionObserver(([e]) => {
    inView = e.isIntersecting
    if (inView) loadThree()
    if (inView && !raf) {
      lastT = 0
      raf = requestAnimationFrame(tick)
    }
  })
  io.observe(circles[0].c.closest('.circles') || circles[0].c)

  live = {
    el: circles[0].c,
    stop() {
      io.disconnect()
      cancelAnimationFrame(raf)
      if (three) {
        three.canvas.remove()
        three.renderer.dispose()
      }
    },
  }
}

function destroy() {
  live?.stop()
  live = null
}

api.mount = mount
api.destroy = destroy
mount(document)
if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (live && data.current.container?.contains(live.el)) destroy()
  })
}
