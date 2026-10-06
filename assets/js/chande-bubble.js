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
 *   • Không dùng html-in-canvas (API thử nghiệm, trình duyệt thường chưa có) nên
 *     luôn chạy nhánh dự phòng của chính shader: giọt màng trong suốt có viền,
 *     óng ánh và điểm phản quang — KHÔNG khúc xạ nội dung trang bên dưới.
 *   • Một canvas cố định phủ cả màn (pointer-events: none), nghe chuột trên toàn
 *     window thay vì một phần tử.
 *   • Màu nhận mã hex để bảng setting chỉnh được.
 *   • Độ dính (blend) quy theo px thật — xem render(): không có thì giọt phình to
 *     theo kích thước màn hình.
 * Hiệu năng: chỉ vẽ trong vùng scissor quanh giọt; chuột rời cửa sổ thì giọt tan
 * rồi DỪNG hẳn rAF. Chỉ bật với chuột thật và khi không reduced-motion.
 *
 * API: window.CHANDE_BUBBLE = { config, defaults, refresh() }
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
    // giữ cho đủ uniform của shader gốc (chỉ dùng ở nhánh khúc xạ)
    refraction: 80,
    dispersion: 1,
    frost: 0,
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

vec3 generateNormal (vec3 p) {
  return normalize(vec3(
    map(p + vec3(EPS, 0.0, 0.0)) - map(p + vec3(-EPS, 0.0, 0.0)),
    map(p + vec3(0.0, EPS, 0.0)) - map(p + vec3(0.0, -EPS, 0.0)),
    map(p + vec3(0.0, 0.0, EPS)) - map(p + vec3(0.0, 0.0, -EPS))));
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
  style.textContent = '.cbubble{position:fixed; inset:0; width:100vw; height:100vh; z-index:9999; pointer-events:none}'
  document.head.appendChild(style)
  document.body.appendChild(output)

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
    const dpr = Math.min(devicePixelRatio || 1, 2)
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

  function render() {
    const dpr = output.width / Math.max(innerWidth, 1)
    gl.viewport(0, 0, output.width, output.height)
    gl.disable(gl.SCISSOR_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    if (presence <= 0.004 || !CONFIG.enabled) return

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
    gl.enable(gl.SCISSOR_TEST)
    gl.scissor(sx, sy, Math.min(output.width - sx, Math.ceil(maxX - minX + pad * 2)), Math.min(output.height - sy, Math.ceil(maxY - minY + pad * 2)))

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
    if (presence < 0.004 && presenceTarget === 0) {
      presence = 0
      running = false
      return
    }
    raf = requestAnimationFrame(frame)
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
    if (!CONFIG.enabled) {
      cancelAnimationFrame(raf)
      running = false
      presence = 0
      render()
      return
    }
    start()
  }
})()
