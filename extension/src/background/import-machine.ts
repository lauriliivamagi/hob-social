/**
 * XState machine for the recipe import pipeline.
 *
 * Manages the import lifecycle: idle → extracting → parsing (with retries) →
 * done/error. Persists snapshot to chrome.storage.local so the popup can
 * restore state across open/close cycles.
 *
 * Designed to grow: PDS sync, batch imports, and review steps can be added
 * as parallel/child states without rewriting the core flow.
 */

import { setup, assign, fromPromise } from 'xstate';
import { generateText } from 'ai';
import { parseRecipe } from '@domain/recipe/parse.js';
import { createModelFromSettings } from './ai-provider.js';
import { buildSystemPrompt, buildUserPrompt } from './ai-prompt.js';
import { getSettings } from './settings.js';
import { saveRecipe } from './recipe-store.js';
import type { ExtractResult } from '../shared/messages.js';
import type { StoredRecipe, AISettings } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Constants & Types
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;

export interface ImportContext {
  tabId: number | null;
  extraction: ExtractResult['data'] | null;
  attempt: number;
  settings: AISettings | null;
  lastError: string | null;
  /** The raw JSON the LLM produced on the last failed attempt */
  lastRawOutput: string | null;
  resultSlug: string | null;
  resultTitle: string | null;
  errorMessage: string | null;
}

export type ImportEvent =
  | { type: 'IMPORT'; tabId: number }
  | { type: 'RESET' };

/** Serializable snapshot for popup status display */
export type ImportPhase = 'idle' | 'extracting' | 'parsing' | 'done' | 'error';

// ---------------------------------------------------------------------------
// Actors (async side effects)
// ---------------------------------------------------------------------------

const extractActor = fromPromise<ExtractResult['data'], { tabId: number }>(
  async ({ input }) => {
    await chrome.scripting.executeScript({
      target: { tabId: input.tabId },
      files: ['content-script.js'],
    });

    // Retry until the content script's listener is registered
    for (let i = 0; i < 5; i++) {
      try {
        const result = await chrome.tabs.sendMessage(input.tabId, {
          type: 'EXTRACT_RECIPE',
        }) as ExtractResult;
        if (result?.data?.contentMarkdown) return result.data;
        throw new Error('Empty extraction result');
      } catch (err) {
        if (i === 4) throw err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    throw new Error('Content script not responding');
  },
);

interface ParseInput {
  settings: AISettings;
  extraction: ExtractResult['data'];
  lastError: string | null;
  lastRawOutput: string | null;
}

interface ParseOutput {
  slug: string;
  title: string;
}

/** Custom error that carries the raw LLM output for retry feedback */
class ParseError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
  }
}

const parseAndStoreActor = fromPromise<ParseOutput, ParseInput>(async ({ input }) => {
  const model = createModelFromSettings(input.settings);

  const { text } = await generateText({
    model,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt(input.extraction, input.lastError ?? undefined, input.lastRawOutput ?? undefined),
    temperature: 0,
    maxTokens: 20000,
  });

  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(cleaned);
  } catch {
    throw new ParseError('LLM returned invalid JSON', cleaned.slice(0, 2000));
  }

  sanitizeIds(raw);

  // Capture the sanitized JSON for error feedback before validation
  const sanitizedJson = JSON.stringify(raw, null, 2).slice(0, 3000);

  try {
    const recipe = parseRecipe(raw);
    const stored: StoredRecipe = {
      slug: recipe.meta.slug,
      recipe,
      sourceUrl: input.extraction.url,
      importedAt: Date.now(),
      title: recipe.meta.title,
    };
    await saveRecipe(stored);
    return { slug: recipe.meta.slug, title: recipe.meta.title };
  } catch (err) {
    throw new ParseError(
      err instanceof Error ? err.message : String(err),
      sanitizedJson,
    );
  }
});

const loadSettingsActor = fromPromise<AISettings>(async () => getSettings());

// ---------------------------------------------------------------------------
// Post-processing: fix common LLM output issues before validation
// ---------------------------------------------------------------------------

/** Convert any string to valid kebab-case ID: ^[a-z0-9]+(-[a-z0-9]+)*$ */
function toKebabId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[._\s]+/g, '-')     // underscores, dots, spaces → hyphens
    .replace(/[^a-z0-9-]/g, '')   // strip anything else
    .replace(/-+/g, '-')          // collapse multiple hyphens
    .replace(/^-|-$/g, '');       // trim leading/trailing hyphens
}

/**
 * Walk the raw LLM output and sanitize all ID fields in-place.
 * Builds a rename map so references (depends, ingredients, equipment.use,
 * subProducts.finalOp) stay consistent.
 */
