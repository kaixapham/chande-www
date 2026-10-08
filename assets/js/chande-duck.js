/* =============================================================================
 * CHANDE — Vịt patin 3D trượt trên lưới gallery
 * -----------------------------------------------------------------------------
 * Hình gốc là pixel art vịt hai chân đi patin (bỏ con dấu đỏ phía sau). Mỗi
 * pixel thành một khối voxel; độ dày phồng dần vào giữa thân (theo khoảng cách
 * tới mép hình) nên nhìn tròn chứ không phẳng như bìa cứng. Vịt quay mặt sang
 * PHẢI trong hình (khối lớn bên trái là đuôi). Gồm:
 *   • thân: đầu + mũ + ống chân + một chiếc patin (hàng 0..WHEEL_TOP-1)
 *   • 4 bánh xe voxel tròn thay cho 4 bướu ở đáy hình — quay theo quãng đường,
 *     vịt chỉ lăn bánh lướt đi (không đạp chân)
 * Camera trực giao nhìn từ trên xuống, nghiêng CONFIG.tilt độ so với mặt sàn
 * (90 = nhìn thẳng từ đỉnh). Chân vịt luôn đặt đúng một điểm trên lưới gallery
 * (toạ độ thế giới của chande-gallery.js) nên kéo lưới thì vịt trôi theo.
 * Vịt tự chọn điểm đến trong màn, lướt tới, nghiêng người khi ôm cua, dừng
 * nghỉ một lúc rồi đi tiếp; bị kéo ra khỏi màn thì tăng tốc quay lại.
 * Chuột lại gần / quẹt qua: vịt bị đẩy nghiêng ra xa rồi lắc lư như lật đật
 * (lò xo tắt dần quanh điểm chạm sàn) và trượt nhẹ khỏi con trỏ.
 * Kéo / vuốt lưới (sàn chạy) cũng tác động: quán tính làm thân vịt trễ lại,
 * ngả ngược hướng sàn tăng tốc, hãm lại thì chúi theo (CONFIG.panTilt) — trên
 * điện thoại đây là cách "chọc" vịt.
 * Vịt luôn ghi vệt đường lăn (CHANDE_DUCK.marks). Sàn cỏ 3D (chande-grass.js)
 * dùng vệt đó để rẽ lá cỏ; sàn cỏ pixel (data-floor="grass-pixel") thì file này
 * tự vẽ vệt: giữa rạp sáng, hai mép cỏ dồn tối + ngọn bật ra, dựng lại dần sau
 * CONFIG.trail.life giây — trên canvas độ phân giải ô cỏ, nằm DƯỚI các ảnh.
 * Giọt bong bóng (chande-bubble.js) bỏ chuột, đi theo thân vịt khi đang ở
 * trang này (CHANDE_BUBBLE.lead); rời trang thì trả giọt về cho chuột.
 * Module — nạp three từ assets/vendor/three. Mount / gỡ theo Barba.
 * ========================================================================== */
import * as THREE from '../vendor/three/three.module.min.js'

const CONFIG = {
  height: 230, // px — chiều cao vịt trên màn
  tilt: 58, // độ — góc camera so với mặt sàn (90 = top-down tuyệt đối)
  speed: 150, // px/s — tốc độ lướt
  sprint: 2.4, // × tốc độ khi đang ở ngoài màn
  turn: 1.8, // rad/s — tốc độ quay đầu tối đa
  lean: 0.38, // rad — nghiêng người tối đa khi ôm cua
  rest: [0.5, 1.4], // s — nghỉ giữa hai chặng
  shadow: 0.16, // độ đậm bóng trên sàn
  shadowGrass: 0.32, // độ đậm bóng khi sàn là thảm cỏ (data-floor="grass-…")
  // Vệt rẽ cỏ (chỉ khi sàn cỏ)
  trail: {
    life: 7, // s — cỏ dựng lại hết sau bấy nhiêu
    width: 0.13, // bề ngang vệt = width × chiều cao vịt (px)
    step: 5, // px — khoảng cách giữa hai điểm ghi vệt
    cell: 4, // px — cỡ ô pixel, khớp GRASS.px của chande-gallery.js
    pressed: 'brightness(1.28) saturate(0.8)', // lòng vệt: hoa văn cỏ sáng + nhạt (rạp)
    edge: 'brightness(0.58)', // mép: hoa văn cỏ tối (cỏ dồn)
    streak: '#8fca6c', // lá cỏ nằm dẹp xuôi theo hướng lăn
    tip: '#7cc85a', // ngọn cỏ bật ra ở mép
  },
  // Va chạm với chuột
  reach: 0.75, // bán kính ảnh hưởng = reach × chiều cao vịt (px màn)
  push: 9, // lực đẩy khi chuột đứng gần (rad/s² ở sát tâm)
  hit: 0.012, // lực theo vận tốc chuột lao vào vịt
  spring: 70, // độ cứng lò xo kéo vịt đứng thẳng lại
  damping: 4.5, // giảm chấn — nhỏ thì lắc lâu
  maxTip: 0.6, // rad — nghiêng tối đa
  slide: 0.5, // vịt trượt ra xa bao nhiêu theo lực đẩy (px/s mỗi rad/s²)
  panTilt: 0.0022, // kéo lưới -> nghiêng theo quán tính (rad/s² mỗi px/s² gia tốc sàn)
  // Giọt bong bóng đi theo (chande-bubble.js): bay sau lưng vịt, lệch một bên
  bubble: {
    gap: 0.75, // khoảng cách sau lưng (× chiều cao vịt)
    side: 0.35, // lệch sang bên (× chiều cao vịt)
    lift: 0.6, // cao hơn điểm chạm sàn (× chiều cao vịt)
    bob: 10, // nhấp nhô (px)
  },
}
// Giá trị đã Lưu ở bảng setting (assets/js/chande-settings.js) đè lên mặc định trên.
window.CHANDE_SETTINGS_APPLY?.('duck', CONFIG)
const DEFAULTS = structuredClone(CONFIG)

