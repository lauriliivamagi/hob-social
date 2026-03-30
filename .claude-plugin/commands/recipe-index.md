---
name: recipe-index
description: Regenerate the recipe index page
---

# /recipe-index

Regenerate the browsable index page from all recipes.

## Workflow

Run the build script in index-only mode:

```bash
node ${CLAUDE_PROJECT_DIR}/lib/recipe-build.js --index-only
```

This scans all `recipes/**/*.json` files and generates `site/index.html` — a browsable index with:

- All recipes grouped by category
- Search/filter by title, tags, difficulty
- Tag-based navigation
- Total time and difficulty badges
- Links to each recipe's HTML page

### If the build script does not exist yet

Generate the index inline:

1. Scan `recipes/` recursively for all `.json` files
2. Read `meta` from each recipe (title, slug, tags, totalTime, difficulty, language)
3. Load the index template from `templates/index.html`
4. Load i18n strings from `templates/i18n/en.json` (index page uses English for now)
5. Generate `site/index.html` with:
   - Recipe cards grouped by category directory
   - Each card links to `<category>/<slug>.html`
   - Tags displayed as filter chips
   - Difficulty and total time shown per recipe
6. Write to `site/index.html`

Report the number of recipes indexed and the output file path.
