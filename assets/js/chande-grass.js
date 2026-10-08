/* =============================================================================
 * CHANDE — Thảm cỏ 3D dưới lưới gallery (preset data-floor="grass-3d")
 * -----------------------------------------------------------------------------
 * Hàng chục nghìn lá cỏ (three.js InstancedMesh, shader riêng), kiểu cỏ vector:
 * lá to bản hình mũi giáo, chải cùng một hướng (CONFIG.comb), mỗi lá hai tông
 * sáng / tối hai bên gân, gốc đậm -> ngọn sáng, đung đưa nhẹ theo gió.
 * Hai kiểu (CONFIG.style, chọn ở bảng setting — chép cả bộ số từ PRESETS):
 *   • 'meadow' — đồng cỏ theo họ demo "grass-shader" của react-three-fiber:
 *     lá mảnh thon đều, mỗi lá cong ngẫu nhiên gốc -> ngọn, gió simplex noise
 *     lướt thành từng làn sóng, gốc rất tối -> ngọn xanh.
 *   • 'vector' — lá to bản mũi giáo, chải một hướng, hai tông hai bên gân.
 * Theo hướng "fluffiest grass" (Codrops 2025): fake AO gốc tối -> ngọn sáng,
 * hai màu ngọn pha theo nhiễu cho bãi cỏ có mảng, gió = sóng sin + nhiễu trôi,
 * vị trí nhân vật (vệt vịt) đưa vào shader để rẽ cỏ.
 * Vịt patin (chande-duck.js) lăn qua thì lá cỏ quanh vệt bị RẼ ra hai bên và
 * đè rạp, rồi dựng lại dần sau CONFIG.part.life giây.
 *
 * Cùng camera trực giao nghiêng với vịt (CHANDE_DUCK.config.tilt) để cỏ và vịt
 * nằm trên một mặt sàn. Hai canvas: lớp DƯỚI lưới ảnh (cả ruộng cỏ) và lớp TRÊN
 * ảnh chỉ gồm lá mọc sát mép trái / phải / dưới mỗi ảnh — lá ngả đè lên mép nên
 * ảnh như nằm lún trong cỏ (mép trên chừa ra để không che caption). Vị trí ảnh
 * tính lại trong shader từ thông số lưới của CHANDE_GALLERY.view(). Vịt ở canvas
 * riêng trên cùng. Lá cỏ gắn toạ độ thế giới gallery: kéo lưới thì cỏ
 * trôi theo; ruộng cỏ quấn vòng theo bề rộng màn nên không bao giờ hết.
 * Module — nạp three từ assets/vendor/three. Mount / gỡ theo Barba.
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

// Bộ số của từng kiểu cỏ. Đổi kiểu ở bảng setting = chép cả bộ vào CONFIG.
const PRESETS = {
  meadow: {
    density: 1 / 24,
    height: [20, 38],
    width: [2, 3.4],
    segments: 5,
    shape: 1, // 0 = lá mũi giáo, 1 = lá mảnh thon đều
    facing: 1, // 0 = mặt lá theo hướng ngả, 1 = xoay ngẫu nhiên
    twoTone: 0.15, // độ chênh hai nửa lá (vector = 1)
    bend: 0.75, // độ cong ngẫu nhiên từng lá
    wind: 1,
    comb: { angle: -40, lean: 0.12, spread: 0.35 },
    colors: {
      base: '#173b0b',
      mid: '#44921f',
      tip: '#8ccb45',
      tip2: '#b0d653',
      pressed: '#c0e08e',
      pile: '#10300a',
    },
    ground: '#1f4a12',
  },
  vector: {
    density: 1 / 70,
    height: [26, 40],
    width: [6, 10],
    segments: 6,
    shape: 0,
    facing: 0,
    twoTone: 1,
    bend: 0.18,
    wind: 0.6,
    comb: { angle: -40, lean: 0.95, spread: 0.35 },
    colors: {
      base: '#1c5209',
      mid: '#3f9a12',
      tip: '#9ad62c',
      tip2: '#c3e65a',
      pressed: '#c6ea7a',
      pile: '#164207',
    },
    ground: '#215c0b',
  },
}

const CONFIG = {
  style: 'meadow', // 'meadow' | 'vector' — xem PRESETS
  ...structuredClone(PRESETS.meadow),
  // density      lá cỏ trên mỗi px² màn
  // height/width px — chiều dài / bề ngang lá (khoảng ngẫu nhiên)
  // comb         hướng chải (độ, 0 = sang phải, âm = chếch lên), độ ngả chung, độ lệch
  // colors       gốc (khe tối) -> thân -> ngọn (2 màu pha theo mảng); cỏ bị đè / dồn
  // ground       nền dưới cỏ (lộ ra giữa các lá)
  part: {
    radius: 34, // px — bán kính rẽ cỏ quanh vệt vịt
    life: 7, // s — cỏ dựng lại hết sau bấy nhiêu
    points: 64, // số điểm vệt gửi vào shader
  },
  margin: 140, // px — ruộng cỏ rộng hơn màn chừng này mỗi phía (lá nghiêng ở mép)
  weave: { outside: 9, inside: 4, height: 0.55 }, // dải lá đan mép ảnh: ngoài mép / lấn vào trong (px), tỉ lệ chiều dài lá
}

// Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
window.CHANDE_SETTINGS_APPLY?.('grass', CONFIG)
const DEFAULTS = structuredClone(CONFIG)

const MAX_TRAIL = 64

const VERT = /* glsl */ `
uniform vec2 uView;     // độ dời lưới gallery
uniform vec2 uField;    // kích thước ruộng (px màn)
uniform vec2 uVP;       // kích thước màn
uniform float uSin;     // sin(góc nghiêng camera)
uniform float uTime;
uniform float uWind;
uniform vec4 uTrail[${MAX_TRAIL}]; // (x, y, sức, _) toạ độ thế giới gallery
uniform int uTrailN;
uniform float uRadius;
uniform vec3 uComb;     // (hướng chải x, z trên sàn, độ ngả)
uniform vec4 uStyle;    // (shape, facing, twoTone, bend)
uniform vec4 uTrailBox; // khung bao vệt vịt (+ bán kính) — lá ngoài khung bỏ qua vòng lặp
uniform float uFront;   // 1 = lớp trên ảnh: chỉ giữ lá sát mép ảnh
uniform vec4 uGrid;     // (cạnh ảnh S, cao caption, khoảng cột, khoảng hàng)
uniform vec2 uGrid2;    // (zig, rowShift)
uniform vec4 uGrid3;    // (kiểu đặt ảnh 0..4, jitter × S, xoay tối đa (độ), khe cụm × S)
uniform vec4 uGrid4;    // (warp × S, warpScale, sizeVar, holes)
uniform float uTiltWild;
uniform vec3 uWeave;    // (ngoài mép px, lấn vào trong px, tỉ lệ chiều dài lá)

attribute vec2 aPos;    // vị trí trong ruộng [0, uField)
attribute vec4 aShape;  // yaw, chiều cao, bề ngang, độ cong
attribute vec2 aBend;   // hướng cong tự nhiên
attribute float aTone;  // biến thiên màu

varying float vT;
varying float vTone;
varying float vPress;
varying float vLight;
varying float vPile;
varying float vPatch;
varying float vX;

// Băm 2 số -> [0,1) — hash12 của Dave Hoskins, y hệt hash() trong chande-gallery.js.
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Nhiễu giá trị mượt — y hệt vnoise() trong chande-gallery.js.
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

// Simplex noise 2D (Ashima Arts / Stefan Gustavson, MIT) — gió lướt thành sóng.
vec3 permute(vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

void main() {
  // Toạ độ màn của gốc lá: quấn vòng theo ruộng, căn giữa quanh màn.
  vec2 s = mod(aPos + uView, uField) - (uField - uVP) * 0.5;
  vec2 g = s - uView; // toạ độ thế giới gallery (để so với vệt vịt)

  if (uFront > 0.5) {
    // Ảnh gần nhất — chép đúng place() của chande-gallery.js (5 kiểu đặt ảnh,
    // xô lệch + xoay theo cùng hàm băm). Mọi kiểu có bước trung bình px × py
    // nên dò ±2 ô quanh ô ước lượng là đủ (cụm 2×2 cần ±2).
    float S = uGrid.x;
    float cap = uGrid.y;
    float px = uGrid.z;
    float py = uGrid.w;
    int L = int(uGrid3.x + 0.5);
    float best = 1e9;
    vec2 bestLocal = vec2(0.0);
    float r0 = floor((g.y - cap) / py);
    float c0 = floor(g.x / px);
    for (int dr = -2; dr <= 2; dr++) {
      float r = r0 + float(dr);
      for (int dc = -2; dc <= 2; dc++) {
        float c = c0 + float(dc);
        if (uGrid4.w > 0.0 && hash12(vec2(c + 91.0, r + 37.0)) < uGrid4.w) continue; // ô bỏ trống
        vec2 lo;
        if (L == 1 || L == 3) lo = vec2(c * px, r * py);
        else if (L == 2) lo = vec2(c * px + (mod(r, 2.0) > 0.5 ? px * 0.5 : 0.0), r * py);
        else if (L == 4) {
          float t = S * (1.0 + uGrid3.w);
          lo = vec2(floor(c / 2.0) * px * 2.0 + mod(c, 2.0) * t, floor(r / 2.0) * py * 2.0 + mod(r, 2.0) * (t + cap));
        } else lo = vec2(c * px + fract(r * uGrid2.y) * px, r * py + (mod(c, 2.0) > 0.5 ? S * uGrid2.x : 0.0));
        if (uGrid3.y > 0.0) lo += (vec2(hash12(vec2(c, r)), hash12(vec2(r + 17.0, c + 3.0))) - 0.5) * 2.0 * uGrid3.y;
        float ws = max(0.5, uGrid4.y);
        if (uGrid4.x > 0.0)
          lo += (vec2(vnoise(vec2(c, r) / ws), vnoise(vec2(c, r) / ws + vec2(31.7, 11.3))) - 0.5) * 2.0 * uGrid4.x;
        float rot = 0.0;
        if (uGrid3.z > 0.0) {
          rot = ((vnoise(vec2(c, r) / ws + vec2(7.1, 3.9)) - 0.5) + (hash12(vec2(c + 5.0, r + 11.0)) - 0.5)) * 2.0 * uGrid3.z;
          if (uTiltWild > 0.0 && hash12(vec2(c + 61.0, r + 7.0)) < uTiltWild) rot *= 2.5;
          rot = radians(rot);
        }
        float k = 1.0;
        if (uGrid4.z > 0.0) {
          float hk = hash12(vec2(c + 23.0, r + 41.0));
          k = 1.0 - uGrid4.z * 0.5 + uGrid4.z * 1.5 * hk * hk;
        }
        // Về hệ toạ độ của ảnh (tâm ảnh, bỏ xoay) rồi đo khoảng cách tới mép.
        vec2 d = g - (lo + vec2(S * 0.5, cap + S * 0.5));
        vec2 local = vec2(cos(rot) * d.x + sin(rot) * d.y, -sin(rot) * d.x + cos(rot) * d.y);
        local /= k; // ảnh phóng quanh tâm -> đưa về cỡ gốc
        vec2 q = abs(local) - S * 0.5;
        float sd = (length(max(q, 0.0)) + min(max(q.x, q.y), 0.0)) * k;
        if (sd < best) { best = sd; bestLocal = local; }
      }
    }
    // Giữ lá trong dải quanh mép, chỉ nửa dưới hai bên + mép dưới — lá ngả
    // chéo lên nên mọc cao hơn sẽ che caption phía trên ảnh.
    bool keep = best < uWeave.x && best > -uWeave.y && bestLocal.y > 0.0;
    if (!keep) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  }

  // Rẽ cỏ: lấy điểm vệt ảnh hưởng mạnh nhất.
  // press: lòng vệt (đè rạp); pile: vành ngay ngoài mép (lá bị dồn, chồng lên).
  float press = 0.0;
  float pile = 0.0;
  vec2 push = vec2(0.0);
  vec2 pushPile = vec2(0.0);
  bool nearTrail = g.x > uTrailBox.x && g.y > uTrailBox.y && g.x < uTrailBox.z && g.y < uTrailBox.w;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uTrailN || !nearTrail) break;
    vec4 p = uTrail[i];
    vec2 d = g - p.xy;
    float dist = length(d);
    vec2 dirAway = dist > 0.001 ? d / dist : vec2(1.0, 0.0);
    float k = (1.0 - smoothstep(uRadius * 0.45, uRadius, dist)) * p.z;
    if (k > press) {
      press = k;
      push = dirAway;
    }
    float r = (1.0 - abs(dist - uRadius * 1.15) / (uRadius * 0.45));
    float q = clamp(r, 0.0, 1.0) * p.z;
    if (q > pile) {
      pile = q;
      pushPile = dirAway;
    }
  }
  pile *= 1.0 - press;

  float t = position.y;           // 0 gốc .. 1 ngọn
  // facing = 1: lá xoay ngẫu nhiên cả vòng (đồng cỏ); 0: theo hướng ngả (vector).
  float yaw = aShape.x + uStyle.y * fract(aTone * 13.7) * 6.2832;
  float h = aShape.y * (uFront > 0.5 ? uWeave.z : 1.0);
  float w = aShape.z;

  // Gió: simplex noise trôi theo hướng chải -> từng làn sóng lướt qua ruộng,
  // cộng một sóng sin nhỏ cho lá rung đều.
  vec2 wp = g * 0.0035 - uComb.xy * uTime * 0.45;
  float gust = snoise(wp) * 0.75 + sin(uTime * 2.1 + g.x * 0.013 + g.y * 0.009) * 0.18;
  // Chải chung + cong ngẫu nhiên từng lá + gió.
  vec2 lean = uComb.xy * uComb.z * (0.75 + aShape.w * 0.5) + aBend * uStyle.w * (0.35 + aShape.w)
            + uComb.xy * gust * 0.3 * uWind;
  // Bị rẽ: ngả mạnh ra xa vệt (trục dọc màn -> chiều sâu sàn).
  lean += vec2(push.x, push.y / uSin) * press * 3.2;
  lean += vec2(pushPile.x, pushPile.y / uSin) * pile * 0.9;

  float bendT = t * t;
  float L = length(lean);
  // Lá giữ gần đúng chiều dài khi ngả: càng ngả càng thấp.
  float up = t * h / (1.0 + L * t * 0.9);
  // shape 0: lá mũi giáo (gốc hẹp, phình ~40%, nhọn ngọn); 1: lá mảnh thon đều.
  float leaf = (0.45 + 0.85 * sin(3.14159 * t * 0.85)) * (1.0 - pow(t, 3.0));
  float profile = mix(leaf, 1.0 - t, uStyle.x);
  float across = position.x * w * profile;
  // Mặt lá vuông góc hướng ngả (phơi bản rộng), xoay thêm theo yaw.
  vec2 ld = normalize(lean + vec2(0.0001));
  vec2 dir = mix(vec2(-ld.y, ld.x), vec2(1.0, 0.0), uStyle.y);
  dir = vec2(dir.x * cos(yaw) - dir.y * sin(yaw), dir.x * sin(yaw) + dir.y * cos(yaw));

  vec3 p;
  p.x = s.x - uVP.x * 0.5 + dir.x * across + lean.x * h * bendT * 0.8;
  p.z = (s.y - uVP.y * 0.5) / uSin + dir.y * across + lean.y * h * bendT * 0.8;
  p.y = up;

  vT = t;
  vTone = aTone;
  vPress = press;
  vX = position.x;
  vPile = pile;
  // Mảng đậm nhạt lớn của bãi cỏ (nhiễu thấp tần theo toạ độ thế giới).
  vPatch = 0.5 + 0.5 * (sin(g.x * 0.0047 + sin(g.y * 0.0031) * 2.1) * 0.6 + sin(g.y * 0.0058 - g.x * 0.0022) * 0.4);
  // Nắng từ trên-trái: lá quay mặt về phía nắng sáng hơn.
  vLight = 0.72 + 0.28 * abs(dot(vec2(-dir.y, dir.x), normalize(vec2(-0.6, -0.8))));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`