/* Dữ liệu pixel: bảng màu + từng hàng (ký tự a.. = chỉ số màu, cách = trống).
   Sinh từ ảnh gốc bằng script (lưới 16.2px, gom 10 màu). */
const DUCK = {
  pal: ["#1c1a1a", "#818416", "#71706f", "#898987", "#7d7d7c", "#989794", "#c6bfb6", "#efee85", "#e5e5e3", "#f5f5f4"],
  rows: [
    "                                   ggffffgg",
    "                                ghejdjdjdjdjg",
    "                              gdedddjdjdjdjdeef",
    "                             jeeejjjjjjjjjjjeeedi",
    "                         ijffdeeedjjjhjjjdjd eedd",
    "                         jeedjeedjjjjjjjjjdjdedjdf",
    "                        jeeaeeedjdjdjdjejdjdjdjejdg",
    "                        ecejdjjjjjjjeieeejjjdjdjdjf",
    "                       gcaedjdjjjdjdeaedehjdjdjdjdjg",
    "                        aedjejjjjjdjeeejej jhjdjejdj",
    "                       aadjeedjdjdjeedeeejjdjdjeedjdfi  gfjg",
    "                      geajeedjjjejeeejeeejjjjjeedhejjjdjdjjh",
    "                       aededjeejceeeedededjddddeiaedjdjdjdeg",
    "                       jejdjecejacecejejejjjjjjceedjjjjjjjd",
    "                       fcehecaedaacaeeeeeejdjjjaedjdjdjdjeg",
    "                      idaeeeaeejecaeaeeeeeejjjejdjjjjjejef",
    "                      gaeeedeaeddaaaeacaeaeeeeedjdjdjeedeadg",
    "                       jeceiejeiicaeeeaeeeeeeeejehejeedjjjdj",
    "                      g cacaeeeaaaededededededededeeeefedfg",
    "                        aiacbceeaeejdjejdjdjdjeheieeeee",
    "                         acaeaebededjeedjejdjeebcaeee",
    "    fjdjg               geaeeebeaiejeeeieeeieeeeaee",
    "   fedjdeg gg            cbaeeeaaacacacacecaeacaa",
    "  gjdjejdjeedi g          cffeeieeacacacacacecaaa",
    "  ddjdedjdedjfee            iabaeeeaaaaaaaeaeaaa   a",
    " idjjjdjjjdjejdeeedjeeg ggfg cbeeeeieeacaededeaca  ea",
    " gjdjdjdjdjdddjeeeeeeeeeeaaaaabaeeeaeeeaedjdjeeaea  ac",
    "  jjjjdjeicjjjceaeeeeeeedeaeacaeecacace ahjjdebcacaaac",
    " djdjdiecaaeieabededededjdebeaeeeaeadaedjdjhjdeaeaaaaae",
    " edjejacaaacacbjejejejejejdjejeedebejjdjdjejjjdeeeacabaef",
    " djdeeeaaaeaaaedeeeeedededhdddeejdjdcdjdjdedddjdedeaaaeeeg",
    " jjjehdeejejhjdjdeeedjdjhjjjjjdeejjjaijjdj jjjdjejeeeeeeaj",
    " fededjeceejjdjdjdddjdjdjdjjjdjdedideaidjdedidieededeaede",
    "ijdjdjecaeeijjjjjjjjjjdjjjjjjjjjdiejejdjjjdieheedjdjeeeiee",
    " djejdeaeddaejjdjjjdjjjdjeeeeeedjaeeceicidjdededjjjdedeeed",
    " geedjecejjjdddjjjjjjjjjeeeeeeejjeecacaaaijjejejjjjjdjeceje",
    " gedijcaeeedjjjjjjjjjjjdeeededejjeeaeaeaeajdedcdjhjdjecaeeeg",
    "  ehacaceceijjjjjjjjjjjieeeieiejjceceeececeidiajjidiecaceee",
    "  faaabacaeaeejdjjjdjdjeeeeeeeeejaeaeeeaeaeaidedidiebaeaedef",
    "  ifacacaceceeejejdjeiececeeeceeeceeeeeceieceiejeiecacecejee",
    "  deeaaacaeaeeededjeeacacaeeeaedcaeeeecaeaeaeaeeeecaaaeaede",
    "  feeiecacececejejeceeaeaebedjdiacececacecececeeecacaeejeje",
    "  gdeaeaaaeaeaeeedeaededededidiaeaeaeaeaeacabadeeaeaadedeee",
    "   geceeaceeeeeeejejdjdidiejeieebeeeeceedcacbieeeeecbieieec",
    "    gaeeeaceededededjejdjeedededededeaediaaaeeededeaeeeded",
    "     eeceeacejejejdjdedjdedjdjdjejdjccbjeeaeecejdjdjeeeje",
    "      eaedeaedededjdjdjdjdjdhdjdedjeaaedeeebeaedjdjdeded",
    "        eicdeieidieidieidieieieieieceieideeeeieifieieidj",
    "         eagfdedidedidedidedeeeeeecaeeedhdedededideddfg",
    "          f   gjejeiejdiejdieeecbeaceceiejdieieie e i",
    "          i    g fddedhdcdjaee abeeacaeeedhdeeee",
    "                    gjdjajececeeeeecaceedheg",
    "                       gcdeaea     aeaeeg",
    "                        ajece      cececig",
    "                        ajcae      acaea",
    "                        aiacd      eaedd",
    "                        edaai      eebic",
    "                        eiaee      cecdf",
    "                       gedadc      aeaid",
    "                       gdiaic      eeceg",
    "                       fhead       eeaeg",
    "                       fdcaj      fc cdi",
    "                     i ciaefgiigiifabaeii",
    "                    i  edceiggigiideacegffi",
    "                   gia  jaddfaefdceeeacajag",
    "                    eeacjjhieceieeececacieg",
    "                     eeajdjdeaedeeeacaaaedfg",
    "                    geeefiehecejececacaeejeg",
    "                     eeejfedeacjeacaeaaeejef",
    "                     ebehieiecaiecacccaceieg",
    "                     bedjdeeeaeecaeaaaaaedea",
    "                     cejjjecbceeaeecacaceide",
    "                     aefjfeaaacfjfeaaaeaeeiec",
    "                     cbijiehaeaijiecaccceceeac",
    "                    eaefidedeeeaideacaaacaceeae",
    "                    eedieieiececaieeacacacaeeidf  gi",
    "                   gedjdddedeaeaeeddeaeaeaceedjdec",
    "                    egiihieheefeeciififieeaceiiifefi   g",
    "                   gcaffefeeefjffaeeifjfefeabeeeififeeg",
    "                   gaeiieideeijjjifeeiiififidceefidifec",
    "                   gededefidefijjfjdeaeeieifjaeeiaefjdag",
    "                    fhdididididiiijieiececeijeeebedijif",
    "                    gdidififififefifeaeabaffieeeieieidj",
    "                     gdheifieieididieieeeiiidceeeeeebg",
    "                      gaefifeeddgcffdddddddffaeeeeefiig",
    "                  g ffdeeieieeeiffegggggggffccecececffaidgg",
    "               g djdedebeaceeeeaeacacdgffaeacaeacaeaaaeccdff",
    "             ijifiiidieifiaefceifcacacfeecec cecacecacccagjdg",
    "            gdifififhfefieefiaefiaaaeaifeacaeacaeaeaeaaaeaiff",
    "           ficeieieifififefififieieieeeieeaeeeacecdeeeaeeceia",
    "          iaeaffeeeeieidifififjfefeeefdfedceeecaecfeeeeecaefd",
    "          gjdijiddcebcc eieifihiciccficgeiacc aeeffedeccacfif",
    "           gjfjfjfgfda affec cefaaaaieg feeaaaefdgififaaeaif",
    "                g  hhifiiidi idieefief  geeieeeif  gdifhfidj",
    "                   gfdiddfg   gfddidfg   fddeddc    gfidjdf",
    "                      fgg       gggi      igdgg       fgg",
  ],
}

