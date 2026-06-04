import { describe, expect, test } from 'bun:test';
import { rawColors } from './display/ansi.ts';
import { colorizeForPlain, colorsForPlain } from './output-style.ts';

describe('plain-aware direct output styling', () => {
  test('colorizeForPlain strips color when plain is true', () => {
    expect(colorizeForPlain('Error', rawColors.red, true)).toBe('Error');
    expect(colorizeForPlain('Error', rawColors.red, false)).toBe(`${rawColors.red}Error${rawColors.reset}`);
  });

  test('colorsForPlain exposes empty styles in plain mode', () => {
    const plain = colorsForPlain(true);
    const color = colorsForPlain(false);

    expect(color).not.toBe(rawColors);
    expect(Object.isFrozen(color)).toBe(true);
    expect(Object.isFrozen(plain)).toBe(true);
    expect(plain.red).toBe('');
    expect(plain.reset).toBe('');
    expect(color.red).toBe(rawColors.red);
    expect(color.reset).toBe(rawColors.reset);
  });
});
