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
  // randomness and non-exact maths
  ['Math.random', 'export const r = Math.random();\n', 'no-restricted-syntax'],
  ['Math.sin', 'export const s = Math.sin(1);\n', 'no-restricted-syntax'],
  ['Math.hypot', 'export const h = Math.hypot(3, 4);\n', 'no-restricted-syntax'],
  ['Math.log2', 'export const l = Math.log2(8);\n', 'no-restricted-syntax'],
  ["Math['random']", "export const r = Math['random']();\n", 'no-restricted-syntax'],
  ['** operator', 'export const p = (n: number): number => n ** 0.5;\n', 'no-restricted-syntax'],
  ['**= operator', 'let x = 2;\nx **= 3;\nexport const y = x;\n', 'no-restricted-syntax'],
  // time, platform and global escape hatches
  ['Date', 'export const d = Date.now();\n', 'no-restricted-globals'],
  ['performance', 'export const p = performance.now();\n', 'no-restricted-globals'],
  ['window', 'export const w = window.innerWidth;\n', 'no-restricted-globals'],
  ['globalThis.Date', 'export const d = globalThis.Date.now();\n', 'no-restricted-globals'],
  ['self.performance', 'export const p = self.performance.now();\n', 'no-restricted-globals'],
  ['crypto', 'export const c = crypto.randomUUID();\n', 'no-restricted-globals'],
  ['process', 'export const t = process.hrtime();\n', 'no-restricted-globals'],
  ['setTimeout', 'setTimeout(() => undefined, 1);\nexport {};\n', 'no-restricted-globals'],
  ['setImmediate', 'setImmediate(() => undefined);\nexport {};\n', 'no-restricted-globals'],
  // imports
  [
    'phaser import',
    "import * as Phaser from 'phaser';\nexport const v = Phaser.VERSION;\n",
    'no-restricted-imports',
  ],
  [
    'phaser subpath import',
    "import { x } from 'phaser/src/math';\nexport const v = x;\n",
    'no-restricted-imports',
  ],
  [
    'game import',
    "import { BootScene } from '../game/scenes/BootScene';\nexport const b = BootScene;\n",
    'no-restricted-imports',
  ],
  [
    'i18n import',
    "import { t } from '../i18n/i18n';\nexport const f = t;\n",
    'no-restricted-imports',
  ],
  [
    'loadNode import',
    "import { readContentDir } from '../content/loadNode';\nexport const f = readContentDir;\n",
    'no-restricted-imports',
  ],
  [
    'node import',
    "import { readFileSync } from 'node:fs';\nexport const f = readFileSync;\n",
    'no-restricted-imports',
  ],
  ['dynamic import', "export const m = import('./other');\n", 'no-restricted-syntax'],
  // async and exports
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
    const code = [
      "import type { Biome } from '../content/schemas';",
      'export function f(a: number, b: number, biome?: Biome): number {',
      '  const r = Math.floor(Math.sqrt(a * a + b * b) * Math.PI);',
      '  return r + Math.max(0, Math.abs(a)) + (biome ? 1 : 0);',
      '}',
      '',
    ].join('\n');
    expect(await ruleIdsFor(code)).toEqual([]);
  });

  it('give detmath.ts no exemption (its tables must not come from Math.sin)', async () => {
    const code = 'export const s = Math.sin(1);\n';
    expect(await ruleIdsFor(code, 'src/sim/detmath.ts')).toContain('no-restricted-syntax');
  });

  it('let sim tests use Math.* as a reference, but nothing else that is banned', async () => {
    const testFile = 'src/sim/__probe__.test.ts';
    expect(await ruleIdsFor('export const s = Math.sin(1);\n', testFile)).toEqual([]);
    expect(await ruleIdsFor('export const d = Date.now();\n', testFile)).toContain(
      'no-restricted-globals',
    );
    expect(
      await ruleIdsFor('export const p = (n: number): number => n ** 2;\n', testFile),
    ).toContain('no-restricted-syntax');
  });

  it('do not apply sim rules outside src/sim', async () => {
    const code = 'export const r = Math.random();\n';
    expect(await ruleIdsFor(code, 'src/game/__probe__.ts')).toEqual([]);
  });
});