const HEAD_END = 51 // hàng cuối của đầu (dưới là ống chân + patin)
const FRAME_TOP = 86 // từ hàng này: khung gắn bánh (mỏng)
const WHEEL_TOP = 93 // từ hàng này trở xuống là 4 bướu bánh xe -> thay bằng bánh tròn
const WHEELS = [23, 33.5, 44, 55] // cột tâm 4 bánh
const WHEEL_R = 4.6 // bán kính bánh (ô)
const WHEEL_ROW = 91 // hàng tâm bánh (đáy bánh chạm sàn ≈ hàng 95)

/* ---------------------------------------------------------- dựng voxel -- */
function buildRegion(pick, { a, max, z0 }) {
  const R = DUCK.rows.length
  const C = Math.max(...DUCK.rows.map((r) => r.length))
  const at = (r, c) => (r >= 0 && r < R && c >= 0 && c < C && pick(r, c) ? DUCK.rows[r][c] || ' ' : ' ')
  const inM = (r, c) => at(r, c) !== ' '
  // Khoảng cách tới mép (BFS 8 hướng từ các ô trống).
  const dist = Array.from({ length: R }, () => new Array(C).fill(0))
  const q = []
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++)
      if (inM(r, c)) {
        let edge = false
        for (let dr = -1; dr <= 1 && !edge; dr++) for (let dc = -1; dc <= 1; dc++) if (!inM(r + dr, c + dc)) edge = true
        if (edge) {
          dist[r][c] = 1
          q.push([r, c])
        }
      }
  for (let i = 0; i < q.length; i++) {
    const [r, c] = q[i]
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr
        const cc = c + dc
        if (!inM(rr, cc) || dist[rr][cc]) continue
        dist[rr][cc] = dist[r][c] + 1
        q.push([rr, cc])
      }
  }
  const half = (r, c) => (inM(r, c) ? Math.max(1, Math.round(Math.min(max, a * Math.sqrt(dist[r][c])))) : 0)
  const H = dist.map((row, r) => row.map((_, c) => half(r, c)))
  const filled = (r, c, z) => r >= 0 && r < R && c >= 0 && c < C && H[r][c] && z >= z0 - H[r][c] && z < z0 + H[r][c]
  // Màu hông: trung bình 5×5 quanh ô (chấm dither kéo dài thành sọc nhìn rất
  // nhiễu). Mặt trước / sau vẫn giữ đúng màu pixel gốc.
  const rgb = (r, c) => {
    const n = parseInt(DUCK.pal[at(r, c).charCodeAt(0) - 97].slice(1), 16)
    return [n >> 16, (n >> 8) & 255, n & 255]
  }
  const soft = (r, c) => {
    const s = [0, 0, 0]
    let k = 0
    for (let dr = -2; dr <= 2; dr++)
      for (let dc = -2; dc <= 2; dc++) {
        if (!inM(r + dr, c + dc)) continue
        const v = rgb(r + dr, c + dc)
        s[0] += v[0]
        s[1] += v[1]
        s[2] += v[2]
        k++
      }
    return '#' + s.map((v) => Math.round(v / k).toString(16).padStart(2, '0')).join('')
  }
  const out = []
  for (let r = 0; r < R; r++)
    for (let c = 0; c < C; c++) {
      const h = H[r][c]
      if (!h) continue
      const face = DUCK.pal[at(r, c).charCodeAt(0) - 97]
      const side = soft(r, c)
      for (let z = z0 - h; z < z0 + h; z++) {
        const col = z === z0 - h || z === z0 + h - 1 ? face : side
        // Bỏ voxel nằm kín bên trong — không bao giờ thấy.
        if (filled(r - 1, c, z) && filled(r + 1, c, z) && filled(r, c - 1, z) && filled(r, c + 1, z) && filled(r, c, z - 1) && filled(r, c, z + 1)) continue
        out.push(c, r, z, col)
      }
    }
  return out
}

