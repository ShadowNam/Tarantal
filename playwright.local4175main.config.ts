import base from './playwright.config';
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://localhost:4176' },
  webServer: {
    command:
      'cd ../tarantal-main && VITE_TEST_HOOKS=1 npm run build && npx vite preview --port 4176 --strictPort',
    url: 'http://localhost:4176',
    reuseExistingServer: false,
    timeout: 300_000,
  },
};
