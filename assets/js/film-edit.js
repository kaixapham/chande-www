/* =============================================================================
 * CHANDE — Trang chỉnh "Film màu" (film.html)
 * -----------------------------------------------------------------------------
 * Chỉnh trực tiếp CHANDE_FILM.config (chande-film.js) rồi apply() -> ảnh mẫu đổi
 * ngay. Lưu = ghi khoá "film.*" vào assets/js/chande-settings.js:
 *   • trên máy (node serve.mjs): POST /__cms/save;
 *   • trên site: GitHub Contents API bằng token đã nhập ở CMS (localStorage
 *     "chande-cms-gh"), một commit.
 * ========================================================================== */
;(() => {
  const F = window.CHANDE_FILM
  const C = F.config
  const $ = (s) => document.querySelector(s)
  const SETTINGS_FILE = 'assets/js/chande-settings.js'
  const KEYS = ['enabled', 'strength', 'contrast', 'saturate', 'brightness', 'sepia', 'hue', 'grain', 'grainScale']

  const PRESETS = {
    'Mặc định': { contrast: 1.06, saturate: 0.9, brightness: 1.02, sepia: 0.12, hue: -8, grain: 0.1, grainScale: 1 },
    'Classic Chrome': { contrast: 1.1, saturate: 0.78, brightness: 1, sepia: 0.1, hue: -6, grain: 0.1, grainScale: 1 },
    'Pro 400H': { contrast: 1.02, saturate: 0.92, brightness: 1.05, sepia: 0.06, hue: -12, grain: 0.08, grainScale: 1 },
    'Superia 400': { contrast: 1.08, saturate: 1.05, brightness: 1.02, sepia: 0.14, hue: -10, grain: 0.14, grainScale: 1.2 },
    Velvia: { contrast: 1.15, saturate: 1.25, brightness: 1, sepia: 0.04, hue: -4, grain: 0.06, grainScale: 1 },
  }

  const msg = (t, kind = '') => {
    const m = $('[data-msg]')
    m.textContent = t
    m.className = `side__msg${kind ? ` is-${kind}` : ''}`
  }

  function sync() {
    for (const k of KEYS) {
      const el = document.querySelector(`[data-k="${k}"]`)
      if (!el) continue
      if (el.type === 'checkbox') el.checked = !!C[k]
      else {
        el.value = C[k]
        el.parentElement.querySelector('output').textContent = k === 'strength' ? `${Math.round(C[k] * 100)}%` : C[k]
      }
    }
    document.querySelectorAll('[data-preset]').forEach((b) => {
      const p = PRESETS[b.dataset.preset]
      b.classList.toggle('is-on', Object.entries(p).every(([k, v]) => C[k] === v))
    })
  }

  // kiểu phim
  const box = $('[data-presets]')
  for (const name of Object.keys(PRESETS)) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'btn btn--sm'
    b.dataset.preset = name
    b.textContent = name
    b.onclick = () => {
      Object.assign(C, PRESETS[name])
      F.apply()
      sync()
      msg('Chưa lưu.')
    }
    box.append(b)
  }

  document.addEventListener('input', (e) => {
    const k = e.target.dataset.k
    if (!k) return
    C[k] = e.target.type === 'checkbox' ? e.target.checked : +e.target.value
    F.apply()
    sync()
    msg('Chưa lưu.')
  })

  // giữ để xem ảnh gốc
  const hold = $('[data-hold]')
  const off = () => document.documentElement.classList.remove('film-on')
  const on = () => F.apply()
  hold.addEventListener('pointerdown', off)
  addEventListener('pointerup', on)
  hold.addEventListener('pointerleave', on)

  function settingsText(src) {
    const values = { ...(window.CHANDE_SETTINGS || {}) }
    for (const k of Object.keys(values)) if (k.startsWith('film.')) delete values[k]
    for (const k of KEYS) values[`film.${k}`] = C[k]
    const sorted = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)))
    const body = `{\n${Object.entries(sorted).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n}`
    const re = /window\.CHANDE_SETTINGS = (\{\}|\{\n[\s\S]*?\n\})\n/
    if (!re.test(src)) throw new Error('Không nhận ra cấu trúc chande-settings.js')
    return src.replace(re, () => `window.CHANDE_SETTINGS = ${body}\n`)
  }

  async function save() {
    const btn = $('[data-save]')
    btn.disabled = true
    msg('Đang lưu…')
    try {
      const ping = await fetch('__cms/ping', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      if (ping?.local) {
        const src = await fetch(`${SETTINGS_FILE}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
        const r = await fetch('__cms/save', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ files: [{ path: SETTINGS_FILE, text: settingsText(src) }] }),
        })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`)
        msg('Đã ghi chande-settings.js xuống máy — commit + push để lên live.', 'ok')
      } else {
        let cfg = {}
        try {
          cfg = JSON.parse(localStorage.getItem('chande-cms-gh') || sessionStorage.getItem('chande-cms-gh') || '{}')
        } catch {}
        if (!cfg.token) throw new Error('Chưa có token GitHub — nhập ở CMS (nút GitHub) rồi lưu lại ở đây.')
        const repo = cfg.repo || 'kaixapham/chande-www'
        const branch = cfg.branch || 'main'
        const api = (path, opts = {}) =>
          fetch(`https://api.github.com/repos/${repo}${path}`, {
            ...opts,
            headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/vnd.github+json', ...(opts.body ? { 'content-type': 'application/json' } : {}) },
          }).then(async (r) => {
            const j = await r.json().catch(() => ({}))
            if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || ''}`)
            return j
          })
        const cur = await api(`/contents/${SETTINGS_FILE}?ref=${encodeURIComponent(branch)}`)
        const src = new TextDecoder().decode(Uint8Array.from(atob(cur.content.replace(/\n/g, '')), (c) => c.charCodeAt(0)))
        const bytes = new TextEncoder().encode(settingsText(src))
        let bin = ''
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        await api(`/contents/${SETTINGS_FILE}`, {
          method: 'PUT',
          body: JSON.stringify({ message: 'Film màu: cập nhật thông số (film.html)', content: btoa(bin), sha: cur.sha, branch }),
        })
        msg('Đã commit lên GitHub — site tự cập nhật sau ~1 phút.', 'ok')
      }
    } catch (err) {
      msg(`Lỗi: ${err.message}`, 'bad')
    } finally {
      btn.disabled = false
    }
  }
  $('[data-save]').addEventListener('click', save)

  // ảnh mẫu = TOÀN BỘ danh sách người ở hero (đọc index.html như CMS)
  async function loadPeople() {
    const main = document.querySelector('main')
    try {
      const html = await fetch(`index.html?t=${Date.now()}`, { cache: 'no-store' }).then((r) => r.text())
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const list = JSON.parse(doc.querySelector('[data-hero-people]')?.textContent || '[]')
      main.insertAdjacentHTML(
        'beforeend',
        list
          .filter((p) => p.img && !/\.svg$/i.test(p.img))
          .map((p, i) => `<figure><div class="hero-card__media"><img src="${p.img}" alt="" loading="lazy"></div><figcaption>${String(i + 1).padStart(2, '0')} · ${p.name || ''}</figcaption></figure>`)
          .join('')
      )
      $('[data-count]').textContent = `${list.length} ảnh người ở hero trang chủ (lấy từ danh sách CMS)`
    } catch {
      msg('Không đọc được danh sách người ở hero (index.html).', 'bad')
    }
  }
  loadPeople()

  sync()
})()
