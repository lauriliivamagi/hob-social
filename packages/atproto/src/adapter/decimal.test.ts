import { describe, expect, it } from 'vitest';
import { fromLexiconDecimal, toLexiconDecimal } from './decimal.js';

describe('toLexiconDecimal', () => {
  it.each([
    [0, { value: 0, scale: 0 }],
    [1, { value: 1, scale: 0 }],
    [175, { value: 175, scale: 0 }],
    [2.5, { value: 25, scale: 1 }],
    [0.125, { value: 125, scale: 3 }],
    [-3.75, { value: -375, scale: 2 }],
    [100, { value: 100, scale: 0 }],
  ])('%s → %o', (input, expected) => {
    expect(toLexiconDecimal(input)).toEqual(expected);
  });

  it('rejects NaN', () => {
    expect(() => toLexiconDecimal(NaN)).toThrow();
  });

  it('rejects Infinity', () => {
    expect(() => toLexiconDecimal(Infinity)).toThrow();
  });
});

describe('fromLexiconDecimal', () => {
  it.each([
    [{ value: 0, scale: 0 }, 0],
    [{ value: 175, scale: 0 }, 175],
    [{ value: 25, scale: 1 }, 2.5],
    [{ value: 125, scale: 3 }, 0.125],
    [{ value: -375, scale: 2 }, -3.75],
  ])('%o → %s', (input, expected) => {
    expect(fromLexiconDecimal(input)).toBe(expected);
  });

  it('rejects non-integer value', () => {
    expect(() => fromLexiconDecimal({ value: 1.5, scale: 0 })).toThrow();
  });

  it('rejects negative scale', () => {
    expect(() => fromLexiconDecimal({ value: 1, scale: -1 })).toThrow();
  });
});

describe('round-trip', () => {
  it.each([0, 1, 2.5, 175, 0.125, -3.75, 1234, 0.001])('%s', (n) => {
    expect(fromLexiconDecimal(toLexiconDecimal(n))).toBe(n);
  });
});
