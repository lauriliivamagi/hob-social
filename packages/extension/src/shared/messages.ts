import type { AISettings, StoredRecipe } from './types.js';

// --- Content script messages ---

export interface ExtractRequest {
  type: 'EXTRACT_RECIPE';
}

export interface ExtractResult {
  type: 'EXTRACT_RESULT';
  data: {
    url: string;
    title: string;
    contentMarkdown: string;
    schemaOrgData: unknown;
    language: string;
  };
}

// --- Popup → Service worker messages ---

export interface ImportRequest {
  type: 'IMPORT_RECIPE';
}

export interface ListRecipesRequest {
  type: 'LIST_RECIPES';
}

export interface DeleteRecipeRequest {
  type: 'DELETE_RECIPE';
  slug: string;
}

export interface ExportRecipeRequest {
  type: 'EXPORT_RECIPE';
  slug: string;
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface GetLastStatusRequest {
  type: 'GET_LAST_STATUS';
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  settings: AISettings;
}

export interface SaveAtprotoRkeyRequest {
  type: 'SAVE_ATPROTO_RKEY';
  slug: string;
  rkey: string;
}

// --- Service worker → Popup responses ---

export type ImportStatus =
  | { type: 'STATUS'; phase: 'idle' }
  | { type: 'STATUS'; phase: 'extracting' }
  | { type: 'STATUS'; phase: 'parsing'; attempt: number }
  | { type: 'STATUS'; phase: 'done'; slug: string; title: string }
  | { type: 'STATUS'; phase: 'error'; message: string };

/** @knipignore */
export interface ListRecipesResponse {
  type: 'LIST_RECIPES_RESULT';
  recipes: StoredRecipe[];
}

/** @knipignore */
export interface SettingsResponse {
  type: 'SETTINGS_RESULT';
  settings: AISettings;
}

// --- Union types ---

export type ServiceWorkerMessage =
  | ImportRequest
  | ListRecipesRequest
  | DeleteRecipeRequest
  | ExportRecipeRequest
  | GetSettingsRequest
  | SaveSettingsRequest
  | GetLastStatusRequest
  | SaveAtprotoRkeyRequest;

export type ContentScriptMessage = ExtractRequest;
