/**
 * Kho ảnh trong IndexedDB.
 *
 * Trước đây ảnh nằm trong localStorage, nhưng từ lúc có nhiều tab thì không đủ chỗ:
 * mỗi ảnh ~0.8MB, hai ảnh một bộ, mà localStorage chỉ khoảng 5MB cho cả origin —
 * ba bộ là vỡ. IndexedDB rộng hơn hàng trăm lần và vẫn đồng bộ được bằng await.
 *
 * Chỉ dữ liệu ảnh nằm ở đây; danh sách tab, tên, thứ tự và thiết lập vẫn ở localStorage
 * vì chúng nhỏ và cần đọc ngay lúc dựng UI.
 */

const DB_NAME = 'profile-reveal'
const STORE = 'photos'
let opening = null

function open() {
  if (opening) return opening
  opening = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error || new Error('Không mở được kho ảnh'))
  })
  return opening
}

function run(mode, fn) {
  return open().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const req = fn(tx.objectStore(STORE))
    tx.oncomplete = () => resolve(req ? req.result : undefined)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const putPhoto = (id, src) => run('readwrite', (s) => s.put(src, id))
export const getPhoto = (id) => run('readonly', (s) => s.get(id))
export const deletePhoto = (id) => run('readwrite', (s) => s.delete(id))
export const listPhotoIds = () => run('readonly', (s) => s.getAllKeys())

/**
 * Xoá những ảnh không còn tab nào trỏ tới.
 *
 * `safe` là chốt an toàn BẮT BUỘC: chỉ dọn khi người gọi khẳng định đã biết chắc toàn bộ
 * ảnh đang được tham chiếu. Đã có lần danh sách giữ lại bị rỗng oan (tab chưa nạp ảnh
 * nên serialize ra mảng trống) và hàm này xoá sạch kho — mất ảnh user đã import.
 * Ảnh mồ côi chỉ tốn chỗ, xoá nhầm thì không lấy lại được: nghi ngờ thì KHÔNG xoá.
 */
export async function collectGarbage(keepIds, safe) {
  if (!safe) return
  try {
    const ids = await listPhotoIds()
    if (!ids.length) return
    const keep = new Set(keepIds)
    // Kho có ảnh mà danh sách giữ lại rỗng thì gần như chắc chắn là lỗi, không phải
    // ý người dùng — dừng lại, để lại ảnh mồ côi còn hơn xoá nhầm.
    if (!keep.size) return
    for (const id of ids) if (!keep.has(id)) await deletePhoto(id)
  } catch { /* dọn rác thất bại thì thôi, không ảnh hưởng gì tới việc đang làm */ }
}
