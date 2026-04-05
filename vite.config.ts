import { defineConfig } from 'vite';
import { resolve } from 'path';
import { recipesPlugin } from './src/build/vite-plugin-recipes.js';

import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@build': resolve(__dirname, 'src/build'),
    },
  },
  build: {
    outDir: 'site',
    emptyOutDir: true,
  },
  plugins: [
    recipesPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // We import virtual:pwa-register in entry modules
      manifest: {
        name: "Recipe Visualizer",
        short_name: "Recipes",
        description: "Step-by-step cooking with timers and parallel task management",
        start_url: "./",
        scope: "./",
        display: "standalone",
        background_color: "#1a1a2e",
        theme_color: "#1a1a2e",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        navigateFallback: 'offline.html',
        // When the catalog grows beyond ~50 recipes, consider moving recipe HTML
        // out of globPatterns precache and into runtimeCaching with
        // StaleWhileRevalidate for navigation requests (#13 in review).
      },
      devOptions: {
        enabled: true,
      },
    })
  ],
});
