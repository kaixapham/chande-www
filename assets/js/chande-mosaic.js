/* =============================================================================
 * CHANDE — Mosaic field (các mảng xanh của hero)
 * -----------------------------------------------------------------------------
 * Port từ Signal Studio (gradient-studio): Field + Ramp + Mosaic, viết lại bằng
 * WebGL1 thuần, không phụ thuộc gì. Mỗi mảng xanh là MỘT FIELD RIÊNG (vị trí
 * gradient, cỡ gạch, hướng sáng… chỉnh theo từng vùng trong CONFIG.fields),
 * nhưng tất cả chạy trên CÙNG MỘT ĐỒNG HỒ nên chuyển động đồng điệu.
 *
 * Đồng bộ với vòng đổi ảnh của hero: khi 4 ảnh bắt đầu đổi
 * ('chande-hero:swap-start') đồng hồ phanh mềm về 0 -> các ô đứng yên; ảnh đổi
 * xong ('chande-hero:swap-end') thì nhả phanh, chạy tiếp từ đúng chỗ đã dừng.
 *
 * Mount vào mọi phần tử khớp CONFIG.selector (mặc định [data-mosaic] và
 * .hero__field). Tên vùng lấy từ data-mosaic="…", không có thì lấy hậu tố
 * class .hero__field--a -> 'a'. Canvas phủ lên trên <img> sẵn có; WebGL không
 * chạy được thì <img> vẫn nằm đó làm dự phòng.
 *
 * Cách vẽ — hai lượt, một WebGL context dùng chung cho mọi vùng:
 *   1. Tiles: field được tính MỘT LẦN cho mỗi viên gạch (tại tâm viên), vẽ ra
 *      texture cỡ cột × hàng — rẻ, vì cả mảng chỉ vài nghìn viên.
 *   2. Bricks: vẽ đủ độ phân giải, mỗi điểm ảnh đọc màu viên của nó rồi dựng
 *      hình viên gạch phồng (bo góc, vát sáng trên-trái, núm giữa).
 *   Kết quả chép sang canvas 2D của từng vùng bằng drawImage.
 *
 * Số đo trong CONFIG là px của bản thiết kế khổ 1920 (giống site.css, --u),
 * nên gạch co giãn cùng thang với cả hero.
 *
 * API: window.CHANDE_MOSAIC = { config, defaults, mount(root), destroy(root),
 *      refresh(), hold(), release(), pause(), play(), state }
 * Sự kiện nghe trên document: 'chande-hero:swap-start' / 'chande-hero:swap-end'
 *                             'chande-mosaic:hold'      / 'chande-mosaic:release'
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    selector: '[data-mosaic], .hero__field',
    designWidth: 1920, // 1 đơn vị = 1px thiết kế = bề rộng .hero / 1920
    unitFrom: '.hero', // đo bề rộng ở đâu để quy đổi; không có thì dùng viewport
    maxDpr: 2,
    // Cỡ viên tối thiểu, px màn hình. Cả hero co theo khổ 1920 nên trên điện
    // thoại viên 12px thiết kế chỉ còn ~2px — mịn thành sạn, mất hình viên gạch.
    minTilePx: 8,

    // ---- Nhịp chung (mọi vùng dùng chung đồng hồ này) ----------------------
    period: 16, // s — một vòng quỹ đạo của field
    octaves: 4, // độ chi tiết của noise (1..6)
    holdOut: 380, // ms — phanh từ đang chạy về đứng yên khi ảnh bắt đầu đổi
    holdIn: 700, // ms — nhả phanh sau khi ảnh đổi xong

    // ---- Dải màu (đo từ ảnh field Figma: đen -> rêu -> lime -> kem) --------
    // pos là vị trí trên dải 0..1, phải tăng dần.
    ramp: [
      { color: '#000200', pos: 0 },
      { color: '#04300e', pos: 0.16 },
      { color: '#006a1a', pos: 0.32 },
      { color: '#2aae04', pos: 0.48 },
      { color: '#4ff10b', pos: 0.62 },
      { color: '#66ff14', pos: 0.74 },
      { color: '#b5f08a', pos: 0.87 },
      { color: '#f0f7dc', pos: 1 },
    ],

    // ---- Hình viên gạch (dùng chung) ---------------------------------------
    brick: {
      gap: 0, // 0..0.4 — khe giữa các viên (theo cỡ viên)
      corners: 0.28, // 0..1 — bo góc; khe tối chỉ lộ ở chỗ 4 góc gặp nhau
      bevel: 0.32, // 0..1 — độ phồng / vát sáng
      stud: 0.42, // 0..1 — cỡ núm giữa (0 = không có)
      seam: 0.12, // 0..1 — độ sáng của khe so với màu viên
    },

    // ---- Từng vùng -----------------------------------------------------------
    // tile      cỡ viên (px thiết kế)
    // scale     cỡ mảng loang (px thiết kế) — lớn = loang to, chậm đổi
    // offsetX/Y dời vị trí trong field — mỗi vùng một chỗ khác nhau
    // tiltAngle hướng SÁNG dần, độ, như CSS: 0 = lên trên, 90 = sang phải
    // tilt      độ mạnh của chuyển sáng -> tối theo hướng trên
    // noise     độ loang lổ
    // warp      độ uốn của mảng loang
    // blocks    pha mảng pixel thô (0..1) — kiểu các khối tối bậc thang
    // blockSize cỡ khối thô, tính bằng số viên
    // level     dời cả vùng sáng lên / tối xuống
    // contrast  độ tương phản của vùng
    // phase     lệch pha (độ) — cùng nhịp nhưng không giống hệt nhau
    fields: {
      // Đã chỉnh cho phân bố màu khớp ảnh field-a/b/c.webp của Figma (đo
      // phân vị 5..95% độ sáng): a lime trên -> rêu dưới, b rêu trên -> kem
      // đáy, c kem góc trên-trái -> tối góc dưới-phải.
      a: { tile: 12.5, scale: 900, offsetX: 0, offsetY: 0, tiltAngle: 0, tilt: 0.55,
        noise: 0.32, warp: 0.7, blocks: 0.35, blockSize: 6, level: 0.07, contrast: 1, phase: 0 },
      b: { tile: 12, scale: 860, offsetX: 7.3, offsetY: 2.1, tiltAngle: 180, tilt: 0.7,
        noise: 0.3, warp: 0.7, blocks: 0.3, blockSize: 6, level: -0.02, contrast: 1, phase: 120 },
      c: { tile: 18, scale: 900, offsetX: 3.7, offsetY: 9.4, tiltAngle: 330, tilt: 0.95,
        noise: 0.3, warp: 0.6, blocks: 0.45, blockSize: 7, level: -0.05, contrast: 1.05, phase: 240 },
    },
    // Vùng có tên lạ (data-mosaic="x") mà chưa khai báo thì lấy bộ này.
    fallback: 'a',
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('mosaic', CONFIG)

  const DEFAULTS = structuredClone(CONFIG)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const MAX_STOPS = 8

  /* ------------------------------------------------------------- Shaders -- */
  const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`

  // Lượt 1 — một điểm ảnh = một viên gạch. gl_FragCoord.y ở đây được hiểu là
  // HÀNG tính từ trên xuống (không lật), lượt 2 đọc lại đúng quy ước đó.
  const TILES = `
