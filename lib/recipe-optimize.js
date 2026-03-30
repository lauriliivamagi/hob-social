/**
 * recipe-optimize.js
 *
 * Core algorithm for computing relaxed and optimized recipe schedules
 * from the operation DAG defined in the recipe JSON format.
 *
 * Plain ES module -- no build step required.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a lookup map from an array of objects with `id` fields.
 * @param {Array<{id: string}>} items
 * @returns {Map<string, object>}
 */
function indexById(items) {
  const map = new Map();
  for (const item of items) {
    map.set(item.id, item);
  }
  return map;
}

/**
 * Classify an input reference as either an ingredient ID or an operation ID.
 * @param {string} ref
 * @param {Map<string, object>} ingredientMap
 * @param {Map<string, object>} operationMap
 * @returns {"ingredient"|"operation"|"unknown"}
 */
function classifyRef(ref, ingredientMap, operationMap) {
  if (ingredientMap.has(ref)) return "ingredient";
  if (operationMap.has(ref)) return "operation";
  return "unknown";
}

// ---------------------------------------------------------------------------
// validateDag
// ---------------------------------------------------------------------------

/**
 * Validate the operation DAG of a recipe.
 *
 * Checks performed:
 * 1. All input references resolve to an ingredient ID or operation ID.
 * 2. The operation graph is acyclic (topological sort).
 * 3. No two operations use the same equipment at the same time unless
 *    the earlier operation releases it.
 *
 * @param {object} recipe - A recipe object matching the JSON schema.
 * @returns {{ valid: boolean, errors?: string[] }}
 */
export function validateDag(recipe) {
  const errors = [];
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
      if (kind === "unknown") {
        errors.push(
          `Operation "${op.id}": input "${ref}" does not match any ingredient or operation ID.`
        );
      }
    }
  }

  // Also validate finishSteps inputs
  for (const step of recipe.finishSteps || []) {
    for (const ref of step.inputs || []) {
      const kind = classifyRef(ref, ingredientMap, operationMap);
      if (kind === "unknown") {
        errors.push(
          `Finish step "${step.action}": input "${ref}" does not match any ingredient or operation ID.`
        );
      }
    }
  }

  // 2. Cycle detection via topological sort (Kahn's algorithm)
  // Build adjacency list among operations only
  const inDegree = new Map();
  const adj = new Map();
  for (const op of operations) {
    inDegree.set(op.id, 0);
    adj.set(op.id, []);
  }
  for (const op of operations) {
    for (const ref of op.inputs || []) {
      if (operationMap.has(ref)) {
        adj.get(ref).push(op.id);
        inDegree.set(op.id, inDegree.get(op.id) + 1);
      }
    }
  }

  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const neighbour of adj.get(node)) {
      const newDeg = inDegree.get(neighbour) - 1;
      inDegree.set(neighbour, newDeg);
      if (newDeg === 0) queue.push(neighbour);
    }
  }

  if (sorted.length !== operations.length) {
    const inCycle = operations
      .filter((op) => !sorted.includes(op.id))
      .map((op) => op.id);
    errors.push(`Cycle detected among operations: ${inCycle.join(", ")}.`);
  }

  // 3. Equipment conflict detection
  // Walk the topological order, tracking equipment occupancy.
  // An operation that uses equipment with release:false keeps it occupied
  // until the next operation on that equipment (which inherits the pan).
  const equipmentHolder = new Map(); // equipmentId -> operationId currently holding it
  for (const opId of sorted) {
    const op = operationMap.get(opId);
    if (!op.equipment) continue;
    const eqId = op.equipment.use;
    const holder = equipmentHolder.get(eqId);

    if (holder) {
      // Something is occupying this equipment. Check whether the current op
      // is a direct downstream consumer of the holder (i.e., it chains in the
      // same pan). If not, it is a conflict.
      const holderOp = operationMap.get(holder);
      const isChained = (op.inputs || []).includes(holder);
      if (!isChained) {
        errors.push(
          `Equipment conflict: "${eqId}" is held by "${holder}" (release: false) ` +
            `but "${op.id}" also needs it and is not a direct successor.`
        );
      }
    }

    if (op.equipment.release) {
      equipmentHolder.delete(eqId);
    } else {
      equipmentHolder.set(eqId, op.id);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// resolveIngredients
// ---------------------------------------------------------------------------

/**
 * Given an operation, walk the input chain and return all ingredient objects
 * that feed into it (directly or transitively through other operations).
 *
 * @param {object} operation - An operation from the recipe.
 * @param {object} recipe - The full recipe object.
 * @returns {object[]} Array of ingredient objects.
 */
export function resolveIngredients(operation, recipe) {
  const ingredientMap = indexById(recipe.ingredients || []);
  const operationMap = indexById(recipe.operations || []);
  const result = [];
  const seen = new Set();

  function walk(op) {
    for (const ref of op.inputs || []) {
      if (seen.has(ref)) continue;
      seen.add(ref);
      if (ingredientMap.has(ref)) {
        result.push(ingredientMap.get(ref));
      } else if (operationMap.has(ref)) {
        walk(operationMap.get(ref));
      }
    }
  }

  walk(operation);
  return result;
}

// ---------------------------------------------------------------------------
// computeSchedule
// ---------------------------------------------------------------------------

/**
 * Produce a topologically sorted list of operation IDs.
 * @param {object[]} operations
 * @param {Map<string, object>} ingredientMap
 * @returns {string[]}
 */
function topoSort(operations, ingredientMap) {
  const operationMap = indexById(operations);
  const inDegree = new Map();
  const adj = new Map();
  for (const op of operations) {
    inDegree.set(op.id, 0);
    adj.set(op.id, []);
  }
  for (const op of operations) {
    for (const ref of op.inputs || []) {
      if (operationMap.has(ref)) {
        adj.get(ref).push(op.id);
        inDegree.set(op.id, inDegree.get(op.id) + 1);
      }
    }
  }
  const queue = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);
    for (const neighbour of adj.get(node)) {
      const newDeg = inDegree.get(neighbour) - 1;
      inDegree.set(neighbour, newDeg);
      if (newDeg === 0) queue.push(neighbour);
    }
  }
  return sorted;
}

