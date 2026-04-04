---
name: recipe-generate
description: "Guidance for generating self-contained HTML recipe pages from JSON"
---

# Recipe Generate Skill

Generate interactive HTML recipe pages from structured JSON. The build is handled by the Vite plugin at `src/build/vite-plugin-recipes.ts` which processes templates, computes schedules, and emits HTML files.

## Running the Build

```bash
cd ${CLAUDE_PROJECT_DIR} && npm run build
```

This processes all recipe JSON files and generates HTML pages in `site/`.

## Build Process

### Inputs

1. **Recipe JSON** from `recipes/<category>/<slug>.json`
2. **HTML template** from `templates/recipe.html`
3. **i18n strings** from `templates/i18n/<lang>.json` (falls back to `en.json`)
4. **Phase maps** — computed by the recipe-optimize skill (relaxed + optimized)

### Output

A single self-contained HTML file at `site/<category>/<slug>.html`.

The generated pages use Lit web components with bundled JavaScript:
- CSS is encapsulated in Lit Shadow DOM components
- JavaScript is bundled by Vite (Lit + xstate)
- PWA service worker enables offline use
- Pages are served via GitHub Pages or any static host

## HTML Structure: Two Views

### View 1: Phase Map Overview

The planning/comprehension view shown by default.

Elements:
- **Toggle switch** at top: Relaxed / Optimized (switches phase layout and time estimate)
- **Equipment summary** — list of all needed equipment
- **Servings adjuster** — number input, recalculates all quantities
- **Phase cards** flowing top-to-bottom:
  - Phase label with color coding: PREP (orange), COOK (teal), SIMMER/PASSIVE (purple), FINISH (neutral)
  - Time estimate for the phase
  - Tasks with inline ingredients (quantities bolded)
  - Parallel tasks shown side-by-side when applicable
  - Passive vs active distinction
- **Tap any phase** to jump to that step in the cooking view

### View 2: Step-by-Step Cooking View

The phone-friendly cooking guide, activated by a "Start Cooking" button.

Elements:
- **Awareness bar** (top) — compact status pills for background/passive tasks with countdown timers
- **Focus card** (center) — the current step expanded:
  - Step counter ("Step 3 of 8")
  - Action headline
  - Detailed instructions with inline ingredients (quantities bolded)
  - Tags: timer duration, heat level, equipment
  - Large Back/Next touch targets
- **Parallel active tasks** — when two tasks need active attention:
  - Primary task as full focus card
  - Secondary task as compact card below, tappable to expand/swap
- **Next-up preview** — dimmed preview of the next step

### Interactive Features

- **Servings adjuster**: Recalculates quantities by ratio (newServings / originalServings). Rounding rules per unit type. Prep times scale proportionally; operations with `scalable: false` keep their original time. Equipment overflow warning above 2x.
- **Built-in timers**: Start per step, countdown in awareness bar, browser Notification API on completion.
- **Dark mode**: Default theme (less glare in kitchen). Light mode toggle available.

## i18n Integration

- Load strings from `templates/i18n/<meta.language>.json`
- Fall back to `templates/i18n/en.json` if the language file does not exist
- UI chrome (buttons, labels, phase names) uses i18n strings
- Recipe content stays in its original language (never translated)

## Index Page Generation

When building the index (`--index-only` or full build):

1. Scan `recipes/**/*.json` for all recipes
2. Extract `meta` from each (title, slug, tags, totalTime, difficulty, language)
3. Load `templates/index.html`
4. Generate `site/index.html` with:
   - Recipe cards grouped by category
   - Search/filter by title and tags
   - Difficulty and time badges
   - Links to each recipe's HTML page

## Architecture

The Lit web components are in `src/ui/`:
- `src/ui/catalog/catalog-page.ts` — index page component
- `src/ui/recipe/recipe-page.ts` — recipe page component (uses xstate for state management)
- Entry points: `src/entries/catalog.ts` and `src/entries/recipe.ts`

The Vite plugin (`src/build/vite-plugin-recipes.ts`):
1. Reads recipe JSON files from `recipes/`
2. Validates DAGs and computes schedules
3. Renders HTML from `templates/` with data injected as globals
4. Bundles Lit components and injects script tags
5. Emits HTML files to `site/`
