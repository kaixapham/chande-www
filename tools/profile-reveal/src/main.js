/**
 * Profile Reveal — shape màu băng chéo qua khung ảnh để đổi sang người tiếp theo.
 * JS thuần + Vite, không framework. Panel bên phải dựng lại từ state ở mỗi thay đổi
 * cấu trúc; các slider chỉ ghi vào state rồi để vòng render tự vẽ khung kế tiếp.
 */

import {
  PRESETS, EASINGS, EASE_MODES, PALETTE,
  applyPreset, createState, ratioOf, syncColors,
} from './state.js'
import { sample, timing, formatMs, autoAngleFor, easeCurve } from './timeline.js'
import { drawScene } from './render.js'
import { loadPhotoRecords, storePhoto, ensureStored, makeSamplePhotos, photoFromFile } from './photos.js'
import { makeTab, nextTabName, readTabs, writeTabs, migrateLegacy } from './tabs.js'
import { recordVideo, snapshot, download, supportedFormats, exportSize } from './export.js'
import * as ui from './ui.js'

const $ = (id) => document.getElementById(id)

const view = $('view')
const ctx = view.getContext('2d')
const stageEl = $('stage')
const panelBody = $('panel-body')
const libraryList = $('library-list')
const fileInput = $('file-input')
const scrub = $('scrub')
const scrubLabel = $('scrub-label')

let tabs = []
let activeTab = 0
let bound = false        // `state`/`photos` đã trỏ vào một tab thật hay chưa
let state = createState()
let photos = []
let selected = 0
let playing = true
let clock = 0
let lastTs = 0
let cycleNote = null
let presetControl = null
let exportControl = null

/* ------------------------------------------------------------------ helpers */

function toast(message, tone = 'warn') {
  const node = $('toast')
  node.textContent = message
  node.dataset.tone = tone
  node.hidden = false
  clearTimeout(toast.timer)
  toast.timer = setTimeout(() => { node.hidden = true }, 3200)
}

function commit({ rebuild = false, custom = false } = {}) {
  if (custom && state.motion.preset !== 'custom') {
    state.motion.preset = 'custom'
    if (presetControl) presetControl.setValue('custom')
  }
  persist()
  if (rebuild) buildPanel()
  refreshNotes()
}

function refreshNotes() {
  if (!cycleNote) return
  const T = timing(state, photos.length)
  cycleNote.textContent =
    `Một lượt đổi người: ${formatMs(T.lead)} chờ + ${formatMs(T.anim)} chạy + ` +
    `${formatMs(T.hold)} nghỉ = ${formatMs(T.cycle)}. Hết ${photos.length} ảnh: ${formatMs(T.total)}.`
  if (T.flow === 'train') {
    cycleNote.textContent +=
      ` Nhịp: ảnh đứng sạch → ${formatMs(T.legIn)} shape ùa ra → ${formatMs(T.cover)} giữ lớp` +
      ` → ${formatMs(T.legOut)} quét đi lộ ảnh mới.`
  }
}

/* ------------------------------------------------------------------- canvas */

function layout() {
  const box = stageEl.getBoundingClientRect()
  const [rw, rh] = ratioOf(state)
  const scale = Math.min(box.width / rw, box.height / rh)
  const w = Math.max(40, Math.floor(rw * scale))
  const h = Math.max(40, Math.floor(rh * scale))
  view.style.width = `${w}px`
  view.style.height = `${h}px`
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  view.width = Math.round(w * dpr)
  view.height = Math.round(h * dpr)
}

function drawPreview() {
  if (!photos.length) return
  const W = view.width
  const H = view.height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  drawScene(ctx, W, H, sample(state, clock, W, H, photos.length), photos, state)
}

function tick(ts) {
  const dt = lastTs ? Math.min(ts - lastTs, 100) : 0
  lastTs = ts
  if (playing && photos.length) {
    const T = timing(state, photos.length)
    clock = (clock + dt) % T.total
    syncScrub()
  }
  // Lúc quay video thì nhường hẳn nhịp rAF cho canvas offscreen — MediaRecorder
  // đóng dấu thời gian theo đồng hồ thật, vẽ tranh nhau là video bị giật.
  if (!exportControl) drawPreview()
  requestAnimationFrame(tick)
}

