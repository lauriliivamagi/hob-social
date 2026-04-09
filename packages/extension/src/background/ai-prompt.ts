/**
 * AI prompt for recipe parsing.
 * Embeds the full JSON Schema for LLM guidance and provides critical rules,
 * validation constraints, and parsing guidelines. The skeleton schema used
 * for constrained decoding (format field) is lightweight — the full schema
 * here tells the model what fields to produce.
 */

import recipeSchemaJson from '../../../build/config/recipe-schema.json' with { type: 'json' };
import tagsJson from '../../../domain/config/tags.json' with { type: 'json' };

const MAX_CONTENT_LENGTH = 15_000;

export function buildSystemPrompt(): string {
  return `You are decomposing a recipe from natural-language text into a structured JSON representation.

## Output Schema

Your output must conform to this JSON Schema:

${JSON.stringify(recipeSchemaJson, null, 2)}

## Valid Tags

Tags must come from this set. Omit rather than invent:

${JSON.stringify(tagsJson, null, 2)}

## Critical Rules

1. **Preserve the source language.** All text fields (title, action descriptions, details, notes, ingredient names) stay in the recipe's original language. Do NOT translate.
2. **Extract quantities in their original units.** Do not convert units — output exactly what the recipe says. If the recipe says "2 cups flour", output \`"quantity": {"min": 2, "unit": "cup"}\`. For ranges like "100-150 g", output \`"quantity": {"min": 100, "max": 150, "unit": "g"}\`. For ingredients with alternatives (e.g., "cream or water"), use the \`alternatives\` array.
3. **Build a proper DAG.** Each operation has \`ingredients\` (array of ingredient IDs consumed) and \`depends\` (array of operation IDs that must complete first). There must be no cycles. Leaf operations have \`depends: []\`.
4. **Times are in seconds with optional ranges.** \`time\` and \`activeTime\` are \`{min: number, max?: number}\` in seconds. Simmering, baking, resting, marinating are passive (\`activeTime: {min: 0}\`). Use ranges for variable-time operations. Post-processing validates your arithmetic, so focus on identifying the correct durations from the text.
5. **Equipment is a required array.** Each operation has \`equipment: [{use: "equipment-id", release: boolean}, ...]\`. Empty array \`[]\` if no equipment. Set \`release: false\` when the next operation continues in the same vessel.
6. **\`scalable\` is required.** \`true\` for active work (prep time scales with quantity), \`false\` for passive operations (simmering, baking, resting).
7. **Temperature replaces heat.** Use \`temperature: {min: number, max?: number, unit: "C" | "F"}\` when a specific temperature is given. For stovetop heat descriptions (medium heat, high heat), you may omit — post-processing will inject a fallback.
8. **Identify sub-products.** When a recipe has named intermediate results (sauce, dough, filling), add a \`subProducts\` entry. Set \`subProduct\` on **every** operation that contributes to that intermediate result (not just the final one). Set \`output\` only on the single operation that produces the finished sub-product.
9. **Use \`rest\` for passive waiting without heat.** Resting meat, proofing dough, marinating, cooling, chilling.
10. **Use \`assemble\` for terminal/combining actions.** Plating, tossing, garnishing, serving.

## Auto-derived fields (do NOT generate these — post-processing handles them)

- \`meta.originalText\` — injected from the source page content
- \`meta.slug\` — derived from your \`meta.title\` (still provide a good title)
- \`meta.language\` — set from the page's language attribute
- \`meta.source\` — set from the source URL
- \`meta.totalTime\` — computed from the operations DAG critical path
- \`meta.energyTier\` — derived from DAG active time and complexity

## Validation Rules (your output will be checked)

- All IDs must match \`^[a-z0-9]+(-[a-z0-9]+)*$\` — **ASCII only**, no accented or diacritical characters. Transliterate: ä→a, ö→o, ü→u, õ→o, é→e, ñ→n, ß→ss. Valid: \`olive-oil\`, \`dice-onion\`, \`saute-base\`, \`sour-cream\`. Invalid: \`sauté-base\` (accent), \`küpsetuspulber\` (ü), \`sõel\` (õ), \`olive_oil\`, \`Dice Onion\`. Post-processing sanitizes IDs, but generating clean IDs reduces fixes needed.
- All IDs must be unique within their entity type
- Every \`operation.ingredients[]\` must reference an existing ingredient ID
- Every \`operation.depends[]\` must reference an existing operation ID
- Every \`operation.equipment[].use\` must reference an existing equipment ID
- Every \`subProducts[].finalOp\` must reference an existing operation ID
- Every \`operation.subProduct\` must reference an existing sub-product ID
- \`activeTime\` must be \`<=\` \`time\` on every operation
- No cycles in the operations DAG

## When schema.org/Recipe Data Is Available

When the input includes schema.org/Recipe structured data:
- Use \`recipeIngredient[]\` as the authoritative ingredient list
- Use \`recipeInstructions[]\` ordering to guide operation sequence
- Use \`prepTime\`/\`cookTime\` to sanity-check timing estimates
- Use \`recipeYield\` for \`meta.servings\`
- When schema.org and markdown disagree, prefer schema.org

Schema.org does NOT give you: DAG edges, active vs passive time, equipment occupy/release, sub-products, or parallel opportunities. You must construct these.

## Parsing Guidelines

### Ingredients
- Create unique kebab-case IDs (e.g., \`olive-oil\`, \`garlic-cloves\`)
- Separate forms of the same ingredient get separate entries (\`butter-softened\`, \`butter-melted\`)
- Set \`group\` to a logical shopping category
- \`quantity\` is a nested object: \`{"min": number, "max"?: number, "unit": string}\`. Example: \`{"id": "flour", "name": "flour", "quantity": {"min": 250, "unit": "g"}, "group": "dry"}\`
- For quantity ranges: add \`max\` inside the quantity object. Example: \`{"id": "cheese", "name": "cheese", "quantity": {"min": 100, "max": 150, "unit": "g"}, "group": "dairy"}\`
- For ingredient alternatives: add optional \`alternatives\` array with full ingredient objects. Example: \`{"id": "fat", "name": "cream", "quantity": {"min": 200, "unit": "ml"}, "group": "dairy", "alternatives": [{"id": "fat-alt", "name": "water", "quantity": {"min": 200, "unit": "ml"}, "group": "pantry"}]}\`

### Operations
- Break compound instructions into atomic operations
- Chain operations correctly via \`depends\`
- For passive operations: \`activeTime: {min: 0}\`, \`scalable: false\`

### DAG Construction
- First use of an ingredient → that operation's \`ingredients\` array
- After processing, subsequent operations reference the processing op via \`depends\`
- Terminal \`assemble\` operations use \`depends\` to reference what they combine

### Timing
- All times in seconds: 5 min → \`{min: 300}\`, 20-30 min → \`{min: 1200, max: 1800}\`
- Do NOT estimate \`totalTime\` — it is auto-computed from the DAG

### Difficulty
- \`easy\`: few ingredients, simple techniques, forgiving timing
- \`medium\`: multiple components, some technique, timing matters
- \`hard\`: advanced techniques, precise timing, many parallel tasks

### Output Completeness
- Produce the FULL JSON object in a single response — do not stop early
- Keep \`details\` fields concise (1-2 sentences) to stay within output limits
- Use short descriptive IDs (prefer \`dice-onion\` over \`dice-the-onion-into-small-pieces\`)`;
}

