/**
 * Toàn bộ phần "khi nào cái gì ở đâu". Hàm thuần, không đụng DOM, nên render preview
 * và render lúc xuất video dùng chung một nguồn — video ra đúng bằng cái đang xem.
 *
 * Một chu kỳ = một lần đổi người:
 *   shape k khởi hành ở k*stagger, chạy `duration`, dừng `coverHold` đúng lúc phủ kín khung.
 *   Ảnh đổi ngay giữa quãng dừng của shape CUỐI (lúc đó khung chắc chắn bị che kín).
 *   Xong tất cả shape thì nghỉ `hold` rồi mới sang người tiếp theo.
 */

import { ratioOf, shapeColor } from './state.js'

const BASE = {
  linear: (t) => t,
  sine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  power2: (t) => t * t,
  power3: (t) => t * t * t,
  power4: (t) => t * t * t * t,
  expo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  circ: (t) => 1 - Math.sqrt(1 - t * t),
  back: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
}

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)

export const easeIn = (kind, t) => (BASE[kind] || BASE.power3)(clamp01(t))
export const easeOut = (kind, t) => 1 - (BASE[kind] || BASE.power3)(clamp01(1 - t))
export const easeInOut = (kind, t) => {
  const f = BASE[kind] || BASE.power3
  const x = clamp01(t)
  return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2
}

/**
 * Đường cong cuối cùng = họ (power3, back…) × chiều (in / out / in and out),
 * ghép lại đúng như danh sách của Figma. 'hold' là nhảy cóc, không nội suy.
 */
export function easeCurve(kind, mode, t) {
  const x = clamp01(t)
  if (mode === 'hold') return x >= 1 ? 1 : 0
  if (kind === 'linear') return x
  if (mode === 'in') return easeIn(kind, x)
  if (mode === 'out') return easeOut(kind, x)
  return easeInOut(kind, x)
}

const curveOf = (state, t) => easeCurve(state.motion.easing, state.motion.easeMode, t)

/**
 * Đoàn tàu của chế độ 'train'. Thứ tự toa, tất cả cùng ra từ góc vào:
 *   shape 1 → shape 2 → … → shape n → [ảnh người kế tiếp]
 * Toa ảnh đi CUỐI, nên nhịp vẫn là: ảnh đứng sạch → cả loạt shape quét qua →
 * ảnh kế tiếp hiện ra. Toa nào đi sau thì vẽ sau, lớp sau đè lên lớp trước.
 *
 * Đúng lúc shape đầu khớp khung (head = 0), mọi toa còn lại đang xếp lồng nhau ở
 * góc vào — phần lộ ra thu nhỏ theo cấp số nhân (gapFalloff), chính là bố cục mock.
 *
 * `cum[j]` là khoảng cách từ toa đầu tới toa j; `tail` = vị trí của toa ảnh.
 */
export function trainGaps(state, n) {
  const cum = [0]
  let gap = Math.max(0.05, state.motion.gap)
  const falloff = Math.min(1, Math.max(0.2, state.motion.gapFalloff))
  for (let j = 0; j < n; j++) {
    cum.push(cum[j] + Math.min(0.95, gap))
    gap *= falloff
  }
  // head chạy từ -1 (toa đầu còn ngoài khung) tới cum[n] (toa ảnh khớp khung).
  return { cum, tail: cum[n], span: 1 + cum[n] }
}

/** Mốc thời gian của cả timeline, tính bằng ms. */
export function timing(state, photoCount) {
  const speed = Math.max(0.05, state.timing.speed)
  const n = Math.max(1, Math.round(state.shapes.count))
  const dur = state.timing.duration / speed
  const lead = Math.max(0, state.timing.lead || 0) / speed
  const hold = Math.max(0, state.timing.hold) / speed
  const cycles = Math.max(1, photoCount)

  if (state.motion.flow === 'train') {
    const { cum, tail, span } = trainGaps(state, n)
    // Chuẩn hoá theo chase (một shape ở chase đi hết 2 quãng) để đổi số lớp
    // không làm lệch cảm giác tốc độ.
    const move = dur * span / 2
    // Chặng vào (head: -1 → 0, lúc cả đoàn ùa ra từ góc) và chặng ra (0 → tail, lúc
    // shape quét đi để lộ ảnh mới). Chia thời gian theo đúng quãng đường mỗi chặng.
    const legIn = move / span
    const legOut = move * tail / span
    const cover = Math.max(0, state.timing.coverHold) / speed
    const anim = legIn + cover + legOut
    const cycle = lead + anim + hold
    return {
      flow: 'train', n, dur, cover, shapeDur: anim, stagger: 0, cum, tail, span,
      legIn, legOut, anim, swapAt: legIn + cover / 2, lead, hold, cycle,
      cycles, total: cycle * cycles,
    }
  }

  const cover = Math.max(0, state.timing.coverHold) / speed
  const shapeDur = dur + cover
  const stagger = dur * Math.max(0, state.timing.stagger)
  const lastStart = (n - 1) * stagger
  const anim = lastStart + shapeDur
  const swapAt = lastStart + dur / 2 + cover / 2
  const cycle = lead + anim + hold
  return {
    flow: 'chase', n, dur, cover, shapeDur, stagger, anim, swapAt, lead, hold, cycle,
    cycles, total: cycle * cycles,
  }
}

