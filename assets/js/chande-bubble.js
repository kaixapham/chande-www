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
    hideIn: '.hs-land, .hs-poster, .cmenu', // .cmenu: trang menu — bubble bẻ cong ảnh member thành hình tròn
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
    // Trang có [data-bubble-logo] (hero About): giọt thành khối thuỷ tinh hình logo,
    // đứng ở tâm phần tử đó (cuộn theo trang), con trỏ đẩy văng ra rồi lò xo kéo về.
    logoWidth: 300, // bề ngang logo (px ở khổ 1920, co theo bề ngang màn)
    logoRound: 0.115, // bán kính bo mép (× bề ngang logo) — 0.115 ≈ nửa bề ngang nét logo: phồng tròn hẳn như bong bóng, không còn mặt phẳng
    logoAngle: 0, // góc xoay logo trong mặt phẳng màn (độ, dương = theo chiều kim đồng hồ)
    logoDepth: 0.115, // độ dày: nửa bề dày khối (× bề ngang logo); bo mép không vượt quá số này
    logoTurn: 0, // xoay quanh trục dọc (độ) — lật như đồng xu, thấy được thành bên
    logoSpinOn: true, // bật tự quay quanh trục dọc (tắt thì logo quay mượt về góc logoTurn)
    logoSpin: 40, // tốc độ tự quay (độ / giây, âm = quay ngược)
    logoX: 0, // lệch logo khỏi tâm hero: sang phải (px ở khổ 1920, co theo bề ngang màn)
    logoY: 0, // lệch xuống dưới (px ở khổ 1920)
    // Tách màu R/G/B ở mép như bubble trang chủ — bộ lọc 3 lượt trên cả khung logo, nền
    // gạch neon chạy liên tục nên chạy lại mỗi khung: logo to thì tụt khung hình rõ
    logoDispersion: false,
    // Bóng đổ mềm của logo (đèn chiếu từ trên-trái như phản quang của shader)
    logoShadow: 0.35, // độ đậm (0 = tắt)
    logoShadowBlur: 0.09, // độ nhoè mép bóng (× bề ngang logo)
    logoShadowX: 0.05, // lệch sang phải (× bề ngang logo)
    logoShadowY: 0.08, // lệch xuống dưới (× bề ngang logo)
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
// Dạng LOGO (trang About): đầu giọt là khối logo dày, bo mép — thay cho các cầu.
uniform float uShape; // 0 = cầu (mặc định) · 1 = logo
uniform sampler2D uLogo; // khoảng cách có dấu tới viền logo (đơn vị = bề ngang logo)
uniform vec2 uLogoC; // tâm logo (toạ độ chuẩn hoá)
uniform float uLogoW; // bề ngang logo (toạ độ chuẩn hoá)
uniform vec4 uLogoMap; // uv = (q + xy) / zw — q theo bề ngang logo, gốc ở tâm
uniform float uLogoR; // bán kính bo mép (= nửa độ dày khối), theo bề ngang logo
uniform vec2 uLogoRot; // (cos, sin) góc xoay logo — theo chiều kim đồng hồ trên màn
uniform vec2 uLogoTurn; // (cos, sin) góc xoay quanh trục dọc của logo
uniform float uLogoH; // nửa bề dày khối, theo bề ngang logo
uniform float uVeil; // độ màng mờ của logo (0..1)
uniform vec4 uShadow; // bóng đổ logo: (độ đậm, độ nhoè, lệch x, lệch y) — toạ độ chuẩn hoá, 0 = tắt

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

// Khoảng cách 2D tới viền logo; q = toạ độ RIÊNG của logo (gốc ở tâm, toạ độ chuẩn
// hoá, y hướng lên). Âm = trong logo.
float logo2D (vec2 q) {
  q /= uLogoW;
  q.y = -q.y; // bảng khoảng cách đi từ mép TRÊN logo xuống
  vec2 uv = (q + uLogoMap.xy) / uLogoMap.zw;
  vec2 cuv = clamp(uv, vec2(0.0), vec2(1.0));
  float d = texture(uLogo, cuv).r + length((uv - cuv) * uLogoMap.zw);
  return d * uLogoW;
}

