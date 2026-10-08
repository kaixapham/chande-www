/* =============================================================================
 * CHANDE — Chữ "giải mã code" + gạch chân khi hover ([data-scramble])
 * -----------------------------------------------------------------------------
 * Gắn data-scramble vào link / chữ nào thì khi rê chuột vào:
 *   • các ký tự biến thành ký hiệu code ngẫu nhiên rồi chốt dần về chữ thật từ
 *     trái sang phải (chỉ đổi text node, giữ nguyên thẻ con);
 *   • gạch chân 1px chạy trái -> phải (CSS bên dưới), rời chuột thì rút về phải.
 * Trong lúc chạy, phần tử giữ bề rộng lúc đầu (font không đều nét như Phudu thì ký
 * hiệu rộng / hẹp khác chữ thật) để không đẩy chữ xung quanh.
 *
 * Bắt sự kiện một lần ở document (pointerover) nên phần tử Barba thay vào sau vẫn
 * chạy, không cần mount lại. Giảm chuyển động: chỉ còn gạch chân.
 *
 * API: window.CHANDE_SCRAMBLE = { run(el, delay) }
 * ========================================================================== */
(() => {
  'use strict'

  const GLYPHS = '!<>-_\\/[]{}=+*^?#%&$01'
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  const style = document.createElement('style')
  style.textContent =
    // inline-block CỐ ĐỊNH (không đổi lúc chạy): đổi inline <-> inline-block giữa
    // chừng làm đáy hộp đổi -> gạch chân nhảy xuống.
    '[data-scramble]{display:inline-block; background:linear-gradient(currentColor, currentColor) right 100% / 0% .5px no-repeat;' +
    ' padding-bottom:2px; transition:background-size .45s cubic-bezier(.65,0,.35,1), color .25s, opacity .25s}' +
    '[data-scramble]:hover{background-size:100% .5px; background-position:left 100%}'
  document.head.appendChild(style)

  function textNodes(el) {
    const out = []
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    while (w.nextNode()) if (w.currentNode.nodeValue.trim()) out.push(w.currentNode)
    return out
  }

  function run(el, delay = 0) {
    if (reduced || !el) return
    if (!el._scr) el._scr = { nodes: textNodes(el) }
    const st = el._scr
    // chữ thật lấy một lần (lần hover sau giữa chừng vẫn trả về đúng chữ)
    st.orig ??= st.nodes.map((n) => n.nodeValue)
    const total = st.orig.reduce((a, t) => a + t.length, 0)
    if (!total) return
    cancelAnimationFrame(st.raf)
    if (!st.lock) {
      const w = el.getBoundingClientRect().width
      st.lock = { minWidth: el.style.minWidth }
      el.style.minWidth = `${w}px`
    }
    const t0 = performance.now() + delay
    const dur = 260 + total * 18
    const tick = (now) => {
      const k = Math.max(0, (now - t0) / dur)
      let seen = 0
      st.nodes.forEach((n, i) => {
        const src = st.orig[i]
        let out = ''
        for (let c = 0; c < src.length; c++, seen++) {
          const ch = src[c]
          out += ch === ' ' || seen < k * total ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]
        }
        n.nodeValue = out
      })
      if (k < 1) st.raf = requestAnimationFrame(tick)
      else {
        st.nodes.forEach((n, i) => (n.nodeValue = st.orig[i]))
        el.style.minWidth = st.lock.minWidth
        st.lock = null
      }
    }
    st.raf = requestAnimationFrame(tick)
  }

  document.addEventListener(
    'pointerover',
    (e) => {
      const el = e.target.closest?.('[data-scramble]')
      if (!el || el.contains(e.relatedTarget)) return
      run(el)
    },
    { passive: true },
  )

  window.CHANDE_SCRAMBLE = { run }
})()
