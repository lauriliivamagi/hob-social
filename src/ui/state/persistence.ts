const STORAGE_KEY = 'recipe-visualizer';

interface PersistedState {
  lastRecipeSlug?: string;
  mode?: 'relaxed' | 'optimized';
  servings?: Record<string, number>;
  currentStep?: Record<string, number>;
}

export function saveState(state: PersistedState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage not available or full
  }
}

export function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // localStorage not available
  }
  return {};
}