const FRAG = /* glsl */ `
uniform vec3 uBase;
uniform vec3 uMid;
uniform vec3 uTip;
uniform vec3 uTip2;
uniform vec3 uPressed;
uniform vec3 uPile;
varying float vPile;
varying float vPatch;
varying float vT;
varying float vTone;
varying float vPress;
varying float vLight;
varying float vX;
uniform float uTwoTone;
void main() {
  vec3 c = mix(uBase, uMid, smoothstep(0.0, 0.45, vT));
  // Hai màu ngọn pha theo nhiễu mảng lớn (Codrops: color variation).
  vec3 tip = mix(uTip, uTip2, smoothstep(0.35, 0.85, vPatch));
  c = mix(c, tip, smoothstep(0.45, 1.0, vT));
  // Hai tông kiểu vector: nửa lá bên này sáng hơn nửa bên kia (gân giữa).
  c *= vX > 0.0 ? mix(1.0, 1.12, uTwoTone) : mix(1.0, 0.86, uTwoTone);
  c *= mix(0.9, 1.08, fract(vTone * 7.31)) * mix(0.9, 1.06, vPatch);
  // Lá bị dồn ở mép vệt chồng lên nhau -> tối.
  c = mix(c, uPile, vPile * 0.55);
  // Lá bị đè rạp nằm phơi lưng lá -> sáng, nhạt hơn.
  c = mix(c, uPressed * mix(0.8, 1.0, vT), vPress * 0.7);
  gl_FragColor = vec4(c, 1.0);
}
`