function makeMesh(vox, cx, rowsN, pivot) {
  const n = vox.length / 4
  const geo = new THREE.BoxGeometry(1, 1, 1)
  const mat = new THREE.MeshLambertMaterial()
  const mesh = new THREE.InstancedMesh(geo, mat, n)
  mesh.castShadow = true
  const m = new THREE.Matrix4()
  const col = new THREE.Color()
  for (let i = 0; i < n; i++) {
    const [c, r, z, hex] = vox.slice(i * 4, i * 4 + 4)
    // Toạ độ: x theo cột (mỏ ở -x), y lên trên (đáy bánh xe = 0), z chiều sâu.
    m.makeTranslation(c - cx - pivot.x, rowsN - r - 0.5 - pivot.y, z + 0.5 - pivot.z)
    mesh.setMatrixAt(i, m)
    mesh.setColorAt(i, col.set(hex))
  }
  const g = new THREE.Group()
  g.add(mesh)
  g.position.set(pivot.x, pivot.y, pivot.z)
  return g
}

function buildDuck() {
  const R = DUCK.rows.length
  const C = Math.max(...DUCK.rows.map((r) => r.length))
  const cx = C / 2
  const root = new THREE.Group() // gốc = điểm chạm sàn dưới patin (chỉ vị trí + tỉ lệ)
  const wobble = new THREE.Group() // lắc lư do chuột — trục thế giới, xoay quanh điểm chạm sàn
  const turn = new THREE.Group() // hướng đi + nghiêng khi ôm cua
  const body = new THREE.Group() // phần rung / thở
  root.add(wobble)
  wobble.add(turn)
  turn.add(body)

  const head = buildRegion((r) => r <= HEAD_END, { a: 3.2, max: 15, z0: 0 })
  // Ống chân + giày patin, rồi khung bánh mỏng hơn bánh để bánh lộ ra hai bên.
  const boot = buildRegion((r) => r > HEAD_END && r < FRAME_TOP, { a: 1.6, max: 5, z0: 0 })
  const frame = buildRegion((r) => r >= FRAME_TOP && r < WHEEL_TOP, { a: 1, max: 2, z0: 0 })
  body.add(makeMesh(head.concat(boot, frame), cx, R, new THREE.Vector3(0, 0, 0)))

  // Bánh xe: đĩa voxel trục z, vành tối + moay-ơ sáng có 2 nan để thấy quay.
  const wheels = WHEELS.map((wc) => {
    const vox = []
    const n = Math.ceil(WHEEL_R)
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++) {
        const d = Math.hypot(i, j)
        if (d > WHEEL_R) continue
        const a = Math.atan2(j, i)
        const spoke = Math.abs(Math.sin(2 * a)) < 0.38 && d > 0.8
        const col = d > WHEEL_R - 1.6 ? '#2b2a28' : spoke ? '#6f6e6b' : '#ecebe4'
        for (let z = -3; z < 3; z++) vox.push(i, j, z, col)
      }
    const center = new THREE.Vector3(wc - cx, R - WHEEL_ROW - 0.5, 0)
    // (i, j) quanh tâm -> (cột, hàng) để makeMesh đặt đúng chỗ, xoay quanh tâm.
    const asGrid = vox.map((v, k) => (k % 4 === 0 ? v + cx + center.x : k % 4 === 1 ? R - 0.5 - center.y - v : v))
    const g = makeMesh(asGrid, cx, R, center)
    body.add(g)
    return g
  })

  return { root, wobble, turn, body, wheels, rows: R }
}

/* ------------------------------------------------------------ sân khấu -- */
let D = null

