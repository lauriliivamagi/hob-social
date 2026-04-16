/**
 * Fixed-point decimal encoding for AT Protocol (DAG-CBOR forbids floats).
 *
 * Real value = value / 10^scale. Scale 0 means plain integer.
 * Example: 2.5 ↔ {value: 25, scale: 1}.
 */
export interface LexiconDecimal {
  value: number;
  scale: number;
}

export function toLexiconDecimal(n: number): LexiconDecimal {
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot encode non-finite number as decimal: ${n}`);
  }
  if (Number.isInteger(n)) return { value: n, scale: 0 };

  const s = n.toString();
  if (s.includes('e') || s.includes('E')) {
    // Recipe quantities never need scientific notation; refusing keeps the
    // encoder exact rather than silently losing precision.
    throw new Error(`Cannot encode number in scientific notation: ${s}`);
  }

  const dotIndex = s.indexOf('.');
  const scale = s.length - dotIndex - 1;
  const value = parseInt(s.replace('.', ''), 10);
  return { value, scale };
}

export function fromLexiconDecimal(d: LexiconDecimal): number {
  if (!Number.isInteger(d.value)) {
    throw new Error(`Decimal.value must be integer, got ${d.value}`);
  }
  if (!Number.isInteger(d.scale) || d.scale < 0) {
    throw new Error(`Decimal.scale must be non-negative integer, got ${d.scale}`);
  }
  if (d.scale === 0) return d.value;
  return d.value / Math.pow(10, d.scale);
}
