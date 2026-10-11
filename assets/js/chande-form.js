/* =============================================================================
 * CHANDE — Form đăng ký / đối tác ([data-form] trong register.html, partner.html)
 * -----------------------------------------------------------------------------
 *   • Ô quốc gia: gợi ý tên mọi nước (Intl.DisplayNames, tiếng Anh); chọn Việt Nam thì
 *     hiện thêm ô tỉnh / thành (34 đơn vị hành chính cấp tỉnh từ 07/2025).
 *   • Ô chọn có giá trị "other" (data-other) -> hiện ô nhập thêm ngay dưới.
 *   • Kiểm tra trước khi gửi: ô bắt buộc (nhóm có data-req), email hợp lệ, nhóm lựa chọn
 *     bắt buộc phải tick ít nhất một. Lỗi hiện ngay dưới ô, cuộn tới ô lỗi đầu tiên.
 *   • Gửi: POST /api/submit (hàm Vercel — api/submit.js) dạng JSON
 *       { form, entries: [[nhãn, giá trị], …], email, name, hp, t }
 *     hp = ô bẫy máy spam (người thật để trống), t = ms từ lúc mở form (máy gửi tức thì).
 *     Thành công: ẩn form, hiện khối cảm ơn.
 *
 * Nạp ở MỌI trang (Barba chỉ thay container, script của trang đích không chạy lại) —
 * mount theo container mỗi lần vào trang.
 * API: window.CHANDE_FORM = { mount(root) }
 * ========================================================================== */
