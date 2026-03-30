---
name: recipe-review
description: Review a recipe side-by-side — original text vs structured Phase Map
arguments:
  - name: slug
    description: "Recipe slug (e.g., italian/spaghetti-bolognese)"
    required: true
---

# /recipe-review <slug>

Display a side-by-side comparison of the original recipe text and its structured Phase Map representation.

## Workflow

### Step 1: Load the recipe

Read the recipe JSON from `recipes/<slug>.json`.

If the file does not exist, search `recipes/` recursively for a matching slug and suggest corrections. If no match is found, list available recipes.

### Step 2: Display original text

Show the `meta.originalText` field — this is the markdown-formatted source recipe as it was originally written, with original units and prose formatting.

If `originalText` is empty or missing, note that the original text was not preserved during import.

### Step 3: Display structured Phase Map

Present the structured recipe data as a Phase Map:

**Header:**
- Title, servings, difficulty
- Total time: relaxed vs optimized estimates
- Equipment list

**Phases (relaxed mode):**
For each phase, show:
- Phase label with type (PREP / COOK / SIMMER / FINISH)
- Time estimate
- Operations with:
  - Action name (dice, saute, simmer, etc.)
  - Input ingredients with quantities and units (bolded)
  - Equipment used
  - Active vs passive time
  - Details/notes

**DAG summary:**
- List sub-products and their source operations
- Show finish steps in order

### Step 4: Highlight differences

Call out any potential issues:
- Ingredients in `originalText` not captured in the structured data
- Steps in the original that may be missing from the operation DAG
- Timing discrepancies between original prose and structured times

### Step 5: Offer actions

Ask the user if they want to:
- Edit the recipe JSON (open for manual editing)
- Re-import from the original text (run `/recipe-import` with the stored `originalText`)
- Rebuild the HTML (run `/recipe-build <slug>`)
- Accept as-is (no action)
