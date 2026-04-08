/**
 * Assertion: checks that quantity ranges are correctly captured.
 * For the Estonian recipe, "100-150 g toorjuust" should have quantity.max.
 */

/** Strip markdown code fences. */
function stripFences(text) {
  return text.replace(/^```(?:json)?\s*\n?/m, '').replace(/\n?```\s*$/m, '');
}

export default function (output, context) {
  let json;
  try {
    json = JSON.parse(stripFences(output));
  } catch {
    return { pass: false, score: 0, reason: 'Invalid JSON — cannot check quantity ranges' };
  }

  const ingredients = json.ingredients || [];
  const withMax = ingredients.filter((i) => i.quantity?.max !== undefined);

  if (withMax.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No ingredients have quantity.max — expected at least one range (e.g., 100-150 g toorjuust)',
    };
  }

  // Check that max > min for all range ingredients
  const invalid = withMax.filter((i) => i.quantity.max <= i.quantity.min);
  if (invalid.length > 0) {
    return {
      pass: false,
      score: 0.5,
      reason: `Range ingredient(s) with max <= min: ${invalid.map((i) => i.id).join(', ')}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `${withMax.length} ingredient(s) with quantity ranges: ${withMax.map((i) => `${i.id} (${i.quantity.min}-${i.quantity.max})`).join(', ')}`,
  };
}