function syncScrub() {
  const T = timing(state, photos.length)
  scrub.value = String(clock / T.total)
  scrubLabel.textContent = `${formatMs(clock)} / ${formatMs(T.total)}`
}

function setPlaying(next) {
  playing = next
  $('play').toggleAttribute('data-on', playing)
  $('play').title = playing ? 'Dừng (Space)' : 'Phát (Space)'
}

/* ------------------------------------------------------------------ thư viện */

function buildLibrary() {
  libraryList.replaceChildren()
  photos.forEach((photo, index) => {
    const item = ui.el('div', { className: 'library-item', draggable: true })
    item.toggleAttribute('data-on', index === selected)
    item.dataset.index = String(index)
    item.append(
      ui.el('span', { className: 'library-order', textContent: String(index + 1) }),
      ui.el('img', { className: 'library-thumb', src: photo.src, alt: photo.name, draggable: false }),
      ui.el('span', { className: 'library-name', textContent: photo.name }),
    )
    const remove = ui.iconButton(
      '<svg viewBox="0 0 16 16" width="11" height="11"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
      'Xoá ảnh',
      (e) => { e.stopPropagation(); removePhoto(index) },
    )
    remove.classList.add('library-remove')
    item.append(remove)

    item.addEventListener('click', () => { selected = index; buildLibrary(); buildPanel() })
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', String(index))
      item.classList.add('dragging')
    })
    item.addEventListener('dragend', () => item.classList.remove('dragging'))
    item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drop-target') })
    item.addEventListener('dragleave', () => item.classList.remove('drop-target'))
    item.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      item.classList.remove('drop-target')
      const from = parseInt(e.dataTransfer.getData('text/plain'), 10)
      if (!Number.isInteger(from) || from === index) return
      const [moved] = photos.splice(from, 1)
      photos.splice(index, 0, moved)
      selected = index
      persist()
      layout()
      buildLibrary()
      buildPanel()
    })

    libraryList.append(item)
  })
}

async function addFiles(files) {
  const list = [...files].filter((f) => f.type.startsWith('image/'))
  if (!list.length) return
  const added = []
  for (const file of list) {
    try { added.push(await photoFromFile(file)) } catch (err) { toast(err.message) }
  }
  if (!added.length) return
  for (const photo of added) {
    try { await storePhoto(photo) } catch { toast(`Không lưu được "${photo.name}" vào kho ảnh`) }
  }
  if (photos.every((p) => p.placeholder)) photos = added
  else photos.push(...added)
  selected = photos.length - 1
  persist()
  layout()
  renderTabs()
  buildLibrary()
  buildPanel()
  refreshNotes()
}

async function removePhoto(index) {
  photos.splice(index, 1)
  if (!photos.length) photos = await makeSamplePhotos()
  selected = Math.min(selected, photos.length - 1)
  clock = 0
  persist()
  layout()
  renderTabs()
  buildLibrary()
  buildPanel()
  refreshNotes()
}

/* --------------------------------------------------------------------- tab */

/** Ghi toàn bộ cây tab. Mọi thay đổi thiết lập hay ảnh đều đi qua đây. */
function persist() {
  if (bound && tabs[activeTab]) {
    tabs[activeTab].settings = state
    tabs[activeTab].photos = photos
  }
  writeTabs(tabs, activeTab)
}

/** Dựng danh sách ảnh thật của một tab từ metadata đã lưu. */
async function hydrate(tab) {
  if (tab.hydrated) return tab
  tab.photos = await loadPhotoRecords(tab.records)
  if (!tab.photos.length) tab.photos = await makeSamplePhotos()
  tab.hydrated = true
  return tab
}