function bladeGeometry(seg) {
  // Dải thon: mỗi đốt 2 đỉnh (trái/phải), ngọn 1 đỉnh. x ∈ [-.5, .5], y = t.
  const pos = []
  const idx = []
  for (let i = 0; i < seg; i++) {
    const t = i / seg
    pos.push(-0.5, t, 0, 0.5, t, 0)
  }
  pos.push(0, 1, 0)
  for (let i = 0; i < seg - 1; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const a = (seg - 1) * 2
  idx.push(a, a + 1, seg * 2)
  const g = new THREE.InstancedBufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  return g
}

let S = null

function mount(root = document) {
  const scope = root.querySelector ? root : document
  const stage = scope.querySelector('[data-gallery][data-floor="grass-3d"]')
  if (!stage) return
  destroy()

  const canvas = document.createElement('canvas')
  canvas.className = 'gal__grass'
  const world = stage.querySelector('[data-gallery-world]')
  stage.insertBefore(canvas, world || stage.firstChild)

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio))
  renderer.setClearColor(new THREE.Color(CONFIG.ground), 1)

  const tilt = ((window.CHANDE_DUCK?.config?.tilt ?? 58) * Math.PI) / 180
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000)
  cam.position.set(0, Math.sin(tilt) * 1000, Math.cos(tilt) * 1000)
  cam.lookAt(0, 0, 0)

  const trail = Array.from({ length: MAX_TRAIL }, () => new THREE.Vector4())
  const col = (h) => new THREE.Color(h)
  const material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.DoubleSide,
    uniforms: {
      uView: { value: new THREE.Vector2() },
      uField: { value: new THREE.Vector2(1, 1) },
      uVP: { value: new THREE.Vector2(1, 1) },
      uSin: { value: Math.sin(tilt) },
      uTime: { value: 0 },
      uWind: { value: CONFIG.wind },
      uTrail: { value: trail },
      uTrailN: { value: 0 },
      uRadius: { value: CONFIG.part.radius },
      uComb: { value: new THREE.Vector3() },
      uFront: { value: 0 },
      uStyle: { value: new THREE.Vector4() },
      uTwoTone: { value: 1 },
      uTrailBox: { value: new THREE.Vector4(1, 1, 0, 0) },
      uGrid: { value: new THREE.Vector4(1, 1, 1, 1) },
      uGrid2: { value: new THREE.Vector2() },
      uGrid3: { value: new THREE.Vector4() },
      uGrid4: { value: new THREE.Vector4() },
      uTiltWild: { value: 0 },
      uWeave: { value: new THREE.Vector3(CONFIG.weave.outside, CONFIG.weave.inside, CONFIG.weave.height) },
      uTip2: { value: col(CONFIG.colors.tip2) },
      uBase: { value: col(CONFIG.colors.base) },
      uMid: { value: col(CONFIG.colors.mid) },
      uTip: { value: col(CONFIG.colors.tip) },
      uPressed: { value: col(CONFIG.colors.pressed) },
      uPile: { value: col(CONFIG.colors.pile) },
    },
  })

  // Lớp trên ảnh: canvas trong suốt ngay sau lưới ảnh (dưới vịt), cùng ruộng cỏ.
  const canvas2 = document.createElement('canvas')
  canvas2.className = 'gal__grass'
  stage.insertBefore(canvas2, world ? world.nextSibling : null)
  const renderer2 = new THREE.WebGLRenderer({ canvas: canvas2, antialias: true, alpha: true })
  renderer2.setPixelRatio(Math.min(1.5, devicePixelRatio))
  const material2 = material.clone()
  material2.uniforms = THREE.UniformsUtils.clone(material.uniforms)
  material2.uniforms.uTrail.value = trail // dùng chung mảng vệt
  material2.uniforms.uFront.value = 1
  const scene2 = new THREE.Scene()

  const scene = new THREE.Scene()
  S = {
    stage,
    canvas,
    renderer,
    cam,
    scene,
    material,
    mesh: null,
    canvas2,
    renderer2,
    scene2,
    material2,
    mesh2: null,
    trail,
    vw: 0,
    vh: 0,
    raf: 0,
    onResize: null,
    rt: 0,
  }

  applyConfig()
  S.onResize = () => {
    clearTimeout(S.rt)
    S.rt = setTimeout(resize, 120)
  }
  addEventListener('resize', S.onResize)
  resize()
  S.raf = requestAnimationFrame(tick)
}

