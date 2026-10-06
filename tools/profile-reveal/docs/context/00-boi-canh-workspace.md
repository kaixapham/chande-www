# Bối cảnh chung — workspace `Claude.Emotiv` (7 tool cá nhân)

> File này đi kèm **mọi** pack. Đọc nó trước, rồi mới đọc `CLAUDE.md` của từng project.
> Ngày đóng gói: **2026-09-08**. Nguồn: `~/Desktop/Claude.Emotiv` trên máy Mac của Kaixa.

---

## 1. Vì sao có mấy pack này

Tài khoản Claude đang chạy các project này là **mail công ty (Emotiv)**. Chủ nhân
(Kaixa — `kaixadesign@gmail.com`) muốn tách bạch hai luồng:

- **mail Emotiv** → làm `Brainwear-design-system`, đẩy lên **GitHub công ty**;
- **mail cá nhân** → 7 tool dưới đây, đẩy lên **GitHub cá nhân**.

Nguyên văn yêu cầu ngày 2026-09-08:

> "giờ bối cảnh là tôi dùng mail Emotiv, làm brainwear, up lên github công ty, dùng mail
> cá nhân, làm project cá nhân, up lên github cá nhân. Giờ tôi muốn 2 luồng không bị nhập
> nhằng, lẫn lộn cả nhau, **lần trước bạn đã bị nhầm 1 lần rồi nên tôi hơi khó chịu**"

**→ Quy tắc số 1 cho tài khoản cá nhân: không đụng vào bất cứ thứ gì thuộc Emotiv /
Brainwear.** Không clone, không commit, không push chéo. Bảy tool trong các pack này là
tài sản cá nhân, tách hẳn ra.

Trên máy cũ, git identity đã được tách bằng `~/.gitconfig` + `~/.gitconfig-work`
(`includeIf`), nên khi dựng lại môi trường thì làm y như vậy: mặc định là mail cá nhân,
chỉ thư mục công ty mới override sang mail Emotiv.

---

## 2. Bảy project là gì

Tất cả đều là **tool nội bộ cho designer** (Kaixa là designer, không phải dev backend):
mỗi tool là một *artboard + panel setting*, chỉnh tham số trực quan rồi **xuất ra ảnh /
video / snippet code** để dùng cho branding và web.

| # | Project | Port | Stack | Một câu |
|---|---------|------|-------|---------|
| 1 | `toolcraft` | 3111 | React 19 + TS + Toolcraft framework | Scaffold Toolcraft gốc, chứa tool ảnh **Halation** |
| 2 | `gradient-studio` | 3112 | React 19 + TS + Toolcraft framework | **Signal Studio** — motion gradient / sound-wave / mosaic, xuất PNG + MP4/WebM |
| 3 | `scroll3d-demo` | 3113 | JS thuần + Vite + three.js | Vật liệu PBR + IBL, mỗi cú scroll ra một góc nhìn |
| 4 | `cd-visualizer` | 3114 | JS thuần + Vite + three.js | **Nocturne CD** — máy CD 3D tham số hoá, CMS bài hát, audio + sfx |
| 5 | `icon-motion` | 3115 | JS thuần + Vite | Tách part icon SVG, đoán vai trò, sinh animation + snippet WAAPI |
| 6 | `profile-reveal` | 3116 | JS thuần + Vite | Shape màu bay chéo chuyển ảnh profile, xuất video |
| 7 | `paper-stack` | 3117 | JS thuần + Vite + three.js | Scroll thả từng tờ giấy xuống chồng, xuất MP4 + snippet nhúng |

Ngoài ra workspace còn có `das-home` (port 3118, mirror offline das.info.vn) — **không nằm
trong đợt đóng gói này**, hỏi Kaixa nếu cần.

### Hai họ project — đừng trộn quy trình

- **Họ Toolcraft** (`toolcraft`, `gradient-studio`): React + TypeScript, chạy trên framework
  `@pixel-point/toolcraft`. Runtime ký số nằm ở `src/toolcraft/**` — **không được sửa**;
  phần sản phẩm chỉ được nằm trong `src/app/**`. Có bộ kiểm tra riêng rất chặt
  (`npm run ai:check`, `test`, `test:browser`, `verify:delivery`, `verify:perf`,
  `verify:receipt`) và một hợp đồng "acceptance" phải khai đủ mới build được.
  Đọc `AGENTS.md` (38 KB) + `docs/toolcraft/**` trước khi động vào.
- **Họ JS thuần** (5 tool còn lại): Vite + JS thuần, không React, không TypeScript,
  **không có** bộ script `ai:check` / `verify:*`. **Đừng áp quy trình kiểm tra của
  Toolcraft lên chúng.** Nhưng UI thì mượn nguyên ngôn ngữ Toolcraft (xem mục 4).

---

## 3. Cách chạy

Mỗi pack có `source/.claude/launch.json` riêng để Claude Code mở preview bằng
`preview_start({name: "<tên project>"})`. Nếu đặt cả 7 project cạnh nhau trong một
workspace như cũ thì dùng `launch.json` gộp ở `_workspace/launch.json` trong pack
`00-shared`.

