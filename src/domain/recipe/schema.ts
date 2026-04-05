import { z } from 'zod';
import type {
  OperationId,
  IngredientId,
  EquipmentId,
  SubProductId,
  RecipeSlug,
  Quantity,
} from './types.js';
import tagsConfig from '../../../config/tags.json' with { type: 'json' };

const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const languagePattern = /^[a-z]{2}$/;

// ---------------------------------------------------------------------------
// ID schemas — cast to branded types at parse time
// ---------------------------------------------------------------------------
const operationIdSchema = z.string().regex(slugPattern).transform(s => s as OperationId);
const ingredientIdSchema = z.string().regex(slugPattern).transform(s => s as IngredientId);
const equipmentIdSchema = z.string().regex(slugPattern).transform(s => s as EquipmentId);
const subProductIdSchema = z.string().regex(slugPattern).transform(s => s as SubProductId);
const recipeSlugSchema = z.string().regex(slugPattern).transform(s => s as RecipeSlug);

// ---------------------------------------------------------------------------
// Value object schemas
// ---------------------------------------------------------------------------

/**
 * Ingredient schema: JSON input has flat `quantity` + `unit` fields.
 * Transform merges them into a Quantity value object.
 */
const ingredientSchema = z.object({
  id: ingredientIdSchema.describe('Unique identifier for this ingredient, referenced by operations'),
  name: z.string().min(1).describe('Human-readable ingredient name'),
  quantity: z.number().describe('Amount in the specified unit'),
  unit: z.string().min(1).describe('Unit of measurement (metric preferred: g, ml, whole, cloves, etc.)'),
  group: z.string().min(1).describe('Category for shopping list aggregation (e.g., vegetables, meat, dairy)'),
}).strict().transform(({ quantity, unit, ...rest }) => ({
  ...rest,
  quantity: { amount: quantity, unit } as Quantity,
}));

// ---------------------------------------------------------------------------
// Other schemas
// ---------------------------------------------------------------------------

const equipmentSchema = z.object({
  id: equipmentIdSchema.describe('Unique identifier for this piece of equipment'),
  name: z.string().min(1).describe('Human-readable equipment name'),
  count: z.number().int().min(1).describe('Number of this item needed'),
}).strict();

const operationEquipmentSchema = z.object({
  use: equipmentIdSchema.describe('Equipment ID being used'),
  release: z.boolean().describe('If true, equipment is freed after this operation'),
}).strict();

const operationSchema = z.object({
  id: operationIdSchema.describe('Unique identifier for this operation, referenced by other operations or finishSteps'),
  type: z.enum(['prep', 'cook']).describe('Whether this is a preparation or cooking step'),
  action: z.string().min(1).describe('Verb describing the operation (e.g., dice, sauté, simmer, boil)'),
  inputs: z.array(z.string().regex(slugPattern)).describe('Array of ingredient IDs or previous operation IDs forming the DAG edges'),
  equipment: operationEquipmentSchema.optional().describe('Equipment used by this operation'),
  time: z.number().describe('Total duration of the operation in minutes'),
  activeTime: z.number().describe('Minutes of active attention required (0 for passive operations like simmering)'),
  scalable: z.boolean().optional().describe('If false, time does not change when scaling servings. Defaults to true.'),
  heat: z.string().optional().describe('Heat level (e.g., low, medium, medium-high, high)'),
  details: z.string().optional().describe('Additional instructions for this operation'),
  output: subProductIdSchema.optional().describe('Sub-product ID this operation produces'),
}).strict().refine(
  (op) => op.activeTime <= op.time,
  { error: (ctx) => {
    const op = ctx.input as { activeTime: number; time: number };
    return `activeTime (${op.activeTime}) must be <= time (${op.time})`;
  }, path: ['activeTime'] },
);

const subProductSchema = z.object({
  id: subProductIdSchema.describe('Unique identifier for this sub-product'),
  name: z.string().min(1).describe('Human-readable name for the intermediate product'),
  finalOp: operationIdSchema.describe('Operation ID that produces this sub-product'),
}).strict();

const finishStepSchema = z.object({
  action: z.string().min(1).describe('Verb describing the finishing action'),
  inputs: z.array(z.string().regex(slugPattern)).min(1).describe('Array of operation IDs (always operation IDs, never sub-product IDs)'),
  details: z.string().optional().describe('Additional instructions for this finishing step'),
}).strict();

