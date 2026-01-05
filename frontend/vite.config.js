import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Any request starting with /api will be sent to the python backend
      '/api': {
        target: 'http://127.0.0.1:8080', // Internal localhost works here!
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Remove /api before sending to Python
      },
    },
  },
})