/**
 * Determine which prep operations are needed before the first idle window.
 * Only prep needed by main chain cook ops that come BEFORE the first passive
 * op is flagged as "early". Prep needed later can be deferred into idle windows.
 *
 * @param {object[]} mainChainOpsInOrder - Main chain cook ops in topological order
 * @param {Map<string, object>} operationMap
 * @returns {Set<string>} IDs of essential early prep ops
 */
function findEarlyPrepOps(mainChainOpsInOrder, operationMap) {
  // Find the first passive op in the main chain
  const firstPassiveIdx = mainChainOpsInOrder.findIndex(
    (op) => op.activeTime != null && op.time > 0 && op.activeTime < op.time * 0.25
  );

  // Only walk back from ops before the first passive op (inclusive, since
  // the passive op itself needs to be started)
  const opsToCheck =
    firstPassiveIdx >= 0
      ? mainChainOpsInOrder.slice(0, firstPassiveIdx + 1)
      : mainChainOpsInOrder;

  const needed = new Set();

  function walkBack(opId) {
    const op = operationMap.get(opId);
    if (!op) return;
    for (const ref of op.inputs || []) {
      if (needed.has(ref)) continue;
      const dep = operationMap.get(ref);
      if (dep && dep.type === "prep") {
        needed.add(dep.id);
        walkBack(dep.id);
      }
    }
  }

  for (const cookOp of opsToCheck) {
    walkBack(cookOp.id);
  }
  return needed;
}

/**
 * Find the critical path (longest-time path) through cook operations.
 * Uses dynamic programming on the topological order.
 *
 * @param {object[]} cookOps - All cook operations
 * @param {Map<string, object>} operationMap
 * @returns {Set<string>} IDs of cook ops on the critical path
 */
