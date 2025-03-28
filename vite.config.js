import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: {
      key: fs.readFileSync('./desktop-rb3jcvu.tail8a383a.ts.net.key'), 
      cert: fs.readFileSync('./desktop-rb3jcvu.tail8a383a.ts.net.crt') 
    }
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Volatility Tracker',
        short_name: 'VolTrack',
        description: 'Real-time volatility tracking app',
        theme_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait', 
        start_url: '/',
        display_override: ['standalone'],
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  // server: {
  //   proxy: {
  //     '/bybit': {
  //       target: 'https://api.bybit.com',
  //       changeOrigin: true,
  //       secure: false,
  //       cookieDomainRewrite: '',
  //       rewrite: (path) => path.replace(/^\/bybit/, '')
  //     },
  //     '/binance': {
  //       target: 'https://fapi.binance.com',
  //       changeOrigin: true,
  //       secure: false,
  //       cookieDomainRewrite: '',
  //       rewrite: (path) => path.replace(/^\/binance/, '')
  //     },
  //     '/okx': {
  //       target: 'https://www.okx.com',
  //       changeOrigin: true,
  //       secure: false,
  //       cookieDomainRewrite: '',
  //       rewrite: (path) => path.replace(/^\/okx/, '')
  //     },
  //     '/coinbase': {
  //       target: 'https://api.international.coinbase.com',
  //       changeOrigin: true,
  //       secure: false,
  //       cookieDomainRewrite: '',
  //       rewrite: (path) => path.replace(/^\/coinbase/, '')
  //     },

  //   }
  // }
})