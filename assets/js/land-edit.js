/* =============================================================================
 * CHANDE — Trình sửa section "Phong cảnh + sticker" trang chủ (land-edit.html)
 * -----------------------------------------------------------------------------
 * 3 món dán lên ảnh nền (tờ hoá đơn, tem vịt, cụm sticker) — mỗi món là một
 * <div class="hs-land__piece" data-land-key> trong index.html, vị trí / cỡ / góc ghi ở style:
 *   --x --y --w --r      khổ desktop 1920 × 1028 (đơn vị --u)
 *   --mx --my --mw --mr  khổ mobile 375 × 748 (đơn vị --s, khung giữa màn)
 * x, y = góc trên trái ảnh chưa xoay, w = bề rộng (cao theo tỉ lệ ảnh), r = độ xoay quanh tâm.
 *   • kéo món = dời · Shift + kéo = xoay · góc = đổi cỡ (giữ tâm) · nút tròn = xoay (Shift: bước 15°)
 *   • lăn chuột trên món = đổi cỡ · mũi tên nhích 1 (Shift 10) · ⌘Z hoàn tác
 *   • "Đổi ảnh" / thả file lên một món: ảnh nén WebP (giữ trong suốt) rộng 2 × cỡ hiển thị
 * Lưu: trên máy (node serve.mjs) POST /__cms/save; trên site dùng token GitHub (như CMS).
 * ========================================================================== */
