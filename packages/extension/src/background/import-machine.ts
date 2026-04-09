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
import { generateObject, jsonSchema, NoObjectGeneratedError } from 'ai';
import { jsonrepair } from 'jsonrepair';
import { parseRecipe } from '@recipe/domain/recipe/parse.js';
import type { Recipe } from '@recipe/domain/recipe/types.js';
import { createModelFromSettings, getGenerationConfig } from './ai-provider.js';
import { buildSystemPrompt, buildUserPrompt, findRecipeSchema } from './ai-prompt.js';
import { getSettings } from './settings.js';
import { saveRecipe } from './recipe-store.js';
import { normalizeUnit } from '@recipe/domain/scaling/unit-convert.js';
import tagsJson from '../../../domain/config/tags.json' with { type: 'json' };
import type { ExtractResult } from '../shared/messages.js';
import type { StoredRecipe, AISettings } from '../shared/types.js';

/** Flat set of all valid tags across all categories */
const VALID_TAGS = new Set(
  Object.values(tagsJson as Record<string, string[]>).flat(),
);

/** Heat description → temperature range (°C). Applied as fallback when LLM omits temperature. */
const HEAT_TO_TEMP: Array<{ pattern: RegExp; temp: { min: number; max: number; unit: string } }> = [
  { pattern: /\b(?:very\s+)?low\s+heat\b/i,         temp: { min: 90,  max: 120, unit: 'C' } },
  { pattern: /\bmedium[-\s]?low\s+heat\b/i,          temp: { min: 120, max: 150, unit: 'C' } },
  { pattern: /\bmedium[-\s]?high\s+heat\b/i,         temp: { min: 190, max: 220, unit: 'C' } },
  { pattern: /\bmedium\s+heat\b/i,                    temp: { min: 160, max: 180, unit: 'C' } },
  { pattern: /\bhigh\s+heat\b/i,                      temp: { min: 230, max: 260, unit: 'C' } },
  { pattern: /\bover\s+medium\b/i,                    temp: { min: 160, max: 180, unit: 'C' } },
  { pattern: /\bover\s+(?:medium[-\s]?)?low\b/i,     temp: { min: 120, max: 150, unit: 'C' } },
  { pattern: /\bover\s+(?:medium[-\s]?)?high\b/i,    temp: { min: 190, max: 220, unit: 'C' } },
];

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
  isFinalAttempt: boolean;
}

interface ParseOutput {
  slug: string;
  title: string;
}

/** Custom error that carries the raw LLM output for retry feedback */
export class ParseError extends Error {
  constructor(message: string, public readonly rawOutput: string) {
    super(message);
  }
}

/**
 * Strip markdown code fences and repair common LLM JSON issues
 * (trailing commas, single quotes, comments, truncated output).
 */
export function cleanLlmJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
  return JSON.parse(jsonrepair(cleaned));
}

/**
 * Lightweight structural schema for constrained decoding.
 * Guarantees correct top-level shape (object with 5 keys of the right types)
 * without the per-token cost of validating every nested field, regex pattern,
 * and enum. The full schema stays in the prompt for guidance; our deterministic
 * post-processing pipeline (sanitizeIds, postProcessRaw, parseRecipe) handles
 * the rest.
 */
/**
 * Lightweight structural schema for constrained decoding.
 *
 * Includes required field names at each level so providers like Google
 * don't accept empty objects as valid. Omits regex patterns, enums,
 * and deep nesting to keep per-token constraint cost low.
 */
import recipeSkeletonJson from '../../../build/config/recipe-skeleton-schema.json' with { type: 'json' };

/**
 * Mid-weight structural schema for constrained decoding.
 * Loaded from packages/build/config/recipe-skeleton-schema.json (shared with evals).
 */
const recipeSkeletonSchema = jsonSchema(recipeSkeletonJson as Parameters<typeof jsonSchema>[0]);

