import numpy as np, json, cv2, potrace
from PIL import Image
from scipy import ndimage as ndi
im=np.array(Image.open('src/goc.png').convert('RGBA')).astype(np.float32)
rgb=im[...,:3]; a=im[...,3]/255
lum=(rgb@np.array([.299,.587,.114]))*a+255*(1-a)   # nền coi như trắng
lab=np.load('src/lab.npy')
names=['ink','hair','skin','palm','cheek','white','blue','red','yellow','gray']
I={k:i for i,k in enumerate(names)}
P={'ink':(7,6,6),'hair':(63,44,39),'skin':(226,171,112),'palm':(233,134,162),'cheek':(226,122,155),'white':(253,253,253),'blue':(5,161,226),'red':(230,38,43),'yellow':(246,224,14),'gray':(151,141,133)}
plum={k:np.dot(v,[.299,.587,.114]) for k,v in P.items()}
H,W=lab.shape
L=lab.copy(); L[L==-1]=I['white']
# xám ngoài khuyên tai -> trắng
yy,xx=np.mgrid[:H,:W]
ear=(xx>=220)&(xx<=250)&(yy>=175)&(yy<=205)
L[(L==I['gray'])&~ear]=I['white']
g=(L==I['gray'])&ear&(lum>100)
gc,gn=ndi.label(g)
if gn:
    sizes=ndi.sum(g,gc,range(1,gn+1)); keep=gc==(np.argmax(sizes)+1)
    L[(L==I['gray'])&~keep]=I['hair']
L[L==I['gray']]=I['hair']
# palm ngoài vùng tay -> cheek
L[(L==I['palm'])&(yy>75)]=I['cheek']
L[(L==I['cheek'])&(yy<75)]=I['palm']
# mode filter cho vùng màu
for it in range(2):
    oh=np.stack([(L==i) for i in range(len(names))]).astype(np.float32); oh[0]=0
    cnt=np.stack([cv2.boxFilter(o,-1,(3,3),normalize=False) for o in oh]); best=cnt.argmax(0)
    sel=(L>0)&(L!=I['gray']); L[sel]=best[sel]
# tham chiếu sáng cục bộ
nonink=(L!=I['ink'])
_,idx=ndi.distance_transform_edt(~nonink,return_indices=True)
reflab=L[idx[0],idx[1]]
lut=np.array([plum[k] for k in names]); ref=lut[reflab]
f=np.clip((ref-lum)/np.maximum(ref-6,20),0,1)
f[L==I['ink']]=np.maximum(f[L==I['ink']],0.5)  # pixel đã xếp ink giữ ink
inkfield=f
# sticker: trắng nối với ngoài
whiteish=(L==I['white'])&(inkfield<0.5)
cc,_=ndi.label(whiteish)
outer=set(np.unique(cc[(a<0.5)]))-{0}
sticker=np.isin(cc,list(outer))
S=6
def upf(x,sig=1.2):
    m=cv2.resize(x.astype(np.float32),(W*S,H*S),interpolation=cv2.INTER_CUBIC)
    return cv2.GaussianBlur(m,(0,0),sig) if sig else m
# silhouette field: 1 - sticker (mềm theo inkfield ở mép)
silf=np.where(sticker,0,1).astype(np.float32)
edge=ndi.binary_dilation(sticker)&~sticker
silf=np.maximum(silf, 0)  
sil_soft=np.where(sticker, inkfield, 1.0)   # trong sticker, mép nét mềm theo độ đậm
SIL=upf(sil_soft,2.0)>0.5
SIL=ndi.binary_fill_holes(SIL)
INK=(upf(inkfield,1.0)>0.54)&SIL
# nhóm
headc=[I[k] for k in ['hair','skin','cheek','gray']]
bodyc=[I[k] for k in ['white','blue','red','yellow']]
inside=~sticker
handmask=np.zeros_like(L,bool)
skin_cc,n=ndi.label((L==I['skin'])&inside)
for i in range(1,n+1):
    if np.nonzero(skin_cc==i)[0].mean()<62: handmask|=(skin_cc==i)
