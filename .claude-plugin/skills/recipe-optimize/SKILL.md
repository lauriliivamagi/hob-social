---
name: recipe-optimize
description: "Guidance for computing relaxed and optimized phase maps from the operation DAG"
---

# Recipe Optimize Skill

Compute relaxed and optimized phase maps from a recipe's operation DAG. Schedule computation is implemented in TypeScript at `src/domain/schedule/schedule.ts`, DAG validation in `src/domain/schedule/dag.ts`. These are called by the Vite build plugin (`src/build/vite-plugin-recipes.ts`) automatically during `npm run build`.

## Running the Build

```bash
cd ${CLAUDE_PROJECT_DIR} && npm run build
```

The Vite plugin processes all recipe JSON files, validates DAGs, and computes both relaxed and optimized schedules automatically.

## Two Modes

### Relaxed Mode

All prep operations are front-loaded into a single PREP phase before any cooking begins.

Algorithm:
1. Collect all operations with `type: "prep"` into the PREP phase
2. Order them by dependency (topological sort within prep)
3. Remaining operations execute sequentially in dependency order
4. No parallelism — one task at a time
5. Total time = sum of all operation `time` values

Phase structure:
- **PREP** — all prep operations
- **COOK** — active cooking operations in dependency order
- **PASSIVE** — passive operations (where `activeTime` is 0 or near-0)
- **FINISH** — finish steps

### Optimized Mode

Only essential prep is done upfront. Remaining prep is distributed into idle windows created by passive operations (e.g., grate parmesan while sauce simmers).

Algorithm:
1. Identify the critical path through the DAG (longest path by total time)
2. Determine which prep operations are prerequisites for the first cook operation — these go in the initial PREP phase
3. For remaining prep operations, find idle windows:
   - When a passive operation is running (e.g., `simmer-sauce` with `activeTime: 0` and `time: 20`), that creates a 20-minute idle window
   - Schedule prep operations into these windows, respecting equipment constraints
4. If a prep operation does not fit in any idle window, keep it in the initial PREP phase
5. Total time = critical path duration (parallel tasks overlap)

Phase structure:
- **PREP** — only essential prep (prerequisites for first cook step)
- **COOK/PARALLEL** — interleaved cook and prep phases, with parallel tasks shown side-by-side
- **PASSIVE** — passive operations with distributed prep in idle windows
- **FINISH** — finish steps

## Equipment Conflict Resolution

- Track which equipment is in use at each point in time
- `release: false` means the equipment remains occupied for the next operation on the same equipment
- `release: true` means the equipment is freed
- Never schedule two operations that need the same equipment simultaneously
- If a conflict is detected, serialize the conflicting operations

## DAG Validation

When running with `--validate`, check:

1. **No cycles** — topological sort must succeed
2. **All references resolve** — every ID in `inputs` arrays must match an ingredient ID or operation ID
3. **Equipment exists** — every `equipment.use` must reference a valid equipment ID
4. **Finish steps valid** — all `finishSteps[].inputs` must reference operation IDs
5. **Sub-products valid** — all `subProducts[].finalOp` must reference operation IDs
6. **No orphan operations** — every operation must be reachable from at least one finish step (warn, don't error)

## Implementation Details

The schedule computation is in `src/domain/schedule/schedule.ts`:

1. Builds an adjacency list from operations and their inputs
2. Topological sort to get execution order
3. For relaxed: group by type (prep first, then cook, then finish)
4. For optimized: compute critical path, identify idle windows, redistribute prep
5. Results are embedded in the generated HTML as `SCHEDULE_RELAXED` and `SCHEDULE_OPTIMIZED` globals