function destroy() {
  if (!S) return
  cancelAnimationFrame(S.raf)
  clearTimeout(S.rt)
  removeEventListener('resize', S.onResize)
  S.mesh?.geometry.dispose()
  S.material.dispose()
  S.material2.dispose()
  S.renderer.dispose()
  S.renderer2.dispose()
  S.canvas.remove()
  S.canvas2.remove()
  S = null
}

// Đổ CONFIG vào uniform của cả hai lớp + góc camera (lấy theo vịt).
function applyConfig() {
  const tilt = ((window.CHANDE_DUCK?.config?.tilt ?? 58) * Math.PI) / 180
  S.cam.position.set(0, Math.sin(tilt) * 1000, Math.cos(tilt) * 1000)
  S.cam.lookAt(0, 0, 0)
  S.renderer.setClearColor(new THREE.Color(CONFIG.ground), 1)
  // Hướng chải trên màn -> trên sàn (trục dọc màn co sin(tilt), màn lên = -Z).
  const ca = (CONFIG.comb.angle * Math.PI) / 180
  const cz = new THREE.Vector2(Math.cos(ca), Math.sin(ca) / Math.sin(tilt)).normalize()
  const C = CONFIG.colors
  for (const m of [S.material, S.material2]) {
    const u = m.uniforms
    u.uSin.value = Math.sin(tilt)
    u.uComb.value.set(cz.x, cz.y, CONFIG.comb.lean)
    u.uWind.value = CONFIG.wind
    u.uStyle.value.set(CONFIG.shape, CONFIG.facing, CONFIG.twoTone, CONFIG.bend)
    u.uTwoTone.value = CONFIG.twoTone
    u.uRadius.value = CONFIG.part.radius
    u.uWeave.value.set(CONFIG.weave.outside, CONFIG.weave.inside, CONFIG.weave.height)
    u.uBase.value.set(C.base)
    u.uMid.value.set(C.mid)
    u.uTip.value.set(C.tip)
    u.uTip2.value.set(C.tip2)
    u.uPressed.value.set(C.pressed)
    u.uPile.value.set(C.pile)
  }
}