function mount(root = document) {
  const scope = root.querySelector ? root : document
  const stage = scope.querySelector('[data-gallery]')
  if (!stage) return
  destroy()

  const canvas = document.createElement('canvas')
  canvas.className = 'gal__duck'
  stage.appendChild(canvas)


  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  renderer.setPixelRatio(Math.min(2, devicePixelRatio))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -4000, 4000)
  const tilt = (CONFIG.tilt * Math.PI) / 180
  // Nhìn xuống từ phía +z: điểm sàn (X, 0, Z) hiện ở màn (X, Z·sin tilt).
  cam.position.set(0, Math.sin(tilt) * 1000, Math.cos(tilt) * 1000)
  cam.up.set(0, 1, 0)
  cam.lookAt(0, 0, 0)

  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9686, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.9)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  const sc = sun.shadow.camera
  sc.left = sc.bottom = -CONFIG.height
  sc.right = sc.top = CONFIG.height
  sc.near = 1
  sc.far = 3000
  sun.shadow.radius = 4
  scene.add(sun, sun.target)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: CONFIG.shadow }))
  floor.rotation.x = -Math.PI / 2
  floor.receiveShadow = true
  scene.add(floor)

  const duck = buildDuck()
  scene.add(duck.root)

  D = {
    stage,
    canvas,
    renderer,
    scene,
    cam,
    sun,
    floor,
    duck,
    tilt,
    vw: 0,
    vh: 0,
    // Trạng thái chuyển động — toạ độ thế giới gallery (px).
    x: 0,
    y: 0,
    head: 0, // hướng đi trên màn (rad, 0 = sang phải)
    v: 0,
    yawRate: 0,
    roll: 0,
    // Lò xo lắc lư (rad, rad/s) + con trỏ (toạ độ màn, px/s).
    wx: 0,
    wz: 0,
    vx: 0,
    vz: 0,
    ptr: null,
    target: null,
    restUntil: 0,
    raf: 0,
    last: performance.now(),
    started: false,
    off: [],
    trail: null, // canvas vệt cỏ pixel (chỉ preset grass-pixel)
    tctx: null,
    pat: null, // {pressed, edge} — hoa văn cỏ cùng tông, dựng khi ảnh nền nạp xong
    marks: [], // điểm vệt: {x, y, dx, dy, t, i}
    markN: 0,
  }

  const onPtr = (e) => {
    const r = D.stage.getBoundingClientRect()
    const x = e.clientX - r.left
    const y = e.clientY - r.top
    const p = D.ptr
    const dt = p ? Math.max(1, e.timeStamp - p.t) / 1000 : 1
    const k = 0.5
    D.ptr = {
      x,
      y,
      t: e.timeStamp,
      vx: p ? p.vx * (1 - k) + ((x - p.x) / dt) * k : 0,
      vy: p ? p.vy * (1 - k) + ((y - p.y) / dt) * k : 0,
    }
  }
  const onLeave = () => (D.ptr = null)
  addEventListener('pointermove', onPtr, { passive: true })
  document.addEventListener('pointerleave', onLeave)
  D.off.push(() => {
    removeEventListener('pointermove', onPtr)
    document.removeEventListener('pointerleave', onLeave)
  })
  applyFloor()
  document.addEventListener('chande-floor', applyFloor)
  D.off.push(() => document.removeEventListener('chande-floor', applyFloor))
  const onResize = () => resize()
  addEventListener('resize', onResize)
  D.off.push(() => removeEventListener('resize', onResize))
  resize()

  // Vào sân sau khi lưới đã bật lên: lướt từ mép trái vào.
  const start = () => {
    if (!D || D.started) return
    const view = galleryView()
    if (!view) return
    D.started = true
    D.x = -view.x - CONFIG.height
    D.y = -view.y + D.vh * 0.62
    D.head = 0
    D.v = CONFIG.speed
    D.target = pickTarget(view)
  }
  D.startTimer = setTimeout(start, 1800)
  const kick = () => setTimeout(start, 1400)
  document.addEventListener('chande-transition:done', kick, { once: true })
  D.off.push(() => document.removeEventListener('chande-transition:done', kick))

  D.raf = requestAnimationFrame(tick)

  // Giọt bong bóng đi theo vịt (giữa thân, trên điểm chạm sàn) — vịt chưa vào
  // sân hoặc đang ngoài màn thì giọt tan.
  window.CHANDE_BUBBLE?.lead?.(() => {
    const view = galleryView()
    if (!D || !D.started || !view) return null
    const r = D.stage.getBoundingClientRect()
    const h = D.duck.rows * D.duck.root.scale.x
    const B = CONFIG.bubble
    const t = performance.now() / 1000
    // Sau lưng theo hướng đi (trên màn), lệch sang một bên, nhấp nhô chậm.
    const bx = -Math.cos(D.head)
    const by = -Math.sin(D.head)
    const x = r.left + D.x + view.x + bx * h * B.gap - by * h * B.side + Math.sin(t * 0.9) * B.bob * 0.6
    const y =
      r.top + D.y + view.y + by * h * B.gap * Math.sin(D.tilt) + bx * h * B.side * Math.sin(D.tilt) -
      h * B.lift * Math.cos(D.tilt) + Math.sin(t * 1.7) * B.bob
    if (x < -h * 2 || y < -h * 2 || x > innerWidth + h * 2 || y > innerHeight + h * 2) return null
    return { x, y }
  })
}

function destroy() {
  if (!D) return
  window.CHANDE_BUBBLE?.lead?.(null)
  cancelAnimationFrame(D.raf)
  clearTimeout(D.startTimer)
  D.off.forEach((f) => f())
  D.scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose()
    if (o.material) o.material.dispose()
  })
  D.renderer.dispose()
  D.canvas.remove()
  D.trail?.remove()
  D = null
}

function resize() {
  const r = D.stage.getBoundingClientRect()
  D.vw = r.width
  D.vh = r.height
  D.renderer.setSize(D.vw, D.vh, false)
  D.canvas.style.width = D.vw + 'px'
  D.canvas.style.height = D.vh + 'px'
  const { cam } = D
  cam.left = -D.vw / 2
  cam.right = D.vw / 2
  cam.top = D.vh / 2
  cam.bottom = -D.vh / 2
  cam.updateProjectionMatrix()
  // Màn hẹp (điện thoại / tablet) thì vịt nhỏ lại: không quá 30% bề ngang màn
  // và không quá 1.6 lần cạnh ô ảnh của gallery.
  const tile = D.stage.querySelector('.gal__probe')?.offsetWidth || 160
  D.duck.root.scale.setScalar(Math.min(CONFIG.height, D.vw * 0.3, tile * 1.6) / D.duck.rows)
}

