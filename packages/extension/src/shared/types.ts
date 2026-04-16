/** Supported LLM providers */
export type LLMProvider = 'anthropic' | 'openai' | 'google' | 'ollama' | 'ollama-cloud';

/** Model metadata for the registry */
export interface ModelInfo {
  id: string;
  name: string;
  contextWindow: number;
}

/** Persisted AI settings in chrome.storage.local */
export interface AISettings {
  provider: LLMProvider;
  model: string;
  apiKeys: Partial<Record<LLMProvider, string>>;
  ollamaBaseUrl?: string;
  ollamaCloudBaseUrl?: string;
}

/** Stored recipe in IndexedDB */
export interface StoredRecipe {
  slug: string;
  recipe: unknown;
  sourceUrl: string;
  importedAt: number;
  title: string;
  /** Raw LLM output (post-sanitization) for debugging/iteration */
  rawLlmOutput?: string;
  /**
   * ATproto record key assigned on first publish. Reused on republish so the
   * at:// permalink remains stable even if slug/title change. Absent until
   * the recipe has been published at least once.
   */
  atprotoRkey?: string;
}