precision highp float;
uniform vec2 uSize;      // cỡ vùng, px thiết kế
uniform float uTile;     // cỡ viên, px thiết kế
uniform float uTime;     // góc quỹ đạo (rad), đồng hồ chung
uniform float uPhase;
uniform float uScale;
uniform vec2 uOffset;
uniform vec2 uTilt;      // hướng sáng * độ mạnh, toạ độ y hướng xuống
uniform float uNoise;
uniform float uWarp;
uniform float uBlocks;
uniform float uBlockSize;
uniform float uLevel;
uniform float uContrast;
uniform float uOctaves;
uniform vec3 uStops[${MAX_STOPS}];
uniform float uPos[${MAX_STOPS}];
uniform int uCount;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0, amp = 0.5, norm = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uOctaves) break;
    sum += amp * vnoise(p);
    norm += amp;
    p = mat2(0.8047, 0.5937, -0.5937, 0.8047) * p * 2.02;
    amp *= 0.5;
  }
  return sum / norm;
}

// Giá trị field (chưa qua level / contrast) tại một điểm của vùng.
float fieldAt(vec2 at) {
  vec2 uv = at / uSize - 0.5;
  float ramp = dot(uv, uTilt);
  float t = uTime + uPhase;
  vec2 p = at / uScale + uOffset;
  // Điểm lấy mẫu đi vòng tròn trong không gian noise: hết một vòng là về
  // đúng chỗ cũ, nên chuyển động trôi mãi mà không giật.
  vec2 orbit = vec2(cos(t), sin(t)) * 0.9;
  vec2 w = vec2(fbm(p + orbit), fbm(p - orbit.yx + vec2(5.2, 1.3)));
  float n = fbm(p + (w - 0.5) * uWarp * 3.0);
  return 0.5 + ramp + (n - 0.5) * uNoise * 2.0;
}

