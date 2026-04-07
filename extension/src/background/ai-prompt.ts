/**
 * AI prompt for recipe parsing.
 * Adapted from .claude-plugin/skills/recipe-parse/SKILL.md.
 * Embeds the JSON Schema and valid tags inline so the prompt is self-contained.
 */

import recipeSchemaJson from '../../../config/recipe-schema.json' with { type: 'json' };
import tagsJson from '../../../config/tags.json' with { type: 'json' };

const MAX_CONTENT_LENGTH = 15_000;

export function buildSystemPrompt(): string {
  return `You are decomposing a recipe from natural-language text into a structured JSON representation. Return ONLY valid JSON — no markdown fences, no explanation.

## Output Schema

Your output must conform to this JSON Schema:

${JSON.stringify(recipeSchemaJson, null, 2)}

## Valid Tags

Tags must come from this set. Omit rather than invent:

${JSON.stringify(tagsJson, null, 2)}

## Critical Rules

1. **Preserve the source language.** All text fields (title, action descriptions, details, notes, ingredient names) stay in the recipe's original language. Do NOT translate.
2. **Extract quantities in their original units.** Do not convert units — output exactly what the recipe says. If the recipe says "2 cups flour", output { "quantity": 2, "unit": "cup" }.
3. **Build a proper DAG.** Each operation has \`ingredients\` (array of ingredient IDs consumed) and \`depends\` (array of operation IDs that must complete first). There must be no cycles. Leaf operations have \`depends: []\`.
4. **Times are in seconds with optional ranges.** \`time\` and \`activeTime\` are \`{min: number, max?: number}\` in seconds. Simmering, baking, resting, marinating are passive (\`activeTime: {min: 0}\`). Use ranges for variable-time operations.
5. **Equipment is a required array.** Each operation has \`equipment: [{use: "equipment-id", release: boolean}, ...]\`. Empty array \`[]\` if no equipment. Set \`release: false\` when the next operation continues in the same vessel.
6. **\`scalable\` is required.** \`true\` for active work (prep time scales with quantity), \`false\` for passive operations (simmering, baking, resting).
7. **Temperature replaces heat.** Use \`temperature: {min: number, max?: number, unit: "C" | "F"}\`. Medium heat → \`{min: 160, max: 180, unit: "C"}\`.
8. **Identify sub-products.** When a recipe has named intermediate results (sauce, dough, filling), add a \`subProducts\` entry. Set \`subProduct\` on **every** operation that contributes to that intermediate result (not just the final one). Set \`output\` only on the single operation that produces the finished sub-product.
9. **Use \`rest\` for passive waiting without heat.** Resting meat, proofing dough, marinating, cooling, chilling.
10. **Use \`assemble\` for terminal/combining actions.** Plating, tossing, garnishing, serving.

## Validation Rules (your output will be checked)

- All IDs must match \`^[a-z0-9]+(-[a-z0-9]+)*$\` (kebab-case, lowercase letters/digits/hyphens ONLY). Valid: \`olive-oil\`, \`dice-onion\`, \`large-pot\`. Invalid: \`olive_oil\`, \`Dice Onion\`, \`large.pot\`, \`pot (large)\`
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
- **CRITICAL**: \`quantity\` and \`unit\` are FLAT sibling fields, NOT nested. Correct: \`{"id": "flour", "name": "flour", "quantity": 250, "unit": "g", "group": "dry"}\`. WRONG: \`{"quantity": {"amount": 250, "unit": "g"}}\`

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
- Estimate \`totalTime.relaxed\` (all prep front-loaded) and \`totalTime.optimized\` (prep in idle windows)

### Difficulty
- \`easy\`: few ingredients, simple techniques, forgiving timing
- \`medium\`: multiple components, some technique, timing matters
- \`hard\`: advanced techniques, precise timing, many parallel tasks`;
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
 * Walk schema.org data to find an object with @type "Recipe".
 * schemaOrgData may be an array, a single object, or nested @graph.
 */
function findRecipeSchema(data: unknown): unknown | null {
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
