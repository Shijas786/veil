import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'samples/*'],
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,jpg,woff2}'] },
      manifest: {
        name: 'Veil — private lab report explainer',
        short_name: 'Veil',
        description: 'Understand your lab report without handing your identity to the cloud.',
        theme_color: '#07100f',
        background_color: '#07100f',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
    }),
  ],
})
