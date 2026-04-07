import type { Operation, Recipe } from '../recipe/types.js';
import type { Phase } from './types.js';

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function mapOpsToSubProducts(
  recipe: Recipe,
  operationMap: Map<string, Operation>,
): Map<string, string> {
  const map = new Map<string, string>();
  const subProducts = recipe.subProducts || [];
  if (subProducts.length === 0) return map;

  // Build sub-product ID → name lookup
  const spNameById = new Map<string, string>();
  for (const sp of subProducts) {
    spNameById.set(sp.id, sp.name);
  }

  // Use explicit subProduct field when available
  for (const op of recipe.operations) {
    if (op.subProduct) {
      const name = spNameById.get(op.subProduct);
      if (name) map.set(op.id, name);
    }
  }

  // Fall back to reverse-walk for operations without explicit subProduct
  if (map.size < recipe.operations.length) {
    function chainDepth(opId: string, visited: Set<string>): number {
      if (visited.has(opId)) return 0;
      visited.add(opId);
      const op = operationMap.get(opId);
      if (!op) return 0;
      let maxD = 0;
      for (const ref of op.depends || []) {
        if (operationMap.has(ref))
          maxD = Math.max(maxD, chainDepth(ref, visited));
      }
      return maxD + 1;
    }

    const sorted = [...subProducts].sort(
      (a, b) =>
        chainDepth(a.finalOp, new Set()) - chainDepth(b.finalOp, new Set()),
    );

    for (const sp of sorted) {
      const visited = new Set<string>();
      function walkBack(opId: string): void {
        if (visited.has(opId)) return;
        visited.add(opId);
        if (map.has(opId)) return;
        map.set(opId, sp.name);
        const op = operationMap.get(opId);
        if (!op) return;
        for (const ref of op.depends || []) {
          if (operationMap.has(ref)) walkBack(ref);
        }
      }
      walkBack(sp.finalOp);
    }
  }

  return map;
}

function groupCookOpsBySubProduct(
  cookOps: Operation[],
  opSpMap: Map<string, string>,
): Operation[][] {
  const groupMap = new Map<string, Operation[]>();
  const ungrouped: Operation[] = [];

  for (const op of cookOps) {
    const spName = opSpMap.get(op.id);
    if (spName) {
      if (!groupMap.has(spName)) groupMap.set(spName, []);
      groupMap.get(spName)!.push(op);
    } else {
      ungrouped.push(op);
    }
  }

  const cookOpIdx = new Map<string, number>();
  cookOps.forEach((op, i) => cookOpIdx.set(op.id, i));

  const groups = [...groupMap.values()];
  groups.sort((a, b) => {
    const aIds = new Set<string>(a.map((op) => op.id));
    const bIds = new Set<string>(b.map((op) => op.id));
    const bDependsOnA = b.some((op) =>
      (op.depends || []).some((ref) => aIds.has(ref)),
    );
    const aDependsOnB = a.some((op) =>
      (op.depends || []).some((ref) => bIds.has(ref)),
    );
    if (bDependsOnA && !aDependsOnB) return -1;
    if (aDependsOnB && !bDependsOnA) return 1;
    return (cookOpIdx.get(a[0]!.id) ?? 0) - (cookOpIdx.get(b[0]!.id) ?? 0);
  });

  if (ungrouped.length > 0) groups.push(ungrouped);
  return groups;
}

function emitCookPhases(ops: Operation[], phases: Phase[]): void {
  let currentGroup: Operation[] = [];

  function flush(): void {
    if (currentGroup.length === 0) return;
    phases.push({
      name: currentGroup.map((op) => capitalize(op.action)).join(' + '),
      type: 'cook',
      time: { min: currentGroup.reduce((s, op) => s + op.time.min, 0) },
      operations: [...currentGroup],
      parallel: false,
    });
    currentGroup = [];
  }

  for (const op of ops) {
    const isPassive =
      op.activeTime !== undefined && op.activeTime.min < op.time.min * 0.25;
    if (isPassive) {
      flush();
      phases.push({
        name: capitalize(op.action),
        type: 'simmer',
        time: op.time,
        operations: [op],
        parallel: false,
      });
    } else {
      currentGroup.push(op);
    }
  }
  flush();
}

export function buildRelaxedSchedule(
  prepOps: Operation[],
  cookOps: Operation[],
  restOps: Operation[],
  assembleOps: Operation[],
  operationMap: Map<string, Operation>,
  recipe: Recipe,
): Phase[] {
  const phases: Phase[] = [];

  // Prep phase
  if (prepOps.length > 0) {
    phases.push({
      name: 'Prep',
      type: 'prep',
      time: { min: prepOps.reduce((sum, op) => sum + op.time.min, 0) },
      operations: prepOps,
      parallel: false,
    });
  }

  // Cook phases grouped by sub-product
  const opSpMap = mapOpsToSubProducts(recipe, operationMap);
  const groups = groupCookOpsBySubProduct(cookOps, opSpMap);
  for (const group of groups) {
    emitCookPhases(group, phases);
  }

  // Rest phases
  for (const op of restOps) {
    phases.push({
      name: capitalize(op.action),
      type: 'rest',
      time: op.time,
      operations: [op],
      parallel: false,
    });
  }

  // Assemble phases
  if (assembleOps.length > 0) {
    phases.push({
      name: assembleOps.map((op) => capitalize(op.action)).join(' + '),
      type: 'assemble',
      time: { min: assembleOps.reduce((sum, op) => sum + op.time.min, 0) },
      operations: assembleOps,
      parallel: false,
    });
  }

  return phases;
}
