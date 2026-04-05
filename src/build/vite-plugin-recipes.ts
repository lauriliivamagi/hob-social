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

/** Replace all {{VAR}} placeholders in a template string. */
function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

export function recipesPlugin(): Plugin {
  let root: string;
  let recipesDir: string;
  let templatesDir: string;
  let i18nDir: string;
  let appVersion: string;
  let recipeMetas: RecipeMeta[] = [];
  let recipeDataMap: Map<string, RecipeData> = new Map();

  function processRecipe(file: string): void {
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) return;

    let recipe: Recipe;
    try {
      recipe = JSON.parse(raw);
    } catch (e) {
      console.warn(`Skipping ${file}: invalid JSON — ${(e as Error).message}`);
      return;
    }

    const validation = validateDag(recipe);
    if (!validation.valid) {
      console.error(
        `DAG validation failed for ${recipe.meta.slug}:`,
        validation.errors,
      );
      return;
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

    const newMeta = {
      title: recipe.meta.title,
      slug: recipe.meta.slug,
      category: dirname(relPath),
      tags: recipe.meta.tags || [],
      difficulty: recipe.meta.difficulty || 'medium',
      totalTime,
      servings: recipe.meta.servings,
      language: recipe.meta.language || 'en',
      url,
    };

    const metaIndex = recipeMetas.findIndex(m => m.url === url);
    if (metaIndex >= 0) {
      recipeMetas[metaIndex] = newMeta;
    } else {
      recipeMetas.push(newMeta);
    }
  }

  function processAllRecipes(): void {
    recipeMetas = [];
    recipeDataMap = new Map();
    const files = findJsonFiles(recipesDir);

    for (const file of files) {
      processRecipe(file);
    }
  }

  function renderIndex(entryScript: string): string {
    const template = readFileSync(join(templatesDir, 'index.html'), 'utf8');
    const i18n = loadI18n('en', i18nDir);
    return applyTemplate(template, {
      TITLE: 'All Recipes',
      DESCRIPTION: 'Step-by-step cooking with timers and parallel task management',
      RECIPES_JSON: JSON.stringify(recipeMetas),
      I18N_JSON: JSON.stringify(i18n),
      VERSION: appVersion,
      MANIFEST_PATH: 'manifest.webmanifest',
      SW_PATH: 'sw.js',
      ICON_PATH: 'icon-512.png',
      FAVICON_PATH: 'icon.svg',
      ENTRY_SCRIPT: entryScript,
    });
  }

  function renderRecipe(data: RecipeData, depth: number, entryScript: string): string {
    const template = readFileSync(join(templatesDir, 'recipe.html'), 'utf8');
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    return applyTemplate(template, {
      TITLE: data.recipe.meta.title,
      DESCRIPTION: `${data.recipe.meta.title} — step-by-step recipe with timers`,
      RECIPE_JSON: JSON.stringify(data.recipe),
      I18N_JSON: JSON.stringify(data.i18n),
      SCHEDULE_RELAXED_JSON: JSON.stringify(data.relaxed),
      SCHEDULE_OPTIMIZED_JSON: JSON.stringify(data.optimized),
      VERSION: appVersion,
      MANIFEST_PATH: `${prefix}manifest.webmanifest`,
      SW_PATH: `${prefix}sw.js`,
      ICON_PATH: `${prefix}icon-512.png`,
      FAVICON_PATH: `${prefix}icon.svg`,
      ENTRY_SCRIPT: entryScript,
    });
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
      processAllRecipes();
    },

    configureServer(server: ViteDevServer) {
      processAllRecipes();

      // Watch recipes directory for changes
      server.watcher.add(recipesDir);
      server.watcher.on('add', (path: string) => {
        if (path.startsWith(recipesDir) && path.endsWith('.json')) {
          processRecipe(path);
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.watcher.on('change', (path: string) => {
        if (path.startsWith(recipesDir) && path.endsWith('.json')) {
          processRecipe(path);
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.watcher.on('unlink', (path: string) => {
        if (path.startsWith(recipesDir) && path.endsWith('.json')) {
          const relPath = relative(recipesDir, path);
          const url = relPath.replace(/\.json$/, '.html');
          recipeDataMap.delete(url);
          const metaIndex = recipeMetas.findIndex(m => m.url === url);
          if (metaIndex >= 0) recipeMetas.splice(metaIndex, 1);
          server.ws.send({ type: 'full-reload' });
        }
      });

      // Pre-hook: serve all generated pages before Vite's built-in SPA
      // fallback can intercept them. Static assets (icons) are served by
      // Vite from public/ automatically.
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const reqUrl = req.url ?? '/';
          const stripped = reqUrl.replace(/^\//, '').split('?')[0]!;

          // Serve index page
          if (stripped === '' || stripped === 'index.html') {
            const entryScript = '<script type="module" src="/src/entries/catalog.ts"></script>';
            const html = renderIndex(entryScript);
            server
              .transformIndexHtml(reqUrl, html)
              .then((transformed) => {
                res.setHeader('Content-Type', 'text/html');
                res.end(transformed);
              });
            return;
          }

          // Serve recipe pages
          const recipeData = recipeDataMap.get(stripped);
          if (recipeData) {
            const depth = stripped.split('/').length - 1;
            const entryScript = '<script type="module" src="/src/entries/recipe.ts"></script>';
            const html = renderRecipe(recipeData, depth, entryScript);
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

      // Generate index HTML with production bundle path
      const catalogScript = `<script type="module" src="./${catalogJs}"></script>`;
      const indexHtml = renderIndex(catalogScript);
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: indexHtml,
      });

      // Generate recipe HTML files with production bundle path
      for (const [url, data] of recipeDataMap) {
        const depth = url.split('/').length - 1;
        const prefix = depth === 0 ? './' : '../'.repeat(depth);
        const recipeScript = `<script type="module" src="${prefix}${recipeJs}"></script>`;
        const html = renderRecipe(data, depth, recipeScript);
        this.emitFile({
          type: 'asset',
          fileName: url,
          source: html,
        });
      }
    },
  };
}