const parseAndStoreActor = fromPromise<ParseOutput, ParseInput>(async ({ input }) => {
  const model = createModelFromSettings(input.settings);
  const genConfig = getGenerationConfig(input.settings.provider, input.settings.model);

  let raw: Record<string, unknown>;

  try {
    const result = await generateObject({
      model,
      schema: recipeSkeletonSchema,
      schemaName: 'Recipe',
      schemaDescription: 'Structured recipe with ingredients, equipment, operations DAG, and sub-products',
      system: buildSystemPrompt(),
      prompt: buildUserPrompt(input.extraction, input.lastError ?? undefined, input.lastRawOutput ?? undefined),
      temperature: genConfig.temperature,
      topP: genConfig.topP,
      maxOutputTokens: genConfig.maxOutputTokens,
      providerOptions: genConfig.providerOptions as Parameters<typeof generateObject>[0]['providerOptions'],
      // Some models (e.g., Gemma 4 via Ollama) wrap JSON in markdown fences even
      // with format: json set. Strip them before the SDK tries to parse.
      experimental_repairText: async ({ text }) => {
        return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
      },
    });
    raw = result.object as Record<string, unknown>;
  } catch (err) {
    // Extract raw model output from NoObjectGeneratedError for retry feedback
    const rawOutput = NoObjectGeneratedError.isInstance(err) && err.text
      ? err.text.slice(0, 6000)
      : undefined;
    const msg = err instanceof Error ? err.message : String(err);
    throw new ParseError(msg, rawOutput ?? msg.slice(0, 2000));
  }

  sanitizeIds(raw);
  postProcessRaw(raw, input.extraction);

  // Capture the sanitized JSON for error feedback before validation
  const sanitizedJson = JSON.stringify(raw, null, 2).slice(0, 6000);

  let recipe: Recipe | null = null;
  let slug: string;
  let title: string;

  if (!input.isFinalAttempt) {
    // Normal path: strict validation
    try {
      recipe = parseRecipe(raw);
    } catch (err) {
      throw new ParseError(
        err instanceof Error ? err.message : String(err),
        sanitizedJson,
      );
    }
    slug = recipe.meta.slug;
    title = recipe.meta.title;
  } else {
    // Forgiving path: accept raw output as-is after all retries exhausted
    const meta = raw['meta'] as Record<string, unknown> | undefined;
    slug = typeof meta?.['slug'] === 'string' ? toKebabId(meta['slug']) : `import-${Date.now()}`;
    title = typeof meta?.['title'] === 'string' ? (meta['title'] as string) : 'Untitled Recipe';
  }

  const stored: StoredRecipe = {
    slug,
    recipe: recipe ?? raw,
    sourceUrl: input.extraction.url,
    importedAt: Date.now(),
    title,
    rawLlmOutput: sanitizedJson,
  };
  await saveRecipe(stored);
  return { slug, title };
});

const loadSettingsActor = fromPromise<AISettings>(async () => getSettings());

// ---------------------------------------------------------------------------
// Post-processing: fix common LLM output issues before validation
// ---------------------------------------------------------------------------

