// D-045 Project overview: the picture viewer. The full image (or the thumbnail's picture), its
// caption, "n of total", previous/next (buttons, arrow keys, a horizontal swipe), "open full size"
// in a new tab, and close (button, Escape). While it is open the page under it does not scroll
// (the host's scroll area is locked by the `lb-open` class). Lives in the page's lazy chunk.
import type { Img } from '../../meta/projectLog';
import { button, el, linkEl, picture } from './projectDom';
import { pf, pt } from './projectI18n';

/** A horizontal swipe longer than this (CSS px) turns the page. */
const SWIPE_PX = 50;

export class Lightbox {
  private readonly root: HTMLElement;
  private readonly count: HTMLElement;
  private readonly pic: HTMLElement;
  private readonly cap: HTMLElement;
  private readonly full: HTMLElement;
  private readonly prev: HTMLButtonElement;
  private readonly next: HTMLButtonElement;
  private readonly closeBtn: HTMLButtonElement;
  private images: readonly Img[] = [];
  private index = 0;
  private opener: HTMLElement | null = null;
  private swipe: { id: number; x: number; y: number } | null = null;
  /** A swipe just turned the page: the click that may follow it is not a backdrop tap. */
  private swiped = false;

  /** `host` is the page's root; it gets `lb-open` while a picture is shown. */
  constructor(private readonly host: HTMLElement) {
    this.count = el('span', { className: 'count', dataset: { role: 'lb-count' } });
    this.full = el('span', { className: 'lbfull' });
    this.closeBtn = button('✕', 'lb-close', () => {
      this.close();
    });
    this.closeBtn.setAttribute('aria-label', pt('project.close'));
    this.prev = button(
      '‹',
      'lb-prev',
      () => {
        this.go(-1);
      },
      'btn nav',
    );
    this.prev.setAttribute('aria-label', pt('project.prev'));
    this.next = button(
      '›',
      'lb-next',
      () => {
        this.go(1);
      },
      'btn nav',
    );
    this.next.setAttribute('aria-label', pt('project.next'));
    this.pic = el('div', { className: 'pic' });
    this.cap = el('div', { className: 'cap', dataset: { role: 'lb-caption' } });
    const stage = el('div', { className: 'lbstage' }, this.prev, this.pic, this.next);
    this.root = el(
      'div',
      { className: 'lb', hidden: true, dataset: { role: 'lightbox' } },
      el('div', { className: 'lbbar' }, this.count, this.full, this.closeBtn),
      stage,
      this.cap,
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    // A tap on the dark backdrop (not on the picture or a button) closes it.
    this.root.addEventListener('click', (e) => {
      if (this.swiped) {
        this.swiped = false;
        return;
      }
      if (e.target === this.root || e.target === stage || e.target === this.pic) this.close();
    });
    this.root.addEventListener('pointerdown', (e) => {
      if (e.isPrimary) this.swipe = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    this.root.addEventListener('pointerup', (e) => {
      const s = this.swipe;
      this.swipe = null;
      this.swiped = false;
      if (s === null || s.id !== e.pointerId || e.pointerType === 'mouse') return;
      const dx = e.clientX - s.x;
      if (Math.abs(dx) > SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) {
        this.swiped = true;
        this.go(dx < 0 ? 1 : -1);
      }
    });
    this.root.addEventListener('pointercancel', () => {
      this.swipe = null;
    });
    host.append(this.root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(images: readonly Img[], index: number, opener: HTMLElement | null): void {
    if (images.length === 0) return;
    this.images = images;
    this.opener = opener;
    this.root.hidden = false;
    this.host.classList.add('lb-open');
    this.show(index);
    this.closeBtn.focus({ preventScroll: true });
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.hidden = true;
    this.host.classList.remove('lb-open');
    this.pic.replaceChildren();
    this.opener?.focus({ preventScroll: true });
    this.opener = null;
  }

  /** Escape closes, the arrows turn; true when the key was used. */
  handleKey(e: KeyboardEvent): boolean {
    if (!this.isOpen) return false;
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowLeft') this.go(-1);
    else if (e.key === 'ArrowRight') this.go(1);
    else return false;
    return true;
  }

  private go(step: number): void {
    const n = this.images.length;
    if (n > 1) this.show((this.index + step + n) % n);
  }

  private show(index: number): void {
    const n = this.images.length;
    this.index = Math.min(Math.max(index, 0), n - 1);
    const img = this.images[this.index];
    if (img === undefined) return;
    const src = img.full ?? img.src;
    this.pic.replaceChildren(picture({ src, caption: img.caption }, false));
    this.cap.textContent = img.caption;
    this.root.setAttribute('aria-label', img.caption);
    this.count.textContent = n > 1 ? pf('project.picture', { n: this.index + 1, total: n }) : '';
    this.full.replaceChildren(linkEl({ label: pt('project.open_full'), url: src }, 'lnk'));
    this.prev.hidden = n < 2;
    this.next.hidden = n < 2;
  }
}
