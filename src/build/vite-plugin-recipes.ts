import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  readFileSync,
  readdirSync,
  existsSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
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

  function renderIndex(): string {
    const template = readFileSync(join(templatesDir, 'index.html'), 'utf8');
    const i18n = loadI18n('en', i18nDir);
    return template
      .replace('{{RECIPES_JSON}}', JSON.stringify(recipeMetas))
      .replace('{{I18N_JSON}}', JSON.stringify(i18n))
      .replace(/\{\{VERSION\}\}/g, appVersion)
      .replace(/\{\{MANIFEST_PATH\}\}/g, 'manifest.webmanifest')
      .replace(/\{\{SW_PATH\}\}/g, 'sw.js')
      .replace(/\{\{ICON_PATH\}\}/g, 'icon-512.png')
      .replace(/\{\{FAVICON_PATH\}\}/g, 'icon.svg');
  }

  function renderRecipe(data: RecipeData, depth: number): string {
    const template = readFileSync(join(templatesDir, 'recipe.html'), 'utf8');
    const prefix = depth === 0 ? './' : '../'.repeat(depth);
    return template
      .replace('{{RECIPE_JSON}}', JSON.stringify(data.recipe))
      .replace('{{I18N_JSON}}', JSON.stringify(data.i18n))
      .replace('{{SCHEDULE_RELAXED_JSON}}', JSON.stringify(data.relaxed))
      .replace('{{SCHEDULE_OPTIMIZED_JSON}}', JSON.stringify(data.optimized))
      .replace(/\{\{VERSION\}\}/g, appVersion)
      .replace(/\{\{MANIFEST_PATH\}\}/g, `${prefix}manifest.webmanifest`)
      .replace(/\{\{SW_PATH\}\}/g, `${prefix}sw.js`)
      .replace(/\{\{ICON_PATH\}\}/g, `${prefix}icon-512.png`)
      .replace(/\{\{FAVICON_PATH\}\}/g, `${prefix}icon.svg`);
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

      // Pre-hook: serve all generated pages and static assets before
      // Vite's built-in SPA fallback can intercept them
      const staticMimeTypes: Record<string, string> = {
        'icon.svg': 'image/svg+xml',
        'icon-512.png': 'image/png',
        'icon-maskable.png': 'image/png',
      };
      server.middlewares.use(
        async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          const reqUrl = req.url ?? '/';
          const stripped = reqUrl.replace(/^\//, '').split('?')[0]!;

          // Serve static PWA assets from templates/ at any path depth
          const basename = stripped.split('/').pop() ?? '';
          if (basename in staticMimeTypes) {
            const filePath = join(templatesDir, basename);
            try {
              const content = await readFile(filePath);
              res.setHeader('Content-Type', staticMimeTypes[basename]!);
              res.end(content);
              return;
            } catch {
              // File doesn't exist in templates, fall through
            }
          }

          // Serve index page
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

          // Serve recipe pages
          const recipeData = recipeDataMap.get(stripped);
          if (recipeData) {
            const depth = stripped.split('/').length - 1;
            const html = renderRecipe(recipeData, depth);
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

      // Generate index HTML — replace dev entry path with production bundle
      const indexHtml = renderIndex()
        .replace(
          '<script type="module" src="/src/entries/catalog.ts"></script>',
          `<script type="module" src="/${catalogJs}"></script>`,
        );
      this.emitFile({
        type: 'asset',
        fileName: 'index.html',
        source: indexHtml,
      });

      // Generate recipe HTML files — replace dev entry path with production bundle
      for (const [url, data] of recipeDataMap) {
        const depth = url.split('/').length - 1;
        const prefix = depth === 0 ? './' : '../'.repeat(depth);
        const html = renderRecipe(data, depth)
          .replace(
            '<script type="module" src="/src/entries/recipe.ts"></script>',
            `<script type="module" src="${prefix}${recipeJs}"></script>`,
          );
        this.emitFile({
          type: 'asset',
          fileName: url,
          source: html,
        });
      }

      // Copy static assets
      const staticAssets = [
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
