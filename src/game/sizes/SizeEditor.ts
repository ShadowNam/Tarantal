// v1.22.1 (D-086): the size editor (`?admin=1&sizes=<area>`, the web admin page's Sizes tab → Open
// in game). The area's hunt runs with every sized animal brought out (devContent withSizePreview)
// and holds still; the panorama still pans (HuntScene moves the view's camera itself). Tap or click
// an animal: it is outlined, named, with the height it shows as and a standing guineafowl beside
// it on its plane (the 0.5 m yardstick, rulerBirds); −10 % · −2 % · +2 % · +10 % · Reset change it
// at once — a sprite drawn whole is scaled about its feet here every frame (the pass), the far
// herds and the baobab's residents through sizeFactor in their views. Save keeps the sizes on this
// device (src/meta/sizeEdits.ts); unsaved changes are asked about before leaving. The sim's content
// is not changed here: "Use my sizes in the game" (the Sizes tab) applies them at boot. DOM panel
// over the canvas, Phaser outline and labels. Its own lazy chunk (web builds' admin page only).
import type * as Phaser from 'phaser';
import { fill } from '../../i18n/i18n';
import type { SizeEditStore } from '../../meta/sizeEdits';
import type { PlaneId } from '../../sim/types';
import { at } from '../admin/adminI18n';
import type { SizesHook, TestHook } from '../GameContext';
import type { DrawBird } from '../view/interpolate';
import type { ParallaxView } from '../view/ParallaxView';
import { rulerBirds, type Ruler } from '../view/rulerBirds';
import { FONT } from '../view/Fx';
import { designSize } from '../layout';
import type { SizeArea } from './sizeAreas';
import { setSizeFactors } from './sizeFactor';
import { knobById, knobsIn, knobsOfSprite, type SizeKnob } from './sizeKnobs';
import {
  factorsOf,
  percentOf,
  shownM,
  SIZE_STEPS,
  stepped,
  valueWith,
  withKnob,
  type SizeContent,
} from './sizeWork';
import { sameSize } from '../../content/sizePaths';

export interface SizeEditorDeps {
  readonly scene: Phaser.Scene;
  readonly parallax: ParallaxView;
  readonly area: SizeArea;
  /** The game's content as shipped (the editor's hunt has no size overrides). */
  readonly content: SizeContent;
  /** The sizes store (src/meta/sizeEdits.ts, in the first download). */
  readonly store: { load(): SizeEditStore; save(s: SizeEditStore): void };
  /** Sets the yardstick birds HuntScene draws with the flock (null: none). */
  readonly setRulers: (draw: (() => DrawBird[]) | null) => void;
  /** Pans the view by a drag of dx design px (a mouse drag; a finger pans the hunt's own way). */
  readonly panDrag: (dx: number) => void;
  readonly hook: TestHook | null;
}

