import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    // v1.8b (D-062): the baboon system (a lazy chunk in the game) is registered for every test.
    setupFiles: ['tools/vitestSetup.ts'],
    // The lint-guard test spins up ESLint with type information; give it room on slow CI.
    testTimeout: 60_000,
  },
});
