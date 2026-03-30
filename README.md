![Build](https://github.com/lauriliivamagi/recipes/actions/workflows/deploy.yml/badge.svg)
![Node](https://img.shields.io/badge/node-22%2B-brightgreen)
![Dependencies](https://img.shields.io/badge/dependencies-0-blue)
![PWA](https://img.shields.io/badge/PWA-ready-purple)

# Recipe Visualizer

**Recipes are graphs, not lists.** This app transforms recipe text into interactive cooking guides that schedule tasks in parallel and fill idle time, so dinner is ready sooner.

![Recipe Visualizer — Spaghetti Bolognese overview with phase cards and mode toggle](docs/screenshot-recipe.png)

## The problem with traditional recipes

A traditional Spaghetti Bolognese recipe reads as a numbered list: dice onions, sauté vegetables, brown meat, simmer sauce, boil pasta, serve. But it hides the structure underneath:

- The sauce simmers for **30 minutes** with only 3 minutes of active stirring. That's 27 minutes of dead time you could use to boil pasta or grate Parmesan.
- The cutting board is needed for four prep tasks, but they don't all have to happen before cooking starts.
- The recipe says "75 minutes" but an experienced cook finishes in **62**. Where do those 13 minutes go?

Experienced cooks do this in their heads. They read ahead, spot idle windows, and interleave tasks. Beginners follow step 1, then step 2, then step 3, and dinner takes longer than it needs to.

**What if the recipe itself could figure out the optimal schedule?**

## How it works

The app models each recipe as a **directed acyclic graph** (DAG). Nodes are operations, edges are dependencies, and idle windows are where the optimizer finds time to save:

```mermaid
graph LR
    onion["Onion"] --> dice-onion["Dice<br/>3 min"]
    carrot["Carrots"] --> dice-carrot["Dice<br/>3 min"]
    celery["Celery"] --> dice-celery["Dice<br/>2 min"]
    garlic["Garlic"] --> mince-garlic["Mince<br/>2 min"]

    dice-onion --> saute["Sauté soffritto<br/>8 min"]
    dice-carrot --> saute
    dice-celery --> saute

    saute --> add-garlic["Add garlic<br/>1 min"]
    mince-garlic --> add-garlic

    add-garlic --> brown["Brown mince<br/>7 min"]
    brown --> deglaze["Deglaze<br/>2 min"]
    deglaze --> build["Build sauce<br/>2 min"]
    build --> simmer["Simmer 30 min"]

    spaghetti["Spaghetti"] --> boil["Boil pasta<br/>10 min"]
    parmesan["Parmesan"] --> grate["Grate<br/>2 min"]

    style simmer fill:#7c5cfc,color:#fff
    style boil fill:#4ecdc4,color:#111
    style grate fill:#f4a261,color:#111
```

**Boil pasta** and **grate parmesan** don't depend on the simmer phase. They can run in parallel, and the optimizer finds these gaps automatically.

### Two execution modes

| Mode | Strategy | Bolognese time |
|------|----------|----------------|
| **Relaxed** | All prep upfront, then cooking in sequence | 75 min |
| **Optimized** | Prep distributed into idle windows during cooking | 62 min |

In **relaxed mode**, you chop everything first, then cook. Low stress, no multitasking.

In **optimized mode**, the app tells you: *"The sauce is simmering. You have 27 minutes of idle time. Boil the pasta and grate the Parmesan now."* Same recipe, 17% less wall-clock time.

## Features

- **Two cooking modes** — relaxed (all prep first) or optimized (prep during idle windows)
- **Step-by-step cooking** — focus card UI shows one task at a time with context about what's running in the background
- **Built-in timers** — start a timer for any passive operation
- **Screen wake lock** — screen stays on while cooking (no flour-covered unlock)
- **Servings adjuster** — scale ingredients and operation times up or down
- **Offline-ready PWA** — install to your home screen, works without internet
- **Dark theme** — easy on the eyes in kitchen lighting
- **i18n** — English and Estonian; add a JSON file for your language
- **Search and filter** — browse by tag, difficulty, or free text
- **Self-contained HTML** — each recipe page is a standalone file you can email to someone
- **Claude Code plugin** — import recipes from URLs, images, or pasted text with AI assistance

## Quick start

```bash
git clone https://github.com/lauriliivamagi/recipes.git
cd recipes
npm run build
```

Open `site/index.html` in your browser. That's it.

No `npm install`. No dependencies. No server. The build script is a single Node.js file that reads JSON, computes schedules, and writes static HTML.

> **Requires** Node.js 22+ (ES modules).

## Architecture

```
  Recipe JSON             Build Pipeline                 Output
  ───────────             ──────────────                 ──────
  recipes/                lib/recipe-build.js            site/
  └─ italian/             ├─ reads recipe JSON           ├─ index.html
     ├─ spaghetti-        ├─ validates DAG               ├─ italian/
     │  bolognese.json    ├─ computes both schedules     │  ├─ spaghetti-bolognese.html
     └─ classic-          └─ injects into HTML template  │  └─ classic-lasagne.html
        lasagne.json                                     ├─ app.webmanifest
                          lib/recipe-optimize.js         └─ sw.js
                          ├─ Kahn's topological sort
                          ├─ critical path (longest-path DP)
                          └─ greedy idle-window packing
```

Recipe pages use an **XState v5** state machine to drive the cooking flow: mode switching, step navigation, timers, and wake lock.

## Recipe data format

Recipes are JSON files validated against [`config/recipe-schema.json`](config/recipe-schema.json). Here's the essential structure:

```json
{
  "meta": {
    "title": "Spaghetti Bolognese",
    "slug": "spaghetti-bolognese",
    "language": "en",
    "tags": ["italian", "pasta", "weeknight"],
    "servings": 4,
    "totalTime": { "relaxed": 75, "optimized": 62 },
    "difficulty": "easy"
  },
  "ingredients": [
    { "id": "onion", "name": "Onion", "quantity": 1, "unit": "whole", "group": "vegetables" }
  ],
  "equipment": [
    { "id": "large-pan", "name": "Large heavy-bottomed pan", "count": 1 }
  ],
  "operations": [
    {
      "id": "dice-onion",
      "type": "prep",
      "action": "dice",
      "inputs": ["onion"],
      "equipment": { "use": "cutting-board", "release": true },
      "time": 3,
      "activeTime": 3,
      "details": "Finely dice the onion"
    },
    {
      "id": "simmer-sauce",
      "type": "cook",
      "action": "simmer",
      "inputs": ["build-sauce"],
      "time": 30,
      "activeTime": 3,
      "scalable": false,
      "heat": "low",
      "output": "sauce"
    }
  ],
  "subProducts": [
    { "id": "sauce", "name": "Bolognese Sauce", "finalOp": "simmer-sauce" }
  ],
  "finishSteps": [
    { "action": "toss", "inputs": ["simmer-sauce", "boil-pasta"], "details": "Combine and serve" }
  ]
}
```

**Key concepts:**

| Field | What it does |
|-------|-------------|
| `inputs` | Creates DAG edges — reference ingredient IDs or previous operation IDs |
| `time` vs `activeTime` | A 30-min simmer with 3 min active creates a 27-min idle window the optimizer can fill |
| `equipment.release` | `true` = equipment becomes available; `false` = stays occupied for chained operations |
| `scalable` | `false` means time doesn't change with servings (simmering, baking, resting) |
| `subProducts` | Named intermediate results (sauce, dough, filling) the UI can label and track |

## Adding recipes

### With Claude Code

If you have the [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code) with this repo's plugin:

```bash
/recipe-import https://example.com/my-recipe    # from a URL
/recipe-import path/to/photo.jpg                 # from a cookbook photo
/recipe-import                                   # paste text interactively
```

The plugin parses the text, converts to metric, validates the DAG, and generates HTML. It shows a side-by-side comparison before writing the file.

### Manually

1. Create `recipes/<cuisine>/<slug>.json` (use [`spaghetti-bolognese.json`](recipes/italian/spaghetti-bolognese.json) as a template)
2. Define ingredients, equipment, and operations
3. Wire up `inputs` arrays to form the DAG
4. Run `npm run build:recipe -- spaghetti-bolognese` (replace with your slug)
5. Open `site/<cuisine>/<slug>.html` in your browser

### Batch import

Drop recipe files (markdown, PDF, images) into `inbox/` and run `/recipe-inbox`.

### Suggested tags

Tags are freeform, but the app recognizes these categories from [`config/tags.json`](config/tags.json):

| Category | Tags |
|----------|------|
| Cuisine | italian, asian, mexican, french, indian, mediterranean, american, estonian, nordic |
| Meal | breakfast, lunch, dinner, snack, dessert |
| Type | pasta, soup, salad, stew, baking, grilling, stir-fry, roast |
| Effort | weeknight, weekend, quick, meal-prep |
| Dietary | vegetarian, vegan, gluten-free, dairy-free, low-carb |

## Project structure

```
recipes/                  JSON recipe sources, organized by cuisine
config/
  ├─ recipe-schema.json   JSON Schema (draft 2020-12) for recipe validation
  ├─ unit-conversions.json  metric/imperial conversion tables
  ├─ ingredient-densities.json  volume-to-weight (g per cup) for scaling
  ├─ tags.json            suggested tag taxonomy
  └─ preferences.json     default servings, language, dietary preferences
lib/
  ├─ recipe-build.js      reads JSON, computes schedules, writes HTML
  ├─ recipe-optimize.js   DAG validator, scheduler, critical path solver
  └─ unit-convert.js      unit normalization to metric
templates/
  ├─ recipe.html          interactive recipe page (XState v5 state machine)
  ├─ index.html           recipe browser with search and tag filters
  ├─ sw.js                service worker (stale-while-revalidate)
  ├─ app.webmanifest      PWA manifest
  └─ i18n/                language packs (en.json, et.json)
site/                     built output (deployed via CI)
.github/workflows/
  └─ deploy.yml           GitHub Actions → GitHub Pages
.claude-plugin/           Claude Code integration (commands + skills)
```

## Tech stack

| Layer | Technology |
|-------|-----------|
| Data | JSON with JSON Schema validation |
| Build | Node.js ES modules, no npm packages |
| Optimizer | Custom DAG scheduler (topological sort, critical path DP, greedy packing) |
| Frontend | Vanilla JS + XState v5 state machine |
| Styling | CSS custom properties, `clamp()` fluid typography, responsive grid |
| PWA | Service worker, web app manifest, Wake Lock API |
| i18n | JSON string bundles with deep-merge fallback |
| CI/CD | GitHub Actions → GitHub Pages |
| AI tooling | Claude Code plugin for recipe parsing and import |

No React. No Tailwind. No webpack. Three JS files, no npm packages. Each recipe page is a self-contained HTML file.

## Roadmap

- [ ] More recipes (only 2 Italian so far — the schema supports any cuisine)
- [ ] Shopping list generator across multiple recipes
- [ ] Print-friendly CSS stylesheet
- [ ] More languages (i18n framework is ready — add a JSON file)
- [ ] Nutrition estimates per ingredient
- [ ] Voice control for hands-free step navigation
- [ ] Equipment timeline (Gantt chart showing pan/oven utilization)
- [ ] Recipe sharing via QR codes

## License

[MIT](LICENSE)
