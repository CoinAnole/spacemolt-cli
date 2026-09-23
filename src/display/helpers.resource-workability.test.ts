import { describe, expect, test } from 'bun:test';
import { rawColors } from './ansi.ts';
import {
  finiteNumber,
  formatIntegerText,
  formatResourceWorkabilitySuffix,
  sumNumericField,
  withDisplayRenderBuffer,
} from './helpers.ts';

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

  test('finiteNumber rejects bigint instead of rounding', () => {
    expect(finiteNumber(9007199254740993n)).toBeUndefined();
    expect(finiteNumber(42)).toBe(42);
    expect(finiteNumber('42')).toBe(42);
  });

  test('formatIntegerText prints exact bigint digits with the number locale', () => {
    const value = 9007199254740993n;
    expect(formatIntegerText(value)).toBe(value.toLocaleString());
    expect(formatIntegerText(value)?.replace(/\D/g, '')).toContain('9007199254740993');
    expect(formatIntegerText(value)).not.toContain('9007199254740992');
    expect(formatIntegerText(12500)).toBe((12500).toLocaleString());
    expect(formatIntegerText(Number.NaN)).toBeUndefined();
    expect(formatIntegerText('12500')).toBeUndefined();
    expect(formatIntegerText(undefined)).toBeUndefined();
  });

  test('sumNumericField returns undefined when any addend is bigint', () => {
    expect(sumNumericField([{ quantity: 2 }, { quantity: 3 }], 'quantity')).toBe(5);
    expect(sumNumericField([{ quantity: 2 }, { quantity: 9007199254740993n }], 'quantity')).toBeUndefined();
    expect(sumNumericField([{ quantity: 9007199254740993n }, { quantity: 3 }], 'quantity')).toBeUndefined();
    expect(sumNumericField([null, { quantity: 9007199254740993n }], 'quantity')).toBeUndefined();
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