interface Extraction {
  url: string;
  title: string;
  contentMarkdown: string;
  schemaOrgData: unknown;
  language: string;
}

export function buildUserPrompt(extraction: Extraction, previousErrors?: string, previousOutput?: string): string {
  let prompt = '';

  prompt += `## Source URL\n${extraction.url}\n\n`;
  prompt += `## Language\n${extraction.language}\n\n`;

  // Include schema.org data if present
  if (extraction.schemaOrgData) {
    const recipeData = findRecipeSchema(extraction.schemaOrgData);
    if (recipeData) {
      prompt += `## schema.org/Recipe Data\n\`\`\`json\n${JSON.stringify(recipeData, null, 2)}\n\`\`\`\n\n`;
    }
  }

  // Extract verified facts from schema.org to anchor the LLM
  if (extraction.schemaOrgData) {
    const recipeData = findRecipeSchema(extraction.schemaOrgData) as Record<string, unknown> | null;
    if (recipeData) {
      const facts: string[] = [];

      // Servings
      const recipeYield = recipeData['recipeYield'];
      if (recipeYield != null) {
        const parsed = typeof recipeYield === 'number'
          ? recipeYield
          : parseInt(String(Array.isArray(recipeYield) ? recipeYield[0] : recipeYield), 10);
        if (!isNaN(parsed) && parsed > 0) facts.push(`Servings: ${parsed}`);
      }

      // Times (ISO 8601 durations like PT30M, PT1H30M)
      const prepTime = parseIsoDuration(recipeData['prepTime']);
      const cookTime = parseIsoDuration(recipeData['cookTime']);
      const totalTime = parseIsoDuration(recipeData['totalTime']);
      if (prepTime > 0) facts.push(`Prep time: ${prepTime}s`);
      if (cookTime > 0) facts.push(`Cook time: ${cookTime}s`);
      if (totalTime > 0) facts.push(`Total time: ${totalTime}s`);

      // Ingredient count
      const ingList = recipeData['recipeIngredient'];
      if (Array.isArray(ingList) && ingList.length > 0) {
        facts.push(`Ingredient count: ${ingList.length}`);
      }

      if (facts.length > 0) {
        prompt += `## Verified Facts (from structured data — use these as ground truth)\n`;
        prompt += facts.map((f) => `- ${f}`).join('\n') + '\n\n';
      }
    }
  }

  // Truncate content to avoid token limits
  const content = extraction.contentMarkdown.length > MAX_CONTENT_LENGTH
    ? extraction.contentMarkdown.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
    : extraction.contentMarkdown;

  prompt += `## Recipe Content\n${content}\n`;

  // On retry, include the failed output and validation errors
  if (previousErrors) {
    if (previousOutput) {
      prompt += `\n## Your Previous Output (failed validation)\n\`\`\`json\n${previousOutput}\n\`\`\`\n`;
    }
    prompt += `\n## Validation Errors\nFix these errors in your next attempt:\n${previousErrors}\n`;
  }

  return prompt;
}

/**
 * Parse an ISO 8601 duration (e.g., PT30M, PT1H30M, PT2H) into seconds.
 * Returns 0 if unparseable.
 */
export function parseIsoDuration(value: unknown): number {
  if (typeof value !== 'string') return 0;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return 0;
  const hours = parseInt(match[1] ?? '0', 10);
  const minutes = parseInt(match[2] ?? '0', 10);
  const seconds = parseInt(match[3] ?? '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Walk schema.org data to find an object with @type "Recipe".
 * schemaOrgData may be an array, a single object, or nested @graph.
 */
export function findRecipeSchema(data: unknown): unknown | null {
  if (!data || typeof data !== 'object') return null;

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeSchema(item);
      if (found) return found;
    }
    return null;
  }

  const obj = data as Record<string, unknown>;

  if (obj['@type'] === 'Recipe') return obj;

  // Check @graph array
  if (Array.isArray(obj['@graph'])) {
    return findRecipeSchema(obj['@graph']);
  }

  return null;
}
