# Ghi nhớ dự án — profile-reveal

> Nguyên văn file memory Claude đã tự đúc kết trong quá trình làm (`profile-reveal-project.md`).
> Đây là phần **lý do** đằng sau các quyết định và những cách làm **sai** đã thử — không tái tạo lại được nếu mất.

---
name: profile-reveal-project
description: profile-reveal/ — tool hiệu ứng shape màu bay chéo để chuyển ảnh profile, JS thuần port 3116
metadata:
  type: project
---

`profile-reveal/` (bắt đầu 2026-09-02) là tool thứ sáu trong workspace: shape màu **cùng
tỉ lệ với khung** bay chéo từ góc dưới-phải lên trên-trái; đúng lúc shape cuối đi ngang
qua tâm nó che kín khung nên ảnh được đổi sang người tiếp theo ngay tại đó. Chạy
`npm run dev` port **3116**, đã có trong `.claude/launch.json`. JS thuần + Vite giống
[[scroll3d-demo]], [[cd-visualizer]], [[icon-motion]] — không theo khuôn Toolcraft, nhưng
UI mượn nguyên ngôn ngữ Toolcraft (canvas đen, panel 300px, control 28px, slider sợi 1px).

**Why:** user đưa một ảnh mock (chân dung + khối xanh cốm + khối kem xếp chéo ở góc
dưới-phải) và muốn dựng thành hiệu ứng chuyển profile có đủ tham số + xuất video.
Màu mặc định `#8FE04E` + `#F0EBE1` lấy thẳng từ mock đó.

Hai kiểu chạy (`motion.flow`):

1. `chase` — nối đuôi. **Điểm đổi ảnh chốt ở giữa quãng "che kín"**
   (`swapAt = (n-1)*stagger + duration/2 + coverHold/2`), không phải mốc tuỳ ý.
   Kéo "Cỡ shape" dưới 1× là khung hết được che kín → panel cảnh báo.
2. `train` — cả loạt shape cùng ùa ra từ góc, toa ảnh đi **cuối** đoàn:
   `shape 1 → … → shape n → [ảnh kế tiếp]`. `head` chạy `-1 → 0 → tail`; ở `head = 0`
   shape đầu khớp khung còn mọi toa sau xếp lồng nhau ở góc vào (toa trong cùng là ảnh
   người kế tiếp) — đúng bố cục mock; `coverHold` dừng đoàn ở đây để nó có nhịp thật.

**Ba lần sai trước khi ra đúng `train`** (user phải sửa hai lần, ghi lại để khỏi lặp):
đầu tiên làm đoàn chạy-rồi-hết nhưng bố cục xếp lớp chỉ lướt qua ~7% timeline; rồi đổi
sang băng chuyền vô tận thì **mất đoạn ảnh hiện sạch** — user phản hồi "vẫn phải có đoạn
hiện ra ảnh profile chứ"; rồi cho ảnh đi ĐẦU đoàn thì sai thứ tự — user chốt lại quy tắc
**"ảnh bắt đầu → shape animation → xuất hiện ảnh tiếp theo, shape vẫn phải từ góc ra"**.
Bài học: quy tắc ba nhịp đó là bất biến của tool, mọi kiểu chạy mới phải giữ nguyên nó.

**Khe hở — bài học hình học quan trọng nhất của tool.** Ở `train`, mỗi lớp phải là
**KHỐI GÓC** (hình chữ nhật bám chặt góc xa của khung, chỉ góc gần chạy vào; `at ≥ 0` là
trùm kín và ở lại) — `cornerBlock()` trong timeline.js. Cách sai đã làm: trượt nguyên
một hình **đúng cỡ khung** theo đường chéo; hai hình như vậy nối nhau luôn chừa **hai góc
đối** (trên-phải + dưới-trái) vì hình sau lệch xuống dưới-phải nên với không tới mép trên
và mép trái của chữ L mà hình trước để lại. Chiếu xuống một trục thì thấy "kín", **phải
xét cả hai trục mới thấy lỗ** — mình đã suy luận sai đúng chỗ này. Hệ quả: ở `train` thì
cỡ shape / giãn dần / xoay / quãng đường vô nghĩa, đã ẩn khỏi panel.

**Cách kiểm khe hở (dùng lại được):** đặt `frame.bg` thành `#FF00FF`, quét cả timeline
vào canvas rời rồi đếm pixel còn màu nền — đạt là 0. Lần chạy đầu bắt thêm một lỗi ngoài
dự đoán: ảnh nền bị parallax đẩy đi mà `coverRect` chỉ phủ vừa khít nên hở một sọc ở mép
đối diện (lỗi này có ở CẢ HAI chế độ từ đầu). Nhìn mắt thường không ra.

