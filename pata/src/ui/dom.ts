type Attrs = Record<string, string | number | boolean | ((e: Event) => void)>;

/** 极简 DOM 构造器：el('div.cell', {onclick}, child...) */
export function el<K extends keyof HTMLElementTagNameMap>(
  spec: K | string,
  attrs?: Attrs | null,
  ...children: (Node | string | null | undefined | false)[]
): HTMLElement {
  const [tag, ...classes] = spec.split('.');
  const node = document.createElement(tag || 'div');
  if (classes.length) node.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (typeof v === 'function') {
      node.addEventListener(k.replace(/^on/, ''), v as EventListener);
    } else if (k === 'html') {
      node.innerHTML = String(v);
    } else if (v === false || v === null || v === undefined) {
      continue;
    } else if (v === true) {
      node.setAttribute(k, '');
    } else {
      node.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export const ui = () => document.getElementById('ui') as HTMLElement;

export function clear(node: HTMLElement): HTMLElement {
  node.replaceChildren();
  return node;
}

let toastHost: HTMLElement | null = null;

export function toast(msg: string): void {
  if (!toastHost) {
    toastHost = el('div', { id: 'toasts' });
    ui().append(toastHost);
  }
  const node = el('div.toast', null, msg);
  toastHost.append(node);
  setTimeout(() => node.remove(), 1900);
}

/** 底部弹层。返回 close 函数 */
export function sheet(
  title: string,
  build: (body: HTMLElement, close: () => void) => void,
  opts: { tabs?: HTMLElement; onClose?: () => void; light?: boolean } = {},
): () => void {
  // light: 捏人时需要看清上方的宠物预览，遮罩不能压色
  const mask = el(opts.light ? 'div.sheet-mask.light' : 'div.sheet-mask');
  const body = el('div.body');
  const panel = el('div.sheet');
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    panel.classList.remove('in');
    mask.classList.remove('in');
    setTimeout(() => {
      panel.remove();
      mask.remove();
    }, 280);
    opts.onClose?.();
  };

  panel.append(
    el('header', null, el('h2', null, title), el('button.x', { onclick: close }, '✕')),
  );
  if (opts.tabs) panel.append(opts.tabs);
  panel.append(body);
  mask.addEventListener('click', close);

  ui().append(mask, panel);
  build(body, close);

  requestAnimationFrame(() => {
    mask.classList.add('in');
    panel.classList.add('in');
  });
  return close;
}

/** 标签栏：返回容器，点击回调传入 index */
export function tabs(labels: string[], onPick: (i: number) => void, active = 0): HTMLElement {
  const host = el('div.tabs');
  labels.forEach((label, i) => {
    const b = el('button', {
      onclick: () => {
        for (const child of Array.from(host.children)) child.classList.remove('on');
        b.classList.add('on');
        onPick(i);
      },
    }, label);
    if (i === active) b.classList.add('on');
    host.append(b);
  });
  return host;
}

/** 商品格子 */
export function cell(opts: {
  thumb: string;
  name: string;
  price?: number;
  owned?: boolean;
  locked?: string;
  count?: number;
  selected?: boolean;
  onclick: () => void;
}): HTMLElement {
  const node = el('button.cell', { onclick: opts.onclick });
  if (opts.selected) node.classList.add('on');
  if (opts.locked) node.classList.add('locked');
  node.append(el('div.thumb', { html: opts.thumb }));
  node.append(el('div.nm', null, opts.name + (opts.count ? ` ×${opts.count}` : '')));
  // 始终留一行价格位，否则免费项会比付费项矮一截，格子参差不齐
  if (opts.locked) {
    node.append(el('div.pr', null, opts.locked));
  } else if (opts.owned) {
    node.append(el('div.pr.owned', null, '已拥有'));
  } else if (opts.price !== undefined) {
    node.append(el('div.pr', null, el('i.dot'), String(opts.price)));
  } else {
    node.append(el('div.pr', null, ' '));
  }
  return node;
}

/** emoji 缩略图包一层，和 SVG 缩略图统一尺寸 */
export const emojiThumb = (e: string) => `<div style="font-size:34px;line-height:1">${e}</div>`;