/** Convert any string to valid kebab-case ID: ^[a-z0-9]+(-[a-z0-9]+)*$ */
export function toKebabId(s: string): string {
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
export function sanitizeIds(raw: Record<string, unknown>): void {
  const renames = new Map<string, string>();

  function fix(id: string): string {
    if (renames.has(id)) return renames.get(id)!;
    const clean = toKebabId(id);
    if (clean !== id) renames.set(id, clean);
    return clean;
  }

  // Fix ingredient IDs (including alternatives)
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
      // Fix alternative ingredient IDs
      const alts = ing['alternatives'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(alts)) {
        for (const alt of alts) {
          if (typeof alt['id'] === 'string') alt['id'] = fix(alt['id']);
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
// Post-processing: deterministic fixes applied after sanitizeIds
// ---------------------------------------------------------------------------

interface ExtractionData {
  url: string;
  language: string;
  schemaOrgData: unknown;
  contentMarkdown?: string;
}

/**
 * Apply deterministic fixes to the raw LLM output that we can verify
 * programmatically — reduces validation failures and improves quality
 * without burning retries.
 */
export function postProcessRaw(raw: Record<string, unknown>, extraction: ExtractionData): void {
  const meta = raw['meta'] as Record<string, unknown> | undefined;
  const operations = raw['operations'] as Array<Record<string, unknown>> | undefined;
  const ingredients = raw['ingredients'] as Array<Record<string, unknown>> | undefined;
  const equipment = raw['equipment'] as Array<Record<string, unknown>> | undefined;

  // 1. Override meta.language from extraction (LLM often guesses wrong)
  if (meta) {
    meta['language'] = extraction.language;
  }

  // 2. Override meta.source from extraction URL
  if (meta) {
    meta['source'] = extraction.url;
  }

  // 3. Inject meta.servings from schema.org recipeYield when available
  if (meta && extraction.schemaOrgData) {
    const schemaRecipe = findRecipeSchema(extraction.schemaOrgData) as Record<string, unknown> | null;
    if (schemaRecipe?.['recipeYield'] != null) {
      const yieldVal = schemaRecipe['recipeYield'];
      const parsed = typeof yieldVal === 'number'
        ? yieldVal
        : parseInt(String(Array.isArray(yieldVal) ? yieldVal[0] : yieldVal), 10);
      if (!isNaN(parsed) && parsed > 0) {
        meta['servings'] = parsed;
      }
    }
  }

  // 4. Clamp activeTime ≤ time on all operations
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const time = op['time'] as { min?: number; max?: number } | undefined;
      const activeTime = op['activeTime'] as { min?: number; max?: number } | undefined;
      if (time && activeTime && time.min != null && activeTime.min != null) {
        if (activeTime.min > time.min) {
          activeTime.min = time.min;
        }
        if (activeTime.max != null && time.max != null && activeTime.max > time.max) {
          activeTime.max = time.max;
        }
      }
    }
  }

  // 5. Deduplicate ingredients by ID (keep first occurrence)
  if (Array.isArray(ingredients)) {
    const seen = new Set<string>();
    const deduped: Array<Record<string, unknown>> = [];
    for (const ing of ingredients) {
      const id = ing['id'] as string;
      if (!seen.has(id)) {
        seen.add(id);
        deduped.push(ing);
      }
    }
    if (deduped.length < ingredients.length) {
      raw['ingredients'] = deduped;
    }
  }

  // 6. Remove orphan ingredients/equipment not referenced by any operation
  if (Array.isArray(operations)) {
    const usedIngredientIds = new Set<string>();
    const usedEquipmentIds = new Set<string>();
    for (const op of operations) {
      const ings = op['ingredients'] as string[] | undefined;
      if (Array.isArray(ings)) ings.forEach((id) => usedIngredientIds.add(id));
      const eqs = op['equipment'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(eqs)) eqs.forEach((e) => usedEquipmentIds.add(e['use'] as string));
    }

    const currentIngs = raw['ingredients'] as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(currentIngs)) {
      raw['ingredients'] = currentIngs.filter((ing) => usedIngredientIds.has(ing['id'] as string));
    }

    if (Array.isArray(equipment)) {
      raw['equipment'] = equipment.filter((eq) => usedEquipmentIds.has(eq['id'] as string));
    }
  }

  // 7. Remove self-references in depends (guaranteed cycle)
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const deps = op['depends'] as string[] | undefined;
      if (Array.isArray(deps)) {
        op['depends'] = deps.filter((d) => d !== op['id']);
      }
    }
  }

  // 8. Deduplicate depends arrays
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const deps = op['depends'] as string[] | undefined;
      if (Array.isArray(deps)) {
        op['depends'] = [...new Set(deps)];
      }
    }
  }

  // 9. Recalculate meta.totalTime from the operation DAG critical path
  // TODO: compute optimized separately (prep done during idle windows) vs relaxed (all sequential)
  if (meta && Array.isArray(operations) && operations.length > 0) {
    const totalTime = computeCriticalPathTime(operations);
    if (totalTime > 0) {
      meta['totalTime'] = {
        relaxed: { min: totalTime },
        optimized: { min: totalTime },
      };
    }
  }

  // --- Semantic validation: clamp values to sensible ranges ---

  // 10. Temperature sanity: 0–350°C or 32–660°F
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const temp = op['temperature'] as { min?: number; max?: number; unit?: string } | undefined;
      if (temp?.min != null) {
        const isFahrenheit = temp.unit === 'F';
        const lo = isFahrenheit ? 32 : 0;
        const hi = isFahrenheit ? 660 : 350;
        temp.min = Math.max(lo, Math.min(hi, temp.min));
        if (temp.max != null) {
          temp.max = Math.max(lo, Math.min(hi, temp.max));
        }
      }
    }
  }

  // 11. Time sanity: ≥ 1s per operation, cap single op at 48h (172800s)
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const time = op['time'] as { min?: number; max?: number } | undefined;
      if (time?.min != null) {
        time.min = Math.max(1, Math.min(172800, time.min));
        if (time.max != null) {
          time.max = Math.max(1, Math.min(172800, time.max));
        }
      }
    }
  }

  // 12. Servings sanity: clamp to 1–200
  if (meta) {
    const servings = meta['servings'];
    if (typeof servings === 'number') {
      meta['servings'] = Math.max(1, Math.min(200, Math.round(servings)));
    }
  }

  // 13. Quantity sanity: ensure quantity.min > 0
  const currentIngs = raw['ingredients'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(currentIngs)) {
    for (const ing of currentIngs) {
      const qty = ing['quantity'] as { min?: number; max?: number } | undefined;
      if (qty?.min != null && qty.min <= 0) {
        qty.min = 1;
      }
    }
  }

  // 14. Difficulty validation: must be easy|medium|hard
  if (meta) {
    const validDifficulties = new Set(['easy', 'medium', 'hard']);
    if (!validDifficulties.has(meta['difficulty'] as string)) {
      meta['difficulty'] = 'medium';
    }
  }

  // 15. Inject meta.originalText from extraction (LLM no longer copies it)
  if (meta && extraction.contentMarkdown) {
    meta['originalText'] = extraction.contentMarkdown;
  }

  // 16. Override meta.slug deterministically from title
  if (meta && typeof meta['title'] === 'string') {
    meta['slug'] = toKebabId(meta['title']);
  }

  // 17. Filter meta.tags to valid tag vocabulary (prevent retry on invented tags)
  //     Then merge in tags derived from schema.org category/cuisine/keywords
  if (meta) {
    const tags = new Set(
      Array.isArray(meta['tags'])
        ? (meta['tags'] as string[]).filter((t) => VALID_TAGS.has(t))
        : [],
    );

    // Derive additional tags from schema.org structured data
    if (extraction.schemaOrgData) {
      const schemaRecipe = findRecipeSchema(extraction.schemaOrgData) as Record<string, unknown> | null;
      if (schemaRecipe) {
        const candidates: string[] = [];
        // recipeCuisine: "Italian" → "italian"
        const cuisine = schemaRecipe['recipeCuisine'];
        if (typeof cuisine === 'string') candidates.push(cuisine.toLowerCase());
        if (Array.isArray(cuisine)) candidates.push(...cuisine.map((c: string) => String(c).toLowerCase()));
        // recipeCategory: "Dessert" → "dessert"
        const category = schemaRecipe['recipeCategory'];
        if (typeof category === 'string') candidates.push(category.toLowerCase());
        if (Array.isArray(category)) candidates.push(...category.map((c: string) => String(c).toLowerCase()));
        // keywords: "vegetarian, quick" → ["vegetarian", "quick"]
        const keywords = schemaRecipe['keywords'];
        if (typeof keywords === 'string') {
          candidates.push(...keywords.split(/[,;]+/).map((k) => k.trim().toLowerCase()));
        }
        if (Array.isArray(keywords)) candidates.push(...keywords.map((k: string) => String(k).toLowerCase()));

        for (const c of candidates) {
          if (VALID_TAGS.has(c)) tags.add(c);
        }
      }
    }

    meta['tags'] = [...tags];
  }

  // 18. Derive energyTier from DAG active time + fork/merge complexity
  if (meta && Array.isArray(operations) && operations.length > 0) {
    let totalActiveTime = 0;
    const dependedOnBy = new Map<string, number>();
    for (const op of operations) {
      const at = op['activeTime'] as { min?: number } | undefined;
      if (at?.min != null) totalActiveTime += at.min;
      const deps = op['depends'] as string[] | undefined;
      if (Array.isArray(deps)) {
        for (const dep of deps) {
          dependedOnBy.set(dep, (dependedOnBy.get(dep) ?? 0) + 1);
        }
      }
    }
    // Fork points: operations depended on by 2+ others (parallel branches)
    const forkPoints = [...dependedOnBy.values()].filter((c) => c >= 2).length;

    if (totalActiveTime < 600 && forkPoints <= 1) {
      meta['energyTier'] = 'zombie';
    } else if (totalActiveTime > 1800 || forkPoints >= 3) {
      meta['energyTier'] = 'project';
    } else {
      meta['energyTier'] = 'moderate';
    }
  }

  // 19. Normalize ingredient unit aliases (tablespoons → tbsp, cups → cup, etc.)
  const finalIngs = raw['ingredients'] as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(finalIngs)) {
    for (const ing of finalIngs) {
      const qty = ing['quantity'] as Record<string, unknown> | undefined;
      if (qty && typeof qty['unit'] === 'string') {
        qty['unit'] = normalizeUnit(qty['unit']);
      }
      // Also normalize alternative ingredient units
      const alts = ing['alternatives'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(alts)) {
        for (const alt of alts) {
          const altQty = alt['quantity'] as Record<string, unknown> | undefined;
          if (altQty && typeof altQty['unit'] === 'string') {
            altQty['unit'] = normalizeUnit(altQty['unit']);
          }
        }
      }
    }
  }

  // 20. Validate/correct operation times from details text
  if (Array.isArray(operations)) {
    for (const op of operations) {
      const details = op['details'] as string | undefined;
      if (!details) continue;
      const parsed = parseTimeFromText(details);
      if (!parsed) continue;
      const time = op['time'] as { min?: number; max?: number } | undefined;
      if (!time?.min) continue;
      // Only correct if there's a significant mismatch (>50% off)
      const ratio = time.min / parsed.min;
      if (ratio < 0.5 || ratio > 2.0) {
        time.min = parsed.min;
        if (parsed.max != null) {
          time.max = parsed.max;
        } else {
          delete time.max;
        }
      }
      // If text has a range but LLM didn't capture max, add it
      if (parsed.max != null && time.max == null) {
        time.max = parsed.max;
      }
    }
  }

  // 21. Heat-to-temperature fallback: inject temperature from heat descriptions
  if (Array.isArray(operations)) {
    for (const op of operations) {
      if (op['temperature'] != null) continue; // already has temperature
      if (op['type'] !== 'cook') continue; // only applies to cooking operations
      const text = [op['details'], op['action']].filter(Boolean).join(' ');
      for (const { pattern, temp } of HEAT_TO_TEMP) {
        if (pattern.test(text)) {
          op['temperature'] = { ...temp };
          break;
        }
      }
    }
  }
}

