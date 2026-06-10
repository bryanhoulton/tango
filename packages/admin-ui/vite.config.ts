import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base './' keeps asset URLs relative, so the built SPA works from any mount
// point (`public/admin/` on Vercel, a static dir in containers) with hash
// routing and zero server rewrites.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    // Local DX: `tango serve` on :8000 owns the admin API.
    proxy: {
      '/admin/api': 'http://127.0.0.1:8000'
    }
  }
})
