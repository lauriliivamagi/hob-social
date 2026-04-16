import type {
  Recipe,
  Ingredient,
  Equipment,
  Operation,
  Quantity,
  TimeRange,
  IngredientId,
  EquipmentId,
  OperationId,
  SubProductId,
  RecipeSlug,
} from '@recipe/domain';
import type { SubProduct } from '@recipe/domain/recipe/types.js';
import type * as Lex from '../generated/types/social/hob/temp/recipe.js';
import { fromLexiconDecimal, toLexiconDecimal } from './decimal.js';
import { fromLexiconQuantity, toLexiconQuantity } from './quantity.js';
import { fromLexiconTemperature, toLexiconTemperature } from './temperature.js';

export interface RecipeToLexiconOptions {
  /** ISO-8601 timestamp. Defaults to `new Date().toISOString()`. */
  createdAt?: string;
}

export function recipeToLexicon(
  recipe: Recipe,
  options: RecipeToLexiconOptions = {},
): Lex.Record {
  return {
    $type: 'social.hob.temp.recipe',
    meta: metaToLexicon(recipe.meta),
    ingredients: recipe.ingredients.map(ingredientToLexicon),
    equipment: recipe.equipment.map(equipmentToLexicon),
    operations: recipe.operations.map(operationToLexicon),
    subProducts: recipe.subProducts.map(subProductToLexicon),
    createdAt: options.createdAt ?? new Date().toISOString(),
  };
}

export function lexiconToRecipe(record: Lex.Record): Recipe {
  return {
    meta: metaFromLexicon(record.meta),
    ingredients: record.ingredients.map(ingredientFromLexicon),
    equipment: record.equipment.map(equipmentFromLexicon),
    operations: record.operations.map(operationFromLexicon),
    subProducts: record.subProducts.map(subProductFromLexicon),
  };
}

// ---------------------------------------------------------------------------
// meta
// ---------------------------------------------------------------------------

function metaToLexicon(m: Recipe['meta']): Lex.Meta {
  return {
    title: m.title,
    slug: m.slug,
    language: m.language,
    ...(m.source !== undefined && { source: m.source }),
    originalText: m.originalText,
    tags: [...m.tags],
    servings: m.servings,
    totalTime: {
      relaxed: timeRangeToLexicon(m.totalTime.relaxed),
      optimized: timeRangeToLexicon(m.totalTime.optimized),
    },
    difficulty: m.difficulty,
    ...(m.energyTier !== undefined && { energyTier: m.energyTier }),
    ...(m.notes !== undefined && { notes: m.notes }),
  };
}

function metaFromLexicon(m: Lex.Meta): Recipe['meta'] {
  const difficulty = narrowDifficulty(m.difficulty);
  const energyTier = narrowEnergyTier(m.energyTier);
  return {
    title: m.title,
    slug: m.slug as RecipeSlug,
    language: m.language,
    ...(m.source !== undefined && { source: m.source }),
    originalText: m.originalText,
    tags: [...m.tags],
    servings: m.servings,
    totalTime: {
      relaxed: timeRangeFromLexicon(m.totalTime.relaxed),
      optimized: timeRangeFromLexicon(m.totalTime.optimized),
    },
    difficulty,
    ...(energyTier !== undefined && { energyTier }),
    ...(m.notes !== undefined && { notes: m.notes }),
  };
}

function narrowDifficulty(d: string): 'easy' | 'medium' | 'hard' {
  if (d === 'easy' || d === 'medium' || d === 'hard') return d;
  throw new Error(`Unknown difficulty: ${d}`);
}

function narrowEnergyTier(
  t: string | undefined,
): 'zombie' | 'moderate' | 'project' | undefined {
  if (t === undefined) return undefined;
  if (t === 'zombie' || t === 'moderate' || t === 'project') return t;
  throw new Error(`Unknown energyTier: ${t}`);
}

// ---------------------------------------------------------------------------
// time range (already integer seconds, no decimal needed)
// ---------------------------------------------------------------------------

function timeRangeToLexicon(t: TimeRange): Lex.TimeRange {
  return {
    min: t.min,
    ...(t.max !== undefined && { max: t.max }),
  };
}

function timeRangeFromLexicon(t: Lex.TimeRange): TimeRange {
  return {
    min: t.min,
    ...(t.max !== undefined && { max: t.max }),
  };
}

// ---------------------------------------------------------------------------
// ingredients
// ---------------------------------------------------------------------------

