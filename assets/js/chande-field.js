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
 * Rê chuột có 5 preset (HOVER_PRESETS): Thấu kính · Tản ô · Nam châm · Dạt ô · Gợn sóng.
 *
 * API: window.CHANDE_FIELD = { config, defaults, mount(root), destroy(), refresh(),
 *                            park() -> Promise, release(), applyHoverPreset(tên),
 *                            playIntro(ms) — gạch bung ra lần lượt (sau màn loading) }
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
    // Đỗ lại (chạy nốt vòng rồi đứng) trong lúc 4 ảnh hero đổi — tắt = chạy liên tục
    pauseOnSwap: false,
    fps: 60, // 30 tiết kiệm hơn nhưng cột trượt chậm nhìn thành từng nấc (đã đo: 60 không làm tụt khung trang)
    maxDpr: 1.25, // ô to + gờ mềm: 1.25 đủ nét trên retina, đỡ ~30% điểm ảnh so với 1.5
    // ---- Rê chuột vào mảng xanh ---------------------------------------------
    hover: true,
    // Preset chỉ là nhãn của bộ số bên dưới — chọn ở bảng setting thì
    // applyHoverPreset() chép bộ số vào đây; chỉnh tay từng ô sau đó vẫn được.
    hoverPreset: 'lens', // lens · scatter · magnet · drift · ripple (xem HOVER_PRESETS)
    // push = ô co/đẩy trong ô của nó · ripple = thêm vòng sóng lan ra ·
    // scatter = ô giữ cỡ, bị đẩy dạt sang chỗ ô bên cạnh
    hoverMode: 'push',
    hoverRipple: 1, // ripple: tốc độ sóng
    hoverRadius: 6, // bán kính ảnh hưởng, tính bằng số ô
    hoverShrink: 0.45, // ô sát con trỏ co lại bao nhiêu (0..1)
    hoverPush: 0.9, // ô trượt ra xa con trỏ, tỉ lệ khoảng trống vừa co ra
    hoverWarp: 1.6, // màu field bị kéo về phía con trỏ (số ô)
    hoverGlow: 0.25, // sáng thêm
    // Nền lộ ra dưới các ô khi chúng co / dạt: PHẲNG — không bóng, không đi qua
    // contrast / saturation / vignette / grain. Chỉ áp ở vùng chuột tác động.
    // hoverGapAuto: lấy đúng màu nền phía sau vùng (đọc background của phần tử
    // cha gần nhất có nền — hero kem, hero tối, section đen…) để liền với trang;
    // tắt thì dùng hoverGapColor.
    hoverGapAuto: true,
    imgTiles: true, // 4 ảnh hero cũng vỡ ô khi rê (chande-imgtiles.js đọc cờ này)
    hoverGapColor: '#ffffff',
    hoverFlat: 1, // làm phẳng gờ nổi (bóng) của ô trong vùng chuột (0 = giữ gờ)
    hoverEase: 0.18, // độ bám theo chuột / bật-tắt (0..1, nhỏ = mượt hơn)
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('field', CONFIG)
  const DEFAULTS = structuredClone(CONFIG)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)')

  // Bộ số cho từng kiểu rê chuột. hoverGapColor không nằm trong preset (giữ màu
  // nền đang chọn). 'lens' = mặc định gốc.
  const HOVER_PRESETS = {
    lens: { // Thấu kính — ô co, trượt ra xa, màu bị kéo về con trỏ
      hoverMode: 'push', hoverRadius: 6, hoverShrink: 0.45, hoverPush: 0.9, hoverWarp: 1.6, hoverGlow: 0.25, hoverFlat: 1, hoverEase: 0.18 },
    scatter: { // Tản ô — ô co mạnh và dạt hết ra, lộ nhiều nền
      hoverMode: 'push', hoverRadius: 8, hoverShrink: 0.8, hoverPush: 1, hoverWarp: 0, hoverGlow: 0, hoverFlat: 1, hoverEase: 0.12 },
    magnet: { // Nam châm — ô bị hút về phía con trỏ, màu chụm vào
      hoverMode: 'push', hoverRadius: 6, hoverShrink: 0.3, hoverPush: -1, hoverWarp: -1.2, hoverGlow: 0.35, hoverFlat: 1, hoverEase: 0.2 },
    drift: { // Dạt ô — ô GIỮ NGUYÊN CỠ, chỉ bị đẩy dạt ra xa con trỏ, lộ nền phía sau
      hoverMode: 'scatter', hoverRadius: 7, hoverShrink: 0, hoverPush: 1, hoverWarp: 0.4, hoverGlow: 0.1, hoverFlat: 1, hoverEase: 0.15 },
    ripple: { // Gợn sóng — vòng sóng lan ra từ con trỏ, ô co/giãn theo sóng
      hoverMode: 'ripple', hoverRipple: 1, hoverRadius: 10, hoverShrink: 0.6, hoverPush: 0.5, hoverWarp: 0.6, hoverGlow: 0.2, hoverFlat: 1, hoverEase: 0.15 },
  }
  function applyHoverPreset(name) {
    const p = HOVER_PRESETS[name]
    if (!p) return
    Object.assign(CONFIG, p)
    CONFIG.hoverPreset = name
  }

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
uniform vec2 uMouse;        // vị trí chuột trong toạ độ uv của vùng (đã tính lật)
uniform float uHover;       // 0..1, bật/tắt dần
uniform float uHoverRadius;
uniform float uHoverShrink;
uniform float uHoverPush;
uniform float uHoverWarp;
uniform float uHoverGlow;
uniform vec3 uHoverGap;
uniform float uHoverFlat;
uniform vec2 uPad;          // khung vẽ nới ra mỗi phía (tỉ lệ theo cỡ vùng) cho ô dạt tràn ra
uniform float uHoverMode;   // 0 push · 1 ripple · 2 scatter (dạt ô)
uniform float uHoverTime;   // giây, cho sóng
uniform float uIntro;       // 0..1 — xuất hiện sau màn loading: từng viên gạch bung ra lần lượt

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

