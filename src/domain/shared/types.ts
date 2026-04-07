// ---------------------------------------------------------------------------
// Shared Kernel — minimal types shared between recipe and schedule contexts
// ---------------------------------------------------------------------------
// Schedule needs the subset of Operation relevant to scheduling + display.
// Recipe's full Operation extends this with optional fields (temperature, details).
// IDs are plain strings here — branded IDs are a recipe-context concern.
// ---------------------------------------------------------------------------

/** Duration or range in seconds. */
export interface TimeRange {
  readonly min: number;
  readonly max?: number;
}

/** The subset of an Operation that the scheduler needs. */
export interface SchedulableOperation {
  readonly id: string;
  readonly type: 'prep' | 'cook' | 'rest' | 'assemble';
  readonly action: string;
  readonly ingredients: readonly string[];
  readonly depends: readonly string[];
  readonly equipment: readonly { readonly use: string; readonly release: boolean }[];
  readonly time: TimeRange;
  readonly activeTime: TimeRange;
  readonly scalable: boolean;
  readonly temperature?: { readonly min: number; readonly max?: number; readonly unit: 'C' | 'F' };
  readonly subProduct?: string;
  readonly output?: string;
}
