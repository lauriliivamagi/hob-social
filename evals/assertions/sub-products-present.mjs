/**
 * Assertion: checks that multi-component recipes identify sub-products.
 * For lasagne, expects sub-products like ragù, béchamel, etc.
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
    return { pass: false, score: 0, reason: 'Invalid JSON — cannot check sub-products' };
  }

  const subProducts = json.subProducts || [];

  if (subProducts.length === 0) {
    return {
      pass: false,
      score: 0,
      reason: 'No subProducts found — expected named intermediates (e.g., sauce, béchamel)',
    };
  }

  // Verify each subProduct has a finalOp that exists in operations
  const opIds = new Set((json.operations || []).map((op) => op.id));
  const broken = subProducts.filter((sp) => !opIds.has(sp.finalOp));

  if (broken.length > 0) {
    return {
      pass: false,
      score: 0.5,
      reason: `Sub-product(s) with invalid finalOp: ${broken.map((sp) => `${sp.id} → ${sp.finalOp}`).join(', ')}`,
    };
  }

  return {
    pass: true,
    score: 1,
    reason: `${subProducts.length} sub-product(s): ${subProducts.map((sp) => sp.name).join(', ')}`,
  };
}
