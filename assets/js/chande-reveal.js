/* =============================================================================
 * CHANDE — Shape reveal (player của tools/profile-reveal)
 * -----------------------------------------------------------------------------
 * Đổi ảnh trong một khung bằng đoàn shape màu bay chéo từ góc dưới-phải lên
 * trên-trái; toa cuối của đoàn là ảnh mới. Công cụ chỉnh hiệu ứng nằm ở
 * tools/profile-reveal (Vite, port 3116) — file này chỉ PHÁT LẠI, chạy độc lập,
 * không cần build. Chỉnh ở tool xong thì chép số vào CONFIG dưới đây.
 *
 * Lõi chép từ tools/profile-reveal/src/timeline.js (kiểu chạy 'train'), giữ
 * nguyên ba điều đã trả giá mới có:
 *
 *   1. QUY TẮC BA NHỊP: ảnh đứng → shape ùa ra từ góc → ảnh kế tiếp hiện ra.
 *      Ảnh mới là toa CUỐI của đoàn, không phải toa đầu.
 *   2. KHỐI GÓC: mỗi lớp là hình chữ nhật bám chặt góc xa của khung, chỉ góc
 *      gần chạy vào (cornerBlock). Trượt nguyên một hình cỡ khung theo đường
 *      chéo thì hai lớp liền nhau luôn hở hai góc đối — phải xét cả hai trục.
 *   3. MỘT CHUYỂN ĐỘNG LIỀN MẠCH = MỘT ĐƯỜNG CONG. Chỉ tách chặng vào / ra khi
 *      coverHold > 0; tách lúc coverHold = 0 thì đoàn khựng lại giữa chừng.
 *
 * Toa ảnh luôn cập bến ở scale 1, nên lúc kết thúc khung khớp từng điểm ảnh
 * với ảnh thật — gỡ lớp phủ ra không thấy giật.
 *
 * API lúc chạy:
 *   window.CHANDE_REVEAL = {
 *     config, defaults, refresh(),
 *     timing() -> { anim, coverAt }          // ms
 *     play(box, { from, to, levels, delay }) -> { finished, cancel() }
 *     renderAt(canvas, t, { from, to, levels })  // vẽ đúng frame tại t ms
 *   }
 *   `from` / `to`: canvas hoặc ảnh đã nạp, cùng tỉ lệ với `box`. Lớp phủ là một
 *   canvas đặt absolute trong `box`, cỡ bằng `to`; xong thì tự gỡ.
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    // 5 lớp, đúng cấu trúc sáng / tối xen kẽ của mặc định profile-reveal,
    // đổi sang bảng màu của site (lime / kem / xanh rêu / lime nhạt / mực).
    colors: ['#68f12b', '#f4f3eb', '#236c3c', '#c4ff6b', '#182220'],
    gap: 0.1, // khoảng hở giữa hai lớp, theo quãng đường của một lớp
    gapFalloff: 1, // 1 = hở đều; < 1 = các lớp sau dồn sát dần
    easing: 'power3', // linear | sine | power2 | power3 | power4 | expo | circ | back
    easeMode: 'inOut', // in | out | inOut | hold
    speed: 0.25, // nhân tốc độ, giống ô "speed" của tool
    duration: 790, // ms gốc của một lớp (trước khi chia speed)
    coverHold: 0, // ms đoàn dừng lại lúc lớp đầu vừa phủ kín khung
    carFit: 'scale', // 'scale' = ảnh mới thu nhỏ vừa phần lộ ra | 'crop' = lộ dần đúng chỗ
    autoAngle: true, // true = bay đúng đường chéo của khung
    angle: 127, // độ, chỉ dùng khi autoAngle = false
    // Dither shape bằng Bayer 16×16 cùng số mức với ảnh của ô (data-levels),
    // để màu phẳng không lạc giữa các ảnh chân dung đã dither.
    dither: true,
  }

  const DEFAULTS = structuredClone(CONFIG)

  /* ------------------------------------------------------------ Easing --- */
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

  function curve(t) {
    const x = clamp01(t)
    const f = BASE[CONFIG.easing] || BASE.power3
    const mode = CONFIG.easeMode
    if (mode === 'hold') return x >= 1 ? 1 : 0
    if (CONFIG.easing === 'linear') return x
    if (mode === 'in') return f(x)
    if (mode === 'out') return 1 - f(1 - x)
    return x < 0.5 ? f(2 * x) / 2 : 1 - f(2 - 2 * x) / 2
  }

  /* ------------------------------------------------------------ Timing --- */
  // Đoàn tàu: shape 1 → … → shape n → [ảnh mới]. cum[j] = khoảng cách từ toa
  // đầu tới toa j; head chạy từ -1 (toa đầu còn ngoài khung) tới tail (toa ảnh
  // khớp khung).
  function timing() {
    const n = Math.max(1, CONFIG.colors.length)
    const speed = Math.max(0.05, CONFIG.speed)
    const dur = CONFIG.duration / speed
    const cum = [0]
    let gap = Math.max(0.05, CONFIG.gap)
    const falloff = Math.min(1, Math.max(0.2, CONFIG.gapFalloff))
    for (let j = 0; j < n; j++) {
      cum.push(cum[j] + Math.min(0.95, gap))
      gap *= falloff
    }
    const tail = cum[n]
    const span = 1 + tail
    // Chuẩn hoá như tool: đổi số lớp không làm lệch cảm giác tốc độ.
    const move = (dur * span) / 2
    const legIn = move / span
    const legOut = (move * tail) / span
    const cover = Math.max(0, CONFIG.coverHold) / speed
    const anim = legIn + cover + legOut
    const T = { n, cum, tail, span, legIn, legOut, cover, anim }
    T.coverAt = coverTime(T)
    return T
  }

  function headAt(T, local) {
    if (T.cover <= 0) return -1 + curve(local / T.anim) * T.span
    if (local <= T.legIn) return -1 + curve(local / T.legIn)
    if (local <= T.legIn + T.cover) return 0
    return curve((local - T.legIn - T.cover) / T.legOut) * T.tail
  }

  // Mốc lớp đầu vừa phủ kín khung (head = 0) — lúc đổi tên người là an toàn.
  function coverTime(T) {
    if (T.cover > 0) return T.legIn + T.cover / 2
    let lo = 0
    let hi = T.anim
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (headAt(T, mid) < 0) lo = mid
      else hi = mid
    }
    return hi
  }

  /* --------------------------------------------------------- Hình học --- */
  function direction(W, H) {
    const deg = CONFIG.autoAngle ? 180 - (Math.atan2(H, W) * 180) / Math.PI : CONFIG.angle
    const rad = (deg * Math.PI) / 180
    return { x: Math.cos(rad), y: -Math.sin(rad) }
  }

  // Quãng đường để một lớp cỡ khung đi từ phủ kín tới ra hẳn ngoài khung.
  function legFor(dir, W, H) {
    const ax = Math.abs(dir.x)
    const ay = Math.abs(dir.y)
    const lx = ax > 1e-6 ? W / ax : Infinity
    const ly = ay > 1e-6 ? H / ay : Infinity
    return Math.min(lx, ly)
  }

  // Khối góc: bám chặt góc XA, góc gần chạy vào theo `at`; at ≥ 0 là trùm kín.
  function cornerBlock(at, dir, W, H) {
    const leg = legFor(dir, W, H)
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
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
  }

  /* ------------------------------------------------------------ Dither --- */
  // Chép lại phép tính Bayer của chande-hero.js (thứ tự góc phần tư như shader
  // Figma) thay vì dùng chung — để file này bỏ đi hay giữ lại đều độc lập.
  const N = 16
  const BAYER = (() => {
    const build = (n) => {
      if (n === 1) return [[0]]
      const small = build(n / 2)
      const m = n / 2
      const out = []
      for (let y = 0; y < n; y++) {
        out[y] = []
        for (let x = 0; x < n; x++) {
          const qx = Math.floor(x / m)
          const qy = Math.floor(y / m)
          const q = qy === 0 && qx === 0 ? 0 : qy === 0 && qx === 1 ? 2 : qy === 1 && qx === 0 ? 3 : 1
          out[y][x] = small[y % m][x % m] * 4 + q
        }
      }
      return out
    }
    const m = build(N)
    const t = new Float32Array(N * N)
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) t[y * N + x] = (m[y][x] + 0.5) / (N * N)
    return t
  })()

  // Màu phẳng thì dither chỉ phụ thuộc (x mod N, y mod N): một tile N×N là đủ.
  const tiles = new Map()
  function tile(hex, levels) {
    const key = hex + '/' + levels
    if (tiles.has(key)) return tiles.get(key)
    const c = document.createElement('canvas')
    c.width = c.height = N
    const ctx = c.getContext('2d', { willReadFrequently: true })
    ctx.fillStyle = hex
    ctx.fillRect(0, 0, N, N)
    const img = ctx.getImageData(0, 0, N, N)
    const d = img.data
    const L = levels - 1
    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const off = (BAYER[p] - 0.5) / L
      for (let k = 0; k < 3; k++) {
        const v = Math.round((d[i + k] / 255 + off) * L) / L
        d[i + k] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255)
      }
    }
    ctx.putImageData(img, 0, 0)
    tiles.set(key, c)
    return c
  }

  /* -------------------------------------------------------------- Vẽ ---- */
  function sizeOf(src) {
    return [src.naturalWidth || src.width, src.naturalHeight || src.height]
  }

  function cover(src, W, H) {
    const [iw, ih] = sizeOf(src)
    const s = Math.max(W / iw, H / ih)
    return { w: iw * s, h: ih * s, x: (W - iw * s) / 2, y: (H - ih * s) / 2 }
  }

  function drawFrame(ctx, W, H, T, local, from, to, fills) {
    const head = headAt(T, local)
    const dir = direction(W, H)
    ctx.clearRect(0, 0, W, H)
    ctx.imageSmoothingEnabled = true
    if (from) {
      const b = cover(from, W, H)
      ctx.drawImage(from, b.x, b.y, b.w, b.h)
    }
    for (let k = 0; k < T.n; k++) {
      const at = head - T.cum[k]
      if (at <= -1) continue // chưa vào khung; đã vào thì không bao giờ bỏ vẽ nữa
      const r = cornerBlock(at, dir, W, H)
      ctx.fillStyle = fills[k]
      ctx.fillRect(r.x, r.y, r.w, r.h)
    }
    // Toa cuối: ảnh mới. Vẽ sau cùng nên nằm trên mọi lớp.
    const carAt = head - T.tail
    if (carAt <= -1 || !to) return
    const r = cornerBlock(carAt, dir, W, H)
    const left = Math.max(0, r.x)
    const top = Math.max(0, r.y)
    const vw = Math.min(W, r.x + r.w) - left
    const vh = Math.min(H, r.y + r.h) - top
    if (vw <= 0.5 || vh <= 0.5) return
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, vw, vh)
    ctx.clip()
    if (CONFIG.carFit === 'crop') {
      const b = cover(to, W, H)
      ctx.drawImage(to, b.x, b.y, b.w, b.h)
    } else {
      // Ảnh đã dither mà phóng / thu mượt thì hạt nhoè thành mảng xám —
      // lấy mẫu điểm gần nhất cho hạt vẫn sắc trong lúc toa lớn dần.
      ctx.imageSmoothingEnabled = false
      const b = cover(to, vw, vh)
      ctx.drawImage(to, left + b.x, top + b.y, b.w, b.h)
    }
    ctx.restore()
  }

  /* ------------------------------------------------------------- Play ---- */
  function play(box, { from = null, to, levels = 4, delay = 0 } = {}) {
    const T = timing()
    const [W, H] = to ? sizeOf(to) : [box.clientWidth, box.clientHeight]
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    canvas.setAttribute('aria-hidden', 'true')
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
    const ctx = canvas.getContext('2d')
    const fills = CONFIG.colors.map((hex) =>
      CONFIG.dither && levels >= 2 ? ctx.createPattern(tile(hex, levels), 'repeat') : hex,
    )

    let raf = 0
    let done = false
    let resolve
    let reject
    const finished = new Promise((res, rej) => {
      resolve = res
      reject = rej
    })

    // Đồng hồ cộng dồn từng frame, mỗi bước tối đa 100ms: tab bị ẩn thì rAF
    // dừng và hiệu ứng dừng theo, quay lại chạy tiếp chứ không nhảy cóc tới cuối.
    let elapsed = -Math.max(0, delay)
    let last = performance.now()
    const tick = (now) => {
      if (done) return
      elapsed += Math.min(100, now - last)
      last = now
      if (elapsed >= 0 && !canvas.isConnected) box.append(canvas)
      if (elapsed >= 0) drawFrame(ctx, W, H, T, Math.min(elapsed, T.anim), from, to, fills)
      if (elapsed >= T.anim) {
        done = true
        resolve()
        // Gỡ ở frame sau, khi người gọi đã kịp đặt ảnh thật vào chỗ.
        requestAnimationFrame(() => canvas.remove())
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    return {
      finished,
      canvas,
      timing: T,
      cancel() {
        if (done) return
        done = true
        cancelAnimationFrame(raf)
        canvas.remove()
        reject(new DOMException('Đã huỷ', 'AbortError'))
      },
    }
  }

  // Vẽ đúng khung hình tại mốc `t` (ms) lên một canvas có sẵn — để tua / kiểm
  // khe hở theo từng frame mà không phụ thuộc nhịp rAF.
  function renderAt(canvas, t, { from = null, to, levels = 4 } = {}) {
    const ctx = canvas.getContext('2d')
    const fills = CONFIG.colors.map((hex) =>
      CONFIG.dither && levels >= 2 ? ctx.createPattern(tile(hex, levels), 'repeat') : hex,
    )
    const T = timing()
    drawFrame(ctx, canvas.width, canvas.height, T, Math.max(0, Math.min(t, T.anim)), from, to, fills)
    return canvas
  }

  window.CHANDE_REVEAL = {
    config: CONFIG,
    defaults: DEFAULTS,
    refresh() {}, // không có gì phải dựng lại: mọi lượt play đọc CONFIG mới
    timing,
    play,
    renderAt,
  }
})()
