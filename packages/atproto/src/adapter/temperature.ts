import type * as Lex from '../generated/types/social/hob/temp/recipe.js';
import { fromLexiconDecimal, toLexiconDecimal } from './decimal.js';

type DomainTemperature = {
  min: number;
  max?: number;
  unit: 'C' | 'F';
};

export function toLexiconTemperature(t: DomainTemperature): Lex.Temperature {
  return {
    min: toLexiconDecimal(t.min),
    ...(t.max !== undefined && { max: toLexiconDecimal(t.max) }),
    unit: t.unit,
  };
}

export function fromLexiconTemperature(t: Lex.Temperature): DomainTemperature {
  const unit = narrowUnit(t.unit);
  return {
    min: fromLexiconDecimal(t.min),
    ...(t.max !== undefined && { max: fromLexiconDecimal(t.max) }),
    unit,
  };
}

function narrowUnit(u: string): 'C' | 'F' {
  if (u === 'C' || u === 'F') return u;
  throw new Error(`Unsupported temperature unit: ${u}`);
}
