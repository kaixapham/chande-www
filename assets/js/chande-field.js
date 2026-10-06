/* =============================================================================
 * CHANDE — Effect xanh (ô khảm chạy)
 * -----------------------------------------------------------------------------
 * Port từ gradient-studio (~/Desktop/Claude.Emotiv/gradient-studio,
 * src/app/field/field-shader.ts + field-gl.ts). Chỉ giữ đúng nhánh mà preset
 * dùng, phép tính chép nguyên:
 *   • form Slats  — N cột dọc, mỗi cột chạy một vòng ramp, bị "gảy" theo đường
 *                   cong đo từ clip mẫu (slatPluck), lệch nhau theo lineOffset
 *   • Mosaic      — mỗi ô đọc màu field ở tâm ô, vẽ thành viên gạch vuông bo góc
 *                   có khe, gờ sáng góc trên-trái và núm tròn
 *   • grade (contrast / saturation), vignette, grain
 * Bỏ fbm / warp / echo / audio vì Slats không dùng tới: shader nhẹ hơn nhiều.
 *
 * GỘP CANVAS: một [data-field-root] chứa nhiều vùng [data-field] chỉ dùng MỘT
 * <canvas> WebGL phủ cả root; mỗi khung vẽ lần lượt từng vùng bằng viewport +
 * scissor, ngoài vùng trong suốt. Một context, một lượt composite thay vì N.
 * [data-field] đứng lẻ (không nằm trong root nào) thì tự làm root của chính nó.
 *
 * Chống lag:
 *   • chỉ vẽ khi phần tử đang trong màn hình (IntersectionObserver)
 *   • một vòng rAF chung, khoá `fps`; tab ẩn thì rAF tự dừng
 *   • canvas tối đa `maxDpr` lần cỡ CSS
 *   • prefers-reduced-motion: vẽ một khung tĩnh rồi thôi
 * Không có WebGL thì phần tử giữ nền ảnh tĩnh (CSS .field).
 *
 * Đồng bộ với hero — KHÔNG BAO GIỜ DỪNG GIỮA CHỪNG: hero gọi park() khi thanh
 * process đầy; effect chạy NỐT vòng đang chạy, đỗ đúng điểm nghỉ (phase 0, cột
 * đã lắng hẳn) rồi mới resolve — lúc đó shape reveal mới bắt đầu đổi ảnh.
 * 'chande-hero:swap-end' nhả ra, vòng mới bắt đầu từ 0.
 *
 * Tham số theo từng vùng (ghi đè CONFIG): data-field-cols, data-field-tiles,
 * data-field-flip ("y" = lật dọc), data-field-shift (0..1, lệch pha).
 *
 * API: window.CHANDE_FIELD = { config, defaults, mount(root), destroy(), refresh(),
 *                            park() -> Promise, release() }
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    // ---- Preset (gradient-studio) -----------------------------------------
    colors: ['#000000', '#0f6b2a', '#5cf11e', '#e9ffd1'], // palette "Radioactive"
    columns: 7, // lines.count — "1 cục xanh 7 columns"
    lineOffset: 0.06, // lag giữa các cột (6%)
    lineOrder: 0, // 0 centre-out · 1 sweep · 2 alternate · 3 converge · 4 random
    softness: 0.82,
    mosaic: true,
    tiles: 40, // mosaic.detail — số ô theo chiều ngang
    gap: 0.01,
    corners: 0.24,
    bevel: 0.32,
    studs: 0.56,
    contrast: 1.06,
    saturation: 1.08,
    vignette: 0.18,
    grain: 0.04, // preset gốc 0.16 — hạ xuống vì noise chạy trên ô khảm nhìn bẩn
    grainSize: 1.4,
    // ---- Chạy --------------------------------------------------------------
    loop: 6, // giây cho một vòng
    fps: 30,
    maxDpr: 1.25, // ô to + gờ mềm: 1.25 đủ nét trên retina, đỡ ~30% điểm ảnh so với 1.5
  }
  const DEFAULTS = structuredClone(CONFIG)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  /* ------------------------------------------------------------- Shader --- */
  const VERT = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

  const FRAG = `
precision highp float;
#define TAU 6.2831853071795864
varying vec2 vUv;
uniform vec2 uResolution;
uniform vec3 uColors[4];
uniform float uPhase;
uniform float uLineCount;
uniform float uLineOffset;
uniform float uLineOrder;
uniform float uSoftness;
uniform float uMosaicOn;
uniform float uMosaicDetail;
uniform float uMosaicGap;
uniform float uMosaicCorners;
uniform float uMosaicBevel;
uniform float uMosaicStuds;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;
uniform float uGrainAmount;
uniform float uGrainSize;
uniform float uFlip;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }

vec3 rampColor(float t) {
  float s = clamp(t, 0.0, 1.0) * 3.0;
  vec3 c = uColors[0];
  for (int i = 0; i < 3; i++) {
    float w = clamp(s - float(i), 0.0, 1.0);
    float aa = clamp(RAMP_AA(s) * 0.5, 0.0004, 0.5);
    float crisp = smoothstep(0.5 - aa, 0.5 + aa, w);
    c = mix(c, uColors[i + 1], mix(crisp, smoothstep(0.0, 1.0, w), uSoftness));
  }
  return c;
}

float lineQueue(float line, float count) {
  float centre = (count - 1.0) * 0.5;
  float fromCentre = abs(line - centre) / max(centre, 1.0);
  if (uLineOrder < 0.5) return fromCentre;
  if (uLineOrder < 1.5) return line / max(count - 1.0, 1.0);
  if (uLineOrder < 2.5) return mod(line, 2.0);
  if (uLineOrder < 3.5) return 1.0 - fromCentre;
  return hash(vec2(line, 7.0));
}

float slatPluck(float t) {
  float s = -0.2132;
  s += 0.2610 * cos(TAU * t + 1.242);
  s += 0.0920 * cos(TAU * 2.0 * t + 0.114);
  s += 0.0384 * cos(TAU * 3.0 * t - 0.549);
  s += 0.0202 * cos(TAU * 4.0 * t - 1.081);
  s += 0.0106 * cos(TAU * 5.0 * t - 1.681);
  s += 0.0046 * cos(TAU * 6.0 * t - 2.294);
  return s;
}

vec3 shadeAt(vec2 uv) {
  float column = floor(uv.x * uLineCount);
  float queue = lineQueue(column, uLineCount);
  float f = fract(uv.y + slatPluck(uPhase - queue * uLineOffset));
  return rampColor(fract(f));
}

vec3 saturate3(vec3 color, float amount) {
  float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(grey), color, amount);
}

void main() {
  vec2 uv = vec2(vUv.x, uFlip > 0.5 ? 1.0 - vUv.y : vUv.y);
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
  float angle = uPhase * TAU;
  vec3 color;

  if (uMosaicOn > 0.5) {
    vec2 grid = vec2(uMosaicDetail, max(1.0, floor(uMosaicDetail / max(aspect, 0.001))));
    vec2 cell = floor(uv * grid);
    vec2 local = fract(uv * grid) - 0.5;
    vec3 tint = shadeAt((cell + 0.5) / grid);

    float extent = 0.5 - uMosaicGap * 0.5;
    float radius = uMosaicCorners * extent;
    vec2 corner = max(abs(local) - (extent - radius), 0.0);
    float brickDistance = length(corner) - radius;
    float edgeAA = max(RAMP_AA(brickDistance), 0.0008);
    float brick = 1.0 - smoothstep(-edgeAA, edgeAA, brickDistance);

    vec2 key = normalize(vec2(-0.7, 0.7));
    vec2 slope = local / max(extent, 0.001);
    float rim = smoothstep(0.25, 1.0, max(abs(slope.x), abs(slope.y)));
    float relief = dot(normalize(slope + vec2(1e-5)), key) * rim;
    vec3 lit = tint * (1.0 + uMosaicBevel * relief);

    if (uMosaicStuds > 0.001) {
      float studRadius = uMosaicStuds * extent * 0.62;
      float studDistance = length(local) - studRadius;
      float stud = 1.0 - smoothstep(-edgeAA, edgeAA, studDistance);
      float studSlope = clamp(length(local) / max(studRadius, 0.001), 0.0, 1.0);
      float studRelief = dot(normalize(local + vec2(1e-5)), key) * studSlope;
      lit = mix(lit, tint * (1.0 + uMosaicBevel * (0.25 + studRelief)), stud);
    }
    color = mix(rampColor(0.0) * 0.3, clamp(lit, 0.0, 1.0), brick);
  } else {
    color = shadeAt(uv);
  }

  color = clamp((color - 0.5) * uContrast + 0.5, 0.0, 1.0);
  color = clamp(saturate3(color, uSaturation), 0.0, 1.0);
  float edge = length(centered * vec2(1.0 / max(aspect, 0.001), 1.0)) * 1.35;
  color *= mix(1.0, smoothstep(1.15, 0.25, edge), uVignette);
  vec2 grainCell = floor(gl_FragCoord.xy / max(uGrainSize, 0.25));
  float grain = hash(grainCell + vec2(sin(angle) * 37.0, cos(angle) * 61.0)) - 0.5;
  color = clamp(color + grain * uGrainAmount, 0.0, 1.0);
  gl_FragColor = vec4(color, 1.0);
}`

  const UNIFORMS = [
    'uResolution', 'uPhase', 'uLineCount', 'uLineOffset', 'uLineOrder', 'uSoftness',
    'uMosaicOn', 'uMosaicDetail', 'uMosaicGap', 'uMosaicCorners', 'uMosaicBevel',
    'uMosaicStuds', 'uContrast', 'uSaturation', 'uVignette', 'uGrainAmount', 'uGrainSize',
  'uFlip',
  ]

  const hexToRgb = (hex) => {
    const n = parseInt(String(hex).replace('#', ''), 16) || 0
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
  }

  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { alpha: true, antialias: false, powerPreference: 'low-power' })
    if (!gl) return null
    const deriv = !!gl.getExtension('OES_standard_derivatives')
    const prelude = deriv
      ? '#extension GL_OES_standard_derivatives : enable\n#define RAMP_AA(v) fwidth(v)\n'
      : '#define RAMP_AA(v) 0.004\n'
    const sh = (type, src) => {
      const s = gl.createShader(type)
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s))
      return s
    }
    const prog = gl.createProgram()
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, prelude + FRAG))
    gl.bindAttribLocation(prog, 0, 'aPosition')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog))
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.useProgram(prog)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const u = {}
    UNIFORMS.forEach((n) => (u[n] = gl.getUniformLocation(prog, n)))
    const uColors = [0, 1, 2, 3].map((i) => gl.getUniformLocation(prog, `uColors[${i}]`))

    gl.enable(gl.SCISSOR_TEST)
    gl.clearColor(0, 0, 0, 0)

    return {
      // Đầu mỗi khung: đặt cỡ canvas và xoá trong suốt.
      begin(w, h) {
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w
          canvas.height = h
        }
        gl.scissor(0, 0, w, h)
        gl.clear(gl.COLOR_BUFFER_BIT)
      },
      // Một vùng: x, y tính từ góc TRÊN-trái canvas (px thiết bị).
      draw(x, y, w, h, phase, o, pixelScale, flip) {
        const gy = canvas.height - y - h // WebGL đếm từ đáy
        gl.viewport(x, gy, w, h)
        gl.scissor(x, gy, w, h)
        gl.uniform1f(u.uFlip, flip ? 1 : 0)
        o.colors.forEach((c, i) => gl.uniform3fv(uColors[i], hexToRgb(c)))
        gl.uniform2f(u.uResolution, w, h)
        gl.uniform1f(u.uPhase, phase)
        gl.uniform1f(u.uLineCount, o.columns)
        gl.uniform1f(u.uLineOffset, o.lineOffset)
        gl.uniform1f(u.uLineOrder, o.lineOrder)
        gl.uniform1f(u.uSoftness, o.softness)
        gl.uniform1f(u.uMosaicOn, o.mosaic ? 1 : 0)
        gl.uniform1f(u.uMosaicDetail, o.tiles)
        gl.uniform1f(u.uMosaicGap, o.gap)
        gl.uniform1f(u.uMosaicCorners, o.corners)
        gl.uniform1f(u.uMosaicBevel, o.bevel)
        gl.uniform1f(u.uMosaicStuds, o.studs)
        gl.uniform1f(u.uContrast, o.contrast)
        gl.uniform1f(u.uSaturation, o.saturation)
        gl.uniform1f(u.uVignette, o.vignette)
        gl.uniform1f(u.uGrainAmount, o.grain)
        gl.uniform1f(u.uGrainSize, o.grainSize * pixelScale)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
      },
      dispose() {
        gl.deleteBuffer(buf)
        gl.deleteProgram(prog)
        gl.getExtension('WEBGL_lose_context')?.loseContext()
      },
    }
  }

  /* -------------------------------------------------------------- Fields --- */
  // Mỗi "nhóm" = một root + một canvas + một renderer, chứa 1..N vùng.
  const groups = new Set()
  let io = null
  let ro = null
  let raf = 0
  let last = 0

  function regionOptions(el) {
    const d = el.dataset
    return {
      ...CONFIG,
      columns: +d.fieldCols || CONFIG.columns,
      tiles: +d.fieldTiles || CONFIG.tiles,
    }
  }

  // Đồng hồ chung, tự tích luỹ (không đọc thẳng performance.now) để đỗ được.
  // phase 0 = điểm nghỉ: slatPluck đã lắng hẳn về 0, mọi cột đứng thẳng hàng.
  const clock = { phase: 0, holds: 0, parked: false, waiters: [], t: 0 }
  function settleWaiters() {
    clock.waiters.splice(0).forEach((fn) => fn())
  }
  function advance(now) {
    const dt = clock.t ? Math.min(0.1, (now - clock.t) / 1000) : 0
    clock.t = now
    if (clock.parked) return
    const next = clock.phase + dt / Math.max(0.5, CONFIG.loop)
    if (next < 1) return void (clock.phase = next)
    // Hết vòng. Có ai đang chờ đỗ thì dừng ĐÚNG ở 0, không trượt sang vòng mới.
    clock.phase = clock.holds > 0 ? 0 : next % 1
    if (clock.holds > 0) {
      clock.parked = true
      settleWaiters()
    }
  }
  // Chạy nốt vòng hiện tại rồi đỗ. Không có vùng nào đang vẽ (cuộn khuất,
  // reduced-motion) thì đỗ ngay — đằng nào cũng không ai thấy cú nhảy về 0.
  function park() {
    clock.holds++
    if (clock.parked) return Promise.resolve()
    const anyVisible = [...groups].some((g) => g.visible && g.r)
    if (!anyVisible || reduced.matches) {
      clock.phase = 0
      clock.parked = true
      return Promise.resolve()
    }
    kick()
    return new Promise((res) => clock.waiters.push(res))
  }
  function release() {
    clock.holds = Math.max(0, clock.holds - 1)
    if (clock.holds === 0 && clock.parked) {
      clock.parked = false
      clock.t = 0
      kick()
    }
  }

  // Vị trí từng vùng so với root, đo lại khi đổi cỡ (vùng không trượt trong root).
  function measure(g) {
    const rr = g.root.getBoundingClientRect()
    g.regions.forEach((rg) => {
      const r = rg.el.getBoundingClientRect()
      rg.x = r.left - rr.left
      rg.y = r.top - rr.top
      rg.w = r.width
      rg.h = r.height
    })
    g.cssW = g.root.clientWidth
    g.cssH = g.root.clientHeight
  }

  function drawGroup(g) {
    if (!g.r) return
    const dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr)
    g.r.begin(Math.max(1, Math.round(g.cssW * dpr)), Math.max(1, Math.round(g.cssH * dpr)))
    g.regions.forEach((rg) => {
      if (rg.w < 1 || rg.h < 1) return
      const x = Math.round(rg.x * dpr)
      const y = Math.round(rg.y * dpr)
      const w = Math.round((rg.x + rg.w) * dpr) - x
      const h = Math.round((rg.y + rg.h) * dpr) - y
      const phase = (clock.phase + (+rg.el.dataset.fieldShift || 0)) % 1
      g.r.draw(x, y, w, h, phase, regionOptions(rg.el), dpr, rg.el.dataset.fieldFlip === 'y')
    })
  }

  function loop(t) {
    raf = 0
    let any = false
    if (t - last >= 1000 / CONFIG.fps - 1) {
      last = t
      advance(t)
      groups.forEach((g) => {
        if (!g.visible) return
        any = true
        drawGroup(g)
      })
    } else any = [...groups].some((g) => g.visible)
    if (!any && clock.waiters.length) {
      clock.phase = 0
      clock.parked = true
      settleWaiters()
    }
    if (any && !reduced.matches) raf = requestAnimationFrame(loop)
  }
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(loop)
  }

  function addGroup(root, regionEls) {
    if (root.__fieldGroup) return
    const canvas = document.createElement('canvas')
    canvas.className = 'field__gl'
    canvas.setAttribute('aria-hidden', 'true')
    const g = { root, canvas, r: null, visible: false, regions: regionEls.map((el) => ({ el })) }
    root.__fieldGroup = g
    groups.add(g)
    measure(g)
    io.observe(root)
    ro.observe(root)
    regionEls.forEach((el) => el !== root && ro.observe(el))
  }

  function ensureRenderer(g) {
    if (g.r || g.failed) return
    try {
      g.r = createRenderer(g.canvas)
    } catch (e) {
      console.warn('[chande-field] WebGL lỗi, giữ ảnh tĩnh:', e)
    }
    if (!g.r) return void (g.failed = true)
    // Root nhóm: canvas nằm DƯỚI mọi lớp khác của root. Vùng lẻ: phủ trong chính nó.
    if (g.root.hasAttribute('data-field-root')) g.root.prepend(g.canvas)
    else g.root.appendChild(g.canvas)
    g.root.classList.add('is-live')
  }

  function mount(scope = document) {
    if (!io) {
      io = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            const g = e.target.__fieldGroup
            if (!g) return
            g.visible = e.isIntersecting
            if (g.visible) {
              ensureRenderer(g)
              measure(g)
              drawGroup(g)
              kick()
            }
          }),
        { rootMargin: '150px 0px' },
      )
      ro = new ResizeObserver((entries) => {
        const touched = new Set()
        entries.forEach((e) => {
          const el = e.target
          const g = el.__fieldGroup || el.closest('[data-field-root]')?.__fieldGroup
          if (g) touched.add(g)
        })
        touched.forEach((g) => {
          measure(g)
          if (g.visible) drawGroup(g)
        })
      })
    }
    const all = (sel) => [...(scope.matches?.(sel) ? [scope] : []), ...scope.querySelectorAll(sel)]
    all('[data-field-root]').forEach((root) => addGroup(root, [...root.querySelectorAll('[data-field]')]))
    all('[data-field]').forEach((el) => {
      if (!el.closest('[data-field-root]')) addGroup(el, [el])
    })
  }

  function destroy(scope) {
    groups.forEach((g) => {
      if (scope && !scope.contains(g.root)) return
      io?.unobserve(g.root)
      ro?.unobserve(g.root)
      g.regions.forEach((rg) => ro?.unobserve(rg.el))
      g.r?.dispose()
      g.canvas.remove()
      g.root.classList.remove('is-live')
      delete g.root.__fieldGroup
      groups.delete(g)
    })
  }

  // Gọi sau khi sửa CONFIG (bảng setting).
  function refresh() {
    groups.forEach((g) => g.visible && drawGroup(g))
    kick()
  }

  document.addEventListener('chande-hero:swap-end', release)
  // Rời màn hình rồi quay lại: đừng cộng dồn cả quãng nghỉ vào dt.
  document.addEventListener('visibilitychange', () => (clock.t = 0))

  mount(document)
  if (window.barba?.hooks) {
    window.barba.hooks.beforeEnter((data) => mount(data.next.container))
    window.barba.hooks.afterLeave((data) => destroy(data.current.container))
  }

  window.CHANDE_FIELD = { config: CONFIG, defaults: DEFAULTS, mount, destroy, refresh, park, release }
})()
