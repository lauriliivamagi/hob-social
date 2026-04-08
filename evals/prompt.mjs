/**
 * Prompt function for promptfoo.
 * Mirrors buildSystemPrompt() and buildUserPrompt() from
 * extension/src/background/ai-prompt.ts without TypeScript imports.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const recipeSchema = JSON.parse(readFileSync(resolve(root, 'config/recipe-schema.json'), 'utf-8'));
const tags = JSON.parse(readFileSync(resolve(root, 'config/tags.json'), 'utf-8'));

// Mirrors buildSystemPrompt() from ai-prompt.ts — kept in sync manually.
// If the prompt changes there, update here too.
function buildSystemPrompt() {
  return `You are decomposing a recipe from natural-language text into a structured JSON representation.

CRITICAL OUTPUT FORMAT: Your entire response must be a single JSON object. Start with { and end with }. Do NOT wrap in markdown code fences. Do NOT include any text before or after the JSON. Do NOT echo the recipe content back.

## Output Schema

Your output must conform to this JSON Schema:

${JSON.stringify(recipeSchema, null, 2)}

## Valid Tags

Tags must come from this set. Omit rather than invent:

${JSON.stringify(tags, null, 2)}

## Critical Rules

1. **Preserve the source language.** All text fields (title, action descriptions, details, notes, ingredient names) stay in the recipe's original language. Do NOT translate.
2. **Extract quantities in their original units.** Do not convert units — output exactly what the recipe says. If the recipe says "2 cups flour", output \`"quantity": {"min": 2, "unit": "cup"}\`. For ranges like "100-150 g", output \`"quantity": {"min": 100, "max": 150, "unit": "g"}\`. For ingredients with alternatives (e.g., "cream or water"), use the \`alternatives\` array.
3. **Build a proper DAG.** Each operation has \`ingredients\` (array of ingredient IDs consumed) and \`depends\` (array of operation IDs that must complete first). There must be no cycles. Leaf operations have \`depends: []\`.
4. **Times are in seconds with optional ranges.** \`time\` and \`activeTime\` are \`{min: number, max?: number}\` in seconds. Simmering, baking, resting, marinating are passive (\`activeTime: {min: 0}\`). Use ranges for variable-time operations.
5. **Equipment is a required array.** Each operation has \`equipment: [{use: "equipment-id", release: boolean}, ...]\`. Empty array \`[]\` if no equipment. Set \`release: false\` when the next operation continues in the same vessel.
6. **\`scalable\` is required.** \`true\` for active work (prep time scales with quantity), \`false\` for passive operations (simmering, baking, resting).
7. **Temperature replaces heat.** Use \`temperature: {min: number, max?: number, unit: "C" | "F"}\`. Medium heat → \`{min: 160, max: 180, unit: "C"}\`.
8. **Identify sub-products.** When a recipe has named intermediate results (sauce, dough, filling), add a \`subProducts\` entry. Set \`subProduct\` on **every** operation that contributes to that intermediate result (not just the final one). Set \`output\` only on the single operation that produces the finished sub-product.
9. **Use \`rest\` for passive waiting without heat.** Resting meat, proofing dough, marinating, cooling, chilling.
10. **Use \`assemble\` for terminal/combining actions.** Plating, tossing, garnishing, serving.

## Validation Rules (your output will be checked)

- All IDs must match \`^[a-z0-9]+(-[a-z0-9]+)*$\` — **ASCII only**, no accented or diacritical characters. Transliterate: ä→a, ö→o, ü→u, õ→o, é→e, ñ→n, ß→ss. Valid: \`olive-oil\`, \`dice-onion\`, \`saute-base\`, \`sour-cream\`. Invalid: \`sauté-base\` (accent), \`küpsetuspulber\` (ü), \`sõel\` (õ), \`olive_oil\`, \`Dice Onion\`
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
- Estimate \`totalTime.relaxed\` (all prep front-loaded) and \`totalTime.optimized\` (prep in idle windows)

### Difficulty
- \`easy\`: few ingredients, simple techniques, forgiving timing
- \`medium\`: multiple components, some technique, timing matters
- \`hard\`: advanced techniques, precise timing, many parallel tasks

### Output Completeness
- Produce the FULL JSON object in a single response — do not stop early
- Keep \`details\` fields concise (1-2 sentences) to stay within output limits
- Use short descriptive IDs (prefer \`dice-onion\` over \`dice-the-onion-into-small-pieces\`)`;
}

const MAX_CONTENT_LENGTH = 15_000;

function buildUserPrompt(extraction) {
  let prompt = '';
  prompt += `## Source URL\n${extraction.url}\n\n`;
  prompt += `## Language\n${extraction.language}\n\n`;

  if (extraction.schemaOrgData) {
    prompt += `## schema.org/Recipe Data\n\`\`\`json\n${JSON.stringify(extraction.schemaOrgData, null, 2)}\n\`\`\`\n\n`;
  }

  const content = extraction.contentMarkdown.length > MAX_CONTENT_LENGTH
    ? extraction.contentMarkdown.slice(0, MAX_CONTENT_LENGTH) + '\n\n[Content truncated]'
    : extraction.contentMarkdown;

  prompt += `## Recipe Content\n${content}\n`;
  return prompt;
}

/** promptfoo prompt function — receives {vars, provider}, returns messages array. */
export default function ({ vars }) {
  const fixture = JSON.parse(
    readFileSync(resolve(__dirname, 'fixtures', vars.fixture), 'utf-8'),
  );

  return [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildUserPrompt(fixture) },
  ];
}
