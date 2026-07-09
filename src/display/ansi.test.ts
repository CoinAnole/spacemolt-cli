import { describe, expect, test } from 'bun:test';

import { colorCodes, colorize, formatPlayer, hexColor, rawColors } from './ansi.ts';

describe('ANSI display helpers', () => {
  test('colorize wraps text unless plain output is requested', () => {
    expect(colorize('hello', rawColors.red)).toBe(`${rawColors.red}hello${rawColors.reset}`);
    expect(colorize('hello', rawColors.red, true)).toBe('hello');
  });

  test('colorCodes exposes all standard colors and respects plain output', () => {
    const colors = colorCodes();

    expect(colors.reset).toEqual(expect.stringContaining(rawColors.reset));
    expect(colors.bright).toBe(`${rawColors.bright}${rawColors.reset}`);
    expect(colors.dim).toBe(`${rawColors.dim}${rawColors.reset}`);
    expect(colors.red).toBe(`${rawColors.red}${rawColors.reset}`);
    expect(colors.green).toBe(`${rawColors.green}${rawColors.reset}`);
    expect(colors.yellow).toBe(`${rawColors.yellow}${rawColors.reset}`);
    expect(colors.blue).toBe(`${rawColors.blue}${rawColors.reset}`);
    expect(colors.magenta).toBe(`${rawColors.magenta}${rawColors.reset}`);
    expect(colors.cyan).toBe(`${rawColors.cyan}${rawColors.reset}`);

    const plain = colorCodes(true);

    expect(plain.reset).toBe('');
    expect(plain.bright).toBe('');
    expect(plain.dim).toBe('');
    expect(plain.red).toBe('');
    expect(plain.green).toBe('');
    expect(plain.yellow).toBe('');
    expect(plain.blue).toBe('');
    expect(plain.magenta).toBe('');
    expect(plain.cyan).toBe('');
  });

  test('hexColor formats foreground and background colors', () => {
    expect(hexColor('pilot', '#112233')).toBe('\x1b[38;2;17;34;51mpilot\x1b[0m');
    expect(hexColor('pilot', undefined, '#445566')).toBe('\x1b[48;2;68;85;102mpilot\x1b[0m');
    expect(hexColor('pilot', '#112233', '#445566')).toBe('\x1b[38;2;17;34;51m\x1b[48;2;68;85;102mpilot\x1b[0m');
  });

  test('hexColor ignores invalid colors, missing colors, and plain output', () => {
    expect(hexColor('pilot')).toBe('pilot');
    expect(hexColor('pilot', 'red')).toBe('pilot');
    expect(hexColor('pilot', undefined, 'blue')).toBe('pilot');
    expect(hexColor('pilot', '#112233', undefined, true)).toBe('pilot');
  });

  test('formatPlayer includes identity, faction, ship, status, and combat markers in plain output', () => {
    expect(
      formatPlayer(
        {
          username: 'coin',
          faction_tag: 'MOLT',
          ship_class: 'Prospector',
          status_message: 'ready',
          in_combat: true,
        },
        colorCodes(true),
        true,
      ),
    ).toBe('coin [MOLT] (Prospector) - "ready" [IN COMBAT]');
  });

  test('formatPlayer colorizes combat marker when color output is enabled', () => {
    const formatted = formatPlayer({
      username: 'coin',
      in_combat: true,
    });

    expect(formatted).toContain(rawColors.red);
    expect(formatted).toContain('[IN COMBAT]');
    expect(formatted).toContain(rawColors.reset);
  });

  test('formatPlayer marks docked and offline players', () => {
    expect(
      formatPlayer(
        {
          username: 'coin',
          ship_class: 'Prospector',
          docked: true,
          offline: true,
        },
        colorCodes(true),
        true,
      ),
    ).toBe('coin (Prospector) [DOCKED] [OFFLINE]');
  });

  test('formatPlayer handles anonymous and unknown players', () => {
    expect(formatPlayer({ anonymous: true }, colorCodes(true), true)).toBe('[Anonymous]');
    expect(formatPlayer({})).toBe('Unknown');
  });
});
