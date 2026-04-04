import type { Operation, FinishStep } from '../recipe/types.js';
import type { Phase } from './types.js';
import { topoSort, indexById } from './dag.js';
import { findCriticalPath } from './critical-path.js';

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function findEarlyPrepOps(
  mainChainOpsInOrder: Operation[],
  operationMap: Map<string, Operation>,
): Set<string> {
  const firstPassiveIdx = mainChainOpsInOrder.findIndex(
    (op) =>
      op.activeTime != null && op.time > 0 && op.activeTime < op.time * 0.25,
  );
  const opsToCheck =
    firstPassiveIdx >= 0
      ? mainChainOpsInOrder.slice(0, firstPassiveIdx + 1)
      : mainChainOpsInOrder;

  const needed = new Set<string>();

  function walkBack(opId: string): void {
    const op = operationMap.get(opId);
    if (!op) return;
    for (const ref of op.inputs || []) {
      if (needed.has(ref)) continue;
      const dep = operationMap.get(ref);
      if (dep && dep.type === 'prep') {
        needed.add(dep.id);
        walkBack(dep.id);
      }
    }
  }

  for (const cookOp of opsToCheck) walkBack(cookOp.id);
  return needed;
}

function groupIntoChains(
  ops: Operation[],
  operationMap: Map<string, Operation>,
): Operation[][] {
  if (ops.length === 0) return [];

  const opIds = new Set(ops.map((op) => op.id));
  const visited = new Set<string>();
  const chains: Operation[][] = [];

  for (const startOp of ops) {
    if (visited.has(startOp.id)) continue;
    const component: Operation[] = [];
    const toVisit: string[] = [startOp.id];

    while (toVisit.length) {
      const id = toVisit.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(operationMap.get(id)!);

      for (const other of ops) {
        if (!visited.has(other.id) && (other.inputs || []).includes(id))
          toVisit.push(other.id);
      }
      const thisOp = operationMap.get(id)!;
      for (const ref of thisOp.inputs || []) {
        if (opIds.has(ref) && !visited.has(ref)) toVisit.push(ref);
      }
    }

    // Topological sort within the component
    const compIds = new Set(component.map((op) => op.id));
    const compInDeg = new Map<string, number>();
    for (const op of component) {
      let deg = 0;
      for (const ref of op.inputs || []) {
        if (compIds.has(ref)) deg++;
      }
      compInDeg.set(op.id, deg);
    }
    const compQueue: string[] = [];
    for (const [id, deg] of compInDeg) {
      if (deg === 0) compQueue.push(id);
    }
    const compSorted: Operation[] = [];
    while (compQueue.length) {
      const n = compQueue.shift()!;
      compSorted.push(operationMap.get(n)!);
      for (const op of component) {
        if ((op.inputs || []).includes(n)) {
          compInDeg.set(op.id, compInDeg.get(op.id)! - 1);
          if (compInDeg.get(op.id) === 0) compQueue.push(op.id);
        }
      }
    }
    chains.push(compSorted);
  }

  return chains;
}

function canScheduleParallel(
  op: Operation,
  busyEquipment: Set<string>,
): boolean {
  if (!op.equipment) return true;
  return !busyEquipment.has(op.equipment.use);
}

