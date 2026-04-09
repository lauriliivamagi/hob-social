import { describe, it, expect } from 'vitest';
import { cleanLlmJson, toKebabId, sanitizeIds, postProcessRaw, parseTimeFromText, ParseError } from './import-machine.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeExtraction(overrides: Partial<{ url: string; language: string; schemaOrgData: unknown; contentMarkdown: string }> = {}) {
  return {
    url: overrides.url ?? 'https://example.com/recipe',
    language: overrides.language ?? 'et',
    schemaOrgData: overrides.schemaOrgData ?? null,
    contentMarkdown: overrides.contentMarkdown ?? '# Test Recipe\n\nSome content here.',
  };
}

function makeRawRecipe(overrides: Partial<{
  meta: Record<string, unknown>;
  ingredients: Array<Record<string, unknown>>;
  equipment: Array<Record<string, unknown>>;
  operations: Array<Record<string, unknown>>;
}> = {}): Record<string, unknown> {
  return {
    meta: overrides.meta ?? { title: 'Test', slug: 'test', language: 'en', servings: 4 },
    ingredients: overrides.ingredients ?? [
      { id: 'flour', name: 'Flour', quantity: { min: 200, unit: 'g' }, group: 'pantry' },
    ],
    equipment: overrides.equipment ?? [
      { id: 'bowl', name: 'Bowl', count: 1 },
    ],
    operations: overrides.operations ?? [
      { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour'], depends: [], equipment: [{ use: 'bowl', release: true }], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// toKebabId
// ---------------------------------------------------------------------------

describe('toKebabId', () => {
  it('passes through valid kebab-case', () => {
    expect(toKebabId('sour-cream')).toBe('sour-cream');
  });

  it('converts underscores to hyphens', () => {
    expect(toKebabId('olive_oil')).toBe('olive-oil');
  });

  it('converts dots and spaces to hyphens', () => {
    expect(toKebabId('step 1.prep')).toBe('step-1-prep');
  });

  it('lowercases and strips non-alphanumeric chars', () => {
    expect(toKebabId('Café_Latte!')).toBe('caf-latte');
  });

  it('collapses multiple hyphens', () => {
    expect(toKebabId('a---b')).toBe('a-b');
  });

  it('trims leading/trailing hyphens', () => {
    expect(toKebabId('-leading-trailing-')).toBe('leading-trailing');
  });
});

// ---------------------------------------------------------------------------
// sanitizeIds
// ---------------------------------------------------------------------------

describe('sanitizeIds', () => {
  it('renames ingredient IDs and updates operation references', () => {
    const raw = {
      ingredients: [{ id: 'Olive_Oil', name: 'Olive Oil' }],
      equipment: [],
      operations: [{
        id: 'saute_veg', type: 'cook', action: 'Sauté',
        ingredients: ['Olive_Oil'], depends: [], equipment: [],
      }],
    };
    sanitizeIds(raw);

    expect(raw.ingredients[0]!['id']).toBe('olive-oil');
    expect(raw.operations[0]!['id']).toBe('saute-veg');
    expect(raw.operations[0]!['ingredients']).toEqual(['olive-oil']);
  });

  it('renames equipment IDs and updates equipment.use in operations', () => {
    const raw = {
      ingredients: [],
      equipment: [{ id: 'Large_Pot', name: 'Large Pot' }],
      operations: [{
        id: 'boil', type: 'cook', action: 'Boil',
        ingredients: [], depends: [], equipment: [{ use: 'Large_Pot', release: true }],
      }],
    };
    sanitizeIds(raw);

    expect(raw.equipment[0]!['id']).toBe('large-pot');
    const opEq = (raw.operations[0]!['equipment'] as Array<Record<string, unknown>>)[0]!;
    expect(opEq['use']).toBe('large-pot');
  });

  it('renames depends references consistently', () => {
    const raw = {
      ingredients: [], equipment: [],
      operations: [
        { id: 'step_1', type: 'prep', action: 'a', ingredients: [], depends: [], equipment: [] },
        { id: 'step_2', type: 'prep', action: 'b', ingredients: [], depends: ['step_1'], equipment: [] },
      ],
    };
    sanitizeIds(raw);
    expect(raw.operations[1]!['depends']).toEqual(['step-1']);
  });

  it('renames subProducts IDs and finalOp references', () => {
    const raw = {
      ingredients: [], equipment: [],
      operations: [
        { id: 'make_sauce', type: 'cook', action: 'a', ingredients: [], depends: [], equipment: [], subProduct: 'the_sauce' },
      ],
      subProducts: [{ id: 'the_sauce', name: 'Sauce', finalOp: 'make_sauce' }],
    };
    sanitizeIds(raw);

    expect(raw.operations[0]!['subProduct']).toBe('the-sauce');
    expect(raw.subProducts[0]!['id']).toBe('the-sauce');
    expect(raw.subProducts[0]!['finalOp']).toBe('make-sauce');
  });

  it('sanitizes meta.slug', () => {
    const raw = { meta: { slug: 'My Recipe!' }, ingredients: [], equipment: [], operations: [] };
    sanitizeIds(raw);
    expect((raw.meta as Record<string, unknown>)['slug']).toBe('my-recipe');
  });

  it('renames alternative ingredient IDs', () => {
    const raw = {
      ingredients: [{
        id: 'Fat_Main', name: 'Cream',
        alternatives: [{ id: 'Fat_Alt', name: 'Water' }],
      }],
      equipment: [],
      operations: [{
        id: 'mix', type: 'prep', action: 'Mix',
        ingredients: ['Fat_Main'], depends: [], equipment: [],
      }],
    };
    sanitizeIds(raw);
    expect(raw.ingredients[0]!['id']).toBe('fat-main');
    const alts = raw.ingredients[0]!['alternatives'] as Array<Record<string, unknown>>;
    expect(alts[0]!['id']).toBe('fat-alt');
  });
});

// ---------------------------------------------------------------------------
// cleanLlmJson
// ---------------------------------------------------------------------------

describe('cleanLlmJson', () => {
  it('parses valid JSON unchanged', () => {
    const obj = { meta: { title: 'Test' } };
    expect(cleanLlmJson(JSON.stringify(obj))).toEqual(obj);
  });

  it('strips markdown code fences', () => {
    expect(cleanLlmJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('strips code fences without language tag', () => {
    expect(cleanLlmJson('```\n{"a": 1}\n```')).toEqual({ a: 1 });
  });

  it('fixes trailing commas', () => {
    expect(cleanLlmJson('{"a": 1, "b": [2, 3,],}')).toEqual({ a: 1, b: [2, 3] });
  });

  it('fixes single-quoted strings', () => {
    expect(cleanLlmJson("{'title': 'My Recipe'}")).toEqual({ title: 'My Recipe' });
  });

  it('strips JavaScript-style comments', () => {
    expect(cleanLlmJson('{\n  "a": 1, // inline comment\n  "b": 2\n}')).toEqual({ a: 1, b: 2 });
  });

  it('handles unquoted keys', () => {
    expect(cleanLlmJson('{title: "Test", count: 4}')).toEqual({ title: 'Test', count: 4 });
  });

  it('returns something parseable even from garbled text (jsonrepair is aggressive)', () => {
    const result = cleanLlmJson('this is not json at all');
    expect(result).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// ParseError
// ---------------------------------------------------------------------------

describe('ParseError', () => {
  it('carries rawOutput', () => {
    const err = new ParseError('bad json', '{"broken": tru');
    expect(err.message).toBe('bad json');
    expect(err.rawOutput).toBe('{"broken": tru');
    expect(err).toBeInstanceOf(Error);
  });
});

// ---------------------------------------------------------------------------
// postProcessRaw
// ---------------------------------------------------------------------------

describe('postProcessRaw', () => {
  // --- Fix 1: Override meta.language from extraction ---
  describe('language override', () => {
    it('overrides meta.language with extraction language', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', language: 'en' } });
      postProcessRaw(raw, makeExtraction({ language: 'et' }));
      expect((raw['meta'] as Record<string, unknown>)['language']).toBe('et');
    });
  });

  // --- Fix 2: Override meta.source from extraction URL ---
  describe('source URL override', () => {
    it('sets meta.source from extraction URL', () => {
      const raw = makeRawRecipe();
      postProcessRaw(raw, makeExtraction({ url: 'https://nami-nami.ee/retsept/123' }));
      expect((raw['meta'] as Record<string, unknown>)['source']).toBe('https://nami-nami.ee/retsept/123');
    });

    it('overwrites incorrect LLM source', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', source: 'https://wrong.com' } });
      postProcessRaw(raw, makeExtraction({ url: 'https://correct.com/recipe' }));
      expect((raw['meta'] as Record<string, unknown>)['source']).toBe('https://correct.com/recipe');
    });
  });

  // --- Fix 3: Inject servings from schema.org ---
  describe('servings from schema.org', () => {
    it('uses recipeYield when available as number', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 18 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeYield: 16 },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(16);
    });

    it('parses recipeYield string like "4 servings"', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 6 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeYield: '4 servings' },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(4);
    });

    it('parses recipeYield from array', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 10 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeYield: ['8', '8 portions'] },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(8);
    });

    it('keeps LLM servings when schema.org has no recipeYield', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 4 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe' },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(4);
    });

    it('keeps LLM servings when recipeYield is unparseable', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 4 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeYield: 'a large batch' },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(4);
    });

    it('finds Recipe inside @graph', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 10 } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@graph': [{ '@type': 'WebPage' }, { '@type': 'Recipe', recipeYield: 6 }] },
      }));
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(6);
    });
  });

  // --- Fix 4: Clamp activeTime ≤ time ---
  describe('activeTime clamping', () => {
    it('clamps activeTime.min to time.min when exceeded', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: [], depends: [], equipment: [],
            time: { min: 300 }, activeTime: { min: 600 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['activeTime'] as { min: number }).min).toBe(300);
    });

    it('clamps activeTime.max to time.max when exceeded', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: [], depends: [], equipment: [],
            time: { min: 300, max: 600 }, activeTime: { min: 300, max: 900 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['activeTime'] as { max: number }).max).toBe(600);
    });

    it('leaves valid activeTime unchanged', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: [], depends: [], equipment: [],
            time: { min: 600 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['activeTime'] as { min: number }).min).toBe(300);
    });
  });

  // --- Fix 5: Deduplicate ingredients by ID ---
  describe('ingredient deduplication', () => {
    it('removes duplicate ingredients keeping first occurrence', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'flour', name: 'Flour', quantity: { min: 200, unit: 'g' }, group: 'pantry' },
          { id: 'flour', name: 'Flour (duplicate)', quantity: { min: 100, unit: 'g' }, group: 'pantry' },
          { id: 'sugar', name: 'Sugar', quantity: { min: 100, unit: 'g' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour', 'sugar'], depends: [], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ings = raw['ingredients'] as Array<Record<string, unknown>>;
      expect(ings).toHaveLength(2);
      expect(ings[0]!['name']).toBe('Flour');
      expect(ings[1]!['id']).toBe('sugar');
    });
  });

  // --- Fix 6: Remove orphan ingredients/equipment ---
  describe('orphan removal', () => {
    it('removes ingredients not referenced by any operation', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'flour', name: 'Flour', quantity: { min: 200, unit: 'g' }, group: 'pantry' },
          { id: 'orphan-spice', name: 'Unused', quantity: { min: 1, unit: 'tsp' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour'], depends: [], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ings = raw['ingredients'] as Array<Record<string, unknown>>;
      expect(ings).toHaveLength(1);
      expect(ings[0]!['id']).toBe('flour');
    });

    it('removes equipment not referenced by any operation', () => {
      const raw = makeRawRecipe({
        equipment: [
          { id: 'bowl', name: 'Bowl', count: 1 },
          { id: 'unused-pan', name: 'Pan', count: 1 },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: [], depends: [], equipment: [{ use: 'bowl', release: true }], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const eqs = raw['equipment'] as Array<Record<string, unknown>>;
      expect(eqs).toHaveLength(1);
      expect(eqs[0]!['id']).toBe('bowl');
    });
  });

  // --- Fix 7: Remove self-references in depends ---
  describe('self-reference removal', () => {
    it('removes operation depending on itself', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step-a', type: 'prep', action: 'A', ingredients: [], depends: ['step-a'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect(op['depends']).toEqual([]);
    });

    it('keeps valid depends while removing self-reference', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step-a', type: 'prep', action: 'A', ingredients: [], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
          { id: 'step-b', type: 'prep', action: 'B', ingredients: [], depends: ['step-a', 'step-b'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[1]!;
      expect(op['depends']).toEqual(['step-a']);
    });
  });

  // --- Fix 8: Deduplicate depends ---
  describe('depends deduplication', () => {
    it('removes duplicate entries in depends', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step-a', type: 'prep', action: 'A', ingredients: [], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
          { id: 'step-b', type: 'prep', action: 'B', ingredients: [], depends: ['step-a', 'step-a', 'step-a'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[1]!;
      expect(op['depends']).toEqual(['step-a']);
    });
  });

  // --- Fix 9: Recalculate totalTime from DAG critical path ---
  describe('totalTime recalculation', () => {
    it('computes totalTime from sequential operations', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step-a', type: 'prep', action: 'A', ingredients: [], depends: [], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'step-b', type: 'cook', action: 'B', ingredients: [], depends: ['step-a'], equipment: [], time: { min: 600 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const meta = raw['meta'] as Record<string, unknown>;
      const totalTime = meta['totalTime'] as { relaxed: { min: number }; optimized: { min: number } };
      expect(totalTime.relaxed.min).toBe(900); // 300 + 600
      expect(totalTime.optimized.min).toBe(900);
    });

    it('uses the longest parallel path', () => {
      // step-a (300s) → step-c (100s)
      // step-b (600s) → step-c (100s)
      // critical path: step-b(600) + step-c(100) = 700
      const raw = makeRawRecipe({
        operations: [
          { id: 'step-a', type: 'prep', action: 'A', ingredients: [], depends: [], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'step-b', type: 'prep', action: 'B', ingredients: [], depends: [], equipment: [], time: { min: 600 }, activeTime: { min: 600 }, scalable: true },
          { id: 'step-c', type: 'assemble', action: 'C', ingredients: [], depends: ['step-a', 'step-b'], equipment: [], time: { min: 100 }, activeTime: { min: 100 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const meta = raw['meta'] as Record<string, unknown>;
      const totalTime = meta['totalTime'] as { relaxed: { min: number } };
      expect(totalTime.relaxed.min).toBe(700);
    });

    it('handles single operation', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'only', type: 'prep', action: 'Do', ingredients: [], depends: [], equipment: [], time: { min: 120 }, activeTime: { min: 120 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const meta = raw['meta'] as Record<string, unknown>;
      const totalTime = meta['totalTime'] as { relaxed: { min: number } };
      expect(totalTime.relaxed.min).toBe(120);
    });
  });

  // --- Fix 10: Temperature sanity ---
  describe('temperature clamping', () => {
    it('clamps temperature above 350°C down to 350', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'bake', type: 'cook', action: 'Bake', ingredients: [], depends: [], equipment: [],
            time: { min: 1800 }, activeTime: { min: 0 }, scalable: false,
            temperature: { min: 5000, unit: 'C' } },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['temperature'] as { min: number }).min).toBe(350);
    });

    it('clamps Fahrenheit temperature to 660°F', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'bake', type: 'cook', action: 'Bake', ingredients: [], depends: [], equipment: [],
            time: { min: 1800 }, activeTime: { min: 0 }, scalable: false,
            temperature: { min: 800, unit: 'F' } },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['temperature'] as { min: number }).min).toBe(660);
    });

    it('leaves valid temperature unchanged', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'bake', type: 'cook', action: 'Bake', ingredients: [], depends: [], equipment: [],
            time: { min: 1800 }, activeTime: { min: 0 }, scalable: false,
            temperature: { min: 180, unit: 'C' } },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['temperature'] as { min: number }).min).toBe(180);
    });
  });

  // --- Fix 11: Time sanity ---
  describe('time clamping', () => {
    it('clamps zero time to 1 second', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step', type: 'prep', action: 'Do', ingredients: [], depends: [], equipment: [],
            time: { min: 0 }, activeTime: { min: 0 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['time'] as { min: number }).min).toBe(1);
    });

    it('caps single op at 48 hours', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'step', type: 'rest', action: 'Wait', ingredients: [], depends: [], equipment: [],
            time: { min: 999999 }, activeTime: { min: 0 }, scalable: false },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['time'] as { min: number }).min).toBe(172800);
    });
  });

  // --- Fix 12: Servings sanity ---
  describe('servings clamping', () => {
    it('clamps servings above 200 down to 200', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 999 } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(200);
    });

    it('clamps servings below 1 up to 1', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 0 } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(1);
    });

    it('rounds fractional servings', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', servings: 4.7 } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['servings']).toBe(5);
    });
  });

  // --- Fix 13: Quantity sanity ---
  describe('quantity min > 0', () => {
    it('sets quantity.min to 1 when zero or negative', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'salt', name: 'Salt', quantity: { min: 0, unit: 'tsp' }, group: 'pantry' },
          { id: 'flour', name: 'Flour', quantity: { min: -5, unit: 'g' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['salt', 'flour'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ings = raw['ingredients'] as Array<Record<string, unknown>>;
      expect((ings[0]!['quantity'] as { min: number }).min).toBe(1);
      expect((ings[1]!['quantity'] as { min: number }).min).toBe(1);
    });
  });

  // --- Fix 14: Difficulty validation ---
  describe('difficulty validation', () => {
    it('defaults invalid difficulty to medium', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', difficulty: 'super-hard' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['difficulty']).toBe('medium');
    });

    it('keeps valid difficulty unchanged', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', difficulty: 'easy' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['difficulty']).toBe('easy');
    });

    it('defaults missing difficulty to medium', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['difficulty']).toBe('medium');
    });
  });

  // --- Fix 15: Inject originalText from extraction ---
  describe('originalText injection', () => {
    it('injects contentMarkdown as originalText', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test' } });
      postProcessRaw(raw, makeExtraction({ contentMarkdown: '# My Recipe\n\nGreat stuff.' }));
      expect((raw['meta'] as Record<string, unknown>)['originalText']).toBe('# My Recipe\n\nGreat stuff.');
    });

    it('overwrites any LLM-generated originalText', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', originalText: 'LLM garbage' } });
      postProcessRaw(raw, makeExtraction({ contentMarkdown: '# Real content' }));
      expect((raw['meta'] as Record<string, unknown>)['originalText']).toBe('# Real content');
    });
  });

  // --- Fix 16: Derive slug from title ---
  describe('slug from title', () => {
    it('derives slug from title', () => {
      const raw = makeRawRecipe({ meta: { title: 'Classic Beef Lasagne', slug: 'wrong-slug' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['slug']).toBe('classic-beef-lasagne');
    });

    it('handles non-ASCII titles (strips accents)', () => {
      const raw = makeRawRecipe({ meta: { title: 'Küpsetatud Kõrvits', slug: 'bad' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['slug']).toBe('kpsetatud-krvits');
    });

    it('handles titles with special characters', () => {
      const raw = makeRawRecipe({ meta: { title: 'Pasta à la Crème!', slug: 'x' } });
      postProcessRaw(raw, makeExtraction());
      // à and è are stripped, multiple hyphens collapsed
      expect((raw['meta'] as Record<string, unknown>)['slug']).toBe('pasta-la-crme');
    });
  });

  // --- Fix 17: Tag filtering and schema.org merge ---
  describe('tag filtering', () => {
    it('removes invalid tags', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: ['italian', 'invented-tag', 'pasta'] } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['tags']).toEqual(['italian', 'pasta']);
    });

    it('keeps all valid tags', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: ['italian', 'dinner', 'quick'] } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['tags']).toEqual(['italian', 'dinner', 'quick']);
    });

    it('handles missing tags gracefully', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test' } });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['tags']).toEqual([]);
    });

    it('merges tags from schema.org recipeCuisine', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: ['pasta'] } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeCuisine: 'Italian' },
      }));
      const tags = (raw['meta'] as Record<string, unknown>)['tags'] as string[];
      expect(tags).toContain('pasta');
      expect(tags).toContain('italian');
    });

    it('merges tags from schema.org recipeCategory', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: [] } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeCategory: 'Dessert' },
      }));
      const tags = (raw['meta'] as Record<string, unknown>)['tags'] as string[];
      expect(tags).toContain('dessert');
    });

    it('merges tags from schema.org keywords string', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: [] } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', keywords: 'vegetarian, quick, delicious' },
      }));
      const tags = (raw['meta'] as Record<string, unknown>)['tags'] as string[];
      expect(tags).toContain('vegetarian');
      expect(tags).toContain('quick');
      expect(tags).not.toContain('delicious'); // not in valid tag set
    });

    it('deduplicates merged tags', () => {
      const raw = makeRawRecipe({ meta: { title: 'Test', slug: 'test', tags: ['italian'] } });
      postProcessRaw(raw, makeExtraction({
        schemaOrgData: { '@type': 'Recipe', recipeCuisine: 'Italian' },
      }));
      const tags = (raw['meta'] as Record<string, unknown>)['tags'] as string[];
      expect(tags.filter((t) => t === 'italian')).toHaveLength(1);
    });
  });

  // --- Fix 18: energyTier derivation ---
  describe('energyTier derivation', () => {
    it('assigns zombie for low active time and simple DAG', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour'], depends: [], equipment: [{ use: 'bowl', release: true }], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['energyTier']).toBe('zombie');
    });

    it('assigns project for high active time', () => {
      const ops = [];
      for (let i = 0; i < 5; i++) {
        ops.push({
          id: `step-${i}`, type: 'cook', action: 'Cook',
          ingredients: i === 0 ? ['flour'] : [], depends: i > 0 ? [`step-${i - 1}`] : [],
          equipment: [{ use: 'bowl', release: i === 4 }],
          time: { min: 600 }, activeTime: { min: 600 }, scalable: true,
        });
      }
      const raw = makeRawRecipe({ operations: ops });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['energyTier']).toBe('project');
    });

    it('assigns project for complex DAG with many fork points', () => {
      // 3 different fork points (each depended on by 2+ ops) → forkPoints >= 3
      const raw = makeRawRecipe({
        operations: [
          { id: 'base', type: 'prep', action: 'Prep', ingredients: ['flour'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
          { id: 'a', type: 'cook', action: 'A', ingredients: [], depends: ['base'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'b', type: 'cook', action: 'B', ingredients: [], depends: ['base'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'merge1', type: 'cook', action: 'M1', ingredients: [], depends: ['a', 'b'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
          { id: 'c', type: 'cook', action: 'C', ingredients: [], depends: ['merge1'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'd', type: 'cook', action: 'D', ingredients: [], depends: ['merge1'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'merge2', type: 'cook', action: 'M2', ingredients: [], depends: ['c', 'd'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
          { id: 'e', type: 'cook', action: 'E', ingredients: [], depends: ['merge2'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'f', type: 'cook', action: 'F', ingredients: [], depends: ['merge2'], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      // base, merge1, merge2 each depended on by 2+ → forkPoints = 3
      expect((raw['meta'] as Record<string, unknown>)['energyTier']).toBe('project');
    });

    it('assigns moderate for medium complexity', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'prep', type: 'prep', action: 'Prep', ingredients: ['flour'], depends: [], equipment: [], time: { min: 300 }, activeTime: { min: 300 }, scalable: true },
          { id: 'cook', type: 'cook', action: 'Cook', ingredients: [], depends: ['prep'], equipment: [{ use: 'bowl', release: true }], time: { min: 900 }, activeTime: { min: 600 }, scalable: true },
          { id: 'serve', type: 'assemble', action: 'Serve', ingredients: [], depends: ['cook'], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      expect((raw['meta'] as Record<string, unknown>)['energyTier']).toBe('moderate');
    });
  });

  // --- Fix 19: Unit normalization ---
  describe('unit normalization', () => {
    it('normalizes tablespoons to tbsp', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'oil', name: 'Oil', quantity: { min: 2, unit: 'tablespoons' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['oil'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ing = (raw['ingredients'] as Array<Record<string, unknown>>)[0]!;
      expect((ing['quantity'] as { unit: string }).unit).toBe('tbsp');
    });

    it('normalizes cups to cup', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'flour', name: 'Flour', quantity: { min: 2, unit: 'cups' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ing = (raw['ingredients'] as Array<Record<string, unknown>>)[0]!;
      expect((ing['quantity'] as { unit: string }).unit).toBe('cup');
    });

    it('normalizes alternative ingredient units', () => {
      const raw = makeRawRecipe({
        ingredients: [
          {
            id: 'fat', name: 'Cream', quantity: { min: 200, unit: 'milliliters' }, group: 'dairy',
            alternatives: [{ id: 'fat-alt', name: 'Water', quantity: { min: 200, unit: 'ounces' }, group: 'pantry' }],
          },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['fat'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ing = (raw['ingredients'] as Array<Record<string, unknown>>)[0]!;
      expect((ing['quantity'] as { unit: string }).unit).toBe('ml');
      const alts = ing['alternatives'] as Array<Record<string, unknown>>;
      expect((alts[0]!['quantity'] as { unit: string }).unit).toBe('oz');
    });

    it('leaves already-canonical units unchanged', () => {
      const raw = makeRawRecipe({
        ingredients: [
          { id: 'flour', name: 'Flour', quantity: { min: 200, unit: 'g' }, group: 'pantry' },
        ],
        operations: [
          { id: 'mix', type: 'prep', action: 'Mix', ingredients: ['flour'], depends: [], equipment: [], time: { min: 60 }, activeTime: { min: 60 }, scalable: true },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const ing = (raw['ingredients'] as Array<Record<string, unknown>>)[0]!;
      expect((ing['quantity'] as { unit: string }).unit).toBe('g');
    });
  });

  // --- Fix 20: Time validation from details ---
  describe('time validation from details', () => {
    it('corrects wildly wrong time when details say otherwise', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'simmer', type: 'cook', action: 'Simmer', ingredients: [], depends: [], equipment: [],
            time: { min: 100 }, activeTime: { min: 0 }, scalable: false,
            details: 'Simmer for 25 minutes' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['time'] as { min: number }).min).toBe(1500); // 25 * 60
    });

    it('leaves correct time unchanged', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'cook', type: 'cook', action: 'Cook', ingredients: [], depends: [], equipment: [],
            time: { min: 480 }, activeTime: { min: 240 }, scalable: true,
            details: 'Cook for 8 minutes, stirring occasionally' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['time'] as { min: number }).min).toBe(480); // correct: 8 * 60
    });

    it('adds missing max from range in details', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'rest', type: 'rest', action: 'Rest', ingredients: [], depends: [], equipment: [],
            time: { min: 600 }, activeTime: { min: 0 }, scalable: false,
            details: 'Let stand 10-15 minutes before cutting' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['time'] as { min: number; max?: number }).max).toBe(900); // 15 * 60
    });
  });

  // --- Fix 21: Heat-to-temperature fallback ---
  describe('heat-to-temperature fallback', () => {
    it('injects temperature for "medium heat" in details', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'saute', type: 'cook', action: 'Sauté', ingredients: ['flour'], depends: [], equipment: [{ use: 'bowl', release: true }],
            time: { min: 480 }, activeTime: { min: 240 }, scalable: true,
            details: 'Heat oil in pan over medium heat' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      const temp = op['temperature'] as { min: number; max: number; unit: string };
      expect(temp.min).toBe(160);
      expect(temp.max).toBe(180);
      expect(temp.unit).toBe('C');
    });

    it('injects temperature for "high heat"', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'sear', type: 'cook', action: 'Sear', ingredients: ['flour'], depends: [], equipment: [],
            time: { min: 120 }, activeTime: { min: 120 }, scalable: true,
            details: 'Sear over high heat until browned' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      const temp = op['temperature'] as { min: number; max: number; unit: string };
      expect(temp.min).toBe(230);
      expect(temp.max).toBe(260);
    });

    it('does not overwrite existing temperature', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'bake', type: 'cook', action: 'Bake', ingredients: [], depends: [], equipment: [],
            time: { min: 1800 }, activeTime: { min: 0 }, scalable: false,
            temperature: { min: 180, unit: 'C' },
            details: 'Bake over medium heat' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect((op['temperature'] as { min: number }).min).toBe(180);
    });

    it('does not inject temperature for non-cook operations', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'prep', type: 'prep', action: 'Dice', ingredients: ['flour'], depends: [], equipment: [],
            time: { min: 300 }, activeTime: { min: 300 }, scalable: true,
            details: 'Dice onion on medium heat cutting board' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      expect(op['temperature']).toBeUndefined();
    });

    it('matches "over medium" without "heat" suffix', () => {
      const raw = makeRawRecipe({
        operations: [
          { id: 'cook', type: 'cook', action: 'Cook', ingredients: ['flour'], depends: [], equipment: [],
            time: { min: 480 }, activeTime: { min: 240 }, scalable: true,
            details: 'Cook over medium until softened' },
        ],
      });
      postProcessRaw(raw, makeExtraction());
      const op = (raw['operations'] as Array<Record<string, unknown>>)[0]!;
      const temp = op['temperature'] as { min: number; max: number; unit: string };
      expect(temp.min).toBe(160);
      expect(temp.max).toBe(180);
    });
  });
});

// ---------------------------------------------------------------------------
// parseTimeFromText
// ---------------------------------------------------------------------------

describe('parseTimeFromText', () => {
  it('parses simple minutes', () => {
    expect(parseTimeFromText('Cook for 8 minutes')).toEqual({ min: 480 });
  });

  it('parses simple hours', () => {
    expect(parseTimeFromText('Bake for 2 hours')).toEqual({ min: 7200 });
  });

  it('parses compound hours and minutes', () => {
    expect(parseTimeFromText('Simmer for 1 hour 45 minutes')).toEqual({ min: 6300 });
  });

  it('parses ranges', () => {
    expect(parseTimeFromText('Let stand 10-15 minutes')).toEqual({ min: 600, max: 900 });
  });

  it('parses "min" abbreviation', () => {
    expect(parseTimeFromText('Cook 5 min')).toEqual({ min: 300 });
  });

  it('parses seconds', () => {
    expect(parseTimeFromText('Microwave for 30 seconds')).toEqual({ min: 30 });
  });

  it('returns null when no time expression found', () => {
    expect(parseTimeFromText('Dice the onion finely')).toBeNull();
  });

  it('parses range with dash', () => {
    expect(parseTimeFromText('Cook 6-7 minutes until browned')).toEqual({ min: 360, max: 420 });
  });

  it('handles multiple time fragments', () => {
    // "Bake 25 minutes covered, then 10 minutes uncovered"
    const result = parseTimeFromText('Bake 25 minutes covered, then 10 minutes uncovered');
    expect(result?.min).toBe(2100); // 25*60 + 10*60
  });
});
