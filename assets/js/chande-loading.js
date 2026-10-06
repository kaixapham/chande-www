/* =============================================================================
 * CHANDE BOOTCAMP — Loading
 * -----------------------------------------------------------------------------
 * Dựng theo Figma "Chande WWW" node 210:18194 — 3 frame:
 *   Step 1        : thanh loading nằm giữa màn, fill 15%
 *   Step 2        : vẫn giữa màn, fill 50%
 *   Step 3 Finnish: thanh trượt lên đỉnh màn và HOÁ THÀNH header của site
 *                   (ô trái đổi nền kem, LOADING% -> đồng hồ HANOI,
 *                    WORKJAM -> GALLERY, CHILL & FUN -> ABOUT, hiện nút menu)
 *
 * Thanh gồm 4 ô, đúng tỉ lệ khổ 1920 của Figma:
 *   493 | 467 (track) | 468 | 492  ->  25.677% | 24.323% | 24.375% | 25.625%
 *
 * ĐỒNG HỒ CHUNG: mọi bước chạy trên MỘT trục thời gian T (ms). Các bước chuyển
 * động dùng Web Animations API ở trạng thái pause, mỗi frame chỉ gán
 * `anim.currentTime = T`. Nhờ vậy timeline TUA ĐƯỢC hai chiều — play / pause /
 * kéo thanh trượt / nhảy tới mốc đều đi qua đúng một đường.
 *
 * RESPONSIVE: mọi số trong CONFIG là px của bản thiết kế khổ 1920, quy ra `em`
 * bằng cách chia 16, vì gốc `.cl` đặt
 *     font-size: clamp(1440px, 100vw, 1920px) / 120   (= 16px ở khổ 1920)
 * nên 1em luôn bằng 1px-thiết-kế. Bề rộng 4 ô dùng % để full-bleed ở mọi khổ.
 *
 * BÙ CAP-HEIGHT: Figma trim text box theo cap-height (~0.72em) còn CSS dùng
 * line-height 0.9, nên khối chữ bù `-capTrim em` ở MÉP TRÊN dòng đầu và MÉP DƯỚI
 * dòng cuối (không phải từng dòng).
 *
 * CÁCH DÙNG: nhúng đúng một thẻ script này ở cuối <body>. File tự chạy, tự chèn
 * DOM + CSS, không phụ thuộc UI điều khiển nào — bảng timeline nằm ở trang demo.
 *
 * API lúc chạy:
 *   window.CHANDE_LOADING = {
 *     config, defaults, state, duration, marks,
 *     play(), pause(), toggle(), restart(),
 *     seekTime(ms), seekProgress(0..1), finish(),
 *     onUpdate(cb) -> unsubscribe
 *   }
 * Sự kiện trên document: 'chande-loading:done'
 * ========================================================================== */
