/* =============================================================================
 * CHANDE — Devtools (CHỈ DÙNG LÚC LÀM VIỆC)
 * -----------------------------------------------------------------------------
 * Một bảng duy nhất ở góc phải trên, giao diện theo bảng Controls của
 * Toolcraft. ẨN SẴN — bấm phím H để bật / tắt; phím K mở CMS thay ảnh
 * (cms.html) ở tab riêng. Các mục (chọn ở ô "Mục"):
 *   • Loading    — play / pause / tua timeline + màu nền, dither, màu element
 *   • Hero home  — chiều cao ảnh (% viewport, chung 4 ô), nhịp vòng đổi ảnh,
 *                  kiểu đổi ảnh + thứ tự + độ lệch giữa 4 ô
 *   • Shape reveal — màu 5 lớp, nhịp, easing của đoàn shape (chande-reveal.js)
 *   • Rèm …      — chạy thử rèm, đi Home / Page A / Page B, màu 4 cột, nhịp
 *                  chuyển động, và NẠP ẢNH DEMO cho page A / page B
 *   • Gallery    — lưới ảnh vô tận, preset mặt sàn, vịt patin 3D, thảm cỏ 3D
 *                  (chande-gallery.js / chande-duck.js / chande-grass.js)
 *
 * Bảng khởi động ở DOMContentLoaded (không chạy ngay) để kịp thấy các file
 * hiệu ứng dạng module (vịt, cỏ) — module chạy sau mọi script thường.
 *
 * Bảng chỉ nói chuyện với API công khai của các file hiệu ứng; các file đó
 * không biết gì về bảng này. Bàn giao cho dev = xoá đúng một thẻ
 * <script src="assets/js/chande-devtools.js">.
 *
 * Giá trị đang chỉnh tự giữ ở localStorage khoá 'chande-devtools' (ảnh demo ở
 * 'chande-devtools-shots') — CHỈ trình duyệt này thấy, và ĐÈ LÊN CONFIG trong
 * file hiệu ứng; thấy hành vi lạ thì đọc localStorage trước khi nghi code.
 *
 * Nút LƯU ở đầu bảng ghi các giá trị đó thành file assets/js/chande-settings.js
 * (nạp trước mọi file hiệu ứng) -> thành mặc định cho MỌI người xem:
 *   • chạy local (node serve.mjs): ghi thẳng xuống đĩa, rồi commit + push.
 *   • trên GitHub Pages: commit thẳng lên repo bằng fine-grained token (quyền
 *     Contents: Read and write). Chưa có token thì bảng hiện ô nhập ngay dưới
 *     chân bảng — token dùng chung khoá với cms.html ('chande-cms-gh'), mặc định
 *     chỉ giữ tới khi đóng tab. Không muốn dùng token: nút "Tải file" tải
 *     chande-settings.js về để chép vào repo.
 * Lưu xong, localStorage được dọn (không còn gì khác mặc định mới).
 * ========================================================================== */
