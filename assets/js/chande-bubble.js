/* =============================================================================
 * CHANDE — Bubble: giọt thuỷ tinh bám theo chuột trên toàn trang
 * -----------------------------------------------------------------------------
 * Port từ Canvas UI "Bubble" (src/lib/Bubble/BubbleVanilla.ts).
 *   © 2026 David Haz — https://github.com/DavidHDev/canvas-ui
 *   Giấy phép MIT + Commons Clause v1.0: được dùng, sửa, phát hành như MỘT PHẦN
 *   của website / ứng dụng; KHÔNG được bán, cấp phép lại hay phân phối lại riêng
 *   component (kể cả bản port). Giữ nguyên ghi chú bản quyền này.
 *
 * Shader (ray-march metaball: đầu giọt + vệt đuôi tối đa 24 cầu hoà vào nhau)
 * chép nguyên văn. Khác bản gốc:
 *   • Không dùng html-in-canvas (API thử nghiệm — chính trang canvasui.dev trên
 *     Chrome thường cũng không có) nên shader chạy nhánh dự phòng: lớp màng có
 *     viền, óng ánh, phản quang.
 *   • KHÚC XẠ THẬT thay bằng một "thấu kính" CSS đi theo đầu giọt:
 *     backdrop-filter: url(#lọc SVG) với feDisplacementMap (bản đồ dịch chuyển
 *     hình cầu vẽ bằng canvas) + tách 3 kênh R/G/B lệch nhau (dispersion). Chrome
 *     / Edge có; Safari / Firefox chưa hỗ trợ backdrop-filter url() -> chỉ còn
 *     lớp màng. Chỉ đầu giọt khúc xạ, vệt đuôi vẫn là màng.
 *   • Một canvas cố định phủ cả màn (pointer-events: none), nghe chuột trên toàn
 *     window thay vì một phần tử.
 *   • Màu nhận mã hex để bảng setting chỉnh được.
 *   • Độ dính (blend) quy theo px thật — xem render(): không có thì giọt phình to
 *     theo kích thước màn hình.
 * Hiệu năng:
 *   • Chỉ vẽ (và chỉ xoá) trong vùng scissor quanh giọt.
 *   • Shader bỏ sớm mọi điểm ảnh chắc chắn nằm ngoài giọt (cận dưới của
 *     smoothMin) trước khi ray-march — vùng scissor phần lớn là khoảng trống.
 *   • Pháp tuyến 4 mẫu (tứ diện) thay vì 6.
 *   • Độ phân giải canvas giới hạn ở maxDpr.
 *   • Chuột đứng yên và vệt đuôi đã gom hết vào đầu -> DỪNG rAF (màng đứng hình,
 *     thấu kính không phải tính lại backdrop). Chuột rời cửa sổ: giọt tan rồi dừng.
 * Chỉ bật với chuột thật và khi không reduced-motion.
 *
 * API: window.CHANDE_BUBBLE = { config, defaults, refresh(), state }
 *   state: { x, y, size, swell, count, presence, moving, trailX, trailY } — để
 *   con trỏ nhân vật (chande-cursor.js) né giọt.
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    size: 30, // bán kính giọt khi gom lại (px)
    trail: 24, // số cầu ở vệt đuôi (1–24)
    follow: 0.5, // tốc độ bám chuột (0–1)
    blend: 14, // độ dính khi các cầu hoà vào nhau
    speed: 2, // tốc độ ánh óng ánh
    shine: 0.25, // điểm phản quang
    rim: 0.5, // viền (0–2)
    iridescence: 1, // độ óng ánh
    intensity: 0.9,
    tint: '#ffffff',
    tintStrength: 0,
    colorA: '#4a74b8',
    colorB: '#69696a',
    fallbackOpacity: 1,
    // Thấu kính khúc xạ (CSS backdrop-filter + SVG). Shader gốc cũng nhận hai số
    // này nhưng chỉ dùng ở nhánh html-in-canvas.
    refract: true,
    refraction: 80, // độ bẻ cong (px dịch tối đa ở mép thấu kính = refraction / 2)
    dispersion: 1, // tách màu R/G/B ở mép (0–3)
    lensScale: 1, // thấu kính to / nhỏ hơn giọt
    frost: 0,
    maxDpr: 1.5, // giới hạn độ phân giải canvas — màng mỏng, 1.5 đã đủ nét
  }
  const DEFAULTS = structuredClone(CONFIG)
  const MAX_TRAIL = 24

  const fine = matchMedia('(pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {} }
  window.CHANDE_BUBBLE = api
  if (!fine.matches || reduced.matches) return

  const rgb = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }

  /* --------------------------------------------- Shader (nguyên văn gốc) --- */
  const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

  const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uDpr;
