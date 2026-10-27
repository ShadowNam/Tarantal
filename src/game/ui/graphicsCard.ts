// D-053: the light loading screen's Graphics card and the HD loading panel. Plain DOM (like
// artGate.ts): they show before Phaser draws anything, from a lazy chunk (not the first download).
// Text comes in through i18n from the caller.
import type { GraphicsMode } from '../assets/graphicsChoice';

export interface GraphicsCardText {
  readonly title: string;
  readonly question: string;
  readonly standard: string;
  readonly standardDesc: string;
  readonly hd: string;
  /** With the MB already filled in. */
  readonly hdDesc: string;
  /** "May be slow on this device", or null. */
  readonly weak: string | null;
  readonly recommended: string;
  readonly remember: string;
  readonly later: string;
}

export interface GraphicsCardResult {
  readonly mode: GraphicsMode;
  readonly remember: boolean;
}

const INK = '#1B1410';
const CREAM = '#F3EAD3';
const GOLD = '#D8A73A';
const FONT = "'Baloo 2', system-ui, sans-serif";

/**
 * The reference screen the card is laid out for (CSS px). Larger windows scale it up like the
 * canvas (a 2560×1440 desktop: 2×); smaller ones (phones) keep scale 1, as laid out.
 */
export const CARD_REF = { width: 1280, height: 720 } as const;

/** How much the card grows on this window: ≥ 1, the canvas's fit (contain) against CARD_REF. */
export function cardScale(cssWidth: number, cssHeight: number): number {
  return Math.max(1, Math.min(cssWidth / CARD_REF.width, cssHeight / CARD_REF.height));
}

/** Viewport-height units capped at the reference screen's (so scaling doesn't count twice). */
const VH = 'var(--tm-vh)';

/**
 * The panel's content box: laid out at `1 / scale` of the panel's width and scaled up, centred.
 * Follows window resizes; `stop()` removes the listener.
 */
function scaledBox(p: HTMLDivElement): { box: HTMLDivElement; stop: () => void } {
  const box = document.createElement('div');
  const fit = (): void => {
    const k = cardScale(window.innerWidth, window.innerHeight);
    box.style.cssText =
      'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
      // A share of the panel's content box (inside the safe-area padding); the transform
      // doesn't change layout, so scaled up it fills the same width.
      `gap:16px;flex:none;width:calc(100% / ${k});` +
      `transform:scale(${k});transform-origin:50% 50%`;
  };
  fit();
  window.addEventListener('resize', fit);
  p.append(box);
  return {
    box,
    stop: () => {
      window.removeEventListener('resize', fit);
    },
  };
}

function panel(id: string): HTMLDivElement {
  const p = document.createElement('div');
  p.id = id;
  p.style.cssText =
    'position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;' +
    'justify-content:center;gap:16px;box-sizing:border-box;' +
    'padding:max(12px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) ' +
    'max(12px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left));' +
    `background:${INK};color:${CREAM};font:600 18px/1.35 ${FONT};text-align:center;` +
    'z-index:1000;touch-action:manipulation;overflow:hidden;' +
    `--tm-vh:min(1vh,${CARD_REF.height / 100}px)`;
  return p;
}

/**
 * Asks Standard or HD with "Remember my choice" (ticked by default). `pick` is pre-selected
 * (focused, outlined, marked Recommended); one tap on either option answers.
 */