// ---------------------------------------------------------------------------
// Schema factory — accepts config dependencies for testability
// ---------------------------------------------------------------------------

export interface RecipeSchemaConfig {
  validTags: Set<string>;
}

export function createRecipeSchema(config: RecipeSchemaConfig) {
  const tagSchema = z.string().refine(
    (tag) => config.validTags.has(tag),
    { error: (ctx) => `Unknown tag "${ctx.input as string}"` },
  );

  const recipeMetaSchema = z.object({
    title: z.string().min(1).describe('Human-readable recipe title'),
    slug: recipeSlugSchema.describe('URL-safe identifier, matches the filename without .json'),
    language: z.string().regex(languagePattern).describe('ISO 639-1 two-letter language code'),
    source: z.string().regex(/^https?:\/\//).optional().describe('Optional URL of the original recipe'),
    originalText: z.string().min(1).describe('Full original recipe text in markdown for side-by-side review'),
    tags: z.array(tagSchema).describe('Categorization tags for filtering and search'),
    servings: z.number().positive().describe('Number of servings the recipe yields'),
    totalTime: z.object({
      relaxed: z.number().nonnegative().describe('Total time in minutes with all prep front-loaded (relaxed mode)'),
      optimized: z.number().nonnegative().describe('Total time in minutes with prep distributed into idle windows (optimized mode)'),
    }).strict(),
    difficulty: z.enum(['easy', 'medium', 'hard']).describe('Recipe difficulty level'),
    notes: z.string().optional().describe('Optional free-form notes about the recipe'),
  }).strict();

  return z.object({
    meta: recipeMetaSchema.describe('Recipe metadata'),
    ingredients: z.array(ingredientSchema).min(1).describe('Ingredients used in this recipe'),
    equipment: z.array(equipmentSchema).describe('Equipment needed for this recipe'),
    operations: z.array(operationSchema).min(1).describe('Ordered operations forming the recipe DAG'),
    subProducts: z.array(subProductSchema).describe('Intermediate products created during cooking'),
    finishSteps: z.array(finishStepSchema).min(1).describe('Final plating and serving steps'),
  }).strict().describe('Structured recipe data model for the Recipe Visualization App')
    .superRefine((recipe, ctx) => {
      // Guard: only run cross-entity checks if arrays are present
      const operations = recipe.operations ?? [];
      const equipment = recipe.equipment ?? [];
      const subProducts = recipe.subProducts ?? [];
      const ingredients = recipe.ingredients ?? [];

      const operationIds = new Set(operations.map(op => op.id));
      const equipmentIds = new Set(equipment.map(eq => eq.id));
      const ingredientIds = new Set(ingredients.map(ing => ing.id));

      // 1. Unique IDs within each entity type
      const checkUnique = (items: { id: string }[], label: string, pathPrefix: string) => {
        const seen = new Set<string>();
        items.forEach((item, i) => {
          if (seen.has(item.id)) {
            ctx.addIssue({
              code: 'custom',
              message: `Duplicate ${label} ID "${item.id}"`,
              path: [pathPrefix, i, 'id'],
            });
          }
          seen.add(item.id);
        });
      };
      checkUnique(ingredients, 'ingredient', 'ingredients');
      checkUnique(operations, 'operation', 'operations');
      checkUnique(equipment, 'equipment', 'equipment');
      checkUnique(subProducts, 'subProduct', 'subProducts');

      // 2. subProduct.finalOp must resolve to an operation ID
      subProducts.forEach((sp, i) => {
        if (!operationIds.has(sp.finalOp)) {
          ctx.addIssue({
            code: 'custom',
            message: `subProduct "${sp.id}" references unknown operation "${sp.finalOp}"`,
            path: ['subProducts', i, 'finalOp'],
          });
        }
      });

      // 3. operation.equipment.use must resolve to an equipment ID
      operations.forEach((op, i) => {
        if (op.equipment && !equipmentIds.has(op.equipment.use)) {
          ctx.addIssue({
            code: 'custom',
            message: `Operation "${op.id}" references unknown equipment "${op.equipment.use}"`,
            path: ['operations', i, 'equipment', 'use'],
          });
        }
      });
    });
}

// ---------------------------------------------------------------------------
// Default instance — wired from config/tags.json
// ---------------------------------------------------------------------------
const validTags = new Set(Object.values(tagsConfig as Record<string, string[]>).flat());
export const recipeSchema = createRecipeSchema({ validTags });
