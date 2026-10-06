/**
 * Nguồn duy nhất của mọi thiết lập. MẶC ĐỊNH NẰM Ở ĐÂY, không ở localStorage —
 * muốn đổi mặc định thì sửa DEFAULTS rồi verify bằng cách xoá đúng key dưới đây.
 */

export const STORE_KEY = 'profile-reveal:settings'
export const PHOTO_KEY = 'profile-reveal:photos'

/** Bảng màu gợi ý — 2 màu đầu lấy từ mock của user (xanh cốm + kem). */
export const PALETTE = ['#8FE04E', '#F0EBE1', '#054D00', '#C4FF6B', '#021F00', '#E9713A']

export const RATIOS = {
  // Đo từ ảnh user gửi: 232×271 → 0.8561, đúng bằng 6:7 (0.8571) trong sai số 0.13%.
  '6:7': [6, 7],
  '1:1': [1, 1],
  '3:4': [3, 4],
  '4:5': [4, 5],
  '9:16': [9, 16],
  '16:9': [16, 9],
}

/** Họ đường cong. Ghép với EASE_MODES ra đúng danh sách của Figma (Ease out back…). */
export const EASINGS = [
  ['linear', 'Linear'],
  ['sine', 'Sine — rất nhẹ'],
  ['power2', 'Power2 — mềm'],
  ['power3', 'Power3 — mặc định'],
  ['power4', 'Power4 — dứt khoát'],
  ['expo', 'Expo — bắn rất nhanh'],
  ['circ', 'Circ — tròn đều'],
  ['back', 'Back — vượt rồi lùi'],
]

export const EASE_MODES = [
  ['hold', 'Hold — nhảy cóc'],
  ['in', 'Ease in — nhanh dần'],
  ['out', 'Ease out — chậm dần'],
  ['inOut', 'Ease in and out'],
]

export const DEFAULTS = {
  frame: { ratio: '6:7', cw: 4, ch: 5, bg: '#0E0E0E' },
  shapes: {
    count: 5,
    colors: ['#8FE04E', '#F0EBE1', '#054D00', '#C4FF6B', '#021F00'],
    opacity: 1,
    radius: 0,
    scale: 1,          // chỉ dùng ở kiểu nối đuôi
    scaleStep: 0,      // chỉ dùng ở kiểu nối đuôi
    topFirst: false,
  },
  motion: {
    preset: 'custom',     // mặc định là bộ user tự chỉnh, không trùng preset nào
    flow: 'train',        // 'chase' = nối đuôi từng shape | 'train' = cả loạt ùa ra từ góc
    autoAngle: true,
    angle: 127,
    easing: 'power3',
    easeMode: 'inOut',
    rotate: 0,            // chỉ dùng ở kiểu nối đuôi
    travel: 1,            // chỉ dùng ở kiểu nối đuôi
    alternate: false,
    gap: 0.1,             // train: khoảng hở giữa hai lớp, tính theo quãng đường của một lớp
    gapFalloff: 1,        // train: 1 = các lớp hở đều nhau; <1 = dồn dần về sau
    carFit: 'scale',      // train: ảnh mới thu nhỏ vừa ô ('scale') hay lộ dần góc ('crop')
  },
  timing: {
    speed: 0.25,
    duration: 790,
    stagger: 0.45,     // chỉ dùng ở kiểu nối đuôi
    coverHold: 0,
    lead: 0,           // đứng yên bao lâu TRƯỚC khi shape bắt đầu chạy
    hold: 1150,
    parallax: 0,
  },
  output: { width: 1080, fps: 30, quality: 'high', loops: 1 },
}

/**
 * Preset chỉ ghi đè phần `motion` + vài nhịp đặc trưng. Mỗi preset là một cách
 * shape băng qua khung, không đụng tới màu hay tỉ lệ người dùng đã chọn.
 */
