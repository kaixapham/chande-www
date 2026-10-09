/* =============================================================================
 * CHANDE CMS — thay ảnh theo cây: CMS tổng → trang → Section 1, 2, 3…
 * -----------------------------------------------------------------------------
 * NGUỒN SỰ THẬT DUY NHẤT LÀ HTML. Không có file cấu hình riêng: cây được dựng
 * bằng cách đọc thẳng các trang và tìm các thuộc tính:
 *   data-cms-section="Tên"        một section; số thứ tự = thứ tự trong trang
 *   <img data-cms="khoá"          một ô ảnh (khoá duy nhất trong trang)
 *        data-cms-label="…"       nhãn hiện trong CMS
 *        data-cms-w="234">        bề rộng hiển thị (px khổ 1920) -> nén ảnh về 2×
 *   data-cms-list="khoá"          một danh sách ảnh:
 *       <script type="application/json">[{ img, … }]  -> danh sách object
 *       data-photos='["…"]'                            -> danh sách đường dẫn
 *       data-cms-fields="num:Số|name:Tên|url:Website|text:Lời:area"  -> các ô chữ
 *           của mỗi mục (khoá:nhãn, thêm :area = ô nhiều dòng). Không ghi thì
 *           mặc định Số / Tên / Căn ảnh (danh sách 4 người hero).
 *       data-cms-images="img:Ảnh thẻ|bg:Ảnh nền:492"  -> các ô ảnh của mỗi mục
 *           (khoá:nhãn:bề rộng hiển thị). Không ghi thì một ô `img`.
 * Thêm ô ảnh mới vào CMS = thêm đúng các thuộc tính đó vào HTML, không sửa file này.
 *
 * Thay ảnh: ảnh mới được nén thành WebP (giữ nền trong suốt) rộng tối đa 2× ô,
 * lưu ở assets/img/cms/<trang>/<khoá>-<mốc>.webp, rồi CHỈ sửa đúng thuộc tính
 * src / alt của thẻ đó trong HTML (thay chuỗi, không viết lại cả trang).
 *
 * Lưu:
 *   Local  — chạy qua `node serve.mjs`: POST /__cms/save ghi thẳng xuống đĩa.
 *   GitHub — trên GitHub Pages: gom mọi thay đổi thành MỘT commit qua Git Data
 *            API bằng fine-grained token (Contents: read & write, chỉ repo này).
 * Trước khi ghi luôn đọc lại bản HTML MỚI NHẤT rồi mới áp thay đổi, nên không
 * đè mất sửa đổi khác.
 * ========================================================================== */
