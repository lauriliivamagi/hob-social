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
      injectRegister: null, // We manually register in our custom templates
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
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}']
      }
    })
  ],
});