const chandeDevtools = () => {
  'use strict'

  const CL = window.CHANDE_LOADING
  const CT = window.CHANDE_TRANSITION
  const CH = window.CHANDE_HERO
  const CM = window.CHANDE_MOSAIC
  const CR = window.CHANDE_REVEAL
  const CF = window.CHANDE_FIELD
  const CB = window.CHANDE_BUBBLE
  const CC = window.CHANDE_CURSOR
  const CTL = window.CHANDE_TILT
  const CPX = window.CHANDE_PARALLAX
  const CTF = window.CHANDE_TITLEFX
  const CSG = window.CHANDE_SIGN
  const CGA = window.CHANDE_GALLERY
  const CDK = window.CHANDE_DUCK
  const CGR = window.CHANDE_GRASS
  const CST = window.CHANDE_STAMPS
  if (!CL && !CT && !CH && !CM && !CR && !CF && !CB && !CC && !CTL && !CPX && !CTF && !CSG && !CGA) return

  const KEY = 'chande-devtools'
  const KEY_SHOTS = 'chande-devtools-shots'
  const MAX_SHOT = 1.5 * 1024 * 1024 // ảnh lớn hơn thì chỉ giữ trong phiên

  /* ------------------------------------------------------------ lược đồ ---- */
  // Ba tab. Hai tab rèm cùng trỏ về module transition, khác nhau ở `variant` —
  // chuyển tab là đổi luôn biến thể rèm sẽ chạy khi bấm link.
  const TABS = [
    CL && { id: 'loading', label: 'Loading', mod: 'loading' },
    CH && { id: 'hero', label: 'Hero home', mod: 'hero' },
    CR && { id: 'reveal', label: 'Shape reveal', mod: 'reveal' },
    CM && { id: 'mosaic', label: 'Mosaic', mod: 'mosaic' },
    CF && { id: 'field', label: 'Effect xanh', mod: 'field' },
    CB && { id: 'bubble', label: 'Bubble (giọt theo chuột)', mod: 'bubble' },
    CC && { id: 'cursor', label: 'Con trỏ nhân vật', mod: 'cursor' },
    CTL && { id: 'tilt', label: 'Chữ nghiêng khi cuộn (Agenda)', mod: 'tilt' },
    CPX && { id: 'parallax', label: 'Parallax ảnh', mod: 'parallax' },
    CTF && { id: 'titlefx', label: 'Title Effect', mod: 'titlefx' },
    CSG && { id: 'sign', label: 'Chữ ký viết tay (Cảm nhận)', mod: 'sign' },
    CGA && { id: 'gallery', label: 'Gallery (lưới, vịt, cỏ, dụng cụ)', mod: 'gallery' },
    CT && { id: 'sweep', label: 'Rèm quét', mod: 'transition', variant: 'sweep' },
    CT && { id: 'split', label: 'Rèm chẻ', mod: 'transition', variant: 'split' },
    CT && { id: 'stack', label: 'Trượt thẻ', mod: 'transition', variant: 'stack' },
  ].filter(Boolean)
  const TAB = (id) => TABS.find((t) => t.id === id) || TABS[0]

  const DITHER = (p) => [
    { path: `${p}.enabled`, label: 'Bật', type: 'bool' },
    { path: `${p}.style`, label: 'Style', type: 'select',
      options: ['bayer2', 'bayer4', 'bayer8', 'bayer16'] },
    { path: `${p}.size`, label: 'Size', type: 'range', min: 1, max: 8, step: 1 },
    { path: `${p}.levels`, label: 'Levels', type: 'range', min: 2, max: 16, step: 1 },
    { path: `${p}.brightness`, label: 'Brightness', type: 'range', min: 0, max: 2, step: 0.05 },
    { path: `${p}.contrast`, label: 'Contrast', type: 'range', min: 0, max: 3, step: 0.05 },
    { path: `${p}.mono`, label: 'Mono', type: 'bool' },
    { path: `${p}.monoColor`, label: 'Mono color', type: 'color' },
  ]

  const MOTION = (p, extra = []) => [
    { path: `${p}.duration`, label: 'Duration (s)', type: 'range', min: 0.2, max: 1.6, step: 0.02 },
    { path: `${p}.stagger`, label: 'Stagger (s)', type: 'range', min: 0, max: 0.3, step: 0.01 },
    { path: `${p}.enterAt`, label: 'Tráo trang lúc (s)', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
    { path: `${p}.leaveFrom`, label: 'Phủ từ', type: 'select',
      options: ['start', 'end', 'center', 'edges'] },
    { path: `${p}.revealFrom`, label: 'Rút từ', type: 'select',
      options: ['start', 'end', 'center', 'edges'] },
    ...extra,
    { path: 'lenis.lerp', label: 'Lenis lerp', type: 'range', min: 0.02, max: 0.5, step: 0.005 },
  ]

  const LABELS = (p, n = 4) =>
    Array.from({ length: n }, (_, i) => ({
      path: `${p}.${i}`, label: `Cột ${i + 1}`, type: 'text',
    }))

  const ALIGN = ['top', 'center', 'bottom']

  const COLORS = (p, n = 4) =>
    Array.from({ length: n }, (_, i) => ({
      path: `${p}.${i}`, label: `Cột ${i + 1}`, type: 'color',
    }))

  const TYPE = (tab) => ({
    tab, mod: 'transition', title: 'Kiểu chữ (dùng chung 2 rèm)',
    items: [
      { path: 'label.fontSize', label: 'Cỡ chữ (px)', type: 'range', min: 24, max: 200, step: 1 },
      { path: 'label.padding', label: 'Padding (px)', type: 'range', min: 0, max: 96, step: 1 },
      { path: 'label.lineHeight', label: 'Line-height', type: 'range', min: 0.8, max: 1.6, step: 0.01 },
      { path: 'label.color', label: 'Màu chữ', type: 'color' },
    ],
  })

  // Thanh menu: dùng chung cho cả ba biến thể, nên hiện ở cả ba tab rèm.
  const HEADER = (tab) => ({
    tab, mod: 'transition', title: 'Thanh menu (dùng chung)',
    items: [
      { path: 'header.mode', label: 'Kiểu', type: 'select', options: ['hide', 'static'] },
      { path: 'header.y', label: 'Trồi lên (%)', type: 'range', min: -140, max: 0, step: 1 },
      { path: 'header.hideDuration', label: 'Lên (s)', type: 'range', min: 0.1, max: 1.6, step: 0.02 },
      { path: 'header.showDuration', label: 'Xuống (s)', type: 'range', min: 0.1, max: 1.6, step: 0.02 },
      { path: 'header.showLag', label: 'Trễ xuống (s)', type: 'range', min: 0, max: 1.2, step: 0.02 },
    ],
  })

  const GROUPS = [
    { tab: 'loading', mod: 'loading', title: 'Nền',
      items: [{ path: 'bg', label: 'Background', type: 'color' }] },
    { tab: 'loading', mod: 'loading', title: 'Dither', items: DITHER('dither') },
    { tab: 'loading', mod: 'loading', title: 'Block reveal chữ',
      items: [
        { path: 'textReveal.enabled', label: 'Bật', type: 'bool' },
        { path: 'textReveal.color', label: 'Màu khối', type: 'color' },
        { path: 'textReveal.startDelay', label: 'Bắt đầu trễ (ms)', type: 'range', min: 0, max: 1200, step: 10 },
        { path: 'textReveal.stagger', label: 'Cách nhau (ms)', type: 'range', min: 0, max: 300, step: 5 },
        { path: 'textReveal.inDuration', label: 'Quét vào (ms)', type: 'range', min: 60, max: 1200, step: 10 },
        { path: 'textReveal.hold', label: 'Giữ kín (ms)', type: 'range', min: 0, max: 600, step: 10 },
        { path: 'textReveal.outDuration', label: 'Quét ra (ms)', type: 'range', min: 60, max: 1200, step: 10 },
      ] },
    { tab: 'loading', mod: 'loading', title: 'Element — lúc loading',
      items: [
        { path: 'stroke', label: 'Stroke', type: 'color' },
        { path: 'strokeOpacity', label: 'Stroke mờ', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'fill', label: 'Khối loading', type: 'color' },
      ] },
    { tab: 'loading', mod: 'loading', title: 'Element — sau finish',
      items: [
        { path: 'cream', label: 'Ô thương hiệu', type: 'color' },
        { path: 'green', label: 'Chữ trên nền kem', type: 'color' },
        { path: 'ink', label: 'Ô track', type: 'color' },
        { path: 'track', label: 'Ô nav 01', type: 'color' },
        { path: 'navDone', label: 'Ô nav 02', type: 'color' },
      ] },

    // ---- Hero trang chủ ----
    { tab: 'hero', mod: 'hero', title: 'Ảnh',
      items: [
        { path: 'imageHeight', label: 'Chiều cao 4 ảnh (% viewport)', type: 'range', min: 10, max: 50, step: 0.5 },
        { path: 'darkOnRow', label: 'Nền tối khi 4 ảnh thành hàng chạm đáy hero', type: 'bool' },
      ] },
    { tab: 'hero', mod: 'hero', title: 'Thanh tên · block reveal',
      items: [
        { path: 'capReveal.stagger', label: 'Lệch số ↔ tên (ms)', type: 'range', min: 0, max: 300, step: 5 },
        { path: 'capReveal.inDuration', label: 'Quét vào (ms)', type: 'range', min: 60, max: 1200, step: 10 },
        { path: 'capReveal.hold', label: 'Giữ kín (ms)', type: 'range', min: 0, max: 600, step: 10 },
        { path: 'capReveal.outDuration', label: 'Quét ra (ms)', type: 'range', min: 60, max: 1200, step: 10 },
      ] },
    { tab: 'hero', mod: 'hero', title: 'Vòng đổi ảnh',
      items: [
        { path: 'cycle', label: 'Thanh process (ms)', type: 'range', min: 1500, max: 15000, step: 100 },
        { path: 'effect', label: 'Kiểu đổi ảnh', type: 'select', options: ['shapes', 'wipe'] },
        { path: 'order', label: 'Thứ tự 4 ô', type: 'select', options: ['bottomUp', 'topDown', 'random'] },
        { path: 'revealStagger', label: 'Shapes · lệch giữa 4 ô (ms, 0 = cùng lúc)', type: 'range', min: 0, max: 1000, step: 10 },
        { path: 'swapDuration', label: 'Wipe · ảnh quét lên (ms)', type: 'range', min: 0, max: 2000, step: 10 },
        { path: 'swapStagger', label: 'Wipe · lệch giữa 4 ô (ms)', type: 'range', min: 0, max: 400, step: 5 },
        { path: 'retract', label: 'Thanh rút về (ms)', type: 'range', min: 0, max: 1500, step: 10 },
      ] },

    // ---- Shape reveal: đoàn shape đổi ảnh của hero (chande-reveal.js) ----
    { tab: 'reveal', mod: 'reveal', title: 'Màu 5 lớp (lớp 1 vào trước)',
      items: [0, 1, 2, 3, 4].map((i) => ({ path: `colors.${i}`, label: `Lớp ${i + 1}`, type: 'color' })) },
    { tab: 'reveal', mod: 'reveal', title: 'Chuyển động',
      items: [
        { path: 'speed', label: 'Speed (×)', type: 'range', min: 0.1, max: 2, step: 0.05 },
        { path: 'duration', label: 'Duration gốc (ms)', type: 'range', min: 200, max: 2000, step: 10 },
        { path: 'coverHold', label: 'Dừng lúc phủ kín (ms)', type: 'range', min: 0, max: 1500, step: 10 },
        { path: 'gap', label: 'Khoảng hở giữa lớp', type: 'range', min: 0.05, max: 0.6, step: 0.01 },
        { path: 'gapFalloff', label: 'Dồn dần về sau', type: 'range', min: 0.2, max: 1, step: 0.01 },
        { path: 'easing', label: 'Easing', type: 'select',
          options: ['linear', 'sine', 'power2', 'power3', 'power4', 'expo', 'circ', 'back'] },
        { path: 'easeMode', label: 'Kiểu ease', type: 'select', options: ['inOut', 'in', 'out', 'hold'] },
        { path: 'carFit', label: 'Ảnh mới', type: 'select', options: ['scale', 'crop'] },
        { path: 'dither', label: 'Dither shape', type: 'bool' },
      ] },

    // ---- Bubble: giọt thuỷ tinh theo chuột (chande-bubble.js, Canvas UI) ----
    { tab: 'bubble', mod: 'bubble', title: 'Giọt',
      items: [
        { path: 'enabled', label: 'Bật bubble', type: 'bool' },
        { path: 'size', label: 'Cỡ giọt (px)', type: 'range', min: 6, max: 120, step: 1 },
        { path: 'scale', label: 'Cỡ chung (thu / phóng cả giọt)', type: 'range', min: 0.2, max: 1.5, step: 0.05 },
        { path: 'offsetX', label: 'Lệch khỏi con trỏ — ngang (px)', type: 'range', min: -200, max: 200, step: 5 },
        { path: 'offsetY', label: 'Lệch khỏi con trỏ — dọc (px)', type: 'range', min: -200, max: 200, step: 5 },
        { path: 'trail', label: 'Độ dài vệt (số cầu)', type: 'range', min: 1, max: 24, step: 1 },
        { path: 'follow', label: 'Bám chuột', type: 'range', min: 0.02, max: 1, step: 0.01 },
        { path: 'blend', label: 'Độ dính', type: 'range', min: 1, max: 40, step: 0.5 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Chuột đẩy giọt (khi giọt đi theo vịt — trang Gallery)',
      items: [
        { path: 'push', label: 'Bật: con trỏ đẩy giọt văng đi', type: 'bool' },
        { path: 'pushReach', label: 'Bán kính bắt đầu đẩy (× bán kính giọt)', type: 'range', min: 0.5, max: 4, step: 0.05 },
        { path: 'pushForce', label: 'Lực đẩy khi con trỏ đứng sát', type: 'range', min: 0, max: 20000, step: 100 },
        { path: 'pushHit', label: 'Lực theo tốc độ con trỏ lao vào', type: 'range', min: 0, max: 8, step: 0.1 },
        { path: 'pushSpring', label: 'Độ cứng lò xo kéo về', type: 'range', min: 2, max: 120, step: 1 },
        { path: 'pushDamping', label: 'Giảm chấn (thấp = nảy lâu)', type: 'range', min: 0.5, max: 30, step: 0.5 },
        { path: 'pushMax', label: 'Văng xa tối đa (px)', type: 'range', min: 40, max: 1200, step: 10 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Vết lõm mềm chỗ con trỏ chạm (trang Gallery)',
      items: [
        { path: 'dent', label: 'Bật vết lõm', type: 'bool' },
        { path: 'dentSize', label: 'Độ rộng (× bán kính giọt)', type: 'range', min: 0.2, max: 1.5, step: 0.05 },
        { path: 'dentDepth', label: 'Độ sâu (nhỏ = lõm nhẹ)', type: 'range', min: 0.02, max: 1, step: 0.01 },
        { path: 'dentSoft', label: 'Độ mềm mép', type: 'range', min: 0.1, max: 2, step: 0.05 },
        { path: 'dentSpring', label: 'Lò xo (thấp = lún / phồng chậm)', type: 'range', min: 10, max: 300, step: 5 },
        { path: 'dentDamping', label: 'Giảm chấn', type: 'range', min: 2, max: 40, step: 0.5 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Khúc xạ (thấu kính — Chrome/Edge)',
      items: [
        { path: 'refract', label: 'Bật khúc xạ nội dung bên dưới', type: 'bool' },
        { path: 'refraction', label: 'Độ bẻ cong (âm = bẻ ra ngoài)', type: 'range', min: -200, max: 200, step: 1 },
        { path: 'dispersion', label: 'Tách màu ở mép', type: 'range', min: 0, max: 3, step: 0.05 },
        { path: 'frost', label: 'Mờ kính (frost)', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'lensScale', label: 'Cỡ thấu kính so với giọt', type: 'range', min: 0.5, max: 1.5, step: 0.01 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Bề mặt',
      items: [
        { path: 'filmDark', label: 'Viền tối khi không có khúc xạ (iPhone / Safari)', type: 'range', min: 0, max: 1, step: 0.05 },
        { path: 'speed', label: 'Tốc độ óng ánh', type: 'range', min: 0, max: 8, step: 0.1 },
        { path: 'iridescence', label: 'Óng ánh', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'intensity', label: 'Độ sáng óng ánh', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'shine', label: 'Phản quang', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'rim', label: 'Viền', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'fallbackOpacity', label: 'Độ đậm', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'colorA', label: 'Màu óng A', type: 'color' },
        { path: 'colorB', label: 'Màu óng B', type: 'color' },
        { path: 'tint', label: 'Màu phủ', type: 'color' },
        { path: 'tintStrength', label: 'Độ phủ màu', type: 'range', min: 0, max: 1, step: 0.01 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Thu nhỏ theo trang',
      items: [
        { path: 'shrinkOn', label: 'Thu nhỏ từ section Poster tới hết trang', type: 'bool' },
        { path: 'shrinkScale', label: 'Còn bao nhiêu (1 = không thu)', type: 'range', min: 0.2, max: 1, step: 0.05 },
        { path: 'hoverOn', label: 'Thu nhỏ khi trỏ vào nút / link', type: 'bool' },
        { path: 'hoverScale', label: 'Khi trỏ vào nút còn (so với cỡ gốc)', type: 'range', min: 0.1, max: 1, step: 0.05 },
        { path: 'hoverTitleScale', label: 'Khi trỏ vào tiêu đề (vai trò About) còn', type: 'range', min: 0.05, max: 1, step: 0.05 },
      ] },
    { tab: 'bubble', mod: 'bubble', title: 'Hiệu năng',
      items: [
        { path: 'maxDpr', label: 'Độ phân giải tối đa (dpr)', type: 'range', min: 0.75, max: 2, step: 0.25 },
      ] },

    // ---- Gallery: lưới ảnh (chande-gallery.js) ----
    { tab: 'gallery', mod: 'gallery', title: 'Lưới ảnh',
      items: [
        { path: 'layout', label: 'Kiểu đặt ảnh (đổi = nạp bộ số của kiểu đó)', type: 'select',
          options: [
            ['zigzag', 'Zigzag — cột lẻ lệch xuống (197 stories)'],
            ['grid', 'Lưới thẳng'],
            ['brick', 'Gạch xây — hàng lẻ lệch nửa ô'],
            ['scatter', 'Rải rác — xô lệch + xoay ngẫu nhiên'],
            ['cluster', 'Cụm 4 ảnh 2×2'],
          ],
          apply: (v) => CGA.applyLayout(v) },
        { path: 'jitter', label: 'Ngẫu nhiên: lệch từng ô (× cạnh ô)', type: 'range', min: 0, max: 0.8, step: 0.01 },
        { path: 'warp', label: 'Ngẫu nhiên: cả vùng trôi theo nhau — dồn / thưa (× cạnh ô)', type: 'range', min: 0, max: 1.2, step: 0.01 },
        { path: 'warpScale', label: 'Ngẫu nhiên: độ rộng một vùng (số ô)', type: 'range', min: 1, max: 10, step: 0.1 },
        { path: 'sizeVar', label: 'Ngẫu nhiên: to nhỏ (0 = đều)', type: 'range', min: 0, max: 0.8, step: 0.01 },
        { path: 'holes', label: 'Ngẫu nhiên: tỉ lệ ô bỏ trống', type: 'range', min: 0, max: 0.5, step: 0.01 },
        { path: 'rotate', label: 'Ngẫu nhiên: xoay tối đa (độ)', type: 'range', min: 0, max: 30, step: 0.5 },
        { path: 'tiltWild', label: 'Ngẫu nhiên: tỉ lệ tấm nghiêng hẳn', type: 'range', min: 0, max: 0.4, step: 0.01 },
        { path: 'clusterGap', label: 'Cụm 4 ảnh: khe trong cụm (× cạnh ô)', type: 'range', min: 0, max: 0.6, step: 0.01 },
        { path: 'size', label: 'Cạnh ô ảnh (rem, desktop)', type: 'range', min: 6, max: 16, step: 0.25 },
        { path: 'colGap', label: 'Khoảng cột (× cạnh ô)', type: 'range', min: 1.05, max: 3.5, step: 0.01 },
        { path: 'rowGap', label: 'Khoảng hàng (× cạnh ô)', type: 'range', min: 1.15, max: 3.5, step: 0.01 },
        { path: 'zig', label: 'Zigzag: ô cột lẻ lệch xuống (× cạnh ô)', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'rowShift', label: 'Zigzag: mỗi hàng lệch ngang (phần khoảng cột)', type: 'range', min: 0, max: 1, step: 0.001 },
        { path: 'ease', label: 'Độ bám khi kéo (nhỏ = trôi mượt hơn)', type: 'range', min: 0.03, max: 0.5, step: 0.01 },
        { path: 'throw', label: 'Quán tính khi thả tay', type: 'range', min: 0, max: 800, step: 10 },
        { path: 'introSpread', label: 'Intro: ô xa nhất trễ (s, lần vào sau)', type: 'range', min: 0, max: 3, step: 0.05 },
      ] },
    { tab: 'gallery', mod: 'gallery', title: 'Viền tem (răng cưa quanh ảnh)',
      items: [
        { path: 'stamp.enabled', label: 'Bật viền tem', type: 'bool' },
        { path: 'stamp.color', label: 'Màu viền', type: 'color' },
        { path: 'stamp.border', label: 'Độ dày viền (× cạnh ảnh)', type: 'range', min: 0.01, max: 0.2, step: 0.005 },
        { path: 'stamp.teeth', label: 'Cỡ răng (bán kính × cạnh ảnh)', type: 'range', min: 0.008, max: 0.08, step: 0.001 },
        { path: 'stamp.gap', label: 'Khoảng cách răng (× bán kính)', type: 'range', min: 2.1, max: 6, step: 0.05 },
      ] },
    { tab: 'gallery', mod: 'gallery', title: 'Mặt sàn',
      items: [
        { path: 'floor', label: 'Preset mặc định (nút góc trang đè lên theo trình duyệt)', type: 'select',
          options: [['grass-3d', 'Cỏ 3D'], ['grass-pixel', 'Cỏ pixel'], ['', 'Nền kem địa hình (Figma)']] },
      ] },
    // ---- Vịt patin 3D (chande-duck.js) ----
    { tab: 'gallery', mod: 'duck', title: 'Vịt patin',
      items: [
        { path: 'height', label: 'Chiều cao vịt (px)', type: 'range', min: 80, max: 420, step: 5 },
        { path: 'tilt', label: 'Góc nhìn (độ, 90 = thẳng từ trên)', type: 'range', min: 25, max: 90, step: 1 },
        { path: 'speed', label: 'Tốc độ lăn (px/s)', type: 'range', min: 30, max: 400, step: 5 },
        { path: 'sprint', label: 'Tăng tốc khi ở ngoài màn (×)', type: 'range', min: 1, max: 5, step: 0.1 },
        { path: 'turn', label: 'Tốc độ ôm cua (rad/s)', type: 'range', min: 0.3, max: 5, step: 0.1 },
        { path: 'lean', label: 'Nghiêng khi ôm cua (rad)', type: 'range', min: 0, max: 0.8, step: 0.01 },
        { path: 'rest.0', label: 'Nghỉ giữa chặng — ít nhất (s)', type: 'range', min: 0, max: 6, step: 0.1 },
        { path: 'rest.1', label: 'Nghỉ giữa chặng — nhiều nhất (s)', type: 'range', min: 0, max: 10, step: 0.1 },
        { path: 'shadow', label: 'Độ đậm bóng (nền kem)', type: 'range', min: 0, max: 0.6, step: 0.01 },
        { path: 'shadowGrass', label: 'Độ đậm bóng (trên cỏ)', type: 'range', min: 0, max: 0.8, step: 0.01 },
      ] },
    { tab: 'gallery', mod: 'duck', title: 'Vịt — giọt bong bóng đi theo',
      items: [
        { path: 'bubble.gap', label: 'Khoảng cách sau lưng vịt (× chiều cao vịt)', type: 'range', min: 0, max: 2.5, step: 0.05 },
        { path: 'bubble.side', label: 'Lệch sang bên (× chiều cao vịt)', type: 'range', min: -1.5, max: 1.5, step: 0.05 },
        { path: 'bubble.lift', label: 'Bay cao (× chiều cao vịt)', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'bubble.bob', label: 'Nhấp nhô (px)', type: 'range', min: 0, max: 40, step: 1 },
      ] },
    { tab: 'gallery', mod: 'duck', title: 'Vịt — va chạm chuột',
      items: [
        { path: 'reach', label: 'Bán kính ảnh hưởng (× chiều cao vịt)', type: 'range', min: 0.2, max: 2, step: 0.05 },
        { path: 'push', label: 'Lực đẩy khi chuột đứng gần', type: 'range', min: 0, max: 30, step: 0.5 },
        { path: 'hit', label: 'Lực theo tốc độ chuột lao vào', type: 'range', min: 0, max: 0.05, step: 0.001 },
        { path: 'spring', label: 'Độ cứng lò xo (dựng lại)', type: 'range', min: 10, max: 200, step: 1 },
        { path: 'damping', label: 'Giảm chấn (nhỏ = lắc lâu)', type: 'range', min: 0.5, max: 20, step: 0.1 },
        { path: 'maxTip', label: 'Nghiêng tối đa (rad)', type: 'range', min: 0.1, max: 1.2, step: 0.01 },
        { path: 'slide', label: 'Trượt ra xa khi bị đẩy', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'panTilt', label: 'Kéo lưới làm vịt nghiêng (quán tính — cách chọc vịt trên điện thoại)', type: 'range', min: 0, max: 0.01, step: 0.0001 },
      ] },
    // ---- Hộp dụng cụ 3D: con dấu, bút, tẩy (chande-stamps.js) ----
    CST && { tab: 'gallery', mod: 'stamps', title: 'Dụng cụ — con dấu: màu',
      items: CST.config.stamps.flatMap((d, i) => [
        { path: `stamps.${i}.handle`, label: `${d.name} · cán`, type: 'color' },
        { path: `stamps.${i}.base`, label: `${d.name} · đế`, type: 'color' },
        { path: `stamps.${i}.ink`, label: `${d.name} · mực`, type: 'color' },
      ]) },
    CST && { tab: 'gallery', mod: 'stamps', title: 'Dụng cụ — con dấu: cầm & in',
      items: [
        { path: 'size', label: 'Bán kính dấu khi cầm (px)', type: 'range', min: 30, max: 120, step: 1 },
        { path: 'lift', label: 'Lơ lửng khi cầm (× bán kính)', type: 'range', min: 0.2, max: 2, step: 0.05 },
        { path: 'bleed', label: 'Độ nhoè mực', type: 'range', min: 0, max: 3, step: 0.05 },
        { path: 'deboss', label: 'Độ hằn giấy', type: 'range', min: 0, max: 3, step: 0.05 },
        { path: 'ink.0', label: 'Độ đậm mực — ít nhất', type: 'range', min: 0.2, max: 1, step: 0.01 },
        { path: 'ink.1', label: 'Độ đậm mực — nhiều nhất', type: 'range', min: 0.2, max: 1, step: 0.01 },
        { path: 'spin', label: 'Vết in xoay ngẫu nhiên ± (độ)', type: 'range', min: 0, max: 180, step: 1 },
        { path: 'maxPrints', label: 'Số vết giữ lại tối đa', type: 'range', min: 4, max: 150, step: 1 },
      ] },
    CST && { tab: 'gallery', mod: 'stamps', title: 'Dụng cụ — bút',
      items: [
        { path: 'pen.color', label: 'Màu mực (ngòi, vòng, nắp)', type: 'color' },
        { path: 'pen.body', label: 'Thân bút', type: 'color' },
        { path: 'pen.width', label: 'Độ dày nét (px)', type: 'range', min: 1, max: 16, step: 0.5 },
        { path: 'pen.size', label: 'Cỡ bút khi cầm', type: 'range', min: 12, max: 60, step: 1 },
      ] },
    CST && { tab: 'gallery', mod: 'stamps', title: 'Dụng cụ — tẩy',
      items: [
        { path: 'eraser.body', label: 'Cao su', type: 'color' },
        { path: 'eraser.sleeve', label: 'Vỏ bọc', type: 'color' },
        { path: 'eraser.radius', label: 'Bán kính vùng tẩy (px)', type: 'range', min: 6, max: 60, step: 1 },
        { path: 'eraser.size', label: 'Cỡ tẩy khi cầm', type: 'range', min: 16, max: 70, step: 1 },
      ] },
    // ---- Thảm cỏ 3D (chande-grass.js) — chỉ thấy khi sàn = Cỏ 3D ----
    CGR && { tab: 'gallery', mod: 'grass', title: 'Thảm cỏ 3D — lá',
      items: [
        { path: 'style', label: 'Kiểu cỏ (đổi = nạp cả bộ số của kiểu đó)', type: 'select',
          options: [['meadow', 'Đồng cỏ (lá mảnh, gió sóng)'], ['vector', 'Lá vector (to bản, chải một hướng)']],
          apply: (v) => CGR.applyPreset(v) },
        { path: 'shape', label: 'Hình lá (0 = mũi giáo, 1 = mảnh thon đều)', type: 'range', min: 0, max: 1, step: 0.05 },
        { path: 'facing', label: 'Xoay lá (0 = theo hướng ngả, 1 = ngẫu nhiên)', type: 'range', min: 0, max: 1, step: 0.05 },
        { path: 'bend', label: 'Độ cong ngẫu nhiên từng lá', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'twoTone', label: 'Hai tông hai nửa lá', type: 'range', min: 0, max: 1, step: 0.05 },
        { path: 'density', label: 'Mật độ (lá / px²) — máy yếu thì giảm', type: 'range', min: 0.004, max: 0.08, step: 0.001 },
        { path: 'height.0', label: 'Lá ngắn nhất (px)', type: 'range', min: 5, max: 60, step: 1 },
        { path: 'height.1', label: 'Lá dài nhất (px)', type: 'range', min: 5, max: 80, step: 1 },
        { path: 'width.0', label: 'Bản lá hẹp nhất (px)', type: 'range', min: 0.5, max: 20, step: 0.1 },
        { path: 'width.1', label: 'Bản lá rộng nhất (px)', type: 'range', min: 0.5, max: 24, step: 0.1 },
        { path: 'comb.angle', label: 'Hướng chải (độ, 0 = sang phải, âm = chếch lên)', type: 'range', min: -180, max: 180, step: 1 },
        { path: 'comb.lean', label: 'Độ ngả theo hướng chải', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'comb.spread', label: 'Lá xoay lệch ngẫu nhiên', type: 'range', min: 0, max: 1.6, step: 0.05 },
        { path: 'wind', label: 'Gió', type: 'range', min: 0, max: 3, step: 0.05 },
      ] },
    CGR && { tab: 'gallery', mod: 'grass', title: 'Thảm cỏ 3D — màu',
      items: [
        { path: 'colors.base', label: 'Gốc lá', type: 'color' },
        { path: 'colors.mid', label: 'Thân lá', type: 'color' },
        { path: 'colors.tip', label: 'Ngọn lá', type: 'color' },
        { path: 'colors.tip2', label: 'Ngọn lá — màu thứ hai (theo mảng)', type: 'color' },
        { path: 'ground', label: 'Nền dưới cỏ', type: 'color' },
        { path: 'colors.pressed', label: 'Cỏ bị vịt đè rạp', type: 'color' },
        { path: 'colors.pile', label: 'Cỏ dồn hai mép vệt', type: 'color' },
      ] },
    CGR && { tab: 'gallery', mod: 'grass', title: 'Thảm cỏ 3D — vệt vịt & lá đan mép ảnh',
      items: [
        { path: 'part.radius', label: 'Bán kính rẽ cỏ (px)', type: 'range', min: 8, max: 90, step: 1 },
        { path: 'part.life', label: 'Cỏ dựng lại sau (s)', type: 'range', min: 0.5, max: 20, step: 0.5 },
        { path: 'weave.outside', label: 'Lá đan: dải ngoài mép ảnh (px)', type: 'range', min: 0, max: 40, step: 1 },
        { path: 'weave.inside', label: 'Lá đan: lấn vào trong ảnh (px)', type: 'range', min: 0, max: 30, step: 1 },
        { path: 'weave.height', label: 'Lá đan: độ dài (× lá thường)', type: 'range', min: 0, max: 1.5, step: 0.05 },
      ] },

    // ---- Parallax ảnh khi cuộn (chande-parallax.js) ----
    { tab: 'parallax', mod: 'parallax', title: 'Parallax ảnh',
      items: [
        { path: 'enabled', label: 'Bật parallax', type: 'bool' },
        { path: 'mode', label: 'Kiểu', type: 'select', options: [['inner', 'Hình trôi trong khung (khung đứng yên)'], ['move', 'Cả ảnh trôi']] },
        { path: 'zoom', label: 'Phóng ảnh (kiểu trong khung)', type: 'range', min: 1.02, max: 1.5, step: 0.01 },
        { path: 'speed', label: 'Độ lệch (âm = ảnh nổi lên, dương = lùi sâu)', type: 'range', min: -0.4, max: 0.4, step: 0.01 },
        { path: 'max', label: 'Lệch tối đa (px, kiểu cả ảnh trôi)', type: 'range', min: 10, max: 300, step: 5 },
        { path: 'smooth', label: 'Độ bám (nhỏ = trôi mượt hơn)', type: 'range', min: 0.03, max: 1, step: 0.01 },
      ] },

    // ---- Chữ ký viết tay (chande-sign.js) — áp từ lần viết sau ----
    { tab: 'sign', mod: 'sign', title: 'Nét bút',
      items: [
        { path: 'enabled', label: 'Bật hiệu ứng viết', type: 'bool' },
        { path: 'duration', label: 'Thời gian viết cả chữ ký (giây)', type: 'range', min: 0.4, max: 4, step: 0.1 },
        { path: 'cover', label: 'Độ dày bút (phủ thân nét)', type: 'range', min: 0.04, max: 0.3, step: 0.01 },
        { path: 'thin', label: 'Độ mảnh nét (gọt; > 0.6 nét mảnh bắt đầu đứt)', type: 'range', min: 0, max: 1.2, step: 0.05 },
      ] },

    // ---- Title Effect: chữ tô màu dần theo cuộn (chande-titlefx.js) ----
    { tab: 'titlefx', mod: 'titlefx', title: 'Màu',
      items: [
        { path: 'enabled', label: 'Bật', type: 'bool' },
        { path: 'color', label: 'Màu chữ (tô xong)', type: 'color' },
        { path: 'accent', label: 'Màu chuyển (mép quét)', type: 'color' },
        { path: 'base', label: 'Màu chữ chưa tô', type: 'color' },
        { path: 'baseAlpha', label: 'Độ đậm chữ chưa tô (0 = ẩn)', type: 'range', min: 0, max: 1, step: 0.01 },
      ] },
    { tab: 'titlefx', mod: 'titlefx', title: 'Nhịp quét',
      items: [
        { path: 'band', label: 'Độ rộng dải chuyển (theo dòng)', type: 'range', min: 0.02, max: 0.6, step: 0.01 },
        { path: 'dither', label: 'Dither (chuyển bằng ô pixel)', type: 'bool' },
        { path: 'ditherSize', label: 'Cỡ ô dither (px)', type: 'range', min: 1, max: 16, step: 1 },
        { path: 'start', label: 'Bắt đầu khi dòng ở (0 = đỉnh màn, 1 = đáy)', type: 'range', min: 0.2, max: 1.2, step: 0.01 },
        { path: 'end', label: 'Tô xong khi dòng ở', type: 'range', min: -0.2, max: 1, step: 0.01 },
        { path: 'smooth', label: 'Độ bám (nhỏ = mượt hơn)', type: 'range', min: 0.03, max: 1, step: 0.01 },
        { path: 'selector', label: 'Áp cho (CSS selector)', type: 'text' },
      ] },

    // ---- Chữ nghiêng theo quán tính khi cuộn (chande-tilt.js) ----
    { tab: 'tilt', mod: 'tilt', title: 'Preset',
      items: [
        { path: 'enabled', label: 'Bật', type: 'bool' },
        { path: 'preset', label: 'Kiểu', type: 'select',
          options: [['hinge', 'Bản lề'], ['pendulum', 'Con lắc'], ['jelly', 'Thạch'], ['rope', 'Sợi dây'], ['heavy', 'Quán tính nặng'], ['snap', 'Giật nảy']],
          apply: (v) => CTL?.applyPreset?.(v) },
      ] },
    { tab: 'tilt', mod: 'tilt', title: 'Lực',
      items: [
        { path: 'strength', label: 'Độ nhạy (độ / 1000px/s)', type: 'range', min: 0, max: 6, step: 0.1 },
        { path: 'max', label: 'Góc tối đa (độ)', type: 'range', min: 0.5, max: 20, step: 0.5 },
      ] },
    { tab: 'tilt', mod: 'tilt', title: 'Lò xo',
      items: [
        { path: 'stiffness', label: 'Độ cứng (lớn = bật về nhanh)', type: 'range', min: 10, max: 600, step: 5 },
        { path: 'damping', label: 'Giảm chấn (nhỏ = nhún nhiều)', type: 'range', min: 1, max: 40, step: 0.5 },
        { path: 'lineLag', label: 'Dòng sau trễ dòng trước', type: 'range', min: 0, max: 0.95, step: 0.05 },
      ] },
    { tab: 'tilt', mod: 'tilt', title: 'Biến dạng',
      items: [
        { path: 'origin', label: 'Điểm xoay', type: 'select', options: [['left', 'Mép trái'], ['center', 'Giữa'], ['right', 'Mép phải']] },
        { path: 'rotate', label: 'Xoay', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'skew', label: 'Xô lệch (skew)', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'drag', label: 'Tụt xuống (px / độ)', type: 'range', min: 0, max: 6, step: 0.1 },
        { path: 'stretch', label: 'Giãn dọc', type: 'range', min: 0, max: 0.05, step: 0.001 },
      ] },

    // ---- Con trỏ nhân vật (chande-cursor.js) ----
    { tab: 'cursor', mod: 'cursor', title: 'Nhân vật',
      items: [
        { path: 'enabled', label: 'Bật nhân vật', type: 'bool' },
        { path: 'size', label: 'Cỡ (px)', type: 'range', min: 40, max: 240, step: 1 },
        { path: 'lerp', label: 'Bám chuột', type: 'range', min: 0.04, max: 1, step: 0.01 },
        { path: 'offsetX', label: 'Lệch ngang (px)', type: 'range', min: -120, max: 120, step: 1 },
        { path: 'offsetY', label: 'Lệch dọc (px)', type: 'range', min: -120, max: 120, step: 1 },
        { path: 'tilt', label: 'Nghiêng theo hướng đi', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'hoverScale', label: 'Phóng khi trỏ link', type: 'range', min: 1, max: 2, step: 0.05 },
      ] },
    { tab: 'cursor', mod: 'cursor', title: 'Mũi tên kiểu Figma',
      items: [
        { path: 'figma', label: 'Dùng mũi tên Figma', type: 'bool' },
        { path: 'arrowSize', label: 'Cỡ (px)', type: 'range', min: 16, max: 40, step: 1 },
        { path: 'arrowColor', label: 'Màu nền', type: 'color' },
        { path: 'arrowStroke', label: 'Màu viền', type: 'color' },
      ] },
    { tab: 'cursor', mod: 'cursor', title: 'Né bubble',
      items: [
        { path: 'avoidBubble', label: 'Không chồng lên giọt', type: 'bool' },
        { path: 'gap', label: 'Khoảng hở với mép giọt (px)', type: 'range', min: 0, max: 60, step: 1 },
        { path: 'body', label: 'Thân va chạm (tỉ lệ cỡ)', type: 'range', min: 0.1, max: 0.6, step: 0.01 },
      ] },

    // ---- Effect xanh: preset gradient-studio (chande-field.js) ----
    { tab: 'field', mod: 'field', title: 'Bảng màu (tối → sáng)',
      items: [0, 1, 2, 3].map((i) => ({ path: `colors.${i}`, label: `Màu ${i + 1}`, type: 'color' })) },
    { tab: 'field', mod: 'field', title: 'Cột (Slats)',
      items: [
        { path: 'columns', label: 'Số cột', type: 'range', min: 2, max: 24, step: 1 },
        { path: 'lineOffset', label: 'Lệch giữa cột', type: 'range', min: 0, max: 0.4, step: 0.01 },
        { path: 'lineOrder', label: 'Thứ tự (0 giữa ra · 1 quét · 2 xen · 3 hội tụ · 4 ngẫu nhiên)', type: 'range', min: 0, max: 4, step: 1 },
        { path: 'softness', label: 'Độ mềm dải màu', type: 'range', min: 0, max: 1, step: 0.01 },
      ] },
    { tab: 'field', mod: 'field', title: 'Ô khảm',
      items: [
        { path: 'mosaic', label: 'Bật ô khảm', type: 'bool' },
        { path: 'tiles', label: 'Số ô theo chiều ngang', type: 'range', min: 8, max: 120, step: 1 },
        { path: 'gap', label: 'Khe', type: 'range', min: 0, max: 0.4, step: 0.01 },
        { path: 'corners', label: 'Bo góc', type: 'range', min: 0, max: 0.5, step: 0.01 },
        { path: 'bevel', label: 'Gờ', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'studs', label: 'Núm', type: 'range', min: 0, max: 1, step: 0.01 },
      ] },
    { tab: 'field', mod: 'field', title: 'Rê chuột',
      items: [
        { path: 'hover', label: 'Bật hiệu ứng rê chuột', type: 'bool' },
        // chọn preset = chép cả bộ số bên dưới, rồi vẫn chỉnh tay từng ô được
        { path: 'hoverPreset', label: 'Preset', type: 'select',
          options: [['lens', 'Thấu kính'], ['scatter', 'Tản ô'], ['magnet', 'Nam châm (hút)'], ['drift', 'Dạt ô (không co)'], ['ripple', 'Gợn sóng']],
          apply: (v) => CF?.applyHoverPreset?.(v) },
        { path: 'hoverMode', label: 'Kiểu', type: 'select', options: [['push', 'Co / đẩy'], ['scatter', 'Dạt sang ô bên'], ['ripple', 'Gợn sóng']] },
        { path: 'hoverRipple', label: 'Tốc độ sóng (kiểu gợn sóng)', type: 'range', min: 0.1, max: 3, step: 0.05 },
        { path: 'hoverRadius', label: 'Bán kính (số ô)', type: 'range', min: 1, max: 20, step: 0.5 },
        { path: 'hoverShrink', label: 'Co ô', type: 'range', min: 0, max: 0.9, step: 0.01 },
        { path: 'hoverPush', label: 'Đẩy ô (âm = hút về chuột)', type: 'range', min: -1, max: 1, step: 0.01 },
        { path: 'hoverWarp', label: 'Kéo màu (âm = chụm vào)', type: 'range', min: -5, max: 5, step: 0.05 },
        { path: 'hoverGlow', label: 'Sáng thêm', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'imgTiles', label: 'Ảnh hero cũng vỡ ô khi rê (cùng kiểu)', type: 'bool' },
        { path: 'hoverGapAuto', label: 'Nền lộ ra = màu nền phía sau (tự động)', type: 'bool' },
        { path: 'hoverGapColor', label: 'Màu nền lộ ra (khi tắt tự động)', type: 'color' },
        { path: 'hoverFlat', label: 'Làm phẳng bóng ô khi rê', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'hoverEase', label: 'Độ mượt (nhỏ = mượt hơn)', type: 'range', min: 0.03, max: 1, step: 0.01 },
      ] },
    { tab: 'field', mod: 'field', title: 'Grade',
      items: [
        { path: 'contrast', label: 'Contrast', type: 'range', min: 0.4, max: 2, step: 0.01 },
        { path: 'saturation', label: 'Saturation', type: 'range', min: 0, max: 2, step: 0.01 },
        { path: 'vignette', label: 'Vignette', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'grain', label: 'Grain (noise)', type: 'range', min: 0, max: 0.4, step: 0.005 },
        { path: 'grainSize', label: 'Cỡ hạt grain', type: 'range', min: 0.5, max: 4, step: 0.1 },
      ] },
    { tab: 'field', mod: 'field', title: 'Chạy',
      items: [
        { path: 'pauseOnSwap', label: 'Dừng chờ khi 4 ảnh hero đổi', type: 'bool' },
        { path: 'loop', label: 'Một vòng (s)', type: 'range', min: 1, max: 20, step: 0.5 },
        { path: 'fps', label: 'Khung hình / giây (thấp = nhẹ máy nhưng giật)', type: 'range', min: 10, max: 120, step: 1 },
        { path: 'maxDpr', label: 'Độ nét tối đa (DPR)', type: 'range', min: 0.5, max: 2, step: 0.05 },
      ] },

    // ---- Mosaic: các mảng xanh của hero (chande-mosaic.js) ----
    { tab: 'mosaic', mod: 'mosaic', title: 'Nhịp chung',
      items: [
        { path: 'period', label: 'Một vòng (s)', type: 'range', min: 4, max: 60, step: 0.5 },
        { path: 'octaves', label: 'Độ chi tiết', type: 'range', min: 1, max: 6, step: 1 },
        { path: 'holdOut', label: 'Phanh khi đổi ảnh (ms)', type: 'range', min: 0, max: 1500, step: 10 },
        { path: 'holdIn', label: 'Nhả sau khi đổi (ms)', type: 'range', min: 0, max: 2500, step: 10 },
      ] },
    { tab: 'mosaic', mod: 'mosaic', title: 'Viên gạch',
      items: [
        { path: 'brick.gap', label: 'Khe', type: 'range', min: 0, max: 0.4, step: 0.01 },
        { path: 'brick.corners', label: 'Bo góc', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'brick.bevel', label: 'Độ phồng', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'brick.stud', label: 'Núm giữa', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: 'brick.seam', label: 'Độ sáng khe', type: 'range', min: 0, max: 1, step: 0.01 },
      ] },
    CM && { tab: 'mosaic', mod: 'mosaic', title: 'Dải màu (tối -> sáng)',
      items: CM.config.ramp.flatMap((_, i) => [
        { path: `ramp.${i}.color`, label: `Màu ${i + 1}`, type: 'color' },
        { path: `ramp.${i}.pos`, label: `Vị trí ${i + 1}`, type: 'range', min: 0, max: 1, step: 0.01 },
      ]) },
    ...(CM ? Object.keys(CM.config.fields) : []).map((k) => ({
      tab: 'mosaic', mod: 'mosaic', title: `Vùng ${k.toUpperCase()}`,
      items: [
        { path: `fields.${k}.tile`, label: 'Cỡ viên (px)', type: 'range', min: 4, max: 40, step: 0.5 },
        { path: `fields.${k}.scale`, label: 'Cỡ mảng loang', type: 'range', min: 80, max: 1600, step: 10 },
        { path: `fields.${k}.offsetX`, label: 'Dời ngang', type: 'range', min: -20, max: 20, step: 0.1 },
        { path: `fields.${k}.offsetY`, label: 'Dời dọc', type: 'range', min: -20, max: 20, step: 0.1 },
        { path: `fields.${k}.tiltAngle`, label: 'Hướng sáng (°, 0 = lên)', type: 'range', min: 0, max: 360, step: 1 },
        { path: `fields.${k}.tilt`, label: 'Độ chuyển sáng tối', type: 'range', min: 0, max: 2.5, step: 0.01 },
        { path: `fields.${k}.noise`, label: 'Độ loang', type: 'range', min: 0, max: 1.5, step: 0.01 },
        { path: `fields.${k}.warp`, label: 'Độ uốn', type: 'range', min: 0, max: 2, step: 0.01 },
        { path: `fields.${k}.blocks`, label: 'Khối pixel thô', type: 'range', min: 0, max: 1, step: 0.01 },
        { path: `fields.${k}.blockSize`, label: 'Cỡ khối thô (viên)', type: 'range', min: 2, max: 16, step: 1 },
        { path: `fields.${k}.level`, label: 'Sáng / tối cả vùng', type: 'range', min: -0.6, max: 0.6, step: 0.01 },
        { path: `fields.${k}.contrast`, label: 'Tương phản', type: 'range', min: 0.2, max: 2.5, step: 0.01 },
        { path: `fields.${k}.phase`, label: 'Lệch pha (°)', type: 'range', min: 0, max: 360, step: 1 },
      ] })),

    // ---- Rèm quét: 4 cột trôi từ trên xuống rồi ra khỏi mép dưới ----
    { tab: 'sweep', mod: 'transition', title: 'Màu 4 cột', items: COLORS('sweep.colors') },
    { tab: 'sweep', mod: 'transition', title: 'Dither cột', items: DITHER('sweep.dither') },
    { tab: 'sweep', mod: 'transition', title: 'Chữ trên cột',
      items: [
        ...LABELS('sweep.labels'),
        { path: 'sweep.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    TYPE('sweep'),
    HEADER('sweep'),
    { tab: 'sweep', mod: 'transition', title: 'Chuyển động', items: MOTION('sweep') },

    // ---- Rèm chẻ: 4 cột trên thả xuống + 4 cột dưới đẩy lên, gặp ở giữa ----
    { tab: 'split', mod: 'transition', title: 'Màu 4 cột trên', items: COLORS('split.colors') },
    { tab: 'split', mod: 'transition', title: 'Màu 4 cột dưới', items: COLORS('split.colorsBottom') },
    { tab: 'split', mod: 'transition', title: 'Chữ 4 cột trên',
      items: [
        ...LABELS('split.labels'),
        { path: 'split.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'split', mod: 'transition', title: 'Chữ 4 cột dưới',
      items: [
        ...LABELS('split.labelsBottom'),
        { path: 'split.labelAlignBottom', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'split', mod: 'transition', title: 'Dither cột', items: DITHER('split.dither') },
    TYPE('split'),
    HEADER('split'),

    // ---- Trượt thẻ ----
    { tab: 'stack', mod: 'transition', title: 'Tấm giữa',
      items: [
        { path: 'stack.color', label: 'Màu', type: 'color' },
        { path: 'stack.bg', label: 'Nền lúc chuyển', type: 'color' },
        { path: 'stack.radius', label: 'Bo góc (em)', type: 'range', min: 0, max: 4, step: 0.05 },
        { path: 'stack.label', label: 'Chữ', type: 'text' },
        { path: 'stack.labelAlign', label: 'Căn dọc', type: 'select', options: ALIGN },
      ] },
    { tab: 'stack', mod: 'transition', title: 'Dither tấm giữa', items: DITHER('stack.dither') },
    { tab: 'stack', mod: 'transition', title: 'Co lại',
      items: [
        { path: 'stack.shrinkDuration', label: 'Duration (s)', type: 'range', min: 0.3, max: 2.5, step: 0.02 },
        { path: 'stack.clipDuration', label: 'Bo góc (s)', type: 'range', min: 0.1, max: 2, step: 0.02 },
        { path: 'stack.wrapperScale', label: 'Trang cũ · scale', type: 'range', min: 0.5, max: 1, step: 0.005 },
        { path: 'stack.wrapperY', label: 'Trang cũ · Y (%)', type: 'range', min: 0, max: 60, step: 1 },
        { path: 'stack.middleScale', label: 'Tấm giữa · scale', type: 'range', min: 0.5, max: 1, step: 0.005 },
        { path: 'stack.middleY', label: 'Tấm giữa · Y (%)', type: 'range', min: 0, max: 60, step: 1 },
        { path: 'stack.nextScale', label: 'Trang mới · scale', type: 'range', min: 0.4, max: 1, step: 0.005 },
      ] },
    HEADER('stack'),
    { tab: 'stack', mod: 'transition', title: 'Trượt ra',
      items: [
        { path: 'stack.exitDuration', label: 'Duration (s)', type: 'range', min: 0.3, max: 2.5, step: 0.02 },
        { path: 'stack.exitAt', label: 'Bắt đầu lúc (s)', type: 'range', min: 0, max: 2, step: 0.05 },
        { path: 'stack.middleLag', label: 'Trễ từng lớp (s)', type: 'range', min: 0, max: 0.6, step: 0.01 },
        { path: 'stack.wrapperExitY', label: 'Trang cũ · Y (%)', type: 'range', min: 100, max: 200, step: 1 },
        { path: 'stack.middleExitY', label: 'Tấm giữa · Y (%)', type: 'range', min: 100, max: 200, step: 1 },
        { path: 'stack.zIndex', label: 'z-index tấm giữa', type: 'range', min: 0, max: 10, step: 1 },
        { path: 'lenis.lerp', label: 'Lenis lerp', type: 'range', min: 0.02, max: 0.5, step: 0.005 },
      ] },
    { tab: 'split', mod: 'transition', title: 'Chuyển động',
      items: MOTION('split', [
        { path: 'split.splitAt', label: 'Đường gặp (%)', type: 'range', min: 10, max: 90, step: 1 },
      ]) },
  ]

  const MODS = { loading: CL, transition: CT, hero: CH, mosaic: CM, reveal: CR, field: CF, bubble: CB, cursor: CC, tilt: CTL, parallax: CPX, titlefx: CTF, sign: CSG, gallery: CGA, duck: CDK, grass: CGR, stamps: CST }
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o)
  const set = (o, p, v) => {
    const k = p.split('.')
    const last = k.pop()
    k.reduce((a, x) => a[x], o)[last] = v
  }
  const live = (g) => MODS[g.mod]
  const groups = () => GROUPS.filter((g) => g && live(g))

  /* ------------------------------------------------------------ lưu trữ ---- */
  function loadSettings() {
    let saved
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null') } catch (e) {}
    if (!saved) return
    if (saved.__tab && TABS.some((t) => t.id === saved.__tab)) tab = saved.__tab
    if (saved.__open) shown = true
    const touched = new Set()
    for (const g of groups())
      for (const f of g.items) {
        const k = `${g.mod}.${f.path}`
        if (saved[k] !== undefined) {
          set(live(g).config, f.path, saved[k])
          touched.add(g.mod)
        }
      }
    const t = TAB(tab)
    if (t.variant && CT) CT.setVariant(t.variant)
    touched.forEach((m) => MODS[m]?.refresh?.())
  }

  function saveSettings() {
    const out = { __tab: tab, __open: shown }
    // Chỉ lưu giá trị KHÁC mặc định — lưu hết thì sau này đổi mặc định trong code
    // sẽ bị bản lưu cũ đè mất (đã dính với lenis.lerp).
    for (const g of groups())
      for (const f of g.items) {
        const v = get(live(g).config, f.path)
        const d = live(g).defaults ? get(live(g).defaults, f.path) : undefined
        if (JSON.stringify(v) !== JSON.stringify(d)) out[`${g.mod}.${f.path}`] = v
      }
    try { localStorage.setItem(KEY, JSON.stringify(out)) } catch (e) {}
    // có giá trị nào khác mặc định (= bản đã Lưu) thì chấm xanh ở nút Lưu
    saveBtn?.classList.toggle('is-dirty', Object.keys(out).some((k) => !k.startsWith('__')))
  }

  /* ------------------------------------------- Lưu thành chande-settings.js - */
  const SETTINGS_FILE = 'assets/js/chande-settings.js'

  // Mọi khoá đã lưu trước đó + mọi giá trị đang khác mặc định.
  function collectSettings() {
    const out = { ...(window.CHANDE_SETTINGS || {}) }
    for (const g of groups())
      for (const f of g.items) {
        const k = `${g.mod}.${f.path}`
        const v = get(live(g).config, f.path)
        const d = live(g).defaults ? get(live(g).defaults, f.path) : undefined
        if (k in out || JSON.stringify(v) !== JSON.stringify(d)) out[k] = structuredClone(v)
      }
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)))
  }

  // Giữ nguyên phần đầu file (ghi chú + hàm APPLY), chỉ thay khối CHANDE_SETTINGS.
  async function settingsText(values, current) {
    const body = Object.keys(values).length
      ? `{\n${Object.entries(values).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`
      : '{}'
    const src = current ?? (await fetch(`${SETTINGS_FILE}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text()))
    const re = /window\.CHANDE_SETTINGS = (\{\}|\{\n[\s\S]*?\n\})\n/
    if (!re.test(src)) throw new Error('Không nhận ra cấu trúc chande-settings.js')
    return src.replace(re, () => `window.CHANDE_SETTINGS = ${body}\n`)
  }

  async function saveToDisk(values) {
    const ping = await fetch('__cms/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    if (!ping?.local) return null
    const text = await settingsText(values)
    const r = await fetch('__cms/save', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ files: [{ path: SETTINGS_FILE, text }] }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
    return 'Đã ghi chande-settings.js xuống máy — commit + push để lên GitHub Pages.'
  }

  // Token GitHub: chung khoá với cms.html (cùng origin trên GitHub Pages).
  const GH_KEY = 'chande-cms-gh'
  function ghConfig() {
    let cfg = {}
    try { cfg = JSON.parse(localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY) || '{}') } catch (e) {}
    const guess = location.hostname.endsWith('github.io')
      ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1] || ''}`
      : 'kaixapham/chande-www'
    return { repo: cfg.repo || guess, branch: cfg.branch || 'main', token: cfg.token || '', remember: !!cfg.remember }
  }
  function ghStore(cfg) {
    const v = JSON.stringify(cfg)
    try {
      sessionStorage.setItem(GH_KEY, v)
      if (cfg.remember) localStorage.setItem(GH_KEY, v)
      else localStorage.removeItem(GH_KEY)
    } catch (e) {}
  }

  async function saveToGitHub(values) {
    const cfg = ghConfig()
    if (!cfg.token || !cfg.repo) return null
    const branch = cfg.branch || 'main'
    const api = (path, opts = {}) =>
      fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
      }).then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`)
        return j
      })
    const cur = await api(`/contents/${SETTINGS_FILE}?ref=${encodeURIComponent(branch)}`)
    const bin = (b64) => Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0))
    const text = await settingsText(values, new TextDecoder().decode(bin(cur.content)))
    const bytes = new TextEncoder().encode(text)
    let b64 = ''
    for (let i = 0; i < bytes.length; i += 0x8000) b64 += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    const res = await api(`/contents/${SETTINGS_FILE}`, {
      method: 'PUT',
      body: JSON.stringify({ message: 'Settings: lưu thông số từ bảng setting (H)', content: btoa(b64), sha: cur.sha, branch }),
    })
    return `Đã commit ${res.commit.sha.slice(0, 7)} lên ${cfg.repo} — GitHub Pages cập nhật sau khoảng 1 phút.`
  }

  async function saveAsDefaults() {
    const values = collectSettings()
    saveBtn.disabled = true
    msg.classList.remove('is-bad')
    msg.textContent = 'Đang lưu…'
    try {
      let done = await saveToDisk(values)
      if (done == null) done = await saveToGitHub(values)
      if (done == null) {
        // Không có server local, chưa có token -> hỏi token ngay trong bảng.
        showGhForm(true)
        msg.textContent = 'Trên GitHub Pages cần token GitHub để lưu thẳng vào repo — nhập bên dưới, hoặc bấm "Tải file".'
        return
      }
      showGhForm(false)
      // Bản vừa lưu thành mặc định mới -> localStorage không còn gì khác nó.
      window.CHANDE_SETTINGS = values
      for (const [k, v] of Object.entries(values)) {
        const dot = k.indexOf('.')
        const m = MODS[k.slice(0, dot)]
        if (m?.defaults) try { set(m.defaults, k.slice(dot + 1), structuredClone(v)) } catch (e) {}
      }
      saveSettings()
      msg.textContent = done
    } catch (e) {
      msg.classList.add('is-bad')
      msg.textContent = String(e.message || e)
      // token sai / hết hạn -> mở lại ô nhập
      if (/GitHub 40[13]/.test(String(e.message))) showGhForm(true)
    } finally {
      saveBtn.disabled = false
    }
  }

  // Tải chande-settings.js về máy (thay cho clipboard — trình duyệt hay chặn).
  async function downloadSettings() {
    const text = await settingsText(collectSettings())
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/javascript' }))
    a.download = 'chande-settings.js'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    msg.classList.remove('is-bad')
    msg.textContent = 'Đã tải chande-settings.js — chép vào assets/js/ của repo rồi commit (hoặc gửi file cho Claude).'
  }

  function showGhForm(on) {
    const f = dev.querySelector('[data-gh]')
    if (!f) return
    f.hidden = !on
    if (!on) return
    const cfg = ghConfig()
    f.querySelector('[name=repo]').value = cfg.repo
    f.querySelector('[name=remember]').checked = cfg.remember
    f.querySelector('[name=token]').focus()
  }

  /* ---------------------------------------------------------- ảnh demo ----- */
  // Ghi vào biến CSS ở <html> nên ảnh sống sót qua mọi lần Barba swap container.
  function applyShot(slot, url) {
    const el = document.documentElement
    const prop = `--shot-${slot}`
    const flag = slot === 'a' ? 'shotA' : 'shotB'
    if (url) {
      el.style.setProperty(prop, `url("${url}")`)
      el.dataset[flag] = '1'
    } else {
      el.style.removeProperty(prop)
      delete el.dataset[flag]
    }
  }

  function loadShots() {
    let s
    try { s = JSON.parse(localStorage.getItem(KEY_SHOTS) || 'null') } catch (e) {}
    if (!s) return
    if (s.a) applyShot('a', s.a)
    if (s.b) applyShot('b', s.b)
  }

  function saveShot(slot, dataUrl) {
    let s = {}
    try { s = JSON.parse(localStorage.getItem(KEY_SHOTS) || '{}') } catch (e) {}
    if (dataUrl) s[slot] = dataUrl
    else delete s[slot]
    try { localStorage.setItem(KEY_SHOTS, JSON.stringify(s)) } catch (e) {}
  }

  function readShot(slot, file, note) {
    // Hiển thị ngay bằng object URL, không phải chờ đọc xong.
    applyShot(slot, URL.createObjectURL(file))
    if (file.size > MAX_SHOT) {
      note(`${(file.size / 1048576).toFixed(1)}MB — chỉ giữ trong phiên này`)
      return
    }
    const fr = new FileReader()
    fr.onload = () => {
      applyShot(slot, fr.result)
      saveShot(slot, fr.result)
      note(file.name)
    }
    fr.readAsDataURL(file)
  }

  /* ---------------------------------------------------------------- CSS ---- */
  // Giao diện chép theo bảng Controls của Toolcraft: tấm kính tối 300px góc phải,
  // Inter, nhãn trên – ô dưới, slider track 1px + núm vuông 9px, ô cao 28.
  const style = document.createElement('style')
  style.textContent = `
.cdev{
  --fg:#fafafa; --fg-60:rgba(250,250,250,.6); --fg-75:rgba(250,250,250,.75);
  --muted:#b4b4b4; --line:rgba(250,250,250,.12); --fill:rgba(250,250,250,.05);
  --fill-2:rgba(250,250,250,.1); --track:rgba(180,180,180,.38); --accent:#0c8ce9;
  position:fixed; top:10px; right:10px; z-index:10002;
  width:300px; max-height:calc(100vh - 20px);
  display:flex; flex-direction:column; overflow:hidden;
  /* Toolcraft dùng kính mờ blur(40px), nhưng trên trang cuộn mượt nó bắt GPU làm
     mờ lại cả dải phía sau ở MỖI khung hình — nguồn lag lớn. Nền gần đặc thay thế. */
  background:rgba(23,23,23,.94); color:var(--fg);
  border:1px solid var(--line); border-radius:8px;
  font:500 12px/1.375 'Inter Variable',Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;
  letter-spacing:normal; text-transform:none; -webkit-font-smoothing:antialiased;
  color-scheme:dark;
}
.cdev.is-hidden{display:none}
.cdev *{box-sizing:border-box}
.cdev button,.cdev input,.cdev select{font:inherit; color:inherit; letter-spacing:inherit}
.cdev button{cursor:pointer}
.cdev :focus-visible{outline:2px solid rgba(140,140,140,.6); outline-offset:1px}

/* ---- đầu bảng ---- */
.cdev__head{display:flex; align-items:center; justify-content:space-between; gap:12px;
  height:36px; padding:0 4px 0 12px; flex-shrink:0}
.cdev__title{margin:0; font-size:13px; line-height:18px; font-weight:500}
.cdev__icons{display:flex; gap:4px}
.cdev__icon{display:inline-grid; place-items:center; width:28px; height:28px; padding:0;
  background:transparent; border:1px solid transparent; border-radius:8px; color:var(--fg)}
.cdev__icon:hover{background:var(--fill-2)}
.cdev__save{height:28px; padding:0 10px; border-radius:8px; background:var(--fill-2);
  border:1px solid var(--line); font-size:12px; font-weight:500; display:inline-flex; align-items:center; gap:6px}
.cdev__save:hover{background:rgba(250,250,250,.16)}
.cdev__save::before{content:''; width:6px; height:6px; border-radius:50%; background:var(--muted)}
.cdev__save.is-dirty::before{background:var(--accent)}
.cdev__save:disabled{opacity:.5; cursor:progress}
.cdev__msg{display:block; margin-top:4px; color:var(--fg-60)}
.cdev__msg.is-bad{color:#ff7a70}
.cdev__msg:empty{display:none}
.cdev__gh{display:flex; flex-direction:column; gap:6px; margin-top:8px}
.cdev__gh[hidden]{display:none}
.cdev__gh .cdev__in{width:100%}
.cdev__gh a{color:var(--fg-60)}
.cdev__gh .cdev__btns .cdev__btn{font-size:12px}
.cdev__icon svg{width:14px; height:14px}
.cdev.is-closed .cdev__icon[data-fold] svg{transform:rotate(180deg)}
.cdev.is-closed .cdev__body{display:none}

/* min-height:0 để thân bảng co lại trong khung flex dọc (không thì tràn ra và bị cắt, không cuộn được);
   overscroll-behavior: cuộn hết bảng không kéo theo trang */
.cdev__body{flex:1 1 auto; min-height:0; overflow:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:rgba(250,250,250,.1) transparent}
.cdev__body::-webkit-scrollbar{width:4px}
.cdev__body::-webkit-scrollbar-thumb{background:rgba(250,250,250,.1); border-radius:999px}

/* ---- section ---- */
.cdev__sec{padding:12px; border-top:1px solid rgba(250,250,250,.05); display:flex; flex-direction:column; gap:12px}
.cdev__sec:first-child{border-top:0; padding-top:4px}
.cdev__sec > h4{margin:0; min-height:24px; display:flex; align-items:center;
  font-size:11px; line-height:11px; font-weight:600; text-transform:uppercase; color:var(--fg-75)}

/* ---- một dòng điều khiển: nhãn trên, ô dưới ---- */
.cdev__f{display:flex; flex-direction:column; gap:4px}
.cdev__lab{display:flex; align-items:center; justify-content:space-between; gap:12px; min-height:20px}
.cdev__lab > label,.cdev__lab > span:first-child{color:var(--fg-60); font-size:12px; font-weight:500}
.cdev__v{color:var(--muted); font-weight:400; font-variant-numeric:tabular-nums}

.cdev__in,.cdev__sel{height:28px; width:100%; padding:2px 8px; border-radius:8px;
  background:var(--fill); border:1px solid var(--line); font-weight:400; outline:0}
.cdev__in:focus,.cdev__sel:focus{border-color:rgba(250,250,250,.3)}
.cdev__in.is-upper{text-transform:uppercase}
.cdev__sel{appearance:none; -webkit-appearance:none; cursor:pointer; font-weight:500;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M2 3.5l3 3 3-3' fill='none' stroke='%23b4b4b4' stroke-width='1.2'/%3E%3C/svg%3E");
  background-repeat:no-repeat; background-position:right 8px center; padding-right:24px}
.cdev__sel option{background:#262626}

/* slider: track 1px, phần đã kéo màu trắng, núm vuông 9px bo 2 */
.cdev__rg{appearance:none; -webkit-appearance:none; width:100%; height:18px; margin:0;
  background:linear-gradient(var(--fg),var(--fg)) 0 50% / var(--p,0%) 1px no-repeat,
             linear-gradient(var(--track),var(--track)) 0 50% / 100% 1px no-repeat;
  cursor:pointer}
.cdev__rg::-webkit-slider-thumb{-webkit-appearance:none; width:9px; height:9px; border-radius:2px; background:var(--fg); border:0}
.cdev__rg::-moz-range-thumb{width:9px; height:9px; border-radius:2px; background:var(--fg); border:0}

/* màu: ô swatch + ô hex dính nhau như Toolcraft */
.cdev__col{display:flex}
.cdev__sw{position:relative; width:28px; height:28px; flex-shrink:0; display:grid; place-items:center;
  background:var(--fill); border:1px solid var(--line); border-right:0; border-radius:8px 0 0 8px}
.cdev__sw > span{width:12px; height:12px; border-radius:3px; box-shadow:inset 0 0 0 1px rgba(250,250,250,.2)}
.cdev__sw > input{position:absolute; inset:0; width:100%; height:100%; opacity:0; cursor:pointer; border:0; padding:0}
.cdev__col .cdev__in{border-radius:0 6px 6px 0; text-transform:uppercase}

/* switch 28×16, bật = xanh */
.cdev__tg{display:flex; align-items:center; gap:8px; min-height:20px; cursor:pointer}
.cdev__tg > span{color:var(--fg-60)}
.cdev__tg > input{appearance:none; -webkit-appearance:none; position:relative; flex-shrink:0;
  width:28px; height:16px; margin:0; border-radius:999px; background:rgba(250,250,250,.2);
  cursor:pointer; transition:background .15s}
.cdev__tg > input::after{content:''; position:absolute; top:1px; left:1px; width:14px; height:14px;
  border-radius:50%; background:#0a0a0a; transition:transform .15s}
.cdev__tg > input:checked{background:var(--accent)}
.cdev__tg > input:checked::after{transform:translateX(12px); background:var(--fg)}

/* nút */
.cdev__btns{display:flex; gap:8px; flex-wrap:wrap}
.cdev__btn{height:28px; padding:0 10px; border-radius:8px; flex:1 1 auto;
  background:var(--fill-2); border:1px solid var(--line); font-size:13px; font-weight:500; white-space:nowrap}
.cdev__btn:hover{background:rgba(250,250,250,.16)}
.cdev__btn[aria-pressed=true]{background:var(--fg); color:#171717; border-color:var(--fg)}

/* timeline loading */
.cdev__tl{display:flex; flex-direction:column; gap:4px}
.cdev__time{color:var(--muted); font-weight:400; font-variant-numeric:tabular-nums}

/* ảnh demo */
.cdev__file{display:flex; align-items:center; gap:8px}
.cdev__file input[type=file]{display:none}
.cdev__note{flex:1; min-width:0; color:var(--muted); font-weight:400;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap}

.cdev__foot{flex-shrink:0; padding:8px 12px; border-top:1px solid rgba(250,250,250,.05);
  color:var(--muted); font-weight:400; font-size:11px}
.cdev__foot kbd{font:inherit; font-weight:500; color:var(--fg); padding:1px 5px;
  border:1px solid var(--line); border-radius:4px; background:var(--fill)}

@media (max-width:599px){
  .cdev{left:10px; width:auto; max-height:60vh}
}`
  document.head.appendChild(style)

  /* ---------------------------------------------------------------- DOM ---- */
  const ICON = {
    reset:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 8a5.5 5.5 0 1 0 1.6-3.9"/><path d="M2.5 2.5v3h3"/></svg>',
    chevron:
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l4-4 4 4"/></svg>',
  }

  const dev = document.createElement('div')
  dev.className = 'cdev'
  dev.setAttribute('role', 'dialog')
  dev.setAttribute('aria-label', 'Settings')
  // Lenis chặn wheel cả trang để cuộn mượt — báo nó bỏ qua bảng để bảng tự cuộn.
  dev.setAttribute('data-lenis-prevent', '')
  dev.innerHTML = `
  <div class="cdev__head">
    <p class="cdev__title">Settings</p>
    <div class="cdev__icons">
      <button type="button" class="cdev__save" data-save title="Lưu thông số thành mặc định của site (assets/js/chande-settings.js)">Lưu</button>
      <button type="button" class="cdev__icon" data-reset title="Reset tab này" aria-label="Reset tab này">${ICON.reset}</button>
      <button type="button" class="cdev__icon" data-fold title="Thu gọn" aria-label="Thu gọn" aria-expanded="true">${ICON.chevron}</button>
    </div>
  </div>
  <div class="cdev__body">
    <section class="cdev__sec">
      <div class="cdev__f">
        <div class="cdev__lab"><label for="cdev-tab">Mục</label></div>
        <select id="cdev-tab" class="cdev__sel" data-tabsel>
          ${TABS.map((t) => `<option value="${t.id}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div class="cdev__ctrl"></div>
    </section>
    <div class="cdev__panel"></div>
  </div>
  <div class="cdev__foot"><kbd>H</kbd> ẩn / hiện bảng · <kbd>K</kbd> mở CMS<span class="cdev__msg" data-msg role="status"></span>
    <form class="cdev__gh" data-gh hidden>
      <input class="cdev__in" name="repo" type="text" spellcheck="false" placeholder="owner/repo" aria-label="Repo GitHub">
      <input class="cdev__in" name="token" type="password" autocomplete="off" spellcheck="false" placeholder="github_pat_…" aria-label="Token GitHub">
      <label class="cdev__tg"><input name="remember" type="checkbox"><span>Nhớ token trên máy này</span></label>
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Tạo fine-grained token (chỉ repo này, Contents: Read and write)</a>
      <div class="cdev__btns">
        <button class="cdev__btn" type="submit">Lưu lên GitHub</button>
        <button class="cdev__btn" type="button" data-download>Tải file</button>
      </div>
    </form></div>`
  const panel = dev.querySelector('.cdev__panel')
  const ctrl = dev.querySelector('.cdev__ctrl')
  const tabSel = dev.querySelector('[data-tabsel]')
  const saveBtn = dev.querySelector('[data-save]')
  const msg = dev.querySelector('[data-msg]')

  let tab = TABS[0].id
  let shown = false // cả bảng ẩn cho tới khi bấm H

  /* ------------------------------------------------------------- các ô ---- */
  const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
  const pct = (el) =>
    el.style.setProperty('--p', `${((el.value - el.min) / (el.max - el.min)) * 100}%`)

  function row(g, f) {
    const cfg = live(g).config
    const v = get(cfg, f.path)
    const r = document.createElement('div')
    r.className = 'cdev__f'
    const id = `cdev-${g.mod}-${f.path.replace(/\./g, '-')}`

    if (f.type === 'bool')
      r.innerHTML = `<label class="cdev__tg"><input id="${id}" type="checkbox" ${v ? 'checked' : ''}><span>${f.label}</span></label>`
    else if (f.type === 'color')
      r.innerHTML =
        `<div class="cdev__lab"><label for="${id}-hex">${f.label}</label></div>` +
        `<div class="cdev__col"><span class="cdev__sw"><span style="background:${v}"></span>` +
        `<input id="${id}" type="color" value="${v}" aria-label="Chọn màu ${f.label}"></span>` +
        `<input id="${id}-hex" class="cdev__in" type="text" maxlength="7" spellcheck="false" value="${v}"></div>`
    else if (f.type === 'text')
      r.innerHTML =
        `<div class="cdev__lab"><label for="${id}">${f.label}</label></div>` +
        `<input id="${id}" class="cdev__in is-upper" type="text" value="${esc(v)}" placeholder="—">`
    else if (f.type === 'select')
      r.innerHTML =
        `<div class="cdev__lab"><label for="${id}">${f.label}</label></div>` +
        `<select id="${id}" class="cdev__sel">${f.options
          .map((o) => {
            // chuỗi, hoặc [giá trị, nhãn hiển thị]
            const [ov, ol] = Array.isArray(o) ? o : [o, o]
            return `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${ol}</option>`
          }).join('')}</select>`
    else
      r.innerHTML =
        `<div class="cdev__lab"><label for="${id}">${f.label}</label><span class="cdev__v">${v}</span></div>` +
        `<input id="${id}" class="cdev__rg" type="range" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">`

    const out = r.querySelector('.cdev__v')
    const commit = (nv) => {
      set(cfg, f.path, nv)
      if (out) out.textContent = nv
      f.apply?.(nv) // vd. preset: chép cả bộ số -> dựng lại bảng để các ô hiện số mới
      live(g).refresh?.()
      saveSettings()
      if (f.apply) buildPanel()
    }

    if (f.type === 'color') {
      // Hai ô cùng sửa một giá trị: bảng chọn màu và ô gõ/dán mã hex.
      const hex = r.querySelector('.cdev__in')
      const pick = r.querySelector('input[type=color]')
      const chip = r.querySelector('.cdev__sw > span')
      pick.addEventListener('input', () => {
        hex.value = pick.value
        chip.style.background = pick.value
        commit(pick.value)
      })
      const fromHex = () => {
        const t = hex.value.trim().replace(/^#?/, '')
        // Chấp nhận cả dạng 3 kí tự (#abc -> #aabbcc).
        const full =
          t.length === 3 && /^[0-9a-f]{3}$/i.test(t)
            ? t.replace(/./g, (c) => c + c)
            : t
        if (!/^[0-9a-f]{6}$/i.test(full)) {
          hex.value = get(cfg, f.path) // gõ sai thì trả về giá trị đang dùng
          return
        }
        const nv = `#${full.toLowerCase()}`
        hex.value = nv
        pick.value = nv
        chip.style.background = nv
        commit(nv)
      }
      hex.addEventListener('change', fromHex)
      hex.addEventListener('blur', fromHex)
      hex.addEventListener('keydown', (e) => e.key === 'Enter' && fromHex())
      return r
    }

    const el = r.querySelector('input,select')
    if (f.type === 'range') pct(el)
    el.addEventListener('input', () => {
      if (f.type === 'range') pct(el)
      commit(f.type === 'bool' ? el.checked : f.type === 'range' ? parseFloat(el.value) : el.value)
    })
    return r
  }

  function shotRow(slot, label) {
    const r = document.createElement('div')
    r.className = 'cdev__f'
    r.innerHTML = `
      <div class="cdev__lab"><span>${label}</span></div>
      <div class="cdev__file">
        <span class="cdev__note">Chưa nạp</span>
        <button class="cdev__btn" type="button" data-pick>Chọn ảnh</button>
        <button class="cdev__icon" type="button" data-clear aria-label="Bỏ ảnh">✕</button>
        <input type="file" accept="image/*">
      </div>`
    const note = r.querySelector('.cdev__note')
    const file = r.querySelector('input[type=file]')
    const say = (t) => (note.textContent = t || 'Chưa nạp')
    r.querySelector('[data-pick]').addEventListener('click', () => file.click())
    r.querySelector('[data-clear]').addEventListener('click', () => {
      applyShot(slot, null); saveShot(slot, null); file.value = ''; say('')
    })
    file.addEventListener('change', () => {
      const f = file.files?.[0]
      if (f) readShot(slot, f, say)
    })
    if (document.documentElement.dataset[slot === 'a' ? 'shotA' : 'shotB']) say('Đã nạp')
    return r
  }

  function section(title) {
    const box = document.createElement('section')
    box.className = 'cdev__sec'
    const h = document.createElement('h4')
    h.textContent = title
    box.appendChild(h)
    return box
  }

  function buildPanel() {
    panel.textContent = ''
    for (const g of groups()) {
      if (g.tab !== tab) continue
      const box = section(g.title)
      for (const f of g.items) box.appendChild(row(g, f))
      panel.appendChild(box)
    }
    if (TAB(tab).mod === 'transition' && CT) {
      const box = section('Ảnh demo')
      box.appendChild(shotRow('a', 'Page A — Gallery'))
      box.appendChild(shotRow('b', 'Page B — About'))
      panel.appendChild(box)
    }
  }

  /* ------------------------------------------------- điều khiển theo tab --- */
  let unbind = null

  function buildCtrl() {
    unbind?.()
    unbind = null
    ctrl.textContent = ''

    if (tab === 'loading' && CL) {
      ctrl.innerHTML = `
        <div class="cdev__btns">
          <button class="cdev__btn" type="button" data-toggle>▶ Play</button>
          <button class="cdev__btn" type="button" data-restart>Restart</button>
        </div>
        <div class="cdev__tl" style="margin-top:12px">
          <div class="cdev__lab"><label for="cdev-tl">Timeline</label><span class="cdev__time">0.00 / 0.00s</span></div>
          <input id="cdev-tl" class="cdev__rg" type="range" min="0" max="1000" value="0" step="1">
        </div>`
      const range = ctrl.querySelector('.cdev__rg')
      const timeEl = ctrl.querySelector('.cdev__time')
      const playEl = ctrl.querySelector('[data-toggle]')
      const secs = (ms) => (ms / 1000).toFixed(2)
      let dragging = false
      range.addEventListener('pointerdown', () => (dragging = true))
      range.addEventListener('pointerup', () => (dragging = false))
      range.addEventListener('input', () => {
        pct(range)
        CL.seekTime((range.value / 1000) * CL.duration)
      })
      unbind = CL.onUpdate((s) => {
        if (!dragging) {
          range.value = Math.round((s.time / CL.duration) * 1000)
          pct(range)
        }
        timeEl.textContent = `${secs(s.time)} / ${secs(CL.duration)}s`
        playEl.textContent = s.playing ? '❚❚ Pause' : '▶ Play'
      })
    } else if (tab === 'hero' || tab === 'mosaic' || tab === 'reveal') {
      // Tab Mosaic dùng chung nút này: đổi ảnh là cách thử phanh / nhả của mosaic.
      const here = !!document.querySelector('[data-hero]')
      ctrl.innerHTML = `<div class="cdev__btns">${
        here
          ? '<button class="cdev__btn" type="button" data-hero-next>Đổi ảnh ngay</button>'
          : '<button class="cdev__btn" type="button" data-go="index.html">Về Home để xem</button>'
      }</div>`
    } else if (tab === 'gallery') {
      const here = !!document.querySelector('[data-gallery]')
      ctrl.innerHTML = `<div class="cdev__btns">${
        here
          ? '<button class="cdev__btn" type="button" data-duck-recall>Gọi vịt về giữa màn</button>'
          : '<button class="cdev__btn" type="button" data-go="gallery.html">Sang Gallery để xem</button>'
      }</div>`
    } else if (CT) {
      const canPlay = CT.canPlayInPlace ? CT.canPlayInPlace() : true
      ctrl.innerHTML = `
        <div class="cdev__btns">
          ${canPlay ? '<button class="cdev__btn" type="button" data-play-ct>▶ Chạy rèm</button>' : ''}
          <button class="cdev__btn" type="button" data-go="index.html">Home</button>
          <button class="cdev__btn" type="button" data-go="gallery.html">Page A</button>
          <button class="cdev__btn" type="button" data-go="about.html">Page B</button>
        </div>`
    }
  }

  /* ------------------------------------------------------------- sự kiện -- */
  tabSel.addEventListener('change', () => {
    tab = tabSel.value
    const t = TAB(tab)
    if (t.variant) CT.setVariant(t.variant)
    buildCtrl()
    buildPanel()
    saveSettings()
  })

  dev.addEventListener('click', (e) => {
    const b = e.target.closest('button')
    if (!b) return
    if (b.hasAttribute('data-fold')) {
      dev.classList.toggle('is-closed')
      b.setAttribute('aria-expanded', String(!dev.classList.contains('is-closed')))
    } else if (b.hasAttribute('data-save')) {
      saveAsDefaults()
    } else if (b.hasAttribute('data-download')) {
      downloadSettings()
    } else if (b.hasAttribute('data-reset')) {
      for (const g of groups())
        if (g.tab === tab)
          for (const f of g.items)
            set(live(g).config, f.path, structuredClone(get(live(g).defaults, f.path)))
      saveSettings()
      // Một tab có thể gồm nhiều module (Gallery = lưới + vịt + cỏ).
      new Set(groups().filter((g) => g.tab === tab).map((g) => g.mod)).forEach((m) => MODS[m]?.refresh?.())
      buildPanel()
    } else if (b.hasAttribute('data-toggle')) CL.toggle()
    else if (b.hasAttribute('data-restart')) CL.restart()
    else if (b.hasAttribute('data-play-ct')) CT.play()
    else if (b.hasAttribute('data-hero-next')) CH?.next()
    else if (b.hasAttribute('data-duck-recall')) CDK?.recall?.()
    else if (b.dataset.go) CT.go(b.dataset.go)
  })

  function syncTabs() {
    tabSel.value = tab
  }

  function setShown(v) {
    shown = v
    dev.classList.toggle('is-hidden', !shown)
    // Bật bằng H là để chỉnh: mở luôn phần setting chứ không chỉ đầu bảng.
    if (shown) {
      dev.classList.remove('is-closed')
      dev.querySelector('[data-fold]').setAttribute('aria-expanded', 'true')
    }
    saveSettings()
  }

  dev.querySelector('[data-gh]').addEventListener('submit', (e) => {
    e.preventDefault()
    const f = e.currentTarget
    const token = f.querySelector('[name=token]').value.trim()
    const repo = f.querySelector('[name=repo]').value.trim()
    if (!token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
      msg.classList.add('is-bad')
      msg.textContent = 'Cần repo dạng owner/tên và một token.'
      return
    }
    ghStore({ ...ghConfig(), repo, token, remember: f.querySelector('[name=remember]').checked })
    f.querySelector('[name=token]').value = ''
    saveAsDefaults()
  })

  addEventListener('keydown', (e) => {
    if (e.target.matches('input,textarea,select,[contenteditable]')) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    if (e.code === 'KeyH') return void setShown(!shown)
    // K: mở CMS thay ảnh ở tab riêng (tên cửa sổ cố định -> bấm lại thì quay về
    // đúng tab CMS đã mở chứ không mở thêm tab mới).
    if (e.code === 'KeyK') return void window.open('cms.html', 'chande-cms')?.focus()
    // Phím tắt timeline chỉ sống khi bảng đang hiện — không thì Space cuộn trang.
    if (!CL || !shown) return
    if (e.code === 'Space') { e.preventDefault(); CL.toggle() }
    else if (e.code === 'ArrowRight') CL.seekTime(CL.state.time + 100)
    else if (e.code === 'ArrowLeft') CL.seekTime(CL.state.time - 100)
  })

  // Nút của tab Hero tuỳ trang đang đứng có hero hay không.
  window.barba?.hooks?.afterEnter(() => (tab === 'hero' || tab === 'gallery') && buildCtrl())

  /* ----------------------------------------------------------- khởi động - */
  loadSettings()
  loadShots()
  document.body.appendChild(dev)
  dev.classList.toggle('is-hidden', !shown)
  syncTabs()
  buildCtrl()
  buildPanel()
  saveSettings() // chấm báo "còn chỉnh chưa Lưu" ngay khi mở trang
}

// Chờ các file hiệu ứng dạng module (vịt, cỏ) chạy xong rồi mới dựng bảng.
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', chandeDevtools, { once: true })
else chandeDevtools()
