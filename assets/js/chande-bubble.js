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
 *   Chuyển động, độ dính, cỡ giọt GIỐNG HỆT bản gốc: demo trên canvasui.dev cũng
 *   là một canvas phủ cả màn, blend tính trong toạ độ chuẩn hoá theo cạnh ngắn
 *   màn hình -> giọt gom lại to cỡ size + ~10% chiều cao màn (≈120px ở màn cao
 *   900px) và chảy nhão khi kéo. (Từng thử quy blend theo px cho giọt nhỏ lại —
 *   thành hòn bi kéo chuỗi hạt, không giống gốc, đã bỏ.)
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
 * API: window.CHANDE_BUBBLE = { config, defaults, refresh(), state, lead(fn), lure(fn) }
 *   lure(fn, key = 'default'): mỗi khung fn() trả { x, y, r, hide } -> giọt bị hút về
 *   (x, y), đổi bán kính thành r (px), hide = tan mất (bị nuốt); trả null -> về lại theo
 *   chuột; bỏ x / y thì chỉ đổi cỡ. Nhiều module hút cùng lúc được (mỗi module một key);
 *   fn(null) gỡ key đó.
 *   lead(fn): giọt bỏ chuột, bám theo điểm fn() trả về ({x, y} toạ độ màn,
 *   null = tan đi) mỗi khung — trang Gallery cho giọt đi theo vịt patin
 *   (chande-duck.js). lead(null) trả giọt về cho chuột.
 * Đẩy giọt (CONFIG.push, chỉ khi giọt đang được dắt — tự bám chuột thì con
 * trỏ lúc nào cũng ở sát giọt): con trỏ lại gần / quẹt vào -> giọt bị hất ra xa
 * con trỏ có quán tính, lò xo tắt dần kéo về chỗ được dắt (vệt đuôi kéo dài
 * rồi gom lại như giọt nhão). Kèm vết lõm mềm (CONFIG.dent): chỗ con trỏ chạm
 * lõm nông và rộng — trong map() trừ một cầu với độ bo rất lớn — lún / phồng
 * lại qua lò xo chậm.
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
    // Không có thấu kính (Safari / iPhone / máy không hỗ trợ backdrop-filter url())
    // -> màng trắng mờ gần như tàng hình trên nền sáng: thêm viền tối + lòng mờ.
    filmDark: 0.75,
    // Thấu kính khúc xạ (CSS backdrop-filter + SVG). Shader gốc cũng nhận hai số
    // này nhưng chỉ dùng ở nhánh html-in-canvas.
    refract: true,
    refraction: 80, // độ bẻ cong (px dịch tối đa ở mép thấu kính = refraction / 2)
    dispersion: 1, // tách màu R/G/B ở mép (0–3)
    lensScale: 1, // thấu kính to / nhỏ hơn giọt
    frost: 0,
    maxDpr: 1.5, // giới hạn độ phân giải canvas — màng mỏng, 1.5 đã đủ nét
    // Thu nhỏ cả giọt khi mép trên section `shrinkFrom` lên quá nửa màn — giữ
    // nhỏ tới hết trang, cuộn ngược lên thì to lại (chuyển mượt). Cả giọt co đều:
    // cỡ × s và độ dính ÷ s (phần phình do các cầu hoà vào nhau tỉ lệ 1/độ dính).
    shrinkOn: true,
    shrinkFrom: '.hs-intro', // section đầu tiên sau hero -> rời hero là co
    shrinkScale: 0.5,
    // Con trỏ nằm trong các section này thì giọt tan đi (ra khỏi thì hiện lại)
    hideIn: '.hs-land, .hs-poster',
    // Trỏ vào nút / link: giọt co còn hoverScale (so với cỡ gốc), rời ra thì về lại.
    hoverOn: true,
    hoverScale: 0.25,
    // Cỡ chung của cả giọt (nhân với mọi mức co ở trên) và độ lệch khỏi con trỏ
    // (px ở cỡ gốc, co theo giọt) — giọt nằm chếch bên cạnh để chữ ngay dưới con
    // trỏ không bị thấu kính bẻ cong, vẫn đọc được.
    scale: 0.7,
    offsetX: 70,
    offsetY: 50,
    hoverSel: 'a, button, [role="button"], [role="tab"], .cl__cell--nav, label, select, input, textarea',
    // Trỏ vào tiêu đề hover được (vai trò About…): co nhỏ hơn nữa, còn hoverTitleScale.
    hoverTitleSel: '.hs-about__roles li',
    hoverTitleScale: 0.15,
    // Trỏ vào con mắt ở Intro: co còn hoverEyeScale (mắt thì chớp liên tục — chande-eye.js).
    hoverEyeSel: '.hs-intro__eye',
    hoverEyeScale: 0.5,
    // Con trỏ đẩy giọt văng đi (khi giọt đi theo vịt), lò xo kéo về
    push: true,
    pushReach: 1.6, // bán kính con trỏ bắt đầu đẩy (× bán kính giọt)
    pushForce: 3000, // lực đẩy khi con trỏ đứng sát (px/s²)
    pushHit: 2.2, // lực theo tốc độ con trỏ lao vào giọt (× tốc độ, /s)
    pushSpring: 26, // độ cứng lò xo kéo về
    pushDamping: 5, // giảm chấn — thấp = nảy qua lại lâu
    pushMax: 420, // văng xa tối đa (px)
    // Vết lõm mềm chỗ con trỏ chạm (đi cùng đẩy)
    dent: true,
    dentSize: 0.7, // độ rộng vết lõm (× bán kính giọt)
    dentDepth: 0.25, // độ sâu (× độ rộng) — nhỏ = lõm nhẹ
    dentSoft: 0.9, // độ mềm mép (× độ rộng) — lớn = bo tròn mềm hơn
    dentSpring: 70, // lò xo lún / phồng lại — thấp = chậm, mềm
    dentDamping: 12,
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('bubble', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)
  const MAX_TRAIL = 24

  const fine = matchMedia('(pointer: fine)')
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  const api = { config: CONFIG, defaults: DEFAULTS, refresh() {} }
  window.CHANDE_BUBBLE = api
  // Máy cảm ứng: vẫn dựng giọt nhưng chỉ hiện khi được dắt (lead — trang Gallery
  // đi theo vịt); tự bám con trỏ thì cần chuột thật.
  if (reduced.matches) return

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
uniform float uFilmDark; // > 0: không có thấu kính -> viền tối cho thấy giọt trên nền sáng
uniform vec4 uDent; // cầu khoét vết lõm mềm (x, y, z, bán kính) — bán kính 0 = tắt
uniform float uDentSoft; // độ bo mép (đơn vị toạ độ chuẩn hoá)

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
  if (uDent.w > 0.0) {
    // Trừ mềm (smooth max) với độ bo lớn -> lõm nông, mép tan vào mặt giọt.
    float b = -(length(p - uDent.xyz) - uDent.w);
    float h = clamp(0.5 - 0.5 * (b - d) / uDentSoft, 0.0, 1.0);
    d = mix(b, d, h) + uDentSoft * h * (1.0 - h);
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
    if (uFilmDark > 0.0) {
      // Lớp tối nằm DƯỚI lớp màng sáng (premultiplied): viền đậm, lòng hơi mờ.
      float aD = fade * clamp(uFilmDark, 0.0, 1.0) * (0.12 + 0.75 * pow(edge, 2.0));
      vec3 dark = vec3(0.06, 0.08, 0.07) * aD;
      outColor = vec4(light * fade + dark * (1.0 - a), a + aD * (1.0 - a));
      return;
    }
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
    ' backdrop-filter:url(#cbubble-lens); visibility:hidden; will-change:transform}' +
    // màn loading đang chạy (chande-loading.js gắn html.cl-loading): ẩn giọt
    'html.cl-loading .cbubble, html.cl-loading .cbubble-lens{visibility:hidden !important}'
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
    // dựng theo cỡ gốc (m = 1); lúc thu nhỏ thì placeLens() chỉ scale xuống
    const R = Math.max(8, pooledRadius(1) * CONFIG.lensScale)
    const key = `${R.toFixed(1)}|${CONFIG.refraction}|${CONFIG.dispersion}|${CONFIG.frost}`
    if (key === lensKey) return
    lensKey = key
    lensR = R
    // Bản đồ đúng độ phân giải màn (1 điểm bản đồ = 1 px thiết bị) — 128×128
    // phóng lên vài trăm px là ra mép răng cưa từng bậc.
    const S = Math.max(64, Math.min(1024, Math.round(2 * R * Math.min(devicePixelRatio || 1, 2))))
    const edge = 2.5 / (S / 2) // ~2.5 px thiết bị, theo toạ độ chuẩn hoá
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
          // mép giảm mượt về 0 trong ~2.5 px: không còn bậc nhảy từ "bẻ mạnh
          // nhất" sang "không bẻ" ngay trên đường tròn (nguồn răng cưa)
          const fade = Math.min(1, (1 - Math.sqrt(r2)) / edge)
          const k = (1 - Math.sqrt(1 - r2)) * fade * fade * (3 - 2 * fade)
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

  // Bán kính giọt khi gom lại (px CSS), tính đúng như shader: các cầu đồng tâm
  // bán kính r_i = base·(c − i) hoà bằng smoothMin(k = blend) -> mặt giọt ở
  // d = ln Σ e^(k·r_i) / k (toạ độ chuẩn hoá, 1 đơn vị = nửa cạnh ngắn màn).
  // Hệ số thu nhỏ hiện tại (đuổi theo mulTarget mỗi khung) — xem shrinkOn.
  let mul = 1
  let mulTarget = 1
  let overBtn = false // con trỏ đang trên nút / link (hoverSel)
  let leader = null // lead(fn): giọt đi theo fn() thay vì chuột
  const lures = new Map() // lure(fn, key): bị hút về một điểm (miệng Intro, vòng tròn About)
  let luring = false
  let ptrIn = false // chuột đang trong cửa sổ (kể cả khi giọt đang được dắt)
  let ptrVX = 0 // vận tốc con trỏ (px/s, tắt dần khi chuột đứng yên)
  let ptrVY = 0
  let ptrT = 0
  let pushX = 0 // độ văng hiện tại do con trỏ đẩy (px) + vận tốc
  let pushY = 0
  let pushVX = 0
  let pushVY = 0
  let dent = 0 // độ lún vết lõm (0..1) + vận tốc
  let dentV = 0
  let ptrX = 0 // vị trí chuột thật; đích của giọt = chuột + độ lệch (co theo giọt)
  let ptrY = 0
  const aim = () => {
    targetX = ptrX + CONFIG.offsetX * mulTarget
    targetY = ptrY + CONFIG.offsetY * mulTarget
  }
  const effSize = (m = mul) => Math.max(CONFIG.size, 4) * m
  const effBlend = (m = mul) => Math.max(CONFIG.blend, 0.5) / m

  function pooledRadius(scale = mul) {
    const c = count()
    const half = Math.min(innerWidth, innerHeight) / 2
    const k = effBlend(scale)
    const r0 = effSize(scale) / half
    let m = 0
    for (let i = 0; i < c; i++) m += Math.exp(k * (r0 * (c - i)) / c - k * r0)
    return (r0 + Math.log(m) / k) * half
  }

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
    const headRadius = effSize() * dpr * presence
    const baseRadius = (headRadius * 2) / (minRes * c)
    const blend = effBlend()
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
    gl.uniform1f(U.uFilmDark, lensOK && CONFIG.refract ? 0 : Math.max(CONFIG.filmDark, 0))
    // Vết lõm mềm: cầu bán kính pr đặt chạm mặt giọt ngay dưới con trỏ (mặt
    // giọt coi như cầu bán kính rho quanh đầu) rồi ấn xuống theo `dent`.
    if (dent > 0.002 && CONFIG.dent) {
      const half = minRes / 2
      const rho = (pooledRadius() * presence * dpr) / half
      const pr = rho * Math.max(CONFIG.dentSize, 0.05)
      const cx = (ptrX * dpr * 2 - output.width) / minRes
      const cy = ((output.height - ptrY * dpr) * 2 - output.height) / minRes
      const hx = (headX * dpr * 2 - output.width) / minRes
      const hy = ((output.height - headY * dpr) * 2 - output.height) / minRes
      const rn = Math.min(Math.hypot(cx - hx, cy - hy), rho)
      const zs = Math.sqrt(Math.max(0, rho * rho - rn * rn))
      gl.uniform4f(U.uDent, cx, cy, zs + pr - Math.min(dent, 1.2) * CONFIG.dentDepth * pr, pr)
      gl.uniform1f(U.uDentSoft, Math.max(pr * CONFIG.dentSoft, 1e-4))
    } else {
      gl.uniform4f(U.uDent, 0, 0, 0, 0)
      gl.uniform1f(U.uDentSoft, 1)
    }

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
    if (leader) {
      const p = leader()
      if (p) {
        if (presence < 0.004) {
          // Hiện lại: đặt thẳng vào chỗ, không bay từ chỗ cũ tới.
          headX = p.x
          headY = p.y
          trailX.fill(p.x)
          trailY.fill(p.y)
        }
        targetX = p.x
        targetY = p.y
        presenceTarget = 1
      } else presenceTarget = 0
    }
    // Bị hút (lure): bay về điểm hút, co theo cỡ yêu cầu, có thể tan mất (bị nuốt)
    let lu = null
    if (!leader) for (const fn of lures.values()) if ((lu = fn())) break
    if (lu) {
      // không có x / y = chỉ đổi cỡ, vẫn bám chuột
      if (lu.x != null) {
        targetX = lu.x
        targetY = lu.y
      }
      presenceTarget = lu.hide ? 0 : 1
      mulTarget = Math.max(0.02, lu.r / Math.max(1, pooledRadius(1)))
      luring = true
    } else if (luring) {
      luring = false
      mulTarget = -1
      checkShrink()
      if (hasPointer) {
        aim()
        presenceTarget = 1
      }
    }
    headX += (targetX - headX) * kHead
    // Đẩy: con trỏ gần / lao vào giọt -> lực hất ra xa con trỏ; lò xo kéo về.
    if (leader) {
      let ax = -pushX * CONFIG.pushSpring - pushVX * CONFIG.pushDamping
      let ay = -pushY * CONFIG.pushSpring - pushVY * CONFIG.pushDamping
      const fade = Math.exp(-delta * 6)
      ptrVX *= fade
      ptrVY *= fade
      const R = Math.max(pooledRadius() * presence, 8)
      const dx = headX - ptrX
      const dy = headY - ptrY
      const d = Math.hypot(dx, dy)
      const reach = R * CONFIG.pushReach
      if (CONFIG.push && ptrIn && d < reach && d > 0.001) {
        const ux = dx / d
        const uy = dy / d
        const near = 1 - d / reach
        const rush = Math.max(0, ptrVX * ux + ptrVY * uy)
        const f = CONFIG.pushForce * near * near + CONFIG.pushHit * rush * near * 8
        ax += ux * f
        ay += uy * f
      }
      pushVX += ax * delta
      pushVY += ay * delta
      pushX += pushVX * delta
      pushY += pushVY * delta
      const L = Math.hypot(pushX, pushY)
      if (L > CONFIG.pushMax) {
        // Chạm mức văng tối đa: giữ ở mép và bỏ phần vận tốc hướng ra ngoài
        // (không thì giọt dính ở mép tới khi lò xo hãm hết đà).
        const nx = pushX / L
        const ny = pushY / L
        pushX = nx * CONFIG.pushMax
        pushY = ny * CONFIG.pushMax
        const out = pushVX * nx + pushVY * ny
        if (out > 0) {
          pushVX -= out * nx
          pushVY -= out * ny
        }
      }
      targetX += pushX
      targetY += pushY
      // Vết lõm: con trỏ chạm mặt giọt -> lún dần, rời ra -> phồng lại mềm.
      const touching = CONFIG.dent && ptrIn && d < R * 1.05
      dentV += (((touching ? 1 : 0) - dent) * CONFIG.dentSpring - dentV * CONFIG.dentDamping) * delta
      dent += dentV * delta
      if (!touching && Math.abs(dent) < 0.001 && Math.abs(dentV) < 0.01) dent = dentV = 0
    } else dent = dentV = 0
    headY += (targetY - headY) * kHead
    for (let i = MAX_TRAIL - 1; i > 0; i--) {
      trailX[i] = trailX[i - 1]
      trailY[i] = trailY[i - 1]
    }
    trailX[0] = headX
    trailY[0] = headY
    presence += (presenceTarget - presence) * kScale
    mul += (mulTarget - mul) * (1 - Math.exp(-delta * 6))
    if (Math.abs(mulTarget - mul) < 0.002) mul = mulTarget
    render()
    placeLens()
    // Đang được dắt (lead) thì không dừng dù giọt đang tan — vật dắt có thể
    // hiện ra lại bất cứ lúc nào.
    if (presence < 0.004 && presenceTarget === 0 && !leader && !lu) {
      presence = 0
      running = false
      state.moving = false
      return
    }
    // Đứng yên: đầu đã tới chuột, đuôi đã gom vào đầu, giọt đã phồng đủ -> dừng.
    // pointermove kế tiếp gọi start() chạy lại.
    let spread = Math.abs(targetX - headX) + Math.abs(targetY - headY) + Math.abs(presenceTarget - presence) * 100 + Math.abs(mulTarget - mul) * 100
    const c = count()
    for (let i = 1; i < c && spread < 0.25; i++) spread += Math.abs(trailX[i] - headX) + Math.abs(trailY[i] - headY)
    state.moving = spread >= 0.25
    // Đang đi theo vật khác thì không dừng vòng chạy (vật có thể đi tiếp bất cứ lúc nào).
    if (!state.moving && !leader && !lu) {
      running = false
      return
    }
    raf = requestAnimationFrame(frame)
  }
  function placeLens() {
    state.x = headX
    state.y = headY
    state.pushX = pushX // độ văng do con trỏ đẩy (px) — để đo / gỡ lỗi
    state.pushY = pushY
    state.dent = dent
    state.size = CONFIG.enabled ? effSize() : 0
    state.swell = Math.max(0, pooledRadius() - effSize())
    state.count = count()
    state.presence = CONFIG.enabled ? presence : 0
    const on = lensOK && CONFIG.enabled && CONFIG.refract && presence > 0.02
    lens.style.visibility = on ? 'visible' : 'hidden'
    if (!on) return
    buildLens()
    // Thấu kính dựng sẵn bằng giọt lúc gom lại; mỗi khung co theo độ dày THẬT của
    // giọt quanh đầu (cùng công thức với pooledRadius() nhưng có khoảng cách tới
    // từng cầu đuôi). Kéo dài thì đầu giọt mỏng đi, thấu kính nhỏ lại theo — không
    // còn một vòng tròn cứng lơ lửng to hơn giọt.
    const c = count()
    const half = Math.min(innerWidth, innerHeight) / 2
    const k = effBlend()
    const r0 = (effSize() * presence) / half
    let m = 0
    for (let i = 0; i < c; i++) {
      const d = Math.hypot(trailX[i] - headX, trailY[i] - headY) / half
      m += Math.exp(k * ((r0 * (c - i)) / c - d) - k * r0)
    }
    const local = Math.max(0, (r0 + Math.log(m) / k) * half * CONFIG.lensScale)
    lens.style.transform = `translate3d(${headX - lensR}px, ${headY - lensR}px, 0) scale(${(local / lensR).toFixed(4)})`
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
      // Ngón tay chỉ đẩy giọt khi giọt đang được dắt.
      if (e.pointerType !== 'mouse' && !leader) return
      const dt = Math.max(0.008, (e.timeStamp - ptrT) / 1000)
      if (ptrT && dt < 0.2) {
        ptrVX = ptrVX * 0.5 + ((e.clientX - ptrX) / dt) * 0.5
        ptrVY = ptrVY * 0.5 + ((e.clientY - ptrY) / dt) * 0.5
      }
      ptrT = e.timeStamp
      ptrX = e.clientX
      ptrY = e.clientY
      ptrIn = true
      if (leader) return
      aim()
      if (hiddenHere()) {
        presenceTarget = 0
        start()
        return
      }
      const title = !!(CONFIG.hoverOn && CONFIG.hoverTitleSel && e.target?.closest?.(CONFIG.hoverTitleSel))
      const eye = !title && !!(CONFIG.hoverOn && CONFIG.hoverEyeSel && e.target?.closest?.(CONFIG.hoverEyeSel))
      const over = title ? 'title' : eye ? 'eye' : !!(CONFIG.hoverOn && CONFIG.hoverSel && e.target?.closest?.(CONFIG.hoverSel))
      if (over !== overBtn) {
        overBtn = over
        checkShrink()
      }
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
  // Ngón tay: chạm xuống là có vị trí ngay; nhấc lên là hết đẩy (không có hover).
  addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType === 'mouse' || !leader) return
      ptrX = e.clientX
      ptrY = e.clientY
      ptrT = e.timeStamp
      ptrVX = ptrVY = 0
      ptrIn = true
    },
    { passive: true },
  )
  const lift = (e) => {
    if (e.pointerType === 'mouse') return
    ptrIn = false
    ptrVX = ptrVY = 0
  }
  addEventListener('pointerup', lift, { passive: true })
  addEventListener('pointercancel', lift, { passive: true })
  const leave = () => {
    ptrIn = false
    if (leader) return
    presenceTarget = 0
    hasPointer = false
    start()
  }
  document.documentElement.addEventListener('pointerleave', leave)
  addEventListener('blur', leave)
  // Thu nhỏ theo vị trí cuộn (section shrinkFrom) và khi trỏ vào nút (hoverSel) —
  // lấy mức nhỏ hơn. Giọt đang ẩn thì đặt luôn.
  function hiddenHere() {
    if (!CONFIG.hideIn) return false
    // phần tử nằm TRÊN CÙNG dưới con trỏ (section sau trượt lên phủ thì không tính nữa)
    return !!document.elementFromPoint(ptrX, ptrY)?.closest?.(CONFIG.hideIn)
  }
  function checkShrink() {
    const el = CONFIG.shrinkOn && CONFIG.shrinkFrom ? document.querySelector(CONFIG.shrinkFrom) : null
    let t = el && el.getBoundingClientRect().top < innerHeight * 0.5 ? Math.min(Math.max(CONFIG.shrinkScale, 0.1), 1) : 1
    if (overBtn && CONFIG.hoverOn) {
      const k = overBtn === 'title' ? CONFIG.hoverTitleScale : overBtn === 'eye' ? CONFIG.hoverEyeScale : CONFIG.hoverScale
      t = Math.min(t, Math.min(Math.max(k, 0.05), 1))
    }
    t *= Math.min(Math.max(CONFIG.scale, 0.1), 2)
    if (t === mulTarget) return
    mulTarget = t
    if (hasPointer) aim()
    if (presence > 0.004) start()
    else mul = t
  }
  addEventListener('scroll', checkShrink, { passive: true })
  // cuộn mà chuột đứng yên: section ẩn giọt có thể trôi tới / trôi khỏi dưới con trỏ
  addEventListener(
    'scroll',
    () => {
      if (leader || !hasPointer) return
      const want = hiddenHere() ? 0 : 1
      if (want !== presenceTarget) {
        presenceTarget = want
        start()
      }
    },
    { passive: true },
  )
  window.barba?.hooks?.afterEnter(() => checkShrink())
  checkShrink()

  addEventListener('resize', () => {
    sync()
    lensKey = '' // cỡ giọt theo cạnh ngắn màn hình
    start()
  })

  api.lead = (fn) => {
    leader = typeof fn === 'function' ? fn : null
    if (!leader) {
      // Trả về cho chuột: bám lại chỗ chuột nếu chuột đang trong cửa sổ.
      presenceTarget = hasPointer ? 1 : 0
      if (hasPointer) aim()
    }
    start()
  }

  api.lure = (fn, key = 'default') => {
    if (typeof fn === 'function') lures.set(key, fn)
    else lures.delete(key)
    start()
  }

  api.refresh = () => {
    lensKey = ''
    mulTarget = -1
    checkShrink()
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
