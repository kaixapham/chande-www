/* =============================================================================
 * CHANDE — Trình sửa collage (wall-edit.html) cho section "Kỷ niệm" trang chủ
 * -----------------------------------------------------------------------------
 * Đọc danh sách mảnh trong index.html (<script data-wall-pieces>), vẽ lên khung thu nhỏ
 * đúng tỉ lệ section (1920 × 1556, cùng đơn vị --u với trang thật — chande-wall.js render).
 *   • kéo mảnh = dời · Shift + kéo = xoay quanh tâm · lăn chuột trên mảnh = đổi cỡ
 *   • phím: mũi tên nhích 1 (Shift 10) · Delete xoá · [ ] đưa xuống / lên một lớp
 *   • "+ Thêm ảnh" / thả file vào khung: ảnh giữ nguyên file gốc (PNG / WebP trong suốt);
 *     ảnh quá lớn (> 2400 px) mới thu về 2400 px WebP
 * Lưu: trên máy (node serve.mjs) POST /__cms/save; trên site dùng token GitHub (như CMS).
 * ========================================================================== */
;(() => {
  'use strict'
  const $ = (s, r = document) => r.querySelector(s)
  const W = window.CHANDE_WALL
  const BOARD_W = 1920
  const BOARD_H = 1556
  const board = $('[data-board]')
  const view = $('[data-view]')
  const list = $('[data-list]')
  const clone = (o) => JSON.parse(JSON.stringify(o))

  let pieces = []
  let saved = []
  let sel = -1
  const history = []
  const pending = new Map() // đường dẫn sẽ ghi -> { blob, url } (ảnh mới chưa lưu)
  const shown = (src) => pending.get(src)?.url || src

  const msg = (t, kind = '') => {
    const m = $('[data-msg]')
    m.textContent = t
    m.className = `side__msg${kind ? ` is-${kind}` : ''}`
  }
  const snap = () => {
    history.push(JSON.stringify(pieces))
    if (history.length > 80) history.shift()
  }
  const dirty = () => JSON.stringify(pieces) !== JSON.stringify(saved) || [...pending.keys()].some(used)
  const used = (p) => pieces.some((x) => x.img === p)
  const markDirty = () => ($('[data-save]').textContent = dirty() ? 'Lưu •' : 'Lưu')
  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d

  /* ------------------------------------------------------------------ khung --- */
  let u = 0.5
  function size() {
    // vừa trọn khung (cả bề rộng lẫn bề cao) để thấy hết section
    u = Math.max(0.15, Math.min((view.clientWidth - 40) / BOARD_W, (view.clientHeight - 40) / BOARD_H))
    board.style.setProperty('--u', `${u}px`)
    board.style.width = `${BOARD_W * u}px`
    board.style.height = `${BOARD_H * u}px`
  }
  function draw() {
    W.render(board, pieces, { src: shown, eager: true })
    board.querySelectorAll('.wall__piece').forEach((el) => {
      el.classList.toggle('is-sel', +el.dataset.i === sel)
      if (!el.complete) el.addEventListener('load', placeHandles, { once: true })
    })
    placeHandles()
  }
  const pieceEl = (i) => board.querySelector(`.wall__piece[data-i="${i}"]`)

  // khung tay cầm của mảnh đang chọn: 4 góc = đổi cỡ (giữ tâm), nút tròn trên = xoay
  const hdl = document.createElement('div')
  hdl.className = 'hdl'
  hdl.hidden = true
  hdl.innerHTML = '<i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i><i data-h="rot"></i><b></b>'
  function placeHandles() {
    const el = sel >= 0 && pieceEl(sel)
    if (!el) return void (hdl.hidden = true)
    board.append(hdl)
    hdl.hidden = false
    const p = pieces[sel]
    hdl.style.left = `${p.x * u}px`
    hdl.style.top = `${p.y * u}px`
    hdl.style.width = `${el.offsetWidth}px`
    hdl.style.height = `${el.offsetHeight}px`
    hdl.style.rotate = `${p.rot || 0}deg`
    hdl.querySelector('b').textContent = `${Math.round(p.w)} px · ${round(p.rot || 0)}°`
  }
  hdl.addEventListener('pointerdown', (e) => {
    const h = e.target.dataset.h
    if (!h || sel < 0) return
    e.preventDefault()
    e.stopPropagation()
    snap()
    const i = sel
    const p = pieces[i]
    const el = pieceEl(i)
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const aspect = el.offsetHeight / el.offsetWidth
    const start = { w: p.w, rot: p.rot || 0, d: Math.hypot(e.clientX - cx, e.clientY - cy), a: Math.atan2(e.clientY - cy, e.clientX - cx), mx: p.x + p.w / 2, my: p.y + (p.w * aspect) / 2 }
    e.target.setPointerCapture(e.pointerId)
    const move = (ev) => {
      if (h === 'rot') {
        let deg = start.rot + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - start.a) * 180) / Math.PI
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        p.rot = round(((deg + 540) % 360) - 180)
      } else {
        const k = Math.hypot(ev.clientX - cx, ev.clientY - cy) / Math.max(1, start.d)
        p.w = round(Math.max(20, Math.min(2400, start.w * k)))
        p.x = round(start.mx - p.w / 2) // giữ tâm đứng yên
        p.y = round(start.my - (p.w * aspect) / 2)
      }
      update(i)
    }
    const up = () => {
      e.target.removeEventListener('pointermove', move)
      e.target.removeEventListener('pointerup', up)
    }
    e.target.addEventListener('pointermove', move)
    e.target.addEventListener('pointerup', up)
  })

  /* ----------------------------------------------------------- danh sách --- */
  const field = (k, v, step = 1) => `<label>${k}<input type="number" step="${step}" data-k="${k}" value="${v}"></label>`
  function build() {
    $('[data-count]').textContent = `(${pieces.length})`
    list.innerHTML = pieces
      .map(
        (p, i) => `<div class="piece${i === sel ? ' is-sel' : ''}" data-row="${i}">
        <img src="${shown(p.img)}" alt="">
        <div>
          <div class="piece__top"><b>${String(i + 1).padStart(2, '0')}</b><input data-k="name" value="${(p.name || '').replace(/"/g, '&quot;')}" placeholder="Tên"></div>
          <div class="piece__nums">${field('x', round(p.x))}${field('y', round(p.y))}${field('w', round(p.w))}${field('rot', round(p.rot || 0), 0.5)}</div>
          <div class="piece__acts">
            <button class="btn btn--sm" type="button" data-act="down" title="Xuống một lớp">↓ lớp</button>
            <button class="btn btn--sm" type="button" data-act="up" title="Lên một lớp">↑ lớp</button>
            <button class="btn btn--sm" type="button" data-act="img">Đổi ảnh</button>
            <button class="btn btn--sm" type="button" data-act="del">Xoá</button>
          </div>
        </div>
      </div>`,
      )
      .join('')
    markDirty()
  }
  function select(i, scroll) {
    sel = i
    board.querySelectorAll('.wall__piece').forEach((el) => el.classList.toggle('is-sel', +el.dataset.i === i))
    list.querySelectorAll('.piece').forEach((el) => el.classList.toggle('is-sel', +el.dataset.row === i))
    if (scroll) list.querySelector(`[data-row="${i}"]`)?.scrollIntoView({ block: 'nearest' })
    placeHandles()
  }
  // cập nhật một mảnh không vẽ lại cả bảng (đang kéo)
  function update(i) {
    const el = pieceEl(i)
    if (el) W.place(el, pieces[i])
    const row = list.querySelector(`[data-row="${i}"]`)
    if (row) for (const k of ['x', 'y', 'w', 'rot']) row.querySelector(`[data-k="${k}"]`).value = round(pieces[i][k] || 0)
    if (i === sel) placeHandles()
    markDirty()
  }
  function all() {
    draw()
    build()
    select(sel)
  }

  list.addEventListener('click', (e) => {
    const row = e.target.closest('[data-row]')
    if (!row) return
    const i = +row.dataset.row
    const act = e.target.closest('[data-act]')?.dataset.act
    if (!act) return select(i)
    snap()
    if (act === 'del') {
      pieces.splice(i, 1)
      sel = -1
    } else if (act === 'up' && i < pieces.length - 1) {
      ;[pieces[i], pieces[i + 1]] = [pieces[i + 1], pieces[i]]
      sel = i + 1
    } else if (act === 'down' && i > 0) {
      ;[pieces[i], pieces[i - 1]] = [pieces[i - 1], pieces[i]]
      sel = i - 1
    } else if (act === 'img') {
      history.pop()
      return pickFiles(false, (f) => replaceImage(i, f))
    }
    renum()
    all()
  })
  list.addEventListener('focusin', (e) => {
    const row = e.target.closest('[data-row]')
    if (row) select(+row.dataset.row)
  })
  list.addEventListener('change', (e) => {
    const k = e.target.dataset.k
    const row = e.target.closest('[data-row]')
    if (!k || !row) return
    snap()
    const i = +row.dataset.row
    pieces[i][k] = k === 'name' ? e.target.value : +e.target.value || 0
    if (k === 'name') return markDirty()
    update(i)
  })
  const renum = () => pieces.forEach((p, i) => (p.num = String(i + 1).padStart(2, '0')))

  /* ------------------------------------------------- kéo / xoay / đổi cỡ --- */
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hdl')) return
    const el = e.target.closest('.wall__piece')
    if (!el) return select(-1)
    e.preventDefault()
    const i = +el.dataset.i
    select(i, true)
    snap()
    el.setPointerCapture(e.pointerId)
    el.classList.add('is-drag')
    const p = pieces[i]
    const start = { x: e.clientX, y: e.clientY, px: p.x, py: p.y, rot: p.rot || 0 }
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    const rotate = e.shiftKey
    let moved = false
    const move = (ev) => {
      moved = true
      if (rotate) {
        const a = Math.atan2(ev.clientY - cy, ev.clientX - cx)
        let deg = start.rot + ((a - a0) * 180) / Math.PI
        if (ev.altKey) deg = Math.round(deg / 15) * 15
        p.rot = round(deg)
      } else {
        p.x = round(start.px + (ev.clientX - start.x) / u)
        p.y = round(start.py + (ev.clientY - start.y) / u)
      }
      update(i)
    }
    const up = () => {
      el.classList.remove('is-drag')
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      if (!moved) history.pop()
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
  })
  board.addEventListener(
    'wheel',
    (e) => {
      const el = e.target.closest('.wall__piece')
      if (!el) return
      e.preventDefault()
      const i = +el.dataset.i
      select(i, true)
      const p = pieces[i]
      const k = Math.exp(-e.deltaY * 0.0015)
      const w0 = p.w
      p.w = round(Math.max(20, Math.min(1920, w0 * k)))
      // giữ tâm đứng yên khi đổi cỡ
      const h0 = el.offsetHeight / u
      p.x = round(p.x + (w0 - p.w) / 2)
      p.y = round(p.y + (h0 - (h0 * p.w) / w0) / 2)
      update(i)
    },
    { passive: false },
  )
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') return e.preventDefault(), undo()
    if (sel < 0) return
    const p = pieces[sel]
    const step = e.shiftKey ? 10 : 1
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (nudge) {
      e.preventDefault()
      snap()
      p.x = round(p.x + nudge[0])
      p.y = round(p.y + nudge[1])
      return update(sel)
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      snap()
      pieces.splice(sel, 1)
      sel = -1
      renum()
      return all()
    }
    if (e.key === ']' && sel < pieces.length - 1) {
      snap()
      ;[pieces[sel], pieces[sel + 1]] = [pieces[sel + 1], pieces[sel]]
      sel++
      renum()
      all()
    }
    if (e.key === '[' && sel > 0) {
      snap()
      ;[pieces[sel], pieces[sel - 1]] = [pieces[sel - 1], pieces[sel]]
      sel--
      renum()
      all()
    }
  })
  function undo() {
    const last = history.pop()
    if (!last) return msg('Không còn bước nào để hoàn tác.')
    pieces = JSON.parse(last)
    if (sel >= pieces.length) sel = -1
    all()
  }
  $('[data-undo]').addEventListener('click', undo)

  /* ------------------------------------------------------------------ ảnh --- */
  const MAX = 2400
  async function processImage(file) {
    const bmp = await createImageBitmap(file)
    const big = Math.max(bmp.width, bmp.height) > MAX
    if (!big && /^image\/(png|webp)$/.test(file.type)) return { blob: file, ext: file.type === 'image/png' ? 'png' : 'webp', w: bmp.width }
    const k = Math.min(1, MAX / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k)
    c.height = Math.round(bmp.height * k)
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/webp', 0.9))
    return { blob, ext: 'webp', w: c.width }
  }
  async function stash(file) {
    const img = await processImage(file)
    const path = `assets/img/cms/index/wall-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}.${img.ext}`
    pending.set(path, { blob: img.blob, url: URL.createObjectURL(img.blob) })
    return { path, w: img.w }
  }
  async function addImages(files, at) {
    files = [...files].filter((f) => f.type?.startsWith('image/'))
    if (!files.length) return
    msg('Đang nạp ảnh…')
    snap()
    for (const [n, f] of files.entries()) {
      const { path, w } = await stash(f)
      const pw = Math.min(480, Math.round(w / 2)) // file 2× -> hiện bằng nửa
      const base = at || { x: BOARD_W / 2, y: BOARD_H / 2 }
      pieces.push({ num: '', name: f.name.replace(/\.[^.]+$/, ''), img: path, x: round(base.x - pw / 2 + n * 30), y: round(base.y - pw / 2 + n * 30), w: pw, rot: 0 })
    }
    renum()
    sel = pieces.length - 1
    all()
    msg(`Đã thêm ${files.length} ảnh (chưa lưu).`)
  }
  async function replaceImage(i, file) {
    if (!file?.type?.startsWith('image/')) return
    snap()
    const { path } = await stash(file)
    pieces[i].img = path
    all()
    msg(`Đã đổi ảnh mảnh ${i + 1} (chưa lưu).`)
  }
  function pickFiles(multiple, fn) {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/png,image/webp,image/jpeg,image/svg+xml'
    inp.multiple = multiple
    inp.onchange = () => inp.files.length && (multiple ? fn(inp.files) : fn(inp.files[0]))
    inp.click()
  }
  $('[data-add]').addEventListener('click', () => pickFiles(true, (fs) => addImages(fs)))
  view.addEventListener('dragover', (e) => {
    e.preventDefault()
    view.classList.add('is-drop')
  })
  view.addEventListener('dragleave', () => view.classList.remove('is-drop'))
  view.addEventListener('drop', (e) => {
    e.preventDefault()
    view.classList.remove('is-drop')
    const r = board.getBoundingClientRect()
    addImages(e.dataTransfer.files, { x: (e.clientX - r.left) / u, y: (e.clientY - r.top) / u })
  })

  /* ------------------------------------------------------------------ lưu --- */
  const PIECES_RE = /(<script\b[^>]*data-wall-pieces[^>]*>)([\s\S]*?)(<\/script>)/
  function indexText(html) {
    if (!PIECES_RE.test(html)) throw new Error('Không thấy danh sách mảnh (data-wall-pieces) trong index.html')
    const json = `[\n${pieces.map((p) => `        ${JSON.stringify(p)}`).join(',\n')}\n      ]`
    return html.replace(PIECES_RE, (_, a, __, c) => `${a}\n      ${json}\n      ${c}`)
  }
  async function imageFiles() {
    const out = []
    for (const path of [...pending.keys()].filter(used)) {
      const buf = new Uint8Array(await pending.get(path).blob.arrayBuffer())
      let bin = ''
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      out.push({ path, base64: btoa(bin) })
    }
    return out
  }
  const GH_KEY = 'chande-cms-gh'
  function ghConfig() {
    let cfg = {}
    try {
      cfg = JSON.parse(localStorage.getItem(GH_KEY) || sessionStorage.getItem(GH_KEY) || '{}')
    } catch {}
    return { repo: cfg.repo || 'kaixapham/chande-www', branch: cfg.branch || 'main', token: cfg.token || '' }
  }
  async function save() {
    const btn = $('[data-save]')
    btn.disabled = true
    msg('Đang lưu…')
    try {
      const ping = await fetch('__cms/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      let done
      const imgs = await imageFiles()
      if (ping?.local) {
        const html = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
        const r = await fetch('__cms/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files: [...imgs, { path: 'index.html', text: indexText(html) }] }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        done = `Đã ghi${imgs.length ? ` ${imgs.length} ảnh +` : ''} index.html xuống máy — commit + push để lên live.`
      } else {
        const cfg = ghConfig()
        if (!cfg.token) {
          $('[data-gh]').hidden = false
          $('[data-gh] [name=repo]').value = cfg.repo
          msg('Trên site cần token GitHub để lưu thẳng vào repo — nhập bên dưới.')
          return
        }
        const gh = (path, opts = {}) =>
          fetch(`https://api.github.com/repos/${cfg.repo}${path}`, {
            ...opts,
            headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
          }).then(async (r) => {
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`)
            return j
          })
        const dec = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
        const enc = (text) => {
          const bytes = new TextEncoder().encode(text)
          let s = ''
          for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
          return btoa(s)
        }
        for (const f of imgs) await gh(`/contents/${f.path}`, { method: 'PUT', body: JSON.stringify({ message: `Collage: ảnh ${f.path.split('/').pop()}`, content: f.base64, branch: cfg.branch }) })
        const cur = await gh(`/contents/index.html?ref=${encodeURIComponent(cfg.branch)}`)
        const text = indexText(dec(cur.content))
        const res = await gh('/contents/index.html', { method: 'PUT', body: JSON.stringify({ message: 'Collage: lưu vị trí các mảnh', content: enc(text), sha: cur.sha, branch: cfg.branch }) })
        done = `Đã commit ${res.commit.sha.slice(0, 7)} lên ${cfg.repo} — site cập nhật sau ~1 phút.`
      }
      ;[...pending.keys()].filter(used).forEach((p) => pending.delete(p))
      saved = clone(pieces)
      markDirty()
      msg(done, 'ok')
    } catch (e) {
      msg(String(e.message || e), 'bad')
      if (/GitHub 40[13]/.test(String(e.message))) $('[data-gh]').hidden = false
    } finally {
      btn.disabled = false
    }
  }
  $('[data-save]').addEventListener('click', save)
  $('[data-gh]').addEventListener('submit', (e) => {
    e.preventDefault()
    const f = e.target
    const v = JSON.stringify({ repo: f.repo.value.trim(), branch: 'main', token: f.token.value.trim(), remember: f.remember.checked })
    try {
      sessionStorage.setItem(GH_KEY, v)
      if (f.remember.checked) localStorage.setItem(GH_KEY, v)
    } catch {}
    f.hidden = true
    save()
  })
  addEventListener('beforeunload', (e) => {
    if (dirty()) e.preventDefault()
  })

  /* ------------------------------------------------------------- khởi động --- */
  addEventListener('resize', () => (size(), draw()))
  ;(async () => {
    try {
      const html = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
      const m = html.match(PIECES_RE)
      saved = m ? JSON.parse(m[2]).filter((p) => p && p.img) : []
      pieces = clone(saved)
      size()
      all()
      msg(`${pieces.length} mảnh. Kéo để dời, Shift + kéo để xoay (giữ thêm Alt: bước 15°), lăn chuột trên mảnh để đổi cỡ.`)
    } catch (e) {
      msg(`Không nạp được index.html: ${e.message || e}`, 'bad')
    }
  })()
})()
