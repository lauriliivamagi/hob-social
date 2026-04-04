---
name: recipe-import
description: Import a recipe from URL, file, or pasted text
arguments:
  - name: source
    description: URL, file path, or omit to paste text directly
    required: false
---

# /recipe-import [source]

Import a recipe from any source, parse it into structured JSON, and generate an interactive HTML cooking guide.

## Workflow

### Step 1: Detect input type and acquire source text

Check the `$ARGUMENTS` value:

- **URL** (starts with `http`): Use Firecrawl or web fetch to scrape the page content. Extract the recipe text from the page, ignoring ads, navigation, and other non-recipe content.
- **File path** (ends with `.md`, `.txt`, `.pdf`, `.jpg`, `.png`): Read the file.
  - Markdown/text: read directly
  - PDF: use Claude PDF reading to extract text
  - Image: use Claude vision to extract recipe text
- **No arguments**: Ask the user to paste the recipe text directly in the conversation. Wait for their input before proceeding.

### Step 2: Normalize to markdown

Convert the acquired text to clean markdown format:
- Preserve the original language (do NOT translate)
- Separate ingredients from instructions if they are mixed
- Keep all quantities, units, and timing information intact
- Store this normalized markdown — it becomes `meta.originalText` in the JSON

### Step 3: Parse into structured JSON

Use the **recipe-parse** skill to decompose the markdown into the recipe JSON schema. The skill provides the full schema reference and parsing instructions.

Key points:
- Extract quantities in their ORIGINAL units (do not convert yet)
- Build the operation DAG with proper input references
- Identify equipment with occupy/release semantics
- Detect sub-products (named intermediate results)

### Step 4: Convert units to metric

Run unit conversion to normalize all US/UK measurements to SI:

Unit conversion is implemented in `src/domain/scaling/unit-convert.ts`. Perform conversions inline using these rules:
- Volume: cup = 240 ml, tbsp = 15 ml, tsp = 5 ml, fl oz = 30 ml
- Weight: oz = 28.35 g, lb = 453.6 g
- Temperature: (F - 32) x 5/9 = C
- Check `config/ingredient-densities.json` for volume-to-weight overrides (e.g., 1 cup flour = 120 g)
- If a volume-to-weight conversion has no density override, flag it for manual review rather than guessing

The JSON must store only metric units. The `originalText` preserves original units.

### Step 5: Validate the DAG

Run DAG validation:

DAG validation is implemented in `src/domain/schedule/dag.ts`. Validate inline:
- Check for cycles in the operation graph
- Verify all `inputs` references point to valid ingredient IDs or operation IDs
- Check for equipment conflicts (two operations using the same equipment simultaneously)
- Verify all operations referenced in `finishSteps` exist
- Verify all operations referenced in `subProducts.finalOp` exist

### Step 6: Side-by-side review

Present the user with a comparison:

**Left side**: The original recipe text (markdown)
**Right side**: The structured Phase Map — phases, operations, ingredients with quantities, timing estimates

Ask the user to review:
- Are all ingredients captured correctly?
- Are the operation dependencies (DAG) correct?
- Are timings reasonable?
- Is anything missing?

If the user requests changes, apply them and re-validate.

### Step 7: Save the recipe JSON

Determine the category and slug:
- Ask the user for a category (e.g., `italian`, `asian`, `baking`) or suggest one based on the recipe content
- Generate a slug from the recipe title (lowercase, hyphens, no special characters)
- Save to `recipes/<category>/<slug>.json`
- Create the category directory if it does not exist

### Step 8: Generate HTML

Automatically run the build to generate the HTML view:

```bash
cd ${CLAUDE_PROJECT_DIR} && npm run build
```

If the build script is not yet available, inform the user they can run `/recipe-build <slug>` later.

Report the saved file paths to the user:
- JSON: `recipes/<category>/<slug>.json`
- HTML: `site/<category>/<slug>.html` (if generated)