vec3 rampColor(float t) {
  vec3 c = uStops[0];
  for (int i = 1; i < ${MAX_STOPS}; i++) {
    if (i >= uCount) break;
    float a = uPos[i - 1];
    float b = uPos[i];
    c = mix(c, uStops[i], clamp((t - a) / max(b - a, 0.0001), 0.0, 1.0));
  }
  return c;
}

void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  float f = fieldAt((cell + 0.5) * uTile);
  if (uBlocks > 0.0) {
    // Khối thô: cả cụm blockSize × blockSize viên lấy chung một giá trị, trộn
    // vào để có các mảng vuông bậc thang như bản Figma.
    vec2 block = floor(cell / uBlockSize);
    float fb = fieldAt((block + 0.5) * uBlockSize * uTile);
    f = mix(f, fb, uBlocks);
  }
  f = (f - 0.5) * uContrast + 0.5 + uLevel;
  gl_FragColor = vec4(rampColor(clamp(f, 0.0, 1.0)), 1.0);
}
`

  // Lượt 2 — dựng viên gạch ở độ phân giải thật.
  const BRICKS = `
precision highp float;
uniform sampler2D uTiles;
uniform vec2 uTexSize;
uniform vec2 uGrid;
uniform vec2 uBacking;   // cỡ canvas, điểm ảnh thật
uniform float uPx;       // điểm ảnh thật trên 1px thiết kế
uniform float uTile;
uniform float uGap;
uniform float uCorners;
uniform float uBevel;
uniform float uStud;
uniform float uSeam;

