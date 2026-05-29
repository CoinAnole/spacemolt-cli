import { colorize, formatPlayer as formatPlayerValue, rawColors } from './ansi.ts';
import { type CompactTableOptions, firstArray, formatCompactTable, formatItemTable, rowValue } from './tables.ts';

export type ResultFormatter = ((result: Record<string, unknown>, command?: string) => boolean) & {
  formatterName?: string;
  hintKeys?: string[];
  commands?: readonly string[];
  shapeFallback?: boolean;
};

export interface ResultFormatterOptions {
  commands?: readonly string[];
  shapeFallback?: boolean;
}

export function formatter(
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = format as ResultFormatter;
  resultFormatter.commands = options.commands;
  resultFormatter.shapeFallback = options.shapeFallback ?? false;
  return resultFormatter;
}

export function namedFormatter(
  formatterName: string,
  hintKeys: string[],
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = formatter(format, options);
  resultFormatter.formatterName = formatterName;
  resultFormatter.hintKeys = hintKeys;
  return resultFormatter;
}

export function formatterMatchesCommand(formatter: ResultFormatter, command: string): boolean {
  const commands = formatter.commands;
  if (!commands?.length) return false;
  const normalizedCommand = command.startsWith('v2_') ? command.slice(3) : command;
  return commands.includes(command) || commands.includes(normalizedCommand);
}

export function commandScopedFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatterMatchesCommand(formatter, command));
}

export function shapeFallbackFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatter.shapeFallback && !formatterMatchesCommand(formatter, command));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function sumNumericField(values: unknown, field: string): number | undefined {
  if (!Array.isArray(values)) return undefined;
  let total = 0;
  let found = false;
  for (const value of values) {
    if (!isRecord(value)) continue;
    const number = finiteNumber(value[field]);
    if (number === undefined) continue;
    total += number;
    found = true;
  }
  return found ? total : undefined;
}

export interface FormatterFixture {
  command: string;
  fixture: Record<string, unknown>;
}

export interface DisplayRenderBuffer {
  stdout: string[];
  stderr: string[];
}

let activeBuffer: DisplayRenderBuffer | undefined;
let activePlain = false;

export function withDisplayRenderBuffer<T>(
  buffer: DisplayRenderBuffer,
  fn: () => T,
  options: { plain?: boolean } = {},
): T {
  const previousBuffer = activeBuffer;
  const previousPlain = activePlain;
  activeBuffer = buffer;
  activePlain = options.plain ?? false;
  try {
    return fn();
  } finally {
    activeBuffer = previousBuffer;
    activePlain = previousPlain;
  }
}

function requireBuffer(): DisplayRenderBuffer {
  if (!activeBuffer) {
    throw new Error('display formatter wrote output outside a render buffer');
  }
  return activeBuffer;
}

export const c = {
  get reset() {
    return colorize('', rawColors.reset, activePlain);
  },
  get bright() {
    return colorize('', rawColors.bright, activePlain);
  },
  get dim() {
    return colorize('', rawColors.dim, activePlain);
  },
  get red() {
    return colorize('', rawColors.red, activePlain);
  },
  get green() {
    return colorize('', rawColors.green, activePlain);
  },
  get yellow() {
    return colorize('', rawColors.yellow, activePlain);
  },
  get blue() {
    return colorize('', rawColors.blue, activePlain);
  },
  get magenta() {
    return colorize('', rawColors.magenta, activePlain);
  },
  get cyan() {
    return colorize('', rawColors.cyan, activePlain);
  },
};

export function emitLine(message = ''): void {
  requireBuffer().stdout.push(message);
}

export function emitError(message = ''): void {
  requireBuffer().stderr.push(message);
}

export function emitLines(lines: string[]): void {
  for (const line of lines) emitLine(line);
}

export function emitItemTable(items: Array<Record<string, unknown>>, indent = '  ', title = 'Items'): void {
  const lines = formatItemTable(items, indent, title);
  if (lines[0] !== undefined) lines[0] = `${c.bright}${lines[0]}${c.reset}`;
  emitLines(lines);
}

export const printItemTable = emitItemTable;

export function emitCompactTable(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string[]]>,
  options?: CompactTableOptions,
): void {
  const lines = formatCompactTable(title, rows, columns, options);
  if (lines[0] !== undefined) lines[0] = lines[0].replace(`=== ${title} ===`, `${c.bright}=== ${title} ===${c.reset}`);
  emitLines(lines);
}

export const printCompactTable = emitCompactTable;

export function formatPlayer(player: Record<string, unknown>): string {
  return formatPlayerValue(player, c, activePlain);
}

export { firstArray, rowValue };
