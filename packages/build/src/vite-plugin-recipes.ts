import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildPkgDir = resolve(__dirname, '..');
import { computeSchedule, computeTotalTime } from '../../domain/src/schedule/schedule.js';
import { parseRecipe } from '../../domain/src/recipe/parse.js';
import { parsePool, parseThemeNights, parseStaples } from '../../domain/src/planning/parse.js';
import { loadI18n } from './i18n.js';
import type { Recipe, TimeRange } from '../../domain/src/recipe/types.js';
import type { Phase } from '../../domain/src/schedule/types.js';
import type { Pool, ThemeNights, Staples } from '../../domain/src/planning/types.js';

interface RecipeMeta {
  title: string;
  slug: string;
  category: string;
  tags: string[];
  difficulty: string;
  totalTime: { relaxed: TimeRange; optimized: TimeRange };
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
  let stateDir: string;
  let templatesDir: string;
  let i18nDir: string;
  let appVersion: string;
  let recipeMetas: RecipeMeta[] = [];
  let recipeDataMap: Map<string, RecipeData> = new Map();
  let pool: Pool | null = null;
  let themeNights: ThemeNights | null = null;
  let staples: Staples | null = null;

  function processRecipe(file: string): void {
    const raw = readFileSync(file, 'utf8');
    if (!raw.trim()) return;

    let recipe: Recipe;
    try {
      const json = JSON.parse(raw);
      recipe = parseRecipe(json);
    } catch (e) {
      console.warn(`Skipping ${file}: ${(e as Error).message}`);
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

  function loadStateFile<T>(file: string, parser: (json: unknown) => T): T | null {
    const path = join(stateDir, file);
    if (!existsSync(path)) return null;
    try {
      const raw = readFileSync(path, 'utf8');
      if (!raw.trim()) return null;
      return parser(JSON.parse(raw));
    } catch (e) {
      console.warn(`Skipping state/${file}: ${(e as Error).message}`);
      return null;
    }
  }

  function loadAllState(): void {
    pool = loadStateFile('pool.json', parsePool);
    themeNights = loadStateFile('themes.json', parseThemeNights);
    staples = loadStateFile('staples.json', parseStaples);
  }

  function renderIndex(entryScript: string): string {
    const template = readFileSync(join(templatesDir, 'index.html'), 'utf8');
    const i18n = loadI18n('en', i18nDir);
    return applyTemplate(template, {
      TITLE: 'All Recipes',
      DESCRIPTION: 'Step-by-step cooking with timers and parallel task management',
      RECIPES_JSON: JSON.stringify(recipeMetas),
      POOL_JSON: JSON.stringify(pool),
      THEMES_JSON: JSON.stringify(themeNights),
      STAPLES_JSON: JSON.stringify(staples),
      I18N_JSON: JSON.stringify(i18n),
      VERSION: appVersion,
      MANIFEST_PATH: 'manifest.webmanifest',
      SW_PATH: 'sw.js',
      ICON_PATH: 'icon-512.png',
      FAVICON_PATH: 'icon.svg',
      ENTRY_SCRIPT: entryScript,
    });
  }

  function renderAuthCallback(entryScript: string, depth: number): string {
    const template = readFileSync(join(templatesDir, 'auth-callback.html'), 'utf8');
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    return applyTemplate(template, {
      FAVICON_PATH: `${prefix}icon.svg`,
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
              catalog: resolve('packages/ui/entries/catalog.ts'),
              recipe: resolve('packages/ui/entries/recipe.ts'),
              'auth-callback': resolve('packages/ui/entries/auth-callback.ts'),
            },
          },
        },
      };
    },

    configResolved(config: ResolvedConfig) {
      root = config.root;
      recipesDir = resolve(buildPkgDir, 'recipes');
      stateDir = resolve(buildPkgDir, 'state');
      templatesDir = resolve(buildPkgDir, 'templates');
      i18nDir = resolve(templatesDir, 'i18n');
      const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
      appVersion = pkg.version ?? '0.0.0';
    },

    buildStart() {
      processAllRecipes();
      loadAllState();
    },

    configureServer(server: ViteDevServer) {
      processAllRecipes();
      loadAllState();

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

      // Watch state directory for changes
      if (existsSync(stateDir)) {
        server.watcher.add(stateDir);
        server.watcher.on('change', (path: string) => {
          if (path.startsWith(stateDir) && path.endsWith('.json')) {
            loadAllState();
            server.ws.send({ type: 'full-reload' });
          }
        });
      }

      // Pre-hook: serve all generated pages before Vite's built-in SPA
      // fallback can intercept them. Static assets (icons) are served by
      // Vite from public/ automatically.
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const reqUrl = req.url ?? '/';
          const stripped = reqUrl.replace(/^\//, '').split('?')[0]!;

          // Serve index page
          if (stripped === '' || stripped === 'index.html') {
            const entryScript = '<script type="module" src="/packages/ui/entries/catalog.ts"></script>';
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
            const entryScript = '<script type="module" src="/packages/ui/entries/recipe.ts"></script>';
            const html = renderRecipe(recipeData, depth, entryScript);
            server
              .transformIndexHtml(reqUrl, html)
              .then((transformed) => {
                res.setHeader('Content-Type', 'text/html');
                res.end(transformed);
              });
            return;
          }

          // Serve OAuth callback page
          if (stripped === 'auth/callback' || stripped === 'auth/callback/' || stripped === 'auth/callback/index.html') {
            const entryScript = '<script type="module" src="/packages/ui/entries/auth-callback.ts"></script>';
            const html = renderAuthCallback(entryScript, 2);
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
      let authCallbackJs = '';
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'chunk' && chunk.isEntry) {
          if (chunk.name === 'catalog') catalogJs = fileName;
          if (chunk.name === 'recipe') recipeJs = fileName;
          if (chunk.name === 'auth-callback') authCallbackJs = fileName;
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

      // Generate OAuth callback page
      if (authCallbackJs) {
        const authScript = `<script type="module" src="../../${authCallbackJs}"></script>`;
        const authHtml = renderAuthCallback(authScript, 2);
        this.emitFile({
          type: 'asset',
          fileName: 'auth/callback/index.html',
          source: authHtml,
        });
      }
    },
  };
}