// Một viên ô của cell c, xét tại điểm g (toạ độ theo ô). Trả độ phủ (0..1), ghi
// màu đã chiếu sáng (lit) và mức ảnh hưởng của chuột lên viên đó (infl).
// scatter = 0: ô CO LẠI và TRƯỢT trong phạm vi ô của chính nó (không tràn sang ô
// bên nên không bị cắt). scatter = 1: ô giữ cỡ, bị ĐẨY ra xa chuột tới 0.9 ô
// (main() xét cả ô lân cận). Màu field bị kéo về phía con trỏ như qua thấu kính,
// ô sáng lên một chút. Tính theo đơn vị ô nên tròn đều ở mọi tỉ lệ vùng.
float brickAt(vec2 g, vec2 c, vec2 grid, float scatter, out vec3 lit, out float infl) {
  vec2 cellUv = (c + 0.5) / grid;
  vec2 dCells = (cellUv - uMouse) * grid;
  float dist = length(dCells);
  infl = uHover * (1.0 - smoothstep(0.0, uHoverRadius, dist));
  infl *= infl * (3.0 - 2.0 * infl);
  if (uHoverMode > 0.5 && uHoverMode < 1.5) {
    // vòng sóng lan ra: đỉnh sóng đi ra ngoài theo thời gian, mờ dần về rìa
    float wave = 0.5 + 0.5 * sin(dist * 1.1 - uHoverTime * 5.0);
    infl *= mix(0.15, 1.0, wave);
  }
  vec2 away = dist > 1e-4 ? dCells / dist : vec2(0.0);
  vec3 tint = shadeAt(cellUv - away / grid * infl * uHoverWarp);

  float extent = (0.5 - uMosaicGap * 0.5) * (1.0 - uHoverShrink * infl);
  // intro: mỗi viên một ngưỡng (theo hàng + chút ngẫu nhiên), bung từ 0 lên đủ cỡ
  if (uIntro < 0.999) {
    float seed = fract(sin(dot(c, vec2(12.9898, 78.233))) * 43758.5453);
    float order = (c.y / max(grid.y, 1.0)) * 0.6 + seed * 0.4;
    float ik = clamp((uIntro * 1.35 - order) / 0.35, 0.0, 1.0);
    extent *= ik * ik * (3.0 - 2.0 * ik);
  }
  vec2 local = g - (c + 0.5);
  if (scatter > 0.5) {
    local -= away * clamp(uHoverPush * infl, 0.0, 1.0) * 0.9;
  } else {
    float room = 0.5 - extent;
    local -= clamp(away * room * uHoverPush * infl, -room, room);
  }
  float radius = uMosaicCorners * extent;
  vec2 corner = max(abs(local) - (extent - radius), 0.0);
  float brickDistance = length(corner) - radius;
  // khử răng cưa theo cỡ điểm ảnh (đơn vị ô / px) — không dùng fwidth vì hàm
  // này chạy trong vòng lặp / nhánh rẽ theo từng điểm ảnh
  float edgeAA = max(grid.x / max(uResolution.x, 1.0), 0.0008);
  float brick = 1.0 - smoothstep(-edgeAA, edgeAA, brickDistance);

  vec2 key = normalize(vec2(-0.7, 0.7));
  vec2 slope = local / max(extent, 0.001);
  float rim = smoothstep(0.25, 1.0, max(abs(slope.x), abs(slope.y)));
  float flatK = 1.0 - uHoverFlat * infl; // ("flat" là từ khoá GLSL)
  float relief = dot(normalize(slope + vec2(1e-5)), key) * rim * flatK;
  lit = tint * (1.0 + uMosaicBevel * relief) * (1.0 + uHoverGlow * infl);

  if (uMosaicStuds > 0.001) {
    float studRadius = uMosaicStuds * extent * 0.62;
    float studDistance = length(local) - studRadius;
    float stud = 1.0 - smoothstep(-edgeAA, edgeAA, studDistance);
    float studSlope = clamp(length(local) / max(studRadius, 0.001), 0.0, 1.0);
    float studRelief = dot(normalize(local + vec2(1e-5)), key) * studSlope * flatK;
    lit = mix(lit, tint * (1.0 + uMosaicBevel * (0.25 * flatK + studRelief)) * (1.0 + uHoverGlow * infl), stud);
  }
  return brick;
}

