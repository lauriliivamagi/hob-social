/**
 * Validation helper for promptfoo assertions.
 * Reads JSON from a file path argument, runs parseRecipe(), exits 0 on success or 1 on failure.
 * Invoked via: npx tsx evals/validate-recipe.ts /path/to/recipe.json
 */
import { readFileSync } from 'fs';
import { parseRecipe } from '../src/domain/recipe/parse.js';

const filePath = process.argv[2];
if (!filePath) {
  console.log(JSON.stringify({ valid: false, error: 'No file path provided' }));
  process.exit(1);
}

try {
  const raw = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(raw);
  parseRecipe(json);
  console.log(JSON.stringify({ valid: true }));
} catch (err) {
  console.log(JSON.stringify({ valid: false, error: (err as Error).message }));
  process.exit(1);
}
