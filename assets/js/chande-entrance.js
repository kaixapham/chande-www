/* =============================================================================
 * CHANDE — Hero xuất hiện sau màn loading
 * -----------------------------------------------------------------------------
 * Lúc màn loading còn chạy (html.cl-loading) thì đặt sẵn ảnh / chữ của hero ở trạng
 * thái ẩn (nằm sau màn loading nên không ai thấy). Khi 'chande-loading:done':
 *   • ẢNH (4 ô người, mảng mosaic, khối tối, dải viên thuốc, ảnh recap): lộ từ dưới
 *     lên bằng clip-path + phóng nhẹ 1.1 -> 1, lần lượt theo vị trí (trái -> phải,
 *     trên -> dưới).
 *   • CHỮ: tiêu đề tách từng dòng trồi lên trong mặt nạ; các cụm chữ nhỏ (logo, phụ
 *     đề, ©26, tên dưới ảnh, chữ giới thiệu, scroll more) trồi lên + lộ dần.
 * Xong thì gỡ hết style tạm (clearProps) để không vướng hero.js / mosaic / reveal.
 * Không có màn loading (vào bằng Barba, trang khác) thì không chạy.
 *
 * API: window.CHANDE_ENTRANCE = { config }
 * ========================================================================== */
;(() => {
  'use strict'

  const CONFIG = {
    delay: 0.05, // s sau khi loading xong
    imgDur: 1.25,
    imgStagger: 0.07,
    textDur: 0.9,
    textStagger: 0.05,
  }
  window.CHANDE_SETTINGS_APPLY?.('entrance', CONFIG)
  window.CHANDE_ENTRANCE = { config: CONFIG }

  const gsap = window.gsap
  const root = document.documentElement
  const hero = document.querySelector('.hero')
  if (!gsap || !hero || !root.classList.contains('cl-loading')) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return

  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)]
  // thứ tự xuất hiện theo vị trí trên màn
  const byPos = (els) =>
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left + a.r.top * 0.6 - (b.r.left + b.r.top * 0.6))
      .map((o) => o.el)

  // tiêu đề: tách theo <br> thành dòng, mỗi dòng một mặt nạ
  const title = hero.querySelector('.hero__title')
  let lines = []
  if (title && !title.dataset.entSplit) {
    const parts = title.innerHTML.split(/<br\s*\/?>/i)
    title.innerHTML = parts
      .map((p) => `<span class="ent-line" style="display:block; overflow:clip; overflow-clip-margin:.12em"><span style="display:block">${p}</span></span>`)
      .join('')
    title.dataset.entSplit = '1'
    lines = $$('.ent-line > span', title)
  }

  const imgs = byPos([
    ...$$('.hero__field, .hero__dark, .hero__pills', hero),
    ...$$('.hero-card__media', hero),
    ...$$('.hero__recap img', document),
  ])
  const texts = byPos([
    ...$$('.hero__mark, .hero__sub, .hero__year, .hero-card__cap, .hero__scroll, .hero__progress', hero),
    // cả khối chữ giới thiệu (chande-home.js nhân bản các <p> bên trong thành lớp sáng / tối)
    ...$$('.hero__intro-text, .hero__recap figcaption', document),
  ])

  const HIDE = 'inset(100% 0% 0% 0%)'
  const SHOW = 'inset(0% 0% 0% 0%)'
  // ô ảnh người: hero.js đo khung này -> chỉ clip, không phóng
  const noScale = (el) => el.classList.contains('hero-card__media')
  gsap.set(imgs, { clipPath: HIDE, scale: (i, el) => (noScale(el) ? 1 : 1.1), transformOrigin: '50% 100%' })
  gsap.set(texts, { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 60 })
  gsap.set(lines, { yPercent: 110 })

  const play = () => {
    const tl = gsap.timeline({ delay: CONFIG.delay })
    tl.to(imgs, {
      clipPath: SHOW,
      scale: 1,
      duration: CONFIG.imgDur,
      ease: 'expo.out',
      stagger: CONFIG.imgStagger,
      clearProps: 'clipPath,scale,transform,transformOrigin',
    }, 0)
    tl.to(lines, {
      yPercent: 0,
      duration: CONFIG.textDur + 0.2,
      ease: 'expo.out',
      stagger: 0.08,
      clearProps: 'transform',
    }, 0.15)
    tl.to(texts, {
      clipPath: 'inset(0% 0% 0% 0%)',
      yPercent: 0,
      duration: CONFIG.textDur,
      ease: 'expo.out',
      stagger: CONFIG.textStagger,
      clearProps: 'clipPath,transform',
    }, 0.25)
  }
  document.addEventListener('chande-loading:done', play, { once: true })
})()
