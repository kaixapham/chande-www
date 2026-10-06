/* =============================================================================
 * CHANDE — Thông số đã lưu từ bảng setting (phím H → nút Lưu)
 * -----------------------------------------------------------------------------
 * FILE NÀY DO BẢNG SETTING GHI — sửa tay được nhưng lần bấm Lưu sau sẽ ghi đè.
 * Phải nạp TRƯỚC mọi file hiệu ứng: mỗi file gọi CHANDE_SETTINGS_APPLY(tên, CONFIG)
 * ngay sau khối CONFIG, nên các giá trị dưới đây thành mặc định của trang (cả
 * nút reset trong bảng cũng trả về đây). Xoá một dòng = về mặc định trong code.
 * Khoá dạng "module.đường.dẫn", ví dụ "bubble.size", "loading.colors.0".
 * ========================================================================== */
window.CHANDE_SETTINGS = {}

window.CHANDE_SETTINGS_APPLY = (mod, config) => {
  for (const [key, value] of Object.entries(window.CHANDE_SETTINGS || {})) {
    if (!key.startsWith(`${mod}.`)) continue
    const path = key.slice(mod.length + 1).split('.')
    const last = path.pop()
    const parent = path.reduce((o, k) => (o == null ? o : o[k]), config)
    if (parent != null && typeof parent === 'object') parent[last] = structuredClone(value)
  }
}
