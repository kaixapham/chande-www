/**
 * Xuất video bằng MediaRecorder trên canvas offscreen.
 *
 * Quay THEO THỜI GIAN THỰC (captureStream(fps) + rAF) chứ không đẩy frame thủ công:
 * MediaRecorder đóng dấu thời gian theo đồng hồ hệ thống, nên nếu render nhanh hơn
 * thực tế thì file ra sẽ bị tua nhanh. Đổi lại, quay 8s mất đúng 8s.
 */

import { sample } from './timeline.js'
import { drawScene } from './render.js'

const MIME_CANDIDATES = [
  ['video/mp4;codecs=avc1.42E01E', 'mp4'],
  ['video/mp4', 'mp4'],
  ['video/webm;codecs=vp9', 'webm'],
  ['video/webm;codecs=vp8', 'webm'],
  ['video/webm', 'webm'],
]

const QUALITY = { medium: 0.08, high: 0.15, max: 0.28 }

export function supportedFormats() {
  if (typeof MediaRecorder === 'undefined') return []
  const seen = new Set()
  const out = []
  for (const [mime, ext] of MIME_CANDIDATES) {
    if (seen.has(ext)) continue
    if (MediaRecorder.isTypeSupported(mime)) { out.push({ mime, ext }); seen.add(ext) }
  }
  return out
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2)

export function exportSize(state, ratio, width) {
  const [rw, rh] = ratio
  return { W: even(width), H: even((width * rh) / rw) }
}

/**
 * @returns {Promise<{blob: Blob, ext: string}>}
 */
export async function recordVideo({ state, photos, ratio, width, fps, quality, loops, format, onProgress, control }) {
  if (typeof MediaRecorder === 'undefined') throw new Error('Trình duyệt này không hỗ trợ MediaRecorder')

  const { W, H } = exportSize(state, ratio, width)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d', { alpha: false })
  ctx.imageSmoothingQuality = 'high'

  const draw = (t) => drawScene(ctx, W, H, sample(state, t, W, H, photos.length), photos, state)
  draw(0)

  const stream = cv.captureStream(fps)
  const bitrate = Math.round(W * H * fps * (QUALITY[quality] ?? QUALITY.high))
  const rec = new MediaRecorder(stream, { mimeType: format.mime, videoBitsPerSecond: bitrate })
  const chunks = []
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data) }

  const one = sample(state, 0, W, H, photos.length).T.total
  const total = one * Math.max(1, loops)

  rec.start(200)
  const t0 = performance.now()
  await new Promise((resolve) => {
    const tick = () => {
      if (control && control.cancelled) return resolve()
      const t = performance.now() - t0
      draw(Math.min(t, total - 0.001))
      if (onProgress) onProgress(Math.min(1, t / total))
      if (t >= total) resolve()
      else requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })

  await new Promise((resolve) => { rec.onstop = resolve; rec.stop() })
  stream.getTracks().forEach((track) => track.stop())

  if (control && control.cancelled) throw new Error('cancelled')
  return { blob: new Blob(chunks, { type: format.mime }), ext: format.ext }
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/** Ảnh tĩnh của đúng khung hình đang xem, ở độ phân giải xuất. */
export function snapshot({ state, photos, ratio, width, time }) {
  const { W, H } = exportSize(state, ratio, width)
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  drawScene(ctx, W, H, sample(state, time, W, H, photos.length), photos, state)
  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'))
}
