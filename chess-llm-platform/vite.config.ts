import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    headers: {
      // Relaxed CSP for development
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval' blob:; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self' https://api.anthropic.com https://api.openai.com;",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'zustand', 'chess.js'],
          chessboard: ['react-chessboard'],
        },
      },
    },
  },
});