;(() => {
  'use strict'
  const $ = (s, r = document) => r.querySelector(s)
  const MODES = {
    desktop: { W: 1920, H: 1028, keys: ['x', 'y', 'w', 'r'] },
    mobile: { W: 375, H: 748, keys: ['mx', 'my', 'mw', 'mr'] },
  }
  const board = $('[data-board]')
  const view = $('[data-view]')
  const list = $('[data-list]')
  const bg = $('[data-bg]')
  const clone = (o) => JSON.parse(JSON.stringify(o))
  const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d

  let mode = 'desktop'
  let bgSrc = { desktop: '', mobile: '' }
  const bgFor = () => (mode === 'mobile' && bgSrc.mobile) || bgSrc.desktop
  let pieces = [] // { key, name, img, x, y, w, r, mx, my, mw, mr }
  let saved = []
  let sel = -1
  const history = []
  const pending = new Map() // đường dẫn ảnh mới -> { blob, url }
  const shown = (src) => pending.get(src)?.url || src
  const aspect = new Map() // ảnh -> cao / rộng

  const msg = (t, kind = '') => {
    const m = $('[data-msg]')
    m.textContent = t
    m.className = `side__msg${kind ? ` is-${kind}` : ''}`
  }
  const snap = () => {
    history.push(JSON.stringify(pieces))
    if (history.length > 80) history.shift()
  }
  const dirty = () => JSON.stringify(pieces) !== JSON.stringify(saved)
  const markDirty = () => ($('[data-save]').textContent = dirty() ? 'Lưu •' : 'Lưu')
  // giá trị của món theo chế độ đang sửa: { x, y, w, r }
  const get = (p) => {
    const [x, y, w, r] = MODES[mode].keys
    return { x: p[x], y: p[y], w: p[w], r: p[r] }
  }
  const set = (p, v) => {
    const k = MODES[mode].keys
    ;['x', 'y', 'w', 'r'].forEach((n, i) => n in v && (p[k[i]] = round(v[n], n === 'r' ? 2 : 1)))
  }

  /* ------------------------------------------------------------------ khung --- */
  let u = 0.5
  function size() {
    const { W, H } = MODES[mode]
    u = Math.max(0.15, Math.min((view.clientWidth - 40) / W, (view.clientHeight - 40) / H))
    board.style.width = `${W * u}px`
    board.style.height = `${H * u}px`
  }
  function place(el, p) {
    const v = get(p)
    el.style.left = `${v.x * u}px`
    el.style.top = `${v.y * u}px`
    el.style.width = `${v.w * u}px`
    el.style.rotate = `${v.r || 0}deg`
  }
  function draw() {
    board.querySelectorAll('.land__piece').forEach((el) => el.remove())
    pieces.forEach((p, i) => {
      const el = document.createElement('img')
      el.className = 'land__piece'
      el.src = shown(p.img)
      el.draggable = false
      el.dataset.i = i
      el.addEventListener('load', () => (aspect.set(p.img, el.naturalHeight / el.naturalWidth), placeHandles()), { once: true })
      place(el, p)
      board.append(el)
    })
    placeHandles()
  }
  const pieceEl = (i) => board.querySelector(`.land__piece[data-i="${i}"]`)

  const hdl = document.createElement('div')
  hdl.className = 'hdl'
  hdl.hidden = true
  hdl.innerHTML = '<i data-h="nw"></i><i data-h="ne"></i><i data-h="sw"></i><i data-h="se"></i><i data-h="rot"></i><b></b>'
  function placeHandles() {
    const el = sel >= 0 && pieceEl(sel)
    if (!el) return void (hdl.hidden = true)
    if (!hdl.isConnected) board.append(hdl)
    hdl.hidden = false
    const v = get(pieces[sel])
    hdl.style.left = `${v.x * u}px`
    hdl.style.top = `${v.y * u}px`
    hdl.style.width = `${el.offsetWidth}px`
    hdl.style.height = `${el.offsetHeight}px`
    hdl.style.rotate = `${v.r || 0}deg`
    hdl.querySelector('b').textContent = `${Math.round(v.w)} · ${round(v.r || 0)}°`
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
    const ar = el.offsetHeight / el.offsetWidth
    const v = get(p)
    const start = { w: v.w, rot: v.r || 0, d: Math.hypot(e.clientX - cx, e.clientY - cy), a: Math.atan2(e.clientY - cy, e.clientX - cx), mx: v.x + v.w / 2, my: v.y + (v.w * ar) / 2 }
    e.target.setPointerCapture(e.pointerId)
    const move = (ev) => {
      if (h === 'rot') {
        let deg = start.rot + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - start.a) * 180) / Math.PI
        if (ev.shiftKey) deg = Math.round(deg / 15) * 15
        set(p, { r: ((deg + 540) % 360) - 180 })
      } else {
        const w = Math.max(20, Math.min(MODES[mode].W * 2, (start.w * Math.hypot(ev.clientX - cx, ev.clientY - cy)) / Math.max(1, start.d)))
        set(p, { w, x: start.mx - w / 2, y: start.my - (w * ar) / 2 }) // giữ tâm đứng yên
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
    list.innerHTML = pieces
      .map((p, i) => {
        const v = get(p)
        return `<div class="piece${i === sel ? ' is-sel' : ''}" data-row="${i}">
        <img src="${shown(p.img)}" alt="">
        <div>
          <div class="piece__top"><b>${String(i + 1).padStart(2, '0')}</b><span>${p.name}</span></div>
          <div class="piece__nums">${field('x', round(v.x))}${field('y', round(v.y))}${field('w', round(v.w))}${field('r', round(v.r || 0, 2), 0.5)}</div>
          <div class="piece__acts">
            <button class="btn btn--sm" type="button" data-act="img">Đổi ảnh</button>
            <button class="btn btn--sm" type="button" data-act="copy" title="Chép vị trí / cỡ / góc từ chế độ kia (quy đổi theo khổ)">Chép từ ${mode === 'desktop' ? 'mobile' : 'desktop'}</button>
          </div>
        </div>
      </div>`
      })
      .join('')
    markDirty()
  }
  function select(i, scroll) {
    sel = i
    list.querySelectorAll('.piece').forEach((el) => el.classList.toggle('is-sel', +el.dataset.row === i))
    if (scroll) list.querySelector(`[data-row="${i}"]`)?.scrollIntoView({ block: 'nearest' })
    placeHandles()
  }
  function update(i) {
    const el = pieceEl(i)
    if (el) place(el, pieces[i])
    const row = list.querySelector(`[data-row="${i}"]`)
    const v = get(pieces[i])
    if (row) for (const k of ['x', 'y', 'w', 'r']) row.querySelector(`[data-k="${k}"]`).value = round(v[k] || 0, k === 'r' ? 2 : 1)
    if (i === sel) placeHandles()
    markDirty()
  }
  function all() {
    size()
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
    if (act === 'img') return pickFile((f) => replaceImage(i, f))
    if (act === 'copy') {
      // quy đổi theo bề rộng khổ: desktop 1920 <-> mobile 375 (giữ cùng phần bề ngang)
      snap()
      const p = pieces[i]
      const other = mode === 'desktop' ? 'mobile' : 'desktop'
      const [ox, oy, ow, or] = MODES[other].keys
      const k = MODES[mode].W / MODES[other].W
      set(p, { x: p[ox] * k, y: p[oy] * k, w: p[ow] * k, r: p[or] })
      update(i)
    }
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
    set(pieces[i], { [k]: +e.target.value || 0 })
    update(i)
  })

  /* ------------------------------------------------- kéo / xoay / đổi cỡ --- */
  board.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.hdl')) return
    const el = e.target.closest('.land__piece')
    if (!el) return select(-1)
    e.preventDefault()
    const i = +el.dataset.i
    select(i, true)
    snap()
    el.setPointerCapture(e.pointerId)
    el.classList.add('is-drag')
    const p = pieces[i]
    const v = get(p)
    const start = { x: e.clientX, y: e.clientY, px: v.x, py: v.y, rot: v.r || 0 }
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx)
    const rotate = e.shiftKey
    let moved = false
    const move = (ev) => {
      moved = true
      if (rotate) {
        let deg = start.rot + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180) / Math.PI
        if (ev.altKey) deg = Math.round(deg / 15) * 15
        set(p, { r: deg })
      } else set(p, { x: start.px + (ev.clientX - start.x) / u, y: start.py + (ev.clientY - start.y) / u })
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
      const el = e.target.closest('.land__piece')
      if (!el) return
      e.preventDefault()
      const i = +el.dataset.i
      select(i, true)
      const p = pieces[i]
      const v = get(p)
      const w = Math.max(20, Math.min(MODES[mode].W * 2, v.w * Math.exp(-e.deltaY * 0.0015)))
      const h0 = el.offsetHeight / u
      set(p, { w, x: v.x + (v.w - w) / 2, y: v.y + (h0 - (h0 * w) / v.w) / 2 })
      update(i)
    },
    { passive: false },
  )
  addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea')) return
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') return e.preventDefault(), undo()
    if (sel < 0) return
    const step = e.shiftKey ? 10 : 1
    const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
    if (!nudge) return
    e.preventDefault()
    snap()
    const v = get(pieces[sel])
    set(pieces[sel], { x: v.x + nudge[0], y: v.y + nudge[1] })
    update(sel)
  })
  function undo() {
    const last = history.pop()
    if (!last) return msg('Không còn bước nào để hoàn tác.')
    pieces = JSON.parse(last)
    all()
  }
  $('[data-undo]').addEventListener('click', undo)

  document.querySelectorAll('[data-mode]').forEach((b) =>
    b.addEventListener('click', () => {
      mode = b.dataset.mode
      document.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('is-on', x === b))
      if (bgSrc.desktop && bg.getAttribute('src') !== bgFor()) bg.src = bgFor()
      all()
    }),
  )

  /* ------------------------------------------------------------------ ảnh --- */
  // ảnh mới: WebP giữ trong suốt, rộng = 2 × cỡ hiển thị lớn nhất (desktop), không phóng to ảnh nhỏ
  async function processImage(file, p) {
    const bmp = await createImageBitmap(file)
    const tw = Math.min(bmp.width, Math.max(600, Math.ceil(p.w * 2)), 2400)
    const c = document.createElement('canvas')
    c.width = tw
    c.height = Math.round((bmp.height * tw) / bmp.width)
    const x = c.getContext('2d')
    x.imageSmoothingQuality = 'high'
    x.drawImage(bmp, 0, 0, c.width, c.height)
    return new Promise((res) => c.toBlob(res, 'image/webp', 0.88))
  }
  async function replaceImage(i, file) {
    if (!file?.type?.startsWith('image/')) return
    msg('Đang nạp ảnh…')
    const p = pieces[i]
    const blob = await processImage(file, p)
    const path = `assets/img/cms/index/land-${p.key}-${Date.now().toString(36)}.webp`
    pending.set(path, { blob, url: URL.createObjectURL(blob) })
    snap()
    p.img = path
    all()
    msg(`Đã đổi ảnh "${p.name}" (chưa lưu).`)
  }
  function pickFile(fn) {
    const inp = document.createElement('input')
    inp.type = 'file'
    inp.accept = 'image/png,image/webp,image/jpeg'
    inp.onchange = () => inp.files.length && fn(inp.files[0])
    inp.click()
  }
  view.addEventListener('dragover', (e) => {
    e.preventDefault()
    view.classList.add('is-drop')
  })
  view.addEventListener('dragleave', () => view.classList.remove('is-drop'))
  view.addEventListener('drop', (e) => {
    e.preventDefault()
    view.classList.remove('is-drop')
    const el = document.elementsFromPoint(e.clientX, e.clientY).find((x) => x.classList?.contains('land__piece'))
    const i = el ? +el.dataset.i : sel
    if (i < 0) return msg('Thả ảnh lên đúng món cần đổi (hoặc chọn món trước).', 'bad')
    replaceImage(i, e.dataTransfer.files[0])
  })

  /* ------------------------------------------------------------- đọc / ghi --- */
  // <div … data-land-key="k" … style="…"><img … src="…"
  const PIECE_RE = /(<div\b[^>]*\bdata-land-key="([\w-]+)"[^>]*\bstyle=")([^"]*)("[^>]*>\s*<img\b[^>]*?\bsrc=")([^"]*)(")/g
  const NAME_RE = /data-land-name="([^"]*)"/
  function parse(html) {
    const out = []
    for (const m of html.matchAll(PIECE_RE)) {
      const vars = Object.fromEntries([...m[3].matchAll(/--([\w-]+)\s*:\s*(-?[\d.]+)/g)].map((v) => [v[1], +v[2]]))
      out.push({ key: m[2], name: m[1].match(NAME_RE)?.[1] || m[2], img: m[5], ...Object.fromEntries(['x', 'y', 'w', 'r', 'mx', 'my', 'mw', 'mr'].map((k) => [k, vars[k] ?? 0])) })
    }
    return out
  }
  const styleOf = (p) => ['x', 'y', 'w', 'r', 'mx', 'my', 'mw', 'mr'].map((k) => `--${k}:${p[k]}`).join(';')
  function indexText(html) {
    let n = 0
    const text = html.replace(PIECE_RE, (all, a, key, _style, b, _src, c) => {
      const p = pieces.find((x) => x.key === key)
      if (!p) return all
      n++
      return `${a}${styleOf(p)}${b}${p.img}${c}`
    })
    if (n !== pieces.length) throw new Error('Không khớp các món (data-land-key) trong index.html')
    return text
  }
  async function imageFiles() {
    const out = []
    for (const path of [...pending.keys()].filter((x) => pieces.some((p) => p.img === x))) {
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
      const imgs = await imageFiles()
      let done
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
        for (const f of imgs) await gh(`/contents/${f.path}`, { method: 'PUT', body: JSON.stringify({ message: `Phong cảnh: ảnh ${f.path.split('/').pop()}`, content: f.base64, branch: cfg.branch }) })
        const cur = await gh(`/contents/index.html?ref=${encodeURIComponent(cfg.branch)}`)
        const res = await gh('/contents/index.html', { method: 'PUT', body: JSON.stringify({ message: 'Phong cảnh: lưu vị trí 3 món dán', content: enc(indexText(dec(cur.content))), sha: cur.sha, branch: cfg.branch }) })
        done = `Đã commit ${res.commit.sha.slice(0, 7)} lên ${cfg.repo} — site cập nhật sau ~1 phút.`
      }
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
  addEventListener('resize', () => all())
  ;(async () => {
    try {
      const html = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
      saved = parse(html)
      if (!saved.length) throw new Error('không thấy món nào (data-land-key)')
      pieces = clone(saved)
      // nền theo chế độ: desktop = data-cms="land-bg", mobile = data-cms="land-bg-m" (thiếu thì dùng nền desktop)
      const src = (key) => html.match(new RegExp(`<img\\b[^>]*data-cms="${key}"[^>]*>`))?.[0].match(/\ssrc="([^"]*)"/)?.[1] || ''
      bgSrc = { desktop: src('land-bg'), mobile: src('land-bg-m') }
      bg.src = bgFor()
      all()
      msg('Kéo để dời, Shift + kéo để xoay, kéo góc / lăn chuột để đổi cỡ. Desktop và Mobile chỉnh riêng.')
    } catch (e) {
      msg(`Không nạp được index.html: ${e.message || e}`, 'bad')
    }
  })()
})()
