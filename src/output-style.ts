import { colorize, rawColors } from './display/ansi.ts';

export type DirectColors = typeof rawColors;

export function colorizeForPlain(text: string, code: string, plain: boolean): string {
  return colorize(text, code, plain);
}

export function colorsForPlain(plain: boolean): DirectColors {
  if (!plain) return rawColors;
  return {
    reset: '',
    bright: '',
    dim: '',
    red: '',
    green: '',
    yellow: '',
    blue: '',
    magenta: '',
    cyan: '',
  };
}
