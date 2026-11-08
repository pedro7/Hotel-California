import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The browser only talks to the Vite dev server; `/api` is proxied to Django.
// Same origin => the session and CSRF cookies just work (no CORS involved).
// Inside Docker the backend is reachable as `backend`; running Vite directly on
// your machine, set VITE_API_PROXY_TARGET=http://localhost:8000.
const apiTarget = process.env.VITE_API_PROXY_TARGET ?? 'http://backend:8000'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': { target: apiTarget },
    },
  },
})