const galleryView = () => window.CHANDE_GALLERY?.view?.() || null

function pickTarget(view) {
  const m = CONFIG.height * 0.6
  return {
    x: -view.x + m + Math.random() * Math.max(1, D.vw - 2 * m),
    y: -view.y + m * 1.2 + Math.random() * Math.max(1, D.vh - 2 * m),
  }
}

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a))

/* ------------------------------------------------------------ mỗi frame -- */
function tick(now) {
  if (!D) return
  const dt = Math.min(0.05, (now - D.last) / 1000)
  D.last = now
  D.raf = requestAnimationFrame(tick)
  const view = galleryView()
  if (!view || !D.started) return void D.renderer.render(D.scene, D.cam)

  // Toạ độ màn của vịt.
  const sx = D.x + view.x
  const sy = D.y + view.y
  const pad = CONFIG.height
  const offscreen = sx < -pad || sx > D.vw + pad || sy < -pad || sy > D.vh + pad
  const tgtOff = D.target && (D.target.x + view.x < 0 || D.target.x + view.x > D.vw || D.target.y + view.y < 0 || D.target.y + view.y > D.vh)
  if (offscreen && tgtOff) D.target = pickTarget(view)

  // Lái: quay dần về hướng điểm đến, chậm lại khi gần tới.
  let want = 0
  let turn = 0
  if (D.target) {
    const dx = D.target.x - D.x
    const dy = D.target.y - D.y
    const dist = Math.hypot(dx, dy)
    const diff = wrapPi(Math.atan2(dy, dx) - D.head)
    turn = Math.max(-CONFIG.turn, Math.min(CONFIG.turn, diff * 3))
    want = CONFIG.speed * (offscreen ? CONFIG.sprint : 1) * Math.min(1, dist / 160) * (1 - Math.min(0.6, Math.abs(diff) / 3))
    if (dist < 24) {
      D.target = null
      D.restUntil = now + 1000 * (CONFIG.rest[0] + Math.random() * (CONFIG.rest[1] - CONFIG.rest[0]))
    }
  } else if (now > D.restUntil) D.target = pickTarget(view)

  D.yawRate += (turn - D.yawRate) * Math.min(1, dt * 6)
  D.head = wrapPi(D.head + D.yawRate * dt * Math.min(1, D.v / 60 + 0.2))
  D.v += (want - D.v) * Math.min(1, dt * (want > D.v ? 1.6 : 2.4))
  D.x += Math.cos(D.head) * D.v * dt
  D.y += Math.sin(D.head) * D.v * dt
  shove(dt, view, now)
  // Góc quay bánh = quãng đường / bán kính bánh (đổi px màn -> ô voxel).
  D.roll += (D.v * dt) / (WHEEL_R * D.duck.root.scale.x)

  mark(now)
  if (D.trail) drawTrail(now, view)
  pose(now, view)
  D.renderer.render(D.scene, D.cam)
}

// Chuột gần vịt -> đẩy lò xo nghiêng ra xa con trỏ; lò xo tắt dần kéo về thẳng.
function shove(dt, view, now) {
  let fx = 0
  let fz = 0
  const p = D.ptr
  if (p) {
    // Chuột ngừng di thì vận tốc tắt dần (vẫn còn lực đẩy do đứng gần).
    const fade = Math.exp(-dt * 8)
    p.vx *= fade
    p.vy *= fade
    const h = D.duck.rows * D.duck.root.scale.x // chiều cao vịt (đơn vị 3D = px)
    // Tâm thân vịt trên màn: trên điểm chạm sàn một nửa chiều cao (đã co theo góc nhìn).
    const cx = D.x + view.x
    const cy = D.y + view.y - h * 0.5 * Math.cos(D.tilt)
    const dx = cx - p.x
    const dy = cy - p.y
    const d = Math.hypot(dx, dy)
    const reach = h * CONFIG.reach
    if (d < reach && d > 0.001) {
      const ux = dx / d
      const uy = dy / d
      const near = 1 - d / reach
      // Đứng gần thì đẩy đều, lao vào nhanh thì đẩy mạnh theo vận tốc.
      const rush = Math.max(0, p.vx * ux + p.vy * uy)
      const f = CONFIG.push * near * near + CONFIG.hit * rush * near
      fx = ux * f
      fz = (uy / Math.sin(D.tilt)) * f // trục dọc màn -> chiều sâu trên sàn
      // Đang nghỉ mà bị đẩy mạnh -> giật mình lăn đi ngay, hướng ra xa con trỏ.
      if (!D.target && f > CONFIG.push * 0.3) D.target = { x: D.x + ux * h * 1.6, y: D.y + uy * h * 1.6 }
    }
  }
  // Quán tính khi sàn (lưới) bị kéo: gia tốc sàn = đạo hàm vận tốc lưới đã làm
  // mượt; thân vịt ngả NGƯỢC hướng gia tốc (sàn giật sang phải -> ngả trái).
  let ix = 0
  let iz = 0
  if (CONFIG.panTilt && dt > 0) {
    const P = D.pan || (D.pan = { x: view.x, y: view.y, vx: 0, vy: 0 })
    const k2 = 1 - Math.exp(-dt * 14)
    const vx = P.vx + ((view.x - P.x) / dt - P.vx) * k2
    const vy = P.vy + ((view.y - P.y) / dt - P.vy) * k2
    const cap = 40000
    const ax = Math.max(-cap, Math.min(cap, (vx - P.vx) / dt))
    const ay = Math.max(-cap, Math.min(cap, (vy - P.vy) / dt))
    P.x = view.x
    P.y = view.y
    P.vx = vx
    P.vy = vy
    ix = -ax * CONFIG.panTilt
    iz = (-ay / Math.sin(D.tilt)) * CONFIG.panTilt
  }
  const k = CONFIG.spring
  const c = CONFIG.damping
  D.vx += (fz * 6 + iz - k * D.wx - c * D.vx) * dt
  D.vz += (fx * 6 + ix - k * D.wz - c * D.vz) * dt
  D.wx += D.vx * dt
  D.wz += D.vz * dt
  const m = CONFIG.maxTip
  if (Math.abs(D.wx) > m) (D.wx = Math.sign(D.wx) * m), (D.vx *= -0.3)
  if (Math.abs(D.wz) > m) (D.wz = Math.sign(D.wz) * m), (D.vz *= -0.3)
  // Bị đẩy thì trượt nhẹ ra xa con trỏ.
  D.x += fx * CONFIG.slide * 60 * dt
  D.y += fz * Math.sin(D.tilt) * CONFIG.slide * 60 * dt
}