(() => {
  'use strict'

  const PAGES = [
    { file: 'index.html', label: 'Home' },
    { file: 'gallery.html', label: 'Gallery' },
    { file: 'about.html', label: 'About' },
  ]
  const QUALITY = 0.86

  const $ = (s, r = document) => r.querySelector(s)
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const reEsc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  const S = {
    mode: 'none', // 'local' | 'gh' | 'none'
    pages: [], // [{ file, label, sections:[{ n, label, slots, lists }] }]
    view: { kind: 'root' }, // { kind:'root' } | { kind:'page', file } | { kind:'section', file, n }
    ops: new Map(), // `${file}::${key}` -> op
    previews: new Map(), // đường dẫn ảnh chưa lưu -> objectURL
    gh: loadGh(),
  }

  /* ------------------------------------------------------------ GitHub cfg */
  function loadGh() {
    const guess = location.hostname.endsWith('github.io')
      ? `${location.hostname.split('.')[0]}/${location.pathname.split('/')[1] || ''}`
      : 'kaixapham/chande-www'
    let saved = {}
    try {
      saved = JSON.parse(localStorage.getItem('chande-cms-gh') || sessionStorage.getItem('chande-cms-gh') || '{}')
    } catch {}
    return { repo: saved.repo || guess, branch: saved.branch || 'main', token: saved.token || '', remember: !!saved.remember }
  }
  function saveGh() {
    const v = JSON.stringify(S.gh)
    try {
      sessionStorage.setItem('chande-cms-gh', v)
      if (S.gh.remember) localStorage.setItem('chande-cms-gh', v)
      else localStorage.removeItem('chande-cms-gh')
    } catch {}
  }

  /* ------------------------------------------------------------- Đọc trang */
  async function fetchText(file) {
    const r = await fetch(`${file}?cms=${Date.now()}`, { cache: 'no-store' })
    if (!r.ok) throw new Error(`${file}: ${r.status}`)
    return r.text()
  }

  function parsePage(page, text) {
    const doc = new DOMParser().parseFromString(text, 'text/html')
    page.sections = [...doc.querySelectorAll('[data-cms-section]')].map((el, i) => ({
      n: i + 1,
      label: el.dataset.cmsSection,
      slots: [...el.querySelectorAll('img[data-cms]')].map((img) => ({
        key: img.dataset.cms,
        label: img.dataset.cmsLabel || img.dataset.cms,
        w: +img.dataset.cmsW || 600,
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt') || '',
        hidden: img.hasAttribute('hidden'),
      })),
      lists: [...el.querySelectorAll('[data-cms-list]')].map((l) => {
        const isScript = l.tagName === 'SCRIPT'
        let items = []
        try {
          items = JSON.parse(isScript ? l.textContent : l.dataset.photos || '[]')
        } catch {}
        const fields = (l.dataset.cmsFields || 'num:Số|name:Tên|pos:Căn ảnh')
          .split('|')
          .map((f) => {
            const [k, label, type] = f.split(':')
            return { k: k.trim(), label: (label || k).trim(), area: type === 'area' }
          })
        const w = +l.dataset.cmsW || 600
        const images = (l.dataset.cmsImages || 'img::')
          .split('|')
          .map((f) => {
            const [k, label, iw] = f.split(':')
            return { k: k.trim(), label: (label || '').trim(), w: +iw || w }
          })
        return {
          key: l.dataset.cmsList,
          label: l.dataset.cmsLabel || l.dataset.cmsList,
          w,
          kind: isScript ? 'objects' : 'paths',
          items,
          fields,
          images,
        }
      }),
    }))
  }

  async function loadAll() {
    S.pages = []
    for (const p of PAGES) {
      const page = { ...p, sections: [], missing: false }
      try {
        parsePage(page, await fetchText(p.file))
      } catch {
        page.missing = true
      }
      S.pages.push(page)
    }
  }

  async function detectMode() {
    try {
      const r = await fetch('__cms/ping', { cache: 'no-store' })
      if (r.ok && (await r.json()).local) return (S.mode = 'local')
    } catch {}
    S.mode = S.gh.token ? 'gh' : 'none'
  }

  /* --------------------------------------------------------- Ảnh: nén lại */
  async function processImage(file, w) {
    if (file.type === 'image/svg+xml') return { blob: file, ext: 'svg' }
    const bmp = await createImageBitmap(file)
    const width = Math.min(bmp.width, Math.max(1, Math.round(w * 2)))
    const height = Math.round((bmp.height * width) / bmp.width)
    const c = document.createElement('canvas')
    c.width = width
    c.height = height
    const ctx = c.getContext('2d')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bmp, 0, 0, width, height)
    const blob = await new Promise((res) => c.toBlob(res, 'image/webp', QUALITY))
    return { blob, ext: 'webp', width, height, from: `${bmp.width}×${bmp.height}` }
  }

  function newPath(file, key, ext) {
    const slug = file.replace(/\.html$/, '')
    return `assets/img/cms/${slug}/${key}-${Date.now().toString(36)}.${ext}`
  }

  const shown = (src) => S.previews.get(src) || src

  /* --------------------------------------------------- Thao tác chờ lưu ---- */
  const opKey = (file, key) => `${file}::${key}`

  async function replaceSlot(file, slot, f) {
    const img = await processImage(f, slot.w)
    const path = newPath(file, slot.key, img.ext)
    S.previews.set(path, URL.createObjectURL(img.blob))
    const prev = S.ops.get(opKey(file, slot.key))
    S.ops.set(opKey(file, slot.key), {
      type: 'img', file, key: slot.key, path, blob: img.blob, alt: prev?.alt ?? slot.alt, hidden: false,
      note: img.width ? `${img.from} → ${img.width}×${img.height} WebP, ${Math.round(img.blob.size / 1024)} KB` : 'SVG giữ nguyên',
    })
    render()
  }

  function setAlt(file, slot, alt) {
    const k = opKey(file, slot.key)
    const op = S.ops.get(k) || { type: 'img', file, key: slot.key, path: null, blob: null }
    op.alt = alt
    if (!op.path && alt === slot.alt) S.ops.delete(k)
    else S.ops.set(k, op)
    renderBar()
  }

  // Danh sách: op giữ CẢ danh sách đã sửa + các ảnh mới (đường dẫn -> blob).
  function listOp(file, list) {
    const k = opKey(file, list.key)
    if (!S.ops.has(k)) {
      S.ops.set(k, { type: 'list', file, key: list.key, kind: list.kind, items: structuredClone(list.items), files: new Map() })
    }
    return S.ops.get(k)
  }
  // k = khoá ô ảnh của mục (img mặc định; danh sách có data-cms-images thì thêm bg…)
  async function listReplaceImage(file, list, i, f, k = 'img') {
    const op = listOp(file, list)
    const def = list.images?.find((x) => x.k === k)
    const img = await processImage(f, def?.w || list.w)
    const path = newPath(file, `${list.key}-${i + 1}${k === 'img' ? '' : `-${k}`}`, img.ext)
    S.previews.set(path, URL.createObjectURL(img.blob))
    op.files.set(path, img.blob)
    if (op.kind === 'objects') op.items[i] = { ...op.items[i], [k]: path }
    else op.items[i] = path
    render()
  }

  /* ------------------------------------------- Áp thay đổi vào chuỗi HTML -- */
  function setAttr(tag, name, value, quote = '"') {
    const re = new RegExp(`\\s${reEsc(name)}=(["'])[\\s\\S]*?\\1`)
    const attr = ` ${name}=${quote}${value}${quote}`
    return re.test(tag) ? tag.replace(re, attr) : tag.replace(/\s*\/?>$/, (end) => `${attr}${end}`)
  }
  function editTag(html, attrSel, fn) {
    const re = new RegExp(`<[a-z]+\\b[^>]*\\b${attrSel}[^>]*>`, 'i')
    const m = html.match(re)
    if (!m) throw new Error(`không tìm thấy thẻ ${attrSel}`)
    return html.replace(m[0], fn(m[0]))
  }

  function applyOps(file, html) {
    for (const op of S.ops.values()) {
      if (op.file !== file) continue
      if (op.type === 'img') {
        html = editTag(html, `data-cms="${reEsc(op.key)}"`, (tag) => {
          if (op.path) tag = setAttr(tag, 'src', op.path)
          if (op.alt != null) tag = setAttr(tag, 'alt', esc(op.alt))
          // Xoá ảnh = ẩn khỏi trang (thuộc tính hidden), file ảnh giữ nguyên
          if (op.hidden === true && !/\shidden(\s|=|>|\/)/.test(tag)) tag = tag.replace(/\s*\/?>$/, (end) => ` hidden${end}`)
          if (op.hidden === false) tag = tag.replace(/\shidden(="[^"]*")?(?=[\s/>])/, '')
          return tag
        })
      } else if (op.kind === 'objects') {
        const re = new RegExp(`(<script\\b[^>]*data-cms-list="${reEsc(op.key)}"[^>]*>)([\\s\\S]*?)(</script>)`)
        if (!re.test(html)) throw new Error(`không tìm thấy danh sách ${op.key}`)
        // Mỗi người một dòng như bản viết tay, dễ đọc khi xem diff.
        const json = `[\n${op.items.map((it) => `        ${JSON.stringify(it)}`).join(',\n')}\n      ]`
        html = html.replace(re, (_, a, __, c) => `${a}\n      ${json}\n      ${c}`)
        // Bản dự phòng (khi chưa có JS) của 4 ô hero = 4 người đầu danh sách:
        // ảnh, căn ảnh và thanh tên. CHỈ cho danh sách hero — cùng trang còn danh
        // sách khác (poster-stack), đồng bộ bừa là ảnh poster đè lên 4 ô hero.
        if (op.key === 'hero-people') op.items.slice(0, 4).forEach((p, i) => {
          if (!p) return
          try {
            html = editTag(html, `data-cms-person="${i}"`, (t) => {
              if (p.img) t = setAttr(t, 'src', p.img)
              return p.pos ? setAttr(t, 'style', `object-position:${esc(p.pos)}`) : t.replace(/\sstyle="[^"]*"/, '')
            })
            const cap = new RegExp(`(<figcaption\\b[^>]*data-cms-person-cap="${i}"[^>]*>)[\\s\\S]*?(</figcaption>)`)
            html = html.replace(cap, (_, a, c) => `${a}<span>${esc(p.num)}</span><span>${esc(p.name)}</span>${c}`)
          } catch {}
        })
      } else {
        html = editTag(html, `data-cms-list="${reEsc(op.key)}"`, (tag) => setAttr(tag, 'data-photos', JSON.stringify(op.items), "'"))
      }
    }
    return html
  }

  function pendingFiles() {
    const out = [] // { path, blob }
    for (const op of S.ops.values()) {
      if (op.type === 'img' && op.blob) out.push({ path: op.path, blob: op.blob })
      if (op.type === 'list') {
        // chỉ ảnh còn được dùng trong danh sách sau khi sửa
        const used = new Set(op.items.flatMap((x) => (typeof x === 'string' ? [x] : Object.values(x || {}))))
        op.files.forEach((blob, path) => used.has(path) && out.push({ path, blob }))
      }
    }
    return out
  }
  const touchedPages = () => [...new Set([...S.ops.values()].map((o) => o.file))]

  const b64 = (blob) =>
    new Promise((res, rej) => {
      const fr = new FileReader()
      fr.onload = () => res(String(fr.result).split(',')[1])
      fr.onerror = rej
      fr.readAsDataURL(blob)
    })

  /* --------------------------------------------------------------- Lưu ---- */
  async function saveLocal() {
    const files = []
    for (const f of pendingFiles()) files.push({ path: f.path, base64: await b64(f.blob) })
    for (const file of touchedPages()) files.push({ path: file, text: applyOps(file, await fetchText(file)) })
    const r = await fetch('__cms/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ files }) })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error || r.status)
    return `Đã ghi ${j.files.length} file xuống máy. Nhớ commit + push để lên GitHub Pages.`
  }

  async function gh(path, opts = {}) {
    const r = await fetch(`https://api.github.com/repos/${S.gh.repo}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${S.gh.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
    })
    const j = r.status === 204 ? {} : await r.json()
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`)
    return j
  }
  async function saveGitHub() {
    if (!S.gh.token) throw new Error('Chưa có token GitHub')
    const br = encodeURIComponent(S.gh.branch)
    const ref = await gh(`/git/ref/heads/${br}`)
    const base = await gh(`/git/commits/${ref.object.sha}`)
    const tree = []
    for (const f of pendingFiles()) {
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await b64(f.blob), encoding: 'base64' }) })
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha })
    }
    for (const file of touchedPages()) {
      // Bản mới nhất trên nhánh, không phải bản đang được Pages phục vụ.
      const cur = await gh(`/contents/${file}?ref=${br}`)
      const text = new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
      const blob = await gh('/git/blobs', { method: 'POST', body: JSON.stringify({ content: applyOps(file, text), encoding: 'utf-8' }) })
      tree.push({ path: file, mode: '100644', type: 'blob', sha: blob.sha })
    }
    const t = await gh('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree }) })
    const names = [...S.ops.values()].map((o) => o.key).join(', ')
    const c = await gh('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message: `CMS: thay ảnh ${names}`, tree: t.sha, parents: [ref.object.sha] }),
    })
    await gh(`/git/refs/heads/${br}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) })
    return `Đã commit ${c.sha.slice(0, 7)} lên ${S.gh.repo}@${S.gh.branch}. GitHub Pages sẽ cập nhật sau khoảng 1 phút.`
  }

  async function save() {
    const btn = $('[data-save]')
    btn.disabled = true
    btn.textContent = 'Đang lưu…'
    try {
      const msg = S.mode === 'local' ? await saveLocal() : await saveGitHub()
      S.ops.clear()
      await loadAll()
      render()
      toast(msg)
    } catch (e) {
      toast(`Lưu thất bại: ${e.message}`, true)
    } finally {
      btn.textContent = S.mode === 'local' ? 'Lưu' : 'Xuất bản'
      renderBar()
    }
  }

  /* ----------------------------------------------------------- Giao diện -- */
  function toast(msg, bad) {
    const t = $('[data-toast]')
    t.textContent = msg
    t.classList.toggle('is-bad', !!bad)
    t.classList.add('is-on')
    clearTimeout(toast.t)
    toast.t = setTimeout(() => t.classList.remove('is-on'), bad ? 9000 : 6000)
  }

  const sectionChanged = (file, sec) =>
    [...sec.slots.map((s) => s.key), ...sec.lists.map((l) => l.key)].some((k) => S.ops.has(opKey(file, k)))
  const count = (sec) => sec.slots.length + sec.lists.length

  function renderBar() {
    const n = S.ops.size
    $('[data-pending]').textContent = n ? `${n} thay đổi chưa lưu` : ''
    $('[data-discard]').hidden = !n
    const badge = $('[data-mode]')
    badge.className = `badge ${S.mode === 'local' ? 'is-local' : S.mode === 'gh' ? 'is-gh' : ''}`
    badge.textContent = S.mode === 'local' ? 'Local — ghi xuống máy' : S.mode === 'gh' ? `GitHub — ${S.gh.repo}@${S.gh.branch}` : 'Chỉ xem — chưa có token'
    const save = $('[data-save]')
    save.textContent = S.mode === 'local' ? 'Lưu' : 'Xuất bản'
    save.disabled = !n || S.mode === 'none'
  }

  // Chỉ những trang / section CÓ ảnh để sửa mới hiện (section chỉ có màu / effect bị ẩn).
  const pagesWith = () => S.pages.filter((p) => p.sections.some((s) => count(s)))
  const sectionsWith = (p) => p.sections.filter((s) => count(s))
  // Ảnh xem trước của một section: ô ảnh + ảnh đầu của các danh sách (tối đa n)
  function thumbsOf(file, sec, n = 4) {
    const out = []
    for (const sl of sec.slots) {
      const op = S.ops.get(opKey(file, sl.key))
      out.push(shown(op?.path || sl.src))
    }
    for (const l of sec.lists) {
      const items = S.ops.get(opKey(file, l.key))?.items || l.items
      for (const it of items.slice(0, 4)) out.push(shown(l.kind === 'objects' ? it[l.images[0]?.k || 'img'] : it))
    }
    return out.filter(Boolean).slice(0, n)
  }
  const itemsCount = (sec) => sec.slots.length + sec.lists.reduce((a, l) => a + l.items.length, 0)

  function renderTree() {
    const tree = $('[data-tree]')
    const cur = S.view
    let h = ''
    for (const p of pagesWith()) {
      const pageChanged = p.sections.some((s) => sectionChanged(p.file, s))
      h += `<button class="node node--page ${pageChanged ? 'has-change' : ''}" data-go="page" data-file="${p.file}" aria-current="${cur.kind === 'page' && cur.file === p.file}">${esc(p.label)}<i class="dot"></i></button><div class="kids">`
      for (const s of sectionsWith(p)) {
        const on = cur.kind === 'section' && cur.file === p.file && cur.n === s.n
        h += `<button class="node ${sectionChanged(p.file, s) ? 'has-change' : ''}" data-go="section" data-file="${p.file}" data-n="${s.n}" aria-current="${on}">${esc(s.label)}<i class="dot"></i><span class="c">${itemsCount(s)}</span></button>`
      }
      h += '</div>'
    }
    tree.innerHTML = h || '<p class="hint">Chưa có ảnh nào gắn <code>data-cms</code>.</p>'
  }

  function slotCard(file, slot) {
    const op = S.ops.get(opKey(file, slot.key))
    const src = op?.path || slot.src
    const hidden = op?.hidden ?? slot.hidden
    const tip = `${src}\nNên dùng ảnh rộng ≥ ${slot.w * 2}px`
    return `<article class="slot ${op ? 'is-changed' : ''} ${hidden ? 'is-hidden' : ''}" data-slot="${esc(slot.key)}">
      <div class="thumb" data-pick title="${esc(tip)}"><img src="${esc(shown(src))}" alt="">
        ${op ? '<span class="tag">Chưa lưu</span>' : ''}${hidden ? '<span class="gone">Đã ẩn khỏi trang</span>' : ''}
        <span class="tbar">
          <button class="tbtn" type="button" data-pick>Thay ảnh</button>
          ${hidden ? '<button class="tbtn" type="button" data-unhide>Hiện lại</button>' : '<button class="tbtn tbtn--bad" type="button" data-remove>Ẩn</button>'}
          ${op ? '<button class="tbtn" type="button" data-undo>Hoàn tác</button>' : ''}
        </span>
      </div>
      <div class="meta"><b>${esc(slot.label)}</b>${op?.note ? `<span class="note">${esc(op.note)}</span>` : ''}
        <input type="text" data-alt value="${esc(op?.alt ?? slot.alt)}" placeholder="Mô tả ảnh (alt)"></div>
    </article>`
  }

  function listBlock(file, list) {
    const op = S.ops.get(opKey(file, list.key))
    const items = op ? op.items : list.items
    let h = `<section class="panel${op ? ' is-changed' : ''}"><header class="panel__head"><b>${esc(list.label)}</b><span class="c">${items.length}</span>${op ? `<button class="btn btn--ghost btn--sm" type="button" data-list-undo="${esc(list.key)}">Hoàn tác</button>` : ''}</header>`
    if (list.kind === 'objects') {
      h += `<div class="cards" data-list="${esc(list.key)}">`
      items.forEach((it, i) => {
        h += `<div class="card" data-i="${i}">
          <div class="phs">${list.images.map((im) => `<div class="ph" data-pick-i data-ik="${esc(im.k)}" style="background-image:url('${esc(shown(it[im.k] || ''))}')" title="Bấm / thả ảnh để thay ${esc(im.label || 'ảnh')}"><em>Thay</em>${im.label && list.images.length > 1 ? `<small>${esc(im.label)}</small>` : ''}</div>`).join('')}</div>
          <div class="fields">
            ${list.fields.map((f) => f.area
              ? `<textarea data-k="${esc(f.k)}" rows="3" placeholder="${esc(f.label)}">${esc(it[f.k] || '')}</textarea>`
              : `<input type="text" class="f-${esc(f.k)}${!['num', 'name'].includes(f.k) && !it[f.k] ? ' is-opt' : ''}" data-k="${esc(f.k)}" value="${esc(it[f.k] || '')}" placeholder="${esc(f.label)}" title="${esc(f.label)}">`).join('')}
          </div>
          <div class="ops"><button class="ico" type="button" data-move="-1" title="Lên">↑</button><button class="ico" type="button" data-move="1" title="Xuống">↓</button><button class="ico ico--bad" type="button" data-del title="Xoá">✕</button></div>
        </div>`
      })
      h += `<button class="card addbox" type="button" data-add>+ Thêm</button></div>`
    } else {
      h += `<div class="chips" data-list="${esc(list.key)}">`
      items.forEach((p, i) => {
        h += `<div class="chip" data-i="${i}" data-pick-i style="background-image:url('${esc(shown(p))}')" title="Bấm / thả ảnh để thay"><span>${i + 1}</span><em>Thay</em><button type="button" data-del title="Xoá ảnh này">✕</button></div>`
      })
      h += `<button class="addbox chip" type="button" data-add>+ Thêm ảnh</button></div>`
    }
    return h + '</section>'
  }

  // ô bento của một section / một trang: ghép tối đa 4 ảnh xem trước
  function bentoTile(attrs, title, sub, thumbs, size, changed) {
    const pics = thumbs.map((t) => `<i style="background-image:url('${esc(t)}')"></i>`).join('')
    return `<button class="tile tile--${size}${changed ? ' has-change' : ''}" type="button" ${attrs}>
      <span class="tile__pics n${thumbs.length}">${pics}</span>
      <span class="tile__txt"><b>${esc(title)}</b><span>${esc(sub)}</span></span><i class="dot"></i></button>`
  }

  function renderMain() {
    const main = $('[data-main]')
    const v = S.view
    const pages = pagesWith()
    if (v.kind === 'root' || !pages.some((p) => p.file === v.file)) {
      let h = '<h3>Nội dung có thể sửa</h3><div class="bento">'
      for (const p of pages) {
        const secs = sectionsWith(p)
        const thumbs = secs.flatMap((s) => thumbsOf(p.file, s, 1)).slice(0, 4)
        h += bentoTile(`data-go="page" data-file="${p.file}"`, p.label, `${secs.length} section`, thumbs, 'xl', p.sections.some((s) => sectionChanged(p.file, s)))
      }
      main.innerHTML = h + '</div>'
      return
    }
    const page = S.pages.find((p) => p.file === v.file)
    const secs = sectionsWith(page)
    if (v.kind === 'page') {
      let h = `<h3>${esc(page.label)}</h3><div class="bento">`
      for (const s of secs) {
        const n = itemsCount(s)
        const size = n >= 8 ? 'xl' : n >= 3 ? 'l' : 'm'
        h += bentoTile(`data-go="section" data-file="${page.file}" data-n="${s.n}"`, s.label, `${n} ảnh`, thumbsOf(page.file, s), size, sectionChanged(page.file, s))
      }
      main.innerHTML = h + '</div>'
      return
    }
    const sec = page.sections.find((s) => s.n === v.n)
    const at = secs.indexOf(sec)
    const nav = (d, txt) => {
      const t = secs[at + d]
      return t ? `<button class="btn btn--ghost btn--sm" type="button" data-go="section" data-file="${page.file}" data-n="${t.n}" title="${esc(t.label)}">${txt}</button>` : ''
    }
    let h = `<div class="sechead"><button class="btn btn--ghost btn--sm" type="button" data-go="page" data-file="${page.file}">← ${esc(page.label)}</button><h3>${esc(sec.label)}</h3><span class="sp"></span>${nav(-1, '‹ Trước')}${nav(1, 'Sau ›')}</div>`
    h += '<div class="bento bento--slots">'
    h += sec.slots.map((sl) => slotCard(page.file, sl)).join('')
    sec.lists.forEach((l) => (h += listBlock(page.file, l)))
    main.innerHTML = h + '</div>'
  }

  function render() {
    renderBar()
    renderTree()
    renderMain()
  }

  /* -------------------------------------------------------------- Sự kiện -- */
  const fileInput = $('[data-file]')
  let pickTarget = null
  const pick = (fn) => {
    pickTarget = fn
    fileInput.value = ''
    fileInput.click()
  }
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0]
    if (f && pickTarget) pickTarget(f).catch((e) => toast(`Không đọc được ảnh: ${e.message}`, true))
  })

  const ctx = () => {
    const v = S.view
    const page = S.pages.find((p) => p.file === v.file)
    return { page, sec: page?.sections.find((s) => s.n === v.n) }
  }

  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]')
    if (go) {
      const k = go.dataset.go
      S.view = k === 'root' ? { kind: 'root' } : k === 'page' ? { kind: 'page', file: go.dataset.file } : { kind: 'section', file: go.dataset.file, n: +go.dataset.n }
      return render()
    }
    const { page, sec } = ctx()
    const slotEl = e.target.closest('[data-slot]')
    if (slotEl && sec) {
      const slot = sec.slots.find((s) => s.key === slotEl.dataset.slot)
      const k = opKey(page.file, slot.key)
      if (e.target.closest('[data-undo]')) {
        S.ops.delete(k)
        return render()
      }
      if (e.target.closest('[data-remove], [data-unhide]')) {
        const op = S.ops.get(k) || { type: 'img', file: page.file, key: slot.key, path: null, blob: null }
        op.hidden = !!e.target.closest('[data-remove]')
        // trở về đúng trạng thái gốc thì bỏ thay đổi
        if (!op.path && op.alt == null && op.hidden === slot.hidden) S.ops.delete(k)
        else S.ops.set(k, op)
        return render()
      }
      if (e.target.closest('[data-pick]')) pick((f) => replaceSlot(page.file, slot, f))
      return
    }
    const undoList = e.target.closest('[data-list-undo]')
    if (undoList) {
      S.ops.delete(opKey(page.file, undoList.dataset.listUndo))
      return render()
    }
    const listEl = e.target.closest('[data-list]')
    if (listEl && sec) {
      const list = sec.lists.find((l) => l.key === listEl.dataset.list)
      const itemEl = e.target.closest('[data-i]')
      const i = itemEl ? +itemEl.dataset.i : -1
      if (e.target.closest('[data-del]')) {
        listOp(page.file, list).items.splice(i, 1)
        return render()
      }
      if (e.target.closest('[data-move]')) {
        const items = listOp(page.file, list).items
        const j = i + +e.target.closest('[data-move]').dataset.move
        if (j < 0 || j >= items.length) return
        ;[items[i], items[j]] = [items[j], items[i]]
        return render()
      }
      if (e.target.closest('[data-add]')) {
        const op = listOp(page.file, list)
        const at = op.items.length
        return pick(async (f) => {
          op.items.push(list.kind === 'objects' ? { num: String(at + 1).padStart(2, '0'), name: 'Tên', img: '' } : '')
          await listReplaceImage(page.file, list, at, f)
        })
      }
      if (e.target.closest('[data-pick-i]')) {
        const k = e.target.closest('[data-pick-i]').dataset.ik || 'img'
        return pick((f) => listReplaceImage(page.file, list, i, f, k))
      }
    }
  })

  // Sửa chữ (alt / các ô chữ của danh sách)
  document.addEventListener('input', (e) => {
    const { page, sec } = ctx()
    if (!sec) return
    if (e.target.matches('[data-alt]')) {
      const slot = sec.slots.find((s) => s.key === e.target.closest('[data-slot]').dataset.slot)
      setAlt(page.file, slot, e.target.value)
      e.target.closest('.slot').classList.toggle('is-changed', S.ops.has(opKey(page.file, slot.key)))
      return renderTree()
    }
    if (e.target.matches('[data-k]')) {
      const list = sec.lists.find((l) => l.key === e.target.closest('[data-list]').dataset.list)
      const i = +e.target.closest('[data-i]').dataset.i
      const op = listOp(page.file, list)
      op.items[i] = { ...op.items[i], [e.target.dataset.k]: e.target.value }
      // ô tuỳ chọn để trống thì bỏ hẳn khoá (giữ JSON gọn)
      if (!['num', 'name'].includes(e.target.dataset.k) && !e.target.value) delete op.items[i][e.target.dataset.k]
      e.target.closest('.card')?.classList.add('is-changed')
      renderBar()
      renderTree()
    }
  })

  // Kéo-thả ảnh vào ô
  document.addEventListener('dragover', (e) => {
    const t = e.target.closest('.slot[data-slot], [data-pick-i]')
    if (!t) return
    e.preventDefault()
    t.closest('.slot, .card, .chip')?.classList.add('is-drag')
  })
  document.addEventListener('dragleave', (e) => e.target.closest?.('.is-drag')?.classList.remove('is-drag'))
  document.addEventListener('drop', (e) => {
    const t = e.target.closest('.slot[data-slot], [data-pick-i]')
    if (!t) return
    e.preventDefault()
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith('image/'))
    if (!f) return
    const { page, sec } = ctx()
    if (t.matches('.slot')) replaceSlot(page.file, sec.slots.find((s) => s.key === t.dataset.slot), f)
    else {
      const list = sec.lists.find((l) => l.key === t.closest('[data-list]').dataset.list)
      listReplaceImage(page.file, list, +t.closest('[data-i]').dataset.i, f, t.dataset.ik || 'img')
    }
  })

  $('[data-save]').addEventListener('click', save)
  $('[data-discard]').addEventListener('click', () => {
    if (!confirm('Bỏ hết thay đổi chưa lưu?')) return
    S.ops.clear()
    render()
  })

  const dlg = $('[data-gh]')
  $('[data-settings]').addEventListener('click', () => {
    dlg.querySelector('[data-f=repo]').value = S.gh.repo
    dlg.querySelector('[data-f=branch]').value = S.gh.branch
    dlg.querySelector('[data-f=token]').value = S.gh.token
    dlg.querySelector('[data-f=remember]').checked = S.gh.remember
    dlg.showModal()
  })
  dlg.querySelector('[data-close]').addEventListener('click', () => dlg.close())
  dlg.querySelector('[data-gh-ok]').addEventListener('click', async () => {
    S.gh = {
      repo: dlg.querySelector('[data-f=repo]').value.trim() || S.gh.repo,
      branch: dlg.querySelector('[data-f=branch]').value.trim() || 'main',
      token: dlg.querySelector('[data-f=token]').value.trim(),
      remember: dlg.querySelector('[data-f=remember]').checked,
    }
    saveGh()
    dlg.close()
    // Có token thì dùng GitHub kể cả khi đang chạy local (để xuất bản thẳng).
    if (S.gh.token) {
      try {
        await gh(`/git/ref/heads/${encodeURIComponent(S.gh.branch)}`)
        S.mode = 'gh'
        toast(`Đã kết nối ${S.gh.repo}@${S.gh.branch}.`)
      } catch (e) {
        toast(`Token / repo không dùng được: ${e.message}`, true)
      }
    } else await detectMode()
    renderBar()
  })

  addEventListener('beforeunload', (e) => {
    if (S.ops.size) e.preventDefault()
  })

  /* ------------------------------------------------------------- Khởi động */
  ;(async () => {
    await detectMode()
    await loadAll()
    const first = pagesWith()[0]
    S.view = first ? { kind: 'page', file: first.file } : { kind: 'root' }
    render()
  })()
})()
