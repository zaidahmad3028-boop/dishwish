import { describe, expect, it } from 'vitest';
import { isRealEnvValue } from './supabase';

describe('isRealEnvValue', () => {
  it('rejects missing, blank and .env.example placeholder values', () => {
    expect(isRealEnvValue(undefined)).toBe(false);
    expect(isRealEnvValue('  ')).toBe(false);
    expect(isRealEnvValue('https://YOUR_PROJECT_REF.supabase.co')).toBe(false);
    expect(isRealEnvValue('YOUR_SUPABASE_ANON_KEY')).toBe(false);
  });
  it('accepts real-looking values', () => {
    expect(isRealEnvValue('https://abcd1234.supabase.co')).toBe(true);
  });
});
