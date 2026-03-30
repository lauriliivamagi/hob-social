---
name: recipe-build
description: Generate HTML from recipe JSON
arguments:
  - name: slug
    description: "Recipe slug (e.g., italian/spaghetti-bolognese). Omit to build all recipes."
    required: false
---

# /recipe-build [slug]

Generate self-contained interactive HTML from recipe JSON files.

## Workflow

### If a slug is provided

Build a single recipe:

```bash
node ${CLAUDE_PROJECT_DIR}/lib/recipe-build.js --slug <slug>
```

This reads `recipes/<slug>.json`, applies the HTML template from `templates/recipe.html`, loads the appropriate i18n strings from `templates/i18n/<language>.json`, and writes the output to `site/<slug>.html`.

### If no slug is provided

Build all recipes:

```bash
node ${CLAUDE_PROJECT_DIR}/lib/recipe-build.js
```

This scans `recipes/` recursively for all `.json` files, builds each one, and regenerates the index page at `site/index.html`.

### Build process details

The build script (or the recipe-generate skill if building inline) should:

1. Read the recipe JSON from `recipes/<category>/<slug>.json`
2. Load the HTML template from `templates/recipe.html`
3. Load i18n strings from `templates/i18n/<lang>.json` based on `meta.language`, falling back to `en.json`
4. Compute both relaxed and optimized phase maps using the recipe-optimize skill/lib
5. Embed everything into a single self-contained HTML file (no external dependencies)
6. Write to `site/<category>/<slug>.html`, creating directories as needed
7. After building individual recipes, regenerate `site/index.html` using the index template

### Output verification

After building, confirm:
- The HTML file exists at the expected path
- Report the file size
- Remind the user they can open the file directly in a browser (no server needed)

### If the build script does not exist yet

Use the **recipe-generate** skill to produce the HTML inline. Read the recipe JSON, the template, and the i18n file, then generate the self-contained HTML and write it to the correct output path.
