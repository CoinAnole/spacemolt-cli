import { describe, expect, test } from 'bun:test';
import { formatDepletionRemainingSuffix, withDisplayRenderBuffer } from './helpers.ts';

function formatPlain(depletionPercent: unknown): string {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  return withDisplayRenderBuffer(buffer, () => formatDepletionRemainingSuffix(depletionPercent), { plain: true });
}

describe('formatDepletionRemainingSuffix', () => {
  test('treats API depletion_percent as percent depleted (0=full, 100=empty)', () => {
    // 25% depleted → 75% remaining
    expect(formatPlain(25)).toBe(' (75.00% remaining)');
    // 0% depleted → full
    expect(formatPlain(0)).toBe(' (100.00% remaining)');
    // 100% depleted → empty
    expect(formatPlain(100)).toBe(' (0.00% remaining)');
  });

  test('returns empty string for non-numeric values', () => {
    expect(formatPlain(undefined)).toBe('');
    expect(formatPlain('not-a-number')).toBe('');
  });
});