(() => {
  'use strict'

  const CONFIG = {
    enabled: true,
    autoplay: true,

    // ---- Nội dung -----------------------------------------------------------
    brand: ['CHANDE', 'BOOTCAMP'],
    loadingLabel: 'LOADING', // dòng trên, ô trái, lúc đang tải
    clockCity: 'HANOI', // dòng trên, ô trái, sau khi xong
    clockZone: 'Asia/Ho_Chi_Minh',
    clockSuffix: 'GMT',
    home: 'index.html', // logo + wordmark là link về trang chủ
    nav: [
      { num: '01', during: 'WORKJAM', after: 'GALLERY', href: 'gallery.html' },
      { num: '02', during: 'CHILL & FUN', after: 'ABOUT', href: 'about.html' },
    ],

    // ---- Trục thời gian (ms) ------------------------------------------------
    enterDelay: 120, // chờ trước khi thanh hiện ra
    enterDuration: 560, // thanh wipe từ giữa ra hai bên
    loadDuration: 3200, // 0% -> 100%
    holdDuration: 340, // giữ ở 100% trước khi trượt lên
    dockDuration: 900, // trượt lên đỉnh + đổi màu + lật chữ
    revealDuration: 820, // nền tối rút xuống, lộ trang
    swapDelay: 180, // lật chữ trễ hơn lúc bắt đầu trượt
    revealAt: 0.35, // nền bắt đầu rút khi thanh đi được 35% quãng dock
    menuAt: 0.45, // nút menu bắt đầu hiện ở 45% quãng dock
    fillWipe: 0.7, // fill xanh trượt khỏi track trong 70% quãng dock
    tail: 200, // đuôi timeline cho dễ nhìn khi tua

    // Chờ window 'load' thật: giữ lại ở `gateAt` cho tới khi trang tải xong,
    // tối đa `gateMaxWait` ms. Chỉ áp dụng khi đang PLAY, tua tay thì bỏ qua.
    waitForLoad: true,
    gateAt: 0.92,
    gateMaxWait: 6000,

    // Đường cong tiến trình [t, p] — có các đoạn chững cho giống loading thật,
    // và đi qua đúng hai mốc 15% / 50% của Figma.
    curve: [
      [0, 0],
      [0.14, 0.15],
      [0.3, 0.16],
      [0.46, 0.5],
      [0.6, 0.53],
      [0.8, 0.88],
      [0.92, 0.93],
      [1, 1],
    ],

    // ---- Block reveal cho chữ ----------------------------------------------
    // Mỗi TỪ được bọc riêng: một khối màu quét ngang từ trái sang phủ kín, chữ
    // hiện ra dưới khối, rồi khối quét tiếp sang phải biến mất.
    // Chạy trên cùng đồng hồ với phần còn lại (Web Animations, pause + gán
    // currentTime) nên tua thanh timeline vẫn đúng.
    textReveal: {
      enabled: true,
      color: '#68f12b', // màu khối quét
      startDelay: 120, // ms — sau khi thanh đã hiện xong
      stagger: 55, // ms giữa các từ
      inDuration: 320, // khối quét vào
      hold: 90, // giữ kín
      outDuration: 380, // khối quét ra
      ease: 'cubic-bezier(0.86, 0, 0.07, 1)',
    },

    // ---- Hình học (px của bản thiết kế khổ 1920) ----------------------------
    barHeight: 80,
    cellPad: 24, // padding ô trái
    navPad1: 32, // padding-left ô nav 01
    navPad2: 40, // padding-left ô nav 02
    logoW: 46.4,
    logoH: 32,
    logoGap: 10.667,
    fontSize: 20,
    lineHeight: 0.9,
    // Bù cap-height được ĐO TỪ FONT THẬT lúc chạy (xem measure()), không đoán.
    labelGap: 4, // khoảng cách 01 <-> WORKJAM
    flipGap: 1, // hở giữa hai mặt chữ trong ô cuộn — xem ghi chú ở .cl__flip-in
    menuSize: 80,
    dotsW: 20,
    dotsH: 6,
    dotsGap: 8,

    // Bề rộng 4 ô, % của 1920 (493 / 467 / 468 / 492)
    // Đúng lưới 8 cột: 492 | 468 | 468 | 492 (mốc 492 / 960 / 1428). Figma ghi
    // 493 / 467 do làm tròn — để vậy là header lệch hero 1px ở mọi mép dọc.
    cellWidths: [25.625, 24.375, 24.375, 25.625],

    // ---- Màu ----------------------------------------------------------------
    bg: '#182220', // nền lúc loading (và nền khởi điểm của 4 ô)
    ink: '#0f1513', // nền tối của ô track sau khi xong + màu chấm nút menu
    cream: '#f5f0e3', // nền ô trái sau khi xong
    green: '#245535', // chữ trên nền kem
    track: '#2c3a38', // nền track lúc tải / nền ô nav 01 sau khi xong
    fill: '#68f12b', // fill xanh + nút menu
    navDone: '#236c3c', // nền ô nav 02 sau khi xong
    stroke: '#ffffff', // màu nét viền các ô lúc loading
    strokeOpacity: 0.12,

    // ---- Hành vi ------------------------------------------------------------
    becomeHeader: true, // xong thì thanh ở lại làm header; false = mờ đi rồi biến mất
    lockScroll: true,
    ease: 'cubic-bezier(0.76, 0, 0.24, 1)',
    fontDir: 'assets/fonts/',

    // ---- Responsive cơ bản --------------------------------------------------
    // Lưới tham chiếu của bản thiết kế: 8 cột, Stretch, margin 24, gutter 0 ở
    // khổ 1920  ->  cột rộng (1920 - 48) / 8 = 234, mốc cột lần lượt
    //   24 | 258 | 492 | 726 | 960 | 1194 | 1428 | 1662 | 1896
    // Biên 4 ô của thanh rơi đúng cột 2 / 4 / 6 (492 | 960 | 1428) — bản thiết
    // kế ghi 493 là do làm tròn — nên `cellWidths` ở trên chính là 2+2+2+2 cột,
    // chỉ khác là thanh full-bleed nên tràn cả hai lề 24.
    //
    // Từ 1440px trở lên: 1em = 1px-thiết-kế (100vw / 120). Dưới đó cỡ gốc chốt
    // cứng theo mốc, và thanh gộp còn 2 ô + nút menu neo ở mép phải.
    responsive: {
      tablet: { max: 899, base: 11, brand: 58, track: 42 },
      mobile: { max: 599, base: 10, brand: 64, track: 36 },
    },

    // ---- Effect Dither (ordered dithering) ---------------------------------
    // Tham số đặt tên đúng như bảng Dither. Nền là màu phẳng `bg`, dither chỉ
    // lượng tử hoá nó xuống `levels` mức với ngưỡng Bayer -> ra hoa văn mịn,
    // ĐỀU trên toàn màn, không có vệt sáng nào.
    // `amount` (mặc định 0) là tuỳ chọn thêm một dải sáng toả từ tâm cho nền,
    // chỉ bật khi thực sự muốn — để 0 thì nền phẳng đúng như bản thiết kế.
    dither: {
      enabled: true,
      style: 'bayer16', // 'bayer16' | 'bayer8' | 'bayer4' | 'bayer2'
      size: 1, // cạnh một ô dither, px màn hình
      levels: 8, // số mức mỗi kênh
      brightness: 1, // 100%
      contrast: 1,
      mono: false,
      monoColor: '#ffffff',
      amount: 0, // 0 = nền phẳng (mặc định). > 0 thêm dải sáng toả từ tâm.
      falloff: 1.35, // độ toả của dải sáng, chỉ có tác dụng khi amount > 0
      aspect: 1.6 // kéo dải sáng theo chiều ngang, chỉ khi amount > 0
    },
  }
  // Giá trị đã bấm Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
  window.CHANDE_SETTINGS_APPLY?.('loading', CONFIG)

  if (!CONFIG.enabled) return

  // Bản sao SÂU: `{ ...CONFIG }` dùng chung object lồng (dither, textReveal…) với
  // config, sửa config là defaults đổi theo -> Reset vô tác dụng.
  const DEFAULTS = structuredClone(CONFIG)
  const S = { ...CONFIG }
  const em = (px) => `${(px / 16).toFixed(4)}em`
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  // Nét viền = màu stroke + độ mờ; tính lúc gọi để đổi setting là ăn ngay.
  const hairline = () => {
    const v = parseInt(S.stroke.replace('#', ''), 16)
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${S.strokeOpacity})`
  }

  // Chiều cao text box kiểu Figma (trim cap-height ở hai đầu KHỐI chữ).
  // Giá trị thật do measure() ghi vào sau khi font tải xong; đây chỉ là mặc định
  // an toàn (line box đầy đủ) để không cắt chữ trong lúc chờ.
  const lineBox = S.fontSize * S.lineHeight
  let cap1 = lineBox
  let cap2 = lineBox * 2

  /* ------------------------------------------------------------- mốc giờ --- */
  const M = {}
  M.enterStart = S.enterDelay
  M.enterEnd = M.enterStart + S.enterDuration
  M.loadStart = M.enterStart + S.enterDuration * 0.5
  M.loadEnd = M.loadStart + S.loadDuration
  M.dockStart = M.loadEnd + S.holdDuration
  M.dockEnd = M.dockStart + S.dockDuration
  M.revealStart = M.dockStart + S.dockDuration * S.revealAt
  M.revealEnd = M.revealStart + S.revealDuration
  M.done = Math.max(M.dockEnd, M.revealEnd)
  const DURATION = M.done + S.tail

  // Thời điểm đạt một mốc tiến trình bất kỳ (dùng cho nút Step 1 / Step 2)
  function timeAtProgress(target) {
    const c = S.curve
    for (let i = 1; i < c.length; i++) {
      if (target <= c[i][1]) {
        const [ta, pa] = c[i - 1]
        const [tb, pb] = c[i]
        const u = pb === pa ? 1 : (target - pa) / (pb - pa)
        return M.loadStart + (ta + (tb - ta) * u) * S.loadDuration
      }
    }
    return M.loadEnd
  }
  M.step1 = timeAtProgress(0.15)
  M.step2 = timeAtProgress(0.5)
  M.step3 = M.done

  /* ---------------------------------------------------------------- CSS ---- */
  function css() {
    const w = S.cellWidths
    const R = S.responsive
    return `
@font-face{font-family:'Phudu';font-style:normal;font-weight:600;font-display:block;
  src:url('${S.fontDir}Phudu-SemiBold-latin.woff2') format('woff2');
  unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:'Phudu';font-style:normal;font-weight:600;font-display:block;
  src:url('${S.fontDir}Phudu-SemiBold-latin-ext.woff2') format('woff2');
  unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:'Phudu';font-style:normal;font-weight:600;font-display:block;
  src:url('${S.fontDir}Phudu-SemiBold-vietnamese.woff2') format('woff2');
  unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}

.cl{
  position:fixed; inset:0; z-index:9998;
  font-size:calc(clamp(1440px, 100vw, 1920px) / 120);
  font-family:'Phudu',ui-sans-serif,system-ui,sans-serif; font-weight:600;
  text-transform:uppercase; -webkit-font-smoothing:antialiased;
  /* trim trên / trim dưới (em của .cl__t) và chiều cao khối 1-2 dòng
     (em của .cl) — measure() ghi đè bằng metric thật của font */
  --cl-tt:0em; --cl-tb:0em;
  --cl-cap1:${em(lineBox)}; --cl-cap2:${em(lineBox * 2)};
}
.cl *{box-sizing:border-box; margin:0}

/* nền tối phủ toàn màn — rút xuống dưới để lộ trang */
.cl__backdrop{position:absolute; inset:0; background:${S.bg}; clip-path:inset(0 0 0 0)}
.cl__dither{position:absolute; inset:0; width:100%; height:100%; display:block;
  image-rendering:pixelated; image-rendering:crisp-edges}

/* thanh: nằm giữa màn -> trượt lên top:0 */
.cl__bar{
  position:absolute; left:0; right:0; top:0; height:${em(S.barHeight)};
  display:flex; align-items:stretch;
  transform:translateY(calc(50vh - ${em(S.barHeight / 2)}));
  clip-path:inset(0 50% 0 50%);
  will-change:transform,clip-path;
}

/* Lúc loading: mọi ô CHỈ CÓ STROKE, không fill — nền dither xuyên qua. Vật thể
   đặc duy nhất là khối loading xanh. Fill chỉ xuất hiện ở bước finish. */
.cl__cell{position:relative; height:100%; flex:0 0 auto; overflow:hidden;
  border:1px solid ${hairline()}; background:transparent}
.cl__cell--brand{width:${w[0]}%; border-right:0; padding:${em(S.cellPad)}; color:${S.cream}}
.cl__cell--track{width:${w[1]}%; border-right:0}
.cl__cell--nav{border-right:0}
.cl__cell--nav1{width:${w[2]}%; padding-left:${em(S.navPad1)};
  padding-block:${em(S.cellPad)}; color:#fff}
.cl__cell--nav2{width:${w[3]}%; padding-left:${em(S.navPad2)};
  padding-block:${em(S.cellPad)}; color:#fff; border-right:1px solid ${hairline()}}

/* fill xanh của track — bề rộng do đồng hồ chung ghi vào, không transition */
.cl__fill{position:absolute; inset:-1px auto -1px -1px; width:0%; background:${S.fill};
  will-change:width,transform}

/* ô trái: logo + wordmark | flipper bên phải */
.cl__row{display:flex; align-items:center; justify-content:space-between}
.cl__brand{display:flex; align-items:center; gap:${em(S.logoGap)};
  color:inherit; text-decoration:none}
.cl__logo{width:${em(S.logoW)}; height:${em(S.logoH)}; flex:none; color:currentColor}
.cl__logo svg{display:block; width:100%; height:100%}

/* flow-root chứ không phải block: cần một BFC, nếu không margin âm của dòng đầu
   sẽ COLLAPSE ra ngoài .cl__t thay vì cắt bớt chiều cao khối chữ. */
.cl__t{display:flow-root; font-size:${em(S.fontSize)}; line-height:${S.lineHeight};
  white-space:nowrap; font-variant-numeric:tabular-nums}
.cl__t > span{display:block}
/* Mỗi từ là một hộp inline-block để khối quét có chỗ bám. vertical-align phải
   là baseline (mặc định) — đổi sang top/middle là lệch mất phần bù cap-height. */
.cl__w{position:relative; display:inline-block}
.cl__wt{display:inline-block}
.cl__wb{
  position:absolute; inset:0; background:${S.textReveal.color};
  transform:scaleX(0); transform-origin:left center; pointer-events:none;
}

/* bù cap-height: cắt ở MÉP TRÊN dòng đầu và MÉP DƯỚI dòng cuối.
   Hai lượng này KHÔNG bằng nhau — trên = half-leading + (ascent - cap),
   dưới = descent + half-leading — nên phải đo, đoán đối xứng là cắt mất chữ. */
.cl__t > span:first-child{margin-top:calc(-1 * var(--cl-tt))}
.cl__t > span:last-child{margin-bottom:calc(-1 * var(--cl-tb))}

/* flipper: 2 mặt xếp chồng, trượt lên 1 mặt khi dock */
/* --cl-cap* là em của .cl (16px-thiết-kế), nên .cl__flip / .cl__flip-face phải
   giữ font-size gốc — .cl__t nằm BÊN TRONG mặt chữ, không phải chính nó. */
.cl__flip{overflow:hidden; height:var(--cl-cap2)}
/* Hở flipGap giữa hai mặt: mặt sau nằm SÁT mép dưới cửa sổ thì làm tròn
   sub-pixel để lọt một vệt ink mờ vào khung. Quãng lật cộng luôn khoảng hở này. */
.cl__flip-in{display:flex; flex-direction:column; gap:${em(S.flipGap)}}
.cl__flip-face{height:var(--cl-cap2); flex:none}
.cl__flip--right .cl__flip-face{text-align:right}

/* Số 01 / 02 bật "numr" (fraction numerator) — đúng token của Figma, cho ra
   chữ số nhỏ và nâng cao. Chỉ dòng SỐ, dòng nhãn giữ chữ số thường. */
.cl__t--num{font-feature-settings:"ornm" 1, "numr" 1}

/* ô nav: số 01/02 + nhãn (nhãn cũng là flipper, 1 dòng) */
.cl__navlink{display:flex; flex-direction:column; gap:${em(S.labelGap)};
  color:inherit; text-decoration:none}
.cl__navlink .cl__flip,
.cl__navlink .cl__flip-face{height:var(--cl-cap1)}

/* nút menu — chỉ hiện ở trạng thái xong */
.cl__menu{
  /* font:inherit BẮT BUỘC: <button> không kế thừa font-size (UA đặt 13.333px),
     nên mọi giá trị em bên trong nút sẽ tính sai cỡ nếu thiếu dòng này. */
  font:inherit;
  position:absolute; right:0; top:0; width:${em(S.menuSize)}; height:${em(S.menuSize)};
  background:${S.fill}; color:${S.ink}; border:0; padding:0; cursor:pointer;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:${em(S.dotsGap)}; clip-path:inset(0 0 0 100%);
}
.cl__menu svg{display:block; width:${em(S.dotsW)}; height:${em(S.dotsH)}}

/* xong: thanh ở lại làm header, phần còn lại không chặn chuột */
.cl.is-done{pointer-events:none}
.cl.is-done .cl__bar{pointer-events:auto}
.cl.is-done .cl__backdrop{visibility:hidden}

/* ---- Responsive cơ bản ----------------------------------------------------
 * Dưới 900px: bỏ hai ô nav chữ, thanh còn thương hiệu + track, nút menu neo
 * tuyệt đối ở mép phải thanh (lúc loading nó vẫn bị clip nên vô hình).
 * Dùng !important ở đây là cố ý: nền ô nav 02 do Web Animations điều khiển,
 * mà animation thắng khai báo author thường — chỉ !important mới đè được.
 */
@media (max-width:${R.tablet.max}px){
  .cl{font-size:${R.tablet.base}px}
  .cl__cell--nav1{display:none}
  .cl__cell--brand{width:${R.tablet.brand}%}
  .cl__cell--track{width:${R.tablet.track}%}
  .cl__cell--nav2{
    position:absolute; right:0; top:0; width:${em(S.menuSize)}; height:100%;
    padding:0; border:0 !important; background:transparent !important;
  }
  .cl__cell--nav2 .cl__navlink{display:none}
}
@media (max-width:${R.mobile.max}px){
  .cl{font-size:${R.mobile.base}px}
  .cl__cell--brand{width:${R.mobile.brand}%}
  .cl__cell--track{width:${R.mobile.track}%}
}
`
  }

  /* ---------------------------------------------------------------- DOM ---- */
  const LOGO =
    '<svg viewBox="0 0 46.4 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M10.7594 32H0V21.3333H10.7594V32ZM46.4 32H35.6406V21.3333H46.4V32ZM21.5188 10.6667V14.6667C21.5188 18.3486 18.5081 21.3333 14.7942 21.3333H10.7594V10.6667H0V0H10.7594L21.5188 10.6667ZM35.6406 21.3333H31.6058C27.8919 21.3333 24.8812 18.3486 24.8812 14.6667V10.6667L35.6406 0H46.4V10.6667H35.6406V21.3333Z" fill="currentColor"/></svg>'

  const DOTS =
    '<svg viewBox="0 0 20 6" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<circle cx="3" cy="3" r="3" fill="currentColor"/><circle cx="17" cy="3" r="3" fill="currentColor"/></svg>'

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const line = (s) => `<span>${esc(s)}</span>`

  function html() {
    const navCells = S.nav
      .map(
        (n, i) => `
      <div class="cl__cell cl__cell--nav cl__cell--nav${i + 1}">
        <a class="cl__navlink" href="${n.href || '#'}">
          <span class="cl__t cl__t--num">${line(n.num)}</span>
          <span class="cl__flip"><span class="cl__flip-in">
            <span class="cl__flip-face"><span class="cl__t">${line(n.during)}</span></span>
            <span class="cl__flip-face"><span class="cl__t">${line(n.after)}</span></span>
          </span></span>
        </a>
        ${i === S.nav.length - 1
            ? `<button class="cl__menu" type="button" aria-label="Menu">${DOTS}${DOTS}</button>`
            : ''}
      </div>`
      )
      .join('')

    return `
  <div class="cl__backdrop"><canvas class="cl__dither"></canvas></div>
  <div class="cl__bar">
    <div class="cl__cell cl__cell--brand">
      <div class="cl__row">
        <a class="cl__brand" href="${S.home}">
          <span class="cl__logo">${LOGO}</span>
          <span class="cl__t">${line(S.brand[0])}${line(S.brand[1])}</span>
        </a>
        <span class="cl__flip cl__flip--right"><span class="cl__flip-in">
          <span class="cl__flip-face"><span class="cl__t">${line(S.loadingLabel)}<span class="cl__pct">0%</span></span></span>
          <span class="cl__flip-face"><span class="cl__t">${line(S.clockCity)}<span class="cl__clock">--:-- ${esc(S.clockSuffix)}</span></span></span>
        </span></span>
      </div>
    </div>
    <div class="cl__cell cl__cell--track"><div class="cl__fill"></div></div>
    ${navCells}
  </div>`
  }

  /* ----------------------------------------------------------- tách từ ----
   * Bọc từng từ thành .cl__w > (.cl__wt chữ + .cl__wb khối quét). Khoảng trắng
   * giữa các từ giữ nguyên là text node, không nhét vào hộp nào, để dòng chữ
   * vẫn ngắt và giãn y như cũ.
   *
   * Bỏ qua mặt chữ SAU của các ô cuộn (HANOI / GALLERY / ABOUT): lúc loading
   * chúng bị che, tới lúc dock mới lật lên nên không cần reveal.
   */
  function wordify(el) {
    const text = el.textContent
    if (!text.trim()) return
    el.textContent = ''
    // Giữ lại cả dấu cách bằng cách split có capture group.
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue
      if (!part.trim()) {
        el.appendChild(document.createTextNode(part))
        continue
      }
      const w = document.createElement('span')
      w.className = 'cl__w'
      const t = document.createElement('span')
      t.className = 'cl__wt'
      t.textContent = part
      const b = document.createElement('span')
      b.className = 'cl__wb'
      w.append(t, b)
      el.appendChild(w)
    }
  }

  function wordifyAll() {
    if (!S.textReveal.enabled) return
    for (const t of root.querySelectorAll('.cl__t')) {
      // mặt chữ sau của flipper = .cl__flip-face cuối cùng
      if (t.closest('.cl__flip-face')?.matches(':last-child')) continue
      for (const lineEl of t.children) wordify(lineEl)
    }
  }

  /* ------------------------------------------------------------ gắn vào ---- */
  const style = document.createElement('style')
  style.setAttribute('data-chande-loading', '')
  style.textContent = css()
  document.head.appendChild(style)

  const root = document.createElement('div')
  root.className = 'cl'
  root.setAttribute('data-chande-loading', '')
  root.setAttribute('role', 'progressbar')
  root.setAttribute('aria-label', 'Loading')
  root.innerHTML = html()

  const $ = (s) => root.querySelector(s)
  const $$ = (s) => [...root.querySelectorAll(s)]

  const el = {
    backdrop: $('.cl__backdrop'),
    dither: $('.cl__dither'),
    bar: $('.cl__bar'),
    brand: $('.cl__cell--brand'),
    track: $('.cl__cell--track'),
    nav1: $('.cl__cell--nav1'),
    nav2: $('.cl__cell--nav2'),
    fill: $('.cl__fill'),
    menu: $('.cl__menu'),
    // Sau wordifyAll(), chữ của hai ô này nằm trong .cl__wt — resolve lại ở boot.
    pct: $('.cl__pct'),
    clock: $('.cl__clock'),
    brandFlip: $('.cl__cell--brand .cl__flip-in'),
    navFlips: $$('.cl__navlink .cl__flip-in'),
  }

  /* -------------------------------------------- các bước trên trục thời gian */
  // Mỗi bước là một animation ĐANG PAUSE, fill 'both'. Đồng hồ chung chỉ việc
  // gán currentTime = T; delay/duration lo phần còn lại, nên tua được hai chiều.
  // Nền trong suốt viết dạng rgba để Web Animations nội suy được (từ khoá
  // 'transparent' cho ra bước nhảy ở một số trình duyệt).
  const TRANSPARENT = 'rgba(0,0,0,0)'

  const anims = []
  const step = (node, keyframes, delay, duration, easing) => {
    if (!node) return
    const a = node.animate(keyframes, {
      delay,
      duration: Math.max(1, duration),
      easing: easing || S.ease,
      fill: 'both',
    })
    a.pause()
    anims.push(a)
  }

  // Dựng lại toàn bộ bước — gọi SAU khi đo font, vì quãng lật chữ bằng đúng
  // chiều cao khối chữ đã trim.
  function buildSteps() {
    for (const a of anims) a.cancel()
    anims.length = 0
    const dockD = S.dockDuration
    // 1. thanh wipe từ giữa ra hai bên
    step(el.bar, [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0 0 0)' }],
    M.enterStart, S.enterDuration)
    // 2. thanh trượt từ giữa màn lên đỉnh
    step(el.bar,
    [{ transform: `translateY(calc(50vh - ${em(S.barHeight / 2)}))` }, { transform: 'translateY(0)' }],
    M.dockStart, dockD)
    // 3. ô trái: nền tối -> kem, chữ kem -> xanh, viền tắt
    step(el.brand,
    [{ backgroundColor: TRANSPARENT, color: S.cream, borderColor: hairline() },
     { backgroundColor: S.cream, color: S.green, borderColor: 'rgba(255,255,255,0)' }],
    M.dockStart, dockD)
    // 4. track: nền xám -> tối, fill xanh trượt khỏi khung
    step(el.track,
      [{ backgroundColor: TRANSPARENT, borderColor: hairline() },
       { backgroundColor: S.ink, borderColor: 'rgba(255,255,255,0)' }],
      M.dockStart, dockD)
    step(el.fill, [{ transform: 'translateX(0)' }, { transform: 'translateX(101%)' }],
    M.dockStart, dockD * S.fillWipe)
    // 5. hai ô nav đổi nền, viền tắt
    step(el.nav1,
    [{ backgroundColor: TRANSPARENT, borderColor: hairline() },
     { backgroundColor: S.track, borderColor: 'rgba(255,255,255,0)' }],
    M.dockStart, dockD)
    step(el.nav2,
    [{ backgroundColor: TRANSPARENT, borderColor: hairline() },
     { backgroundColor: S.navDone, borderColor: 'rgba(255,255,255,0)' }],
    M.dockStart, dockD)
    // 6. lật chữ: LOADING% -> đồng hồ, WORKJAM -> GALLERY, CHILL & FUN -> ABOUT
    step(el.brandFlip,
      [{ transform: 'translateY(0)' }, { transform: `translateY(-${em(cap2 + S.flipGap)})` }],
    M.dockStart + S.swapDelay, dockD - S.swapDelay)
    el.navFlips.forEach((n) =>
    step(n, [{ transform: 'translateY(0)' }, { transform: `translateY(-${em(cap1 + S.flipGap)})` }],
      M.dockStart + S.swapDelay, dockD - S.swapDelay)
    )
    // 7. nút menu wipe vào từ mép phải
    step(el.menu, [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }],
    M.dockStart + dockD * S.menuAt, dockD * 0.6)
    // 8. nền tối rút xuống, lộ trang
    step(el.backdrop, [{ clipPath: 'inset(0 0 0 0)' }, { clipPath: 'inset(100% 0 0 0)' }],
    M.revealStart, S.revealDuration)
    // 9. (tuỳ chọn) thanh mờ đi thay vì ở lại làm header
    if (!S.becomeHeader) {
      step(el.bar, [{ opacity: 1 }, { opacity: 0 }], M.done, S.tail, 'linear')
    }

    buildRevealSteps()
  }

  /* --------------------------------------------- block reveal từng từ ------
   * Một animation cho khối quét, một cho chữ, cùng delay/duration nên chúng
   * khớp nhau tuyệt đối khi tua.
   *
   * transform-origin đổi từ left sang right ngay đoạn scaleX đang bằng 1 —
   * lúc đó scale là identity nên việc origin nội suy dần không hề thấy được.
   * Easing đặt TRÊN TỪNG KEYFRAME chứ không đặt ở options: options.easing áp
   * cho cả lượt chạy và sẽ bóp méo các mốc offset.
   */
  function buildRevealSteps() {
    const R = S.textReveal
    if (!R.enabled) return

    const words = [...root.querySelectorAll('.cl__w')]
    const total = R.inDuration + R.hold + R.outDuration
    const a = R.inDuration / total
    const b = (R.inDuration + R.hold) / total
    const base = M.enterEnd + R.startDelay

    words.forEach((w, i) => {
      const at = base + i * R.stagger
      const block = w.querySelector('.cl__wb')
      const text = w.querySelector('.cl__wt')

      step(block, [
        { transform: 'scaleX(0)', transformOrigin: 'left center', offset: 0, easing: R.ease },
        { transform: 'scaleX(1)', transformOrigin: 'left center', offset: a, easing: 'linear' },
        { transform: 'scaleX(1)', transformOrigin: 'right center', offset: b, easing: R.ease },
        { transform: 'scaleX(0)', transformOrigin: 'right center', offset: 1 },
      ], at, total, 'linear')

      // Chữ bật lên đúng lúc khối phủ kín — một bước nhảy, không mờ dần.
      step(text, [
        { opacity: 0, offset: 0 },
        { opacity: 0, offset: a },
        { opacity: 1, offset: Math.min(1, a + 0.0001) },
        { opacity: 1, offset: 1 },
      ], at, total, 'linear')
    })
  }

  /* ----------------------------------------------- đo metric thật của font --
   * Figma trim text box theo cap-height, và lượng cắt trên / dưới KHÔNG bằng
   * nhau. Đoán đối xứng thì chữ bị cắt mép trên và mặt chữ kế tiếp thò vào ô
   * cuộn. Nên đo thẳng từ font: cap-height + ascent/descent của chính Phudu.
   */
  function measure() {
    let m
    try {
      const c = document.createElement('canvas').getContext('2d')
      c.font = `600 ${S.fontSize * 10}px Phudu, sans-serif`
      m = c.measureText('H')
    } catch (e) { return }
    const k = 0.1 // đo ở cỡ gấp 10 cho tròn số rồi thu về
    const asc = m.fontBoundingBoxAscent * k
    const desc = m.fontBoundingBoxDescent * k
    const cap = m.actualBoundingBoxAscent * k // ink trên baseline của 'H' = cap-height
    if (!(asc > 0 && desc >= 0 && cap > 0)) return // trình duyệt không cho metric

    const half = (lineBox - (asc + desc)) / 2 // half-leading
    const tt = half + (asc - cap) // mép trên line box -> đỉnh cap
    const tb = desc + half // baseline -> mép dưới line box
    cap1 = lineBox - tt - tb
    cap2 = lineBox * 2 - tt - tb
    root.style.setProperty('--cl-tt', `${(tt / S.fontSize).toFixed(5)}em`)
    root.style.setProperty('--cl-tb', `${(tb / S.fontSize).toFixed(5)}em`)
    root.style.setProperty('--cl-cap1', em(cap1))
    root.style.setProperty('--cl-cap2', em(cap2))
  }

  async function fontsReady() {
    if (!document.fonts) return
    try {
      await document.fonts.load(`600 ${S.fontSize}px Phudu`)
      await document.fonts.ready
    } catch (e) {}
  }

  /* ---------------------------------------------------------------- dither -
   * Ordered dithering ma trận Bayer, dựng đệ quy từ 2x2. Vẽ một lần lên canvas
   * ở độ phân giải CSS-pixel / size (KHÔNG nhân devicePixelRatio — dither cỡ 1px
   * mà vẽ ở dpr 2 thì mắt không thấy hoa văn nữa), rồi phóng lên bằng
   * image-rendering: pixelated.
   */
  function bayer(n) {
    let m = [[0, 2], [3, 1]]
    while (m.length < n) {
      const k = m.length
      const out = Array.from({ length: k * 2 }, () => new Array(k * 2))
      for (let y = 0; y < k; y++)
        for (let x = 0; x < k; x++) {
          const v = m[y][x] * 4
          out[y][x] = v
          out[y][x + k] = v + 2
          out[y + k][x] = v + 3
          out[y + k][x + k] = v + 1
        }
      m = out
    }
    return m
  }

  const BAYER_N = { bayer2: 2, bayer4: 4, bayer8: 8, bayer16: 16 }
  const hex2rgb = (h) => {
    const v = parseInt(h.replace('#', ''), 16)
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
  }

  let ditherRaf = 0
  function paintDither() {
    const D = S.dither
    const cv = el.dither
    if (!cv) return
    if (!D || !D.enabled) { cv.style.display = 'none'; return }
    cv.style.display = ''

    const N = BAYER_N[D.style] || 16
    const mat = bayer(N)
    const cell = Math.max(1, D.size | 0)
    const w = Math.max(1, Math.ceil(innerWidth / cell))
    const h = Math.max(1, Math.ceil(innerHeight / cell))
    cv.width = w
    cv.height = h

    const ctx = cv.getContext('2d', { alpha: false })
    const img = ctx.createImageData(w, h)
    const px = img.data
    const base = hex2rgb(S.bg).map((c) => c / 255)
    const mono = hex2rgb(D.monoColor).map((c) => c / 255)
    const baseLum = 0.2126 * base[0] + 0.7152 * base[1] + 0.0722 * base[2]
    const q = Math.max(2, D.levels | 0) - 1
    const n2 = N * N

    for (let y = 0; y < h; y++) {
      const dy = y / h - 0.5
      const row = mat[y % N]
      for (let x = 0; x < w; x++) {
        let lift = 1
        if (D.amount) {
          const dx = (x / w - 0.5) * D.aspect
          const g = Math.max(0, 1 - Math.hypot(dx, dy) * 2 * D.falloff)
          lift = 1 + D.amount * (g * 2 - 1)
        }
        const t = (row[x % N] + 0.5) / n2 - 0.5 // ngưỡng Bayer, [-0.5, 0.5)
        const i = (y * w + x) * 4
        for (let c = 0; c < 3; c++) {
          let v = (D.mono ? mono[c] * baseLum : base[c]) * lift
          v = (v - 0.5) * D.contrast + 0.5
          v *= D.brightness
          v = Math.round((v + t / q) * q) / q
          px[i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255)
        }
        px[i + 3] = 255
      }
    }
    ctx.putImageData(img, 0, 0)
  }

  function scheduleDither() {
    cancelAnimationFrame(ditherRaf)
    ditherRaf = requestAnimationFrame(paintDither)
  }
  let resizeT = 0
  addEventListener('resize', () => {
    clearTimeout(resizeT)
    resizeT = setTimeout(scheduleDither, 120)
  })

  /* ----------------------------------------------------------- đồng hồ ----- */
  const state = { time: 0, progress: 0, playing: false, done: false }
  const listeners = new Set()
  let raf = 0
  let last = 0
  let pageLoaded = document.readyState === 'complete'
  let gateWaited = 0
  if (!pageLoaded) addEventListener('load', () => (pageLoaded = true), { once: true })

  function curveAt(t) {
    const c = S.curve
    if (t <= c[0][0]) return c[0][1]
    for (let i = 1; i < c.length; i++) {
      if (t <= c[i][0]) {
        const [ta, pa] = c[i - 1]
        const [tb, pb] = c[i]
        const u = (t - ta) / (tb - ta || 1)
        return pa + (pb - pa) * (u * u * (3 - 2 * u)) // smoothstep
      }
    }
    return c[c.length - 1][1]
  }

  function progressAt(T) {
    return curveAt(clamp((T - M.loadStart) / S.loadDuration, 0, 1))
  }

  function lock(on) {
    if (!S.lockScroll) return
    document.documentElement.style.overflow = on ? 'hidden' : ''
  }

  function apply(T) {
    T = clamp(T, 0, DURATION)
    state.time = T
    for (const a of anims) a.currentTime = T

    const p = progressAt(T)
    state.progress = p
    el.fill.style.width = `${(p * 100).toFixed(2)}%`
    const pct = Math.round(p * 100)
    el.pct.textContent = `${pct}%`
    root.setAttribute('aria-valuenow', String(pct))

    const done = T >= M.done
    if (done !== state.done) {
      state.done = done
      root.classList.toggle('is-done', done)
      // Cờ cho trang chủ dùng: html.cl-done { ... } — không cần JS ở phía trang.
      document.documentElement.classList.toggle('cl-done', done)
      lock(!done)
      if (done) document.dispatchEvent(new CustomEvent('chande-loading:done'))
    }
    for (const cb of listeners) cb(state)
  }

  function frame(now) {
    if (!state.playing) return
    const dt = last ? now - last : 0
    last = now

    // cổng chờ trang tải thật — chỉ chặn khi đang play
    const gated =
      S.waitForLoad && !pageLoaded && gateWaited < S.gateMaxWait &&
      progressAt(state.time + dt) >= S.gateAt && state.time < M.loadEnd
    if (gated) {
      gateWaited += dt
      apply(Math.min(state.time, timeAtProgress(S.gateAt)))
    } else {
      apply(state.time + dt)
    }

    if (state.time >= DURATION) pause()
    else raf = requestAnimationFrame(frame)
  }

  function play() {
    if (state.playing) return
    if (state.time >= DURATION) apply(0)
    state.playing = true
    last = 0
    raf = requestAnimationFrame(frame)
    for (const cb of listeners) cb(state)
  }

  function pause() {
    if (!state.playing) return
    cancelAnimationFrame(raf)
    state.playing = false
    for (const cb of listeners) cb(state)
  }

  function seekTime(T) {
    pause()
    apply(T)
  }

  /* ------------------------------------------------------------- đồng hồ --- */
  function clockNow() {
    const t = new Intl.DateTimeFormat('en-GB', {
      timeZone: S.clockZone, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date())
    el.clock.textContent = `${t} ${S.clockSuffix}`
  }

  /* ------------------------------------------------------------------ API -- */
  window.CHANDE_LOADING = {
    config: S,
    defaults: DEFAULTS,
    state,
    duration: DURATION,
    marks: M,
    play,
    pause,
    toggle: () => (state.playing ? pause() : play()),
    restart() { pause(); gateWaited = S.gateMaxWait; apply(0); play() },
    seekTime,
    seekProgress: (p) => seekTime(timeAtProgress(clamp(p, 0, 1))),
    finish: () => seekTime(DURATION),
    redrawDither: scheduleDither,
    // Sau khi sửa `config`, gọi refresh() để dựng lại CSS, các bước và nền dither.
    refresh() {
      style.textContent = css()
      buildSteps()
      scheduleDither()
      apply(state.time)
    },
    onUpdate(cb) { listeners.add(cb); cb(state); return () => listeners.delete(cb) },
  }

  /* ------------------------------------------------------------- khởi động - */
  async function boot() {
    document.body.appendChild(root)
    wordifyAll()
    el.pct = $('.cl__pct .cl__wt') || $('.cl__pct')
    el.clock = $('.cl__clock .cl__wt') || $('.cl__clock')
    clockNow()
    setInterval(clockNow, 20000)
    lock(true)
    scheduleDither()
    await fontsReady()
    measure()
    buildSteps()
    apply(0)
    if (reduced) seekTime(DURATION)
    else if (S.autoplay) play()
  }

  if (document.body) boot()
  else document.addEventListener('DOMContentLoaded', boot, { once: true })
})()
