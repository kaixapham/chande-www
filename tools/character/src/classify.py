from PIL import Image; import numpy as np, sys
im=np.array(Image.open(sys.argv[1]).convert('RGBA')).astype(int)
rgb=im[...,:3]; a=im[...,3]
P={'ink':(30,22,20),'hair':(68,40,30),'skin':(225,165,108),'palm':(235,130,150),'cheek':(232,118,150),
   'white':(245,245,245),'blue':(10,155,222),'red':(225,35,40),'yellow':(245,210,20),'gray':(150,150,150)}
names=list(P); C=np.array([P[k] for k in names])
d=((rgb[:,:,None,:]-C[None,None])**2).sum(-1)
lab=d.argmin(-1); lab[a<128]=-1
for i,k in enumerate(names): print(k,(lab==i).sum(), rgb[lab==i].mean(0).round() if (lab==i).any() else '')
np.save(sys.argv[2],lab)
pal=np.array([P[k] for k in names]+[(255,0,255)])
Image.fromarray(pal[lab].astype(np.uint8)).resize((1113,1113),Image.NEAREST).save(sys.argv[3])
