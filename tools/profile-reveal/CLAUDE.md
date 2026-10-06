# profile-reveal — primer cho Claude

Đọc `docs/context/00-boi-canh-workspace.md` trước nếu chưa đọc.
**`docs/context/10-ghi-nho-du-an.md` là file quan trọng nhất của project này — đọc hết trước khi sửa.**

## Là cái gì

Tool thứ sáu, bắt đầu **2026-09-02**. Hiệu ứng chuyển ảnh profile: các **shape màu cùng tỉ
lệ với khung** bay chéo từ góc dưới-phải lên trên-trái; đúng lúc shape cuối che kín khung
thì ảnh đổi sang người tiếp theo ngay tại đó. Xuất được video.

Màu mặc định `#8FE04E` + `#F0EBE1` **lấy thẳng từ ảnh mock của Kaixa** (chân dung + khối
xanh cốm + khối kem xếp chéo góc dưới-phải).

- Port: **3116** · `npm run dev`
- Stack: **JS thuần + Vite**. UI mượn nguyên ngôn ngữ Toolcraft. **Đừng áp quy trình Toolcraft.**

## Vị trí: project con của `chande-www` (từ 2026-10-06)

Nằm ở `~/Desktop/chande-www/tools/profile-reveal/` (trước đó ở `~/Projects/profile-reveal`).
Preview: cấu hình `profile-reveal` trong `chande-www/.claude/launch.json`. Port vẫn là 3116
nên kho IndexedDB (gắn theo origin `localhost:3116`) không đổi.

**Đã gắn vào hero home (2026-10-06).** Site không chạy tool này mà dùng player
`chande-www/assets/js/chande-reveal.js` — lõi `train` + `cornerBlock` + easing chép từ
`timeline.js`, CONFIG ở đầu file, màu đổi sang bảng của site
(`#68f12b / #f4f3eb / #236c3c / #c4ff6b / #182220`), shape dither Bayer 16 theo `data-levels`
của ô. `chande-hero.js` gọi nó khi đổi ảnh: 4 ô chạy lần lượt **từ ô thấp nhất lên ô cao
nhất** (`order: 'bottomUp'`), lệch `revealStagger` ms. Player **chỉ có kiểu `train`**, chưa
có `chase` / parallax / bo góc. **Sửa lõi ở tool thì phải chép sang player** — hai bản không
tự đồng bộ.

## ⛔ Cảnh báo dữ liệu — đọc trước tiên

**Đã một lần làm mất toàn bộ ảnh của Kaixa.** Hai lỗi cộng lại: (1) tab chưa nạp thì
serialize `photos` thành mảng rỗng → ghi đè mất metadata; (2) `collectGarbage()` nhận danh
sách giữ-lại rỗng rồi **xoá sạch kho IndexedDB**.

Hiện có hai chốt: chỉ dọn khi **mọi** tab đã `hydrated`, và tự dừng nếu kho có ảnh mà danh
sách giữ-lại rỗng. Giữ nguyên hai chốt này.

Nguyên tắc: **ảnh mồ côi chỉ tốn chỗ, xoá nhầm thì không lấy lại được — nghi ngờ thì không
xoá.** Mọi hàm xoá dữ liệu user phải có tham số `safe` do **người gọi khẳng định**, không
tự suy. **Không bao giờ `localStorage.clear()`** — hai key riêng là
`profile-reveal:settings` và `profile-reveal:photos`.

## Quy tắc ba nhịp — bất biến của tool

> **ảnh bắt đầu → shape animation → xuất hiện ảnh tiếp theo, shape vẫn phải từ góc ra**

Kaixa phải sửa mình **ba lần** mới ra đúng: đầu tiên làm đoàn chạy-rồi-hết nhưng bố cục xếp
lớp chỉ lướt qua ~7% timeline; rồi đổi sang băng chuyền vô tận thì **mất đoạn ảnh hiện sạch**
("vẫn phải có đoạn hiện ra ảnh profile chứ"); rồi cho ảnh đi **đầu** đoàn thì sai thứ tự.
**Mọi kiểu chạy mới phải giữ nguyên ba nhịp này.**

## Hai kiểu chạy (`motion.flow`)

1. **`chase`** — nối đuôi. Điểm đổi ảnh **chốt ở giữa quãng "che kín"**:
   `swapAt = (n-1)*stagger + duration/2 + coverHold/2`. Kéo "Cỡ shape" dưới 1× thì khung
   hết được che kín → panel cảnh báo.
2. **`train`** (mặc định) — cả loạt shape cùng ùa ra từ góc, **toa ảnh đi cuối đoàn**:
   `shape 1 → … → shape n → [ảnh kế tiếp]`. `head` chạy `-1 → 0 → tail`; ở `head = 0` shape
   đầu khớp khung, mọi toa sau xếp lồng nhau ở góc vào (toa trong cùng là ảnh người kế
   tiếp) — đúng bố cục mock. `coverHold` dừng đoàn ở đây để có nhịp thật.

## Bài học hình học quan trọng nhất: khe hở

