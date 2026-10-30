import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // In dev, proxy API calls to the local server (or set API_TARGET=http://localhost:8080 for the docker stack).
    proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:3000' },
  },
});
