#!/usr/bin/env node

/**
 * Recipe Build Script
 *
 * Reads recipe JSON files, computes optimized/relaxed schedules,
 * and generates self-contained HTML files using templates.
 *
 * Usage:
 *   node lib/recipe-build.js              # Build all recipes + index
 *   node lib/recipe-build.js --slug NAME  # Build single recipe
 *   node lib/recipe-build.js --index-only # Rebuild index page only
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';
import { computeSchedule, computeTotalTime, validateDag } from './recipe-optimize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const RECIPES_DIR = join(ROOT, 'recipes');
const SITE_DIR = join(ROOT, 'site');
const TEMPLATES_DIR = join(ROOT, 'templates');
const I18N_DIR = join(TEMPLATES_DIR, 'i18n');

/**
 * Recursively find all .json files in a directory
 */
function findJsonFiles(dir) {
  const results = [];
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findJsonFiles(full));
    } else if (entry.name.endsWith('.json')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * Load i18n strings for a given language, falling back to English
 */
function loadI18n(language) {
  const langFile = join(I18N_DIR, `${language}.json`);
  const enFile = join(I18N_DIR, 'en.json');

  const en = JSON.parse(readFileSync(enFile, 'utf8'));
  if (language === 'en' || !existsSync(langFile)) {
    return en;
  }

  const lang = JSON.parse(readFileSync(langFile, 'utf8'));
  // Deep merge: lang overrides en
  return deepMerge(en, lang);
}

function deepMerge(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base[key]) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Build a single recipe HTML file
 */
function buildRecipe(recipePath) {
  const recipe = JSON.parse(readFileSync(recipePath, 'utf8'));
  const validation = validateDag(recipe);
  if (!validation.valid) {
    console.error(`  ✗ DAG validation failed for ${recipe.meta.slug}:`);
    validation.errors.forEach(e => console.error(`    - ${e}`));
    return null;
  }

  const relaxed = computeSchedule(recipe, 'relaxed');
  const optimized = computeSchedule(recipe, 'optimized');

  // Update totalTime in recipe meta with computed values
  recipe.meta.totalTime = {
    relaxed: computeTotalTime(relaxed),
    optimized: computeTotalTime(optimized)
  };

  const i18n = loadI18n(recipe.meta.language || 'en');
  const template = readFileSync(join(TEMPLATES_DIR, 'recipe.html'), 'utf8');

  const html = template
    .replace('{{RECIPE_JSON}}', JSON.stringify(recipe))
    .replace('{{I18N_JSON}}', JSON.stringify(i18n))
    .replace('{{SCHEDULE_RELAXED_JSON}}', JSON.stringify(relaxed))
    .replace('{{SCHEDULE_OPTIMIZED_JSON}}', JSON.stringify(optimized))
    .replace(/\{\{MANIFEST_PATH\}\}/g, '../app.webmanifest')
    .replace(/\{\{SW_PATH\}\}/g, '../sw.js')
    .replace(/\{\{ICON_PATH\}\}/g, '../icon-512.png')
    .replace(/\{\{FAVICON_PATH\}\}/g, '../icon.svg');

  // Determine output path: site/<category>/<slug>.html
  const relPath = relative(RECIPES_DIR, recipePath);
  const outPath = join(SITE_DIR, relPath.replace(/\.json$/, '.html'));

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, 'utf8');

  console.log(`  ✓ ${recipe.meta.title} → ${relative(ROOT, outPath)}`);
  return {
    title: recipe.meta.title,
    slug: recipe.meta.slug,
    category: dirname(relPath),
    tags: recipe.meta.tags || [],
    difficulty: recipe.meta.difficulty || 'medium',
    totalTime: recipe.meta.totalTime,
    servings: recipe.meta.servings,
    language: recipe.meta.language || 'en',
    url: relPath.replace(/\.json$/, '.html')
  };
}

/**
 * Build the index page from recipe metadata
 */
function buildIndex(recipeMetas) {
  const i18n = loadI18n('en'); // Index page uses default language
  const template = readFileSync(join(TEMPLATES_DIR, 'index.html'), 'utf8');

  const html = template
    .replace('{{RECIPES_JSON}}', JSON.stringify(recipeMetas))
    .replace('{{I18N_JSON}}', JSON.stringify(i18n))
    .replace(/\{\{MANIFEST_PATH\}\}/g, 'app.webmanifest')
    .replace(/\{\{SW_PATH\}\}/g, 'sw.js')
    .replace(/\{\{ICON_PATH\}\}/g, 'icon-512.png')
    .replace(/\{\{FAVICON_PATH\}\}/g, 'icon.svg');

  mkdirSync(SITE_DIR, { recursive: true });
  writeFileSync(join(SITE_DIR, 'index.html'), html, 'utf8');

  console.log(`  ✓ Index page → site/index.html (${recipeMetas.length} recipes)`);
}

/**
 * Collect metadata from all recipe JSON files (without building HTML)
 */
function collectRecipeMetas() {
  const files = findJsonFiles(RECIPES_DIR);
  const metas = [];
  for (const file of files) {
    const recipe = JSON.parse(readFileSync(file, 'utf8'));
    const relPath = relative(RECIPES_DIR, file);
    metas.push({
      title: recipe.meta.title,
      slug: recipe.meta.slug,
      category: dirname(relPath),
      tags: recipe.meta.tags || [],
      difficulty: recipe.meta.difficulty || 'medium',
      totalTime: recipe.meta.totalTime,
      servings: recipe.meta.servings,
      language: recipe.meta.language || 'en',
      url: relPath.replace(/\.json$/, '.html')
    });
  }
  return metas;
}

/**
 * Copy PWA static assets (manifest, service worker, icons) to site/
 */
function copyStaticAssets() {
  mkdirSync(SITE_DIR, { recursive: true });
  const assets = ['app.webmanifest', 'sw.js', 'icon.svg', 'icon-512.png', 'icon-maskable.png'];
  for (const name of assets) {
    copyFileSync(join(TEMPLATES_DIR, name), join(SITE_DIR, name));
  }
  console.log(`  ✓ Static assets (manifest, SW, icons)`);
}

// --- Main ---

const args = process.argv.slice(2);
const indexOnly = args.includes('--index-only');
const slugIdx = args.indexOf('--slug');
const targetSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

console.log('Recipe Build');
console.log('============');

if (indexOnly) {
  // Rebuild index only, collecting metadata from JSON files
  console.log('\nRebuilding index page...');
  const metas = collectRecipeMetas();
  buildIndex(metas);
  copyStaticAssets();
} else if (targetSlug) {
  // Build a single recipe
  console.log(`\nBuilding recipe: ${targetSlug}`);
  const files = findJsonFiles(RECIPES_DIR);
  const match = files.find(f => {
    const recipe = JSON.parse(readFileSync(f, 'utf8'));
    return recipe.meta.slug === targetSlug;
  });

  if (!match) {
    console.error(`  ✗ Recipe not found: ${targetSlug}`);
    process.exit(1);
  }

  const meta = buildRecipe(match);
  if (meta) {
    // Also rebuild the index
    console.log('\nRebuilding index...');
    const metas = collectRecipeMetas();
    buildIndex(metas);
    copyStaticAssets();
  }
} else {
  // Build all recipes
  const files = findJsonFiles(RECIPES_DIR);
  console.log(`\nFound ${files.length} recipe(s)`);

  const metas = [];
  for (const file of files) {
    const meta = buildRecipe(file);
    if (meta) metas.push(meta);
  }

  console.log('\nBuilding index...');
  buildIndex(metas);
  copyStaticAssets();
}

console.log('\nDone.');
