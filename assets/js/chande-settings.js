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
  "bubble.enabled": true,
  "bubble.fallbackOpacity": 0.63,
  "bubble.follow": 0.02,
  "bubble.lensScale": 0.92,
  "bubble.maxDpr": 0.75,
  "bubble.size": 6,
  "bubble.tintStrength": 0.23,
  "cursor.arrowColor": "#0f1513",
  "cursor.arrowSize": 32,
  "cursor.enabled": false,
  "cursor.offsetX": 40,
  "cursor.offsetY": 32,
  "cursor.size": 165,
  "field.columns": 4,
  "field.hoverEase": 0.15,
  "field.hoverGlow": 0.1,
  "field.hoverMode": "scatter",
  "field.hoverPreset": "drift",
  "field.hoverPush": 1,
  "field.hoverRadius": 7,
  "field.hoverRipple": 3,
  "field.hoverShrink": 0,
  "field.hoverWarp": 0.4,
  "field.loop": 3,
  "field.maxDpr": 2,
  "field.softness": 0.55,
  "hero.darkOnRow": true,
  "hero.retract": 750,
  "hero.revealStagger": 240,
  "hero.swapDuration": 540,
  "poster.params.camera.fov": 53.5,
  "poster.params.camera.tilt": 6,
  "poster.params.camera.yaw": -8,
  "poster.params.entry.from": -29,
  "poster.params.entry.travel": 1.72,
  "poster.params.light.azimuth": 141,
  "poster.params.light.elevation": 51,
  "poster.params.light.key": 2,
  "poster.params.light.shadow": 0.23,
  "poster.params.light.softness": 9.6,
  "poster.params.stack.size": 0.8,
  "reveal.speed": 0.4,
  "tilt.damping": 9,
  "tilt.drag": 0.6,
  "tilt.enabled": false,
  "tilt.lineLag": 0.35,
  "tilt.max": 8,
  "tilt.origin": "center",
  "tilt.preset": "jelly",
  "tilt.rotate": 0,
  "tilt.skew": 1,
  "tilt.stiffness": 600,
  "tilt.strength": 2.2,
  "tilt.stretch": 0.012,
  "titlefx.accent": "#85fc56",
  "titlefx.baseAlpha": 0.08,
  "titlefx.ditherSize": 1,
  "titlefx.start": 0.94,
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
