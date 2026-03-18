import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig(({ mode }) => {
  // Load .env from the project root (parent of /dashboard)
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');

  return {
    root: path.resolve(__dirname),

    server: {
      host: '::',
      port: 5173,
      strictPort: true,
      proxy: {
        // Only proxy real API paths. This avoids colliding with client-side
        // React routes like /api-keys (page) which are not backend endpoints.
        '^/api(?=/|$)': {
          // Always proxy dashboard API calls to the local Express backend in dev.
          // Using 127.0.0.1 avoids IPv4/IPv6 localhost resolution edge cases.
          target: 'http://127.0.0.1:3000',
          changeOrigin: true,
          ws: false,
        },
      },
      hmr: {
        protocol: 'ws',
        host: 'localhost',
        port: 5173,
      },
    },

    build: {
      // Compile into dashboard/dist — served by Express in production
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },

    plugins: [react()],

    // Expose env vars with VITE_ prefix to the client
    envDir: path.resolve(__dirname, '..'),
    envPrefix: 'VITE_',

    resolve: {
      alias: { '@': path.resolve(__dirname, 'src') },
    },

    define: {
      'import.meta.env.VITE_SHOPIFY_API_KEY': JSON.stringify(env.VITE_SHOPIFY_API_KEY || env.SHOPIFY_API_KEY || ''),
      // Fallback global for inline script in index.html during dev
      '__VITE_SHOPIFY_API_KEY__': JSON.stringify(env.VITE_SHOPIFY_API_KEY || env.SHOPIFY_API_KEY || ''),
    },
  };
});
