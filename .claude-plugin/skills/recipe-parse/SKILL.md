---
name: recipe-parse
description: "LLM prompt for decomposing recipe text into structured JSON — ingredients, operations, DAG edges, timings, equipment, sub-products"
---

# Recipe Parse Skill

You are decomposing a recipe from natural-language text into a structured JSON representation. Follow these instructions precisely.

## Input

Markdown-formatted recipe text. May be in any language.

## Output

A JSON object matching the schema below. Return ONLY valid JSON.

## Critical Rules

1. **Preserve the source language.** All text fields (title, action descriptions, details, notes, ingredient names) stay in the recipe's original language. Do NOT translate.
2. **Extract quantities in their original units.** Do not convert units — a separate conversion step handles that. If the recipe says "2 cups flour", output `{ "quantity": 2, "unit": "cup" }`.
3. **Build a proper DAG.** Each operation's `inputs` array references either an ingredient `id` (for first use of that ingredient) or another operation's `id` (for chaining). There must be no cycles.
4. **Distinguish active vs passive time.** `time` is total duration, `activeTime` is hands-on attention needed. Simmering, baking, resting, marinating, and rising are passive (activeTime near 0).
5. **Equipment occupy/release.** Set `release: false` when the next operation continues in the same vessel (e.g., saute then add liquid in the same pan). Set `release: true` when the equipment is freed after the operation.
6. **Identify sub-products.** When an operation produces a named intermediate result (sauce, dough, filling, etc.), give the operation an `output` field and add a corresponding entry to `subProducts`.

## JSON Schema Reference

```json
{
  "meta": {
    "title": "string — recipe title in original language",
    "slug": "string — lowercase-hyphenated URL slug",
    "language": "string — ISO 639-1 code (en, et, fr, etc.)",
    "source": "string — URL or file path of the original",
    "originalText": "string — full original recipe as markdown",
    "tags": ["string array — category tags"],
    "servings": "number — default serving count",
    "totalTime": {
      "relaxed": "number — minutes, all prep front-loaded",
      "optimized": "number — minutes, prep distributed into idle windows"
    },
    "difficulty": "string — easy | medium | hard",
    "notes": "string — optional personal/family notes"
  },
  "ingredients": [
    {
      "id": "string — unique kebab-case identifier",
      "name": "string — display name in original language",
      "quantity": "number",
      "unit": "string — original unit as written (cup, g, whole, cloves, etc.)",
      "group": "string — category: vegetables, meat, dairy, spices, canned, pasta, baking, etc."
    }
  ],
  "equipment": [
    {
      "id": "string — unique kebab-case identifier",
      "name": "string — display name",
      "count": "number — how many needed"
    }
  ],
  "operations": [
    {
      "id": "string — unique kebab-case identifier (e.g., dice-onion, simmer-sauce)",
      "type": "string — prep | cook | finish",
      "action": "string — verb: dice, mince, saute, brown, simmer, boil, bake, etc.",
      "inputs": ["string array — ingredient IDs or operation IDs"],
      "equipment": {
        "use": "string — equipment ID",
        "release": "boolean — true if equipment is freed after this operation"
      },
      "time": "number — total minutes",
      "activeTime": "number — minutes of active attention required",
      "scalable": "boolean — false for time-invariant operations (simmer, bake). Default true.",
      "heat": "string — optional: low, medium, medium-high, high",
      "details": "string — additional instructions in original language",
      "output": "string — optional: name of sub-product produced"
    }
  ],
  "subProducts": [
    {
      "id": "string — matches the output field of an operation",
      "name": "string — display name",
      "finalOp": "string — operation ID that produces this sub-product"
    }
  ],
  "finishSteps": [
    {
      "action": "string — verb: drain, toss, plate, garnish, etc.",
      "inputs": ["string array — operation IDs (not sub-product IDs)"],
      "details": "string — instructions in original language"
    }
  ]
}
```

## Parsing Guidelines

### Ingredients
- Create a unique `id` for each ingredient using kebab-case (e.g., `olive-oil`, `garlic-cloves`)
- If the same ingredient appears in different forms (e.g., "butter, softened" and "butter, melted"), create separate entries with distinct IDs (e.g., `butter-softened`, `butter-melted`)
- Set `group` to a logical shopping category

### Operations
- Break compound instructions into atomic operations (e.g., "dice the onion and garlic" becomes two operations: `dice-onion` and `mince-garlic`)
- Chain operations correctly: if browning meat requires the sauted vegetables, the brown operation's inputs include both the saute operation ID and the raw meat ingredient ID
- For passive operations (simmering, baking, resting): set `activeTime` to 0 or near-0, and `scalable: false`
- Equipment is optional on operations that do not need a specific tool

### DAG Construction
- The first time an ingredient appears in an operation, reference it by ingredient ID
- After an ingredient has been processed by an operation, subsequent operations reference the operation ID (not the ingredient ID again)
- Finish steps always reference operation IDs, never ingredient IDs or sub-product IDs

### Timing
- Estimate `totalTime.relaxed` as the sum of all operations executed sequentially with all prep front-loaded
- Estimate `totalTime.optimized` as the critical path through the DAG with prep distributed into idle windows
- These are rough estimates; the optimizer will compute precise values later

### Tags
- Suggest 3-5 tags based on cuisine, meal type, key ingredients, and cooking method
- Examples: `italian`, `pasta`, `weeknight`, `vegetarian`, `slow-cook`, `baking`, `dessert`

### Difficulty
- `easy`: few ingredients, simple techniques, forgiving timing
- `medium`: multiple components, some technique required, timing matters
- `hard`: advanced techniques, precise timing, many parallel tasks