/**
 * Parse time expressions from text and return total seconds.
 * Handles: "8 minutes", "1 hour 45 minutes", "20-30 min", "2-3 minutes",
 * "1h30m", "30s", compound expressions.
 * Returns null if no time expression found.
 */
export function parseTimeFromText(text: string): { min: number; max?: number } | null {
  // Normalize unicode dashes
  const normalized = text.replace(/[–—]/g, '-');

  // Pattern: compound time like "1 hour 45 minutes" or "2 hours 30 min"
  const compound = normalized.match(
    /(\d+)\s*(?:hours?|hrs?|h)\s*(?:and\s*)?(\d+)\s*(?:minutes?|mins?|m)\b/i,
  );
  if (compound) {
    const secs = parseInt(compound[1]!, 10) * 3600 + parseInt(compound[2]!, 10) * 60;
    return { min: secs };
  }

  // Collect all "N[-N] unit" fragments in the text
  const fragments = [
    ...normalized.matchAll(
      /(\d+)(?:\s*-\s*(\d+))?\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/gi,
    ),
  ];
  if (fragments.length === 0) return null;

  const unitToSeconds = (u: string): number => {
    const lower = u.toLowerCase();
    if (/^(hours?|hrs?|h)$/.test(lower)) return 3600;
    if (/^(minutes?|mins?|m)$/.test(lower)) return 60;
    return 1; // seconds
  };

  let totalMin = 0;
  let totalMax: number | undefined;

  for (const m of fragments) {
    const lo = parseInt(m[1]!, 10);
    const hi = m[2] ? parseInt(m[2], 10) : undefined;
    const mult = unitToSeconds(m[3]!);
    totalMin += lo * mult;
    if (hi != null) {
      totalMax = (totalMax ?? totalMin) - lo * mult + hi * mult;
    }
  }

  return totalMax != null ? { min: totalMin, max: totalMax } : { min: totalMin };
}

