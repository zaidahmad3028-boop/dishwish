import { describe, expect, it } from 'vitest';
import { formatGrams, parseGrams } from './pantryApi';

describe('parseGrams', () => {
  it.each([['250', 250], [' 1500 ', 1500], ['1', 1], ['99.6', 100], ['100000', 100000]])('accepts %j', (text, grams) => {
    expect(parseGrams(text)).toBe(grams);
  });
  it.each(['', '0', '-5', 'abc', '1e3', '100001', '12,5', '0.2'])('rejects %j', (text) => {
    expect(parseGrams(text)).toBeNull();
  });
});

describe('formatGrams', () => {
  it('shows grams below a kilo and kilos above', () => {
    expect(formatGrams(250)).toBe('250 g');
    expect(formatGrams(1500)).toBe('1.5 kg');
  });
});