async function openTab(index, { silent = false } = {}) {
  if (index < 0 || index >= tabs.length) return
  // Chỉ trả `state`/`photos` về tab cũ khi chúng ĐANG thật sự thuộc về tab đó. Lúc mới
  // khởi động chúng còn rỗng, ghi ngược lại là xoá trắng tab vừa nạp xong.
  if (bound && tabs[activeTab]) {
    tabs[activeTab].settings = state
    tabs[activeTab].photos = photos
  }
  activeTab = index
  const tab = tabs[index]
  await hydrate(tab)
  state = tab.settings
  photos = tab.photos
  syncColors(state)
  selected = 0
  clock = 0
  layout()
  renderTabs()
  buildLibrary()
  buildPanel()
  bound = true
  syncScrub()
  if (!silent) persist()
}

async function addTab() {
  const tab = makeTab(nextTabName(tabs))
  tab.photos = await makeSamplePhotos()
  tab.hydrated = true
  tabs.push(tab)
  await openTab(tabs.length - 1)
  toast(`Đã thêm "${tab.name}" — thả ảnh vào để thay ảnh mẫu`, 'ok')
}

async function closeTab(index) {
  if (tabs.length <= 1) return
  const [gone] = tabs.splice(index, 1)
  const next = Math.min(index, tabs.length - 1)
  activeTab = next < 0 ? 0 : next
  // openTab đọc tabs[activeTab] hiện tại làm "tab cũ" nên phải cắt liên kết trước.
  bound = false
  await openTab(activeTab)
  toast(`Đã xoá "${gone.name}"`, 'ok')
}

function renderTabs() {
  const list = $('tablist')
  list.replaceChildren()
  tabs.forEach((tab, index) => {
    const node = ui.el('div', { className: 'tab' })
    node.toggleAttribute('data-on', index === activeTab)
    node.toggleAttribute('data-solo', tabs.length === 1)

    const name = ui.el('span', { className: 'tab-name', textContent: tab.name })
    const real = tab.photos.filter((p) => !p.placeholder).length
    const count = ui.el('span', {
      className: 'tab-count',
      textContent: tab.photos.length ? `${real || tab.photos.length}${real ? '' : ' mẫu'}` : '…',
    })

    // Nhấp đúp để đổi tên ngay tại chỗ — không cần hộp thoại.
    name.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      name.contentEditable = 'true'
      name.focus()
      getSelection().selectAllChildren(name)
    })
    const commitName = () => {
      name.contentEditable = 'false'
      const next = name.textContent.trim()
      tab.name = next || tab.name
      name.textContent = tab.name
      persist()
    }
    name.addEventListener('blur', commitName)
    name.addEventListener('keydown', (e) => {
      e.stopPropagation()
      if (e.key === 'Enter') { e.preventDefault(); name.blur() }
      if (e.key === 'Escape') { name.textContent = tab.name; name.blur() }
    })

    const close = ui.iconButton(
      '<svg viewBox="0 0 16 16" width="9" height="9"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
      `Xoá "${tab.name}"`,
      (e) => { e.stopPropagation(); closeTab(index) },
    )
    close.className = 'tab-close'

    node.append(name, count, close)
    node.addEventListener('click', () => { if (index !== activeTab) openTab(index) })
    list.append(node)
  })
}

/* -------------------------------------------------------------------- panel */

function buildPanel() {
  panelBody.replaceChildren(
    frameSection(),
    photoSection(),
    shapeSection(),
    motionSection(),
    timingSection(),
    outputSection(),
  )
  refreshNotes()
}

function frameSection() {
  const box = ui.section('Khung')
  box.append(
    ui.field('Tỉ lệ ảnh', ui.segmented({
      options: [
        ['6:7', '6:7', 'Tỉ lệ đo từ ảnh mẫu bạn gửi (232×271 → 0.856)'],
        ['1:1', '1:1'],
        ['3:4', '3:4'],
        ['custom', 'Tuỳ chỉnh'],
      ],
      value: state.frame.ratio,
      onChange: (v) => { state.frame.ratio = v; layout(); commit({ rebuild: true }) },
    })),
  )

  if (state.frame.ratio === '6:7') {
    box.append(ui.note('6:7 = 0.857 — đo từ ảnh mẫu bạn gửi (232×271 = 0.856). Muốn khớp tuyệt đối thì dùng Tuỳ chỉnh với 232 × 271.'))
  }

  if (state.frame.ratio === 'custom') {
    const row = ui.el('div', { className: 'row2' }, [
      ui.numberField({ label: 'Rộng', min: 1, max: 100, step: 1, value: state.frame.cw,
        onInput: (v) => { state.frame.cw = v; layout(); commit() } }),
      ui.numberField({ label: 'Cao', min: 1, max: 100, step: 1, value: state.frame.ch,
        onInput: (v) => { state.frame.ch = v; layout(); commit() } }),
    ])
    box.append(row)
    const chips = ui.el('div', { className: 'chip-row' })
    for (const [label, w, h] of [['4:5', 4, 5], ['9:16', 9, 16], ['16:9', 16, 9], ['2:3', 2, 3]]) {
      chips.append(ui.button(label, () => {
        state.frame.cw = w
        state.frame.ch = h
        layout()
        commit({ rebuild: true })
      }))
    }
    box.append(chips)
  }

  box.append(ui.colorField({
    label: 'Nền khung',
    value: state.frame.bg,
    onInput: (v) => { state.frame.bg = v; commit() },
  }))
  return box
}

