/**
 * Nhiều "bộ" làm việc song song. Mỗi tab giữ RIÊNG danh sách ảnh và thiết lập, nên đổi
 * màu hay đổi nhịp ở bộ này không đụng gì tới bộ kia.
 *
 * Chỉ metadata nằm ở localStorage (nhỏ, cần đọc ngay lúc dựng UI); dữ liệu ảnh nằm ở
 * IndexedDB qua `store.js`.
 */

import { STORE_KEY, PHOTO_KEY, createState, normalizeSettings } from './state.js'
import { putPhoto, collectGarbage } from './store.js'
import { photoRecord } from './photos.js'

export const TABS_KEY = 'profile-reveal:tabs'

let seq = 0
const nextId = () => `t${Date.now().toString(36)}${(seq++).toString(36)}`

export function makeTab(name) {
  return { id: nextId(), name, settings: createState(), photos: [], records: [], hydrated: false }
}

/** Tên mặc định cho tab mới: "Bộ n" với n là số nhỏ nhất chưa dùng. */
export function nextTabName(tabs) {
  const used = new Set(tabs.map((t) => t.name))
  for (let i = 1; ; i++) if (!used.has(`Bộ ${i}`)) return `Bộ ${i}`
}

function serialize(tabs, active) {
  return JSON.stringify({
    active,
    tabs: tabs.map((tab) => ({
      id: tab.id,
      name: tab.name,
      settings: tab.settings,
      // Tab chưa nạp ảnh thì giữ nguyên metadata cũ — đọc từ `tab.photos` rỗng sẽ
      // ghi đè thành danh sách trống và xoá sạch ảnh của tab đó.
      photos: tab.hydrated
        ? tab.photos.filter((p) => !p.placeholder).map(photoRecord)
        : tab.records,
    })),
  })
}

export function writeTabs(tabs, active) {
  try {
    localStorage.setItem(TABS_KEY, serialize(tabs, active))
  } catch { /* metadata rất nhỏ, đầy được thì chịu */ }
  // Chỉ dọn kho khi MỌI tab đã nạp xong ảnh. Tab chưa nạp thì mình không biết chắc nó
  // đang giữ những ảnh nào, dọn lúc đó là xoá nhầm.
  const allHydrated = tabs.every((tab) => tab.hydrated)
  const keep = tabs.flatMap((tab) => (tab.hydrated
    ? tab.photos.filter((p) => !p.placeholder).map((p) => p.id)
    : tab.records.map((r) => r.id)))
  collectGarbage(keep, allHydrated)
}

/** Đọc metadata tab. Trả về null nếu chưa có gì. */
export function readTabs() {
  let blob = null
  try {
    const raw = localStorage.getItem(TABS_KEY)
    if (raw) blob = JSON.parse(raw)
  } catch { blob = null }
  if (!blob || !Array.isArray(blob.tabs) || !blob.tabs.length) return null

  const tabs = blob.tabs
    .filter((t) => t && typeof t === 'object')
    .map((t, i) => ({
      id: t.id || nextId(),
      name: typeof t.name === 'string' && t.name.trim() ? t.name : `Bộ ${i + 1}`,
      settings: normalizeSettings(t.settings),
      photos: [],
      records: Array.isArray(t.photos) ? t.photos : [],
      hydrated: false,
    }))
  if (!tabs.length) return null
  const active = Math.min(Math.max(0, blob.active | 0), tabs.length - 1)
  return { tabs, active }
}

/**
 * Chuyển dữ liệu của bản một-bộ cũ (settings + ảnh dataURL trong localStorage) sang
 * cấu trúc tab. Chỉ xoá key cũ SAU KHI đã đọc lại được key mới — mất ảnh của user là
 * lỗi không sửa được.
 */
export async function migrateLegacy() {
  let settings = null
  let rows = null
  try {
    const rawSettings = localStorage.getItem(STORE_KEY)
    if (rawSettings) settings = JSON.parse(rawSettings)
    const rawPhotos = localStorage.getItem(PHOTO_KEY)
    if (rawPhotos) rows = JSON.parse(rawPhotos)
  } catch { /* hỏng thì coi như không có gì để chuyển */ }
  if (!settings && !(Array.isArray(rows) && rows.length)) return null

  const tab = makeTab('Bộ 1')
  if (settings) tab.settings = normalizeSettings(settings)
  if (Array.isArray(rows)) {
    for (const row of rows) {
      if (!row || typeof row.src !== 'string') continue
      const id = row.id || nextId()
      try { await putPhoto(id, row.src) } catch { continue }
      tab.records.push({
        id,
        name: row.name || 'Ảnh',
        zoom: typeof row.zoom === 'number' ? row.zoom : 1,
        fx: typeof row.fx === 'number' ? row.fx : 0,
        fy: typeof row.fy === 'number' ? row.fy : 0,
      })
    }
  }

  try {
    localStorage.setItem(TABS_KEY, JSON.stringify({
      active: 0,
      tabs: [{ id: tab.id, name: tab.name, settings: tab.settings, photos: tab.records }],
    }))
    const back = JSON.parse(localStorage.getItem(TABS_KEY))
    if (back && back.tabs && back.tabs[0].photos.length === tab.records.length) {
      localStorage.removeItem(STORE_KEY)
      localStorage.removeItem(PHOTO_KEY)
    }
  } catch { /* ghi không được thì giữ nguyên key cũ, lần sau chuyển lại */ }

  return { tabs: [tab], active: 0 }
}