// Dựng lại ruộng cỏ theo cỡ màn (số lá tỉ lệ với diện tích).
function resize() {
  if (!S) return
  const r = S.stage.getBoundingClientRect()
  S.vw = r.width
  S.vh = r.height
  for (const [rd, cv] of [
    [S.renderer, S.canvas],
    [S.renderer2, S.canvas2],
  ]) {
    rd.setSize(S.vw, S.vh, false)
    cv.style.width = S.vw + 'px'
    cv.style.height = S.vh + 'px'
  }
  const { cam } = S
  cam.left = -S.vw / 2
  cam.right = S.vw / 2
  cam.top = S.vh / 2
  cam.bottom = -S.vh / 2
  cam.updateProjectionMatrix()

  const fw = S.vw + CONFIG.margin * 2
  const fh = S.vh + CONFIG.margin * 2
  for (const m of [S.material, S.material2]) {
    m.uniforms.uField.value.set(fw, fh)
    m.uniforms.uVP.value.set(S.vw, S.vh)
  }

  // Máy cảm ứng (điện thoại / tablet) GPU yếu hơn -> bớt lá.
  const coarse = matchMedia('(pointer: coarse)').matches
  const n = Math.round(fw * fh * CONFIG.density * (coarse ? 0.6 : 1))
  if (S.mesh) {
    S.scene.remove(S.mesh)
    S.scene2.remove(S.mesh2)
    S.mesh.geometry.dispose()
  }
  const geo = bladeGeometry(CONFIG.segments)
  const aPos = new Float32Array(n * 2)
  const aShape = new Float32Array(n * 4)
  const aBend = new Float32Array(n * 2)
  const aTone = new Float32Array(n)
  const lerp = (a, b, t) => a + (b - a) * t
  for (let i = 0; i < n; i++) {
    aPos[i * 2] = Math.random() * fw
    aPos[i * 2 + 1] = Math.random() * fh
    aShape[i * 4] = (Math.random() - 0.5) * CONFIG.comb.spread * 2
    aShape[i * 4 + 1] = lerp(CONFIG.height[0], CONFIG.height[1], Math.random() ** 1.5)
    aShape[i * 4 + 2] = lerp(CONFIG.width[0], CONFIG.width[1], Math.random())
    aShape[i * 4 + 3] = lerp(0.15, 0.7, Math.random())
    const b = Math.random() * Math.PI * 2
    aBend[i * 2] = Math.cos(b)
    aBend[i * 2 + 1] = Math.sin(b)
    aTone[i] = Math.random()
  }
  geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(aPos, 2))
  geo.setAttribute('aShape', new THREE.InstancedBufferAttribute(aShape, 4))
  geo.setAttribute('aBend', new THREE.InstancedBufferAttribute(aBend, 2))
  geo.setAttribute('aTone', new THREE.InstancedBufferAttribute(aTone, 1))
  geo.instanceCount = n
  S.mesh = new THREE.Mesh(geo, S.material)
  S.mesh.frustumCulled = false
  S.scene.add(S.mesh)
  // Lớp trên dùng chung hình học (cùng lá), shader tự bỏ lá không sát mép ảnh.
  S.mesh2 = new THREE.Mesh(geo, S.material2)
  S.mesh2.frustumCulled = false
  S.scene2.add(S.mesh2)
}

