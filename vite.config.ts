import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
// https://vite.dev/config/
export default defineConfig({
  // Served from the root of www.repcounterai.com. Set BASE_PATH to build for a sub-path.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss()],
})
