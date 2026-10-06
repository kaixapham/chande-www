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
      })),
      lists: [...el.querySelectorAll('[data-cms-list]')].map((l) => {
        const isScript = l.tagName === 'SCRIPT'
        let items = []
        try {
          items = JSON.parse(isScript ? l.textContent : l.dataset.photos || '[]')
        } catch {}
        return {
          key: l.dataset.cmsList,
          label: l.dataset.cmsLabel || l.dataset.cmsList,
          w: +l.dataset.cmsW || 600,
          kind: isScript ? 'objects' : 'paths',
          items,
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
      type: 'img', file, key: slot.key, path, blob: img.blob, alt: prev?.alt ?? slot.alt,
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
  async function listReplaceImage(file, list, i, f) {
    const op = listOp(file, list)
    const img = await processImage(f, list.w)
    const path = newPath(file, `${list.key}-${i + 1}`, img.ext)
    S.previews.set(path, URL.createObjectURL(img.blob))
    op.files.set(path, img.blob)
    if (op.kind === 'objects') op.items[i] = { ...op.items[i], img: path }
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
          return tag
        })
      } else if (op.kind === 'objects') {
        const re = new RegExp(`(<script\\b[^>]*data-cms-list="${reEsc(op.key)}"[^>]*>)([\\s\\S]*?)(</script>)`)
        if (!re.test(html)) throw new Error(`không tìm thấy danh sách ${op.key}`)
        // Mỗi người một dòng như bản viết tay, dễ đọc khi xem diff.
        const json = `[\n${op.items.map((it) => `        ${JSON.stringify(it)}`).join(',\n')}\n      ]`
        html = html.replace(re, (_, a, __, c) => `${a}\n      ${json}\n      ${c}`)
        // Bản dự phòng (khi chưa có JS) của 4 ô hero = 4 người đầu danh sách:
        // ảnh, căn ảnh và thanh tên.
        op.items.slice(0, 4).forEach((p, i) => {
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
        const used = new Set(op.items.map((x) => (typeof x === 'string' ? x : x?.img)))
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

  function renderTree() {
    const tree = $('[data-tree]')
    const cur = S.view
    const total = S.pages.reduce((a, p) => a + p.sections.reduce((b, s) => b + count(s), 0), 0)
    let h = `<button class="node node--root" data-go="root" aria-current="${cur.kind === 'root'}">CMS tổng<span class="c">${total} ô</span></button><div class="kids">`
    for (const p of S.pages) {
      const n = p.sections.reduce((b, s) => b + count(s), 0)
      const pageChanged = p.sections.some((s) => sectionChanged(p.file, s))
      h += `<button class="node node--page ${pageChanged ? 'has-change' : ''}" data-go="page" data-file="${p.file}" aria-current="${cur.kind === 'page' && cur.file === p.file}">${esc(p.label)}<i class="dot"></i><span class="c">${p.missing ? 'không đọc được' : `${n} ô`}</span></button>`
      if (p.sections.length) {
        h += '<div class="kids">'
        for (const s of p.sections) {
          const on = cur.kind === 'section' && cur.file === p.file && cur.n === s.n
          h += `<button class="node ${count(s) ? '' : 'is-empty'} ${sectionChanged(p.file, s) ? 'has-change' : ''}" data-go="section" data-file="${p.file}" data-n="${s.n}" aria-current="${on}"><span class="n">${s.n}</span>${esc(s.label)}<i class="dot"></i><span class="c">${count(s) || '–'}</span></button>`
        }
        h += '</div>'
      }
    }
    tree.innerHTML = h + '</div>'
  }

  function slotCard(file, slot) {
    const op = S.ops.get(opKey(file, slot.key))
    const src = op?.path || slot.src
    return `<article class="slot ${op ? 'is-changed' : ''}" data-slot="${esc(slot.key)}">
      <div class="thumb"><span class="tag">CHƯA LƯU</span><img src="${esc(shown(src))}" alt=""></div>
      <div class="meta"><b>${esc(slot.label)}</b>
        <code>${esc(src)}</code>
        <span class="size">${op?.note ? esc(op.note) : `Nên dùng ảnh rộng ≥ ${slot.w * 2}px (ô hiển thị ${slot.w}px khổ 1920)`}</span>
        <div class="row"><input type="text" data-alt value="${esc(op?.alt ?? slot.alt)}" placeholder="Mô tả ảnh (alt) — để trống nếu là ảnh trang trí"></div>
      </div>
      <div class="acts"><button class="btn" type="button" data-pick>Thay ảnh</button>${op ? '<button class="btn btn--ghost" type="button" data-undo>Hoàn tác</button>' : ''}</div>
    </article>`
  }

  function listBlock(file, list) {
    const op = S.ops.get(opKey(file, list.key))
    const items = op ? op.items : list.items
    let h = `<h4 style="margin:28px 0 6px">${esc(list.label)}</h4><p class="hint">Thả ảnh vào ô để thay · ảnh nén về rộng ${list.w * 2}px${op ? ' · <b style="color:var(--warn)">có thay đổi chưa lưu</b> <button class="btn btn--ghost" type="button" data-list-undo="' + esc(list.key) + '" style="height:24px">Hoàn tác danh sách</button>' : ''}</p>`
    if (list.kind === 'objects') {
      h += `<div class="list" data-list="${esc(list.key)}">`
      items.forEach((it, i) => {
        h += `<div class="item" data-i="${i}">
          <div class="ph" data-pick-i style="background-image:url('${esc(shown(it.img || ''))}')" title="Thay ảnh"></div>
          <div class="fields">
            <label>Số<input type="text" data-k="num" value="${esc(it.num)}"></label>
            <label>Tên<input type="text" data-k="name" value="${esc(it.name)}"></label>
            <label>Căn ảnh<input type="text" data-k="pos" value="${esc(it.pos || '')}" placeholder="50% 50%"></label>
          </div>
          <div class="ops"><button class="btn" type="button" data-move="-1" title="Lên">↑</button><button class="btn" type="button" data-move="1" title="Xuống">↓</button><button class="btn" type="button" data-del title="Xoá">✕</button></div>
        </div>`
      })
      h += `<button class="btn" type="button" data-add style="align-self:flex-start">+ Thêm người</button></div>`
    } else {
      h += `<div class="chips" data-list="${esc(list.key)}">`
      items.forEach((p, i) => {
        h += `<div class="chip" data-i="${i}" data-pick-i style="background-image:url('${esc(shown(p))}')" title="${esc(p)}"><span>${i + 1}</span><button type="button" data-del title="Xoá">✕</button></div>`
      })
      h += `<button class="addbox chip" type="button" data-add>+ Thêm ảnh</button></div>`
    }
    return h
  }

  function renderMain() {
    const main = $('[data-main]')
    const v = S.view
    if (v.kind === 'root') {
      let h = '<div class="crumb">CMS tổng</div><h3>Toàn bộ ảnh của site</h3><p class="hint">Chọn một trang hoặc một section ở cây bên trái. Số ô của mỗi section đọc thẳng từ HTML — thêm thuộc tính <code>data-cms</code> vào ảnh nào thì ảnh đó tự xuất hiện ở đây.</p><div class="grid">'
      for (const p of S.pages) {
        const n = p.sections.reduce((b, s) => b + count(s), 0)
        h += `<article class="slot"><div class="meta"><b>${esc(p.label)}</b><code>${p.file}</code><span class="size">${p.sections.length} section · ${n} ô ảnh</span></div><div class="acts"><button class="btn" type="button" data-go="page" data-file="${p.file}">Mở</button></div></article>`
      }
      main.innerHTML = h + '</div>'
      return
    }
    const page = S.pages.find((p) => p.file === v.file)
    if (v.kind === 'page') {
      let h = `<div class="crumb">CMS tổng / ${esc(page.label)}</div><h3>${esc(page.label)}</h3>`
      if (!page.sections.length) h += '<div class="empty">Trang này chưa có section nào gắn <code>data-cms-section</code>.</div>'
      else {
        h += '<div class="grid">'
        for (const s of page.sections)
          h += `<article class="slot"><div class="meta"><b>Section ${s.n} · ${esc(s.label)}</b><span class="size">${count(s) ? `${count(s)} ô ảnh` : 'Không có ảnh để thay'}</span></div>${count(s) ? `<div class="acts"><button class="btn" type="button" data-go="section" data-file="${page.file}" data-n="${s.n}">Mở</button></div>` : ''}</article>`
        h += '</div>'
      }
      main.innerHTML = h
      return
    }
    const sec = page.sections.find((s) => s.n === v.n)
    let h = `<div class="crumb">CMS tổng / ${esc(page.label)} / Section ${sec.n}</div><h3>${esc(sec.label)}</h3>`
    if (!count(sec)) h += '<div class="empty">Section này không có ảnh để thay (chỉ có màu / effect).</div>'
    else {
      h += '<p class="hint">Bấm "Thay ảnh" hoặc kéo-thả ảnh vào ô. Ảnh được nén sẵn trong trình duyệt; chưa ghi gì cho tới khi bấm Lưu.</p>'
      if (sec.slots.length) h += `<div class="grid">${sec.slots.map((sl) => slotCard(page.file, sl)).join('')}</div>`
      sec.lists.forEach((l) => (h += listBlock(page.file, l)))
    }
    main.innerHTML = h
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
      if (e.target.closest('[data-pick]')) pick((f) => replaceSlot(page.file, slot, f))
      if (e.target.closest('[data-undo]')) {
        S.ops.delete(opKey(page.file, slot.key))
        render()
      }
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
      if (e.target.closest('[data-pick-i]')) return pick((f) => listReplaceImage(page.file, list, i, f))
    }
  })

  // Sửa chữ (alt / số / tên / căn ảnh)
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
      if (e.target.dataset.k === 'pos' && !e.target.value) delete op.items[i].pos
      e.target.closest('.item').classList.add('is-changed')
      renderBar()
      renderTree()
    }
  })

  // Kéo-thả ảnh vào ô
  document.addEventListener('dragover', (e) => {
    const t = e.target.closest('.slot[data-slot], [data-pick-i]')
    if (!t) return
    e.preventDefault()
    t.closest('.slot, .item, .chip')?.classList.add('is-drag')
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
      listReplaceImage(page.file, list, +t.closest('[data-i]').dataset.i, f)
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
    const first = S.pages[0]
    S.view = first?.sections.length ? { kind: 'page', file: first.file } : { kind: 'root' }
    render()
  })()
})()
