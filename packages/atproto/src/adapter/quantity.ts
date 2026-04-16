import type { Quantity } from '@recipe/domain';
import type * as Lex from '../generated/types/social/hob/temp/recipe.js';
import { fromLexiconDecimal, toLexiconDecimal } from './decimal.js';

export function toLexiconQuantity(q: Quantity): Lex.Quantity {
  return {
    min: toLexiconDecimal(q.min),
    ...(q.max !== undefined && { max: toLexiconDecimal(q.max) }),
    unit: q.unit,
  };
}

export function fromLexiconQuantity(q: Lex.Quantity): Quantity {
  return {
    min: fromLexiconDecimal(q.min),
    ...(q.max !== undefined && { max: fromLexiconDecimal(q.max) }),
    unit: q.unit,
  };
}