function tick(now) {
  if (!S) return
  S.raf = requestAnimationFrame(tick)
  const view = window.CHANDE_GALLERY?.view?.()
  if (!view) return
  for (const m of [S.material, S.material2]) {
    m.uniforms.uView.value.set(view.x, view.y)
    m.uniforms.uTime.value = now / 1000
  }
  const u = S.material.uniforms
  const u2 = S.material2.uniforms
  u2.uGrid.value.set(view.S, view.cap, view.px, view.py)
  u2.uGrid2.value.set(view.zig, view.rowShift)
  u2.uGrid3.value.set(Math.max(0, view.layout), view.jitter * view.S, view.rotate, view.clusterGap)
  u2.uGrid4.value.set(view.warp * view.S, view.warpScale, view.sizeVar, view.holes)
  u2.uTiltWild.value = view.tiltWild

  // Vệt vịt: lấy đều tối đa MAX_TRAIL điểm, sức = phần đời còn lại (dựng dần).
  const marks = window.CHANDE_DUCK?.marks || []
  const life = CONFIG.part.life * 1000
  const live = marks.filter((m) => now - m.t < life)
  const n = Math.min(MAX_TRAIL, CONFIG.part.points, live.length)
  for (let i = 0; i < n; i++) {
    // Giữ điểm mới nhất (ngay dưới vịt), rải đều phần còn lại.
    const m = live[live.length - 1 - Math.floor((i * (live.length - 1)) / Math.max(1, n - 1))]
    const k = 1 - (now - m.t) / life
    S.trail[i].set(m.x, m.y, k * k * (3 - 2 * k), 0)
  }
  u.uTrailN.value = n
  u2.uTrailN.value = n
  // Khung bao vệt (+ bán kính): lá ngoài khung khỏi chạy vòng lặp rẽ cỏ.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const t = S.trail[i]
    x0 = Math.min(x0, t.x)
    y0 = Math.min(y0, t.y)
    x1 = Math.max(x1, t.x)
    y1 = Math.max(y1, t.y)
  }
  const R = CONFIG.part.radius * 1.8
  for (const m of [u, u2]) m.uTrailBox.value.set(x0 - R, y0 - R, x1 + R, y1 + R)

  S.renderer.render(S.scene, S.cam)
  S.renderer2.render(S.scene2, S.cam)
}

mount(document)

// Đổi preset sàn tại chỗ (nút chuyển của gallery).
document.addEventListener('chande-floor', (e) => {
  if (e.detail?.floor === 'grass-3d') S || mount(document)
  else destroy()
})

if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (S && data.current.container?.contains(S.stage)) destroy()
  })
}

// Bảng setting đổi thông số: nạp lại uniform + dựng lại ruộng (mật độ / cỡ lá).
function refresh() {
  if (!S) return
  applyConfig()
  resize()
}

// Chép cả bộ số của một kiểu cỏ vào CONFIG (bảng setting gọi khi đổi kiểu).
function applyPreset(name) {
  const p = PRESETS[name]
  if (!p) return
  CONFIG.style = name
  for (const [k, v] of Object.entries(structuredClone(p))) CONFIG[k] = v
  refresh()
}

window.CHANDE_GRASS = { config: CONFIG, defaults: DEFAULTS, presets: PRESETS, mount, destroy, refresh, applyPreset }
