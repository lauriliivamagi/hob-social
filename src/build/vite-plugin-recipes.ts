import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { computeSchedule, computeTotalTime } from '../domain/schedule/schedule.js';
import { validateDag } from '../domain/schedule/dag.js';
import { loadI18n } from './i18n.js';
import type { Recipe } from '../domain/recipe/types.js';
import type { Phase } from '../domain/schedule/types.js';

interface RecipeMeta {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  difficulty: string;
  totalTime: { relaxed: number; optimized: number };
  servings: number;
  language: string;
  url: string;
}

interface RecipeData {
  recipe: Recipe;
  relaxed: Phase[];
  optimized: Phase[];
  i18n: Record<string, unknown>;
}

function findJsonFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) results.push(...findJsonFiles(full));
    else if (entry.name.endsWith('.json')) results.push(full);
  }
  return results;
}

export function recipesPlugin(): Plugin {
  let root: string;
  let recipesDir: string;
  let templatesDir: string;
  let i18nDir: string;
  let appVersion: string;
  let recipeMetas: RecipeMeta[] = [];
  let recipeDataMap: Map<string, RecipeData> = new Map();

  function processRecipes(): void {
    recipeMetas = [];
    recipeDataMap = new Map();
    const files = findJsonFiles(recipesDir);

    for (const file of files) {
      const recipe: Recipe = JSON.parse(readFileSync(file, 'utf8'));
      const validation = validateDag(recipe);
      if (!validation.valid) {
        console.error(
          `DAG validation failed for ${recipe.meta.slug}:`,
          validation.errors,
        );
        continue;
      }

      const relaxed = computeSchedule(recipe, 'relaxed');
      const optimized = computeSchedule(recipe, 'optimized');
      const totalTime = {
        relaxed: computeTotalTime(relaxed),
        optimized: computeTotalTime(optimized),
      };
      recipe.meta.totalTime = totalTime;

      const relPath = relative(recipesDir, file);
      const i18n = loadI18n(recipe.meta.language || 'en', i18nDir);
      const url = relPath.replace(/\.json$/, '.html');

      recipeDataMap.set(url, { recipe, relaxed, optimized, i18n });
      recipeMetas.push({
        title: recipe.meta.title,
        slug: recipe.meta.slug,
        category: dirname(relPath),
        tags: recipe.meta.tags || [],
        difficulty: recipe.meta.difficulty || 'medium',
        totalTime,
        servings: recipe.meta.servings,
        language: recipe.meta.language || 'en',
        url,
      });
    }
  }

  function renderIndex(): string {
    const template = readFileSync(join(templatesDir, 'index.html'), 'utf8');
    const i18n = loadI18n('en', i18nDir);
    return template
      .replace('{{RECIPES_JSON}}', JSON.stringify(recipeMetas))
      .replace('{{I18N_JSON}}', JSON.stringify(i18n))
      .replace(/\{\{VERSION\}\}/g, appVersion)
      .replace(/\{\{MANIFEST_PATH\}\}/g, 'app.webmanifest')
      .replace(/\{\{SW_PATH\}\}/g, 'sw.js')
      .replace(/\{\{ICON_PATH\}\}/g, 'icon-512.png')
      .replace(/\{\{FAVICON_PATH\}\}/g, 'icon.svg');
  }

  function renderRecipe(data: RecipeData): string {
    const template = readFileSync(join(templatesDir, 'recipe.html'), 'utf8');
    return template
      .replace('{{RECIPE_JSON}}', JSON.stringify(data.recipe))
      .replace('{{I18N_JSON}}', JSON.stringify(data.i18n))
      .replace('{{SCHEDULE_RELAXED_JSON}}', JSON.stringify(data.relaxed))
      .replace('{{SCHEDULE_OPTIMIZED_JSON}}', JSON.stringify(data.optimized))
      .replace(/\{\{VERSION\}\}/g, appVersion)
      .replace(/\{\{MANIFEST_PATH\}\}/g, '../app.webmanifest')
      .replace(/\{\{SW_PATH\}\}/g, '../sw.js')
      .replace(/\{\{ICON_PATH\}\}/g, '../icon-512.png')
      .replace(/\{\{FAVICON_PATH\}\}/g, '../icon.svg');
  }

  return {
    name: 'vite-plugin-recipes',

    config() {
      return {
        build: {
          rollupOptions: {
            input: {
              catalog: resolve('src/entries/catalog.ts'),
              recipe: resolve('src/entries/recipe.ts'),
            },
          },
        },
      };
    },

    configResolved(config: ResolvedConfig) {
      root = config.root;
      recipesDir = resolve(root, 'recipes');
      templatesDir = resolve(root, 'templates');
      i18nDir = resolve(templatesDir, 'i18n');
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      appVersion = pkg.version ?? '0.0.0';
    },

    buildStart() {
      processRecipes();
    },

    configureServer(server: ViteDevServer) {
      processRecipes();

      // Watch recipes directory for changes
      server.watcher.add(recipesDir);
      server.watcher.on('change', (path: string) => {
        if (path.startsWith(recipesDir) && path.endsWith('.json')) {
          processRecipes();
          server.ws.send({ type: 'full-reload' });
        }
      });

      // Return a post-hook to add middleware after Vite's built-in middleware
      return () => {
        server.middlewares.use(
          (
            req: IncomingMessage,
            res: ServerResponse,
            next: () => void,
          ) => {
            const reqUrl = req.url ?? '/';
            const stripped = reqUrl.replace(/^\//, '');

            if (stripped === '' || stripped === 'index.html') {
              const html = renderIndex();
              server
                .transformIndexHtml(reqUrl, html)
                .then((transformed) => {
                  res.setHeader('Content-Type', 'text/html');
                  res.end(transformed);
                });
              return;
            }

            const recipeData = recipeDataMap.get(stripped);
            if (recipeData) {
              const html = renderRecipe(recipeData);
              server
                .transformIndexHtml(reqUrl, html)
                .then((transformed) => {
                  res.setHeader('Content-Type', 'text/html');
                  res.end(transformed);
                });
              return;
            }

            next();
          },
        );
      };
    },

    generateBundle(_, bundle) {
      // Find the bundled entry point file names
      let catalogJs = '';
      let recipeJs = '';
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          if (chunk.name === 'catalog') catalogJs = fileName;
          if (chunk.name === 'recipe') recipeJs = fileName;
        }
      }

      // Generate index HTML with Lit component script
      const indexHtml = renderIndex()
        .replace('</body>', `<script type="module" src="/${catalogJs}"></script>\n</body>`);
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: indexHtml,
      });

      // Generate recipe HTML files with Lit component script
      for (const [url, data] of recipeDataMap) {
        const depth = url.split('/').length - 1;
        const prefix = '../'.repeat(depth);
        const html = renderRecipe(data)
          .replace('</body>', `<script type="module" src="${prefix}${recipeJs}"></script>\n</body>`);
        this.emitFile({
          type: 'asset',
          fileName: url,
          source: html,
        });
      }

      // Copy static assets
      const staticAssets = [
        'app.webmanifest',
        'sw.js',
        'icon.svg',
        'icon-512.png',
        'icon-maskable.png',
      ];
      for (const name of staticAssets) {
        const filePath = join(templatesDir, name);
        if (existsSync(filePath)) {
          this.emitFile({
            type: 'asset',
            fileName: name,
            source: readFileSync(filePath),
          });
        }
      }
    },
  };
}