/** Tiến độ 0→1 của một shape, có tính quãng dừng giữa đường. */
function travelProgress(state, T, local) {
  if (T.cover <= 0) return curveOf(state, local / T.dur)
  const half = T.dur / 2
  if (local <= half) return 0.5 * curveOf(state, local / half)
  if (local <= half + T.cover) return 0.5
  return 0.5 + 0.5 * curveOf(state, (local - half - T.cover) / half)
}

/** Quãng đường để một shape cỡ `scale` đi từ phủ kín tới ra hẳn ngoài khung. */
function legFor(dir, W, H, scale, travel) {
  const sw = W * scale
  const sh = H * scale
  const ax = Math.abs(dir.x)
  const ay = Math.abs(dir.y)
  const legX = ax > 1e-6 ? (W + sw) / 2 / ax : Infinity
  const legY = ay > 1e-6 ? (H + sh) / 2 / ay : Infinity
  return Math.min(legX, legY) * Math.max(0.2, travel)
}

/** Góc bay mặc định: đúng đường chéo khung, từ dưới-phải lên trên-trái. */
export function autoAngleFor(w, h) {
  return 180 - (Math.atan2(h, w) * 180) / Math.PI
}

function direction(state, W, H, flip) {
  const deg = (state.motion.autoAngle ? autoAngleFor(W, H) : state.motion.angle) + (flip ? 180 : 0)
  const rad = (deg * Math.PI) / 180
  return { x: Math.cos(rad), y: -Math.sin(rad) }
}

/**
 * Trạng thái đầy đủ của một khung hình tại thời điểm t (ms).
 * W, H là kích thước khung tính bằng px của canvas đích.
 */
