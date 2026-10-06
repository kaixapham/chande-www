/**
 * Quản lý ảnh: nạp file, thu nhỏ trước khi lưu, sinh ảnh mẫu để tool chạy được ngay
 * lúc mở lần đầu. Ảnh lưu ở key riêng (PHOTO_KEY) để reset thiết lập không mất ảnh.
 */

import { getPhoto, putPhoto } from './store.js'

const MAX_EDGE = 1400   // cạnh dài tối đa khi lưu — đủ cho video 1080p

let seq = 0
const nextId = () => `p${Date.now().toString(36)}${(seq++).toString(36)}`

export function makePhoto(src, name) {
  return { id: nextId(), name: name || 'Ảnh', src, img: null, zoom: 1, fx: 0, fy: 0, placeholder: false }
}

export function loadImage(photo) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => { photo.img = img; resolve(photo) }
    img.onerror = () => reject(new Error(`Không đọc được ảnh ${photo.name}`))
    img.src = photo.src
  })
}

/** Đọc file người dùng thả vào, thu nhỏ về MAX_EDGE rồi trả về photo đã có img. */
export async function photoFromFile(file) {
  const raw = await new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(fr.result)
    fr.onerror = () => reject(new Error(`Không đọc được ${file.name}`))
    fr.readAsDataURL(file)
  })
  const img = await new Promise((resolve, reject) => {
    const node = new Image()
    node.onload = () => resolve(node)
    node.onerror = () => reject(new Error(`${file.name} không phải ảnh hợp lệ`))
    node.src = raw
  })

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
  let src = raw
  if (scale < 1) {
    const cv = document.createElement('canvas')
    cv.width = Math.round(img.naturalWidth * scale)
    cv.height = Math.round(img.naturalHeight * scale)
    const ctx = cv.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    src = cv.toDataURL('image/jpeg', 0.9)
  }

  const photo = makePhoto(src, file.name.replace(/\.[^.]+$/, ''))
  await loadImage(photo)
  return photo
}

/* --------------------------------------------------------------- ảnh mẫu */

const SAMPLES = [
  { name: 'Mẫu 01', bg: ['#C9793F', '#8A4A22'], skin: '#3A2418', cloth: '#2B2F44' },
  { name: 'Mẫu 02', bg: ['#3E5C8A', '#1D2C46'], skin: '#452B1C', cloth: '#D8D2C4' },
  { name: 'Mẫu 03', bg: ['#7C8A5A', '#3B4526'], skin: '#4A2E1E', cloth: '#B34B33' },
]

/** Vẽ chân dung giả bằng canvas — cố tình trông như hình minh hoạ, không giả làm ảnh thật. */
function drawSample(spec) {
  const W = 900
  const H = 1200
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')

  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, spec.bg[0])
  g.addColorStop(1, spec.bg[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = spec.cloth
  ctx.beginPath()
  ctx.moveTo(W * 0.08, H)
  ctx.bezierCurveTo(W * 0.14, H * 0.68, W * 0.34, H * 0.58, W * 0.5, H * 0.58)
  ctx.bezierCurveTo(W * 0.66, H * 0.58, W * 0.86, H * 0.68, W * 0.92, H)
  ctx.closePath()
  ctx.fill()

  ctx.fillStyle = spec.skin
  ctx.beginPath()
  ctx.ellipse(W * 0.5, H * 0.5, W * 0.075, H * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(W * 0.5, H * 0.36, W * 0.155, H * 0.135, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(255,255,255,0.82)'
  ctx.font = '500 30px Inter, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText(spec.name, W * 0.5, H * 0.95)

  return cv.toDataURL('image/jpeg', 0.9)
}

export async function makeSamplePhotos() {
  const out = []
  for (const spec of SAMPLES) {
    const photo = makePhoto(drawSample(spec), spec.name)
    photo.placeholder = true
    await loadImage(photo)
    out.push(photo)
  }
  return out
}

/* ------------------------------------------------------------ lưu / đọc */

/** Phần metadata của ảnh nằm cùng tab trong localStorage; ảnh thật nằm ở IndexedDB. */
export function photoRecord(photo) {
  return { id: photo.id, name: photo.name, zoom: photo.zoom, fx: photo.fx, fy: photo.fy }
}

/** Ghi dữ liệu ảnh vào kho. Ảnh mẫu không lưu. Ném lỗi ra để nơi gọi báo cho user. */
export async function storePhoto(photo) {
  if (photo.placeholder) return
  await putPhoto(photo.id, photo.src)
}

/**
 * Soát lại: ảnh nào đang có trong tab mà chưa nằm trong kho thì ghi bổ sung.
 * Một lần ghi hụt (kho bận, tab bị đóng giữa chừng) là ảnh mất sau khi reload, nên
 * kiểm lại rẻ hơn nhiều so với mất ảnh. Trả về số ảnh phải ghi vá và lỗi nếu có.
 */
export async function ensureStored(photos) {
  const report = { checked: 0, repaired: 0, failed: [] }
  for (const photo of photos) {
    if (photo.placeholder) continue
    report.checked++
    try {
      const existing = await getPhoto(photo.id)
      if (typeof existing === 'string' && existing.length) continue
      await putPhoto(photo.id, photo.src)
      report.repaired++
    } catch (err) {
      report.failed.push(photo.name)
    }
  }
  return report
}

/** Dựng lại danh sách ảnh của một tab từ metadata + kho. Ảnh nào mất thì bỏ qua. */
export async function loadPhotoRecords(records) {
  const out = []
  for (const row of records || []) {
    if (!row || !row.id) continue
    let src = null
    try { src = await getPhoto(row.id) } catch { src = null }
    if (typeof src !== 'string') continue
    const photo = makePhoto(src, row.name)
    photo.id = row.id
    photo.zoom = typeof row.zoom === 'number' ? row.zoom : 1
    photo.fx = typeof row.fx === 'number' ? row.fx : 0
    photo.fy = typeof row.fy === 'number' ? row.fy : 0
    try { await loadImage(photo); out.push(photo) } catch { /* ảnh hỏng thì bỏ */ }
  }
  return out
}
