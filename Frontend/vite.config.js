import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Permite acceder via el forwarding de puertos de VS Code (u otro túnel),
    // que llega con un Host distinto a localhost. Solo para desarrollo.
    allowedHosts: true,
  },
})