function photoSection() {
  const add = ui.button('Thêm', () => fileInput.click())
  add.classList.add('mini')
  const box = ui.section('Ảnh', add)

  const real = photos.filter((p) => !p.placeholder).length
  box.append(ui.note(real
    ? `${photos.length} ảnh — thứ tự chạy đúng như cột bên trái, kéo thả để đổi chỗ.`
    : `Đang dùng ${photos.length} ảnh mẫu. Thả ảnh thật vào để thay hết.`))

  const zone = ui.el('div', { className: 'dropzone' }, [
    ui.el('b', { textContent: 'Thả ảnh vào đây' }),
    ui.el('span', { textContent: 'hoặc bấm để chọn nhiều file' }),
  ])
  zone.addEventListener('click', () => fileInput.click())
  box.append(zone)

  const photo = photos[selected]
  if (photo) {
    const head = ui.el('div', { className: 'cluster-head' }, [
      ui.el('strong', { textContent: photo.name }),
      ui.el('span', { textContent: `#${selected + 1}` }),
    ])
    const group = ui.el('div', { className: 'cluster' }, [head])
    group.append(
      ui.slider({ label: 'Phóng to', min: 1, max: 2.5, step: 0.01, value: photo.zoom,
        format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => { photo.zoom = v; persist() } }),
      ui.slider({ label: 'Đẩy ngang', min: -1, max: 1, step: 0.01, value: photo.fx,
        format: (v) => v.toFixed(2),
        onInput: (v) => { photo.fx = v; persist() } }),
      ui.slider({ label: 'Đẩy dọc', min: -1, max: 1, step: 0.01, value: photo.fy,
        format: (v) => v.toFixed(2),
        onInput: (v) => { photo.fy = v; persist() } }),
    )
    const actions = ui.el('div', { className: 'btn-row' }, [
      ui.button('Đặt lại khung', () => {
        photo.zoom = 1; photo.fx = 0; photo.fy = 0
        persist()
        buildPanel()
      }),
      ui.button('Xoá ảnh', () => removePhoto(selected)),
    ])
    group.append(actions)
    box.append(group)
  }
  return box
}

