import { colorize, rawColors } from './display/ansi.ts';

export type DirectColors = Readonly<typeof rawColors>;

const COLOR_PALETTE: DirectColors = Object.freeze({ ...rawColors });
const PLAIN_PALETTE: DirectColors = Object.freeze({
  reset: '',
  bright: '',
  dim: '',
  red: '',
  green: '',
  yellow: '',
  blue: '',
  magenta: '',
  cyan: '',
});

export function colorizeForPlain(text: string, code: string, plain: boolean): string {
  return colorize(text, code, plain);
}

export function colorsForPlain(plain: boolean): DirectColors {
  return plain ? PLAIN_PALETTE : COLOR_PALETTE;
}
