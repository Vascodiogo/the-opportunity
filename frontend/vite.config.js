import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
    'process.env': {},
    process: { env: {}, browser: true, version: '' },
  },
  optimizeDeps: {
    include: ['buffer'],
  },
  resolve: {
    alias: {
      buffer: 'buffer/',
    },
  },
  server: {
    headers: {
'Content-Security-Policy': "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.web3auth.io https://cdn.jsdelivr.net;"    }
  }
})