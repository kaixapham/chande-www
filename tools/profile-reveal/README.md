# Profile Reveal

Tool dựng hiệu ứng chuyển ảnh profile: một (hoặc nhiều) **shape màu cùng tỉ lệ với khung**
bay chéo từ góc dưới-phải lên góc trên-trái. Đúng khoảnh khắc shape cuối đi ngang qua tâm,
nó che kín khung — ảnh được đổi sang người tiếp theo ngay tại đó, nên mắt không bao giờ
bắt được cú cắt.

JS thuần + Vite, không framework. Chạy ở port **3116** (`npm run dev`, đã đăng ký trong
`.claude/launch.json`).

## Hai kiểu chạy

### Nối đuôi (`flow: 'chase'`)

Từng shape băng qua khung rồi mới tới shape kế tiếp. Một **chu kỳ** = một lần đổi người:

```
shape k khởi hành ở  k × stagger
          chạy      duration  (nửa đầu ease-in, nửa sau ease-out)
          dừng      coverHold  đúng lúc phủ kín khung
đổi ảnh ở  (n-1)×stagger + duration/2 + coverHold/2     ← giữa quãng dừng của shape CUỐI
nghỉ       hold
```

Vì shape có đúng tỉ lệ khung và cỡ ≥ 1×, ở giữa quãng đường nó phủ kín tuyệt đối —
đó là lý do điểm đổi ảnh được chốt ở đó chứ không phải ở một mốc tuỳ ý. Nếu kéo
"Cỡ shape" xuống dưới 1× thì panel sẽ cảnh báo: khung không còn được che kín và
sẽ thấy ảnh nhảy.

### Đồng loạt (`flow: 'train'`)

Vẫn giữ nguyên quy tắc **ảnh → shape chạy → ảnh kế tiếp**, chỉ khác là mọi shape cùng
ùa ra từ góc vào một lượt thay vì nối đuôi nhau:

```
toa:   shape 1 → shape 2 → … → shape n → [ảnh người kế tiếp]
head:  -1 ─────────── 0 ──(giữ)── … ──── tail
       ảnh cũ sạch    bố cục xếp lớp      ảnh mới sạch → nghỉ
```

`head` là vị trí toa đầu, tính bằng "quãng đường phủ kín một lớp"; toa thứ j đứng cách
toa đầu `cum[j]`, mỗi khoảng hở nhỏ hơn khoảng trước theo `gapFalloff`.

Ba mốc của một lượt:

1. `head = -1` — cả đoàn còn ngoài khung, **ảnh hiện tại đứng sạch**.
2. `head = 0` — shape đầu khớp khung, mọi toa còn lại **xếp lồng nhau ở góc vào**, toa
   trong cùng chính là ảnh của người kế tiếp. Đây là bố cục trong mock; `coverHold`
   dừng đoàn ở đúng đây nên nó có một nhịp thật chứ không lướt qua.
3. `head = tail` — toa ảnh khớp khung, các shape đã dạt hết về phía kia và nằm dưới nó,
   **ảnh mới đứng sạch** rồi mới tới `hold`.

Chỉ cắt chuyển động làm hai chặng **khi thật sự có quãng giữ**. Không có quãng giữ mà
vẫn cắt thì mỗi chặng tự ease riêng, đoàn giảm tốc về 0 ở `head = 0` rồi mới tăng tốc lại
— nhìn ra thành một cú khựng giữa animation dù không đặt giữ giây nào.

#### Mỗi lớp là một KHỐI GÓC, không phải một hình trượt

Đây là điểm quyết định "không có khe hở". Mỗi lớp là hình chữ nhật **bám chặt góc xa của
khung**, chỉ có góc gần chạy vào theo `at`; khi `at ≥ 0` khối trùm kín khung và **ở lại
như thế** cho tới khi lớp sau trùm lên. Phủ tới đâu thì ở lại tới đó, nên hợp của các lớp
chỉ có lớn lên chứ không bao giờ thủng.

Cách sai đã từng làm: trượt nguyên một hình **đúng cỡ khung** theo đường chéo. Hai hình
như vậy nối nhau luôn chừa lại **hai góc đối** — hình trước để hở chữ L ở dưới-phải, hình
sau lại lệch xuống dưới-phải nên với không tới mép trên và mép trái của chữ L đó. Kết quả
là ảnh cũ lòi ra đúng hai ô ở góc trên-phải và dưới-trái. Chiếu xuống một trục thì thấy
"kín", phải xét cả hai trục mới thấy lỗ.

Vì hình học đã do góc quyết định, ở chế độ này **cỡ shape / giãn dần / xoay / quãng đường
không dùng tới** — bố cục chỉnh bằng "Hở giữa hai lớp" và "Dồn dần về sau".

