/**
 * Vẽ một khung hình. Dùng chung cho canvas preview và canvas offscreen lúc xuất video,
 * nên mọi kích thước đều suy từ (W, H) truyền vào chứ không đọc DOM.
 */

function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2))
  if (ctx.roundRect) {
    ctx.beginPath()
    ctx.roundRect(x, y, w, h, radius)
    return
  }
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

/** Phủ kín khung theo kiểu object-fit: cover, có zoom và điểm nhìn riêng từng ảnh. */
export function coverRect(img, W, H, zoom = 1, fx = 0, fy = 0) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  const s = Math.max(W / iw, H / ih) * Math.max(0.1, zoom)
  const w = iw * s
  const h = ih * s
  return { x: (W - w) / 2 + (fx * (w - W)) / 2, y: (H - h) / 2 + (fy * (h - H)) / 2, w, h }
}

export function drawScene(ctx, W, H, frame, photos, state) {
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = state.frame.bg
  ctx.fillRect(0, 0, W, H)

  const photo = photos[frame.photo]
  if (photo && photo.img) {
    // Ảnh nền bị parallax đẩy đi, nên phải phủ dư đúng bằng quãng đẩy — không thì hở
    // một sọc nền ở mép đối diện, đúng bằng số pixel đã đẩy.
    const px = Math.abs(frame.drift.x)
    const py = Math.abs(frame.drift.y)
    const box = coverRect(photo.img, W + 2 * px, H + 2 * py, photo.zoom, photo.fx, photo.fy)
    ctx.drawImage(
      photo.img,
      box.x - px + frame.drift.x,
      box.y - py + frame.drift.y,
      box.w,
      box.h,
    )
  }

  for (const layer of frame.layers) {
    if (layer.kind === 'photo') drawPhotoCar(ctx, W, H, layer, photos, state)
    else drawShape(ctx, layer, state)
  }
  ctx.restore()
}

/** x, y của layer là góc trên-trái; xoay thì xoay quanh tâm của chính nó. */
function drawShape(ctx, shape, state) {
  ctx.save()
  ctx.globalAlpha = state.shapes.opacity
  ctx.translate(shape.x + shape.w / 2, shape.y + shape.h / 2)
  if (shape.rot) ctx.rotate((shape.rot * Math.PI) / 180)
  ctx.fillStyle = shape.color
  roundRectPath(ctx, -shape.w / 2, -shape.h / 2, shape.w, shape.h, shape.radius)
  ctx.fill()
  ctx.restore()
}

/**
 * Toa ảnh của băng chuyền. Chỉ vẽ đúng phần đang lọt vào khung — cắt trước rồi mới
 * vẽ, nên ảnh không bao giờ tràn ra ngoài mép của toa.
 */
function drawPhotoCar(ctx, W, H, car, photos, state) {
  const photo = photos[car.photo]
  if (!photo || !photo.img) return

  const left = Math.max(0, car.x)
  const top = Math.max(0, car.y)
  const vw = Math.min(W, car.x + car.w) - left
  const vh = Math.min(H, car.y + car.h) - top
  if (vw <= 0.5 || vh <= 0.5) return

  ctx.save()
  roundRectPath(ctx, left, top, vw, vh, Math.min(car.radius, Math.min(vw, vh) / 2))
  ctx.clip()
  ctx.fillStyle = state.frame.bg
  ctx.fillRect(left, top, vw, vh)

  if (car.fit === 'scale') {
    // Cả tấm ảnh thu nhỏ vừa đúng phần đang lộ ra, rồi lớn dần tới khi đầy khung.
    const box = coverRect(photo.img, vw, vh, photo.zoom, photo.fx, photo.fy)
    ctx.drawImage(photo.img, left + box.x, top + box.y, box.w, box.h)
  } else {
    // Ảnh nằm sẵn ở vị trí cuối, toa chỉ là ô cửa mở rộng dần ra.
    // Ảnh nằm sẵn ở đúng khung đích, khối góc chỉ là ô cửa mở rộng dần ra.
    const box = coverRect(photo.img, W, H, photo.zoom, photo.fx, photo.fy)
    ctx.drawImage(photo.img, box.x, box.y, box.w, box.h)
  }
  ctx.restore()
}