function shapeSection() {
  const box = ui.section('Shape')
  box.append(ui.note('Shape luôn cùng tỉ lệ với khung, nên lúc đi ngang qua tâm nó che kín ảnh — đó chính là điểm đổi người.'))

  box.append(ui.slider({
    label: 'Số lượng shape', min: 1, max: 6, step: 1, value: state.shapes.count,
    format: (v) => `${v}`,
    onInput: (v) => { state.shapes.count = v; syncColors(state); commit({ rebuild: true }) },
  }))

  const list = ui.el('div', { className: 'shape-list' })
  for (let k = 0; k < state.shapes.count; k++) {
    const row = ui.el('div', { className: 'shape-row' }, [
      ui.el('span', { className: 'shape-index', textContent: String(k + 1) }),
      ui.colorControl({
        value: state.shapes.colors[k] || PALETTE[k % PALETTE.length],
        onInput: (v) => { state.shapes.colors[k] = v; commit() },
      }),
    ])
    list.append(row)
  }
  box.append(ui.field('Màu từng shape', list))

  box.append(
    ui.slider({ label: 'Độ đục', min: 0.2, max: 1, step: 0.01, value: state.shapes.opacity,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { state.shapes.opacity = v; commit() } }),
    ui.slider({ label: 'Bo góc', min: 0, max: 50, step: 1, value: state.shapes.radius,
      format: (v) => `${v}%`,
      onInput: (v) => { state.shapes.radius = v; commit({ custom: true }) } }),
  )
  if (state.motion.flow === 'train') {
    box.append(ui.note('Kiểu chạy "Đồng loạt": mỗi lớp là một khối bám góc và chỉ phình ra, phủ tới đâu ở lại tới đó — nên không có khe hở. Vì thế cỡ shape, giãn dần và xoay không dùng ở đây; muốn đổi bố cục thì chỉnh "Hở giữa hai lớp".'))
    return box
  }

  box.append(
    ui.slider({ label: 'Cỡ shape', min: 0.6, max: 2, step: 0.01, value: state.shapes.scale,
      format: (v) => `${v.toFixed(2)}×`,
      onInput: (v) => { state.shapes.scale = v; commit() } }),
    ui.slider({ label: 'Giãn dần theo thứ tự', min: -0.2, max: 0.4, step: 0.01, value: state.shapes.scaleStep,
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`,
      onInput: (v) => { state.shapes.scaleStep = v; commit({ custom: true }) } }),
    ui.switchRow({ label: 'Shape đi trước nằm trên', checked: state.shapes.topFirst,
      onChange: (v) => { state.shapes.topFirst = v; commit() } }),
  )
  if (state.shapes.scale < 1 || state.shapes.scale + state.shapes.scaleStep * (state.shapes.count - 1) < 1) {
    box.append(ui.note('⚠︎ Shape nhỏ hơn khung sẽ không che kín — sẽ thấy ảnh nhảy lúc đổi người.'))
  }
  return box
}

function curvePreview(kind, mode) {
  const points = []
  for (let i = 0; i <= 28; i++) {
    const x = i / 28
    const y = easeCurve(kind, mode, x)
    points.push(`${(3 + x * 20).toFixed(2)},${(23 - y * 20).toFixed(2)}`)
  }
  const node = ui.el('span', { className: 'curve' })
  node.innerHTML = `<svg viewBox="0 0 26 26" width="26" height="26" aria-hidden="true">` +
    `<path d="M3 23H23M3 23V3" fill="none" stroke="currentColor" stroke-opacity="0.2" stroke-width="1"/>` +
    `<polyline points="${points.join(' ')}" fill="none" stroke="currentColor" stroke-width="1.4" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></svg>`
  return node
}

function motionSection() {
  const box = ui.section('Chuyển động')
  const train = state.motion.flow === 'train'

  presetControl = ui.select({
    options: Object.entries(PRESETS).map(([key, p]) => [key, p.label]),
    value: state.motion.preset,
    onChange: (v) => { applyPreset(state, v); syncColors(state); commit({ rebuild: true }) },
  })
  box.append(ui.field('Preset', presetControl))

  box.append(ui.field('Kiểu chạy', ui.segmented({
    options: [['chase', 'Nối đuôi', 'Từng shape một, ảnh đổi lúc shape cuối che kín'],
              ['train', 'Đồng loạt', 'Cả đoàn trượt cùng lúc, ảnh mới là lớp trong cùng']],
    value: state.motion.flow,
    onChange: (v) => {
      state.motion.flow = v
      if (v === 'train') state.shapes.topFirst = false
      clock = 0
      commit({ rebuild: true, custom: true })
    },
  })))
  box.append(ui.note(train
    ? 'Cả loạt shape cùng ùa ra từ góc thành các lớp lồng nhau, lớp sau đè lên lớp trước; ảnh người kế tiếp là toa cuối nên quét hết lượt là ảnh mới hiện ra và đứng sạch.'
    : 'Từng shape băng qua khung rồi tới shape kế tiếp; ảnh đổi đúng lúc shape cuối che kín khung.'))

  /* Easing: họ đường cong × chiều — ghép lại ra đúng danh sách của Figma. */
  const family = ui.select({
    options: EASINGS, value: state.motion.easing,
    onChange: (v) => { state.motion.easing = v; redrawCurve(); commit({ custom: true }) },
  })
  const mode = ui.select({
    options: EASE_MODES, value: state.motion.easeMode,
    onChange: (v) => { state.motion.easeMode = v; redrawCurve(); commit({ custom: true }) },
  })
  let preview = curvePreview(state.motion.easing, state.motion.easeMode)
  const redrawCurve = () => {
    const next = curvePreview(state.motion.easing, state.motion.easeMode)
    preview.replaceWith(next)
    preview = next
  }
  box.append(
    ui.field('Nhịp easing', ui.el('div', { className: 'ease-row' }, [mode, preview])),
    ui.field('Đường cong', family),
  )

  box.append(ui.switchRow({
    label: 'Bay đúng đường chéo khung',
    checked: state.motion.autoAngle,
    onChange: (v) => {
      state.motion.autoAngle = v
      if (!v) state.motion.angle = Math.round(autoAngleFor(view.width, view.height))
      commit({ rebuild: true, custom: true })
    },
  }))

  if (!state.motion.autoAngle) {
    box.append(ui.slider({
      label: 'Hướng bay', min: 0, max: 359, step: 1, value: state.motion.angle,
      format: (v) => `${v}° ${arrowFor(v)}`,
      onInput: (v) => { state.motion.angle = v; commit({ custom: true }) },
    }))
  }

  if (!train) {
    box.append(
      ui.slider({ label: 'Xoay khi bay', min: 0, max: 20, step: 0.5, value: state.motion.rotate,
        format: (v) => `±${v}°`,
        onInput: (v) => { state.motion.rotate = v; commit({ custom: true }) } }),
      ui.slider({ label: 'Quãng đường', min: 0.6, max: 2, step: 0.01, value: state.motion.travel,
        format: (v) => `${v.toFixed(2)}×`,
        onInput: (v) => { state.motion.travel = v; commit({ custom: true }) } }),
    )
  }

  if (train) {
    box.append(
      ui.slider({ label: 'Hở giữa hai lớp', min: 0.1, max: 0.9, step: 0.01, value: state.motion.gap,
        format: (v) => v.toFixed(2),
        onInput: (v) => { state.motion.gap = v; commit({ custom: true }) } }),
      ui.slider({ label: 'Dồn dần về sau', min: 0.4, max: 1, step: 0.01, value: state.motion.gapFalloff,
        format: (v) => (v >= 0.995 ? 'đều' : `${v.toFixed(2)}×`),
        onInput: (v) => { state.motion.gapFalloff = v; commit({ custom: true }) } }),
      ui.field('Ảnh mới trong lớp cuối', ui.segmented({
        options: [['scale', 'Thu nhỏ', 'Cả tấm ảnh thu nhỏ vừa ô rồi lớn dần'],
                  ['crop', 'Lộ dần', 'Ảnh đứng yên, ô cửa mở rộng dần']],
        value: state.motion.carFit,
        onChange: (v) => { state.motion.carFit = v; commit({ custom: true }) },
      })),
    )
  } else {
    box.append(ui.switchRow({ label: 'Đảo chiều xen kẽ', checked: state.motion.alternate,
      onChange: (v) => { state.motion.alternate = v; commit({ custom: true }) } }))
  }
  return box
}

function arrowFor(deg) {
  const arrows = ['→', '↗', '↑', '↖', '←', '↙', '↓', '↘']
  return arrows[Math.round(((deg % 360) + 360) % 360 / 45) % 8]
}

function timingSection() {
  const box = ui.section('Nhịp & tốc độ')
  cycleNote = ui.note('')
  box.append(cycleNote)

  box.append(
    ui.slider({ label: 'Tốc độ tổng', min: 0.25, max: 3, step: 0.05, value: state.timing.speed,
      format: (v) => `${v.toFixed(2)}×`,
      onInput: (v) => { state.timing.speed = v; commit() } }),
    ui.slider({
      label: state.motion.flow === 'train' ? 'Thời lượng một lớp' : 'Thời lượng mỗi shape',
      min: 200, max: 2500, step: 10, value: state.timing.duration,
      format: (v) => `${Math.round(v)}ms`,
      onInput: (v) => { state.timing.duration = v; commit() } }),
  )
  if (state.motion.flow !== 'train') {
    box.append(ui.slider({ label: 'Lệch giữa các shape', min: 0, max: 1.2, step: 0.01, value: state.timing.stagger,
      format: (v) => `${Math.round(v * 100)}% thời lượng`,
      onInput: (v) => { state.timing.stagger = v; commit({ custom: true }) } }))
  }
  box.append(ui.slider({
    label: state.motion.flow === 'train' ? 'Giữ lúc xếp lớp' : 'Giữ lúc che kín',
    min: 0, max: 1200, step: 10, value: state.timing.coverHold,
    format: (v) => `${Math.round(v)}ms`,
    onInput: (v) => { state.timing.coverHold = v; commit({ custom: true }) },
  }))
  box.append(
    ui.slider({ label: 'Chờ trước khi chạy', min: 0, max: 5000, step: 50, value: state.timing.lead,
      format: (v) => `${Math.round(v)}ms`,
      onInput: (v) => { state.timing.lead = v; commit() } }),
    ui.slider({ label: 'Nghỉ trước người kế tiếp', min: 0, max: 5000, step: 50, value: state.timing.hold,
      format: (v) => `${Math.round(v)}ms`,
      onInput: (v) => { state.timing.hold = v; commit() } }),
    ui.slider({ label: 'Ảnh trôi theo', min: 0, max: 0.2, step: 0.005, value: state.timing.parallax,
      format: (v) => `${Math.round(v * 100)}%`,
      onInput: (v) => { state.timing.parallax = v; commit() } }),
  )
  return box
}

function outputSection() {
  const box = ui.section('Xuất video')
  const formats = supportedFormats()
  const [rw, rh] = ratioOf(state)
  const size = exportSize(state, [rw, rh], state.output.width)
  const T = timing(state, photos.length)

  box.append(ui.note(
    `${size.W}×${size.H}px · ${formatMs(T.total * state.output.loops)} · quay theo thời gian thực.`,
  ))

  box.append(
    ui.field('Bề ngang', ui.select({
      options: [['720', '720px'], ['1080', '1080px'], ['1440', '1440px'], ['2160', '2160px']],
      value: String(state.output.width),
      onChange: (v) => { state.output.width = parseInt(v, 10); commit({ rebuild: true }) },
    })),
    ui.field('Khung hình/giây', ui.segmented({
      options: [['24', '24'], ['30', '30'], ['60', '60']],
      value: String(state.output.fps),
      onChange: (v) => { state.output.fps = parseInt(v, 10); commit() },
    })),
    ui.field('Chất lượng', ui.segmented({
      options: [['medium', 'Vừa'], ['high', 'Cao'], ['max', 'Rất cao']],
      value: state.output.quality,
      onChange: (v) => { state.output.quality = v; commit() },
    })),
    ui.slider({ label: 'Số vòng', min: 1, max: 4, step: 1, value: state.output.loops,
      format: (v) => `${v} vòng`,
      onInput: (v) => { state.output.loops = v; commit({ rebuild: true }) } }),
  )

  if (!formats.length) {
    box.append(ui.note('⚠︎ Trình duyệt này không quay được video. Dùng Chrome hoặc Edge.'))
  } else {
    box.append(ui.note(`Định dạng: ${formats[0].ext.toUpperCase()} (${formats.map((f) => f.ext).join(', ')} khả dụng).`))
  }
  return box
}

/* -------------------------------------------------------------------- xuất */

async function runExport() {
  if (exportControl) return
  const formats = supportedFormats()
  if (!formats.length) { toast('Trình duyệt không hỗ trợ quay video'); return }

  const overlay = $('export-overlay')
  const fill = $('export-fill')
  const wasPlaying = playing
  setPlaying(false)
  exportControl = { cancelled: false }
  overlay.hidden = false
  fill.style.width = '0%'
  $('export-title').textContent = 'Đang quay video…'

  try {
    const { blob, ext } = await recordVideo({
      state,
      photos,
      ratio: ratioOf(state),
      width: state.output.width,
      fps: state.output.fps,
      quality: state.output.quality,
      loops: state.output.loops,
      format: formats[0],
      control: exportControl,
      onProgress: (p) => { fill.style.width = `${Math.round(p * 100)}%` },
    })
    download(blob, `profile-reveal-${Date.now()}.${ext}`)
    toast('Đã xuất video', 'ok')
  } catch (err) {
    if (err.message !== 'cancelled') toast(err.message || 'Xuất video thất bại')
  } finally {
    overlay.hidden = true
    exportControl = null
    setPlaying(wasPlaying)
  }
}

async function saveFrame() {
  const blob = await snapshot({
    state, photos, ratio: ratioOf(state), width: state.output.width, time: clock,
  })
  if (blob) { download(blob, `profile-reveal-${Date.now()}.png`); toast('Đã lưu ảnh PNG', 'ok') }
}

/* ------------------------------------------------------------------- events */

$('play').addEventListener('click', () => setPlaying(!playing))
$('restart').addEventListener('click', () => { clock = 0; syncScrub(); setPlaying(true) })
scrub.addEventListener('input', () => {
  setPlaying(false)
  clock = parseFloat(scrub.value) * timing(state, photos.length).total
  scrubLabel.textContent = `${formatMs(clock)} / ${formatMs(timing(state, photos.length).total)}`
})
$('library-add').addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = '' })
$('do-export').addEventListener('click', runExport)
$('save-frame').addEventListener('click', saveFrame)
$('export-cancel').addEventListener('click', () => { if (exportControl) exportControl.cancelled = true })
$('reset-all').addEventListener('click', () => {
  state = createState()
  tabs[activeTab].settings = state    // chỉ đưa TAB ĐANG MỞ về mặc định, tab khác giữ nguyên
  persist()
  clock = 0
  layout()
  buildPanel()
  toast(`Đã đưa "${tabs[activeTab].name}" về mặc định`, 'ok')
})
$('tab-add').addEventListener('click', addTab)

window.addEventListener('resize', layout)

let dragDepth = 0
window.addEventListener('dragover', (e) => { e.preventDefault() })
window.addEventListener('dragenter', (e) => {
  if (![...(e.dataTransfer?.types || [])].includes('Files')) return
  dragDepth++
  $('drop-hint').hidden = false
})
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1)
  if (!dragDepth) $('drop-hint').hidden = true
})
window.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  $('drop-hint').hidden = true
  if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
})

window.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea, select')) return
  if (e.code === 'Space') { e.preventDefault(); setPlaying(!playing) }
  if (e.key === 'r' || e.key === 'R') { clock = 0; syncScrub() }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    setPlaying(false)
    const step = (e.shiftKey ? 200 : 40) * (e.key === 'ArrowRight' ? 1 : -1)
    const total = timing(state, photos.length).total
    clock = ((clock + step) % total + total) % total
    syncScrub()
  }
})

/* --------------------------------------------------------------------- boot */

async function boot() {
  const stored = readTabs() || (await migrateLegacy())
  tabs = stored ? stored.tabs : [makeTab('Bộ 1')]
  activeTab = stored ? stored.active : 0

  // Nạp ảnh cho tab đang mở trước để vào việc được ngay; các tab kia nạp nền phía sau.
  await hydrate(tabs[activeTab])
  await openTab(activeTab, { silent: true })
  setPlaying(true)
  requestAnimationFrame(tick)

  for (let i = 0; i < tabs.length; i++) {
    if (i === activeTab) continue
    await hydrate(tabs[i])
    renderTabs()
  }

  // Mọi tab đã nạp: soát lại kho, ảnh nào hụt thì ghi bổ sung rồi lưu lại metadata.
  let repaired = 0
  const failed = []
  for (const tab of tabs) {
    const report = await ensureStored(tab.photos)
    repaired += report.repaired
    failed.push(...report.failed)
  }
  persist()
  if (repaired) toast(`Đã lưu bổ sung ${repaired} ảnh vào kho`, 'ok')
  if (failed.length) toast(`Không lưu được: ${failed.join(', ')}`)
}

boot()