function findCriticalPath(cookOps, operationMap) {
  const cookIds = new Set(cookOps.map((op) => op.id));

  // Topological sort of cook ops
  const inDeg = new Map();
  const adj = new Map();
  for (const op of cookOps) {
    inDeg.set(op.id, 0);
    adj.set(op.id, []);
  }
  for (const op of cookOps) {
    for (const ref of op.inputs || []) {
      if (cookIds.has(ref)) {
        adj.get(ref).push(op.id);
        inDeg.set(op.id, inDeg.get(op.id) + 1);
      }
    }
  }
  const queue = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  const sorted = [];
  while (queue.length) {
    const n = queue.shift();
    sorted.push(n);
    for (const nb of adj.get(n)) {
      const nd = inDeg.get(nb) - 1;
      inDeg.set(nb, nd);
      if (nd === 0) queue.push(nb);
    }
  }

  // Forward DP: longest path to each op
  const dist = new Map();
  const pred = new Map();
  for (const opId of sorted) {
    const op = operationMap.get(opId);
    let maxPrev = 0;
    let bestPred = null;
    for (const ref of op.inputs || []) {
      if (dist.has(ref) && dist.get(ref) > maxPrev) {
        maxPrev = dist.get(ref);
        bestPred = ref;
      }
    }
    dist.set(opId, maxPrev + op.time);
    pred.set(opId, bestPred);
  }

  // Find the end of the critical path
  let endOp = null;
  let maxDist = 0;
  for (const [id, d] of dist) {
    if (d > maxDist) {
      maxDist = d;
      endOp = id;
    }
  }

  // Walk back to collect the critical path
  const path = new Set();
  let cur = endOp;
  while (cur) {
    path.add(cur);
    cur = pred.get(cur);
  }

  return path;
}

/**
 * Group cook operations into connected chains (via cook-to-cook dependencies).
 * Each chain is returned in topological order.
 *
 * @param {object[]} ops - Cook operations to group
 * @param {Map<string, object>} operationMap
 * @returns {Array<object[]>} Array of chains, each chain is an array of ops in order
 */
function groupIntoChains(ops, operationMap) {
  if (ops.length === 0) return [];
  const opIds = new Set(ops.map((op) => op.id));
  const visited = new Set();
  const chains = [];

  for (const startOp of ops) {
    if (visited.has(startOp.id)) continue;

    // BFS to find all ops in this connected component
    const component = [];
    const toVisit = [startOp.id];
    while (toVisit.length) {
      const id = toVisit.shift();
      if (visited.has(id)) continue;
      visited.add(id);
      component.push(operationMap.get(id));

      // Successors within this set
      for (const other of ops) {
        if (!visited.has(other.id) && (other.inputs || []).includes(id)) {
          toVisit.push(other.id);
        }
      }
      // Predecessors within this set
      const thisOp = operationMap.get(id);
      for (const ref of thisOp.inputs || []) {
        if (opIds.has(ref) && !visited.has(ref)) {
          toVisit.push(ref);
        }
      }
    }

    // Topological sort within this component
    const compIds = new Set(component.map((op) => op.id));
    const compInDeg = new Map();
    for (const op of component) {
      let deg = 0;
      for (const ref of op.inputs || []) {
        if (compIds.has(ref)) deg++;
      }
      compInDeg.set(op.id, deg);
    }
    const compQueue = [];
    for (const [id, deg] of compInDeg) {
      if (deg === 0) compQueue.push(id);
    }
    const compSorted = [];
    while (compQueue.length) {
      const n = compQueue.shift();
      compSorted.push(operationMap.get(n));
      for (const op of component) {
        if ((op.inputs || []).includes(n)) {
          compInDeg.set(op.id, compInDeg.get(op.id) - 1);
          if (compInDeg.get(op.id) === 0) compQueue.push(op.id);
        }
      }
    }

    chains.push(compSorted);
  }

  return chains;
}

/**
 * Check whether an operation can be scheduled in parallel with an idle window,
 * given current equipment usage.
 *
 * @param {object} op - The candidate operation to schedule.
 * @param {Set<string>} busyEquipment - Equipment IDs currently in use.
 * @returns {boolean}
 */