Với `gap` 0.42 và `gapFalloff` 0.55, phần lộ ra của ba lớp là `0.58 / 0.35 / 0.22` —
đúng tỉ lệ đo được từ mock của user.

#### Kiểm chứng bằng máy, không bằng mắt

Khe hở một hai pixel thì nhìn không ra. Cách kiểm: đặt `frame.bg` thành màu chói
(`#FF00FF`), quét cả timeline vào canvas rời rồi đếm pixel còn màu nền. Đạt là **0 pixel
trên toàn bộ khung có layer**. Lần chạy đầu bắt được một lỗi nữa ngoài dự đoán: ảnh nền
bị parallax đẩy đi mà `coverRect` chỉ phủ vừa khít, nên hở một sọc ở mép đối diện — nay
ảnh nền được phủ dư đúng bằng quãng đẩy.

## Cách hoạt động (chi tiết kiểu nối đuôi)

## Bố cục file

| File | Việc |
|---|---|
| `src/state.js` | **Nguồn duy nhất của mặc định** + bảng preset. Đổi mặc định là sửa `DEFAULTS`, không phải localStorage. |
| `src/timeline.js` | Toàn bộ toán thời gian & hình học. Hàm thuần: `timing()`, `sample()`, `trainGaps()`, `easeCurve()`. |
| `src/render.js` | Vẽ một khung hình vào bất kỳ 2D context nào, mọi kích thước suy từ `(W, H)` truyền vào. |
| `src/photos.js` | Nạp / thu nhỏ ảnh, sinh 3 ảnh mẫu để tool chạy được ngay lần đầu mở. |
| `src/store.js` | Kho ảnh IndexedDB + dọn ảnh mồ côi (có chốt an toàn, xem dưới). |
| `src/tabs.js` | Nhiều "bộ" song song: đọc/ghi metadata tab, chuyển dữ liệu bản cũ sang. |
| `src/export.js` | Quay video bằng `MediaRecorder`, chụp PNG một khung. |
| `src/ui.js` | Primitive panel theo ngôn ngữ Toolcraft. |
| `src/main.js` | Ghép state ↔ panel ↔ vòng render. |

Preview và bản xuất **dùng chung** `sample()` + `drawScene()`, nên video ra đúng bằng cái
đang xem — khác biệt duy nhất là độ phân giải.

## Thiết lập trong panel

- **Khung** — tỉ lệ `6:7` / `1:1` / `3:4` / `Tuỳ chỉnh` (có chip nhanh 4:5, 9:16, 16:9,
  2:3), màu nền. `6:7` là tỉ lệ đo từ ảnh mẫu user gửi (232×271 = 0.856, làm tròn về
  0.857); muốn khớp tuyệt đối thì dùng Tuỳ chỉnh với `232 × 271`.
- **Ảnh** — kéo thả nhiều file cùng lúc, kéo thumbnail ở rail trái để đổi thứ tự chạy,
  mỗi ảnh có phóng to + đẩy ngang/dọc riêng (kiểu `object-fit: cover` có điểm nhìn).
- **Shape** — số lượng 1–6, màu từng shape, độ đục, bo góc (theo % cạnh ngắn nên
  preview và bản 4K bo giống hệt), cỡ shape, giãn dần theo thứ tự, thứ tự chồng.
- **Chuyển động** — 7 preset (Chéo góc, Trượt ngang, Trượt dọc, Đảo chiều xen kẽ,
  Nghiêng xoay, Xếp tầng, **Đồng loạt xếp lớp**), kiểu chạy Nối đuôi / Đồng loạt,
  hướng bay tự do khi tắt "bám đường chéo", xoay khi bay, quãng đường.
  Riêng kiểu Đồng loạt: hở giữa hai lớp, dồn dần về sau, ảnh mới **Thu nhỏ** (cả tấm
  ảnh co vừa ô rồi lớn dần) hay **Lộ dần** (ảnh đứng yên, ô cửa mở rộng).
- **Easing** — tách làm hai như Figma: **chiều** (Hold / Ease in / Ease out /
  Ease in and out) × **đường cong** (Linear, Sine, Power2–4, Expo, Circ, Back),
  ghép lại ra đủ danh sách kiểu "Ease out back". Có ô xem trước đường cong bên cạnh.
- **Nhịp & tốc độ** — tốc độ tổng, thời lượng mỗi shape, lệch giữa các shape,
  giữ lúc che kín, **chờ trước khi chạy**, **nghỉ trước người kế tiếp**, ảnh trôi theo.
- **Xuất video** — bề ngang 720/1080/1440/2160, 24/30/60fps, 3 mức chất lượng, số vòng.

Phím tắt: `Space` phát/dừng · `R` về đầu · `←` `→` bước 40ms (giữ Shift: 200ms).

## Xuất video

Dùng `MediaRecorder` trên canvas offscreen ở đúng độ phân giải đã chọn. Ưu tiên
**MP4 (H.264)** nếu trình duyệt hỗ trợ, không thì rơi về WebM (VP9 → VP8).