/** A drawn sprite (an Image or a Sprite). */
type Img = Phaser.GameObjects.Image;

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A standing guineafowl's height at plane scale 1 (tools/sizes.ts GUINEAFOWL_STANDING_PX). */
const GUINEAFOWL_PX = 263;
/** A tap moves less than this (design px) and lasts less than TAP_MS. */
const TAP_PX = 18;
const TAP_MS = 700;
/** Small sprites are found within this box around their middle (design px; ≥ 64 tap targets). */
const MIN_TAP_BOX = 72;
const STYLE_ID = 'tm-sizes-editor-style';
const CSS = `
#tm-sizes[data-at=bottom]{top:auto;bottom:0;padding-bottom:calc(env(safe-area-inset-bottom) + 6px)}
#tm-sizes{position:fixed;left:0;right:0;top:0;z-index:20;display:flex;flex-wrap:wrap;gap:6px 8px;
  align-items:center;padding:calc(env(safe-area-inset-top) + 6px) calc(env(safe-area-inset-right) + 8px)
  6px calc(env(safe-area-inset-left) + 8px);background:rgba(27,20,16,.88);color:#F3EAD3;
  font:15px/1.3 'Baloo 2',system-ui,sans-serif;box-sizing:border-box;touch-action:manipulation}
#tm-sizes *{box-sizing:border-box}
#tm-sizes button,#tm-sizes select{font:inherit;font-weight:700;min-height:var(--tap,44px);min-width:var(--tap,44px);
  padding:4px 12px;border-radius:8px;border:2px solid #8a7458;background:#3a2e24;color:#F3EAD3;cursor:pointer;
  touch-action:manipulation}
#tm-sizes select{max-width:min(42vw,320px);background:#F3EAD3;color:#1b1410}
#tm-sizes button.save{background:#d9a21b;border-color:#FFD25A;color:#1b1410}
#tm-sizes button.save[data-dirty=true]{box-shadow:0 0 0 3px #ffe9a6}
#tm-sizes button:disabled{opacity:.45;cursor:default}
#tm-sizes .info{flex:1 1 220px;min-width:180px}
#tm-sizes .name{color:#FFD25A;font-weight:700}
#tm-sizes .muted{color:#C9BFA6;font-size:13px}
#tm-sizes .steps{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}
#tm-sizes .value{min-width:92px;text-align:center;font-weight:700}
@media (max-height:500px){#tm-sizes{font-size:13px;gap:4px 6px;flex-wrap:nowrap;overflow-x:auto;
  touch-action:pan-x}#tm-sizes>*{flex:none}#tm-sizes .muted{font-size:12px}
  #tm-sizes .info{max-width:46vw;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #tm-sizes .info>*{overflow:hidden;text-overflow:ellipsis}
  #tm-sizes button,#tm-sizes select{padding:2px 8px}#tm-sizes select{max-width:30vw}}
`;

