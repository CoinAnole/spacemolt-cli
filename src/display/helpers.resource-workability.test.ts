import { describe, expect, test } from 'bun:test';
import { rawColors } from './ansi.ts';
import { formatResourceWorkabilitySuffix, withDisplayRenderBuffer } from './helpers.ts';

function formatPlain(res: Record<string, unknown>): string {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  return withDisplayRenderBuffer(buffer, () => formatResourceWorkabilitySuffix(res), { plain: true });
}

describe('formatResourceWorkabilitySuffix', () => {
  test('power only', () => {
    expect(formatPlain({ supported_power: 12 })).toBe(', supports power 12');
  });

  test('power + lock', () => {
    expect(formatPlain({ supported_power: 6, lock_minimum_stock: 200 })).toBe(', supports power 6, lock min 200');
  });

  test('all three', () => {
    expect(formatPlain({ supported_power: 3, lock_minimum_stock: 200, too_sparse: true })).toBe(
      ', supports power 3, lock min 200, too sparse',
    );
  });

  test('sparse, no power', () => {
    expect(formatPlain({ lock_minimum_stock: 200, too_sparse: true })).toBe(', lock min 200, too sparse');
  });

  test('empty', () => {
    expect(formatPlain({})).toBe('');
  });

  test('too_sparse: false with power', () => {
    expect(formatPlain({ too_sparse: false, supported_power: 12 })).toBe(', supports power 12');
  });

  test("too_sparse: 'true'", () => {
    expect(formatPlain({ too_sparse: 'true' })).toBe('');
  });

  test('numeric strings coerce, matching house finiteNumber', () => {
    expect(formatPlain({ lock_minimum_stock: '200' })).toBe(', lock min 200');
  });

  test('lock 0', () => {
    expect(formatPlain({ lock_minimum_stock: 0 })).toBe(', lock min 0');
  });

  test('too_sparse true includes red ANSI when not plain', () => {
    const buffer = { stdout: [] as string[], stderr: [] as string[] };
    const result = withDisplayRenderBuffer(buffer, () => formatResourceWorkabilitySuffix({ too_sparse: true }), {
      plain: false,
    });
    expect(result).toContain('too sparse');
    expect(result).toContain(rawColors.red);
  });
});