function canScheduleParallel(op, busyEquipment) {
  if (!op.equipment) return true;
  return !busyEquipment.has(op.equipment.use);
}

/**
 * Compute the schedule (array of phases) for a recipe.
 *
 * @param {object} recipe - The full recipe object.
 * @param {"relaxed"|"optimized"} mode - Schedule mode.
 * @returns {Array<{
 *   name: string,
 *   type: string,
 *   time: number,
 *   operations: object[],
 *   parallel: boolean,
 *   parallelOps?: object[]
 * }>}
 */
export function computeSchedule(recipe, mode) {
  const operations = recipe.operations || [];
  const ingredientMap = indexById(recipe.ingredients || []);
  const operationMap = indexById(operations);
  const sorted = topoSort(operations, ingredientMap);

  const prepOps = sorted
    .filter((id) => operationMap.get(id).type === "prep")
    .map((id) => operationMap.get(id));
  const cookOps = sorted
    .filter((id) => operationMap.get(id).type === "cook")
    .map((id) => operationMap.get(id));
  const finishSteps = recipe.finishSteps || [];

  if (mode === "relaxed") {
    return buildRelaxedSchedule(prepOps, cookOps, finishSteps, operationMap, recipe);
  }
  return buildOptimizedSchedule(
    prepOps,
    cookOps,
    finishSteps,
    operations,
    operationMap
  );
}

/**
 * Map each operation to its sub-product name. Leaf sub-products claim first.
 * Operations not in any sub-product chain get labelled from finishSteps.
 *
 * @param {object} recipe
 * @param {Map<string, object>} operationMap
 * @returns {Map<string, string>} opId → sub-product name
 */
function mapOpsToSubProducts(recipe, operationMap) {
  const map = new Map();
  const subProducts = recipe.subProducts || [];
  if (subProducts.length === 0) return map;

  function chainDepth(opId, visited) {
    if (visited.has(opId)) return 0;
    visited.add(opId);
    const op = operationMap.get(opId);
    if (!op) return 0;
    let maxD = 0;
    for (const ref of op.inputs || []) {
      if (operationMap.has(ref)) {
        maxD = Math.max(maxD, chainDepth(ref, visited));
      }
    }
    return maxD + 1;
  }

  // Sort leaf (shallowest) sub-products first so they claim ops before composites
  const sorted = [...subProducts].sort(
    (a, b) => chainDepth(a.finalOp, new Set()) - chainDepth(b.finalOp, new Set())
  );

  for (const sp of sorted) {
    const visited = new Set();
    function walkBack(opId) {
      if (visited.has(opId)) return;
      visited.add(opId);
      if (map.has(opId)) return; // already claimed
      map.set(opId, sp.name);
      const op = operationMap.get(opId);
      if (!op) return;
      for (const ref of op.inputs || []) {
        if (operationMap.has(ref)) walkBack(ref);
      }
    }
    walkBack(sp.finalOp);
  }

  // Label remaining ops from finishSteps
  for (const fs of recipe.finishSteps || []) {
    const label = capitalize(fs.action || "");
    for (const ref of fs.inputs || []) {
      const visited = new Set();
      function walkBack(opId) {
        if (visited.has(opId)) return;
        visited.add(opId);
        if (map.has(opId)) return;
        map.set(opId, label);
        const op = operationMap.get(opId);
        if (!op) return;
        for (const ref2 of op.inputs || []) {
          if (operationMap.has(ref2)) walkBack(ref2);
        }
      }
      if (operationMap.has(ref)) walkBack(ref);
    }
  }

  return map;
}

/**
 * Group cook ops by sub-product, maintaining topological order within each group.
 * Groups are ordered by dependency depth (leaf sub-products first).
 *
 * @param {object[]} cookOps - Cook ops in topological order
 * @param {Map<string, string>} opSpMap - opId → sub-product name
 * @returns {Array<object[]>} Ordered groups of cook ops
 */
