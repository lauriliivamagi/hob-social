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

/** Duration or range in seconds. min is lower bound; max is upper bound. */
const timeRangeSchema = z.object({
  min: z.number().nonnegative().describe('Lower bound (or exact) duration in seconds'),
  max: z.number().nonnegative().optional().describe('Upper bound duration in seconds'),
}).strict().refine(
  (r) => r.max === undefined || r.min <= r.max,
  { error: () => 'TimeRange min must be <= max', path: ['max'] },
);

/** Helper: get the upper bound of a TimeRange (max if present, else min). */
function timeRangeMax(r: { min: number; max?: number }): number {
  return r.max ?? r.min;
}

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

const capacitySchema = z.object({
  amount: z.number().positive().describe('Capacity amount'),
  unit: z.string().min(1).describe('Capacity unit (e.g., L, cm)'),
}).strict();

const equipmentSchema = z.object({
  id: equipmentIdSchema.describe('Unique identifier for this piece of equipment'),
  name: z.string().min(1).describe('Human-readable equipment name'),
  count: z.number().int().min(1).describe('Number of this item needed'),
  capacity: capacitySchema.optional().describe('Physical capacity (e.g., 5L pot, 30cm pan)'),
}).strict();

const operationEquipmentSchema = z.object({
  use: equipmentIdSchema.describe('Equipment ID being used'),
  release: z.boolean().describe('If true, equipment is freed after this operation'),
}).strict();

const temperatureSchema = z.object({
  min: z.number().describe('Lower bound (or exact) temperature'),
  max: z.number().optional().describe('Upper bound temperature'),
  unit: z.enum(['C', 'F']).describe('Temperature unit'),
}).strict().refine(
  (t) => t.max === undefined || t.min <= t.max,
  { error: () => 'Temperature min must be <= max', path: ['max'] },
);

const operationSchema = z.object({
  id: operationIdSchema.describe('Unique identifier for this operation'),
  type: z.enum(['prep', 'cook', 'rest', 'assemble']).describe('Operation category'),
  action: z.string().min(1).describe('Verb describing the operation (e.g., dice, sauté, simmer, boil)'),
  ingredients: z.array(ingredientIdSchema).describe('Ingredient IDs consumed by this operation'),
  depends: z.array(operationIdSchema).describe('Operation IDs that must complete before this one'),
  equipment: z.array(operationEquipmentSchema).describe('Equipment used by this operation (empty array if none)'),
  time: timeRangeSchema.describe('Total duration in seconds'),
  activeTime: timeRangeSchema.describe('Seconds of active attention required'),
  scalable: z.boolean().describe('If false, time does not change when scaling servings'),
  temperature: temperatureSchema.optional().describe('Target temperature or range'),
  details: z.string().optional().describe('Additional instructions for this operation'),
  subProduct: subProductIdSchema.optional().describe('Sub-product ID this operation contributes to'),
  output: subProductIdSchema.optional().describe('Sub-product ID this operation produces'),
}).strict().refine(
  (op) => timeRangeMax(op.activeTime) <= timeRangeMax(op.time),
  { error: (ctx) => {
    const op = ctx.input as { activeTime: { min: number; max?: number }; time: { min: number; max?: number } };
    return `activeTime max (${timeRangeMax(op.activeTime)}) must be <= time max (${timeRangeMax(op.time)})`;
  }, path: ['activeTime'] },
);

const subProductSchema = z.object({
  id: subProductIdSchema.describe('Unique identifier for this sub-product'),
  name: z.string().min(1).describe('Human-readable name for the intermediate product'),
  finalOp: operationIdSchema.describe('Operation ID that produces this sub-product'),
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
      relaxed: timeRangeSchema.describe('Total time in seconds with all prep front-loaded (relaxed mode)'),
      optimized: timeRangeSchema.describe('Total time in seconds with prep distributed into idle windows (optimized mode)'),
    }).strict(),
    difficulty: z.enum(['easy', 'medium', 'hard']).describe('Recipe difficulty level'),
    energyTier: z.enum(['zombie', 'moderate', 'project']).optional().describe('Derived from DAG decision count + active time'),
    notes: z.string().optional().describe('Optional free-form notes about the recipe'),
  }).strict();

  return z.object({
    meta: recipeMetaSchema.describe('Recipe metadata'),
    ingredients: z.array(ingredientSchema).min(1).describe('Ingredients used in this recipe'),
    equipment: z.array(equipmentSchema).describe('Equipment needed for this recipe'),
    operations: z.array(operationSchema).min(1).describe('Ordered operations forming the recipe DAG'),
    subProducts: z.array(subProductSchema).describe('Intermediate products created during cooking'),
  }).strict().describe('Structured recipe data model for the Recipe Visualization App')
    .superRefine((recipe, ctx) => {
      const operations = recipe.operations ?? [];
      const equipment = recipe.equipment ?? [];
      const subProducts = recipe.subProducts ?? [];
      const ingredients = recipe.ingredients ?? [];

      const operationIds = new Set<string>(operations.map(op => op.id));
      const equipmentIds = new Set<string>(equipment.map(eq => eq.id));
      const ingredientIds = new Set<string>(ingredients.map(ing => ing.id));

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

      // 3. operation.subProduct must resolve to a sub-product ID
      const subProductIds = new Set<string>(subProducts.map(sp => sp.id));
      operations.forEach((op, i) => {
        if (op.subProduct && !subProductIds.has(op.subProduct)) {
          ctx.addIssue({
            code: 'custom',
            message: `Operation "${op.id}" references unknown subProduct "${op.subProduct}"`,
            path: ['operations', i, 'subProduct'],
          });
        }
      });

      // 4. operation.equipment[].use must resolve to an equipment ID
      operations.forEach((op, i) => {
        op.equipment.forEach((eq, j) => {
          if (!equipmentIds.has(eq.use)) {
            ctx.addIssue({
              code: 'custom',
              message: `Operation "${op.id}" references unknown equipment "${eq.use}"`,
              path: ['operations', i, 'equipment', j, 'use'],
            });
          }
        });
      });

      // 5. operation.ingredients must resolve to ingredient IDs
      operations.forEach((op, i) => {
        op.ingredients.forEach((ref, j) => {
          if (!ingredientIds.has(ref)) {
            ctx.addIssue({
              code: 'custom',
              message: `Operation "${op.id}" ingredient "${ref}" does not match any ingredient ID`,
              path: ['operations', i, 'ingredients', j],
            });
          }
        });
      });

      // 6. operation.depends must resolve to operation IDs
      operations.forEach((op, i) => {
        op.depends.forEach((ref, j) => {
          if (!operationIds.has(ref)) {
            ctx.addIssue({
              code: 'custom',
              message: `Operation "${op.id}" depends on unknown operation "${ref}"`,
              path: ['operations', i, 'depends', j],
            });
          }
        });
      });
    });
}

// ---------------------------------------------------------------------------
// Default instance — wired from config/tags.json
// ---------------------------------------------------------------------------
const validTags = new Set(Object.values(tagsConfig as Record<string, string[]>).flat());
export const recipeSchema = createRecipeSchema({ validTags });
