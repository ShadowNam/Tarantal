import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    // The lint-guard test spins up ESLint with type information; give it room on slow CI.
    testTimeout: 60_000,
  },
});
