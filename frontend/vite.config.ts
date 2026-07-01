import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // İşte bu satır Network linkini zorunlu olarak açar
    port: 5173
  }
})