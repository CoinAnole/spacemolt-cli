import { describe, expect, test } from 'bun:test';
import { rawColors } from './ansi.ts';
import { formatDeepCoreLine, formatDeepCoreMark, withDisplayRenderBuffer } from './helpers.ts';

const DEEP_CORE_LINE = 'Deep core: yes (too-sparse cutoff never applies; needs deep_core_access)';

function mark(value: unknown, plain = true): string {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  return withDisplayRenderBuffer(buffer, () => formatDeepCoreMark(value), { plain });
}

describe('formatDeepCoreLine', () => {
  test('true prints the dedicated line', () => {
    expect(formatDeepCoreLine(true)).toBe(DEEP_CORE_LINE);
  });

  test('false, omit, and non-boolean truthy values are silent', () => {
    expect(formatDeepCoreLine(false)).toBeUndefined();
    expect(formatDeepCoreLine(undefined)).toBeUndefined();
    expect(formatDeepCoreLine('true')).toBeUndefined();
    expect(formatDeepCoreLine(1)).toBeUndefined();
  });
});

describe('formatDeepCoreMark', () => {
  test('true prints the compact mark', () => {
    expect(mark(true)).toBe(' [deep core]');
  });

  test('false, omit, and non-boolean truthy values are silent', () => {
    expect(mark(false)).toBe('');
    expect(mark(undefined)).toBe('');
    expect(mark('true')).toBe('');
    expect(mark(1)).toBe('');
  });

  test('true includes cyan ANSI when not plain', () => {
    const result = mark(true, false);
    expect(result).toContain('[deep core]');
    expect(result).toContain(rawColors.cyan);
  });
});