Ở `train`, **mỗi lớp phải là KHỐI GÓC** — hình chữ nhật bám chặt góc xa của khung, chỉ góc
gần chạy vào; `at ≥ 0` là trùm kín và ở lại (`cornerBlock()` trong `timeline.js`).

Cách **sai** đã làm: trượt nguyên một hình đúng cỡ khung theo đường chéo. Hai hình như vậy
nối nhau luôn chừa **hai góc đối** (trên-phải + dưới-trái), vì hình sau lệch xuống dưới-phải
nên với không tới mép trên và mép trái của chữ L mà hình trước để lại.
**Chiếu xuống một trục thì thấy "kín" — phải xét CẢ HAI trục mới thấy lỗ.**

Hệ quả: ở `train` thì *cỡ shape / giãn dần / xoay / quãng đường* vô nghĩa, đã ẩn khỏi panel;
`travel` bị bỏ qua ở chế độ này.

**Cách kiểm khe hở (dùng lại được):** đặt `frame.bg = #FF00FF`, quét cả timeline vào canvas
rời rồi **đếm pixel còn màu nền — đạt là 0**. Lần đầu chạy đã bắt thêm một lỗi ngoài dự
đoán: ảnh nền bị parallax đẩy đi mà `coverRect` chỉ phủ vừa khít nên hở một sọc ở mép đối
diện (có ở **cả hai** chế độ từ đầu). Mắt thường không thấy.

## Bẫy easing đã dính

Chặng vào và chặng ra **chỉ được cắt rời KHI `coverHold > 0`**. Cắt rời lúc `coverHold = 0`
thì mỗi chặng tự ease riêng → tốc độ về 0 ở `head = 0` rồi tăng lại, Kaixa thấy ngay
("sao đang animation có 1 đoạn bị khựng").

**Quy tắc: một chuyển động liền mạch thì một đường cong; chỉ chia khúc khi có quãng dừng
thật.** (Lưu ý: quy tắc này **không** áp cho `paper-stack`, ở đó hai chặng là hai đại lượng
khác nhau nên tách đường cong là đúng.)

## Easing kiểu Figma

`easing` (họ đường cong) × `easeMode` (hold / in / out / inOut) → `easeCurve()`, ghép ra đủ
"Ease out back". Panel có ô xem trước đường cong vẽ bằng polyline SVG.

## Mặc định đã chốt 2026-09-02 (bake trong `DEFAULTS`)

khung **Theo ảnh** (`ratio: 'photo'` — lấy tỉ lệ pixel của **ảnh đầu danh sách**, cố ý
không phải ảnh đang chọn, vì khung phải đứng yên suốt lượt) · kiểu chạy `train` ·
5 lớp `#8FE04E / #F0EBE1 / #054D00 / #C4FF6B / #021F00` · gap 0.10 đều · Power3 inOut ·
speed 0.25× · 790 ms · hold 1150 ms · parallax 0. Tỉ lệ lộ ra `0.58 / 0.35 / 0.22`
(gap .42, falloff .55) đo từ mock.

Về **tỉ lệ 6:7**: đo từ ảnh mẫu Kaixa gửi (232×271 = 0.856). Kaixa gửi ảnh vì **lười đo**,
**không phải** muốn chế độ bám theo ảnh bất kỳ — mình từng làm nhầm thành `ratio: 'photo'`
động rồi phải sửa lại thành một tỉ lệ cố định trong `RATIOS`.

## Nhiều bộ (tab) + kho ảnh

Thanh tab ở đỉnh canvas, mỗi tab giữ riêng ảnh + thiết lập. Metadata tab ở
`profile-reveal:tabs` (localStorage ~1 KB); **dữ liệu ảnh ở IndexedDB** (`src/store.js`) vì
~0.8 MB/ảnh × nhiều bộ vượt hạn mức ~5 MB của localStorage. Tab **nạp lười**, cờ `hydrated`
phân biệt "tab không có ảnh" với "tab chưa nạp". `openTab()` phải có cờ `bound` mới được
ghi ngược về tab cũ.

## Ba quãng đứng yên một lượt

`lead` (chờ trước khi chạy) → `anim` → `hold` (nghỉ trước người kế tiếp). `lead` và `hold`
nằm sát nhau trong vòng lặp nên **nghe** trùng, nhưng `lead` là nhịp đứng ngay đầu video
xuất ra và là hai ý niệm khác nhau — Kaixa đã hỏi đúng cái này, **đừng gộp lại**.

## Thêm setting mới

**Phải qua `normalizeSettings()`** (DEFAULTS rồi phủ bản lưu lên) ở `readTabs()`. Đọc
`t.settings` thô thì tab lưu từ trước chạy với `undefined` cho khoá mới, slider ăn giá trị
rỗng. Đã dính đúng lần thêm `timing.lead`.

## Bản đồ file

```
src/
├── state.js     # ★ DEFAULTS + normalizeSettings — đổi MẶC ĐỊNH ở đây
├── timeline.js  # ★ sample() / PRESETS / cornerBlock — đổi CÁCH SHAPE BAY ở đây
├── render.js    # ★ đổi CÁCH VẼ ở đây
├── store.js     # IndexedDB — chứa collectGarbage(safe)
├── tabs.js  photos.js  export.js  ui.js  main.js  style.css
```