function sanitizeIds(raw: Record<string, unknown>): void {
  const renames = new Map<string, string>();

  function fix(id: string): string {
    if (renames.has(id)) return renames.get(id)!;
    const clean = toKebabId(id);
    if (clean !== id) renames.set(id, clean);
    return clean;
  }

  // Fix ingredient IDs
  const ingredients = raw['ingredients'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(ingredients)) {
    for (const ing of ingredients) {
      if (typeof ing['id'] === 'string') ing['id'] = fix(ing['id']);
      // Also fix nested quantity → flat quantity/unit if LLM nested them
      const q = ing['quantity'];
      if (q && typeof q === 'object' && !Array.isArray(q)) {
        const qObj = q as Record<string, unknown>;
        if ('amount' in qObj) {
          ing['quantity'] = qObj['amount'];
          if ('unit' in qObj && !('unit' in ing)) ing['unit'] = qObj['unit'];
        }
      }
    }
  }

  // Fix equipment IDs
  const equipment = raw['equipment'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(equipment)) {
    for (const eq of equipment) {
      if (typeof eq['id'] === 'string') eq['id'] = fix(eq['id']);
    }
  }

  // Fix operation IDs and their references
  const operations = raw['operations'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(operations)) {
    // First pass: fix operation IDs
    for (const op of operations) {
      if (typeof op['id'] === 'string') op['id'] = fix(op['id']);
      if (typeof op['subProduct'] === 'string') op['subProduct'] = fix(op['subProduct']);
      if (typeof op['output'] === 'string') op['output'] = fix(op['output']);
    }
    // Second pass: fix references
    for (const op of operations) {
      const deps = op['depends'] as string[] | undefined;
      if (Array.isArray(deps)) op['depends'] = deps.map((d) => fix(d));
      const ings = op['ingredients'] as string[] | undefined;
      if (Array.isArray(ings)) op['ingredients'] = ings.map((i) => fix(i));
      const equip = op['equipment'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(equip)) {
        for (const e of equip) {
          if (typeof e['use'] === 'string') e['use'] = fix(e['use']);
        }
      }
    }
  }

  // Fix subProduct IDs and finalOp references
  const subProducts = raw['subProducts'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(subProducts)) {
    for (const sp of subProducts) {
      if (typeof sp['id'] === 'string') sp['id'] = fix(sp['id']);
      if (typeof sp['finalOp'] === 'string') sp['finalOp'] = fix(sp['finalOp']);
    }
  }

  // Fix meta.slug
  const meta = raw['meta'] as Record<string, unknown> | undefined;
  if (meta && typeof meta['slug'] === 'string') {
    meta['slug'] = toKebabId(meta['slug']);
  }
}

// ---------------------------------------------------------------------------
// Machine
// ---------------------------------------------------------------------------

const freshContext: Omit<ImportContext, 'tabId'> = {
  extraction: null,
  attempt: 0,
  settings: null,
  lastError: null,
  lastRawOutput: null,
  resultSlug: null,
  resultTitle: null,
  errorMessage: null,
};

export const importMachine = setup({
  types: {
    context: {} as ImportContext,
    events: {} as ImportEvent,
  },
  actors: {
    extract: extractActor,
    parseAndStore: parseAndStoreActor,
    loadSettings: loadSettingsActor,
  },
  guards: {
    canRetry: ({ context }) => context.attempt < MAX_RETRIES,
  },
}).createMachine({
  id: 'import',
  initial: 'idle',
  context: { ...freshContext, tabId: null },

  states: {
    idle: {
      on: {
        IMPORT: {
          target: 'loadingSettings',
          actions: assign({
            ...freshContext,
            tabId: ({ event }) => event.tabId,
          }),
        },
      },
    },

    loadingSettings: {
      invoke: {
        src: 'loadSettings',
        onDone: {
          target: 'extracting',
          actions: assign({ settings: ({ event }) => event.output }),
        },
        onError: {
          target: 'error',
          actions: assign({ errorMessage: ({ event }) => String(event.error) }),
        },
      },
    },

    extracting: {
      invoke: {
        src: 'extract',
        input: ({ context }) => ({ tabId: context.tabId! }),
        onDone: {
          target: 'parsing',
          actions: assign({
            extraction: ({ event }) => event.output,
            attempt: 1,
          }),
        },
        onError: {
          target: 'error',
          actions: assign({ errorMessage: ({ event }) => String(event.error) }),
        },
      },
    },

    parsing: {
      invoke: {
        src: 'parseAndStore',
        input: ({ context }) => ({
          settings: context.settings!,
          extraction: context.extraction!,
          lastError: context.lastError,
          lastRawOutput: context.lastRawOutput,
        }),
        onDone: {
          target: 'done',
          actions: assign({
            resultSlug: ({ event }) => event.output.slug,
            resultTitle: ({ event }) => event.output.title,
          }),
        },
        onError: [
          {
            guard: 'canRetry',
            target: 'parsing',
            actions: assign({
              attempt: ({ context }) => context.attempt + 1,
              lastError: ({ event }) => event.error instanceof Error
                ? event.error.message
                : String(event.error),
              lastRawOutput: ({ event }) => event.error instanceof ParseError
                ? event.error.rawOutput
                : null,
            }),
            reenter: true,
          },
          {
            target: 'error',
            actions: assign({
              errorMessage: ({ event }) =>
                `Failed after ${MAX_RETRIES} attempts: ${event.error instanceof Error ? event.error.message : String(event.error)}`,
            }),
          },
        ],
      },
    },

    done: {
      on: {
        RESET: 'idle',
        IMPORT: {
          target: 'loadingSettings',
          actions: assign({
            ...freshContext,
            tabId: ({ event }) => event.tabId,
          }),
        },
      },
    },

    error: {
      on: {
        RESET: 'idle',
        IMPORT: {
          target: 'loadingSettings',
          actions: assign({
            ...freshContext,
            tabId: ({ event }) => event.tabId,
          }),
        },
      },
    },
  },
});