uniform float uTime;
uniform float uHasContent;
uniform int uCount;
uniform vec2 uTrail[${MAX_TRAIL}];
uniform float uBaseRadius;
uniform float uBlend;
uniform float uRefraction;
uniform float uDispersion;
uniform float uFrost;
uniform float uShine;
uniform float uRim;
uniform float uIridescence;
uniform float uIntensity;
uniform vec3 uTint;
uniform float uTintStrength;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFallbackAlpha;

const float EPS = 1e-4;
const int ITR = 16;

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

float rnd3D (vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

float noise3D (vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);

  float a000 = rnd3D(i);
  float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));
  float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));
  float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));
  float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));
  float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));
  float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));
  float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));

  vec3 u = f * f * (3.0 - 2.0 * f);

  float k0 = a000;
  float k1 = a100 - a000;
  float k2 = a010 - a000;
  float k3 = a001 - a000;
  float k4 = a000 - a100 - a010 + a110;
  float k5 = a000 - a010 - a001 + a011;
  float k6 = a000 - a100 - a001 + a101;
  float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;

  return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y +
    k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
}

float smoothMin (float d1, float d2, float k) {
  float h = exp(-k * d1) + exp(-k * d2);
  return -log(max(h, 1e-12)) / k;
}

float map (vec3 p) {
  float radius = uBaseRadius * float(uCount);
  float d = 1e5;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uCount) break;
    float sphere = length(p - vec3(uTrail[i], 0.0)) -
      (radius - uBaseRadius * float(i));
    d = smoothMin(d, sphere, uBlend);
  }
  return d;
}

// Pháp tuyến 4 mẫu (tứ diện) — gốc dùng 6 mẫu sai phân trung tâm.
vec3 generateNormal (vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  return normalize(
    k.xyy * map(p + k.xyy * EPS) +
    k.yyx * map(p + k.yyx * EPS) +
    k.yxy * map(p + k.yxy * EPS) +
    k.xxx * map(p + k.xxx * EPS));
}

// Cận dưới của map() trên cả tia: khoảng cách 2D tới cầu gần nhất trừ phần
// smoothMin có thể kéo xuống (ln(n + 1) / blend). Lớn hơn ngưỡng phủ -> chắc
// chắn trong suốt, khỏi ray-march.
float lowerBound (vec2 p) {
  float radius = uBaseRadius * float(uCount);
  float d = 1e5;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uCount) break;
    d = min(d, length(p - uTrail[i]) - (radius - uBaseRadius * float(i)));
  }
  return d - log(float(uCount) + 1.0) / uBlend;
}

vec3 dropletColor (vec3 normal, vec3 rayDir) {
  vec3 reflectDir = reflect(rayDir, normal);
  float noisePosTime = noise3D(reflectDir * 2.0 + uTime);
  float noiseNegTime = noise3D(reflectDir * 2.0 - uTime);
  vec3 color0 = uColorA * noisePosTime;
  vec3 color1 = uColorB * noiseNegTime;
  return (color0 + color1) * uIntensity;
}

