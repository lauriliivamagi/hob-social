// ---------------------------------------------------------------------------
// Branded-type helper (zero runtime cost)
// ---------------------------------------------------------------------------
type Brand<T, B extends string> = T & { readonly __brand: B };

// ---------------------------------------------------------------------------
// Branded ID types — prevent mixing up ID categories at compile time
// ---------------------------------------------------------------------------
export type OperationId = Brand<string, 'OperationId'>;
export type IngredientId = Brand<string, 'IngredientId'>;
export type EquipmentId = Brand<string, 'EquipmentId'>;
export type SubProductId = Brand<string, 'SubProductId'>;
export type RecipeSlug = Brand<string, 'RecipeSlug'>;

// ---------------------------------------------------------------------------
// Value Objects
// ---------------------------------------------------------------------------

/** Amount + unit paired together. Prevents passing wrong unit for a quantity. */
export interface Quantity {
  readonly amount: number;
  readonly unit: string;
}

// ---------------------------------------------------------------------------
// Entity interfaces
// ---------------------------------------------------------------------------

export interface RecipeMeta {
  title: string;
  slug: RecipeSlug;
  language: string;
  source?: string;
  originalText: string;
  tags: string[];
  servings: number;
  totalTime: { relaxed: number; optimized: number };
  difficulty: 'easy' | 'medium' | 'hard';
  notes?: string;
}

export interface Ingredient {
  id: IngredientId;
  name: string;
  quantity: Quantity;
  group: string;
}

export interface Equipment {
  id: EquipmentId;
  name: string;
  count: number;
}

export interface OperationEquipment {
  use: EquipmentId;
  release: boolean;
}

export interface Operation {
  id: OperationId;
  type: 'prep' | 'cook';
  action: string;
  inputs: string[];
  equipment?: OperationEquipment;
  time: number;
  activeTime: number;
  scalable?: boolean;
  heat?: string;
  details?: string;
  output?: SubProductId;
}

export interface SubProduct {
  id: SubProductId;
  name: string;
  finalOp: OperationId;
}

export interface FinishStep {
  action: string;
  inputs: string[];
  details?: string;
}

// ---------------------------------------------------------------------------
// Aggregate Root
// ---------------------------------------------------------------------------

export interface Recipe {
  meta: RecipeMeta;
  ingredients: Ingredient[];
  equipment: Equipment[];
  operations: Operation[];
  subProducts: SubProduct[];
  finishSteps: FinishStep[];
}