function el<K extends keyof HTMLElementTagNameMap>(
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

/** The sprite's box on screen from its world transform (a mirrored sprite included). */
export function spriteBox(img: Img): Box {
  const m = img.getWorldTransformMatrix();
  const x0 = -img.displayOriginX;
  const y0 = -img.displayOriginY;
  const x1 = x0 + img.frame.cutWidth / img.frame.source.resolution;
  const y1 = y0 + img.frame.cutHeight / img.frame.source.resolution;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const [x, y] of [
    [x0, y0],
    [x1, y0],
    [x0, y1],
    [x1, y1],
  ] as const) {
    const p = m.transformPoint(x, y);
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const round1 = (v: number): number => Math.round(v * 10) / 10;
const box1 = (b: Box): Box => ({ x: round1(b.x), y: round1(b.y), w: round1(b.w), h: round1(b.h) });
const fmtM = (m: number): string => (m >= 0.1 ? m.toFixed(2) : m.toFixed(3));

interface Found {
  readonly img: Img;
  readonly knobs: readonly SizeKnob[];
  readonly box: Box;
}

export class SizeEditor {
  private readonly root: HTMLElement;
  private readonly picker: HTMLSelectElement;
  private readonly info: HTMLElement;
  private readonly value: HTMLElement;
  private readonly status: HTMLElement;
  private readonly saveBtn: HTMLButtonElement;
  private readonly stepBtns: HTMLButtonElement[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly rulerLabel: Phaser.GameObjects.Text;
  private readonly knobs: readonly SizeKnob[];
  /** The working factors (1 = as shipped) and the ones last saved. */
  private w: Record<string, number>;
  private saved: Record<string, number>;
  private selected: SizeKnob | null = null;
  private selectedImg: Img | null = null;
  /** The pass: each scaled sprite's own scale (from its view) and the scale set on it. */
  private readonly base = new Map<Img, { bx: number; by: number; ax: number; ay: number }>();
  private readonly kinds = new Map<string, readonly SizeKnob[]>();
  private found: Found[] = [];
  private down: { x: number; y: number; at: number } | null = null;
  private frames = 0;
  private lastExport: string | null = null;
  private readonly off: (() => void)[] = [];

  constructor(private readonly d: SizeEditorDeps) {
    this.knobs = knobsIn(d.area);
    this.w = factorsOf(d.store.load(), d.content);
    this.saved = { ...this.w };
    setSizeFactors(this.w);
    if (document.getElementById(STYLE_ID) === null)
      document.head.appendChild(el('style', { id: STYLE_ID, textContent: CSS }));
    this.picker = el('select', { name: 'animal' });
    this.picker.setAttribute('aria-label', at('admin.sizes.pick'));
    this.picker.append(el('option', { value: '', textContent: `${at('admin.sizes.pick')}…` }));
    for (const k of this.knobs)
      this.picker.append(el('option', { value: k.id, textContent: at(`admin.sizes.k.${k.id}`) }));
    this.picker.addEventListener('change', () => {
      const k = knobById(this.picker.value);
      this.select(k ?? null, null);
    });
    this.info = el('div', { className: 'info' });
    this.value = el('span', { className: 'value', dataset: { role: 'size-value' } });
    this.status = el('span', { className: 'muted', dataset: { role: 'size-status' } });
    const steps = el('div', { className: 'steps' });
    SIZE_STEPS.forEach((s, i) => {
      const label = percentOf(1 + s);
      const b = el('button', {
        type: 'button',
        textContent: label,
        dataset: { action: `size-step-${String(i)}` },
      });
      b.setAttribute('aria-label', fill(at('admin.sizes.step'), { step: label }));
      b.addEventListener('click', () => {
        this.step(s);
      });
      this.stepBtns.push(b);
      if (i === 2) steps.append(this.value);
      steps.append(b);
    });
    const reset = el('button', {
      type: 'button',
      textContent: at('admin.sizes.reset'),
      dataset: { action: 'size-reset' },
    });
    reset.addEventListener('click', () => {
      this.setFactor(1);
    });
    this.stepBtns.push(reset);
    this.saveBtn = el('button', {
      type: 'button',
      className: 'save',
      textContent: at('admin.sizes.save'),
      dataset: { action: 'size-save' },
    });
    this.saveBtn.addEventListener('click', () => {
      this.save();
    });
    const back = el('button', {
      type: 'button',
      textContent: at('admin.sizes.back'),
      dataset: { action: 'size-back' },
    });
    back.addEventListener('click', () => {
      this.leave();
    });
    this.root = el(
      'div',
      { id: 'tm-sizes' },
      back,
      this.picker,
      steps,
      reset,
      this.saveBtn,
      this.info,
      this.status,
    );
    this.root.setAttribute('role', 'toolbar');
    this.root.setAttribute('aria-label', at('admin.tab_sizes'));
    // Keys typed here are not game keys; taps on the panel never reach the canvas.
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
    });
    document.body.appendChild(this.root);
    this.fitTaps();
    const onResize = (): void => {
      this.fitTaps();
    };
    window.addEventListener('resize', onResize);
    this.off.push(() => {
      window.removeEventListener('resize', onResize);
    });
    const beforeUnload = (e: BeforeUnloadEvent): void => {
      if (!this.dirty()) return;
      e.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    this.off.push(() => {
      window.removeEventListener('beforeunload', beforeUnload);
    });
    // Taps on the canvas (DOM events: the hunt's InputMapper reads the same ones).
    const canvas = d.scene.game.canvas;
    const toDesign = (e: PointerEvent): { x: number; y: number } => {
      const r = canvas.getBoundingClientRect();
      const ds = designSize();
      return {
        x: ((e.clientX - r.left) / Math.max(1, r.width)) * ds.width,
        y: ((e.clientY - r.top) / Math.max(1, r.height)) * ds.height,
      };
    };
    const onDown = (e: PointerEvent): void => {
      const p = toDesign(e);
      this.down = { x: p.x, y: p.y, at: performance.now() };
    };
    let lastX: number | null = null;
    const onMove = (e: PointerEvent): void => {
      if (e.pointerType !== 'mouse' || (e.buttons & 1) === 0 || this.down === null) {
        lastX = null;
        return;
      }
      const p = toDesign(e);
      if (lastX === null) {
        if (Math.abs(p.x - this.down.x) <= TAP_PX) return;
        lastX = this.down.x;
      }
      this.d.panDrag(p.x - lastX);
      lastX = p.x;
    };
    const onUp = (e: PointerEvent): void => {
      const dn = this.down;
      this.down = null;
      if (dn === null) return;
      const p = toDesign(e);
      const moved = Math.hypot(p.x - dn.x, p.y - dn.y);
      if (moved <= TAP_PX && performance.now() - dn.at <= TAP_MS) this.tap(p.x, p.y);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    this.off.push(() => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
    });
    this.gfx = d.scene.add.graphics().setDepth(1e6);
    const style = {
      fontFamily: FONT,
      fontSize: '26px',
      color: '#FFD25A',
      stroke: '#1b1410',
      strokeThickness: 6,
    };
    this.label = d.scene.add.text(0, 0, '', style).setDepth(1e6).setVisible(false);
    this.rulerLabel = d.scene.add
      .text(0, 0, at('admin.sizes.yardstick'), { ...style, fontSize: '22px', color: '#F3EAD3' })
      .setOrigin(0.5, 0)
      .setDepth(1e6)
      .setVisible(false);
    this.refresh();
  }

  destroy(): void {
    for (const f of this.off) f();
    this.off.length = 0;
    this.root.remove();
    this.gfx.destroy();
    this.label.destroy();
    this.rulerLabel.destroy();
    this.d.setRulers(null);
    // The sprites go back to their views' own sizes.
    for (const [img, r] of this.base)
      if (img.active && img.scaleX === r.ax && img.scaleY === r.ay) img.setScale(r.bx, r.by);
    this.base.clear();
    setSizeFactors(null);
    if (this.d.hook !== null) this.d.hook.sizes = null;
  }

  /** CSS px per design px: the buttons are at least 64 design px (and 44 CSS px). */
  private fitTaps(): void {
    const canvas = this.d.scene.game.canvas;
    const h = canvas.getBoundingClientRect().height;
    const dp = h > 0 ? h / 1080 : 1;
    this.root.style.setProperty('--tap', `${String(Math.max(44, Math.ceil(64 * dp)))}px`);
  }

  private dirty(): boolean {
    for (const k of this.knobs)
      if (!sameSize(this.w[k.id] ?? 1, this.saved[k.id] ?? 1)) return true;
    return false;
  }

  /** A knob's own factor × those of the knobs it is drawn with. */
  private drawn(k: SizeKnob): number {
    let f = this.w[k.id] ?? 1;
    for (const id of k.with ?? []) f *= this.w[id] ?? 1;
    return f;
  }

  private step(s: number): void {
    const k = this.selected;
    if (k === null) return;
    this.setFactor(stepped(this.w[k.id] ?? 1, s));
  }

  private setFactor(f: number): void {
    const k = this.selected;
    if (k === null) return;
    if (sameSize(f, 1)) {
      this.w = Object.fromEntries(Object.entries(this.w).filter(([id]) => id !== k.id));
    } else this.w = { ...this.w, [k.id]: f };
    setSizeFactors(this.w);
    this.status.textContent = this.dirty() ? at('admin.sizes.unsaved_mark') : '';
    this.refresh();
  }

  private save(): void {
    let store = this.d.store.load();
    for (const k of this.knobs) {
      const f = this.w[k.id] ?? 1;
      if (sameSize(f, this.saved[k.id] ?? 1)) continue;
      store = withKnob(store, k, f, this.d.area, this.d.content);
    }
    this.d.store.save(store);
    this.saved = { ...this.w };
    this.status.textContent = at('admin.sizes.saved');
    this.lastExport = JSON.stringify(store.edits);
    this.refresh();
  }

  private leave(): void {
    if (this.dirty() && !window.confirm(at('admin.sizes.unsaved'))) return;
    this.saved = { ...this.w };
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('sizes');
      url.searchParams.delete('play');
      url.searchParams.set('tab', 'sizes');
      window.location.assign(url.toString());
    } catch {
      window.history.back();
    }
  }

  /** A tap at (x, y) design px: the animal drawn on top there; else the nearest small one whose
   *  MIN_TAP_BOX around its middle holds it (a tell is a few px across). */
  private tap(x: number, y: number): void {
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    let best: Found | null = null;
    // Found in drawing order: the last hit is the one on top.
    for (const f of this.found) {
      const b = f.box;
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) best = f;
    }
    if (best === null) {
      let near = Infinity;
      for (const f of this.found) {
        const b = f.box;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        if (Math.abs(x - cx) > MIN_TAP_BOX / 2 || Math.abs(y - cy) > MIN_TAP_BOX / 2) continue;
        const d = Math.hypot(x - cx, y - cy);
        if (d < near) {
          near = d;
          best = f;
        }
      }
    }
    if (best !== null) this.select(best.knobs[0] ?? null, best.img);
  }

  private select(k: SizeKnob | null, img: Img | null): void {
    this.selected = k;
    this.selectedImg = img;
    // The bar keeps clear of the animal picked: on the side of the screen with more room beside
    // it (it stays put when nothing is picked).
    const f =
      img === null
        ? this.found.find((x) => x.knobs[0] === k)
        : this.found.find((x) => x.img === img);
    if (f !== undefined)
      this.root.dataset['at'] =
        designSize().height - (f.box.y + f.box.h) > f.box.y ? 'bottom' : 'top';
    this.picker.value = k?.id ?? '';
    this.refresh();
  }

  /** The panel's text and buttons for the selected animal. */
  private refresh(): void {
    const k = this.selected;
    const c = this.d.content;
    for (const b of this.stepBtns) b.disabled = k === null;
    this.saveBtn.dataset['dirty'] = String(this.dirty());
    if (k === null) {
      this.info.replaceChildren(
        el('span', { className: 'muted', textContent: at('admin.sizes.tap') }),
      );
      this.value.textContent = '';
      return;
    }
    const f = this.w[k.id] ?? 1;
    const m = shownM(k, c, this.w);
    const measure = at(`admin.sizes.m.${k.measure}`);
    const real = fmtM(k.realM);
    this.info.replaceChildren(
      el('div', { className: 'name', textContent: at(`admin.sizes.k.${k.id}`) }),
      el('div', {
        className: 'muted',
        textContent: `${
          m === null
            ? fill(at('admin.sizes.height_none'), { real })
            : fill(at('admin.sizes.height'), { m: fmtM(m), real, measure })
        } · ${at('admin.sizes.yardstick')}`,
      }),
    );
    const v = valueWith(k, c, f);
    this.value.textContent = `${v === null ? '' : String(v)} (${percentOf(f)})`;
  }

  /** Per frame, after the views drew: the pass, the outline, the yardstick and the hook. */
  frame(): void {
    this.frames++;
    const found: Found[] = [];
    const seen = new Set<Img>();
    const visit = (list: readonly Phaser.GameObjects.GameObject[]): void => {
      for (const o of list) {
        const any = o as Phaser.GameObjects.GameObject & {
          list?: Phaser.GameObjects.GameObject[];
          visible?: boolean;
        };
        if (any.visible === false) continue;
        if (Array.isArray(any.list)) {
          visit(any.list);
          continue;
        }
        if (!('texture' in o) || !('frame' in o) || !('setScale' in o)) continue;
        const img = o as Img;
        const kinds = this.kindsOf(img);
        if (kinds.length === 0) continue;
        const own = kinds[0];
        if (own === undefined) continue;
        if (own.live === 'pass') {
          let f = 1;
          for (const k of kinds) f *= this.w[k.id] ?? 1;
          this.scale(img, f);
          seen.add(img);
        }
        if (img.alpha > 0.05) found.push({ img, knobs: kinds, box: spriteBox(img) });
      }
    };
    visit(this.d.scene.children.list);
    // Sprites no longer an animal's (a pooled image put to another use): back to their own size.
    for (const [img, r] of this.base)
      if (!seen.has(img)) {
        if (img.active && img.scaleX === r.ax && img.scaleY === r.ay) img.setScale(r.bx, r.by);
        this.base.delete(img);
      }
    this.found = found;
    this.draw();
    if (this.d.hook !== null && this.frames % 4 === 1) this.fillHook(this.d.hook);
  }

  private kindsOf(img: Img): readonly SizeKnob[] {
    const key = `${img.texture.key}\n${img.frame.name}`;
    let k = this.kinds.get(key);
    if (k === undefined) {
      const own = knobsOfSprite(img.texture.key, img.frame.name);
      // Only this area's animals (a shared sheet's other frames are someone else's).
      k = own.length > 0 && own[0] !== undefined && own[0].areas.includes(this.d.area) ? own : [];
      this.kinds.set(key, k);
    }
    return k;
  }

  /** The pass: a sprite's own scale (whatever its view set) × f, about its origin (its feet). */
  private scale(img: Img, f: number): void {
    let r = this.base.get(img);
    if (r === undefined || img.scaleX !== r.ax || img.scaleY !== r.ay)
      r = { bx: img.scaleX, by: img.scaleY, ax: img.scaleX, ay: img.scaleY };
    const ax = r.bx * f;
    const ay = r.by * f;
    if (img.scaleX !== ax || img.scaleY !== ay) img.setScale(ax, ay);
    r.ax = img.scaleX;
    r.ay = img.scaleY;
    this.base.set(img, r);
  }

  /** The selected animal's sprites on screen (the tapped one first). */
  private selectedFound(): Found[] {
    const k = this.selected;
    if (k === null) return [];
    const mine = this.found.filter((f) => f.knobs[0]?.id === k.id);
    const tapped = mine.findIndex((f) => f.img === this.selectedImg);
    if (tapped > 0) mine.unshift(...mine.splice(tapped, 1));
    else if (tapped < 0 && mine[0] !== undefined) this.selectedImg = mine[0].img;
    return mine;
  }

  /** The plane a sprite is drawn on (its parallax layer's), else the knob's. */
  private planeOf(img: Img, k: SizeKnob): PlaneId {
    // Phaser types parentContainer as always there; it is null at the scene's root.
    let p = img.parentContainer as Phaser.GameObjects.Container | null;
    while (p !== null) {
      const layer = this.d.parallax.layers.find((l) => l.root === p);
      if (layer !== undefined) return layer.plane ?? k.plane;
      p = p.parentContainer;
    }
    return k.plane;
  }

  private draw(): void {
    const g = this.gfx;
    g.clear();
    const mine = this.selectedFound();
    const k = this.selected;
    const first = mine[0];
    if (k === null || first === undefined) {
      this.label.setVisible(false);
      this.rulerLabel.setVisible(false);
      this.d.setRulers(null);
      if (k !== null && this.frames % 30 === 1)
        this.status.textContent = this.dirty()
          ? at('admin.sizes.unsaved_mark')
          : at('admin.sizes.not_here');
      return;
    }
    g.lineStyle(2, 0xffd25a, 0.55);
    for (const f of mine.slice(1)) g.strokeRect(f.box.x, f.box.y, f.box.w, f.box.h);
    const b = first.box;
    g.lineStyle(4, 0xffd25a, 1);
    g.strokeRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
    const m = shownM(k, this.d.content, this.w);
    this.label
      .setText(
        m === null
          ? at(`admin.sizes.k.${k.id}`)
          : fill(at('admin.sizes.label'), { name: at(`admin.sizes.k.${k.id}`), m: fmtM(m) }),
      )
      .setPosition(b.x, Math.max(4, b.y - 40))
      .setVisible(true);
    // The yardstick: a standing guineafowl beside its feet, on its plane.
    const plane = this.planeOf(first.img, k);
    const scale = this.d.content.bundle.scoring.planes[plane].scale;
    const birdH = GUINEAFOWL_PX * scale;
    const feetY = first.img.originY >= 0.6 ? first.img.getWorldTransformMatrix().ty : b.y + b.h;
    const gap = 0.55 * birdH + 12;
    const left = b.x - gap;
    const sx = left > 40 ? left : b.x + b.w + gap;
    const ruler: Ruler = { plane, sx, sy: feetY, facing: sx < b.x ? 1 : -1 };
    const root = (p: PlaneId): { x: number; y: number; scaleX: number; scaleY: number } =>
      this.d.parallax.plane(p).root;
    this.d.setRulers(() => rulerBirds([ruler], root));
    this.rulerLabel.setPosition(sx, feetY + 6).setVisible(true);
    // A 0.5 m bar beside the yardstick bird (feet to the top of its casque).
    const bx = sx + (sx < b.x ? -1 : 1) * (0.45 * birdH + 6);
    g.lineStyle(6, 0x1b1410, 0.9);
    g.lineBetween(bx, feetY, bx, feetY - birdH);
    g.lineStyle(3, 0xf3ead3, 1);
    g.lineBetween(bx, feetY, bx, feetY - birdH);
    g.lineBetween(bx - 8, feetY, bx + 8, feetY);
    g.lineBetween(bx - 8, feetY - birdH, bx + 8, feetY - birdH);
  }

  private fillHook(hook: TestHook): void {
    const spots: SizesHook['spots'] = {};
    const { width, height } = this.d.scene.scale.gameSize;
    const cam = this.d.scene.cameras.main;
    const w = width / cam.zoom;
    const h = height / cam.zoom;
    for (const f of this.found) {
      const id = f.knobs[0]?.id;
      if (id === undefined || spots[id] !== undefined) continue;
      const cx = f.box.x + f.box.w / 2;
      const cy = f.box.y + f.box.h / 2;
      if (cx < 0 || cy < 0 || cx > w || cy > h) continue;
      spots[id] = { x: round1(cx), y: round1(cy) };
    }
    const mine = this.selectedFound();
    const first = mine[0];
    let union: Box | null = null;
    for (const f of mine) {
      const b = f.box;
      if (union === null) union = { ...b };
      else {
        const x1 = Math.max(union.x + union.w, b.x + b.w);
        const y1 = Math.max(union.y + union.h, b.y + b.h);
        union.x = Math.min(union.x, b.x);
        union.y = Math.min(union.y, b.y);
        union.w = x1 - union.x;
        union.h = y1 - union.y;
      }
    }
    const k = this.selected;
    const store = this.d.store.load();
    hook.sizes = {
      view: 'editor',
      area: this.d.area,
      knobs: this.knobs.length,
      selected: k?.id ?? null,
      factor: k === null ? 1 : (this.w[k.id] ?? 1),
      value: k === null ? null : valueWith(k, this.d.content, this.w[k.id] ?? 1),
      shownM: k === null ? null : shownM(k, this.d.content, this.w),
      bounds: union === null ? null : box1(union),
      sprite: first === undefined ? null : box1(first.box),
      feet:
        first === undefined
          ? null
          : {
              x: round1(first.img.getWorldTransformMatrix().tx),
              y: round1(first.img.getWorldTransformMatrix().ty),
            },
      spots,
      changed: Object.keys(this.w).length,
      dirty: this.dirty(),
      apply: store.apply,
      lastExport: this.lastExport,
    };
  }

  /** The drawn factor of a knob now (tests). */
  factorOf(id: string): number {
    const k = knobById(id);
    return k === undefined ? 1 : this.drawn(k);
  }
}
