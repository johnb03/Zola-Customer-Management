import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Proxy solo en desarrollo (cuando el server Express corre en 8787).
    // No se usa en build/producción: la app es standalone con IndexedDB.
    proxy: mode === 'development' ? {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    } : undefined,
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'pwa-icon-192.png', 'pwa-icon-512.png', 'pwa-maskable-512.png'],
      manifest: {
        name: 'Zola',
        short_name: 'Zola',
        description: 'Gestión comercial de productos gourmet.',
        theme_color: '#15100D',
        background_color: '#15100D',
        display: 'standalone',
        start_url: '.',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: [
          '**/*.{js,mjs,css,html,svg,woff2,woff,ttf,png,wasm}',
          'tessdata/**',
          'tesseract-core/**',
        ],
        maximumFileSizeToCacheInBytes: 25 * 1024 * 1024, // los .gz de OCR son ~4-11MB
      },
    }),
  ],
}))
