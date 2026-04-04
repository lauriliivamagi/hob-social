import type { Recipe } from '../recipe/types.js';
import type { Phase, ScheduleMode } from './types.js';
import { indexById, topoSort } from './dag.js';
import { buildRelaxedSchedule } from './schedule-relaxed.js';
import { buildOptimizedSchedule } from './schedule-optimized.js';

export function computeSchedule(recipe: Recipe, mode: ScheduleMode): Phase[] {
  const operations = recipe.operations || [];
  const operationMap = indexById(operations);
  const sorted = topoSort(operations);

  const prepOps = sorted
    .filter((id) => operationMap.get(id)!.type === 'prep')
    .map((id) => operationMap.get(id)!);
  const cookOps = sorted
    .filter((id) => operationMap.get(id)!.type === 'cook')
    .map((id) => operationMap.get(id)!);
  const finishSteps = recipe.finishSteps || [];

  if (mode === 'relaxed') {
    return buildRelaxedSchedule(
      prepOps,
      cookOps,
      finishSteps,
      operationMap,
      recipe,
    );
  }
  return buildOptimizedSchedule(
    prepOps,
    cookOps,
    finishSteps,
    operations,
    operationMap,
  );
}

export function computeTotalTime(phases: Phase[]): number {
  let total = 0;
  for (const phase of phases) {
    if (phase.parallel && phase.parallelOps && phase.parallelOps.length > 0) {
      const parallelTime = phase.parallelOps.reduce(
        (sum, op) => sum + (op.time || 0),
        0,
      );
      total += Math.max(phase.time, parallelTime);
    } else {
      total += phase.time;
    }
  }
  return total;
}
