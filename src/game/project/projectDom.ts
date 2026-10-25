// D-045 Project overview: small DOM builders. Every string from the log goes in as textContent
// (or an attribute), never as HTML; links and images were already checked against the host
// allowlist (src/meta/projectLog.ts sanitizeLog). Lives in the page's lazy chunk.
import { pullUrl, type Img, type Link } from '../../meta/projectLog';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { dataset?: Record<string, string> } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(e, rest);
  if (dataset !== undefined) for (const [k, v] of Object.entries(dataset)) e.dataset[k] = v;
  e.append(...children);
  return e;
}

export function button(
  label: string | Node[],
  action: string,
  onClick: (e: MouseEvent) => void,
  cls = 'btn',
): HTMLButtonElement {
  const b = el('button', { type: 'button', className: cls, dataset: { action } });
  if (typeof label === 'string') b.textContent = label;
  else b.append(...label);
  b.addEventListener('click', onClick);
  return b;
}

/** A coloured label (status, kind, version). */
export function chip(text: string, cls: string): HTMLSpanElement {
  return el('span', { className: `chip ${cls}`, textContent: text });
}

/** A link that opens in a new tab and leaks neither the opener nor the referrer. */
export function linkEl(link: Link, cls = 'lnk'): HTMLAnchorElement {
  const a = el('a', { className: cls, href: link.url, textContent: link.label });
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

/** A row of links (nothing when there are none). */
export function linksRow(links: readonly Link[] | undefined): HTMLElement[] {
  if (links === undefined || links.length === 0) return [];
  return [el('div', { className: 'links' }, ...links.map((l) => linkEl(l)))];
}

/** "#70" links to the pull requests. */
export function prLinks(prs: readonly number[] | undefined): HTMLAnchorElement[] {
  return (prs ?? []).map((n) => {
    const a = linkEl({ label: `#${String(n)}`, url: pullUrl(n) }, 'lnk pr');
    a.dataset['pr'] = String(n);
    return a;
  });
}

/** A paragraph of data text; line breaks in it stay. */
export function para(text: string, cls = ''): HTMLParagraphElement {
  return el('p', { className: `pl ${cls}`.trim(), textContent: text });
}

/**
 * An <img> that turns into a box with its caption when it fails to load (no broken-image icon).
 * `onBroken` runs after the swap.
 */
export function picture(img: Img, lazy: boolean, onBroken?: () => void): HTMLElement {
  const holder = el('span', { className: 'ph' });
  const i = el('img', { alt: img.caption, decoding: 'async' });
  if (lazy) i.loading = 'lazy';
  i.addEventListener('error', () => {
    holder.replaceChildren(el('span', { className: 'broken', textContent: img.caption }));
    holder.dataset['broken'] = '1';
    onBroken?.();
  });
  i.src = img.src;
  holder.append(i);
  return holder;
}

export type ShowImage = (images: readonly Img[], index: number, from: HTMLElement) => void;

/** A thumbnail with its caption; a tap opens the set in the lightbox at this picture. */
export function thumb(
  images: readonly Img[],
  index: number,
  show: ShowImage,
  label: string,
): HTMLElement {
  const img = images[index];
  if (img === undefined) return el('span');
  const fig = el('figure', { className: 'fig' });
  const b = button(
    [],
    'image',
    () => {
      show(images, index, b);
    },
    'thb',
  );
  b.setAttribute('aria-label', `${label}: ${img.caption}`);
  b.append(
    picture(img, true, () => {
      fig.classList.add('is-broken');
    }),
  );
  fig.append(b, el('figcaption', { textContent: img.caption }));
  return fig;
}

/** A grid (or `strip`: one scrolling row) of thumbnails. */
export function gallery(
  images: readonly Img[],
  show: ShowImage,
  label: string,
  cls = 'gallery',
): HTMLElement[] {
  if (images.length === 0) return [];
  return [el('div', { className: cls }, ...images.map((_, i) => thumb(images, i, show, label)))];
}