void main() {
  vec2 at = vec2(gl_FragCoord.x, uBacking.y - gl_FragCoord.y) / uPx;
  vec2 g = at / uTile;
  vec2 cell = clamp(floor(g), vec2(0.0), uGrid - 1.0);
  vec2 local = fract(g) - 0.5;
  vec3 tint = texture2D(uTiles, (cell + 0.5) / uTexSize).rgb;

  float ext = 0.5 - uGap * 0.5;
  float r = uCorners * ext;
  vec2 q = max(abs(local) - (ext - r), 0.0);
  float dist = length(q) - r;
  float aa = 0.75 / max(uTile * uPx, 1.0);
  float body = 1.0 - smoothstep(-aa, aa, dist);

  // Một nguồn sáng cố định từ trên-trái cho mọi viên.
  vec2 key = normalize(vec2(-1.0, -1.0));
  vec2 s = local / max(ext, 0.001);
  float edge = smoothstep(0.3, 1.0, max(abs(s.x), abs(s.y)));
  float relief = dot(s, key) * edge;
  float rim = smoothstep(-0.1, 0.0, dist);
  vec3 lit = tint * (1.0 + uBevel * relief) * (1.0 - 0.4 * uBevel * rim);

  if (uStud > 0.0) {
    // Núm giữa: một vòng mờ, tối phía trên-trái, sáng phía dưới-phải.
    float sr = uStud * ext * 0.42;
    float ring = 1.0 - smoothstep(0.0, aa * 2.0 + 0.05, abs(length(local) - sr));
    float side = dot(normalize(local + 1e-5), key);
    lit *= 1.0 - uBevel * 0.45 * ring * side;
  }

  gl_FragColor = vec4(mix(tint * uSeam, clamp(lit, 0.0, 1.0), body), 1.0);
}
`

  /* -------------------------------------------------------------- WebGL --- */
  let G = null // { gl, canvas, progA, progB, tex, fbo, texW, texH }

  function compile(gl, type, src) {
    const s = gl.createShader(type)
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
    return s
  }

  function program(gl, frag) {
    const p = gl.createProgram()
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, VERT))
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, frag))
    gl.bindAttribLocation(p, 0, 'aPos')
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p))
    const loc = {}
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS)
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name.replace(/\[0\]$/, '')
      loc[name] = gl.getUniformLocation(p, name)
    }
    return { p, loc }
  }

  function initGL() {
    if (G) return G
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const gl = canvas.getContext('webgl', {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: true,
    })
    if (!gl) return null
    try {
      const progA = program(gl, TILES)
      const progB = program(gl, BRICKS)
      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      const tex = gl.createTexture()
      const fbo = gl.createFramebuffer()
      G = { gl, canvas, progA, progB, tex, fbo, texW: 0, texH: 0 }
    } catch (e) {
      console.warn('[chande-mosaic] shader lỗi, giữ ảnh tĩnh:', e)
      return null
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      G = null
      cells.forEach((c) => (c.canvas.style.visibility = 'hidden'))
    })
    canvas.addEventListener('webglcontextrestored', () => {
      if (initGL()) cells.forEach((c) => (c.canvas.style.visibility = ''))
      dirty = true
    })
    return G
  }

  function ensureTex(w, h) {
    const { gl } = G
    if (w <= G.texW && h <= G.texH) return
    G.texW = Math.max(w, G.texW)
    G.texH = Math.max(h, G.texH)
    gl.bindTexture(gl.TEXTURE_2D, G.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, G.texW, G.texH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, G.tex, 0)
  }

  // Canvas WebGL chỉ nới ra, không co lại: đổi cỡ canvas mỗi frame rất đắt.
  function ensureCanvas(w, h) {
    const c = G.canvas
    if (w > c.width || h > c.height) {
      c.width = Math.max(w, c.width)
      c.height = Math.max(h, c.height)
    }
  }

  const hex = (h) => {
    const m = String(h).replace('#', '')
    const v = m.length === 3 ? m.split('').map((x) => x + x).join('') : m.padEnd(6, '0')
    return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
  }

  let rampCache = { key: '', colors: null, pos: null, count: 0 }
  function rampUniforms() {
    const key = JSON.stringify(CONFIG.ramp)
    if (rampCache.key === key) return rampCache
    const stops = CONFIG.ramp.slice(0, MAX_STOPS)
    const colors = new Float32Array(MAX_STOPS * 3)
    const pos = new Float32Array(MAX_STOPS)
    stops.forEach((s, i) => {
      colors.set(hex(s.color), i * 3)
      pos[i] = +s.pos
    })
    rampCache = { key, colors, pos, count: stops.length }
    return rampCache
  }

  function render(cell) {
    const { gl, progA, progB } = G
    const m = cell.m
    const f = settingsFor(cell.key)
    ensureTex(m.cols, m.rows)
    ensureCanvas(m.bw, m.bh)

    // Lượt 1 — màu từng viên.
    gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo)
    gl.viewport(0, 0, m.cols, m.rows)
    gl.useProgram(progA.p)
    const a = progA.loc
    const ramp = rampUniforms()
    const tiltRad = (f.tiltAngle * Math.PI) / 180
    gl.uniform2f(a.uSize, m.w, m.h)
    gl.uniform1f(a.uTile, m.tile)
    gl.uniform1f(a.uTime, clock.angle)
    gl.uniform1f(a.uPhase, (f.phase * Math.PI) / 180)
    gl.uniform1f(a.uScale, Math.max(1, f.scale))
    gl.uniform2f(a.uOffset, f.offsetX, f.offsetY)
    // Hướng như CSS gradient: 0° = lên trên. Toạ độ y của field hướng xuống.
    gl.uniform2f(a.uTilt, Math.sin(tiltRad) * f.tilt, -Math.cos(tiltRad) * f.tilt)
    gl.uniform1f(a.uNoise, f.noise)
    gl.uniform1f(a.uWarp, f.warp)
    gl.uniform1f(a.uBlocks, f.blocks)
    gl.uniform1f(a.uBlockSize, Math.max(1, Math.round(f.blockSize)))
    gl.uniform1f(a.uLevel, f.level)
    gl.uniform1f(a.uContrast, f.contrast)
    gl.uniform1f(a.uOctaves, CONFIG.octaves)
    gl.uniform3fv(a.uStops, ramp.colors)
    gl.uniform1fv(a.uPos, ramp.pos)
    gl.uniform1i(a.uCount, ramp.count)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Lượt 2 — dựng viên gạch.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, m.bw, m.bh)
    gl.useProgram(progB.p)
    const b = progB.loc
    const k = CONFIG.brick
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, G.tex)
    gl.uniform1i(b.uTiles, 0)
    gl.uniform2f(b.uTexSize, G.texW, G.texH)
    gl.uniform2f(b.uGrid, m.cols, m.rows)
    gl.uniform2f(b.uBacking, m.bw, m.bh)
    gl.uniform1f(b.uPx, m.px)
    gl.uniform1f(b.uTile, m.tile)
    gl.uniform1f(b.uGap, k.gap)
    gl.uniform1f(b.uCorners, k.corners)
    gl.uniform1f(b.uBevel, k.bevel)
    gl.uniform1f(b.uStud, k.stud)
    gl.uniform1f(b.uSeam, k.seam)
    gl.drawArrays(gl.TRIANGLES, 0, 3)

    // Nội dung nằm ở góc DƯỚI-trái của canvas WebGL (gốc toạ độ GL ở dưới).
    cell.ctx.drawImage(G.canvas, 0, G.canvas.height - m.bh, m.bw, m.bh, 0, 0, m.bw, m.bh)
    if (!cell.shown) {
      cell.shown = true
      cell.canvas.style.opacity = '1'
    }
  }

  /* -------------------------------------------------------------- Vùng ---- */
  const cells = new Set()
  let dirty = true

  function settingsFor(key) {
    return CONFIG.fields[key] || CONFIG.fields[CONFIG.fallback] || Object.values(CONFIG.fields)[0]
  }

  function keyOf(el) {
    if (el.dataset.mosaic) return el.dataset.mosaic
    const m = [...el.classList].map((c) => c.match(/--([\w-]+)$/)).find(Boolean)
    return m ? m[1] : CONFIG.fallback
  }

  function measure(cell) {
    const el = cell.el
    const cw = el.clientWidth
    const ch = el.clientHeight
    if (!cw || !ch) return (cell.m = null)
    const host = el.closest(CONFIG.unitFrom)
    const unit = (host?.clientWidth || document.documentElement.clientWidth) / CONFIG.designWidth
    const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDpr)
    const bw = Math.max(1, Math.round(cw * dpr))
    const bh = Math.max(1, Math.round(ch * dpr))
    const w = cw / unit
    const h = ch / unit
    const tile = Math.max(2, settingsFor(cell.key).tile, CONFIG.minTilePx / unit)
    cell.m = { bw, bh, w, h, tile, px: bw / w, cols: Math.ceil(w / tile), rows: Math.ceil(h / tile) }
    if (cell.canvas.width !== bw || cell.canvas.height !== bh) {
      cell.canvas.width = bw
      cell.canvas.height = bh
    }
  }

  function mount(root = document) {
    if (!CONFIG.enabled || !initGL()) return
    const found = root.matches?.(CONFIG.selector) ? [root] : [...root.querySelectorAll(CONFIG.selector)]
    for (const el of found) {
      if ([...cells].some((c) => c.el === el)) continue
      const canvas = document.createElement('canvas')
      canvas.setAttribute('aria-hidden', 'true')
      // Ẩn tới khi có frame đầu, để <img> bên dưới không bị một khung đen che.
      canvas.style.cssText =
        'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;pointer-events:none'
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative'
      el.appendChild(canvas)
      const cell = { el, canvas, ctx: canvas.getContext('2d'), key: keyOf(el), m: null, visible: true, shown: false }
      cell.ro = new ResizeObserver(() => {
        measure(cell)
        dirty = true
      })
      cell.ro.observe(el)
      io?.observe(el)
      measure(cell)
      cells.add(cell)
    }
    dirty = true
    start()
  }

  function destroy(root) {
    for (const cell of [...cells]) {
      if (root && !root.contains(cell.el)) continue
      cell.ro.disconnect()
      io?.unobserve(cell.el)
      cell.canvas.remove()
      cells.delete(cell)
    }
  }

  // Vùng nằm ngoài màn thì khỏi vẽ.
  const io =
    'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          for (const e of entries) {
            const cell = [...cells].find((c) => c.el === e.target)
            if (cell) cell.visible = e.isIntersecting
          }
          dirty = true
        })
      : null

  /* ------------------------------------------------- Đồng hồ chung -------- */
  // `run` đi 0..1: 1 = chạy đủ tốc độ, 0 = đứng yên. Đi tuyến tính theo
  // holdOut / holdIn rồi qua smoothstep, nên phanh và nhả đều mềm.
  const clock = { angle: 0, run: 1, holds: 0, paused: false }

  function hold() {
    clock.holds++
  }
  function release() {
    clock.holds = Math.max(0, clock.holds - 1)
  }

  let raf = 0
  let last = 0
  function start() {
    if (!raf) {
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (document.hidden || !G) return

    const want = clock.holds > 0 || clock.paused || reduced.matches ? 0 : 1
    if (clock.run !== want) {
      const span = (want ? CONFIG.holdIn : CONFIG.holdOut) / 1000
      const step = span > 0 ? dt / span : 1
      clock.run = want ? Math.min(1, clock.run + step) : Math.max(0, clock.run - step)
    }
    const speed = clock.run * clock.run * (3 - 2 * clock.run)
    const moving = speed > 0
    if (moving) clock.angle = (clock.angle + (dt * speed * Math.PI * 2) / Math.max(0.5, CONFIG.period)) % (Math.PI * 2)
    if (!moving && !dirty) return

    for (const cell of cells) if (cell.visible && cell.m) render(cell)
    dirty = false
  }

  /* --------------------------------------------------------- Khởi động ---- */
  document.addEventListener('chande-hero:swap-start', hold)
  document.addEventListener('chande-hero:swap-end', release)
  document.addEventListener('chande-mosaic:hold', hold)
  document.addEventListener('chande-mosaic:release', release)
  reduced.addEventListener?.('change', () => (dirty = true))

  if (window.barba?.hooks) {
    // Cùng nhịp với chande-hero.js: mount trang mới ở beforeEnter, chỉ gỡ các
    // vùng thuộc container cũ ở afterLeave.
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => data.current.container && destroy(data.current.container))
  }

  if (document.body) mount(document)
  else document.addEventListener('DOMContentLoaded', () => mount(document), { once: true })

  window.CHANDE_MOSAIC = {
    config: CONFIG,
    defaults: DEFAULTS,
    state: clock,
    mount,
    destroy,
    hold,
    release,
    pause() { clock.paused = true },
    play() { clock.paused = false },
    // Sau khi sửa `config` lúc đang chạy (bảng setting gọi hàm này).
    refresh() {
      cells.forEach((c) => {
        c.key = keyOf(c.el)
        measure(c)
      })
      dirty = true
      if (CONFIG.enabled) start()
    },
  }
})()
