import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, type Plugin } from 'vite'

/**
 * Production Content Security Policy. Everything must come from this site:
 * - 'wasm-unsafe-eval' lets MediaPipe compile its WebAssembly (no JS eval).
 * - blob: covers the user's video, the share image and MediaPipe's worker.
 * - style 'unsafe-inline' is for the pre-render text's style attribute.
 * The dev server keeps the looser policy in index.html (inline React
 * refresh script, injected styles, ws://localhost reload).
 */
const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ')

function productionCsp(): Plugin {
  return {
    name: 'production-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const re = /(<meta http-equiv="Content-Security-Policy" content=")[^"]*(")/
      if (!re.test(html)) throw new Error('CSP meta tag not found in index.html')
      return html.replace(re, `$1${PROD_CSP}$2`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Served from the root of repcounterai.com. Set BASE_PATH to build for a sub-path.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), tailwindcss(), productionCsp()],
})