**Bẫy easing đã dính một lần:** chặng vào và chặng ra chỉ được cắt rời KHI `coverHold > 0`.
Cắt rời lúc `coverHold = 0` thì mỗi chặng tự ease riêng → tốc độ về 0 ở `head = 0` rồi
tăng lại, user thấy ngay ("sao đang animation có 1 đoạn bị khựng"). Quy tắc chung: **một
chuyển động liền mạch thì một đường cong, chỉ chia khúc khi có quãng dừng thật.**

Hai điều `train` bảo đảm bằng cấu trúc: (a) không hở khe — mọi khoảng hở bị chặn ≤ 1
quãng đường, hai toa liền nhau phủ `[0,1-a]` và `[g-a,1]` nên hợp lại kín với mọi
`g ≤ 1`, **vì thế `travel` bị bỏ qua ở chế độ này**; (b) toa ảnh luôn scale 1 để cập
bến khớp khít với ảnh nền của lượt sau. Tỉ lệ lộ ra `0.58 / 0.35 / 0.22` (gap .42,
falloff .55) đo từ mock của user.

Easing tách hai chiều giống Figma: `easing` (họ đường cong) × `easeMode`
(hold / in / out / inOut) → `easeCurve()`, ghép ra đủ "Ease out back". Panel có ô
xem trước đường cong vẽ bằng polyline SVG.

**Mặc định đã chốt 2026-09-02** (bake trong `DEFAULTS`, đọc từ state trang đang chạy):
khung **Theo ảnh** (`ratio: 'photo'` — lấy tỉ lệ pixel của **ảnh đầu danh sách**, cố ý
không phải ảnh đang chọn vì khung phải đứng yên suốt lượt), kiểu chạy `train`, 5 lớp
`#8FE04E / #F0EBE1 / #054D00 / #C4FF6B / #021F00`, gap 0.10 đều, Power3 inOut,
speed 0.25× · 790ms, hold 1150ms, parallax 0.

**Nhiều bộ (tab) + kho ảnh IndexedDB** (2026-09-02): thanh tab ở đỉnh canvas, mỗi tab giữ
riêng ảnh + thiết lập. Metadata tab ở `profile-reveal:tabs` (localStorage ~1KB), dữ liệu
ảnh ở **IndexedDB** (`src/store.js`) vì ~0.8MB/ảnh × nhiều bộ là vượt hạn mức ~5MB của
localStorage. Tab nạp lười, cờ `hydrated` phân biệt "tab không có ảnh" với "tab chưa nạp".

**ĐÃ LÀM MẤT ẢNH CỦA USER MỘT LẦN — đọc kỹ.** Hai lỗi cộng lại: (1) tab chưa nạp
serialize `photos` ra mảng trống nên ghi đè mất metadata; (2) `collectGarbage()` nhận
danh sách giữ lại rỗng rồi **xoá sạch kho IndexedDB**. Nay có hai chốt: chỉ dọn khi MỌI
tab đã `hydrated`, và tự dừng nếu kho có ảnh mà danh sách giữ lại rỗng. Nguyên tắc rút
ra: **ảnh mồ côi chỉ tốn chỗ, xoá nhầm thì không lấy lại được — nghi ngờ thì không xoá**;
và mọi hàm xoá dữ liệu user phải có tham số `safe` do người gọi khẳng định, không tự suy.
Liên quan: `openTab()` cũng từng ghi `photos` rỗng lúc khởi động đè lên tab vừa nạp —
phải có cờ `bound` mới được ghi ngược về tab cũ.

**Ba quãng đứng yên một lượt:** `lead` (chờ trước khi chạy) → `anim` → `hold` (nghỉ
trước người kế tiếp). `lead` và `hold` nằm sát nhau trong vòng lặp nên nghe trùng, nhưng
`lead` là nhịp đứng ngay đầu video xuất ra và tách bạch hai ý niệm khác nhau — user hỏi
đúng cái này nên đừng gộp lại.

**Thêm setting mới phải qua `normalizeSettings()`** (DEFAULTS rồi phủ bản lưu lên) ở
`readTabs()`. Đọc `t.settings` thô là tab lưu từ trước chạy với `undefined` cho khoá mới,
slider ăn giá trị rỗng. Đã dính đúng lần thêm `timing.lead`.

**Tỉ lệ 6:7** = đo từ ảnh mẫu user gửi (232×271 = 0.856). User gửi ảnh vì lười đo, **không
phải** muốn chế độ bám theo ảnh bất kỳ — mình làm nhầm thành `ratio: 'photo'` động một
lần rồi phải sửa lại thành một tỉ lệ cố định trong `RATIOS`.

**How to apply:** đổi *mặc định* thì sửa `DEFAULTS` trong `src/state.js` (không phải
localStorage); đổi *cách shape bay* thì sửa `sample()`/`PRESETS`; đổi *cách vẽ* thì sửa
`src/render.js`. Hai key storage tách riêng: `profile-reveal:settings` và
`profile-reveal:photos` — **không dùng `localStorage.clear()`**, sẽ mất thư viện ảnh user.
