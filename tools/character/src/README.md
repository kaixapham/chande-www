# Vector hoá nhân vật

`../traced.js` được sinh từ `goc.png`. Chạy lại từ thư mục `tools/character`:

```
pip install numpy pillow scipy opencv-python-headless potracer
python3 src/classify.py src/goc.png src/lab.npy /tmp/lab.png
python3 src/trace2.py
python3 -c "import json;d=json.load(open('src/traced.json'));open('traced.js','w').write('// Vector hoá từ ảnh nhân vật gốc (371x371). Sinh tự động — không sửa tay.\nwindow.CHANDE_TRACED = '+json.dumps(d,separators=(',',':'))+';\n')"
```
