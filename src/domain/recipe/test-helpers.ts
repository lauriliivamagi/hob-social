/**
 * Test helpers for constructing domain objects with branded IDs
 * and value objects from plain literals.
 */
import type {
  Recipe,
  RecipeMeta,
  Ingredient,
  Equipment,
  Operation,
  OperationEquipment,
  SubProduct,
  FinishStep,
  OperationId,
  IngredientId,
  EquipmentId,
  SubProductId,
  RecipeSlug,
  Quantity,
} from './types.js';

// ---------------------------------------------------------------------------
// ID casting helpers
// ---------------------------------------------------------------------------
export const opId = (s: string) => s as OperationId;
export const ingId = (s: string) => s as IngredientId;
export const eqId = (s: string) => s as EquipmentId;
export const spId = (s: string) => s as SubProductId;
export const slug = (s: string) => s as RecipeSlug;

// ---------------------------------------------------------------------------
// Value object helpers
// ---------------------------------------------------------------------------
export const qty = (amount: number, unit: string): Quantity => ({ amount, unit });

// ---------------------------------------------------------------------------
// Factory for flat-format ingredient (matches JSON input shape)
// ---------------------------------------------------------------------------
export function ing(id: string, name: string, quantity: number, unit: string, group: string): Ingredient {
  return { id: ingId(id), name, quantity: qty(quantity, unit), group };
}

// ---------------------------------------------------------------------------
// Factory for operation
// ---------------------------------------------------------------------------
export function op(fields: {
  id: string;
  type: 'prep' | 'cook';
  action: string;
  inputs: string[];
  time: number;
  activeTime: number;
  equipment?: { use: string; release: boolean };
  scalable?: boolean;
  heat?: string;
  details?: string;
  output?: string;
}): Operation {
  return {
    ...fields,
    id: opId(fields.id),
    equipment: fields.equipment
      ? { use: eqId(fields.equipment.use), release: fields.equipment.release }
      : undefined,
    output: fields.output ? spId(fields.output) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Factory for equipment
// ---------------------------------------------------------------------------
export function equip(id: string, name: string, count: number): Equipment {
  return { id: eqId(id), name, count };
}

// ---------------------------------------------------------------------------
// Factory for sub-product
// ---------------------------------------------------------------------------
export function subProd(id: string, name: string, finalOp: string): SubProduct {
  return { id: spId(id), name, finalOp: opId(finalOp) };
}

// ---------------------------------------------------------------------------
// Recipe factory with defaults
// ---------------------------------------------------------------------------
export function makeRecipe(overrides: {
  meta?: Partial<RecipeMeta>;
  ingredients?: Ingredient[];
  equipment?: Equipment[];
  operations?: Operation[];
  subProducts?: SubProduct[];
  finishSteps?: FinishStep[];
} = {}): Recipe {
  return {
    meta: {
      title: 'Test',
      slug: slug('test'),
      language: 'en',
      originalText: '',
      tags: [],
      servings: 1,
      totalTime: { relaxed: 0, optimized: 0 },
      difficulty: 'easy',
      ...overrides.meta,
    },
    ingredients: overrides.ingredients ?? [],
    equipment: overrides.equipment ?? [],
    operations: overrides.operations ?? [],
    subProducts: overrides.subProducts ?? [],
    finishSteps: overrides.finishSteps ?? [],
  };
}