export function buildOptimizedSchedule(
  prepOps: Operation[],
  cookOps: Operation[],
  finishSteps: FinishStep[],
  allOperations: Operation[],
  operationMap: Map<string, Operation>,
): Phase[] {
  const phases: Phase[] = [];

  const criticalPathIds = findCriticalPath(cookOps, operationMap);
  const sorted = topoSort(allOperations);
  const mainCookOps = sorted
    .filter((id) => criticalPathIds.has(id))
    .map((id) => operationMap.get(id)!);
  const parallelCookOps = cookOps.filter((op) => !criticalPathIds.has(op.id));
  let parallelChains = groupIntoChains(parallelCookOps, operationMap);

  const earlyPrepIds = findEarlyPrepOps(mainCookOps, operationMap);
  const earlyPrep = prepOps.filter((op) => earlyPrepIds.has(op.id));
  const deferredPrep = prepOps.filter((op) => !earlyPrepIds.has(op.id));

  if (earlyPrep.length > 0) {
    phases.push({
      name: 'Prep',
      type: 'prep',
      time: earlyPrep.reduce((sum, op) => sum + op.time, 0),
      operations: earlyPrep,
      parallel: false,
    });
  }

  let deferredQueue = [...deferredPrep];
  let currentCookGroup: Operation[] = [];

  function flushCookGroup(): void {
    if (currentCookGroup.length === 0) return;
    phases.push({
      name: currentCookGroup.map((op) => capitalize(op.action)).join(' + '),
      type: 'cook',
      time: currentCookGroup.reduce((s, op) => s + op.time, 0),
      operations: [...currentCookGroup],
      parallel: false,
    });
    currentCookGroup = [];
  }

  for (const op of mainCookOps) {
    const isPassive =
      op.activeTime !== undefined && op.activeTime < op.time * 0.25;

    if (isPassive) {
      flushCookGroup();
      const idleTime = op.time - (op.activeTime ?? 0);
      const busyEquipment = new Set<string>();
      if (op.equipment && !op.equipment.release)
        busyEquipment.add(op.equipment.use);

      const scheduledParallel: Operation[] = [];
      const alreadyScheduledIds = new Set<string>([
        ...earlyPrepIds,
        ...scheduledParallel.map((sp) => sp.id),
      ]);

      const remainingDeferred: Operation[] = [];
      for (const dOp of deferredQueue) {
        if (
          dOp.time <= idleTime &&
          canScheduleParallel(dOp, busyEquipment)
        ) {
          scheduledParallel.push(dOp);
          alreadyScheduledIds.add(dOp.id);
          if (dOp.equipment) busyEquipment.add(dOp.equipment.use);
        } else {
          remainingDeferred.push(dOp);
        }
      }
      deferredQueue = remainingDeferred;

      const remainingChains: Operation[][] = [];
      for (const chain of parallelChains) {
        const chainTime = chain.reduce((s, cop) => s + cop.time, 0);
        const noEquipConflict = chain.every((cop) =>
          canScheduleParallel(cop, busyEquipment),
        );
        const prepDepsSatisfied = chain.every((cop) =>
          (cop.inputs || []).every((ref) => {
            const dep = operationMap.get(ref);
            if (!dep || dep.type !== 'prep') return true;
            return earlyPrepIds.has(ref) || alreadyScheduledIds.has(ref);
          }),
        );
        if (chainTime <= idleTime && noEquipConflict && prepDepsSatisfied) {
          scheduledParallel.push(...chain);
          for (const cop of chain) {
            alreadyScheduledIds.add(cop.id);
            if (cop.equipment) busyEquipment.add(cop.equipment.use);
          }
        } else {
          remainingChains.push(chain);
        }
      }
      parallelChains = remainingChains;

      const hasParallel = scheduledParallel.length > 0;
      phases.push({
        name: hasParallel
          ? `${capitalize(op.action)} + Parallel`
          : capitalize(op.action),
        type: 'simmer',
        time: op.time,
        operations: [op],
        parallel: hasParallel,
        ...(hasParallel ? { parallelOps: scheduledParallel } : {}),
      });
    } else {
      currentCookGroup.push(op);
    }
  }
  flushCookGroup();

  for (const chain of parallelChains) {
    phases.push({
      name: chain.map((op) => capitalize(op.action)).join(' + '),
      type: 'cook',
      time: chain.reduce((s, op) => s + op.time, 0),
      operations: chain,
      parallel: false,
    });
  }

  if (deferredQueue.length > 0) {
    phases.push({
      name: 'Remaining Prep',
      type: 'prep',
      time: deferredQueue.reduce((sum, op) => sum + op.time, 0),
      operations: deferredQueue,
      parallel: false,
    });
  }

  if (finishSteps.length > 0) {
    phases.push({
      name: 'Finish',
      type: 'finish',
      time: finishSteps.reduce(
        (sum, s) => sum + ((s as Operation).time || 1),
        0,
      ),
      operations: finishSteps,
      parallel: false,
    });
  }

  return phases;
}
