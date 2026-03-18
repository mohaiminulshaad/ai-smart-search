/**
 * widget/vite.widget.config.ts
 * Builds the storefront Smart Search widget as a single self-contained IIFE.
 * Output: public/smart-search.js
 *
 * Run from project root: npm run build:widget
 */

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path  from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load HOST from the Shopify Smart Search root .env
const env = loadEnv('development', path.resolve(__dirname, '..'), '');
const appUrl = (env.HOST || 'http://localhost:3000').trim();

console.log(`[vite.widget.config] Building widget with APP_URL = ${appUrl}`);

export default defineConfig({
  root: path.resolve(__dirname),
  mode: 'production',

  build: {
    outDir:      path.resolve(__dirname, '..', 'public'),
    emptyOutDir: false,

    lib: {
      entry:    path.resolve(__dirname, 'index.tsx'),
      name:     'SmartSearch',
      fileName: () => 'smart-search.js',
      formats:  ['iife'],
    },

    rollupOptions: {
      external: [],
      output: { inlineDynamicImports: true },
    },

    minify: 'esbuild',
    chunkSizeWarningLimit: 5000,
  },

  plugins: [react()],

  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },

  define: {
    'process.env.NODE_ENV':         JSON.stringify('production'),
    'process.env':                  JSON.stringify({ NODE_ENV: 'production' }),
    '__APP_URL__':                  JSON.stringify(appUrl),
    'import.meta.env.VITE_APP_URL': JSON.stringify(appUrl),
    'import.meta.env.MODE':         JSON.stringify('production'),
    'import.meta.env.PROD':         JSON.stringify(true),
    'import.meta.env.DEV':          JSON.stringify(false),
  },
});
