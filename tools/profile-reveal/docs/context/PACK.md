# Pack: profile-reveal — Chuyển ảnh profile bằng shape màu

Shape màu bay chéo che kín khung để đổi ảnh profile, nhiều bộ theo tab, xuất video.

| | |
|---|---|
| Port dev | **3116** |
| Stack | JS thuần · Vite |
| Kích thước pack | 208K (mã nguồn 172K, 17 file) |
| Đã loại khỏi pack | `node_modules/`, `dist/`, `test-results/`, `.DS_Store` |
| Git history | không có — thư mục gốc chưa từng `git init` |
| Ngày đóng gói | 2026-09-08 |

## Trong pack có gì

```
profile-reveal-pack/
├── CLAUDE.md      ← primer. Chuyển ra ngang hàng source/ hoặc vào trong source/ để Claude Code tự nạp
├── PACK.md        ← file bạn đang đọc
├── context/
│   ├── 00-boi-canh-workspace.md
│   ├── 10-ghi-nho-du-an.md
│   └── 20-nhat-ky-hoi-thoai.md
└── source/        ← mã nguồn
```

## Dùng thế nào

### Cách A — mở bằng Claude Code (khuyên dùng)

```bash
cd profile-reveal-pack/source
cp ../CLAUDE.md .
mkdir -p docs && cp -r ../context docs/context
npm install
npm run dev        # → http://localhost:3116
```

`CLAUDE.md` nằm ở gốc repo sẽ được Claude Code **tự nạp mỗi phiên**, nên phiên mới hiểu
ngay project là gì và những cái bẫy đã trả giá. Ba file trong `context/` thì đọc khi cần
chiều sâu — nói với Claude: *"đọc docs/context/ trước khi sửa"*.

Trong `source/.claude/launch.json` đã có sẵn cấu hình để chạy
`preview_start({name: "profile-reveal"})`.

### Cách B — nạp ngữ cảnh vào một Project trên claude.ai

Tạo một Project mới, upload **cả 3–4 file trong `context/` + `CLAUDE.md`** vào phần
knowledge. Không cần upload mã nguồn (quá nặng và không cần thiết cho việc bàn ý tưởng).

## Đọc theo thứ tự nào

1. `CLAUDE.md` — 5 phút, đủ để bắt tay vào việc.
2. `context/10-ghi-nho-du-an.md` — **lý do** đằng sau từng quyết định và những cách làm
   **sai** đã thử. Đây là phần không tái tạo lại được.
3. `context/00-boi-canh-workspace.md` — cách Kaixa làm việc, luật chung 7 project.
4. `context/20-nhat-ky-hoi-thoai.md` — tra cứu khi cần biết "hồi đó Kaixa yêu cầu chính
   xác cái gì".


## Cài lại phụ thuộc

`package-lock.json` được giữ nguyên trong pack → `npm ci` cho ra đúng bộ thư viện như lúc
đóng gói.