function groupCookOpsBySubProduct(cookOps, opSpMap) {
  // Collect unique sub-product names in order of first appearance
  const groupMap = new Map(); // spName → [ops]
  const ungrouped = [];

  for (const op of cookOps) {
    const spName = opSpMap.get(op.id);
    if (spName) {
      if (!groupMap.has(spName)) groupMap.set(spName, []);
      groupMap.get(spName).push(op);
    } else {
      ungrouped.push(op);
    }
  }

  // Order groups: a group whose ops have no cook-dependencies on other groups
  // comes first. Use the index of the first op in each group in the original
  // topo-sorted cookOps as a tiebreaker (earlier = first).
  const cookOpIdx = new Map();
  cookOps.forEach((op, i) => cookOpIdx.set(op.id, i));

  const groups = [...groupMap.values()];
  groups.sort((a, b) => {
    // Check if group b depends on group a (any op in b has input from a)
    const aIds = new Set(a.map((op) => op.id));
    const bIds = new Set(b.map((op) => op.id));
    const bDependsOnA = b.some((op) =>
      (op.inputs || []).some((ref) => aIds.has(ref))
    );
    const aDependsOnB = a.some((op) =>
      (op.inputs || []).some((ref) => bIds.has(ref))
    );
    if (bDependsOnA && !aDependsOnB) return -1;
    if (aDependsOnB && !bDependsOnA) return 1;
    // Tiebreak: first appearance in topo order
    return cookOpIdx.get(a[0].id) - cookOpIdx.get(b[0].id);
  });

  if (ungrouped.length > 0) groups.push(ungrouped);
  return groups;
}

/**
 * Emit cook phases from a group of ops (active ops grouped, passive ops get own phase).
 */
