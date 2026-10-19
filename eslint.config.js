// @ts-check
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Math functions whose results differ between JS engines (Tech §3.2). Sim code must use detmath.ts.
const TRANSCENDENTAL = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'exp', 'log', 'pow'];

const simRestrictedProperties = [
  { object: 'Math', property: 'random', message: 'Use a named RNG stream: rng.stream(<name>).' },
  ...TRANSCENDENTAL.map((property) => ({
    object: 'Math',
    property,
    message: `Math.${property} differs across engines; use src/sim/detmath.ts.`,
  })),
];

const simRestrictedGlobals = [
  'window',
  'document',
  'navigator',
  'location',
  'localStorage',
  'sessionStorage',
  'performance',
  'Date',
  'setTimeout',
  'setInterval',
  'clearTimeout',
  'clearInterval',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'queueMicrotask',
  'fetch',
  'Promise',
].map((name) => ({ name, message: `${name} is not allowed in src/sim (determinism rule).` }));

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.claude/**',
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
    // Tool config files must default-export.
    files: ['*.config.ts', '*.config.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // Deterministic simulation core (Tech §3.2, .claude/rules/sim.md).
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'No Phaser in src/sim.' }],
          patterns: [
            {
              group: [
                '**/game',
                '**/game/**',
                '**/platform',
                '**/platform/**',
                '**/meta',
                '**/meta/**',
              ],
              message: 'src/sim may import only src/sim and src/content types.',
            },
            { group: ['node:*', 'fs', 'path', 'crypto'], message: 'No Node APIs in src/sim.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...simRestrictedGlobals],
      'no-restricted-properties': ['error', ...simRestrictedProperties],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Named exports only.' },
        { selector: ':function[async=true]', message: 'No async code in src/sim.' },
        { selector: 'AwaitExpression', message: 'No async code in src/sim.' },
      ],
    },
  },
  {
    // detmath.ts is the one place allowed to touch Math.* (it builds the deterministic tables).
    files: ['src/sim/detmath.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a named RNG stream.' },
      ],
    },
  },
  {
    // Test files: vitest globals and relaxed rules on unsafe test fixtures.
    files: ['**/*.test.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
  prettier,
);