/**
 * Compute the critical path duration (in seconds) from raw operation data.
 * Uses longest-path through the DAG via topological order.
 */
function computeCriticalPathTime(operations: Array<Record<string, unknown>>): number {
  const timeOf = (op: Record<string, unknown>): number => {
    const t = op['time'] as Record<string, number> | undefined;
    return t?.['min'] ?? 0;
  };

  // Build adjacency + in-degree for Kahn's algorithm
  const ids = operations.map((op) => op['id'] as string);
  const idSet = new Set(ids);
  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  const opMap = new Map<string, Record<string, unknown>>();

  for (const op of operations) {
    const id = op['id'] as string;
    inDeg.set(id, 0);
    adj.set(id, []);
    opMap.set(id, op);
  }

  for (const op of operations) {
    const deps = op['depends'] as string[] | undefined;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        if (idSet.has(dep)) {
          adj.get(dep)!.push(op['id'] as string);
          inDeg.set(op['id'] as string, inDeg.get(op['id'] as string)! + 1);
        }
      }
    }
  }

  // Topological sort (Kahn's)
  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }
  const sorted: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    sorted.push(n);
    for (const nb of adj.get(n)!) {
      const nd = inDeg.get(nb)! - 1;
      inDeg.set(nb, nd);
      if (nd === 0) queue.push(nb);
    }
  }

  // Longest path
  const dist = new Map<string, number>();
  for (const id of sorted) {
    const op = opMap.get(id)!;
    const deps = op['depends'] as string[] | undefined;
    let maxPrev = 0;
    if (Array.isArray(deps)) {
      for (const dep of deps) {
        if (dist.has(dep)) maxPrev = Math.max(maxPrev, dist.get(dep)!);
      }
    }
    dist.set(id, maxPrev + timeOf(op));
  }

  let maxTime = 0;
  for (const t of dist.values()) {
    if (t > maxTime) maxTime = t;
  }
  return maxTime;
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
          isFinalAttempt: context.attempt >= MAX_RETRIES,
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
