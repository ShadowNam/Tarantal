// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// --- Deterministic sim rules (Tech §3.2, .claude/rules/sim.md) -------------------------------

// Math members whose results are exact on every engine. Everything else on Math (random, sin,
// hypot, log2, cbrt, …) is banned in src/sim — transcendental maths goes through detmath.ts,
// randomness through rng.stream(<name>).
const EXACT_MATH = [
  'sqrt',
  'floor',
  'ceil',
  'round',
  'trunc',
  'abs',
  'min',
  'max',
  'sign',
  'fround',
  'imul',
  'clz32',
  // Constants are exact literals.
  'PI',
  'E',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
  'SQRT1_2',
  'SQRT2',
];

const simSyntaxRules = [
  { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
  { selector: ':function[async=true]', message: 'No async code in src/sim.' },
  { selector: 'AwaitExpression', message: 'No async code in src/sim.' },
  { selector: 'ImportExpression', message: 'No dynamic import() in src/sim.' },
  {
    selector: `MemberExpression[object.name='Math'][computed=false][property.name!=/^(${EXACT_MATH.join('|')})$/]`,
    message:
      'Only exact Math functions are allowed in src/sim (sqrt, floor, round, abs, min, max, …). Use rng.stream(<name>) for randomness and src/sim/detmath.ts for sin/cos/atan2/exp/pow/log.',
  },
  {
    selector: "MemberExpression[object.name='Math'][computed=true]",
    message: 'No computed Math[...] access in src/sim.',
  },
  {
    selector: "BinaryExpression[operator='**'], AssignmentExpression[operator='**=']",
    message: '** is approximated like Math.pow and differs across engines; use detmath.ts.',
  },
];

const simRestrictedGlobals = [
  'window',
  'self',
  'globalThis',
  'global',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'performance',
  'crypto',
  'process',
  'Date',
  'setTimeout',
  'setInterval',
  'setImmediate',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'queueMicrotask',
  'fetch',
  'Promise',
  'Intl',
].map((name) => ({ name, message: `${name} is not allowed in src/sim (determinism rule).` }));

const simRestrictedImports = {
  patterns: [
    { group: ['phaser', 'phaser/*'], message: 'No Phaser in src/sim.' },
    {
      group: [
        '**/game',
        '**/game/**',
        '**/platform',
        '**/platform/**',
        '**/meta',
        '**/meta/**',
        '**/i18n',
        '**/i18n/**',
        '**/debug',
        '**/debug/**',
        '**/content/loadNode',
        '**/content/loadNode.*',
      ],
      message: 'src/sim may import only src/sim and src/content types.',
    },
    {
      group: ['node:*', 'fs', 'path', 'crypto', 'os', 'perf_hooks'],
      message: 'No Node APIs in src/sim.',
    },
  ],
};

// --- Player-facing text only via i18n keys (CLAUDE.md rule 6, M5) -----------------------------
// A string or template literal with a word in it, passed to a call that puts text on screen, is
// a hard-coded player-facing string. Guarded by tools/i18nLintGuard.test.ts.
const WORDY = '/[A-Za-z\\u00C0-\\u024F]{2,}/';
const MSG = 'Player-facing text must come from an i18n key: t(...) (CLAUDE.md rule 6).';
/** [callee name pattern, argument position (1-based) that carries the text]. */
const TEXT_ARGS = [
  ['/^(text|bitmapText)$/', 3], // scene.add.text(x, y, TEXT, style)
  ['/^(setText|showBanner|showCallout|pushPop|appendText)$/', 1],
  ['/^drawButton$/', 3], // drawButton(scene, rect, LABEL, kind)
];
const TEXT_ATTRS = '/^(textContent|innerText|title|placeholder|ariaLabel)$/';
const i18nSyntaxRules = [
  ...TEXT_ARGS.flatMap(([name, pos]) => [
    {
      selector: `CallExpression[callee.property.name=${name}] > Literal[value=${WORDY}]:nth-child(${pos})`,
      message: MSG,
    },
    {
      selector: `CallExpression[callee.name=${name}] > Literal[value=${WORDY}]:nth-child(${pos})`,
      message: MSG,
    },
    {
      selector: `CallExpression[callee.property.name=${name}] > TemplateLiteral:nth-child(${pos}):has(TemplateElement[value.raw=${WORDY}])`,
      message: MSG,
    },
  ]),
  {
    selector: `CallExpression[callee.name=/^(alert|confirm|prompt)$/] > Literal[value=${WORDY}]`,
    message: MSG,
  },
  {
    selector: `AssignmentExpression[left.property.name=${TEXT_ATTRS}] > Literal[value=${WORDY}]`,
    message: MSG,
  },
  {
    selector: `CallExpression[callee.property.name='setAttribute'][arguments.0.value=/^(aria-label|title|alt|placeholder)$/] > Literal[value=${WORDY}]:nth-child(2)`,
    message: MSG,
  },
];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-*/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.claude/**',
      // The development-history Word generator (docs/history/README.md), not game code.
      'docs/history/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
      ],
    },
  },
  {
    // Tool config files must default-export; so do type declarations of default-export packages.
    files: ['*.config.ts', '*.config.js', '**/*.d.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Deterministic simulation core. detmath.ts is NOT exempt: its tables must be generated
    // constants or pure arithmetic, or they would carry the engine differences it exists to remove.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', simRestrictedImports],
      'no-restricted-globals': ['error', ...simRestrictedGlobals],
      'no-restricted-syntax': ['error', ...simSyntaxRules],
    },
  },
  {
    // Sim tests may use the engine's Math.* as a reference (e.g. detmath error bounds). They
    // never run inside the sim, so only the Math allowlist is lifted; every other sim rule stays.
    files: ['src/sim/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...simSyntaxRules.filter((r) => !r.selector.includes("object.name='Math'")),
      ],
    },
  },
  {
    // Game, platform and debug-free UI code: no hard-coded player-facing strings.
    files: ['src/game/**/*.ts', 'src/platform/**/*.ts', 'src/main.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
        ...i18nSyntaxRules,
      ],
    },
  },
  {
    // Test files: relaxed rules on unsafe test fixtures.
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
