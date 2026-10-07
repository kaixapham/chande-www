/* =============================================================================
 * CHANDE — Thông số đã lưu từ bảng setting (phím H → nút Lưu)
 * -----------------------------------------------------------------------------
 * FILE NÀY DO BẢNG SETTING GHI — sửa tay được nhưng lần bấm Lưu sau sẽ ghi đè.
 * Phải nạp TRƯỚC mọi file hiệu ứng: mỗi file gọi CHANDE_SETTINGS_APPLY(tên, CONFIG)
 * ngay sau khối CONFIG, nên các giá trị dưới đây thành mặc định của trang (cả
 * nút reset trong bảng cũng trả về đây). Xoá một dòng = về mặc định trong code.
 * Khoá dạng "module.đường.dẫn", ví dụ "bubble.size", "loading.colors.0".
 * ========================================================================== */
window.CHANDE_SETTINGS = {
  "bubble.blend": 11.5,
  "bubble.colorA": "#d1d1d1",
  "bubble.colorB": "#c2c2c2",
  "bubble.dispersion": 0.5,
  "bubble.fallbackOpacity": 0.63,
  "bubble.follow": 0.02,
  "bubble.lensScale": 0.92,
  "bubble.maxDpr": 0.75,
  "bubble.size": 6,
  "bubble.tintStrength": 0.23,
  "cursor.arrowColor": "#0f1513",
  "cursor.arrowSize": 32,
  "cursor.offsetX": 40,
  "cursor.offsetY": 32,
  "cursor.size": 165,
  "field.columns": 4,
  "field.hoverEase": 0.12,
  "field.hoverGlow": 0,
  "field.hoverPreset": "scatter",
  "field.hoverPush": 1,
  "field.hoverRadius": 8,
  "field.hoverRipple": 3,
  "field.hoverShrink": 0.8,
  "field.hoverWarp": 0,
  "field.loop": 3,
  "field.maxDpr": 2,
  "field.softness": 0.55,
  "hero.darkOnRow": true,
  "hero.revealStagger": 250,
  "hero.swapDuration": 580,
}

window.CHANDE_SETTINGS_APPLY = (mod, config) => {
  for (const [key, value] of Object.entries(window.CHANDE_SETTINGS || {})) {
    if (!key.startsWith(`${mod}.`)) continue
    const path = key.slice(mod.length + 1).split('.')
    const last = path.pop()
    const parent = path.reduce((o, k) => (o == null ? o : o[k]), config)
    if (parent != null && typeof parent === 'object') parent[last] = structuredClone(value)
  }
}
