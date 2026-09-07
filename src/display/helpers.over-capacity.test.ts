import { describe, expect, test } from 'bun:test';
import { rawColors } from './ansi.ts';
import { isOverCapacity, overCapacitySuffix, withDisplayRenderBuffer } from './helpers.ts';

function withBuffer<T>(fn: () => T, options: { plain?: boolean } = {}): T {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  return withDisplayRenderBuffer(buffer, fn, options);
}

function suffixPlain(used: unknown, capacity: unknown): string {
  return withBuffer(() => overCapacitySuffix(used, capacity), { plain: true });
}

function suffixColor(used: unknown, capacity: unknown): string {
  return withBuffer(() => overCapacitySuffix(used, capacity), { plain: false });
}

describe('isOverCapacity', () => {
  test('true when used exceeds capacity', () => {
    expect(withBuffer(() => isOverCapacity(40, 34))).toBe(true);
  });

  test('false when equal or under', () => {
    expect(withBuffer(() => isOverCapacity(34, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(16, 34))).toBe(false);
  });

  test('false when used or capacity is not finite', () => {
    expect(withBuffer(() => isOverCapacity(undefined, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, undefined))).toBe(false);
    expect(withBuffer(() => isOverCapacity(Number.NaN, 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, Number.NaN))).toBe(false);
    expect(withBuffer(() => isOverCapacity('not-a-number', 34))).toBe(false);
    expect(withBuffer(() => isOverCapacity(40, 'not-a-number'))).toBe(false);
  });

  test('coerces numeric strings', () => {
    expect(withBuffer(() => isOverCapacity('40', '34'))).toBe(true);
  });

  test('coerces empty string and null to 0', () => {
    expect(withBuffer(() => isOverCapacity(5, ''))).toBe(true);
    expect(withBuffer(() => isOverCapacity(5, null))).toBe(true);
  });

  test('capacity 0 is over when used is positive; 0/0 is full', () => {
    expect(withBuffer(() => isOverCapacity(5, 0))).toBe(true);
    expect(withBuffer(() => isOverCapacity(0, 0))).toBe(false);
  });
});

describe('overCapacitySuffix', () => {
  test('appends over-capacity when used exceeds capacity', () => {
    expect(suffixPlain(40, 34)).toBe(' (over capacity)');
  });

  test('empty when equal or under', () => {
    expect(suffixPlain(34, 34)).toBe('');
    expect(suffixPlain(16, 34)).toBe('');
  });

  test('empty when used or capacity is not finite', () => {
    expect(suffixPlain(undefined, 34)).toBe('');
    expect(suffixPlain(40, undefined)).toBe('');
    expect(suffixPlain(Number.NaN, 34)).toBe('');
    expect(suffixPlain('not-a-number', 34)).toBe('');
  });

  test('coerces numeric strings', () => {
    expect(suffixPlain('40', '34')).toBe(' (over capacity)');
  });

  test('coerces empty string and null to 0', () => {
    expect(suffixPlain(5, '')).toBe(' (over capacity)');
    expect(suffixPlain(5, null)).toBe(' (over capacity)');
  });

  test('capacity 0 is over when used is positive; 0/0 is full', () => {
    expect(suffixPlain(5, 0)).toBe(' (over capacity)');
    expect(suffixPlain(0, 0)).toBe('');
  });

  test('yellow wraps the phrase when color is on', () => {
    expect(suffixPlain(40, 34)).toBe(' (over capacity)');
    const colored = suffixColor(40, 34);
    expect(colored).toContain('(over capacity)');
    expect(colored).toContain(rawColors.yellow);
    expect(colored).not.toBe(suffixPlain(40, 34));
  });
});