/* ----------------------------------------------------------- vệt rẽ cỏ -- */
// Theo preset sàn: bóng đậm hơn trên cỏ; preset pixel thì dựng canvas vệt.
function applyFloor() {
  if (!D) return
  const floor = D.stage.dataset.floor || ''
  D.floor.material.opacity = floor.startsWith('grass') ? CONFIG.shadowGrass : CONFIG.shadow
  const pixel = floor === 'grass-pixel'
  if (pixel && !D.trail) {
    // Canvas vệt cỏ: độ phân giải = ô cỏ, phóng pixelated, nằm dưới lưới ảnh.
    D.trail = document.createElement('canvas')
    D.trail.className = 'gal__trail'
    D.stage.insertBefore(D.trail, D.stage.querySelector('[data-gallery-world]') || D.stage.firstChild)
    D.tctx = D.trail.getContext('2d')
    D.pat = null
    loadGrassPatterns(D.stage)
  } else if (!pixel && D.trail) {
    D.trail.remove()
    D.trail = D.tctx = D.pat = null
  }
}

// Lấy đúng ô cỏ nền (data URL do chande-gallery.js vẽ), thu về 1 px = 1 ô cỏ,
// rồi làm hai bản lọc màu: sáng nhạt cho lòng vệt, tối cho mép.
function loadGrassPatterns(stage) {
  const url = getComputedStyle(stage).backgroundImage.match(/url\("?(.*?)"?\)/)?.[1]
  if (!url) return
  const img = new Image()
  img.onload = () => {
    if (!D || D.stage !== stage) return
    const N = Math.round(img.width / CONFIG.trail.cell)
    const make = (filter) => {
      const c = document.createElement('canvas')
      c.width = c.height = N
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = false
      g.filter = filter
      g.drawImage(img, 0, 0, N, N)
      return D.tctx.createPattern(c, 'repeat')
    }
    D.pat = { pressed: make(CONFIG.trail.pressed), edge: make(CONFIG.trail.edge), N }
  }
  img.src = url
}

function mark(now) {
  const T = CONFIG.trail
  const life = T.life * 1000
  while (D.marks.length && now - D.marks[0].t > life) D.marks.shift()
  const last = D.marks[D.marks.length - 1]
  const d = last ? Math.hypot(D.x - last.x, D.y - last.y) : Infinity
  if (d < T.step) return
  // Chỉ ghi khi vịt thật sự lăn (không ghi lúc đứng yên / mới vào sân).
  if (D.v < 8 && last) return
  const dx = last && d < 60 ? (D.x - last.x) / d : Math.cos(D.head)
  const dy = last && d < 60 ? (D.y - last.y) / d : Math.sin(D.head)
  D.marks.push({ x: D.x, y: D.y, dx, dy, t: now, i: D.markN++, gap: !last || d > 60 })
}

