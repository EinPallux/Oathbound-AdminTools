// Tiny DOM builders so the UI code stays compact and consistent.

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = String(v);
    else if (k === 'style') Object.assign(node.style, v as object);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (v != null && v !== false) {
      node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children) node.append(c);
  return node;
}

export function row(label: string, control: HTMLElement): HTMLElement {
  return el('label', { class: 'row' }, [el('span', { class: 'row-label', text: label }), control]);
}

export interface SliderOpts {
  min: number;
  max: number;
  step: number;
  value: number;
  onInput: (v: number) => void;
  format?: (v: number) => string;
}

/** A labelled slider with a live value readout. Returns the row + a setter. */
export function slider(label: string, opts: SliderOpts): { row: HTMLElement; set: (v: number) => void } {
  const input = el('input', {
    type: 'range',
    min: opts.min,
    max: opts.max,
    step: opts.step,
    value: opts.value,
  }) as HTMLInputElement;
  const fmt = opts.format ?? ((v: number) => String(v));
  const out = el('span', { class: 'slider-val', text: fmt(opts.value) });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    out.textContent = fmt(v);
    opts.onInput(v);
  });
  const r = el('div', { class: 'row slider-row' }, [
    el('span', { class: 'row-label', text: label }),
    input,
    out,
  ]);
  return {
    row: r,
    set: (v: number) => {
      input.value = String(v);
      out.textContent = fmt(v);
    },
  };
}

export function select(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
): HTMLElement {
  const sel = el('select', {}) as HTMLSelectElement;
  for (const o of options) {
    const opt = el('option', { value: o.value, text: o.label }) as HTMLOptionElement;
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return row(label, sel);
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  return el('button', { class: `btn ${cls}`.trim(), text: label, onClick }) as HTMLButtonElement;
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'row check-row' }, [input, el('span', { text: label })]);
}

export function section(title: string, children: Node[]): HTMLElement {
  return el('div', { class: 'section' }, [el('h3', { text: title }), ...children]);
}