handmask|=(L==I['palm'])&inside
headmask=np.isin(L,headc)&inside&~handmask
hc,hn=ndi.label(headmask)
hs=ndi.sum(headmask,hc,range(1,hn+1))
small=np.isin(hc,[i+1 for i,v in enumerate(hs) if v<40])
L[small&(L==I['hair'])]=I['ink']   # chi tiết tối nhỏ (lỗ chuông...) là nét
headmask&=~small
bodymask=np.isin(L,bodyc)&inside
dh,dhand,db=[ndi.distance_transform_edt(~m) for m in (headmask,handmask,bodymask)]
inkpx=inside&~(headmask|handmask|bodymask)
dskin=ndi.distance_transform_edt(~((L==I['skin'])&headmask))
dhair=ndi.distance_transform_edt(~((L==I['hair'])&headmask))
grp={'hands':handmask|(inkpx&(dhand<dh)&(dhand<db)),
     'head':headmask|(inkpx&(dhand>=dh)&((dh<=db)|(dskin<=3.4)|(dhair<=1.6))),
     'body':bodymask|(inkpx&(dhand>=db)&((db<dh)|(db<=3.2)))}
def trace(mask):
    if not mask.any(): return ''
    pl=potrace.Bitmap(~mask).trace(turdsize=10,alphamax=1.0,opticurve=True,opttolerance=0.4)
    g=lambda p:f'{p.x/S:.1f} {p.y/S:.1f}'
    out=[]
    for c in pl:
        s=['M'+g(c.start_point)]
        for seg in c.segments:
            s.append(('L'+g(seg.c)+'L'+g(seg.end_point)) if seg.is_corner else ('C'+g(seg.c1)+' '+g(seg.c2)+' '+g(seg.end_point)))
        out.append(''.join(s)+'Z')
    return ''.join(out)
order={'hands':['skin','palm'],'head':['hair','skin','cheek'],'body':['blue','white','red','yellow']}
res={}
for ln,gm in grp.items():
    gU=(upf(ndi.binary_dilation(gm,iterations=1),1.0)>0.5)&SIL
    parts=[('sil',trace(gU))]
    for k in order[ln]:
        m=(L==I[k])&gm
        if not m.any(): continue
        if k=='cheek':
            c2,n2=ndi.label(m)
            for i in range(1,n2+1):
                y2,x2=np.nonzero(c2==i)
                if len(y2)<30: continue
                (cx,cy),(w,h),an=cv2.fitEllipse(np.stack([x2,y2],1).astype(np.float32))
                parts.append(('cheek',f'E {cx+.5:.1f} {cy+.5:.1f} {w/2:.1f} {h/2:.1f} {an:.1f}'))
            continue
        if ln=='head' and k=='skin': m|=(L==I['cheek'])&gm
        if ln=='hands' and k=='skin': m|=(L==I['palm'])&gm
        if k=='red':
            c2,n2=ndi.label(m)
            for i in range(1,n2+1):
                key='tail' if np.nonzero(c2==i)[1].mean()>255 else 'collar'
                mm=ndi.binary_dilation(c2==i,iterations=2)
                parts.append((key,trace((upf(mm,1.0)>0.5)&gU)))
            continue
        dil=2 if k not in ('palm',) else 0
        mm=ndi.binary_dilation(m,iterations=dil) if dil else m
        key={'yellow':'bell','blue':'body','gray':'earring'}.get(k,k)
        parts.append((key,trace((upf(mm,1.0)>0.5)&gU)))
    parts.append(('ink',trace(INK&gU)))
    res[ln]=parts
    print(ln,[(k,len(d)) for k,d in parts])
json.dump(res,open('src/traced.json','w'))
cols={'sil':'#070606','skin':'#e2ab70','hair':'#3f2c27','palm':'#e986a2','cheek':'#e27a9b','earring':'#978d85','body':'#05a1e2','white':'#fdfdfd','collar':'#e6262b','tail':'#e6262b','bell':'#f6e00e','ink':'#070606'}
svg=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 371 371" width="1100" height="1100"><rect width="371" height="371" fill="#888"/>']
for ln in ['body','head','hands']:
    for k,d in res[ln]:
        if d.startswith('E '):
            cx,cy,rx,ry,an=d.split()[1:]; svg.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" transform="rotate({an} {cx} {cy})" fill="{cols[k]}"/>')
        else: svg.append(f'<path d="{d}" fill="{cols[k]}" fill-rule="evenodd"/>')
svg.append('</svg>'); open('src/traced.svg','w').write(''.join(svg))
