import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { recipeSchema } from '@recipe/domain';
import { lexiconToRecipe, recipeToLexicon } from './recipe.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = resolve(__dirname, '../../../build/recipes');

function findJsonRecipes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...findJsonRecipes(full));
    else if (entry.endsWith('.json')) out.push(full);
  }
  return out;
}

describe('recipe adapter round-trip', () => {
  const paths = findJsonRecipes(RECIPES_DIR);

  it('finds at least one fixture', () => {
    expect(paths.length).toBeGreaterThan(0);
  });

  it.each(paths.map((p) => [p.replace(RECIPES_DIR + '/', ''), p]))(
    '%s round-trips',
    (_label, path) => {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
      const recipe = recipeSchema.parse(raw);
      const lexRecord = recipeToLexicon(recipe, { createdAt: '2026-04-16T00:00:00.000Z' });
      const back = lexiconToRecipe(lexRecord);
      expect(back).toEqual(recipe);
    },
  );

  it('encodes createdAt as ISO string', () => {
    const raw = JSON.parse(readFileSync(paths[0]!, 'utf-8')) as unknown;
    const recipe = recipeSchema.parse(raw);
    const lexRecord = recipeToLexicon(recipe);
    expect(lexRecord.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('sets $type on the root record', () => {
    const raw = JSON.parse(readFileSync(paths[0]!, 'utf-8')) as unknown;
    const recipe = recipeSchema.parse(raw);
    const lexRecord = recipeToLexicon(recipe);
    expect(lexRecord.$type).toBe('social.hob.temp.recipe');
  });

  it('encodes decimal quantities as integer pairs', () => {
    const raw = JSON.parse(readFileSync(paths[0]!, 'utf-8')) as unknown;
    const recipe = recipeSchema.parse(raw);
    const lexRecord = recipeToLexicon(recipe);
    for (const ing of lexRecord.ingredients) {
      if (ing.quantity) {
        expect(Number.isInteger(ing.quantity.min.value)).toBe(true);
        expect(Number.isInteger(ing.quantity.min.scale)).toBe(true);
      }
    }
  });
});