export function sample(state, t, W, H, photoCount) {
  const T = timing(state, photoCount)
  const wrapped = ((t % T.total) + T.total) % T.total
  const cycleIndex = Math.min(T.cycles - 1, Math.floor(wrapped / T.cycle))
  const cycleLocal = wrapped - cycleIndex * T.cycle
  // `lead` là quãng đứng yên ở ĐẦU chu kỳ: animation chưa tính giờ, khung giữ nguyên
  // ảnh hiện tại. Trừ ra rồi mới đưa vào phần tính chuyển động.
  const local = Math.max(0, cycleLocal - T.lead)
  const count = Math.max(1, photoCount)
  const base = direction(state, W, H, false)
  const amount = state.timing.parallax * Math.hypot(W, H)
  const wrap = (i) => ((i % count) + count) % count

  // Toạ độ của layer là GÓC TRÊN-TRÁI, không phải tâm — chế độ đoàn tàu cần đặt khối
  // theo góc chứ không theo tâm, nên hai chế độ dùng chung một dạng dữ liệu.
  const shapeLayer = (k, at, dir, travel) => {
    const scale = Math.max(0.05, state.shapes.scale + k * state.shapes.scaleStep)
    const sw = W * scale
    const sh = H * scale
    const offset = at * legFor(dir, W, H, scale, travel)
    return {
      kind: 'shape',
      x: W / 2 + dir.x * offset - sw / 2,
      y: H / 2 + dir.y * offset - sh / 2,
      w: sw,
      h: sh,
      rot: state.motion.rotate * Math.max(-1, Math.min(1, at)),
      // radius lưu theo % cạnh ngắn nên preview và bản xuất 4K bo giống hệt nhau.
      radius: (state.shapes.radius / 100) * Math.min(sw, sh) / 2,
      color: shapeColor(state, k),
      index: k,
    }
  }

  /**
   * Khối góc của chế độ đoàn tàu: hình chữ nhật bám chặt góc XA của khung, góc gần
   * chạy vào theo `at`. Khi `at ≥ 0` khối trùm kín khung và ở lại như thế.
   *
   * Đây là điểm mấu chốt để không còn khe hở. Nếu trượt nguyên một hình đúng cỡ khung
   * theo đường chéo thì hai hình liền nhau luôn chừa lại HAI GÓC ĐỐI (trên-phải và
   * dưới-trái) — không lớp nào với tới, ảnh cũ lòi ra đúng hai chỗ đó.
   */
  const cornerBlock = (at, dir, radius) => {
    const leg = legFor(dir, W, H, 1, 1)
    const dx = dir.x * at * leg
    const dy = dir.y * at * leg
    let x0 = dx
    let x1 = W + dx
    if (dir.x <= 0) x1 = Math.max(x1, W)
    else x0 = Math.min(x0, 0)
    let y0 = dy
    let y1 = H + dy
    if (dir.y <= 0) y1 = Math.max(y1, H)
    else y0 = Math.min(y0, 0)
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, rot: 0, radius }
  }

  /* ------------------------- đoàn tàu: cả loạt shape ùa ra từ góc, toa ảnh đi cuối */
  if (T.flow === 'train') {
    // Chỉ cắt chuyển động làm hai chặng KHI thật sự có quãng giữ. Không có quãng giữ mà
    // vẫn cắt thì mỗi chặng tự ease riêng, đoàn giảm tốc về 0 ở head = 0 rồi mới tăng tốc
    // lại — nhìn ra thành một cú khựng giữa animation dù người dùng không đặt giữ giây nào.
    let head
    if (T.cover <= 0) {
      head = -1 + curveOf(state, local / T.anim) * T.span
    } else if (local <= T.legIn) {
      head = -1 + curveOf(state, local / T.legIn)
    } else if (local <= T.legIn + T.cover) {
      head = 0
    } else {
      head = curveOf(state, (local - T.legIn - T.cover) / T.legOut) * T.tail
    }

    const radius = (state.shapes.radius / 100) * Math.min(W, H) / 2
    const layers = []
    for (let k = 0; k < T.n; k++) {
      const at = head - T.cum[k]
      if (at <= -1) continue   // chưa vào khung; đã vào rồi thì KHÔNG bao giờ bỏ vẽ nữa
      layers.push({ kind: 'shape', ...cornerBlock(at, base, radius), color: shapeColor(state, k), index: k })
    }
    // Toa cuối cùng: ảnh của người kế tiếp. Vẽ sau tất cả nên luôn nằm trên, và vì cũng
    // là khối góc nên lúc `at = 0` nó trùm kín khung — khung sạch hoàn toàn.
    const carAt = head - T.tail
    if (carAt > -1) {
      layers.push({
        kind: 'photo',
        photo: wrap(cycleIndex + 1),
        ...cornerBlock(carAt, base, radius),
        fit: state.motion.carFit,
      })
    }

    return {
      T, cycleIndex, local, swapped: false,
      photo: wrap(cycleIndex),
      from: wrap(cycleIndex),
      // Ảnh nền bị đẩy nhẹ theo hướng bay suốt lượt, giống chế độ nối đuôi.
      drift: (() => {
        const d = amount * easeOut('power2', (head + 1) / T.span)
        return { x: base.x * d, y: base.y * d }
      })(),
      layers,
    }
  }

  /* ------------------------------------------------ nối đuôi: từng shape một */
  const swapped = local >= T.swapAt
  const photo = wrap(cycleIndex + (swapped ? 1 : 0))

  // Ảnh trôi nhẹ theo hướng bay: ảnh cũ bị đẩy đi, ảnh mới trờ tới rồi đứng lại.
  let drift
  if (!swapped) {
    drift = amount * easeOut('power2', T.swapAt > 0 ? local / T.swapAt : 1)
  } else {
    const tail = Math.max(1, T.anim - T.swapAt)
    drift = -amount * (1 - easeOut('power2', (local - T.swapAt) / tail))
  }

  const layers = []
  for (let k = 0; k < T.n; k++) {
    const elapsed = local - k * T.stagger
    if (elapsed < 0 || elapsed > T.shapeDur) continue
    const u = travelProgress(state, T, elapsed)
    const dir = direction(state, W, H, state.motion.alternate && k % 2 === 1)
    layers.push(shapeLayer(k, 2 * u - 1, dir, state.motion.travel))
  }

  // topFirst: shape đi trước nằm trên (giống mock của user) — vẽ ngược lại thứ tự.
  if (state.shapes.topFirst) layers.reverse()

  return {
    T, cycleIndex, local, swapped, photo, from: wrap(cycleIndex),
    drift: { x: base.x * drift, y: base.y * drift }, layers,
  }
}

/** Nhãn hiển thị cho thanh tua. */
export function formatMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`
}

export { ratioOf }
