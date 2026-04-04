import type { Recipe, Ingredient, Operation, Equipment } from '../recipe/types.js';

export type ValidationResult = { valid: true } | { valid: false; errors: string[] };
export type RefKind = 'ingredient' | 'operation' | 'unknown';

export function indexById<T extends { id: string }>(items: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(item.id, item);
  return map;
}

export function classifyRef(
  ref: string,
  ingredientMap: Map<string, Ingredient>,
  operationMap: Map<string, Operation>,
): RefKind {
  if (ingredientMap.has(ref)) return 'ingredient';
  if (operationMap.has(ref)) return 'operation';
  return 'unknown';
}

export function validateDag(recipe: Recipe): ValidationResult {
  const errors: string[] = [];
  const ingredients = recipe.ingredients || [];
  const operations = recipe.operations || [];
  const equipment = recipe.equipment || [];
  const ingredientMap = indexById(ingredients);
  const operationMap = indexById(operations);
  const equipmentMap = indexById(equipment);

  // 1. Check all input references resolve
  for (const op of operations) {
    for (const ref of op.inputs || []) {
      const kind = classifyRef(ref, ingredientMap, operationMap);
      if (kind === 'unknown') {
        errors.push(
          `Operation "${op.id}": input "${ref}" does not match any ingredient or operation ID.`,
        );
      }
    }
  }
  for (const step of recipe.finishSteps || []) {
    for (const ref of step.inputs || []) {
      const kind = classifyRef(ref, ingredientMap, operationMap);
      if (kind === 'unknown') {
        errors.push(
          `Finish step "${step.action}": input "${ref}" does not match any ingredient or operation ID.`,
        );
      }
    }
  }

  // 2. Cycle detection via Kahn's algorithm
  const sorted = topoSort(operations);
  if (sorted.length !== operations.length) {
    const inCycle = operations
      .filter((op) => !sorted.includes(op.id))
      .map((op) => op.id);
    errors.push(`Cycle detected among operations: ${inCycle.join(', ')}.`);
  }

  // 3. Equipment conflict detection
  const equipmentHolder = new Map<string, string>();
  for (const opId of sorted) {
    const op = operationMap.get(opId)!;
    if (!op.equipment) continue;
    const eqId = op.equipment.use;
    const holder = equipmentHolder.get(eqId);
    if (holder) {
      const isChained = (op.inputs || []).includes(holder);
      if (!isChained) {
        errors.push(
          `Equipment conflict: "${eqId}" is held by "${holder}" (release: false) but "${op.id}" also needs it and is not a direct successor.`,
        );
      }
    }
    if (op.equipment.release) {
      equipmentHolder.delete(eqId);
    } else {
      equipmentHolder.set(eqId, op.id);
    }
  }

  if (errors.length > 0) return { valid: false as const, errors };
  return { valid: true as const };
}

export function topoSort(
  operations: Operation[],
): string[] {
  const operationMap = indexById(operations);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const op of operations) {
    inDegree.set(op.id, 0);
    adj.set(op.id, []);
  }
  for (const op of operations) {
    for (const ref of op.inputs || []) {
      if (operationMap.has(ref)) {
        adj.get(ref)!.push(op.id);
        inDegree.set(op.id, inDegree.get(op.id)! + 1);
      }
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);
    for (const neighbour of adj.get(node)!) {
      const newDeg = inDegree.get(neighbour)! - 1;
      inDegree.set(neighbour, newDeg);
      if (newDeg === 0) queue.push(neighbour);
    }
  }
  return sorted;
}