void main () {
  vec2 frag = gl_FragCoord.xy;
  float minRes = min(uResolution.x, uResolution.y);
  vec2 p = (frag * 2.0 - uResolution) / minRes;
  if (lowerBound(p) > 3.0 / minRes) {
    outColor = vec4(0.0);
    return;
  }

  vec3 ray = vec3(p, 1.0);
  vec3 rayDir = vec3(0.0, 0.0, -1.0);
  float dist = 0.0;

  for (int i = 0; i < ITR; ++i) {
    dist = map(ray);
    ray += rayDir * dist;
    if (dist < EPS || dist > 8.0) break;
  }

  float cov = 1.0 - smoothstep(0.0, 3.0 / minRes, dist);
  if (!(cov > 0.001)) {
    outColor = vec4(0.0);
    return;
  }

  vec3 n = generateNormal(ray);
  vec3 glints = pow(max(dropletColor(n, rayDir), 0.0), vec3(7.0));
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);

  vec3 color;
  float alpha = cov;
  if (uHasContent > 0.5) {
    float depth = uRefraction * uDpr;
    float ca = uDispersion * 0.03;
    vec3 rvR = refract(rayDir, n, 1.0 / (1.33 - ca));
    vec3 rvG = refract(rayDir, n, 1.0 / 1.33);
    vec3 rvB = refract(rayDir, n, 1.0 / (1.33 + ca));
    vec2 offR = rvR.xy * (depth / max(abs(rvR.z), 0.35));
    vec2 offG = rvG.xy * (depth / max(abs(rvG.z), 0.35));
    vec2 offB = rvB.xy * (depth / max(abs(rvB.z), 0.35));
    float lod = max(uFrost * 5.0, log2(1.0 + length(offG) * 0.05 / uDpr));
    vec3 refr = vec3(
      page(frag + offR, lod).r,
      page(frag + offG, lod).g,
      page(frag + offB, lod).b);
    refr *= mix(vec3(1.0), uTint, clamp(uTintStrength, 0.0, 1.0));
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
    refr *= 1.0 - 0.35 * uRim * edge;
    color = pow(max(refr, 0.0), vec3(1.0 / 2.2));
    color += glints * uIridescence;
    color += vec3(spec * uShine * 0.9);
  } else {
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
    vec3 filmTint = mix(vec3(0.9), uTint, clamp(uTintStrength, 0.0, 1.0));
    float fade = cov * clamp(uFallbackAlpha, 0.0, 1.0);
    vec3 light = glints * uIridescence * 0.65 + vec3(spec * uShine * 1.5) +
      filmTint * (0.55 * max(uRim, 0.4) * edge + 0.03);
    float a = fade * clamp(0.08 + 0.4 * edge, 0.0, 1.0);
    outColor = vec4(light * fade, a);
    return;
  }
  outColor = vec4(color * alpha, alpha);
}`;

  /* -------------------------------------------------------------- Canvas --- */
  const output = document.createElement('canvas')
  output.className = 'cbubble'
  output.setAttribute('aria-hidden', 'true')
  const style = document.createElement('style')
  style.textContent =
    // Thứ tự lớp: header 9998 < thấu kính 9999 < màng giọt 10000 < nhân vật con
    // trỏ 10001 < bảng setting 10002. Thấu kính PHẢI dưới màng (không thì nó bẻ
    // cong luôn lớp màng) và cả hai PHẢI dưới nhân vật (không thì che mất nó).
    '.cbubble{position:fixed; inset:0; width:100vw; height:100vh; z-index:10000; pointer-events:none}' +
    '.cbubble-lens{position:fixed; left:0; top:0; z-index:9999; border-radius:50%; pointer-events:none;' +
    ' backdrop-filter:url(#cbubble-lens); visibility:hidden; will-change:transform}'
  document.head.appendChild(style)
  document.body.appendChild(output)

  /* --------------------------------------------- Thấu kính khúc xạ (CSS) --- */
  const lensOK = CSS.supports('backdrop-filter', 'url(#a)')
  const SVGNS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(SVGNS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute; width:0; height:0; overflow:hidden'
  svg.innerHTML = `<filter id="cbubble-lens" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage result="map" x="0" y="0" preserveAspectRatio="none"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="src"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>
  </filter>`
  document.body.appendChild(svg)
  const lens = document.createElement('div')
  lens.className = 'cbubble-lens'
  lens.setAttribute('aria-hidden', 'true')
  document.body.appendChild(lens)
  const feImage = svg.querySelector('feImage')
  const maps = svg.querySelectorAll('feDisplacementMap')
  const blur = svg.querySelector('feGaussianBlur')
  let lensR = 0
  let lensKey = ''

  // Bản đồ dịch chuyển hình cầu: R/G = 0.5 + d/2, d = -(x, y)·(1 - √(1 - r²)) —
  // tâm không lệch, càng ra mép càng lấy mẫu từ phía trong (như tia đi qua giọt
  // nước bị bẻ vào). Ngoài hình tròn giữ 0.5 (không dịch).
  function buildLens() {
    const c = Math.min(Math.max(Math.round(CONFIG.trail), 1), MAX_TRAIL)
    // bán kính giọt khi gom lại ≈ size + phần phình do các cầu hoà vào nhau
    const R = Math.max(8, (CONFIG.size + (60 * Math.log(c + 1)) / Math.max(CONFIG.blend, 0.5)) * CONFIG.lensScale)
    const key = `${R.toFixed(1)}|${CONFIG.refraction}|${CONFIG.dispersion}|${CONFIG.frost}`
    if (key === lensKey) return
    lensKey = key
    lensR = R
    const S = 128
    const cv = document.createElement('canvas')
    cv.width = cv.height = S
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(S, S)
    for (let j = 0; j < S; j++)
      for (let i = 0; i < S; i++) {
        const x = ((i + 0.5) / S) * 2 - 1
        const y = ((j + 0.5) / S) * 2 - 1
        const r2 = x * x + y * y
        let dx = 0
        let dy = 0
        if (r2 < 1) {
          const k = 1 - Math.sqrt(1 - r2)
          dx = -x * k
          dy = -y * k
        }
        const o = (j * S + i) * 4
        img.data[o] = Math.round(127.5 + 127.5 * dx)
        img.data[o + 1] = Math.round(127.5 + 127.5 * dy)
        img.data[o + 2] = 128
        img.data[o + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    const D = Math.round(R * 2)
    feImage.setAttribute('href', cv.toDataURL())
    feImage.setAttribute('width', D)
    feImage.setAttribute('height', D)
    const ca = Math.max(CONFIG.dispersion, 0) * 0.08
    const sc = CONFIG.refraction
    maps[0].setAttribute('scale', sc * (1 + ca))
    maps[1].setAttribute('scale', sc)
    maps[2].setAttribute('scale', sc * (1 - ca))
    // frost 0..1 như bản gốc (gốc: mipmap LOD tới 5) -> mờ tới ~10px
    blur.setAttribute('stdDeviation', Math.min(Math.max(CONFIG.frost, 0), 1) * 10)
    lens.style.width = lens.style.height = `${D}px`
  }

  const gl = output.getContext('webgl2', { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true })
  if (!gl) {
    output.remove()
    return
  }

  function compile(type, text) {
    const s = gl.createShader(type)
    gl.shaderSource(s, text)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error('[chande-bubble] shader:', gl.getShaderInfoLog(s))
    return s
  }
  const program = gl.createProgram()
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG))
  gl.linkProgram(program)
  const U = {}
  const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(program, i)
    U[info.name] = gl.getUniformLocation(program, info.name)
  }
  const quad = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, quad)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  gl.enableVertexAttribArray(0)
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  // texture rỗng 1×1 cho uContent (nhánh dự phòng không đọc tới)
  const tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]))

  function sync() {
    const dpr = Math.min(devicePixelRatio || 1, Math.max(CONFIG.maxDpr, 0.5))
    const w = Math.max(1, Math.round(innerWidth * dpr))
    const h = Math.max(1, Math.round(innerHeight * dpr))
    if (output.width !== w || output.height !== h) {
      output.width = w
      output.height = h
    }
  }
  sync()

  const trailX = new Float32Array(MAX_TRAIL)
  const trailY = new Float32Array(MAX_TRAIL)
  const trailData = new Float32Array(MAX_TRAIL * 2)
  let headX = innerWidth / 2
  let headY = innerHeight / 2
  let targetX = headX
  let targetY = headY
  let presence = 0
  let presenceTarget = 0
  let hasPointer = false
  let time = 0

  const count = () => Math.min(Math.max(Math.round(CONFIG.trail), 1), MAX_TRAIL)

  // Trạng thái giọt cho chande-cursor.js (đơn vị px CSS). Cầu thứ i (0 = đầu) có
  // bán kính ≈ (size × (count − i) / count + swell) × presence.
  const state = { x: headX, y: headY, size: 0, swell: 0, count: 1, presence: 0, moving: false, trailX, trailY }
  api.state = state

  // Vùng đã vẽ ở khung trước — chỉ cần xoá chỗ đó chứ không xoá cả màn.
  let drawn = null
  function clearRect(r) {
    if (!r) return
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(r[0], r[1], r[2], r[3])
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }

  function render() {
    const dpr = output.width / Math.max(innerWidth, 1)
    gl.viewport(0, 0, output.width, output.height)
    clearRect(drawn)
    drawn = null
    if (presence <= 0.004 || !CONFIG.enabled) {
      gl.disable(gl.SCISSOR_TEST)
      return
    }

    const c = count()
    const minRes = Math.min(output.width, output.height)
    const headRadius = Math.max(CONFIG.size, 4) * dpr * presence
    const baseRadius = (headRadius * 2) / (minRes * c)
    // Độ dính quy theo PX THẬT: shader tính trong toạ độ chuẩn hoá theo cạnh ngắn
    // của canvas, nên 24 cầu chồng lên nhau phình thêm ln(24)/blend × (cạnh/2).
    // Bản gốc chạy trong khung demo nhỏ; phủ cả màn 1080p thì giọt phình ~4 lần.
    // Nhân theo cạnh canvas / (dpr × 200) để giọt giữ cùng cỡ ở mọi màn hình.
    const blend = Math.max(CONFIG.blend, 0.5) * (minRes / (dpr * 200))
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let i = 0; i < c; i++) {
      const dx = trailX[i] * dpr
      const dy = output.height - trailY[i] * dpr
      trailData[i * 2] = (dx * 2 - output.width) / minRes
      trailData[i * 2 + 1] = (dy * 2 - output.height) / minRes
      minX = Math.min(minX, dx); maxX = Math.max(maxX, dx)
      minY = Math.min(minY, dy); maxY = Math.max(maxY, dy)
    }
    const pad = headRadius + ((Math.log(c + 1) / blend) * minRes) / 2 + Math.abs(CONFIG.refraction) * dpr * 0.5 + 32 * dpr
    const sx = Math.max(0, Math.floor(minX - pad))
    const sy = Math.max(0, Math.floor(minY - pad))
    drawn = [sx, sy, Math.max(0, Math.min(output.width - sx, Math.ceil(maxX - minX + pad * 2))), Math.max(0, Math.min(output.height - sy, Math.ceil(maxY - minY + pad * 2)))]
    clearRect(drawn)

    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.uniform1i(U.uContent, 0)
    gl.uniform2f(U.uResolution, output.width, output.height)
    gl.uniform1f(U.uMaxX, 1)
    gl.uniform1f(U.uDpr, dpr)
    gl.uniform1f(U.uTime, time)
    gl.uniform1f(U.uHasContent, 0)
    gl.uniform1i(U.uCount, c)
    gl.uniform2fv(U['uTrail[0]'], trailData)
    gl.uniform1f(U.uBaseRadius, baseRadius)
    gl.uniform1f(U.uBlend, blend)
    gl.uniform1f(U.uRefraction, CONFIG.refraction)
    gl.uniform1f(U.uDispersion, Math.max(CONFIG.dispersion, 0))
    gl.uniform1f(U.uFrost, Math.min(Math.max(CONFIG.frost, 0), 1))
    gl.uniform1f(U.uShine, Math.max(CONFIG.shine, 0))
    gl.uniform1f(U.uRim, Math.min(Math.max(CONFIG.rim, 0), 2))
    gl.uniform1f(U.uIridescence, Math.max(CONFIG.iridescence, 0))
    gl.uniform1f(U.uIntensity, Math.max(CONFIG.intensity, 0))
    gl.uniform3f(U.uTint, ...rgb(CONFIG.tint))
    gl.uniform1f(U.uTintStrength, Math.min(Math.max(CONFIG.tintStrength, 0), 1))
    gl.uniform3f(U.uColorA, ...rgb(CONFIG.colorA))
    gl.uniform3f(U.uColorB, ...rgb(CONFIG.colorB))
    gl.uniform1f(U.uFallbackAlpha, Math.min(Math.max(CONFIG.fallbackOpacity, 0), 1))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.disable(gl.SCISSOR_TEST)
  }

  /* ---------------------------------------------- Vòng chạy (như bản gốc) -- */
  let raf = 0
  let last = performance.now()
  let running = false

  function frame(now) {
    const delta = Math.min((now - last) / 1000, 1 / 30)
    last = now
    time += delta * Math.max(CONFIG.speed, 0)
    const follow = Math.min(Math.max(CONFIG.follow, 0.02), 1)
    const kHead = follow >= 1 ? 1 : 1 - Math.exp(-delta * (3 + follow * 30))
    const kScale = 1 - Math.exp(-delta * 10)
    headX += (targetX - headX) * kHead
    headY += (targetY - headY) * kHead
    for (let i = MAX_TRAIL - 1; i > 0; i--) {
      trailX[i] = trailX[i - 1]
      trailY[i] = trailY[i - 1]
    }
    trailX[0] = headX
    trailY[0] = headY
    presence += (presenceTarget - presence) * kScale
    render()
    placeLens()
    if (presence < 0.004 && presenceTarget === 0) {
      presence = 0
      running = false
      state.moving = false
      return
    }
    // Đứng yên: đầu đã tới chuột, đuôi đã gom vào đầu, giọt đã phồng đủ -> dừng.
    // pointermove kế tiếp gọi start() chạy lại.
    let spread = Math.abs(targetX - headX) + Math.abs(targetY - headY) + Math.abs(presenceTarget - presence) * 100
    const c = count()
    for (let i = 1; i < c && spread < 0.25; i++) spread += Math.abs(trailX[i] - headX) + Math.abs(trailY[i] - headY)
    state.moving = spread >= 0.25
    if (!state.moving) {
      running = false
      return
    }
    raf = requestAnimationFrame(frame)
  }
  function placeLens() {
    state.x = headX
    state.y = headY
    state.size = CONFIG.enabled ? Math.max(CONFIG.size, 4) : 0
    state.swell = (100 * Math.log(count() + 1)) / Math.max(CONFIG.blend, 0.5)
    state.count = count()
    state.presence = CONFIG.enabled ? presence : 0
    const on = lensOK && CONFIG.enabled && CONFIG.refract && presence > 0.02
    lens.style.visibility = on ? 'visible' : 'hidden'
    if (!on) return
    buildLens()
    lens.style.transform = `translate3d(${headX - lensR}px, ${headY - lensR}px, 0) scale(${presence})`
  }

  function start() {
    if (running || !CONFIG.enabled) return
    running = true
    last = performance.now()
    raf = requestAnimationFrame(frame)
  }

  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType !== 'mouse') return
      targetX = e.clientX
      targetY = e.clientY
      if (!hasPointer) {
        headX = targetX
        headY = targetY
        trailX.fill(targetX)
        trailY.fill(targetY)
        hasPointer = true
      }
      presenceTarget = 1
      start()
    },
    { passive: true },
  )
  const leave = () => {
    presenceTarget = 0
    hasPointer = false
    start()
  }
  document.documentElement.addEventListener('pointerleave', leave)
  addEventListener('blur', leave)
  addEventListener('resize', () => {
    sync()
    start()
  })

  api.refresh = () => {
    lensKey = ''
    sync()
    if (!CONFIG.enabled) {
      lens.style.visibility = 'hidden'
      cancelAnimationFrame(raf)
      running = false
      presence = 0
      state.presence = 0
      render()
      return
    }
    start()
  }
})()
