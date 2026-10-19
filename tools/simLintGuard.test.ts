// Guards the guardrail: proves the ESLint config still rejects nondeterministic code in
// src/sim (docs/04-BUILD-PLAN.md M0). If someone weakens eslint.config.js, this fails.
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';

// Probe files don't exist on disk, so lint them without type information. The sim purity rules
// are syntax rules and don't need it.
const eslint = new ESLint({ overrideConfig: tseslint.configs.disableTypeChecked });

async function ruleIdsFor(code: string, filePath = 'src/sim/__probe__.ts'): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

const cases: readonly (readonly [string, string, string])[] = [
  ['Math.random', 'export const r = Math.random();\n', 'no-restricted-properties'],
  ['Math.sin', 'export const s = Math.sin(1);\n', 'no-restricted-properties'],
  ['Date', 'export const d = Date.now();\n', 'no-restricted-globals'],
  ['performance', 'export const p = performance.now();\n', 'no-restricted-globals'],
  ['window', 'export const w = window.innerWidth;\n', 'no-restricted-globals'],
  ['setTimeout', 'setTimeout(() => undefined, 1);\nexport {};\n', 'no-restricted-globals'],
  [
    'phaser import',
    "import * as Phaser from 'phaser';\nexport const v = Phaser.VERSION;\n",
    'no-restricted-imports',
  ],
  [
    'game import',
    "import { BootScene } from '../game/scenes/BootScene';\nexport const b = BootScene;\n",
    'no-restricted-imports',
  ],
  [
    'async',
    'export async function f(): Promise<number> {\n  return 1;\n}\n',
    'no-restricted-syntax',
  ],
  ['default export', 'const x = 1;\nexport default x;\n', 'no-restricted-syntax'],
];

describe('sim purity lint rules', () => {
  for (const [name, code, rule] of cases) {
    it(`reject ${name} in src/sim`, async () => {
      expect(await ruleIdsFor(code)).toContain(rule);
    });
  }

  it('allow plain deterministic code in src/sim', async () => {
    const code =
      'export function add(a: number, b: number): number {\n  return Math.floor(a + b);\n}\n';
    expect(await ruleIdsFor(code)).toEqual([]);
  });

  it('allow Math.sin only inside detmath.ts', async () => {
    const code = 'export const s = Math.sin(1);\n';
    expect(await ruleIdsFor(code, 'src/sim/detmath.ts')).toEqual([]);
  });

  it('do not apply sim rules outside src/sim', async () => {
    const code = 'export const r = Math.random();\n';
    expect(await ruleIdsFor(code, 'src/game/__probe__.ts')).toEqual([]);
  });
});