function drawTrail(now, view) {
  const T = CONFIG.trail
  const P = T.cell
  // Khớp lưới ô cỏ: nền cỏ đặt ở round(view) nên ô bắt đầu tại mod(round(view), P).
  const bx = Math.round(view.x)
  const by = Math.round(view.y)
  const ox = (((bx % P) + P) % P) - P
  const oy = (((by % P) + P) % P) - P
  const cw = Math.ceil(D.vw / P) + 2
  const ch = Math.ceil(D.vh / P) + 2
  const cv = D.trail
  if (cv.width !== cw || cv.height !== ch) {
    cv.width = cw
    cv.height = ch
    cv.style.width = cw * P + 'px'
    cv.style.height = ch * P + 'px'
  }
  cv.style.transform = `translate(${ox}px, ${oy}px)`
  const g = D.tctx
  g.clearRect(0, 0, cw, ch)
  const m = D.marks
  if (m.length < 2) return
  const life = T.life * 1000
  const w = (D.duck.rows * D.duck.root.scale.x * T.width) / P // bề ngang vệt (ô)
  const toC = (pt) => [(pt.x + bx - ox) / P, (pt.y + by - oy) / P]
  const alpha = (pt) => {
    const k = 1 - (now - pt.t) / life
    return k <= 0 ? 0 : k * k * (3 - 2 * k) // cỏ dựng lại nhanh dần về cuối
  }
  g.imageSmoothingEnabled = false
  g.lineCap = 'round'
  // Lượt 1: mép tối (cỏ dồn) — rộng hơn; lượt 2: lòng vệt rạp sáng đè lên.
  if (!D.pat) return
  // Hoa văn bám đúng lưới cỏ nền: gốc ô nền ở màn (bx, by) -> canvas ((bx-ox)/P, …).
  const m0 = new DOMMatrix().translateSelf((bx - ox) / P, (by - oy) / P)
  D.pat.pressed.setTransform(m0)
  D.pat.edge.setTransform(m0)
  ;[
    [w + 2, D.pat.edge, 0.9],
    [w, D.pat.pressed, 1],
  ].forEach(([lw, col, a0]) => {
    g.strokeStyle = col
    g.lineWidth = lw
    for (let i = 1; i < m.length; i++) {
      if (m[i].gap) continue
      const a = alpha(m[i]) * a0
      if (a <= 0.01) continue
      g.globalAlpha = a
      const [x0, y0] = toC(m[i - 1])
      const [x1, y1] = toC(m[i])
      g.beginPath()
      g.moveTo(x0, y0)
      g.lineTo(x1, y1)
      g.stroke()
    }
  })
  // Lá cỏ nằm dẹp: nét ngắn 2–3 ô xuôi theo hướng lăn, rải ngang trong lòng vệt.
  g.fillStyle = T.streak
  for (const pt of m) {
    const a = alpha(pt)
    if (a <= 0.01 || pt.i % 3) continue
    const [x, y] = toC(pt)
    const lat = ((((pt.i * 2654435761) >>> 0) % 1000) / 1000 - 0.5) * (w - 2)
    const len = 2 + (pt.i % 2)
    g.globalAlpha = a * 0.8
    for (let k = 0; k < len; k++)
      g.fillRect(Math.floor(x - pt.dy * lat - pt.dx * k), Math.floor(y + pt.dx * lat - pt.dy * k), 1, 1)
  }
  // Ngọn cỏ bật ra hai bên mép: chấm sáng rải theo nhịp cố định của từng điểm.
  g.fillStyle = T.tip
  for (const pt of m) {
    const a = alpha(pt)
    if (a <= 0.01 || pt.i % 2) continue
    const [x, y] = toC(pt)
    const side = (pt.i * 7919) % 3 === 0 ? -1 : 1
    const off = w / 2 + 1 + ((pt.i * 31) % 2)
    g.globalAlpha = a
    g.fillRect(Math.floor(x - pt.dy * off * side), Math.floor(y + pt.dx * off * side), 1, 1)
  }
  g.globalAlpha = 1
}

function pose(now, view) {
  const { duck, tilt } = D
  const sx = D.x + view.x - D.vw / 2
  const sy = D.y + view.y - D.vh / 2
  // Điểm sàn tương ứng với điểm màn (sx, sy).
  const Z = sy / Math.sin(tilt)
  duck.root.position.set(sx, 0, Z)
  // Hướng đi trên màn -> hướng trên sàn 3D (trục dọc màn bị co sin(tilt)).
  const dX = Math.cos(D.head)
  const dZ = Math.sin(D.head) / Math.sin(tilt)
  duck.turn.rotation.order = 'YXZ'
  duck.turn.rotation.y = Math.atan2(-dZ, dX) // mặt vịt (+x cục bộ) chỉ theo hướng đi

  const moving = Math.min(1, D.v / CONFIG.speed)
  const t = now / 1000
  // Nghiêng vào trong khi ôm cua, ngả người tới khi lướt.
  const bank = Math.max(-CONFIG.lean, Math.min(CONFIG.lean, -D.yawRate * (D.v / CONFIG.speed) * 0.35))
  duck.turn.rotation.x = bank
  duck.turn.rotation.z = -0.1 * moving
  // Lắc do chuột: wx nghiêng về +Z (xuống màn), wz nghiêng về +X (sang phải).
  duck.wobble.rotation.x = D.wx
  duck.wobble.rotation.z = -D.wz
  // Lăn bánh: rung rất nhẹ theo mặt sàn; đứng yên thì thở nhẹ.
  duck.body.position.y = Math.sin(D.roll * 0.9) * 0.25 * moving + Math.sin(t * 2.2) * 0.5 * (1 - moving)
  // Bánh quay đúng quãng đường đã lăn (đi về +x -> quay chiều kim đồng hồ).
  duck.wheels.forEach((g) => (g.rotation.z = -D.roll))

  // Đèn đi theo vịt để bóng luôn rơi đúng chỗ.
  D.sun.target.position.set(sx, 0, Z)
  D.sun.position.set(sx - 260, 900, Z - 520)
}

/* ------------------------------------------------------------ Khởi động */
mount(document)

if (window.barba?.hooks) {
  window.barba.hooks.beforeEnter((data) => mount(data.next.container))
  window.barba.hooks.afterLeave((data) => {
    if (D && data.current.container?.contains(D.stage)) destroy()
  })
}

// Bảng setting đổi thông số: cập nhật góc camera, cỡ vịt, bóng; cỏ 3D dùng chung góc.
function refresh() {
  if (D) {
    D.tilt = (CONFIG.tilt * Math.PI) / 180
    D.cam.position.set(0, Math.sin(D.tilt) * 1000, Math.cos(D.tilt) * 1000)
    D.cam.lookAt(0, 0, 0)
    resize()
    applyFloor()
  }
  window.CHANDE_GRASS?.refresh?.()
}

// Gọi vịt lăn về giữa màn (nút trong bảng setting — tiện ngắm khi chỉnh).
function recall() {
  const view = galleryView()
  if (!D || !view) return
  D.started = true
  D.target = { x: -view.x + D.vw / 2, y: -view.y + D.vh / 2 + CONFIG.height * 0.3 }
  D.restUntil = 0
}

window.CHANDE_DUCK = {
  config: CONFIG,
  defaults: DEFAULTS,
  mount,
  destroy,
  refresh,
  recall,
  get state() {
    return D
  },
  // Vệt đường lăn (toạ độ thế giới gallery) — chande-grass.js dùng để rẽ cỏ.
  get marks() {
    return D?.marks || []
  },
}
