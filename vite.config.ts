import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Vite handles SPA routing automatically in dev mode
  },
  build: {
    // Ensure proper SPA routing for production
    rollupOptions: {
      output: {
        manualChunks: undefined,
      }
    }
  }
})
