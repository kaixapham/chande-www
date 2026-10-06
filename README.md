# chande-www

Demo hai hiệu ứng của **Chande Bootcamp**, dựng theo Figma
[Chande WWW](https://www.figma.com/design/Yw6Cv0JKQAxOD0hEb0iA1K/Chande-WWW?node-id=210-18194):

1. **Loading** — node `210:18194`, 3 frame Step 1 → Step 2 → Step 3 Finnish.
2. **Page transition** — rèm 4 cột, bề rộng bám đúng 4 ô của thanh loading.

## Chạy

```bash
node serve.mjs 3120
```

Mở http://localhost:3120 — hoặc dùng cấu hình `chande-www` trong `.claude/launch.json`.
**Phải dùng server tĩnh**, không mở `file://` (font woff2, canvas dither, và Barba
đều cần origin thật).

## File

```
index.html                     Home
gallery.html                   Page A
about.html                     Page B
serve.mjs                      server tĩnh, có clean URL (/gallery -> gallery.html)
assets/css/site.css            CSS dùng chung 3 trang
assets/js/chande-loading.js    HIỆU ỨNG loading  — tự chạy, CONFIG ở đầu file
assets/js/chande-transition.js HIỆU ỨNG chuyển trang — tự chạy, CONFIG ở đầu file
assets/js/chande-hero.js       hero trang chủ: vòng đổi 4 ảnh — nhúng ở CẢ BA trang
assets/js/chande-field.js      effect xanh (port gradient-studio: Slats 7 cột + ô khảm) — cả ba trang
assets/js/chande-home.js       các section sau hero: marquee, vòng %, tab, back to top — cả ba trang
assets/js/chande-cursor.js     nhân vật chạy theo chuột — cả ba trang
assets/css/home.css            CSS các section sau hero — link ở cả ba trang
assets/js/chande-reveal.js     player đoàn shape đổi ảnh (bản phát lại của tools/profile-reveal)
tools/profile-reveal/          công cụ chỉnh hiệu ứng shape — Vite, port 3116, có CLAUDE.md riêng
assets/js/chande-devtools.js   bảng điều khiển (chỉ lúc làm việc)
assets/vendor/                 barba 2.10.3, lenis 1.3.17, gsap 3.15 + CustomEase
assets/fonts/Phudu-*.woff2     Phudu SemiBold 600 + Bold 700 (latin / latin-ext / vietnamese)
assets/img/logo.svg            logo export từ Figma
assets/img/menu-dots.svg       icon menu export từ Figma
assets/img/home/               ảnh hero (chân dung, 3 mảng nền xanh, video recap, logo lớn)
assets/fonts/Phudu-Medium-*    Phudu 500 cho chữ thân của hero
assets/fonts/GeistMono-*       nhãn VIDEO RECAP
assets/fonts/GoogleSansFlex-*  chỉ một glyph © của (©26)
```

**Bàn giao = xoá đúng một thẻ `<script src="assets/js/chande-devtools.js">`.**
Hai file hiệu ứng không biết gì về devtools và chạy độc lập.

Bản demo nhúng vendor offline. Lên production thay bằng đúng mấy thẻ CDN cùng
version:

```html
<link rel="stylesheet" href="https://unpkg.com/lenis@1.3.17/dist/lenis.css">
<script src="https://cdn.jsdelivr.net/npm/@barba/core@2.10.3/dist/barba.umd.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.17/dist/lenis.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/gsap.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.15/dist/CustomEase.min.js"></script>
```

---

## 1. Loading

| Bước | Việc |
|---|---|
| Enter | thanh wipe từ giữa ra hai bên, nằm giữa màn |
| Load | 0 → 100%, đường cong có đoạn chững, đi qua đúng mốc 15% và 50% của Figma |
| Hold | giữ ở 100% |
| Dock | thanh trượt lên đỉnh, các ô nhận màu fill, chữ lật, nút menu wipe vào |
| Reveal | nền tối rút xuống, lộ trang; thanh ở lại làm header |

Lúc loading **mọi ô chỉ có stroke, không có fill** — vật thể đặc duy nhất là khối
loading xanh. Fill chỉ xuất hiện ở bước Dock. Số `01` / `02` bật
`font-feature-settings: "numr" 1` đúng như token Figma nên chữ số nhỏ và nâng cao.

### Timeline tua được

Transition CSS không tua ngược được, nên mọi bước là **Web Animations API ở trạng
thái pause**; một đồng hồ chung `T` (ms) mỗi frame chỉ gán `anim.currentTime = T`.
Play / pause / kéo thanh trượt đều đi qua đúng một đường.

```js
window.CHANDE_LOADING = {
  config, defaults, state, duration, marks,
  play(), pause(), toggle(), restart(),
  seekTime(ms), seekProgress(0..1), finish(),
  onUpdate(cb) -> unsubscribe,
  refresh(), redrawDither(),
}
```

Module bật `html.cl-done` khi xong, để trang tự style mà không cần JS.
Sự kiện: `document` → `chande-loading:done`.

### Block reveal cho chữ

Mỗi **từ** được bọc riêng thành `.cl__w > (.cl__wt chữ + .cl__wb khối)`. Khối màu
quét ngang từ trái phủ kín từ, chữ bật lên dưới khối, rồi khối quét tiếp sang phải
biến mất. Các từ lệch nhau `stagger` ms.

Bốn chỗ phải để ý:

- **Chạy trên đồng hồ chung, không dùng `setTimeout`.** Cả module tua được hai
  chiều; hiệu ứng mà đặt bằng timer thì kéo thanh timeline là lệch ngay.
- **`transform-origin` đổi left → right ngay đoạn `scaleX` đang bằng 1.** Lúc đó
  scale là identity nên origin có nội suy dần cũng không thấy được — tránh phải
  tách thành hai animation tranh nhau cùng thuộc tính `transform`.
- **Easing đặt trên từng keyframe, không đặt ở `options`.** `options.easing` áp
  cho cả lượt chạy và sẽ bóp méo các mốc `offset`.
- **Khoảng trắng giữ nguyên là text node**, không nhét vào hộp nào, để dòng chữ
  vẫn ngắt và giãn y như cũ. Hộp từ là `inline-block` với `vertical-align`
  baseline — đổi sang `top`/`middle` là lệch mất phần bù cap-height.

Mặt chữ **sau** của các ô cuộn (HANOI / GALLERY / ABOUT) bị bỏ qua: lúc loading
chúng đang bị che, tới bước dock mới lật lên nên không cần reveal.

### Effect Dither

Ordered dithering ma trận Bayer, vẽ lên canvas phủ nền. Nền là màu phẳng `bg`,
dither lượng tử hoá nó xuống `levels` mức với ngưỡng Bayer → hoa văn mịn **đều
trên toàn màn**. Canvas vẽ ở độ phân giải `CSS-pixel / size` (không nhân
devicePixelRatio, vì dither cỡ 1px ở dpr 2 thì mắt không thấy hoa văn) rồi phóng
lên bằng `image-rendering: pixelated`.

`amount` (mặc định `0`) là tuỳ chọn thêm dải sáng toả từ tâm — để `0` thì nền
phẳng đúng bản thiết kế.

---

## 2. Page transition

Hai biến thể, chọn bằng `CONFIG.variant` (bảng devtools đổi khi bạn chuyển tab):

| Biến thể | Việc |
|---|---|
| `sweep` — **Rèm quét** | 4 cột quét liên tục từ trên xuống rồi trôi khỏi mép dưới màn |
| `split` — **Rèm chẻ** | 4 cột thả từ trên + 4 cột đẩy từ dưới, gặp nhau ở đường `splitAt`; lúc rút thì tách ra hai phía |
| `stack` — **Trượt thẻ** | Trang cũ co nhỏ + bo góc rồi trượt xuống khỏi màn; tấm màu ở giữa theo sau; trang mới phóng từ nhỏ lên đúng chỗ |

Cả hai đều nói cùng một thứ tiếng `yPercent`, chỉ khác mốc:

```
sweep          nghỉ (top:-100%)  0  ->  phủ 100  ->  trôi khỏi màn 200
split · trên   nghỉ (top:-100%)  0  ->  phủ 100  ->  rút về 0
split · dưới   nghỉ (top: 100%)  0  ->  phủ -100 ->  rút về 0
```

`fromTo` ở bước phủ luôn đặt lại mốc 0 nên không cần dọn dẹp giữa các lần.
Mỗi biến thể có riêng bộ màu, dither và nhịp; `split` có thêm bộ màu cho 4 cột
dưới và `splitAt` (đường gặp nhau, % chiều cao màn).

### Thanh menu lúc chuyển trang

`header.mode` — dùng chung cho cả ba biến thể:

| | |
|---|---|
| `static` | preset cũ: thanh đứng yên suốt lúc chuyển trang |
| `hide` | thanh trồi lên khuất khỏi màn lúc bắt đầu, trồi xuống lại đúng chỗ cũ khi trang mới đã vào (mặc định) |

Thanh dịch bằng thuộc tính **`translate`, không phải `transform`**. Lý do:
`transform` của thanh đang do Web Animations của `chande-loading.js` giữ với
`fill: 'both'`, mà animation thắng khai báo inline trong cascade — ghi `transform`
vào là bị đè, thanh không nhúc nhích. `translate` là thuộc tính riêng, cộng dồn
với `transform` nên hai bên không tranh chấp.

Giá trị đi qua biến CSS `--ct-header` (đơn vị %), tween qua một object trung gian
rồi tự ghi vào biến — chắc ăn hơn là trông chờ GSAP nội suy thẳng custom property.

### Chữ trên cột

Mỗi cột có thể mang một dòng chữ (**Phudu Bold 106**, padding **24**, căn trái sát
mép trái cột) — để rỗng thì cột đó không có chữ. Cột đặt `overflow: hidden` nên
chữ dài bị cắt trong phạm vi cột, không lấn sang cột bên.

Ở rèm chẻ, chữ **bám vào đường gặp**: khối trên căn đáy, khối dưới căn đỉnh, nên
hai dòng nằm sát nhau hai bên đường chẻ.

Vài điểm phải để ý khi dựng:

- **Phudu Bold là file riêng** (`Phudu-Bold-*.woff2`, weight 700). Thiếu nó thì
  trình duyệt giả bold từ SemiBold, nét sẽ sai.
- **Hai lớp span**: lớp ngoài giữ cỡ chữ gốc để `padding` tính theo thang thiết
  kế; lớp trong mới đặt cỡ 106. Nhét chung một lớp thì padding hoá ra tính theo
  106px thay vì 16px.
- **Bù cap-height** đo từ metric thật của Phudu Bold (`measureLabel()`), để
  padding 24 đo tới đỉnh chữ / baseline chứ không tới mép line box.

### Biến thể trượt thẻ

Ba lớp xếp chồng, tất cả `position: fixed` nên cuộn trang không ảnh hưởng:

```
wrapper (bọc trang cũ)  z3
tấm giữa                z2   <- [data-transition-middle]
trang mới               z1
```

Trang cũ được bọc thêm một lớp để dời đi mà không phá layout của chính nó, và bị
ghim `top: -scrollY` để trông như đứng yên đúng chỗ đang cuộn. Ba lớp cùng bo góc
rồi cùng co lại, sau đó wrapper trượt xuống, tấm giữa theo sau trễ `middleLag`,
trang mới phóng lên cỡ thật.

Nền lộ ra phía sau lúc ba lớp co nhỏ chính là nền của `parent` (thường là
`body`). `stack.bg` đặt màu đó trong lúc chuyển trang rồi `clearProps` trả lại
khi xong — mặc định trùng nền trang nên không đổi gì cho tới khi bạn chỉnh.

Hai chỗ phải xử lý riêng, không có trong bản tham khảo:

- **`parent` phải ghim `min-height: 100vh`.** Trang cũ vừa bị nhấc ra khỏi luồng
  (wrapper là `position: fixed`) nên `parent` co về chiều cao 0. `perspective`
  biến `parent` thành containing block của mọi con `position: fixed`, còn
  `overflow: clip` thì cắt theo cái hộp 0px đó — mất sạch cả header lẫn hai trang.
- **`enter` phải đợi `leave` xong mới `resetPage`.** Với `sync: true`, `enter`
  chạy ngay từ giây 0; `clearProps` sẽ gỡ mất `position: fixed` của trang mới
  ngay giữa lúc đang animate. Ở đây `enter` trả về một promise, `leave` gọi nó
  lúc `onComplete`.

Biến thể này cần hai container thật nên không xem tại chỗ được — bảng devtools tự
ẩn nút *Chạy rèm* ở tab này, bấm Home / Page A / Page B để xem.

Rèm chạy hết chiều cao màn. **Bề rộng 4 cột đọc thẳng từ
`CHANDE_LOADING.config.cellWidths`**, nên mỗi cột thẳng hàng với một ô của header
và hai thứ không bao giờ lệch nhau. Rèm có `z-index` thấp hơn thanh loading nên
chạy **dưới** header — header đứng yên suốt lúc chuyển trang.

### Markup

```html
<body data-barba="wrapper">
  <div data-transition-wrap></div>   <!-- rèm mount vào đây, NGOÀI container -->
  <main data-barba="container">
    <!-- nội dung trang -->
  </main>
</body>
```

Không có `[data-transition-wrap]` thì module tự tạo rồi gắn vào `body`.

Header (thanh loading) nằm **ngoài** container để nó sống sót qua mọi lần Barba
swap — đó là điều kiện để thanh loading hoá thành header rồi ở lại. Vì vậy nav
không được Barba thay; module tự gắn `aria-current="page"` cho link trùng đường
dẫn trang mới.

### Nhịp

`leave` chạy rèm phủ rồi gỡ container cũ; `enter` đợi đúng lúc rèm kín
(`duration + stagger × 3 + hold`) mới `resetPage` và rút rèm — người xem không
thấy cú nhảy. Transition đặt `sync: true`, `preventRunning: true`, `timeout: 7000`.
`prefers-reduced-motion` thì bỏ rèm, đổi trang thẳng.

Lenis chạy trên `gsap.ticker` cho cùng một nhịp frame, và **bị giữ im cho tới khi
loading xong** — nếu không nó gỡ mất cái khoá cuộn của màn loading.

```js
window.CHANDE_TRANSITION = {
  config, defaults, lenis, variant,
  setVariant('sweep' | 'split'),
  cover(), reveal(), play(), go(href), refresh(),
}
```

### Dither trên 4 cột

Cùng bộ tham số với dither nền của màn loading. Vì màu cột là màu **phẳng**, kết
quả dither chỉ phụ thuộc `(x mod N, y mod N)` — nên nó lát gạch được: mỗi cột chỉ
cần một tile `N×N` đặt `background-repeat: repeat`, không cần canvas cao bằng cả
màn như bên loading (bên đó còn tuỳ chọn dải sáng nên phải vẽ nguyên khung).

Tile vẽ ở độ phân giải 1 ô = 1 px rồi phóng lên `size` lần bằng
`background-size` + `image-rendering: pixelated`. Dither giữ nguyên màu trung
bình: tile của `#97a180` có mean đúng bằng `(151, 161, 128)`.

Phần toán Bayer bị **chép lại** ở cả hai file hiệu ứng thay vì dùng chung — đó là
giá phải trả để mỗi file chạy độc lập, bỏ file nào đi thì file kia vẫn nguyên vẹn.

Sự kiện: `document` → `chande-transition:cover`, `chande-transition:done`.

---

## 3. Hero trang chủ

Figma node `513:33865` — hai frame *Full Hero* (1920×1277) và *1 Viewport*
(1920×1080). Dựng hình trong `site.css` (`.hero*`), hành vi trong
`chande-hero.js`.

**Đơn vị.** `--u = 100cqw / 1920` — 1px thiết kế tính theo bề rộng hero, để
các cột luôn thẳng hàng với 4 ô header (header chia theo %). Chữ vẫn dùng rem
như phần còn lại. Toạ độ y trong CSS = y Figma − 80 vì stage bắt đầu dưới header.

**Lưới.** Ảnh rộng đúng một cột của lưới 8 cột (234), đứng ở cột 2 / 3 / 4 / 5.
Ảnh dưới bắt đầu đúng ở mép trên thanh tên của ảnh trên (y 0 → H → 2H → 3H)
— áp cho cả 4 ảnh, kể cả ảnh 4 (Figma vẽ ảnh 4 dính đáy hero, đã đổi theo rule).
Mảng xanh bên phải và đáy nửa kem bám mép trên ảnh 4. Chiều cao ảnh `H` chung
cho cả 4 ô và tính theo **% chiều cao viewport** (`--img`, mặc định 25% = 270
ở màn 1080) — bề rộng theo cột, nên tỉ lệ ảnh đổi theo hình dạng màn.

**Chiều cao** `= max(đủ chỗ cho ảnh 4, viewport-đầu + 197u)` — luôn dài hơn màn đầu đúng
197 như Figma. Cụm chữ trái bám đáy *viewport đầu* cách 24; video recap nằm
dưới mép màn.

**Sticky** (chép từ scroll behavior của Figma): mỗi ảnh nằm trong một cột chạy
tới đáy hero, nên lúc cuộn bốn ảnh bậc thang lần lượt dừng dưới header thành một
hàng rồi theo đáy hero đi ra. SCROLL MORE cũng sticky — bám đáy viewport cách
24 cho tới khi hết hero. Thanh process thì **không** sticky: nằm yên ở mép trên
nền tối và cuộn theo trang. **Không đặt `overflow:
hidden` lên tổ tiên nào của hero**, sticky sẽ chết.

**Dither.** Shader "Dither" của Figma cần WebGPU + HTML-in-Canvas nên không
chạy được ở trình duyệt thật. `chande-hero.js` chép đúng phép tính nhánh
*ordered* của shader đó (Bayer 16×16, cùng thứ tự góc phần tư) và vẽ bằng
canvas 2D, ở **2× cỡ CSS** — đo bản export của Figma thì nó cũng dither ở 2x
rồi thu nhỏ, nên hạt mịn chứ không lộ ô. Mức: ảnh 6 / 4 / 4 / 6, nền tối 8.

**Ba mảng nền xanh** dùng chung một ảnh preset khảm ô (`field-tile.webp`,
object-fit: cover), mảng B lật dọc bằng CSS giống node Figma. Đổi preset = thay
đúng file đó.

**Vòng đổi ảnh.** Thanh process chạy `cycle` ms; đầy thì 4 ô nhận 4 người kế
tiếp trong `<script type="application/json" data-hero-people>` ở `index.html`
(≤ 4 người thì xoay từng người một). Ảnh mới hiện ra bằng **đoàn shape**
(xem dưới), tên lật lên đúng lúc khung bị phủ kín, thanh rút về phải; cả 4 ô xong
thì thanh chạy lượt mới. Chỉ bắt đầu sau `chande-loading:done`.
Thêm người = thêm một dòng JSON, `pos` là `object-position` của ảnh.

**Đoàn shape — `chande-reveal.js`.** Bản phát lại của công cụ
`tools/profile-reveal` (kiểu chạy `train`): 5 khối màu ùa ra từ góc dưới-phải,
toa cuối là ảnh người mới. Chỉnh hiệu ứng ở tool (port 3116) hoặc tab *Shape
reveal* của devtools, rồi chép số vào `CONFIG` đầu file. Bốn ô chạy **lần lượt
từ ô thấp nhất lên ô cao nhất** (`order: 'bottomUp'`, đo theo vị trí thật trên
màn), ô sau trễ `revealStagger` ms. `effect: 'wipe'` trả về kiểu quét cũ.

Ba điều không được phá (bài học của tool, chi tiết ở
`tools/profile-reveal/CLAUDE.md`): ảnh mới là toa **cuối** đoàn; mỗi lớp là
**khối góc** bám góc xa — trượt nguyên hình cỡ khung thì hở hai góc đối; chỉ
tách chặng vào / ra khi `coverHold > 0`, không thì đoàn khựng giữa chừng.
Shape dither Bayer 16×16 cùng số mức với ảnh của ô. Kiểm khe hở bằng
`CHANDE_REVEAL.renderAt()`: ảnh cũ tô `#FF00FF`, quét cả timeline, sau mốc
`coverAt` phải còn 0 pixel magenta, frame cuối trùng ảnh mới (đã đạt với mặc
định, coverHold 400, gap .42/.55, back out, crop).

**Barba.** Mount ở `beforeEnter` (để rèm mở ra là đã có dither), gỡ ở
`afterLeave` — và chỉ gỡ nếu hero thuộc container cũ, vì `sync: true` khiến
`afterLeave` tới *sau* `beforeEnter`.

```js
window.CHANDE_HERO = { config, mount(root), destroy(), next(), pause(), play() }
window.CHANDE_REVEAL = { config, timing(), play(box, {from, to, levels, delay}), renderAt(canvas, t, opts) }
```

Chữ dùng `text-box: trim-both cap alphabetic` (Chrome 133+, Safari 18.2+) để
cắt hộp chữ theo cap-height như Figma; Firefox chưa hỗ trợ nên lệch vài px.
Dưới 900px Figma chưa có bản — tạm xếp dọc: tiêu đề, lưới 2×2, thanh process,
cụm chữ.

---

## 4. Effect xanh — `chande-field.js`

Port từ gradient-studio (`src/app/field/field-shader.ts`), chỉ giữ nhánh preset
dùng: form **Slats** (`columns` = 7 — "1 cục xanh 7 cột"), palette Radioactive,
**Mosaic** 40 ô có gờ + núm, grade / vignette / grain. Bỏ fbm / warp nên nhẹ.

- `[data-field]` = một vùng xanh. Đứng lẻ thì có canvas riêng.
- `[data-field-root]` gộp nhiều vùng vào **một** canvas (vẽ từng vùng bằng
  viewport + scissor) — chỉ dùng khi các vùng nằm sát nhau (hero). Vùng thưa thì
  để lẻ: canvas gộp phủ cả section cao 3000px sẽ to và tốn hơn.
- Chỉ vẽ khi trong màn hình, khoá `fps` (30), trần `maxDpr` (1.25).
- Không có WebGL thì vùng hiện ảnh tĩnh `field-tile.webp`, khớp bề rộng (đủ 7 cột).
- **Không bao giờ dừng giữa chừng**: hero gọi `CHANDE_FIELD.park()` khi thanh
  process đầy; effect chạy nốt vòng, đỗ ở điểm nghỉ (phase 0) rồi shape reveal mới
  đổi ảnh; `chande-hero:swap-end` nhả cho vòng mới chạy.
- Chỉnh ở bảng setting (phím H) → *Effect xanh*.

`chande-mosaic.js` (bản port khác, do một phiên song song viết) **không còn được
nạp**: nó vẽ 60fps, DPR 2, hai lượt + chép canvas mỗi khung — nặng hơn hẳn.

## 5. Các section sau hero — `home.css`, `chande-home.js`

Figma `Home-001` (336:7199). Mỗi `section.hs` dùng `--u` như hero, toạ độ là y
Figma trừ mép trên section. Cụm sticker / collage xuất từ Figma dạng SVG, gỡ hai
hình chữ nhật nền rồi chụp lại bằng Chrome headless để có PNG trong suốt — bản
PNG/JPG Figma xuất thẳng bị dán sẵn lên màu nền frame.

Dải tròn chạy ngang vẽ bằng `radial-gradient` (chu kỳ 332 = 2 hình tròn), dải
viên thuốc bằng DOM; cả hai chỉ dịch `transform` và dừng khi ra khỏi màn.

**Con trỏ** (`chande-cursor.js`): nhân vật chạy theo chuột, trễ một nhịp, nghiêng
theo hướng đi, phóng to khi trỏ vào link; con trỏ thật vẫn giữ. Chỉ bật với chuột.

---

## Responsive

Lưới tham chiếu của bản thiết kế: **8 cột, Stretch, margin 24, gutter 0** ở khổ
1920 → cột rộng `(1920 - 48) / 8 = 234`. Biên 4 ô của thanh rơi đúng cột 2 / 4 / 6
(`492 | 960 | 1428`), nên `cellWidths` chính là 2+2+2+2 cột — chỉ khác là thanh
full-bleed nên tràn cả hai lề 24.

Từ 1440px trở lên `1em = 1px-thiết-kế` (`font-size: clamp(1440px,100vw,1920px)/120`),
nên **px của bản thiết kế ÷ 16 = em**, không hardcode px. Dưới đó:

| Khổ | Cỡ gốc | Bố cục thanh |
|---|---|---|
| ≥ 900px | 12 → 16px | đủ 4 ô như Figma |
| 600 – 899px | 11px | 2 ô (thương hiệu + track), nút menu neo mép phải |
| < 600px | 10px | 2 ô, tỉ lệ 64 / 36 |

---

## Devtools

Một bảng kính mờ ở góc phải trên, giao diện chép theo bảng *Controls* của
Toolcraft (Inter, nhãn trên – ô dưới, slider track 1px). **Ẩn sẵn — bấm phím `H`
để bật / tắt** (bỏ qua khi đang gõ
trong ô nhập, hoặc khi giữ Cmd / Ctrl / Alt). Trạng thái bật lưu theo
localStorage nên tải lại trang vẫn giữ. Các tab:

- **Hero home** — chiều cao ảnh, một số chung cho cả 4 ô, tính bằng **% chiều
  cao viewport đầu** (mặc định 25 = 270/1080 như Figma, không tính thanh tên);
  ảnh dưới, mảng nền xanh / tối và thanh process tự dịch theo vì CSS suy hết từ
  `--img`. Thêm nhịp vòng đổi ảnh và nút *Đổi ảnh ngay*.
- **Loading** — play / pause / tua timeline; màu nền, toàn bộ tham số dither, màu
  stroke + độ mờ, màu khối loading, màu 4 ô sau finish.
  Phím **Space** play-pause, **←/→** tua 100ms — chỉ khi bảng đang hiện.
- **Rèm quét**, **Rèm chẻ** và **Trượt thẻ** — mỗi tab là một biến thể; mở tab nào thì biến thể
  đó là cái sẽ chạy khi bấm link. Có: chạy thử rèm tại chỗ, nhảy Home / Page A /
  Page B; màu cột (rèm chẻ có cả bộ trên lẫn bộ dưới), dither của cột,
  chữ của từng cột + căn dọc, cỡ chữ / padding / line-height / màu chữ,
  kiểu thanh menu + biên độ / nhịp lên xuống,
  duration / stagger / mốc tráo trang / hướng stagger / đường gặp, Lenis lerp, và
  **nạp ảnh demo cho page A và page B** để xem rèm chạy trên ảnh thật.

Mỗi ô màu có cả bảng chọn màu lẫn ô gõ / dán mã hex; ô hex nhận `#abc`, `abcdef`
hay `#abcdef`, gõ sai thì tự trả về giá trị đang dùng.

Ảnh demo ghi vào biến CSS `--shot-a` / `--shot-b` ở `<html>` nên sống sót qua mọi
lần Barba swap container. Ảnh dưới 1.5MB được lưu lại; lớn hơn thì chỉ giữ trong
phiên.

Giá trị đã chỉnh lưu ở `localStorage['chande-devtools']` (ảnh ở
`chande-devtools-shots`) và **đè lên CONFIG** trong file hiệu ứng — thấy hành vi
lạ thì đọc localStorage trước khi nghi code. Nút **Reset** trả tab hiện tại về mặc định.
Chỉ những giá trị **khác mặc định** mới được lưu, nên đổi mặc định trong CONFIG
vẫn có tác dụng với những ô chưa ai chỉnh.

**Smooth scroll** là Lenis trong `chande-transition.js`: `lerp 0.1` (mặc định của
Lenis — càng nhỏ càng trôi lâu), `wheelMultiplier 1`. Chỉnh ở mục rèm → *Lenis lerp*.

---

## Bốn cái bẫy đã dính, ghi lại kẻo dẫm lại

1. **Bù cap-height không đối xứng.** Figma trim text box theo cap-height; lượng
   cắt trên `= half-leading + (ascent - cap)`, dưới `= descent + half-leading` —
   hai số này **khác nhau**. Đoán đối xứng thì chữ cụt mép trên. Nay đo thẳng
   metric của Phudu bằng canvas `measureText` lúc chạy (`measure()`).
2. **`.cl__t` phải là `flow-root`.** Là block thường thì margin âm của dòng đầu
   *collapse* ra ngoài thay vì cắt bớt chiều cao khối chữ.
3. **`<button>` không kế thừa `font-size`** (UA đặt 13.333px). Thiếu
   `font: inherit` thì `5em` của nút menu ra 66.7px trong ô 60px.
4. **Lenis gỡ mất khoá cuộn của màn loading** nếu `start()` sớm. Giữ nó `stop()`
   cho tới sự kiện `chande-loading:done`.