```bash
npm install
npm run dev
```

Port đã cố định trong `package.json` của các tool JS thuần (`--strictPort`) vì Kaixa nhớ
port theo tool. Hai tool Toolcraft tự tìm port trống qua `scripts/run-vite-on-free-port.mjs`.

---

## 4. Ngôn ngữ UI dùng chung (đo từ Toolcraft, không phỏng đoán)

Năm tool JS thuần cố ý bắt chước giao diện Toolcraft cho đồng bộ. Số liệu này lấy bằng
cách **đọc computed style của toolcraft đang chạy ở port 3111**, không phải áng chừng:

- canvas nền đen, panel bên phải rộng **300px**
- control cao **28px**, bo **8px**, nền `rgba(255,255,255,.05)`
- slider: rãnh **sợi 1px**, thumb **vuông 9px**
- primary button: nền trắng, chữ đen
- nhãn control viết **tiếng Việt**

Muốn dựng thêm tool thứ 8 cùng bộ thì bám đúng các con số này.

---

## 5. Cách Kaixa làm việc — đọc kỹ, đây là phần dễ mất nhất

1. **Nói bằng tiếng Việt, mô tả bằng con mắt designer.** Yêu cầu thường là một câu tả cảm
   giác ("nét hơi mềm cong nhẹ hướng vào tâm", "cảm giác smooth, enjoy nhạc và có feeling")
   chứ không phải spec số. Nhiệm vụ là dịch nó ra tham số rồi *cho slider để chỉnh lại*.
2. **Ảnh mock là nguồn sự thật.** Gần như tool nào cũng bắt đầu từ 1–4 ảnh Kaixa tự dựng.
   Màu mặc định, tỉ lệ, bố cục đều **đo từ ảnh đó** chứ không tự chọn.
3. **"Lưu setting hiện tại làm mặc định" = bake vào code.** Đọc state của trang đang chạy
   rồi ghi thẳng vào `DEFAULTS` / `params.js` / `RUNTIME_DEFAULTS`, **không** để trong
   localStorage. Verify bằng cách xoá đúng key rồi reload.
4. **TUYỆT ĐỐI KHÔNG `localStorage.clear()` và không xoá IndexedDB bừa.** Đã một lần làm
   mất toàn bộ thư viện ảnh của Kaixa ở `profile-reveal`. Mỗi tool có key riêng, chỉ xoá
   đúng key đó. Mọi hàm dọn rác phải nhận cờ `safe` do người gọi khẳng định.
   **Ảnh mồ côi chỉ tốn chỗ; xoá nhầm thì không lấy lại được — nghi ngờ thì không xoá.**
5. **Kaixa nghịch trực tiếp trong preview pane cùng lúc mình đang sửa.** Giá trị đo được
   qua `javascript_tool` có thể đổi giữa chừng — đừng vội kết luận là bug.
6. **Verify bằng số, đo trên chính trang đang chạy.** Hiệu ứng vật lý phải đo bằng **biên
   độ tính theo % kích thước vật thể**, không phải bằng "lò xo có chạy hay không". Kiểm
   coverage bằng cách nhuộm nền `#FF00FF` rồi đếm pixel còn sót.
7. **Kaixa phát hiện lỗi hình ảnh trước mình.** Z-fighting, khe hở, nét thừa, mép trồi —
   toàn do Kaixa chỉ ra. Nhìn kỹ ảnh chụp trước khi báo "xong".
8. **Đầu ra luôn phải xuất được.** Tool nào cũng cần ít nhất một trong: PNG, MP4/WebM,
   snippet code nhúng. Đây là điều kiện để tool có ích, không phải tính năng phụ.
9. **Không tách hiệu ứng khỏi file UI setting một cách tuỳ tiện** — bài học từ `das-home`:
   khi tweak thì để file hiệu ứng và file UI setting tách bạch rõ ràng.

---

## 6. Trong mỗi pack có gì

```
<project>-pack/
├── CLAUDE.md                      ← primer, Claude Code tự nạp khi mở source/
├── PACK.md                        ← mô tả pack + cách import
├── context/
│   ├── 00-boi-canh-workspace.md   ← chính là file bạn đang đọc
│   ├── 10-ghi-nho-du-an.md        ← memory Claude đã tự đúc kết (bài học, bẫy đã dính)
│   └── 20-nhat-ky-hoi-thoai.md    ← NGUYÊN VĂN mọi yêu cầu Kaixa đã gõ, theo thời gian
└── source/                        ← mã nguồn (đã bỏ node_modules, dist, test-results)
```

`10-ghi-nho-du-an.md` và `20-nhat-ky-hoi-thoai.md` là hai file **không thể tái tạo lại
được** nếu mất — chúng chứa lý do đằng sau từng quyết định và cả những cách làm **sai**
đã thử. Giữ chúng trong repo.
