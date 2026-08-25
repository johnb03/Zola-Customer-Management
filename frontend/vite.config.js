import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    // Proxy solo en desarrollo (cuando el server Express corre en 8787)
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
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Zola',
        short_name: 'Zola',
        description: 'Gestión comercial de productos gourmet.',
        theme_color: '#15100D',
        background_color: '#15100D',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,woff,ttf}'],
      },
    }),
  ],
}))
