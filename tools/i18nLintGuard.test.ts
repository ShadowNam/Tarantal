// Guards the i18n rule (CLAUDE.md rule 6, M5 "lint rule or test that catches hard-coded
// strings"): proves eslint.config.js still rejects player-facing literals in the game layer and
// still allows i18n keys, colours and enums. If someone weakens the rule, this fails.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

const eslint = new ESLint({ overrideConfig: tseslint.configs.disableTypeChecked });

async function i18nErrors(
  code: string,
  filePath = 'src/game/scenes/__probe__.ts',
): Promise<number> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.message.includes('i18n key')).length;
}

const BAD: readonly (readonly [string, string])[] = [
  ['add.text literal', "declare const s: any;\ns.add.text(0, 0, 'Tap to hunt', {});\nexport {};\n"],
  [
    'add.text template',
    'declare const s: any; declare const n: number;\ns.add.text(0, 0, `Score ${n}`);\nexport {};\n',
  ],
  ['setText', "declare const o: any;\no.setText('RELOAD!');\nexport {};\n"],
  [
    'drawButton label',
    "declare const drawButton: any; declare const s: any;\ndrawButton(s, {}, 'Again', 'primary');\nexport {};\n",
  ],
  ['showBanner', "declare const h: any;\nh.showBanner('Wing shot');\nexport {};\n"],
  ['Afrikaans', "declare const o: any;\no.setText('Mooi skoot!');\nexport {};\n"],
  ['textContent', "declare const el: any;\nel.textContent = 'Turn your device';\nexport {};\n"],
  [
    'aria-label',
    "declare const el: any;\nel.setAttribute('aria-label', 'Fullscreen');\nexport {};\n",
  ],
];

const OK: readonly (readonly [string, string])[] = [
  [
    'i18n key',
    "declare const s: any; declare const t: any;\ns.add.text(0, 0, t('start.title'), {});\nexport {};\n",
  ],
  [
    'symbols only',
    "declare const o: any; declare const n: number;\no.setText(`×${n}`);\no.setText('0:00');\nexport {};\n",
  ],
  [
    'colour + enum args',
    "declare const text: any; declare const drawButton: any; declare const s: any; declare const t: any;\ntext(64, '#F3EAD3');\ndrawButton(s, {}, t('ui.back'), 'primary');\nexport {};\n",
  ],
];

describe('i18n lint rule (no hard-coded player-facing strings)', () => {
  for (const [name, code] of BAD) {
    it(`rejects ${name} in src/game`, async () => {
      expect(await i18nErrors(code)).toBeGreaterThan(0);
    });
  }
  it('applies to src/platform too', async () => {
    expect(await i18nErrors(BAD[6]?.[1] ?? '', 'src/platform/__probe__.ts')).toBeGreaterThan(0);
  });
  for (const [name, code] of OK) {
    it(`allows ${name}`, async () => {
      expect(await i18nErrors(code)).toBe(0);
    });
  }
});
