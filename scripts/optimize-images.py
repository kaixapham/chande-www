#!/usr/bin/env python3
"""Tối ưu ảnh của site: mỗi ảnh chỉ rộng tối đa 2× khung hiển thị (đủ nét trên retina).

- Khung lấy từ data-cms-w (ô ảnh / danh sách) trong các trang HTML; ảnh không ghi thì
  giới hạn MAX_DEFAULT; ảnh nền phủ cả màn (FULL) giới hạn MAX_FULL.
- Nén lại WebP chất lượng Q, chỉ thay khi nhẹ đi ≥ MIN_GAIN. Không bao giờ phóng to.
- Cần `cwebp` (brew install webp).

Chạy thử (không ghi):  python3 scripts/optimize-images.py
Ghi đè thật:          python3 scripts/optimize-images.py --write
"""
import json, os, re, subprocess, sys, tempfile

PAGES = ['index.html', 'about.html', 'gallery.html']
Q = 78
MIN_GAIN = 0.12
MAX_DEFAULT = 1800
MAX_FULL = 2400
FULL = ('land-bg', 'collage', 'story-road', 'story-night', 'poster-bg')
GALLERY_FULL = (1600, 74)  # ảnh lớn của gallery: giữ 1600px, nén mạnh hơn chút

def widths():
    """đường dẫn ảnh -> bề rộng hiển thị (px khổ 1920) đọc từ HTML."""
    out = {}
    for page in PAGES:
        if not os.path.exists(page):
            continue
        html = open(page, encoding='utf-8').read()
        for tag in re.findall(r'<img\b[^>]*>', html):
            src = re.search(r'\ssrc="([^"]+)"', tag)
            w = re.search(r'data-cms-w="(\d+)"', tag)
            if src and w:
                out[src.group(1)] = max(out.get(src.group(1), 0), int(w.group(1)))
        # danh sách: data-photos / JSON + data-cms-w
        for m in re.finditer(r'data-cms-list="[^"]*"[^>]*?data-cms-w="(\d+)"[^>]*?(?:data-photos=\'([^\']*)\'|>\s*(\[.*?\])\s*</script>)', html, re.S):
            w = int(m.group(1))
            try:
                items = json.loads(m.group(2) or m.group(3) or '[]')
            except Exception:
                continue
            for it in items:
                for v in ([it] if isinstance(it, str) else [x for x in it.values() if isinstance(x, str)]):
                    if v.startswith('assets/img/'):
                        out[v] = max(out.get(v, 0), w)
    return out

def dims(path):
    r = subprocess.run(['sips', '-g', 'pixelWidth', path], capture_output=True, text=True).stdout
    m = re.search(r'pixelWidth: (\d+)', r)
    return int(m.group(1)) if m else 0

def main(write):
    W = widths()
    files = subprocess.run(['git', 'ls-files', 'assets/img'], capture_output=True, text=True).stdout.split()
    before = after = 0
    changed = 0
    for f in files:
        if not f.endswith(('.webp', '.jpg', '.jpeg', '.png')) or 'favicon' in f or 'icon-' in f or 'apple-touch' in f:
            continue
        size = os.path.getsize(f)
        if size < 60 * 1024:
            continue
        q = Q
        if '/gallery/' in f and f.endswith('-full.webp'):
            cap, q = GALLERY_FULL
        elif any(k in f for k in FULL):
            cap = MAX_FULL
        elif f in W:
            cap = max(900, W[f] * 2)
        else:
            cap = MAX_DEFAULT
        w = dims(f)
        args = ['cwebp', '-quiet', '-q', str(q), '-m', '6', '-metadata', 'none']
        if w > cap:
            args += ['-resize', str(cap), '0']
        with tempfile.NamedTemporaryFile(suffix='.webp', delete=False) as t:
            tmp = t.name
        if subprocess.run(args + [f, '-o', tmp]).returncode != 0:
            continue
        new = os.path.getsize(tmp)
        before += size
        if new <= size * (1 - MIN_GAIN):
            after += new
            changed += 1
            print(f'{size // 1024:6}KB -> {new // 1024:5}KB  {w}px→{min(w, cap)}px  {f}')
            if write:
                # giữ đúng tên file (HTML không đổi); đuôi .jpg/.png vẫn chứa WebP thì trình duyệt vẫn đọc
                os.replace(tmp, f) if f.endswith('.webp') else os.remove(tmp)
            else:
                os.remove(tmp)
        else:
            after += size
            os.remove(tmp)
    print(f'\n{changed} ảnh thay · tổng ảnh xét {before / 1048576:.1f}MB -> {after / 1048576:.1f}MB' + ('' if write else '  (chạy thử, chưa ghi)'))

main('--write' in sys.argv)
