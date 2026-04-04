import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/entries/recipe.ts',
    'src/entries/catalog.ts',
    'src/build/vite-plugin-recipes.ts',
  ],
  project: ['src/**/*.ts'],
  vite: {
    config: ['vite.config.ts'],
  },
  // Lit custom elements register via @customElement decorator (side-effect),
  // so their exported classes appear unused to static analysis.
  ignoreExportsUsedInFile: true,
};

export default config;