// Khối logo dày 2·h, mép bo bán kính r. Điểm p đưa về toạ độ riêng của logo:
// bỏ góc xoay trong mặt phẳng (uLogoRot) rồi bỏ góc quay quanh trục dọc (uLogoTurn).
float logoSDF (vec3 p) {
  vec2 d = p.xy - uLogoC;
  // xoay ngược để lấy mẫu (y hướng lên: xoay +a = logo quay theo chiều kim đồng hồ)
  vec2 q = vec2(d.x * uLogoRot.x - d.y * uLogoRot.y, d.x * uLogoRot.y + d.y * uLogoRot.x);
  vec3 l = vec3(q.x * uLogoTurn.x + p.z * uLogoTurn.y, q.y, -q.x * uLogoTurn.y + p.z * uLogoTurn.x);
  float h = uLogoH * uLogoW;
  float r = min(uLogoR * uLogoW, h);
  vec2 w = vec2(logo2D(l.xy) + r, abs(l.z) - h + r);
  return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - r;
}

float map (vec3 p) {
  float radius = uBaseRadius * float(uCount);
  float d = 1e5;
  if (uShape > 0.5) d = logoSDF(p);
  else for (int i = 0; i < ${MAX_TRAIL}; i++) {
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
  if (uShape > 0.5) {
    // vòng bao logo (nửa đường chéo hộp 46.4 × 32 ≈ 0.607 bề ngang, + bề dày khi quay
    // quanh trục dọc) — đúng ở mọi góc xoay
    return length(p - uLogoC) - (0.61 + uLogoH) * uLogoW;
  }
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

// Bóng đổ của logo (premultiplied) — tính trước, mọi nhánh bên dưới phủ màng lên trên nó.
// Bóng = khoảng cách tới khối logo trên mặt phẳng giữa, dời theo hướng đèn, mép nhoè.
float shadowA = 0.0;
vec4 overShadow (vec4 c) {
  return c + vec4(vec3(0.02, 0.035, 0.03) * shadowA, shadowA) * (1.0 - c.a);
}

void main () {
  vec2 frag = gl_FragCoord.xy;
  float minRes = min(uResolution.x, uResolution.y);
  vec2 p = (frag * 2.0 - uResolution) / minRes;
  if (uShape > 0.5 && uShadow.x > 0.0) {
    vec2 sp = p - uShadow.zw;
    if (length(sp - uLogoC) < (0.61 + uLogoH) * uLogoW + uShadow.y) {
      float sd = logoSDF(vec3(sp, 0.0));
      float k = 1.0 - smoothstep(-0.35 * uShadow.y, uShadow.y, sd);
      shadowA = uShadow.x * k * k;
    }
  }
  if (lowerBound(p) > 3.0 / minRes) {
    outColor = overShadow(vec4(0.0));
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
    outColor = overShadow(vec4(0.0));
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
    // lớp màng mờ phủ đều (0.03 / 0.08) như bong bóng — logo phồng tròn (logoRound ≈
    // logoDepth) thì cong khắp mặt, giống giọt; mặt phẳng rộng thì màng thành mảng xám
    // -> giảm theo độ phẳng (uVeil do JS tính: 1 = phồng hẳn, 0 = phẳng nhiều)
    float veil = mix(1.0, uVeil, uShape);
    vec3 light = glints * uIridescence * 0.65 + vec3(spec * uShine * 1.5) +
      filmTint * (0.55 * max(uRim, 0.4) * edge + 0.03 * veil);
    float a = fade * clamp(0.08 * veil + 0.4 * edge, 0.0, 1.0);
    if (uFilmDark > 0.0) {
      // Lớp tối nằm DƯỚI lớp màng sáng (premultiplied): viền đậm, lòng hơi mờ.
      float aD = fade * clamp(uFilmDark, 0.0, 1.0) * (0.12 + 0.75 * pow(edge, 2.0));
      vec3 dark = vec3(0.06, 0.08, 0.07) * aD;
      outColor = overShadow(vec4(light * fade + dark * (1.0 - a), a + aD * (1.0 - a)));
      return;
    }
    outColor = overShadow(vec4(light * fade, a));
    return;
  }
  outColor = overShadow(vec4(color * alpha, alpha));
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
    <feFlood flood-color="#808080" result="neutral"/>
    <feImage result="mapimg" x="0" y="0" preserveAspectRatio="none"/>
    <feComposite in="mapimg" in2="neutral" operator="over" result="map"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="0" result="src"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="g"/>
    <feDisplacementMap in="src" in2="map" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>
  </filter>
  <filter id="cbubble-lens1" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feFlood flood-color="#808080" result="neutral"/>
    <feImage result="mapimg" x="0" y="0" preserveAspectRatio="none"/>
    <feComposite in="mapimg" in2="neutral" operator="over" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" xChannelSelector="R" yChannelSelector="G"/>
  </filter>`
  document.body.appendChild(svg)
  const lens = document.createElement('div')
  lens.className = 'cbubble-lens'
  lens.setAttribute('aria-hidden', 'true')
  document.body.appendChild(lens)
  // Hai bộ lọc dùng chung bản đồ: #cbubble-lens (3 lượt, tách màu R/G/B — giọt tròn nhỏ)
  // và #cbubble-lens1 (1 lượt, không tách màu — logo: khung to, nền gạch neon chạy liên
  // tục nên bộ lọc chạy lại mỗi khung; 3 lượt trên cả khung logo tụt còn ~25 khung / giây)
  const feImgs = [...svg.querySelectorAll('feImage')]
  const feImage = {
    setAttribute: (k, v) => feImgs.forEach((f) => f.setAttribute(k, v)),
  }
  const lens1Map = svg.querySelector('#cbubble-lens1 feDisplacementMap')
  const maps = svg.querySelectorAll('#cbubble-lens feDisplacementMap')
  const blur = svg.querySelector('feGaussianBlur')
  let lensR = 0
  let lensKey = ''

  // Bản đồ dịch chuyển hình cầu: R/G = 0.5 + d/2, d = -(x, y)·(1 - √(1 - r²)) —
  // tâm không lệch, càng ra mép càng lấy mẫu từ phía trong (như tia đi qua giọt
  // nước bị bẻ vào). Ngoài hình tròn giữ 0.5 (không dịch).
  // Thấu kính hình logo. KHÔNG xoay / co khung thấu kính bằng CSS: với backdrop-filter,
  // Chrome biến đổi luôn cả nội dung nền chụp được -> trong khung hiện một bản sao nền
  // bị xoay / co. Thay vào đó:
  //   • góc xoay trên mặt phẳng (logoAngle) tính sẵn vào bản đồ (dựng lại khi đổi góc)
  //   • lật quanh trục dọc (logoTurn / tự quay) co bản đồ ngay trong bộ lọc: feImage
  //     width = bề ngang × |cos| (logo đối xứng trái / phải nên mặt sau trùng mặt trước)
  // Bản đồ phủ hộp bao logo đã xoay (+4% lề). Chỉ dải mép bo (rộng logoRound) bẻ tia —
  // như mép cầu: càng ra viền càng lấy mẫu từ phía trong; mặt phẳng giữa khối không dịch.
  let lensHW = 0
  let lensHH = 0
  let lensSX = -1 // độ co ngang đang đặt cho feImage (lật quanh trục dọc)
  function buildLogoLens() {
    buildLogo()
    const W = logoPx()
    const ang = ((+CONFIG.logoAngle || 0) * Math.PI) / 180
    const key = `logo|${W.toFixed(1)}|${CONFIG.logoAngle}|${CONFIG.logoDispersion}|${CONFIG.logoRound}|${CONFIG.logoDepth}|${CONFIG.refraction}|${CONFIG.dispersion}|${CONFIG.frost}`
    if (key === lensKey) return
    lensKey = key
    lensSX = -1
    const ca0 = Math.cos(ang)
    const sa0 = Math.sin(ang)
    const hw0 = (W * 1.08) / 2
    const hh0 = (W * (LOGO_H / LOGO_W) + W * 0.08) / 2
    // hộp bao (trục màn) của hộp logo đã xoay
    lensHW = Math.abs(ca0) * hw0 + Math.abs(sa0) * hh0
    lensHH = Math.abs(sa0) * hw0 + Math.abs(ca0) * hh0
    const bw = lensHW * 2
    const bh = lensHH * 2
    const k2 = Math.min(devicePixelRatio || 1, 2)
    const Sw = Math.max(32, Math.min(1400, Math.round(bw * k2)))
    const Sh = Math.max(32, Math.min(1400, Math.round(bh * k2)))
    const r = Math.min(Math.max(CONFIG.logoRound, 0.01), Math.max(CONFIG.logoDepth, 0.01))
    const e = 1 / logo.ppu
    const edge = 2 / (W * k2) // ~2 px thiết bị theo đơn vị bề ngang logo
    const cv = document.createElement('canvas')
    cv.width = Sw
    cv.height = Sh
    const ctx = cv.getContext('2d')
    const img = ctx.createImageData(Sw, Sh)
    for (let j = 0; j < Sh; j++)
      for (let i = 0; i < Sw; i++) {
        // toạ độ màn (y xuống, đơn vị bề ngang logo, gốc ở tâm) -> toạ độ riêng của logo
        const sx = ((i + 0.5) / Sw - 0.5) * (bw / W)
        const sy = ((j + 0.5) / Sh - 0.5) * (bh / W)
        const qx = sx * ca0 + sy * sa0
        const qy = -sx * sa0 + sy * ca0
        const d = logoDist(qx, qy)
        let dx = 0
        let dy = 0
        if (d < 0 && -d < r) {
          const t = (r + d) / r // 1 ở viền, 0 khi vào sâu hơn r
          const gx = logoDist(qx + e, qy) - logoDist(qx - e, qy)
          const gy = logoDist(qx, qy + e) - logoDist(qx, qy - e)
          const gn = Math.hypot(gx, gy) || 1
          const fade = Math.min(1, -d / edge)
          const k = t * (1 - Math.sqrt(Math.max(0, 1 - t * t))) * fade * fade * (3 - 2 * fade)
          // pháp tuyến viền quay về trục màn
          const nx = (gx * ca0 - gy * sa0) / gn
          const ny = (gx * sa0 + gy * ca0) / gn
          dx = -nx * k
          dy = -ny * k
        }
        const o = (j * Sw + i) * 4
        img.data[o] = Math.round(127.5 + 127.5 * dx)
        img.data[o + 1] = Math.round(127.5 + 127.5 * dy)
        img.data[o + 2] = 128
        img.data[o + 3] = 255
      }
    ctx.putImageData(img, 0, 0)
    feImage.setAttribute('href', cv.toDataURL())
    feImage.setAttribute('x', 0)
    feImage.setAttribute('width', Math.round(bw))
    feImage.setAttribute('height', Math.round(bh))
    const ca = Math.max(CONFIG.dispersion, 0) * 0.08
    const sc = CONFIG.refraction
    maps[0].setAttribute('scale', sc * (1 + ca))
    maps[1].setAttribute('scale', sc)
    maps[2].setAttribute('scale', sc * (1 - ca))
    blur.setAttribute('stdDeviation', Math.min(Math.max(CONFIG.frost, 0), 1) * 10)
    lens1Map.setAttribute('scale', sc)
    lens.style.backdropFilter = CONFIG.logoDispersion ? '' : 'url(#cbubble-lens1)'
    lens.style.width = `${Math.round(bw)}px`
    lens.style.height = `${Math.round(bh)}px`
    lens.style.borderRadius = '0'
    // cắt bỏ vài px sát mép khung: ở mép, bộ lọc lấy mẫu lệch ra ngoài vùng của nó và
    // tách kênh màu -> hiện thành một vạch mảnh xanh / đen
    lens.style.clipPath = 'inset(3px)'
  }
  // lật quanh trục dọc: co bản đồ theo |cos| ngay trong bộ lọc (rẻ, chạy mỗi khung)
  function squashLogoLens() {
    const sx = Math.max(0.002, Math.abs(Math.cos((logoTurnNow() * Math.PI) / 180)))
    if (Math.abs(sx - lensSX) < 0.002) return
    lensSX = sx
    const bw = lensHW * 2
    feImage.setAttribute('x', ((bw * (1 - sx)) / 2).toFixed(2))
    feImage.setAttribute('width', (bw * sx).toFixed(2))
  }

  function buildLens() {
    if (shape === 'logo') return buildLogoLens()
    lens.style.borderRadius = ''
    lens.style.clipPath = ''
    lens.style.backdropFilter = ''
    feImage.setAttribute('x', 0)
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

  /* ------------------------------------------- Dạng logo (trang About) --- */
  // Logo Chande (Union.svg, khung 46.4 × 32). Vẽ ra canvas rồi tính khoảng cách có
  // dấu tới viền (Felzenszwalb EDT, một lần) -> texture R16F cho shader + bản đồ
  // dịch chuyển của thấu kính. Đơn vị khoảng cách = bề ngang logo.
  const LOGO_PATH =
    'M10.7594 32H0V21.3333H10.7594V32ZM46.4 32H35.6406V21.3333H46.4V32ZM21.5188 10.6667V14.6667C21.5188 18.3486 18.5081 21.3333 14.7942 21.3333H10.7594V10.6667H0V0H10.7594L21.5188 10.6667ZM35.6406 21.3333H31.6058C27.8919 21.3333 24.8812 18.3486 24.8812 14.6667V10.6667L35.6406 0H46.4V10.6667H35.6406V21.3333Z'
  const LOGO_W = 46.4
  const LOGO_H = 32
  let logo = null // { w, h, pad, ppu, data, tex }
  function edt1(f, n, d, v, z) {
    let k = 0
    v[0] = 0
    z[0] = -Infinity
    z[1] = Infinity
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      while (s <= z[k]) {
        k--
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k])
      }
      k++
      v[k] = q
      z[k] = s
      z[k + 1] = Infinity
    }
    k = 0
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]
    }
  }
  // bình phương khoảng cách tới điểm "đích" gần nhất (feat[i] = true)
  function edt2(feat, w, h) {
    const INF = 1e20
    const g = new Float64Array(w * h)
    for (let i = 0; i < w * h; i++) g[i] = feat[i] ? 0 : INF
    const n = Math.max(w, h)
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1)
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = g[y * w + x]
      edt1(f, h, d, v, z)
      for (let y = 0; y < h; y++) g[y * w + x] = d[y]
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) f[x] = g[y * w + x]
      edt1(f, w, d, v, z)
      for (let x = 0; x < w; x++) g[y * w + x] = d[x]
    }
    return g
  }
  function buildLogo() {
    if (logo) return logo
    const ppu = 256 // điểm ảnh cho một bề ngang logo
    const pad = 32
    const w = ppu + pad * 2
    const h = Math.round((LOGO_H / LOGO_W) * ppu) + pad * 2
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const ctx = cv.getContext('2d')
    ctx.translate(pad, pad)
    ctx.scale(ppu / LOGO_W, ppu / LOGO_W)
    ctx.fill(new Path2D(LOGO_PATH))
    const px = ctx.getImageData(0, 0, w, h).data
    const inside = new Uint8Array(w * h)
    for (let i = 0; i < w * h; i++) inside[i] = px[i * 4 + 3] >= 128 ? 1 : 0
    const dOut = edt2(inside, w, h) // ngoài: tới điểm trong gần nhất
    const dIn = edt2(inside.map((b) => 1 - b), w, h) // trong: tới điểm ngoài gần nhất
    const data = new Float32Array(w * h)
    for (let i = 0; i < w * h; i++)
      data[i] = (inside[i] ? -(Math.sqrt(dIn[i]) - 0.5) : Math.sqrt(dOut[i]) - 0.5) / ppu
    const t = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, w, h, 0, gl.RED, gl.FLOAT, data)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    logo = { w, h, pad, ppu, data, tex: t }
    return logo
  }
  // khoảng cách (đơn vị bề ngang logo) tại q (gốc ở tâm logo, y xuống), nội suy song tuyến
  function logoDist(qx, qy) {
    const L = logo
    const x = (qx + 0.5) * L.ppu + L.pad - 0.5
    const y = (qy + LOGO_H / LOGO_W / 2) * L.ppu + L.pad - 0.5
    const x0 = Math.min(Math.max(Math.floor(x), 0), L.w - 2)
    const y0 = Math.min(Math.max(Math.floor(y), 0), L.h - 2)
    const fx = Math.min(Math.max(x - x0, 0), 1)
    const fy = Math.min(Math.max(y - y0, 0), 1)
    const D = L.data
    const a = D[y0 * L.w + x0], b = D[y0 * L.w + x0 + 1]
    const c = D[(y0 + 1) * L.w + x0], d = D[(y0 + 1) * L.w + x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }
  let spinDeg = 0 // góc tự quay cộng dồn (logoSpin)
  const logoTurnNow = () => (+CONFIG.logoTurn || 0) + spinDeg
  let shape = 'circle' // 'logo' khi trang có [data-bubble-logo]
  let logoEl = null
  const logoPx = () => Math.max(40, CONFIG.logoWidth * (innerWidth / 1920)) // bề ngang logo (px CSS)

  function sync() {
    // ngân sách điểm ảnh: canvas phủ cả màn, màn 5K × retina thì hạ độ phân giải (giọt mờ mềm)
    const dpr = Math.min(devicePixelRatio || 1, Math.max(CONFIG.maxDpr, 0.5), Math.sqrt(2.6e6 / Math.max(1, innerWidth * innerHeight)))
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
  // độ hiện (opacity) khi vào / ra vùng hideIn — mờ dần chứ không co biến mất
  let fade = 1
  let fadeTarget = 1
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

  // bán kính "thân" giọt để con trỏ đẩy / lõm: logo thì theo bề ngang logo
  const bodyR = () => (shape === 'logo' ? logoPx() * 0.4 : pooledRadius())

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

    const isLogo = shape === 'logo'
    if (isLogo) buildLogo()
    const c = isLogo ? 1 : count()
    const minRes = Math.min(output.width, output.height)
    const logoW = logoPx() * dpr * presence // bề ngang logo (px thiết bị)
    // logo: vòng bao + bề dày + phần bóng đổ (lệch + nhoè)
    const shadowPad = CONFIG.logoShadow > 0 ? Math.hypot(+CONFIG.logoShadowX || 0, +CONFIG.logoShadowY || 0) + Math.max(CONFIG.logoShadowBlur, 0) : 0
    const headRadius = isLogo ? logoW * (0.62 + Math.max(CONFIG.logoDepth, 0.01) + shadowPad) : effSize() * dpr * presence
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
    gl.uniform1f(U.uShape, isLogo ? 1 : 0)
    if (isLogo) {
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, logo.tex)
      gl.uniform1i(U.uLogo, 1)
      gl.uniform2f(U.uLogoC, trailData[0], trailData[1])
      gl.uniform1f(U.uLogoW, Math.max(logoW, 1e-3) / (minRes / 2))
      gl.uniform4f(U.uLogoMap, 0.5 + logo.pad / logo.ppu, LOGO_H / LOGO_W / 2 + logo.pad / logo.ppu, logo.w / logo.ppu, logo.h / logo.ppu)
      gl.uniform1f(U.uLogoR, Math.max(CONFIG.logoRound, 0.01))
      const a = ((+CONFIG.logoAngle || 0) * Math.PI) / 180
      gl.uniform2f(U.uLogoRot, Math.cos(a), Math.sin(a))
      const t = (logoTurnNow() * Math.PI) / 180
      gl.uniform2f(U.uLogoTurn, Math.cos(t), Math.sin(t))
      gl.uniform1f(U.uLogoH, Math.max(CONFIG.logoDepth, 0.01))
      // phần mặt phẳng = bề rộng nét (≈ 0.116 mỗi bên tính từ trục) không được bo tròn
      const flat = Math.max(0, 0.116 - Math.min(Math.max(CONFIG.logoRound, 0.01), Math.max(CONFIG.logoDepth, 0.01))) / 0.116
      gl.uniform1f(U.uVeil, Math.max(0, 1 - flat * 3))
      const wn = Math.max(logoW, 1e-3) / (minRes / 2)
      gl.uniform4f(U.uShadow, Math.min(Math.max(CONFIG.logoShadow, 0), 1), Math.max(CONFIG.logoShadowBlur, 0.005) * wn,
        (+CONFIG.logoShadowX || 0) * wn, -(+CONFIG.logoShadowY || 0) * wn)
    } else gl.uniform4f(U.uShadow, 0, 0, 0, 0)
    // Vết lõm mềm: cầu bán kính pr đặt chạm mặt giọt ngay dưới con trỏ (mặt
    // giọt coi như cầu bán kính rho quanh đầu) rồi ấn xuống theo `dent`.
    // logo là khối kính cứng (mỏng): vết lõm khoét thủng khối -> không dùng
    if (dent > 0.002 && CONFIG.dent && !isLogo) {
      const half = minRes / 2
      const rho = isLogo ? (logoW * 0.35) / half : (pooledRadius() * presence * dpr) / half
      const pr = rho * Math.max(CONFIG.dentSize, 0.05)
      const cx = (ptrX * dpr * 2 - output.width) / minRes
      const cy = ((output.height - ptrY * dpr) * 2 - output.height) / minRes
      const hx = (headX * dpr * 2 - output.width) / minRes
      const hy = ((output.height - headY * dpr) * 2 - output.height) / minRes
      const rn = Math.min(Math.hypot(cx - hx, cy - hy), rho)
      // logo: mặt trước phẳng ở z = nửa độ dày khối
      const zs = isLogo ? (Math.max(CONFIG.logoDepth, 0.01) * logoW) / half : Math.sqrt(Math.max(0, rho * rho - rn * rn))
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
    if (shape === 'logo' && CONFIG.logoSpinOn && CONFIG.logoSpin) spinDeg = (spinDeg + CONFIG.logoSpin * delta) % 360
    else if (spinDeg) {
      // tắt tự quay: quay nốt về góc gốc theo đường ngắn nhất rồi đứng yên
      const w = ((((spinDeg + 180) % 360) + 360) % 360) - 180
      spinDeg = Math.abs(w) < 0.05 ? 0 : w * Math.exp(-delta * 4)
    }
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
      const R = Math.max(bodyR() * presence, 8)
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
      const touching = CONFIG.dent && shape !== 'logo' && ptrIn && d < R * 1.05
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
    fade += (fadeTarget - fade) * (1 - Math.exp(-delta * 7))
    if (Math.abs(fadeTarget - fade) < 0.002) fade = fadeTarget
    const op = fade >= 1 ? '' : fade.toFixed(3)
    if (output.style.opacity !== op) {
      output.style.opacity = op
      lens.style.opacity = op
    }
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
    let spread = Math.abs(targetX - headX) + Math.abs(targetY - headY) + Math.abs(presenceTarget - presence) * 100 + Math.abs(mulTarget - mul) * 100 + Math.abs(fadeTarget - fade) * 100
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
    if (shape === 'logo') {
      // chỉ DỊCH khung (xoay / lật đã nằm trong bản đồ — xem buildLogoLens); lúc hiện ra
      // / tan đi mới co đều theo presence
      squashLogoLens()
      lens.style.transform = `translate3d(${headX - lensHW}px, ${headY - lensHH}px, 0)` + (presence < 0.999 ? ` scale(${presence.toFixed(4)})` : '')
      return
    }
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
      // vùng ẩn giọt (hideIn): mờ dần đi, giữ nguyên cỡ — ra khỏi thì hiện dần lại
      const hide = hiddenHere() ? 0 : 1
      if (hide !== fadeTarget) {
        fadeTarget = hide
        start()
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
      if (want !== fadeTarget) {
        fadeTarget = want
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

  // Trang có [data-bubble-logo] (hero About): giọt thành logo, đứng ở tâm phần tử đó.
  // Ra khỏi màn quá xa thì tan (khỏi vẽ), cuộn lại thì hiện ra đúng chỗ.
  const logoLead = () => {
    if (!logoEl?.isConnected) return null
    const r = logoEl.getBoundingClientRect()
    const y = r.top + r.height / 2
    if (y < -innerHeight * 0.5 || y > innerHeight * 1.5) return null
    const k = innerWidth / 1920
    return { x: r.left + r.width / 2 + (+CONFIG.logoX || 0) * k, y: y + (+CONFIG.logoY || 0) * k }
  }
  function syncShape() {
    const el = document.querySelector('[data-bubble-logo]')
    const want = el ? 'logo' : 'circle'
    logoEl = el
    if (want !== shape) {
      shape = want
      lensKey = ''
      presence = 0 // đổi dạng: hiện lại từ đầu, không biến hình giữa chừng
    }
    if (el) api.lead(logoLead)
    else if (leader === logoLead) api.lead(null)
  }
  window.barba?.hooks?.afterEnter(() => syncShape())

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

  syncShape()

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
