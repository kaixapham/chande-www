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
assets/js/chande-devtools.js   bảng điều khiển (chỉ lúc làm việc)
assets/vendor/                 barba 2.10.3, lenis 1.3.17, gsap 3.15 + CustomEase
assets/fonts/Phudu-*.woff2     Phudu SemiBold 600 + Bold 700 (latin / latin-ext / vietnamese)
assets/img/logo.svg            logo export từ Figma
assets/img/menu-dots.svg       icon menu export từ Figma
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

Một bảng ở đáy màn, hai tab:

- **Loading** — play / pause / tua timeline; màu nền, toàn bộ tham số dither, màu
  stroke + độ mờ, màu khối loading, màu 4 ô sau finish.
  Phím **Space** play-pause, **←/→** tua 100ms.
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
