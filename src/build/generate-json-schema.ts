/**
 * Generate config/recipe-schema.json from the Zod schema.
 *
 * Run: npx tsx src/build/generate-json-schema.ts
 *
 * This eliminates dual-maintenance between schema.ts and recipe-schema.json.
 * The Zod schema is the single source of truth; this script produces the
 * JSON Schema (Draft 2020-12) used by editors and external validators.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { recipeSchema } from '../domain/recipe/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outPath = resolve(__dirname, '../../config/recipe-schema.json');

const generated = z.toJSONSchema(recipeSchema, {
  io: 'input',
  target: 'draft-2020-12',
}) as Record<string, unknown>;

// Inject $id matching the previous hand-maintained schema
generated['$id'] = 'https://github.com/lauriliivamagi/recipes/blob/master/config/recipe-schema.json';

const output = JSON.stringify(generated, null, 2) + '\n';
writeFileSync(outPath, output, 'utf-8');

console.log(`Generated ${outPath}`);
