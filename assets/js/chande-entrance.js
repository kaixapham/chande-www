/* =============================================================================
 * CHANDE — Hero xuất hiện sau màn loading
 * -----------------------------------------------------------------------------
 * Lúc màn loading còn chạy (html.cl-loading) thì đặt sẵn ảnh / chữ của hero ở trạng
 * thái ẩn (nằm sau màn loading nên không ai thấy). Khi 'chande-loading:done':
 *   • ẢNH (4 ô người, mảng mosaic, khối tối, dải viên thuốc, ảnh recap): lộ từ dưới
 *     lên bằng clip-path (không transform — các module khác đo khung), lần lượt theo vị trí (trái -> phải,
 *     trên -> dưới).
 *   • CHỮ: tiêu đề trồi cả khối lên (giữ nguyên DOM); các cụm chữ nhỏ (logo, phụ
 *     đề, ©26, chữ giới thiệu, scroll more) trồi lên + lộ dần.
 *   • CỤM NEON (thanh tên dưới ảnh, nhãn video recap, thanh process, khối lime + nút
 *     menu trên thanh đầu trang): khối màu quét ra từ trái, chữ trong trồi lên sau.
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

  // mảng gạch neon (chande-field.js, vẽ WebGL chung một canvas — clip khung không ăn):
  // ẩn hết gạch từ đầu, loading xong thì cho từng viên bung ra
  window.CHANDE_FIELD_INTRO = 0
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)]
  // thứ tự xuất hiện theo vị trí trên màn
  const byPos = (els) =>
    els
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .sort((a, b) => a.r.left + a.r.top * 0.6 - (b.r.left + b.r.top * 0.6))
      .map((o) => o.el)

  // tiêu đề: KHÔNG tách DOM (tách dòng làm hỏng text-box trim / bố cục) — trồi cả khối
  const title = hero.querySelector('.hero__title')

  const imgs = byPos([
    ...$$('.hero__dark, .hero__pills', hero),
    ...$$('.hero-card__media', hero),
    ...$$('.hero__recap img', document),
  ])
  const texts = byPos([
    ...$$('.hero__mark, .hero__sub, .hero__year, .hero__scroll', hero),
    // cả khối chữ giới thiệu (chande-home.js nhân bản các <p> bên trong thành lớp sáng / tối)
    ...$$('.hero__intro-text', document),
  ])
  // cụm màu NEON: khối màu quét ra từ trái, chữ bên trong trồi lên theo sau
  const neon = byPos([...$$('.hero-card__cap, .hero__progress', hero), ...$$('.hero__recap figcaption', document)])
  const neonText = neon.flatMap((el) => [...el.children].filter((c) => c.tagName === 'SPAN' && !c.hasAttribute('data-hero-fill')))
  // khối neon trên thanh đầu trang thuộc màn loading -> chỉ quét lại lúc loading xong
  const barNeon = $$('.cl__fill, .cl__menu')

  const HIDE = 'inset(100% 0% 0% 0%)'
  const SHOW = 'inset(0% 0% 0% 0%)'
  // CHỈ clip-path, không transform: hero.js / field.js / mosaic đo các khung này bằng
  // getBoundingClientRect — phóng / dịch lúc đang đo là gạch mosaic vẽ sai cỡ, lệch chỗ
  gsap.set(imgs, { clipPath: HIDE })
  // khối chữ giới thiệu được chande-home.js đo (chia lớp sáng / tối) -> chỉ clip, không dịch
  const still = (el) => el.classList.contains('hero__intro-text')
  gsap.set(texts, { clipPath: 'inset(0% 0% 100% 0%)', yPercent: (i, el) => (still(el) ? 0 : 60) })
  if (title) gsap.set(title, { clipPath: 'inset(0% 0% 100% 0%)', yPercent: 35 })
  gsap.set(neon, { clipPath: 'inset(0% 100% 0% 0%)' })
  gsap.set(neonText, { yPercent: 110 })

  const play = () => {
    window.CHANDE_FIELD?.playIntro?.(1600)
    // màn loading giữ clip-path của các khối này bằng Web Animations (fill forwards) — style
    // inline bị đè, nên quét bằng .animate(): animation tạo sau nằm trên, xong thì tự gỡ.
    // Gọi ngay (không chờ delay của timeline) để không nháy một khung hiện đủ.
    barNeon.forEach((el, i) =>
      el.animate([{ clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)' }], {
        duration: 900,
        delay: i * 120,
        easing: 'cubic-bezier(.87,0,.13,1)',
        fill: 'backwards',
      }),
    )
    const tl = gsap.timeline({ delay: CONFIG.delay })
    tl.to(imgs, {
      clipPath: SHOW,
      duration: CONFIG.imgDur,
      ease: 'expo.inOut',
      stagger: CONFIG.imgStagger,
      clearProps: 'clipPath',
    }, 0)
    if (title)
      tl.to(title, {
        clipPath: 'inset(-10% 0% -10% 0%)',
        yPercent: 0,
        duration: CONFIG.textDur + 0.3,
        ease: 'expo.out',
        clearProps: 'clipPath,transform',
      }, 0.15)
    tl.to(texts, {
      clipPath: 'inset(0% 0% 0% 0%)',
      yPercent: 0,
      duration: CONFIG.textDur,
      ease: 'expo.out',
      stagger: CONFIG.textStagger,
      clearProps: 'clipPath,transform',
    }, 0.25)
    tl.to(neon, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: 0.9,
      ease: 'expo.inOut',
      stagger: 0.09,
    }, 0.35)
    tl.to(neonText, {
      yPercent: 0,
      duration: 0.7,
      ease: 'expo.out',
      stagger: 0.05,
      clearProps: 'transform',
    }, 0.85)
    // giữ khung cắt của khối neon tới khi chữ trong đã trồi xong (không lòi chữ ra ngoài)
    tl.set(neon, { clearProps: 'clipPath' })
  }
  document.addEventListener('chande-loading:done', play, { once: true })
})()
