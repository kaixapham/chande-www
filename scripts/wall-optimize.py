# Collage (section Kỷ niệm): mảnh nào đang trỏ PNG gốc -> tạo WebP vừa cỡ hiển thị (2×), giữ PNG làm "orig".
# Chạy trước mỗi lần commit (trình sửa bản cũ có thể lưu đè PNG gốc ~50 MB lên trang).
# Bước 2: bản ảnh nhẹ cho MOBILE (mimg, đuôi -m<bề rộng>.webp) của collage Kỷ niệm + các tờ Poster — bản mobile
# là ảnh tĩnh cỡ mw (px khung 375) -> cần ~3 × mw. chande-wall.js / chande-poster.js chỉ dùng mimg khi tên khớp
# ảnh gốc và bề rộng ≥ 2.4 × mw, không thì quay về ảnh desktop.
import re,json,os,subprocess,math,sys
p='index.html'; s=open(p).read()
RE=r'(<script\b[^>]*data-wall-pieces[^>]*>)([\s\S]*?)(</script>)'
m=re.search(RE,s); pieces=json.loads(m.group(2)); tot=0; n=0
for pc in pieces:
    src=pc.get('orig') or pc['img']
    if src.endswith('.png') or pc['img'].endswith('.png'):
        src=pc['img'] if pc['img'].endswith('.png') else src
        W=int(subprocess.run(['sips','-g','pixelWidth',src],capture_output=True,text=True).stdout.split()[-1])
        tw=min(W, max(400, math.ceil(pc['w']*2)))
        out=src[:-4]+f'-d{tw}.webp'
        if not os.path.exists(out):
            subprocess.run(['cwebp','-quiet','-q','85','-alpha_q','90','-resize',str(tw),'0',src,'-o',out],check=True)
        pc['orig']=src; pc['img']=out; n+=1
    tot+=os.path.getsize(pc['img'])
txt='[\n'+',\n'.join('        '+json.dumps(x,ensure_ascii=False,separators=(',',':')) for x in pieces)+'\n      ]'
s=re.sub(RE,lambda mm: mm.group(1)+'\n      '+txt+'\n      '+mm.group(3),s)

def mobile(items, src_of, stem_of):
    made=0; mt=0
    for it in items:
        if it.get('mw') is None: continue
        src=src_of(it)
        if src.endswith('.svg') or not os.path.exists(src): continue
        W=int(subprocess.run(['sips','-g','pixelWidth',src],capture_output=True,text=True).stdout.split()[-1])
        need=math.ceil(float(it['mw'])*3)
        cur=it.get('mimg'); cm=re.search(r'-m(\d+)\.webp$',cur or '')
        if cur and cm and cur.startswith(stem_of(src)+'-m') and os.path.exists(cur) and need*0.9<=int(cm.group(1))<=need*1.6:
            mt+=os.path.getsize(cur); continue
        if need>=W*0.8:  # không nhẹ hơn bao nhiêu -> dùng luôn ảnh desktop
            it.pop('mimg',None); mt+=os.path.getsize(it['img']); continue
        out=f'{stem_of(src)}-m{need}.webp'
        if not os.path.exists(out):
            subprocess.run(['cwebp','-quiet','-q','82','-alpha_q','90','-resize',str(need),'0',src,'-o',out],check=True)
        it['mimg']=out; made+=1; mt+=os.path.getsize(out)
    return made, mt
dump=lambda L: '[\n'+',\n'.join('        '+json.dumps(x,ensure_ascii=False,separators=(',',':')) for x in L)+'\n      ]'
txt=dump(pieces)
s=re.sub(RE,lambda mm: mm.group(1)+'\n      '+txt+'\n      '+mm.group(3),s)
wm=mobile(pieces, lambda pc: pc.get('orig') or pc['img'], lambda f: re.sub(r'(-d\d+)?\.(png|webp|jpe?g)$','',f))
txt=dump(pieces)
s=re.sub(RE,lambda mm: mm.group(1)+'\n      '+txt+'\n      '+mm.group(3),s)
RE2=r'(<script\b[^>]*data-poster-sheets[^>]*>)([\s\S]*?)(</script>)'
m2=re.search(RE2,s)
if m2:
    sheets=json.loads(m2.group(2))
    pm=mobile(sheets, lambda sh: sh['img'], lambda f: re.sub(r'\.(png|webp|jpe?g)$','',f))
    txt2=dump(sheets)
    s=re.sub(RE2,lambda mm: mm.group(1)+'\n      '+txt2+'\n      '+mm.group(3),s)
else: pm=(0,0)
open(p,'w').write(s)
print('optimized',n,'pieces; page MB',round(tot/1048576,2))
print('mobile: wall',wm[0],'new, MB',round(wm[1]/1048576,2),'· poster',pm[0],'new, MB',round(pm[1]/1048576,2))
