/**
 * Generate JSON Schema files from Zod schemas.
 *
 * Run: npx tsx src/build/generate-json-schema.ts
 *
 * This eliminates dual-maintenance between schema.ts and JSON Schema files.
 * The Zod schemas are the single source of truth; this script produces the
 * JSON Schemas (Draft 2020-12) used by editors and external validators.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { recipeSchema } from '../../domain/src/recipe/schema.js';
import { poolSchema, themeNightsSchema, staplesSchema } from '../../domain/src/planning/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, '../config');

function generateSchema(
  schema: z.ZodType,
  fileName: string,
  schemaId: string,
): void {
  const generated = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
  }) as Record<string, unknown>;

  generated['$id'] = schemaId;

  const output = JSON.stringify(generated, null, 2) + '\n';
  const outPath = resolve(configDir, fileName);
  writeFileSync(outPath, output, 'utf-8');
  console.log(`Generated ${outPath}`);
}

const baseUrl = 'https://github.com/lauriliivamagi/hob-social/blob/master/config';

generateSchema(
  recipeSchema,
  'recipe-schema.json',
  `${baseUrl}/recipe-schema.json`,
);

generateSchema(
  poolSchema,
  'pool-schema.json',
  `${baseUrl}/pool-schema.json`,
);

generateSchema(
  themeNightsSchema,
  'themes-schema.json',
  `${baseUrl}/themes-schema.json`,
);

generateSchema(
  staplesSchema,
  'staples-schema.json',
  `${baseUrl}/staples-schema.json`,
);
