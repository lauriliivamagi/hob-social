/**
 * Assertion: checks that non-English ingredient names are preserved (not translated).
 * For Estonian recipes, expects names like "makaronid", "toorjuust", "suitsulõhe".
 */

/** Strip markdown code fences. */
function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
}

// Expected non-English substrings per language, keyed by fixture name.
// At least some of these should appear in ingredient names or operation actions.
const EXPECTED_STRINGS = {
  'imelihtne-suitsulohepasta.json': {
    language: 'et',
    ingredientHints: ['makaron', 'toorjuust', 'suitsulõhe', 'koor', 'pipar'],
  },
  'pardifileed-kyliekwong.json': {
    language: 'et',
    ingredientHints: ['pardi', 'nisujahu', 'tšilli', 'sool', 'sidrun', 'sibul'],
  },
  'varske-salat.json': {
    language: 'et',
    ingredientHints: ['salat', 'murulauk', 'parmesani', 'sidrun', 'mesi', 'sinep'],
  },
  'veisekael-tumedas-olles.json': {
    language: 'et',
    ingredientHints: ['veise', 'õlu', 'sibul', 'porgand', 'kartul', 'loorber'],
  },
  'loomalihahautis-koogiviljadega.json': {
    language: 'et',
    ingredientHints: ['veise', 'porgand', 'varsseller', 'lehtkapsas', 'porrulauk', 'tomatid'],
  },
  'hapukoorepannkoogid.json': {
    language: 'et',
    ingredientHints: ['hapukoor', 'jahu', 'muna', 'suhkur', 'sool'],
  },
};

export default function (output, context) {
  const fixture = context.vars?.fixture;
  const expected = EXPECTED_STRINGS[fixture];
  if (!expected) {
    return { pass: true, score: 1, reason: 'No language assertions for this fixture (English)' };
  }

  let json;
  try {
    json = JSON.parse(stripFences(output));
  } catch {
    return { pass: false, score: 0, reason: 'Invalid JSON — cannot check language preservation' };
  }

  // Check meta.language
  if (json.meta?.language !== expected.language) {
    return {
      pass: false,
      score: 0,
      reason: `Expected meta.language="${expected.language}", got "${json.meta?.language}"`,
    };
  }

  // Check that ingredient names contain at least some expected substrings
  const ingredientNames = (json.ingredients || []).map((i) => i.name?.toLowerCase() || '');
  const allText = ingredientNames.join(' ');

  const found = expected.ingredientHints.filter((hint) => allText.includes(hint.toLowerCase()));
  const ratio = found.length / expected.ingredientHints.length;

  if (ratio < 0.4) {
    return {
      pass: false,
      score: ratio,
      reason: `Only ${found.length}/${expected.ingredientHints.length} expected ${expected.language} terms found in ingredient names. Found: [${found.join(', ')}]. Ingredient names: [${ingredientNames.join(', ')}]. Possibly translated to English.`,
    };
  }

  return {
    pass: true,
    score: ratio,
    reason: `${found.length}/${expected.ingredientHints.length} expected ${expected.language} terms found: [${found.join(', ')}]`,
  };
}