export function showGraphicsCard(
  text: GraphicsCardText,
  pick: GraphicsMode,
): Promise<GraphicsCardResult> {
  return new Promise((resolve) => {
    const p = panel('tm-graphics');
    p.setAttribute('role', 'dialog');
    p.setAttribute('aria-labelledby', 'tm-graphics-q');
    const name = document.createElement('div');
    name.textContent = text.title;
    name.style.cssText = `font:800 clamp(26px,calc(5 * ${VH}),44px)/1.1 ${FONT};color:#FFD25A`;
    const q = document.createElement('div');
    q.id = 'tm-graphics-q';
    q.textContent = text.question;
    q.style.cssText = `font:800 clamp(20px,calc(3.6 * ${VH}),30px)/1.2 ${FONT}`;
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;gap:16px;flex-wrap:wrap;justify-content:center;max-width:min(860px,100%)';
    const remember = document.createElement('input');
    remember.type = 'checkbox';
    remember.id = 'tm-graphics-remember';
    remember.checked = true;
    remember.style.cssText = 'width:28px;height:28px;margin:0;accent-color:' + GOLD;
    const option = (mode: GraphicsMode, label: string, desc: string, note: string | null) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.id = `tm-graphics-${mode}`;
      b.dataset['mode'] = mode;
      const chosen = mode === pick;
      b.setAttribute('aria-pressed', String(chosen));
      b.style.cssText =
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;' +
        `flex:1 1 240px;max-width:400px;min-height:clamp(96px,calc(22 * ${VH}),170px);` +
        'padding:12px 18px;' +
        `border-radius:18px;cursor:pointer;font:600 17px/1.3 ${FONT};` +
        (chosen
          ? `background:${GOLD};color:${INK};border:4px solid #FFF4D0;box-shadow:0 0 0 4px ${GOLD}`
          : `background:#3A2E25;color:${CREAM};border:4px solid #5A4A3C`);
      const head = document.createElement('span');
      head.textContent = label;
      head.style.cssText = `font:800 clamp(24px,calc(4.4 * ${VH}),36px)/1.1 ${FONT}`;
      const sub = document.createElement('span');
      sub.textContent = desc;
      b.append(head, sub);
      for (const extra of [chosen ? text.recommended : null, note]) {
        if (extra === null) continue;
        const tag = document.createElement('span');
        tag.textContent = extra;
        tag.style.cssText = 'font:800 15px/1.2 ' + FONT + ';opacity:0.85';
        b.append(tag);
      }
      b.addEventListener('click', () => {
        stop();
        p.remove();
        resolve({ mode, remember: remember.checked });
      });
      return b;
    };
    const std = option('standard', text.standard, text.standardDesc, null);
    const hd = option('hd', text.hd, text.hdDesc, text.weak);
    row.append(std, hd);
    const label = document.createElement('label');
    label.htmlFor = remember.id;
    label.style.cssText =
      'display:flex;align-items:center;gap:12px;min-height:48px;cursor:pointer;' +
      `font:700 clamp(17px,calc(3 * ${VH}),22px) ${FONT}`;
    const span = document.createElement('span');
    span.textContent = text.remember;
    label.append(remember, span);
    const later = document.createElement('div');
    later.textContent = text.later;
    later.style.cssText = 'font-size:16px;opacity:0.75';
    const { box, stop } = scaledBox(p);
    box.append(name, q, row, label, later);
    document.body.append(p);
    (pick === 'hd' ? hd : std).focus();
  });
}

export interface HdLoadingPanel {
  /** Updates the bar and its "x of y MB" line. */
  update(line: string, fraction: number): void;
  /** Shows "Play now in Standard" (once); `onPress` runs when it is pressed (the panel goes). */
  offerStandard(label: string, onPress: () => void): void;
  close(): void;
}

/** The loading screen while an area's HD pack loads: the game's name, a bar, the size in MB. */
export function showHdLoading(title: string, line: string): HdLoadingPanel {
  const p = panel('tm-hd-loading');
  p.setAttribute('role', 'status');
  const name = document.createElement('div');
  name.textContent = title;
  name.style.cssText = `font:800 clamp(26px,calc(5 * ${VH}),44px)/1.1 ${FONT};color:#FFD25A`;
  const bar = document.createElement('div');
  bar.style.cssText =
    'width:min(560px,80%);height:22px;border-radius:11px;background:#3A2E25;' +
    'border:3px solid #5A4A3C;overflow:hidden';
  const fill = document.createElement('div');
  fill.id = 'tm-hd-bar';
  fill.style.cssText = `height:100%;width:0%;background:${GOLD};transition:width 120ms linear`;
  bar.append(fill);
  const text = document.createElement('div');
  text.id = 'tm-hd-line';
  text.textContent = line;
  const { box, stop } = scaledBox(p);
  box.append(name, bar, text);
  document.body.append(p);
  let offered = false;
  return {
    update(l, f) {
      text.textContent = l;
      fill.style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
    },
    offerStandard(label, onPress) {
      if (offered) return;
      offered = true;
      const b = document.createElement('button');
      b.type = 'button';
      b.id = 'tm-hd-standard';
      b.textContent = label;
      b.style.cssText =
        `font:800 20px ${FONT};padding:12px 32px;border-radius:14px;border:4px solid ${INK};` +
        `background:${GOLD};color:${INK};cursor:pointer;min-height:56px`;
      b.addEventListener('click', () => {
        stop();
        p.remove();
        onPress();
      });
      box.append(b);
    },
    close() {
      stop();
      p.remove();
    },
  };
}

/** The card's strings (their own lazy tables, src/i18n/graphics/). */
export { gt } from './graphicsI18n';