function emitCookPhases(ops, phases) {
  let currentGroup = [];

  function flush() {
    if (currentGroup.length === 0) return;
    phases.push({
      name: currentGroup.map((op) => capitalize(op.action)).join(" + "),
      type: "cook",
      time: currentGroup.reduce((s, op) => s + op.time, 0),
      operations: [...currentGroup],
      parallel: false,
    });
    currentGroup = [];
  }

  for (const op of ops) {
    const isPassive =
      op.activeTime !== undefined && op.activeTime < op.time * 0.25;
    if (isPassive) {
      flush();
      phases.push({
        name: capitalize(op.action),
        type: "simmer",
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

/**
 * Build relaxed schedule: all prep first, then cook ops grouped by sub-product, then finish.
 */
function buildRelaxedSchedule(prepOps, cookOps, finishSteps, operationMap, recipe) {
  const phases = [];

  // PREP phase -- all prep ops sequentially
  if (prepOps.length > 0) {
    phases.push({
      name: "Prep",
      type: "prep",
      time: prepOps.reduce((sum, op) => sum + op.time, 0),
      operations: prepOps,
      parallel: false,
    });
  }

  // Map cook ops to sub-products, then group and order by dependency depth
  const opSpMap = mapOpsToSubProducts(recipe, operationMap);
  const groupedCookOps = groupCookOpsBySubProduct(cookOps, opSpMap);

  // Emit each sub-product group's cook ops as phases
  for (const group of groupedCookOps) {
    emitCookPhases(group, phases);
  }

  // FINISH phase
  if (finishSteps.length > 0) {
    phases.push({
      name: "Finish",
      type: "finish",
      time: finishSteps.reduce((sum, s) => sum + (s.time || 1), 0),
      operations: finishSteps,
      parallel: false,
    });
  }

  return phases;
}

/**
 * Build optimized schedule: critical-path analysis determines the main chain,
 * parallel cook chains and deferred prep are slotted into idle windows.
 */
function buildOptimizedSchedule(
  prepOps,
  cookOps,
  finishSteps,
  allOperations,
  operationMap
) {
  const phases = [];

  // 1. Find the critical path (longest time path) through cook ops
  const criticalPathIds = findCriticalPath(cookOps, operationMap);

  // Get critical path ops in topological order
  const sorted = topoSort(allOperations, indexById(allOperations));
  const mainCookOps = sorted
    .filter((id) => criticalPathIds.has(id))
    .map((id) => operationMap.get(id));

  // 2. Non-critical cook ops form parallel branches
  const parallelCookOps = cookOps.filter((op) => !criticalPathIds.has(op.id));
  let parallelChains = groupIntoChains(parallelCookOps, operationMap);

  // 3. Early prep: only prep needed by main chain ops BEFORE the first idle window
  const earlyPrepIds = findEarlyPrepOps(mainCookOps, operationMap);
  const earlyPrep = prepOps.filter((op) => earlyPrepIds.has(op.id));
  const deferredPrep = prepOps.filter((op) => !earlyPrepIds.has(op.id));

  // Essential PREP phase
  if (earlyPrep.length > 0) {
    phases.push({
      name: "Prep",
      type: "prep",
      time: earlyPrep.reduce((sum, op) => sum + op.time, 0),
      operations: earlyPrep,
      parallel: false,
    });
  }

  // 4. Walk the main chain, grouping active ops and scheduling during idle windows
  let deferredQueue = [...deferredPrep];
  let currentCookGroup = [];

  function flushCookGroup() {
    if (currentCookGroup.length === 0) return;
    const totalTime = currentCookGroup.reduce((s, op) => s + op.time, 0);
    phases.push({
      name: currentCookGroup.map((op) => capitalize(op.action)).join(" + "),
      type: "cook",
      time: totalTime,
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
      const busyEquipment = new Set();
      if (op.equipment && !op.equipment.release) {
        busyEquipment.add(op.equipment.use);
      }

      const scheduledParallel = [];
      const alreadyScheduledIds = new Set([
        ...earlyPrepIds,
        ...scheduledParallel.map((sp) => sp.id),
      ]);

      // Try deferred prep ops
      const remainingDeferred = [];
      for (const dOp of deferredQueue) {
        if (dOp.time <= idleTime && canScheduleParallel(dOp, busyEquipment)) {
          scheduledParallel.push(dOp);
          alreadyScheduledIds.add(dOp.id);
          if (dOp.equipment) busyEquipment.add(dOp.equipment.use);
        } else {
          remainingDeferred.push(dOp);
        }
      }
      deferredQueue = remainingDeferred;

      // Try parallel cook chains (slot entire chains)
      const remainingChains = [];
      for (const chain of parallelChains) {
        const chainTime = chain.reduce((s, cop) => s + cop.time, 0);
        const noEquipConflict = chain.every((cop) =>
          canScheduleParallel(cop, busyEquipment)
        );
        // Check that all prep deps of the chain are satisfied
        const prepDepsSatisfied = chain.every((cop) =>
          (cop.inputs || []).every((ref) => {
            const dep = operationMap.get(ref);
            if (!dep || dep.type !== "prep") return true;
            return (
              earlyPrepIds.has(ref) || alreadyScheduledIds.has(ref)
            );
          })
        );

        if (
          chainTime <= idleTime &&
          noEquipConflict &&
          prepDepsSatisfied
        ) {
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
        type: "simmer",
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

  // Any remaining parallel chains that didn't fit into idle windows
  for (const chain of parallelChains) {
    const totalTime = chain.reduce((s, op) => s + op.time, 0);
    phases.push({
      name: chain.map((op) => capitalize(op.action)).join(" + "),
      type: "cook",
      time: totalTime,
      operations: chain,
      parallel: false,
    });
  }

  // Any remaining deferred prep
  if (deferredQueue.length > 0) {
    phases.push({
      name: "Remaining Prep",
      type: "prep",
      time: deferredQueue.reduce((sum, op) => sum + op.time, 0),
      operations: deferredQueue,
      parallel: false,
    });
  }

  // FINISH phase
  if (finishSteps.length > 0) {
    phases.push({
      name: "Finish",
      type: "finish",
      time: finishSteps.reduce((sum, s) => sum + (s.time || 1), 0),
      operations: finishSteps,
      parallel: false,
    });
  }

  return phases;
}

// ---------------------------------------------------------------------------
// computeTotalTime
// ---------------------------------------------------------------------------

/**
 * Calculate total time from a phase list. Parallel operations within a phase
 * run concurrently with the main operations, so only the longer duration
 * counts for that phase.
 *
 * @param {Array<{time: number, parallel?: boolean, parallelOps?: object[]}>} phases
 * @returns {number} Total time in minutes.
 */
export function computeTotalTime(phases) {
  let total = 0;
  for (const phase of phases) {
    if (phase.parallel && phase.parallelOps && phase.parallelOps.length > 0) {
      // The main phase time already covers the window; parallel ops fit inside
      // it, so we just take the phase time (the max of main vs parallel).
      const parallelTime = phase.parallelOps.reduce(
        (sum, op) => sum + (op.time || 0),
        0
      );
      total += Math.max(phase.time, parallelTime);
    } else {
      total += phase.time;
    }
  }
  return total;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ---------------------------------------------------------------------------
// Self-test when run directly
// ---------------------------------------------------------------------------
if (import.meta.url === `file://${process.argv[1]}`) {
  const sampleRecipe = {
    meta: {
      title: "Spaghetti Bolognese",
      slug: "spaghetti-bolognese",
      servings: 4,
      totalTime: { relaxed: 55, optimized: 43 },
    },
    ingredients: [
      { id: "onion", name: "Onion", quantity: 1, unit: "whole", group: "vegetables" },
      { id: "garlic", name: "Garlic", quantity: 3, unit: "cloves", group: "vegetables" },
      { id: "mince", name: "Beef mince", quantity: 500, unit: "g", group: "meat" },
      { id: "tomatoes", name: "Crushed tomatoes", quantity: 400, unit: "g", group: "canned" },
      { id: "spaghetti", name: "Spaghetti", quantity: 400, unit: "g", group: "pasta" },
      { id: "parmesan", name: "Parmesan", quantity: 50, unit: "g", group: "dairy" },
    ],
    equipment: [
      { id: "large-pan", name: "Large pan", count: 1 },
      { id: "large-pot", name: "Large pot", count: 1 },
      { id: "cutting-board", name: "Cutting board", count: 1 },
      { id: "grater", name: "Grater", count: 1 },
    ],
    operations: [
      {
        id: "dice-onion", type: "prep", action: "dice",
        inputs: ["onion"],
        equipment: { use: "cutting-board", release: true },
        time: 3, activeTime: 3,
      },
      {
        id: "mince-garlic", type: "prep", action: "mince",
        inputs: ["garlic"],
        equipment: { use: "cutting-board", release: true },
        time: 2, activeTime: 2,
      },
      {
        id: "saute-veg", type: "cook", action: "saut\u00e9",
        inputs: ["dice-onion", "mince-garlic"],
        equipment: { use: "large-pan", release: false },
        time: 5, activeTime: 5, heat: "medium",
      },
      {
        id: "brown-mince", type: "cook", action: "brown",
        inputs: ["saute-veg", "mince"],
        equipment: { use: "large-pan", release: false },
        time: 8, activeTime: 8, heat: "medium-high",
      },
      {
        id: "simmer-sauce", type: "cook", action: "simmer",
        inputs: ["brown-mince", "tomatoes"],
        equipment: { use: "large-pan", release: true },
        time: 20, activeTime: 0, scalable: false, heat: "low",
        output: "sauce",
      },
      {
        id: "boil-pasta", type: "cook", action: "boil",
        inputs: ["spaghetti"],
        equipment: { use: "large-pot", release: true },
        time: 8, activeTime: 1, heat: "high",
        output: "pasta",
      },
      {
        id: "grate-parmesan", type: "prep", action: "grate",
        inputs: ["parmesan"],
        equipment: { use: "grater", release: true },
        time: 2, activeTime: 2,
      },
    ],
    finishSteps: [
      { action: "drain", inputs: ["boil-pasta"], details: "Reserve a cup of pasta water" },
      { action: "toss", inputs: ["simmer-sauce", "boil-pasta"], details: "Combine in the pan" },
      { action: "top", inputs: ["grate-parmesan"], details: "Serve immediately" },
    ],
  };

  console.log("=== Recipe Optimize Self-Test ===\n");

  // Validate DAG
  const validation = validateDag(sampleRecipe);
  console.log("validateDag:", validation.valid ? "PASS (valid)" : "FAIL");
  if (!validation.valid) console.log("  errors:", validation.errors);

  // Relaxed schedule
  const relaxed = computeSchedule(sampleRecipe, "relaxed");
  const relaxedTime = computeTotalTime(relaxed);
  console.log(`\nRelaxed schedule (${relaxedTime} min):`);
  for (const phase of relaxed) {
    const ops = phase.operations.map((o) => o.id || o.action).join(", ");
    console.log(`  [${phase.type}] ${phase.name} — ${phase.time} min (${ops})`);
  }

  // Optimized schedule
  const optimized = computeSchedule(sampleRecipe, "optimized");
  const optimizedTime = computeTotalTime(optimized);
  console.log(`\nOptimized schedule (${optimizedTime} min):`);
  for (const phase of optimized) {
    const ops = phase.operations.map((o) => o.id || o.action).join(", ");
    const parallel =
      phase.parallel && phase.parallelOps
        ? ` | parallel: ${phase.parallelOps.map((o) => o.id || o.action).join(", ")}`
        : "";
    console.log(
      `  [${phase.type}] ${phase.name} — ${phase.time} min (${ops}${parallel})`
    );
  }

  // Resolve ingredients
  const sauteOp = sampleRecipe.operations.find((o) => o.id === "saute-veg");
  const sauteIngredients = resolveIngredients(sauteOp, sampleRecipe);
  console.log(
    `\nIngredients for saute-veg: ${sauteIngredients.map((i) => i.name).join(", ")}`
  );

  // Basic assertions
  let passed = 0;
  let failed = 0;

  function assert(condition, label) {
    if (condition) {
      passed++;
    } else {
      failed++;
      console.log(`  FAIL: ${label}`);
    }
  }

  console.log("\n--- Assertions ---");
  assert(validation.valid === true, "DAG should be valid");
  assert(relaxedTime > optimizedTime, "Optimized should be shorter than relaxed");
  assert(
    relaxed[0].type === "prep" && relaxed[0].operations.length === 3,
    "Relaxed should have all 3 prep ops in first phase"
  );
  assert(
    optimized[0].type === "prep" && optimized[0].operations.length === 2,
    "Optimized should have 2 early prep ops (dice-onion, mince-garlic — both needed by main chain)"
  );
  assert(
    optimized.some((p) => p.parallel && p.parallelOps && p.parallelOps.length > 0),
    "Optimized should have at least one phase with parallel ops"
  );
  assert(
    sauteIngredients.length === 2,
    "saute-veg should resolve to 2 ingredients (onion, garlic)"
  );
  assert(
    sauteIngredients.some((i) => i.id === "onion") &&
      sauteIngredients.some((i) => i.id === "garlic"),
    "saute-veg ingredients should be onion and garlic"
  );

  // Test cycle detection
  const cyclicRecipe = {
    ingredients: [{ id: "a", name: "A" }],
    equipment: [],
    operations: [
      { id: "op1", type: "prep", inputs: ["op2"], time: 1 },
      { id: "op2", type: "prep", inputs: ["op1"], time: 1 },
    ],
    finishSteps: [],
  };
  const cyclicResult = validateDag(cyclicRecipe);
  assert(cyclicResult.valid === false, "Cyclic DAG should be invalid");
  assert(
    cyclicResult.errors.some((e) => e.includes("Cycle")),
    "Should report cycle error"
  );

  // Test unresolved reference
  const unresolvedRecipe = {
    ingredients: [{ id: "a", name: "A" }],
    equipment: [],
    operations: [
      { id: "op1", type: "prep", inputs: ["nonexistent"], time: 1 },
    ],
    finishSteps: [],
  };
  const unresolvedResult = validateDag(unresolvedRecipe);
  assert(unresolvedResult.valid === false, "Unresolved ref should be invalid");

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
  console.log("\nAll tests passed.");
}
