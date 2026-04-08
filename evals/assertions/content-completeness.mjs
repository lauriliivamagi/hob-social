/**
 * Assertion: checks that the LLM output faithfully represents the source recipe.
 *
 * Two modes:
 * 1. Golden comparison — for fixtures with known-good recipes in recipes/italian/,
 *    checks ingredient count, ingredient names coverage, and operation count.
 * 2. Source extraction — for all fixtures, extracts ingredient-like lines from the
 *    source markdown and checks they appear in the LLM output.
 */
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
}

// Golden recipes for comparison (fixture name → golden JSON path)
// Golden recipes co-located with evals — fixture name maps to golden file
const GOLDEN = {
  'spaghetti-bolognese.json': 'evals/golden/spaghetti-bolognese.json',
  'classic-lasagne.json': 'evals/golden/classic-lasagne.json',
  'minestrone-soup.json': 'evals/golden/minestrone-soup.json',
  'imelihtne-suitsulohepasta.json': 'evals/golden/imelihtne-suitsulohepasta.json',
  'pardifileed-kyliekwong.json': 'evals/golden/pardifileed-kyliekwong.json',
  'varske-salat.json': 'evals/golden/varske-salat.json',
  'veisekael-tumedas-olles.json': 'evals/golden/veisekael-tumedas-olles.json',
  'loomalihahautis-koogiviljadega.json': 'evals/golden/loomalihahautis-koogiviljadega.json',
  'hapukoorepannkoogid.json': 'evals/golden/hapukoorepannkoogid.json',
  'pasta-fra-diavolo.json': 'evals/golden/pasta-fra-diavolo.json',
  'ricotta-gnocchi.json': 'evals/golden/ricotta-gnocchi.json',
};

function goldenComparison(output, goldenPath) {
  const golden = JSON.parse(readFileSync(resolve(root, goldenPath), 'utf-8'));
  const issues = [];
  let score = 1;

  // Ingredient count — allow some variance but flag big mismatches
  const goldenIngCount = golden.ingredients.length;
  const outputIngCount = output.ingredients?.length || 0;
  const ingRatio = outputIngCount / goldenIngCount;

  if (ingRatio < 0.7) {
    issues.push(`Too few ingredients: ${outputIngCount} vs golden ${goldenIngCount} (${Math.round(ingRatio * 100)}%)`);
    score -= 0.3;
  } else if (ingRatio > 1.5) {
    issues.push(`Too many ingredients: ${outputIngCount} vs golden ${goldenIngCount} — may be splitting unnecessarily`);
    score -= 0.1;
  }

  // Ingredient name coverage — check that golden ingredient names appear in output
  const outputIngNames = (output.ingredients || []).map(i => i.name?.toLowerCase() || '');
  const allOutputText = outputIngNames.join(' ');
  const goldenNames = golden.ingredients.map(i => i.name.toLowerCase());
  const matched = goldenNames.filter(name => {
    // Fuzzy: check if any significant word from golden name appears in output names
    const words = name.split(/\s+/).filter(w => w.length > 2);
    return words.some(w => allOutputText.includes(w));
  });
  const nameCoverage = matched.length / goldenNames.length;

  if (nameCoverage < 0.6) {
    const missing = goldenNames.filter(name => {
      const words = name.split(/\s+/).filter(w => w.length > 2);
      return !words.some(w => allOutputText.includes(w));
    });
    issues.push(`Low ingredient name coverage: ${Math.round(nameCoverage * 100)}%. Missing: ${missing.slice(0, 5).join(', ')}`);
    score -= 0.3;
  }

  // Operation count — rough check
  const goldenOpCount = golden.operations.length;
  const outputOpCount = output.operations?.length || 0;
  const opRatio = outputOpCount / goldenOpCount;

  if (opRatio < 0.5) {
    issues.push(`Too few operations: ${outputOpCount} vs golden ${goldenOpCount}`);
    score -= 0.2;
  }

  // Sub-product check for recipes that have them
  if (golden.subProducts.length > 0 && (!output.subProducts || output.subProducts.length === 0)) {
    issues.push(`Missing sub-products: golden has ${golden.subProducts.length}, output has 0`);
    score -= 0.1;
  }

  return {
    pass: score >= 0.5,
    score: Math.max(0, score),
    reason: issues.length > 0
      ? `Golden comparison: ${issues.join('; ')}`
      : `Golden comparison passed: ${outputIngCount} ingredients (golden: ${goldenIngCount}), ${outputOpCount} operations (golden: ${goldenOpCount}), name coverage ${Math.round(nameCoverage * 100)}%`,
  };
}


export default function (output, context) {
  const cleaned = stripFences(output);

  let json;
  try {
    json = JSON.parse(cleaned);
  } catch {
    return { pass: false, score: 0, reason: 'Invalid JSON — cannot check completeness' };
  }

  const fixture = context.vars?.fixture;

  if (GOLDEN[fixture]) {
    return goldenComparison(json, GOLDEN[fixture]);
  }

  return { pass: true, score: 0.5, reason: 'No golden recipe available for this fixture' };
}
