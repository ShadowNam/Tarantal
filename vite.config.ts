import { defineConfig } from 'vite';

// Default export is required by Vite (config files are exempt from the named-exports rule).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
  preview: { host: true, port: 4173, strictPort: true },
});
