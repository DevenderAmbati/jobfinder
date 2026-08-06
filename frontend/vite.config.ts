import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-dom') || id.includes('/react/')) {
            return 'react-vendor';
          }
          if (id.includes('@tanstack')) return 'query-vendor';
          if (id.includes('react-router')) return 'router-vendor';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Workday / SmartRecruiters fetches can run several minutes.
      '/api': {
        target: 'http://localhost:3001',
        timeout: 600_000,
        proxyTimeout: 600_000,
      },
    },
  },
});