void main() {
  // uPad > 0: khung vẽ rộng hơn vùng một ô mỗi phía; uv ngoài [0, 1] là phần
  // nới ra — trong suốt, chỉ hiện những ô bị dạt tràn ra khỏi mép vùng.
  vec2 vu = vUv * (1.0 + 2.0 * uPad) - uPad;
  vec2 uv = vec2(vu.x, uFlip > 0.5 ? 1.0 - vu.y : vu.y);
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  float alpha = inside;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
  float angle = uPhase * TAU;
  vec3 color;
  float reveal = 0.0; // phần nền trắng lộ ra dưới ô khi rê chuột

  if (uMosaicOn > 0.5) {
    // Số hàng = số cột / tỉ lệ khung, làm tròn tới số GẦN NHẤT (giữ trọn hàng, không có
    // hàng cụt ở mép). Làm tròn xuống thì dải mỏng — vd 10.5:1, 40 cột = 3.8 hàng -> 3 —
    // ô bị kéo cao ~27%; làm tròn gần nhất (-> 4) ô lệch vuông tối đa nửa hàng.
    vec2 grid = vec2(uMosaicDetail, max(1.0, floor(uMosaicDetail / max(aspect, 0.001) + 0.5)));
    vec2 g = uv * grid; // toạ độ theo ô
    vec2 cell = floor(g);
    vec3 lit;
    float infl;
    float brick = brickAt(g, cell, grid, 0.0, lit, infl) * inside;
    float inflMax = infl * inside;
    // DẠT Ô (uHoverMode 2): ô không co, bị đẩy ra xa chuột tới gần 1 ô — có thể
    // trượt sang chỗ ô bên cạnh, nên điểm ảnh phải xét cả 8 ô quanh nó xem viên
    // nào đang đè lên mình. Chỉ làm ở gần chuột; ngoài đó đường nhanh ở trên.
    if (uHoverMode > 1.5 && uHover > 0.001) {
      float dc = length(((cell + 0.5) / grid - uMouse) * grid);
      if (dc < uHoverRadius + 2.0) {
        float best = -1.0;
        vec3 bestLit = vec3(0.0);
        float bestBrick = 0.0;
        for (int j = -1; j <= 1; j++) {
          for (int i = -1; i <= 1; i++) {
            vec2 nc = cell + vec2(float(i), float(j));
            // chỉ ô CÓ THẬT của vùng mới dạt được (không mọc ô ngoài mép)
            if (nc.x < 0.0 || nc.y < 0.0 || nc.x > grid.x - 1.0 || nc.y > grid.y - 1.0) continue;
            vec3 l;
            float f;
            float b = brickAt(g, nc, grid, 1.0, l, f);
            inflMax = max(inflMax, f);
            // phủ thật thắng viền khử răng cưa; cùng phủ thì viên gần chuột nằm trên
            float score = b * 10.0 + f;
            if (b > 0.001 && score > best) {
              best = score;
              bestLit = l;
              bestBrick = b;
            }
          }
        }
        lit = bestLit;
        brick = bestBrick;
      }
    }
    color = mix(rampColor(0.0) * 0.3, clamp(lit, 0.0, 1.0), brick);
    // intro: khe giữa các viên trong suốt tới gần cuối mới lấp nền
    if (uIntro < 0.999) alpha *= mix(brick, 1.0, smoothstep(0.85, 1.0, uIntro));
    // Khe trong vùng chuột: bão hoà nhanh (infl 0.15 đã trắng hẳn) để không còn
    // dải xám pha giữa khe tối và nền trắng ở rìa vùng ảnh hưởng.
    reveal = (1.0 - brick) * smoothstep(0.0, 0.15, inflMax) * inside;
    // ngoài vùng: chỉ có ô tràn ra, độ phủ = độ trong suốt
    if (inside < 0.5) {
      color = clamp(lit, 0.0, 1.0);
      alpha = brick;
    }
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
  // nền trắng đè SAU mọi bước chỉnh màu -> đúng màu hoverGapColor, phẳng tuyệt đối
  color = mix(color, uHoverGap, reveal);
  gl_FragColor = vec4(color * alpha, alpha); // premultiplied (canvas mặc định)
}`

  const UNIFORMS = [
    'uResolution', 'uPhase', 'uLineCount', 'uLineOffset', 'uLineOrder', 'uSoftness',
    'uMosaicOn', 'uMosaicDetail', 'uMosaicGap', 'uMosaicCorners', 'uMosaicBevel',
    'uMosaicStuds', 'uContrast', 'uSaturation', 'uVignette', 'uGrainAmount', 'uGrainSize',
  'uFlip', 'uMouse', 'uHover', 'uHoverRadius', 'uHoverShrink', 'uHoverPush', 'uHoverWarp', 'uHoverGlow', 'uHoverGap', 'uHoverFlat', 'uHoverMode', 'uHoverTime', 'uPad', 'uIntro',
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
    // Pha trộn premultiplied: phần nới ra (trong suốt) không xoá vùng bên cạnh,
    // ô tràn ra phủ lên trên. Trong vùng alpha = 1 nên như vẽ đè bình thường.
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
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
      draw(x, y, w, h, phase, o, pixelScale, flip, mouse = null, pad = 0) {
        const gy = canvas.height - y - h // WebGL đếm từ đáy
        gl.viewport(x - pad, gy - pad, w + 2 * pad, h + 2 * pad)
        gl.scissor(x - pad, gy - pad, w + 2 * pad, h + 2 * pad)
        gl.uniform2f(u.uPad, pad / w, pad / h)
        gl.uniform1f(u.uIntro, intro.v)
        gl.uniform1f(u.uFlip, flip ? 1 : 0)
        gl.uniform2f(u.uMouse, mouse ? mouse.x : -9, mouse ? mouse.y : -9)
        gl.uniform1f(u.uHover, mouse ? mouse.on : 0)
        gl.uniform1f(u.uHoverRadius, o.hoverRadius)
        gl.uniform1f(u.uHoverShrink, o.hoverShrink)
        gl.uniform1f(u.uHoverPush, o.hoverPush)
        gl.uniform1f(u.uHoverWarp, o.hoverWarp)
        gl.uniform1f(u.uHoverGlow, o.hoverGlow)
        gl.uniform3fv(u.uHoverGap, o.hoverGapRGB || hexToRgb(o.hoverGapColor))
        gl.uniform1f(u.uHoverFlat, o.hoverFlat)
        gl.uniform1f(u.uHoverMode, { ripple: 1, scatter: 2 }[o.hoverMode] || 0)
        gl.uniform1f(u.uHoverTime, ((performance.now() / 1000) * o.hoverRipple) % 1000)
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
  // Xuất hiện sau màn loading: chande-entrance.js đặt CHANDE_FIELD_INTRO = 0 (ẩn hết
  // gạch) rồi gọi playIntro(ms) khi loading xong -> intro.v chạy 0 -> 1.
  const intro = { v: window.CHANDE_FIELD_INTRO ?? 1, t0: 0, dur: 0 }
  function playIntro(ms = 1400) {
    intro.v = 0
    intro.t0 = performance.now()
    intro.dur = Math.max(1, ms)
  }
  function stepIntro(now) {
    if (!intro.dur) return
    intro.v = Math.min(1, (now - intro.t0) / intro.dur)
    if (intro.v >= 1) intro.dur = 0
  }
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
  // Vùng lẻ (canvas nằm trong chính nó): canvas nới ra `pad` px mỗi phía, tràn
  // khỏi phần tử (overflow: visible) để ô Dạt có chỗ tràn ra. Nhóm root (hero)
  // không cần — canvas của nó đã phủ cả root, rộng hơn các vùng.
  function padFor(g) {
    if (g.root.hasAttribute('data-field-root') || !matchMedia('(pointer: fine)').matches) return 0
    return Math.ceil(g.root.clientWidth / Math.max(1, regionOptions(g.root).tiles)) + 2
  }
  function measure(g) {
    const rr = g.root.getBoundingClientRect()
    const p = padFor(g)
    if (p !== g.pad) {
      g.pad = p
      Object.assign(g.canvas.style, p
        ? { inset: `-${p}px`, width: `calc(100% + ${2 * p}px)`, height: `calc(100% + ${2 * p}px)` }
        : { inset: '', width: '', height: '' })
      g.root.style.overflow = p ? 'visible' : ''
    }
    g.regions.forEach((rg) => {
      const r = rg.el.getBoundingClientRect()
      rg.x = r.left - rr.left + p
      rg.y = r.top - rr.top + p
      rg.w = r.width
      rg.h = r.height
    })
    g.cssW = g.root.clientWidth + 2 * p
    g.cssH = g.root.clientHeight + 2 * p
  }

  // Màu nền phía sau một vùng: background của phần tử cha gần nhất có nền đặc.
  // Bỏ qua chính phần tử .field (nền ảnh dự phòng). Chỉ đọc khi đang rê chuột,
  // mỗi khung — nền đang chuyển màu (hero sáng ↔ tối) thì khe đổi theo.
  function bgBehind(g, rg) {
    let el = (g.root.hasAttribute('data-field-root') ? rg.el : g.root).parentElement
    while (el) {
      const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)
      if (m && (m.length < 4 || +m[3] > 0.5)) return [m[0] / 255, m[1] / 255, m[2] / 255]
      el = el.parentElement
    }
    return null
  }

  function drawGroup(g) {
    if (!g.r) return
    // ngân sách điểm ảnh: màn rất lớn (5K, toàn màn hình) thì hạ độ phân giải canvas — ô gạch
    // mềm, nhìn không khác mà đỡ hẳn việc cho GPU
    const dpr = Math.min(devicePixelRatio || 1, CONFIG.maxDpr, Math.sqrt(3.2e6 / Math.max(1, g.cssW * g.cssH)))
    g.r.begin(Math.max(1, Math.round(g.cssW * dpr)), Math.max(1, Math.round(g.cssH * dpr)))
    // Vùng đang bị rê vẽ SAU CÙNG để ô tràn ra nằm trên vùng bên cạnh.
    const order = [...g.regions].sort((a, b) => (a.target ? 1 : 0) - (b.target ? 1 : 0))
    order.forEach((rg) => {
      if (rg.w < 1 || rg.h < 1) return
      // Vùng lẻ (canvas nới ra ngoài phần tử): làm tròn XUỐNG ở mép phải / dưới —
      // làm tròn lên thì điểm ảnh mép lấn qua mép thật, lộ ra thành vạch xanh ở
      // chỗ giáp khối bên cạnh (vd. footer: mảng xanh | panel tối).
      // Vùng trong root / canvas khít phần tử: vẽ TRÀN ra trọn điểm ảnh ở mọi mép (floor
      // / ceil). Canvas vẽ ở độ phân giải thấp hơn rồi phóng lên, điểm ảnh mép bị làm tròn
      // thiếu thì hơi trong -> nền kem / ảnh dự phòng lộ thành vạch sáng 1px (vd. đỉnh
      // thanh process ở hero). Phần tràn nằm DƯỚI khối kế bên (canvas là lớp dưới cùng).
      const inner = g.pad > 0
      const x = inner ? Math.round(rg.x * dpr) : Math.floor(rg.x * dpr)
      const y = inner ? Math.round(rg.y * dpr) : Math.floor(rg.y * dpr)
      const w = Math.min(g.canvas.width, inner ? Math.floor((rg.x + rg.w) * dpr) : Math.ceil((rg.x + rg.w) * dpr)) - x
      const h = Math.min(g.canvas.height, inner ? Math.floor((rg.y + rg.h) * dpr) : Math.ceil((rg.y + rg.h) * dpr)) - y
      const phase = (clock.phase + (+rg.el.dataset.fieldShift || 0)) % 1
      const o = regionOptions(rg.el)
      const mouse = easeMouse(rg)
      if (mouse && CONFIG.hoverGapAuto) o.hoverGapRGB = bgBehind(g, rg)
      // Dạt ô: nới khung vẽ thêm 1 ô mỗi phía (ô dạt tối đa 0.9 ô) cho tràn ra
      const pad = mouse && o.hoverMode === 'scatter' ? Math.ceil(w / Math.max(1, o.tiles)) + 2 : 0
      g.r.draw(x, y, w, h, phase, o, dpr, rg.el.dataset.fieldFlip === 'y', mouse, pad)
    })
  }

  // Chuột trên từng vùng: đích (target) do pointermove ghi, giá trị vẽ (m) đuổi
  // theo mỗi khung — bật/tắt và di chuyển đều mượt. Trả null khi đã tắt hẳn để
  // shader khỏi tính.
  function easeMouse(rg) {
    const t = rg.target
    if (!t || !CONFIG.hover) return null
    const m = (rg.m ||= { x: t.x, y: t.y, on: 0 })
    // hoverEase chỉnh theo nhịp 30 khung/giây; quy đổi theo thời gian thật của
    // khung này để đổi fps không làm chuột nhanh / chậm đi.
    const k = 1 - Math.pow(1 - Math.min(CONFIG.hoverEase, 0.999), frameScale)
    const kp = 1 - Math.pow(1 - Math.min(CONFIG.hoverEase * 1.6, 0.999), frameScale)
    m.x += (t.x - m.x) * kp
    m.y += (t.y - m.y) * kp
    m.on += (t.on - m.on) * k
    if (t.on === 0 && m.on < 0.003) {
      rg.m = null
      rg.target = null
      return null
    }
    return m
  }

  function onPointer(rg, e) {
    const r = rg.el.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    const yDom = (e.clientY - r.top) / r.height
    // shader: vUv.y đi từ ĐÁY; vùng lật dọc thì uv.y = 1 - vUv.y = yDom
    const y = rg.el.dataset.fieldFlip === 'y' ? yDom : 1 - yDom
    rg.target = { x, y, on: 1 }
    kick()
  }

  let frameScale = 1 // thời gian khung này / (1000/30 ms)
  function loop(t) {
    raf = 0
    let any = false
    if (t - last >= 1000 / CONFIG.fps - 1) {
      frameScale = last ? Math.min(4, (t - last) / (1000 / 30)) : 1
      last = t
      advance(t)
      stepIntro(t)
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
    if (!reduced.matches && matchMedia('(pointer: fine)').matches) {
      g.regions.forEach((rg) => {
        rg.onMove = (e) => onPointer(rg, e)
        rg.onLeave = () => {
          if (rg.target) rg.target.on = 0
          kick()
        }
        rg.el.addEventListener('pointermove', rg.onMove, { passive: true })
        rg.el.addEventListener('pointerleave', rg.onLeave)
      })
    }
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
      g.regions.forEach((rg) => {
        ro?.unobserve(rg.el)
        if (rg.onMove) rg.el.removeEventListener('pointermove', rg.onMove)
        if (rg.onLeave) rg.el.removeEventListener('pointerleave', rg.onLeave)
      })
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

  window.CHANDE_FIELD = { config: CONFIG, defaults: DEFAULTS, mount, destroy, refresh, park, release, applyHoverPreset, HOVER_PRESETS, playIntro }
})()
