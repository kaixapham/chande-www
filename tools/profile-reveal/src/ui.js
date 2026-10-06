/**
 * Primitive dựng panel, bám ngôn ngữ Toolcraft: nhãn nằm trên control, control cao 28px
 * bo 8px trên nền trắng 5% viền trắng 12%, slider là sợi 1px với con trượt vuông 9px,
 * nút chính nền trắng chữ đen. DOM thuần, không framework.
 */

export const el = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props)
  for (const child of [].concat(children)) if (child || child === 0) node.append(child)
  return node
}

export function section(title, action) {
  const head = el('div', { className: 'section-head' }, [el('h3', { textContent: title })])
  if (action) head.append(action)
  return el('section', { className: 'section' }, [head])
}

export function note(text) {
  return el('p', { className: 'note', textContent: text })
}

export function field(label, control) {
  return el('div', { className: 'field' }, [
    label ? el('label', { className: 'field-label', textContent: label }) : null,
    control,
  ])
}

export function slider({ label, min, max, step = 0.01, value, format = String, onInput }) {
  const output = el('output', { textContent: format(value) })
  const input = el('input', { className: 'range', type: 'range', min, max, step, value })
  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    output.textContent = format(v)
    onInput(v)
  })
  const row = el('div', { className: 'field' }, [
    el('div', { className: 'slider-head' }, [el('span', { textContent: label }), output]),
    input,
  ])
  row.setValue = (v) => { input.value = v; output.textContent = format(v) }
  return row
}

export function select({ options, value, onChange }) {
  const node = el('select', { className: 'control' })
  for (const [key, label] of options) node.append(el('option', { value: key, textContent: label }))
  node.value = value
  node.addEventListener('change', () => onChange(node.value))
  node.addEventListener('wheel', (e) => { e.preventDefault(); node.blur() }, { passive: false })
  node.setValue = (v) => { node.value = v }
  return node
}

export function switchRow({ label, checked, onChange }) {
  const input = el('input', { type: 'checkbox', checked })
  input.addEventListener('change', () => onChange(input.checked))
  const row = el('label', { className: 'switch-row' }, [
    input,
    el('span', { className: 'switch' }),
    el('span', { textContent: label }),
  ])
  row.setValue = (v) => { input.checked = v }
  return row
}

export function segmented({ options, value, onChange }) {
  const wrap = el('div', { className: 'segmented' })
  const buttons = options.map(([key, label, title]) => {
    const b = el('button', { type: 'button', textContent: label, title: title || label })
    b.dataset.key = key
    b.addEventListener('click', () => { wrap.setValue(key); onChange(key) })
    wrap.append(b)
    return b
  })
  wrap.setValue = (v) => buttons.forEach((b) => b.toggleAttribute('data-on', b.dataset.key === v))
  wrap.setValue(value)
  return wrap
}

export function button(label, onClick, variant) {
  const node = el('button', { className: 'btn', type: 'button', textContent: label })
  if (variant) node.dataset.variant = variant
  node.addEventListener('click', onClick)
  return node
}

export function iconButton(inner, title, onClick) {
  const node = el('button', { className: 'icon-btn', type: 'button', title, ariaLabel: title })
  node.innerHTML = inner
  node.addEventListener('click', onClick)
  return node
}

export function numberField({ label, min, max, step = 1, value, onInput }) {
  const input = el('input', { className: 'control num', type: 'number', min, max, step, value })
  const commit = () => {
    let v = parseFloat(input.value)
    if (!Number.isFinite(v)) return
    v = Math.min(max, Math.max(min, v))
    input.value = v
    onInput(v)
  }
  input.addEventListener('change', commit)
  input.addEventListener('input', () => {
    const v = parseFloat(input.value)
    if (Number.isFinite(v) && v >= min && v <= max) onInput(v)
  })
  return label ? field(label, input) : input
}

/** Ô màu: swatch + mã hex, input color phủ trong suốt lên trên. */
export function colorControl({ value, onInput }) {
  const swatch = el('span', { className: 'color-swatch' })
  swatch.style.background = value
  const text = el('span', { textContent: value.toUpperCase() })
  const input = el('input', { type: 'color', value })
  input.addEventListener('input', () => {
    swatch.style.background = input.value
    text.textContent = input.value.toUpperCase()
    onInput(input.value)
  })
  return el('div', { className: 'color-field' }, [
    el('div', { className: 'control' }, [swatch, text]),
    input,
  ])
}

export function colorField({ label, value, onInput }) {
  return field(label, colorControl({ value, onInput }))
}
