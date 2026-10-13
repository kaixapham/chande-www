# Collage (section Kỷ niệm): mảnh nào đang trỏ PNG gốc -> tạo WebP vừa cỡ hiển thị (2×), giữ PNG làm "orig".
# Chạy trước mỗi lần commit (trình sửa bản cũ có thể lưu đè PNG gốc ~50 MB lên trang).
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
open(p,'w').write(s)
print('optimized',n,'pieces; page MB',round(tot/1048576,2))
