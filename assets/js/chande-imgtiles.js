/* =============================================================================
 * CHANDE — Ảnh vỡ ô khi rê chuột (cùng hiệu ứng với mảng xanh)
 * -----------------------------------------------------------------------------
 * Rê vào ảnh (mặc định: 4 ảnh hero) thì vùng quanh chuột vỡ thành ô vuông và
 * chuyển động y như các ô của effect xanh: co / trượt, tản, hút, dạt sang ô bên,
 * gợn sóng. Mỗi ô MANG THEO mảnh ảnh của nó; khe giữa các ô là màu nền phía sau
 * ảnh (đọc từ phần tử cha gần nhất có nền). Rời chuột thì ô ghép lại, lớp phủ tắt,
 * ảnh gốc hiện như cũ.
 *
 * Mọi thông số rê chuột lấy CHUNG từ CHANDE_FIELD.config (hoverMode, hoverRadius,
 * hoverShrink, hoverPush, hoverGlow, hoverEase, hoverRipple, corners) — đổi preset
 * ở bảng setting là ảnh đổi theo. Cỡ ô = cỡ ô của mảng xanh hero.
 *
 * Một canvas WebGL DÙNG CHUNG (position: fixed), chỉ bật khi có ảnh đang được rê,
 * phủ đúng ảnh đó + nới 1 ô mỗi phía cho ô dạt tràn ra. Ảnh là canvas (chân dung
 * dither + lớp đổi ảnh) nên mỗi khung chụp lại vào texture — đang đổi ảnh vẫn đúng.
 *
 * API: window.CHANDE_IMGTILES = { config, defaults, refresh(), mount(root) }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    selector: '[data-hero-slot] .hero-card__media',
    cellScale: 1, // nhân cỡ ô so với ô của mảng xanh
  }
  window.CHANDE_SETTINGS_APPLY?.('imgtiles', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {}, mount() {} }
  window.CHANDE_IMGTILES = api

  const fine = matchMedia('(pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  if (!fine.matches || reduced.matches) return

  const F = () => window.CHANDE_FIELD?.config || {}

  /* ------------------------------------------------------------- shader --- */
  const VERT = `attribute vec2 aPos; varying vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`

  const FRAG = `precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uRes;      // cỡ ảnh (px thiết bị)
uniform vec2 uPad;      // nới mỗi phía, tỉ lệ theo cỡ ảnh
uniform vec2 uGrid;     // số ô ngang / dọc
uniform vec2 uMouse;    // chuột, toạ độ ảnh 0..1 (gốc trên-trái)
uniform float uOn;      // 0..1 bật/tắt dần
uniform float uRadius, uShrink, uPush, uGlow, uCorners, uMode, uTime;
uniform vec3 uGap;

float brickAt(vec2 g, vec2 c, out vec3 col, out float infl) {
  vec2 d = (c + 0.5) - uMouse * uGrid;
  float dist = length(d);
  infl = uOn * (1.0 - smoothstep(0.0, uRadius, dist));
  infl *= infl * (3.0 - 2.0 * infl);
  if (uMode > 0.5 && uMode < 1.5) infl *= mix(0.15, 1.0, 0.5 + 0.5 * sin(dist * 1.1 - uTime * 5.0));
  vec2 away = dist > 1e-4 ? d / dist : vec2(0.0);
  // Chỉ bo góc khi ô THẬT SỰ đã co / dạt đi một khoảng; ô chưa nhúc nhích thì
  // vuông, liền khít -> không có lưới kẻ trên ảnh.
  float amt = max(uShrink * infl, (uMode > 1.5 ? 0.9 : 0.5 - 0.5 * (1.0 - uShrink * infl)) * clamp(uPush * infl, 0.0, 1.0));
  float k = smoothstep(0.02, 0.15, amt);
  float extent = 0.5 * (1.0 - uShrink * infl);
  vec2 local = g - (c + 0.5);
  if (uMode > 1.5) local -= away * clamp(uPush * infl, 0.0, 1.0) * 0.9;
  else {
    float room = 0.5 - extent;
    local -= clamp(away * room * uPush * infl, -room, room);
  }
  float radius = uCorners * extent * k;
  // SDF hộp bo góc ĐẦY ĐỦ (âm ở bên trong) — bản rút gọn chỉ có phần ngoài cho
  // bd = 0 ở cả lòng ô khi góc bo = 0 -> độ phủ 0.5, ảnh bị pha nửa màu nền.
  vec2 q = abs(local) - (extent - radius);
  float bd = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
  float aa = max(uGrid.x / max(uRes.x, 1.0), 0.0008);
  float brick = 1.0 - smoothstep(-aa, aa, bd);
  // mảnh ảnh của chính ô này (co lại cùng ô)
  vec2 src = (c + 0.5 + local * (0.5 / max(extent, 0.001))) / uGrid;
  col = texture2D(uTex, clamp(src, 0.0005, 0.9995)).rgb * (1.0 + uGlow * infl);
  return brick;
}

void main() {
  vec2 uv = vUv * (1.0 + 2.0 * uPad) - uPad;
  uv.y = 1.0 - uv.y; // gốc trên-trái như DOM
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  vec2 g = uv * uGrid;
  vec2 cell = floor(g);
  // Cộng độ phủ các ô (mép hai ô liền nhau mỗi bên 0.5 -> đủ 1, không lộ khe);
  // màu = trung bình theo độ phủ.
  vec3 sum = vec3(0.0);
  float cover = 0.0;
  float inflMax = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 nc = cell + vec2(float(i), float(j));
      if (nc.x < 0.0 || nc.y < 0.0 || nc.x > uGrid.x - 1.0 || nc.y > uGrid.y - 1.0) continue;
      vec3 c;
      float f;
      float b = brickAt(g, nc, c, f);
      inflMax = max(inflMax, f);
      sum += c * b;
      cover += b;
    }
  }
  vec3 col = cover > 0.0001 ? sum / cover : vec3(0.0);
  cover = min(cover, 1.0);
  // trong ảnh: khe = màu nền phía sau; ngoài ảnh (phần nới): chỉ ô tràn ra
  vec3 outCol = mix(uGap, col, cover);
  float a = inside > 0.5 ? 1.0 : cover;
  if (inside < 0.5) outCol = col;
  gl_FragColor = vec4(outCol * a, a);
}`

  /* ------------------------------------------------------------ WebGL --- */
  let gl = null
  let canvas = null
  let prog = null
  let tex = null
  const U = {}
  const snap = document.createElement('canvas') // ảnh chụp các lớp của khung
  const sctx = snap.getContext('2d')

  function init() {
    if (gl) return true
    canvas = document.createElement('canvas')
    canvas.className = 'cimgtiles'
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:fixed; left:0; top:0; z-index:60; pointer-events:none; display:none'
    document.body.appendChild(canvas)
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false })
    if (!gl) return false
    const sh = (t, src) => {
      const s = gl.createShader(t)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG))
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    for (const n of ['uTex', 'uRes', 'uPad', 'uGrid', 'uMouse', 'uOn', 'uRadius', 'uShrink', 'uPush', 'uGlow', 'uCorners', 'uMode', 'uTime', 'uGap'])
      U[n] = gl.getUniformLocation(prog, n)
    tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // NEAREST: ảnh chân dung là dither điểm ảnh — lọc tuyến tính làm nhoè.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.uniform1i(U.uTex, 0)
    return true
  }

  /* ----------------------------------------------------------- state ---- */
  let els = []
  let active = null // { el, target:{x,y,on}, m:{x,y,on} }
  let raf = 0
  let lastT = 0

  // Màu nền phía sau ảnh: phần tử cha gần nhất có nền đặc (bỏ qua khung ảnh).
  function bgBehind(el) {
    let p = el.parentElement
    while (p) {
      const m = getComputedStyle(p).backgroundColor.match(/[\d.]+/g)
      if (m && (m.length < 4 || +m[3] > 0.5)) return [m[0] / 255, m[1] / 255, m[2] / 255]
      p = p.parentElement
    }
    return [0.957, 0.953, 0.922]
  }

  // Cỡ ô (px CSS) = ô của mảng xanh hero; không có thì ~1/10 bề rộng ảnh.
  function cellPx(el) {
    const f = document.querySelector('.hero__field--a, [data-field]')
    const tiles = F().tiles || 40
    const w = f?.getBoundingClientRect().width
    return (w ? w / tiles : el.clientWidth / 10) * CONFIG.cellScale
  }

  // Chụp mọi lớp canvas / ảnh đang hiện trong khung thành một ảnh, ở ĐÚNG độ
  // phân giải của lớp canvas đầu (không co giãn -> không nhoè).
  function capture(el, fw, fh) {
    const base = [...el.children].find((c) => c instanceof HTMLCanvasElement && c.width > 0)
    const w = base ? base.width : fw
    const h = base ? base.height : fh
    if (snap.width !== w || snap.height !== h) {
      snap.width = w
      snap.height = h
    }
    sctx.clearRect(0, 0, w, h)
    for (const c of el.children) {
      if (!(c instanceof HTMLCanvasElement || c instanceof HTMLImageElement)) continue
      if (getComputedStyle(c).display === 'none' || getComputedStyle(c).visibility === 'hidden') continue
      try {
        sctx.drawImage(c, 0, 0, w, h)
      } catch (e) {}
    }
  }

  function frame(t) {
    raf = 0
    if (!active) return
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60
    lastT = t
    const f = F()
    const scale = dt * 30
    const ease = 1 - Math.pow(1 - Math.min(f.hoverEase ?? 0.18, 0.999), scale)
    const easeP = 1 - Math.pow(1 - Math.min((f.hoverEase ?? 0.18) * 1.6, 0.999), scale)
    const { m, target, el } = active
    m.x += (target.x - m.x) * easeP
    m.y += (target.y - m.y) * easeP
    m.on += (target.on - m.on) * ease

    const r = el.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    const cell = cellPx(el)
    const pad = Math.ceil(cell) + 2
    const W = Math.round(r.width * dpr)
    const H = Math.round(r.height * dpr)
    const cw = Math.round((r.width + 2 * pad) * dpr)
    const ch = Math.round((r.height + 2 * pad) * dpr)
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw
      canvas.height = ch
    }
    canvas.style.width = `${r.width + 2 * pad}px`
    canvas.style.height = `${r.height + 2 * pad}px`
    canvas.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`
    canvas.style.display = 'block'

    capture(el, W, H)
    gl.viewport(0, 0, cw, ch)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, snap)
    gl.uniform2f(U.uRes, W, H)
    gl.uniform2f(U.uPad, pad / r.width, pad / r.height)
    gl.uniform2f(U.uGrid, Math.max(1, Math.round(r.width / cell)), Math.max(1, Math.round(r.height / cell)))
    gl.uniform2f(U.uMouse, m.x, m.y)
    gl.uniform1f(U.uOn, m.on)
    gl.uniform1f(U.uRadius, f.hoverRadius ?? 6)
    gl.uniform1f(U.uShrink, f.hoverShrink ?? 0.45)
    gl.uniform1f(U.uPush, f.hoverPush ?? 0.9)
    gl.uniform1f(U.uGlow, f.hoverGlow ?? 0)
    gl.uniform1f(U.uCorners, f.corners ?? 0.24)
    gl.uniform1f(U.uMode, { ripple: 1, scatter: 2 }[f.hoverMode] || 0)
    gl.uniform1f(U.uTime, ((performance.now() / 1000) * (f.hoverRipple ?? 1)) % 1000)
    gl.uniform3fv(U.uGap, bgBehind(el))
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Đã rời và ô đã ghép lại hẳn -> tắt lớp phủ, ảnh gốc hiện như cũ.
    if (target.on === 0 && m.on < 0.003) {
      canvas.style.display = 'none'
      active = null
      lastT = 0
      return
    }
    raf = requestAnimationFrame(frame)
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame)
  }

  function onMove(e) {
    if (!CONFIG.enabled || F().hover === false || F().imgTiles === false || e.pointerType !== 'mouse') return
    const el = e.currentTarget
    if (!init()) return
    const r = el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const y = (e.clientY - r.top) / r.height
    if (!active || active.el !== el) {
      // chuyển sang ảnh khác: ảnh cũ ghép lại ngay
      active = { el, target: { x, y, on: 1 }, m: { x, y, on: active?.el === el ? active.m.on : 0 } }
    }
    active.target.x = x
    active.target.y = y
    active.target.on = 1
    kick()
  }
  function onLeave(e) {
    if (active && active.el === e.currentTarget) {
      active.target.on = 0
      kick()
    }
  }

  function mount(root = document) {
    els.forEach((el) => {
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
    })
    els = [...(root.querySelectorAll ? root : document).querySelectorAll(CONFIG.selector)]
    els.forEach((el) => {
      el.addEventListener('pointermove', onMove, { passive: true })
      el.addEventListener('pointerleave', onLeave)
    })
    if (active && !els.includes(active.el)) {
      active = null
      if (canvas) canvas.style.display = 'none'
    }
  }

  api.mount = mount
  api.refresh = () => {
    if (!CONFIG.enabled && active) active.target.on = 0
    kick()
  }

  mount(document)
  if (window.barba?.hooks) window.barba.hooks.beforeEnter((data) => mount(data.next.container))
})()