;(() => {
  'use strict'

  const VN_PROVINCES = [
    'Hà Nội', 'TP. Hồ Chí Minh', 'Hải Phòng', 'Đà Nẵng', 'Cần Thơ', 'Huế',
    'An Giang', 'Bắc Ninh', 'Cà Mau', 'Cao Bằng', 'Đắk Lắk', 'Điện Biên', 'Đồng Nai', 'Đồng Tháp',
    'Gia Lai', 'Hà Tĩnh', 'Hưng Yên', 'Khánh Hòa', 'Lai Châu', 'Lâm Đồng', 'Lạng Sơn', 'Lào Cai',
    'Nghệ An', 'Ninh Bình', 'Phú Thọ', 'Quảng Ngãi', 'Quảng Ninh', 'Quảng Trị', 'Sơn La',
    'Tây Ninh', 'Thái Nguyên', 'Thanh Hóa', 'Tuyên Quang', 'Vĩnh Long',
  ]
  // mã nước ISO 3166-1 (tên lấy từ Intl.DisplayNames — khỏi chép danh sách tên)
  const ISO =
    'AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'
  let countries = null
  const countryList = () => {
    if (countries) return countries
    let dn = null
    try {
      dn = new Intl.DisplayNames(['en'], { type: 'region' })
    } catch {}
    const names = ISO.split(' ').map((c) => (dn ? dn.of(c) : c)).filter(Boolean)
    countries = ['Vietnam', ...names.filter((n) => n !== 'Vietnam').sort((a, b) => a.localeCompare(b))]
    return countries
  }
  const isVietnam = (v) => /^\s*(vi[eệ]t\s*nam|vn)\s*$/i.test(v || '')
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

  const datalist = (id, items) => {
    if (document.getElementById(id)) return
    const dl = document.createElement('datalist')
    dl.id = id
    dl.innerHTML = items.map((n) => `<option value="${String(n).replace(/"/g, '&quot;')}"></option>`).join('')
    document.body.appendChild(dl)
  }

  function mount(root = document) {
    const scope = root.querySelectorAll ? root : document
    scope.querySelectorAll('form[data-form]').forEach(setup)
  }

  function setup(form) {
    if (form._fm) return
    form._fm = true
    const t0 = performance.now()
    const wrap = form.closest('.fm') || form.parentElement
    const done = wrap.querySelector('.fm__done')
    const status = form.querySelector('.fm__status')
    const send = form.querySelector('.fm__send')

    // quốc gia + tỉnh thành
    datalist('fm-countries', countryList())
    datalist('fm-vn-provinces', VN_PROVINCES)
    const country = form.querySelector('[name=country]')
    const cityGroup = form.querySelector('[data-city]')
    const syncCity = () => {
      if (!cityGroup) return
      const on = isVietnam(country?.value)
      cityGroup.hidden = !on
      if (!on) cityGroup.classList.remove('is-bad')
    }
    country?.addEventListener('input', syncCity)
    syncCity()

    // chọn "other" -> ô nhập thêm
    form.querySelectorAll('[data-other]').forEach((g) => {
      const more = g.querySelector('.fm__more')
      const sync = () => {
        const sel = g.querySelector('select')
        const box = [...g.querySelectorAll('input[type=checkbox], input[type=radio]')].find((i) => i.value === 'other')
        const on = sel ? sel.value === 'other' : !!box?.checked
        if (more) more.hidden = !on
      }
      g.addEventListener('change', sync)
      sync()
    })

    // gõ lại thì bỏ báo lỗi của ô đó
    form.addEventListener('input', (e) => e.target.closest('.fm__group')?.classList.remove('is-bad'))
    form.addEventListener('change', (e) => e.target.closest('.fm__group')?.classList.remove('is-bad'))

    const valueOf = (g) => {
      const boxes = [...g.querySelectorAll('input[type=checkbox]:checked, input[type=radio]:checked')]
      const labelOf = (i) => i.closest('.fm__opt')?.textContent.trim() || i.value
      let v
      if (boxes.length) v = boxes.map((i) => (i.value === 'other' ? '' : labelOf(i))).filter(Boolean)
      else {
        const f = g.querySelector('input:not([type=checkbox]):not([type=radio]), select, textarea')
        if (!f) return ''
        v = f.tagName === 'SELECT' ? (f.value === 'other' ? '' : f.selectedOptions[0]?.textContent.trim() || '') : f.value.trim()
        v = v ? [v] : []
      }
      const more = g.querySelector('.fm__more:not([hidden]) input')
      if (more?.value.trim()) v.push(more.value.trim())
      return v.join(', ')
    }

    const check = () => {
      let first = null
      form.querySelectorAll('.fm__group').forEach((g) => {
        if (g.hidden) return
        const v = valueOf(g)
        let bad = g.hasAttribute('data-req') && !v
        const em = g.querySelector('input[type=email]')
        if (!bad && em && em.value.trim() && !EMAIL.test(em.value.trim())) bad = true
        const num = g.querySelector('input[type=number]')
        if (!bad && num && num.value && (+num.value < +num.min || +num.value > +num.max)) bad = true
        g.classList.toggle('is-bad', bad)
        if (bad && !first) first = g
      })
      if (first) {
        const y = first.getBoundingClientRect().top + scrollY - innerHeight * 0.25
        window.CHANDE_TRANSITION?.lenis ? window.CHANDE_TRANSITION.lenis.scrollTo(y) : scrollTo({ top: y, behavior: 'smooth' })
        first.querySelector('input, select, textarea')?.focus({ preventScroll: true })
      }
      return !first
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      status.textContent = ''
      status.classList.remove('is-error')
      if (!check()) return
      const entries = [...form.querySelectorAll('.fm__group')]
        .filter((g) => !g.hidden)
        .map((g) => [g.querySelector('.fm__head span')?.textContent.trim() || '', valueOf(g)])
        .filter(([, v]) => v)
      const body = {
        form: form.dataset.form,
        entries,
        email: form.querySelector('input[type=email]')?.value.trim() || '',
        name: form.querySelector('[name=name], [name=org]')?.value.trim() || '',
        hp: form.querySelector('.fm__trap input')?.value || '',
        t: Math.round(performance.now() - t0),
      }
      send.disabled = true
      status.textContent = 'Sending…'
      try {
        const r = await fetch('/api/submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`)
        form.hidden = true
        if (done) {
          done.hidden = false
          const y = done.getBoundingClientRect().top + scrollY - innerHeight * 0.3
          window.CHANDE_TRANSITION?.lenis ? window.CHANDE_TRANSITION.lenis.scrollTo(Math.max(0, y)) : scrollTo({ top: Math.max(0, y) })
        }
      } catch (err) {
        status.textContent = 'Could not send — please try again in a moment, or email kaixadesign@gmail.com.'
        status.classList.add('is-error')
        send.disabled = false
        console.warn('[form]', err)
      }
    })
  }

  window.CHANDE_FORM = { mount }
  mount(document)
  window.barba?.hooks?.afterEnter((data) => mount(data.next.container))
})()