function ingredientToLexicon(i: Ingredient): Lex.Ingredient {
  return {
    id: i.id,
    name: i.name,
    ...(i.quantity && { quantity: toLexiconQuantity(i.quantity) }),
    group: i.group,
    ...(i.alternatives && {
      alternatives: i.alternatives.map((alt) => ({
        id: alt.id,
        name: alt.name,
        ...(alt.quantity && { quantity: toLexiconQuantity(alt.quantity) }),
        group: alt.group,
      })),
    }),
  };
}

function ingredientFromLexicon(i: Lex.Ingredient): Ingredient {
  const base = {
    id: i.id as IngredientId,
    name: i.name,
    group: i.group,
  };
  const quantity: Quantity | undefined = i.quantity
    ? fromLexiconQuantity(i.quantity)
    : undefined;
  const alternatives = i.alternatives?.map((alt) => ({
    id: alt.id as IngredientId,
    name: alt.name,
    ...(alt.quantity && { quantity: fromLexiconQuantity(alt.quantity) }),
    group: alt.group,
  }));
  return {
    ...base,
    ...(quantity && { quantity }),
    ...(alternatives && { alternatives }),
  };
}

// ---------------------------------------------------------------------------
// equipment
// ---------------------------------------------------------------------------

function equipmentToLexicon(e: Equipment): Lex.Equipment {
  return {
    id: e.id,
    name: e.name,
    count: e.count,
    ...(e.capacity && {
      capacity: {
        min: toLexiconDecimal(e.capacity.min),
        unit: e.capacity.unit,
      },
    }),
  };
}

function equipmentFromLexicon(e: Lex.Equipment): Equipment {
  return {
    id: e.id as EquipmentId,
    name: e.name,
    count: e.count,
    ...(e.capacity && {
      capacity: {
        min: fromLexiconDecimal(e.capacity.min),
        unit: e.capacity.unit,
      },
    }),
  };
}

// ---------------------------------------------------------------------------
// operations
// ---------------------------------------------------------------------------

function operationToLexicon(op: Operation): Lex.Operation {
  return {
    id: op.id,
    type: op.type,
    action: op.action,
    ingredients: op.ingredients.map((id) => id as string),
    depends: op.depends.map((id) => id as string),
    equipment: op.equipment.map((eq) => ({ use: eq.use, release: eq.release })),
    time: timeRangeToLexicon(op.time),
    activeTime: timeRangeToLexicon(op.activeTime),
    scalable: op.scalable,
    ...(op.temperature && { temperature: toLexiconTemperature(op.temperature) }),
    ...(op.details !== undefined && { details: op.details }),
    ...(op.subProduct !== undefined && { subProduct: op.subProduct }),
    ...(op.output !== undefined && { output: op.output }),
  };
}

function operationFromLexicon(op: Lex.Operation): Operation {
  const type = narrowOperationType(op.type);
  return {
    id: op.id as OperationId,
    type,
    action: op.action,
    ingredients: op.ingredients.map((id) => id as IngredientId),
    depends: op.depends.map((id) => id as OperationId),
    equipment: op.equipment.map((eq) => ({
      use: eq.use as EquipmentId,
      release: eq.release,
    })),
    time: timeRangeFromLexicon(op.time),
    activeTime: timeRangeFromLexicon(op.activeTime),
    scalable: op.scalable,
    ...(op.temperature && { temperature: fromLexiconTemperature(op.temperature) }),
    ...(op.details !== undefined && { details: op.details }),
    ...(op.subProduct !== undefined && { subProduct: op.subProduct as SubProductId }),
    ...(op.output !== undefined && { output: op.output as SubProductId }),
  };
}

// ---------------------------------------------------------------------------
// sub-products
// ---------------------------------------------------------------------------

function narrowOperationType(t: string): 'prep' | 'cook' | 'rest' | 'assemble' {
  if (t === 'prep' || t === 'cook' || t === 'rest' || t === 'assemble') return t;
  throw new Error(`Unknown operation type: ${t}`);
}

function subProductToLexicon(s: SubProduct): Lex.SubProduct {
  return {
    id: s.id,
    name: s.name,
    finalOp: s.finalOp,
  };
}

function subProductFromLexicon(s: Lex.SubProduct): SubProduct {
  return {
    id: s.id as SubProductId,
    name: s.name,
    finalOp: s.finalOp as OperationId,
  };
}