export const PRESETS = {
  diagonal: {
    label: 'Chéo góc — mặc định',
    motion: { flow: 'chase', autoAngle: true, easing: 'power3', easeMode: 'inOut', rotate: 0, travel: 1, alternate: false },
    timing: { stagger: 0.45, coverHold: 120 },
    shapes: { scaleStep: 0, radius: 0, topFirst: true },
  },
  horizontal: {
    label: 'Trượt ngang',
    motion: { flow: 'chase', autoAngle: false, angle: 180, easing: 'power4', easeMode: 'inOut', rotate: 0, travel: 1, alternate: false },
    timing: { stagger: 0.4, coverHold: 90 },
    shapes: { scaleStep: 0, radius: 0, topFirst: true },
  },
  vertical: {
    label: 'Trượt dọc',
    motion: { flow: 'chase', autoAngle: false, angle: 90, easing: 'expo', easeMode: 'inOut', rotate: 0, travel: 1, alternate: false },
    timing: { stagger: 0.4, coverHold: 90 },
    shapes: { scaleStep: 0, radius: 0, topFirst: true },
  },
  alternate: {
    label: 'Đảo chiều xen kẽ',
    motion: { flow: 'chase', autoAngle: true, easing: 'power3', easeMode: 'inOut', rotate: 0, travel: 1, alternate: true },
    timing: { stagger: 0.55, coverHold: 140 },
    shapes: { scaleStep: 0, radius: 0, topFirst: true },
  },
  tilt: {
    label: 'Nghiêng xoay',
    motion: { flow: 'chase', autoAngle: true, easing: 'back', easeMode: 'out', rotate: 7, travel: 1.15, alternate: false },
    timing: { stagger: 0.5, coverHold: 160 },
    shapes: { scaleStep: 0, radius: 10, topFirst: true },
  },
  deck: {
    label: 'Xếp tầng',
    motion: { flow: 'chase', autoAngle: true, easing: 'power2', easeMode: 'inOut', rotate: 0, travel: 1, alternate: false },
    timing: { stagger: 0.62, coverHold: 200 },
    shapes: { scaleStep: 0.14, radius: 0, topFirst: true },
  },
  train: {
    label: 'Đồng loạt xếp lớp',
    motion: {
      flow: 'train', autoAngle: true, easing: 'power3', easeMode: 'inOut',
      rotate: 0, travel: 1, alternate: false, gap: 0.42, gapFalloff: 0.55, carFit: 'scale',
    },
    timing: { stagger: 0.45, coverHold: 420 },
    shapes: { scaleStep: 0, radius: 0, topFirst: false },
  },
  custom: { label: 'Tuỳ chỉnh', motion: {}, timing: {}, shapes: {} },
}

const clone = (v) => JSON.parse(JSON.stringify(v))

export function createState() {
  return clone(DEFAULTS)
}

/** Gộp nông theo từng nhóm — bỏ qua khoá lạ để state cũ trong storage không phá schema mới. */
function merge(base, patch) {
  if (!patch || typeof patch !== 'object') return base
  for (const group of Object.keys(base)) {
    const src = patch[group]
    if (!src || typeof src !== 'object') continue
    for (const key of Object.keys(base[group])) {
      if (src[key] === undefined) continue
      if (Array.isArray(base[group][key])) {
        if (Array.isArray(src[key])) base[group][key] = src[key].slice()
      } else if (typeof base[group][key] === typeof src[key]) {
        base[group][key] = src[key]
      }
    }
  }
  return base
}

/**
 * Dựng thiết lập đầy đủ từ một bản lưu bất kỳ: bắt đầu từ DEFAULTS rồi phủ giá trị đã lưu
 * lên. Bản lưu cũ thiếu khoá mới thì tự nhận giá trị mặc định — thiếu bước này là thêm
 * setting nào cũng làm tab cũ chạy với `undefined`.
 */
export function normalizeSettings(patch) {
  return merge(createState(), patch)
}

/** Áp preset lên state tại chỗ. */
export function applyPreset(state, key) {
  const preset = PRESETS[key]
  if (!preset) return
  state.motion.preset = key
  if (key === 'custom') return
  Object.assign(state.motion, preset.motion)
  Object.assign(state.timing, preset.timing)
  Object.assign(state.shapes, preset.shapes)
}

/** Trả về [w, h] của tỉ lệ đang chọn. */
export function ratioOf(state) {
  if (state.frame.ratio === 'custom') {
    return [Math.max(1, state.frame.cw), Math.max(1, state.frame.ch)]
  }
  return RATIOS[state.frame.ratio] || RATIOS['3:4']
}

/** Màu của shape thứ k, tự lặp lại nếu người dùng bớt màu. */
export function shapeColor(state, k) {
  const colors = state.shapes.colors
  if (!colors.length) return PALETTE[k % PALETTE.length]
  return colors[k] || PALETTE[k % PALETTE.length]
}

/** Đồng bộ mảng màu khi đổi số lượng shape — giữ nguyên màu người dùng đã chỉnh. */
export function syncColors(state) {
  const colors = state.shapes.colors
  while (colors.length < state.shapes.count) colors.push(PALETTE[colors.length % PALETTE.length])
  colors.length = Math.max(colors.length, state.shapes.count)
}