Quay **theo thời gian thực**: `captureStream(fps)` + `requestAnimationFrame`, quay 8 giây
mất đúng 8 giây. Đây là chủ ý — `MediaRecorder` đóng dấu thời gian theo đồng hồ hệ thống,
nên nếu đẩy frame thủ công nhanh hơn thực tế thì file ra bị tua nhanh. Trong lúc quay,
vòng render của preview được tạm ngưng để không tranh nhịp rAF.

## Mặc định

`DEFAULTS` trong `src/state.js` là bộ thiết lập user đã chốt (2026-09-02): khung
**Theo ảnh**, kiểu chạy **Đồng loạt**, 5 lớp `#8FE04E / #F0EBE1 / #054D00 / #C4FF6B /
#021F00`, hở 0.10 đều nhau, Power3 Ease in and out, tốc độ 0.25× · 790ms, nghỉ 1150ms,
không parallax.

Muốn đổi mặc định thì đọc state của trang đang chạy (`loadState()`) rồi bake vào
`DEFAULTS`, **không** để nó sống trong localStorage. Verify bằng cách xoá **đúng key
`profile-reveal:settings`** rồi reload và so `loadState()` với `createState()`.

## Ba quãng đứng yên trong một lượt

```
[ lead: chờ trước khi chạy ][ anim ][ hold: nghỉ trước người kế tiếp ]
   ảnh hiện tại đứng sạch              ảnh mới đứng sạch
```

`lead` và `hold` nghe như trùng nhau vì trong vòng lặp chúng nằm sát nhau, nhưng khác ở
hai chỗ: `lead` là nhịp đứng **ngay đầu video xuất ra** (trước khi có bất kỳ chuyển động
nào), và nó tách bạch "ảnh đứng bao lâu trước khi shape chạy" khỏi "ảnh mới đứng bao lâu
sau khi xong". Cả hai đều chia cho `speed` như mọi mốc thời gian khác.

Trong `sample()`, `lead` bị trừ khỏi giờ chu kỳ trước khi đưa vào phần tính chuyển động
(`local = max(0, cycleLocal - lead)`), nên suốt quãng chờ thì không layer nào tồn tại.

## Nhiều bộ (tab)

Thanh tab ở đỉnh canvas. Mỗi tab giữ **riêng** danh sách ảnh và thiết lập, nên đổi màu
hay đổi nhịp ở bộ này không đụng gì tới bộ kia. Nhấp đúp lên tên tab để đổi tên; nút ×
chỉ hiện ở tab đang mở và biến mất khi chỉ còn một tab.

Thiết lập của mọi tab đều đi qua `normalizeSettings()` (DEFAULTS rồi phủ giá trị đã lưu
lên), nên thêm setting mới thì tab lưu từ trước tự nhận giá trị mặc định thay vì chạy với
`undefined`.

Tab được nạp **lười**: mở app thì chỉ tab đang xem nạp ảnh trước cho nhanh vào việc, các
tab khác nạp nền phía sau. Cờ `hydrated` phân biệt "tab thật sự không có ảnh" với "tab
chưa nạp" — thiếu nó thì lưu một cái là xoá trắng ảnh của tab chưa nạp.

## Lưu trữ

- `profile-reveal:tabs` (localStorage, ~1KB) — tên tab, thứ tự, thiết lập và **metadata**
  ảnh (id, tên, zoom, điểm nhìn).
- **IndexedDB `profile-reveal` / store `photos`** — dữ liệu ảnh thật, khoá theo id ảnh.
  Trước đây ảnh nằm trong localStorage nhưng ~0.8MB/ảnh × 2 ảnh × nhiều bộ là vượt hạn
  mức ~5MB của cả origin.

**Không bao giờ dùng `localStorage.clear()`** — nó xoá luôn thư viện ảnh của user.

Nạp xong hết tab thì `ensureStored()` soát lại: ảnh nào có trong tab mà thiếu dữ liệu
trong kho thì ghi bổ sung ngay. Một lần ghi hụt là mất ảnh sau reload, kiểm lại rẻ hơn
nhiều. Lỗi ghi kho không còn bị nuốt — nó nổi lên thành toast cho user thấy.

### Chốt an toàn khi dọn ảnh mồ côi

`collectGarbage()` chỉ chạy khi **mọi tab đã nạp xong ảnh** (`safe`), và tự dừng nếu kho
có ảnh mà danh sách giữ lại rỗng. Đã có lần danh sách giữ lại rỗng oan vì tab chưa nạp
serialize ra mảng trống, và hàm này xoá sạch kho — mất ảnh user đã import. Ảnh mồ côi chỉ
tốn chỗ, xoá nhầm thì không lấy lại được: **nghi ngờ thì không xoá.**
