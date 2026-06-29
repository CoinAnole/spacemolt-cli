import type { GlobalOptions } from '../types.ts';
import { colorize, formatPlayer as formatPlayerValue, rawColors } from './ansi.ts';
import { type CompactTableOptions, firstArray, formatCompactTable, formatItemTable, rowValue } from './tables.ts';

export type ResultFormatter = ((
  result: Record<string, unknown>,
  command?: string,
  options?: GlobalOptions,
) => boolean) & {
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
  format: (result: Record<string, unknown>, command?: string, options?: GlobalOptions) => boolean,
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
  format: (result: Record<string, unknown>, command?: string, options?: GlobalOptions) => boolean,
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

function formatDisplayNumber(value: unknown): string {
  const number = finiteNumber(value);
  return number === undefined ? String(value) : number.toLocaleString();
}

export function emitCreditBalance(result: Record<string, unknown>): boolean {
  if (result.credits === undefined || result.credits === null || result.credits === '') return false;
  emitLine(`Credits: ${formatDisplayNumber(result.credits)}`);
  return true;
}

function formatPercent(value: unknown): string {
  const number = finiteNumber(value);
  if (number === undefined) return String(value);
  const pct = Math.abs(number) <= 1 ? number * 100 : number;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function summarizePowerFuelInputs(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter(isRecord)
    .map((item) => {
      const quantity = item.quantity_per_cycle ?? item.quantity;
      const name = item.name ?? item.item_id ?? 'item';
      return `${formatDisplayNumber(quantity ?? '?')} ${name}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

export function emitStationPower(power: unknown): boolean {
  if (!isRecord(power)) return false;
  const supply = power.supply;
  const draw = power.current_draw ?? power.draw;
  const efficiency = power.efficiency;
  const batteryStored = power.battery_stored;
  const batteryCapacity = power.battery_capacity;
  const fuelInputs = summarizePowerFuelInputs(power.fuel_inputs);
  const remediation = typeof power.remediation === 'string' && power.remediation.trim() ? power.remediation : undefined;
  const hasPower = supply !== undefined || draw !== undefined || efficiency !== undefined;
  const hasBattery = batteryStored !== undefined || batteryCapacity !== undefined;
  if (!hasPower && !hasBattery && !fuelInputs && !remediation) return false;

  emitLine('');
  emitLine(`${c.bright}Power:${c.reset}`);
  if (hasPower) {
    const drawText = draw === undefined ? '?' : formatDisplayNumber(draw);
    const supplyText = supply === undefined ? '?' : formatDisplayNumber(supply);
    const efficiencyText = efficiency === undefined ? '' : ` (${formatPercent(efficiency)} efficiency)`;
    emitLine(`  Power: ${drawText}/${supplyText} draw${efficiencyText}`);
  }
  if (hasBattery) {
    const storedText = batteryStored === undefined ? '?' : formatDisplayNumber(batteryStored);
    const capacityText = batteryCapacity === undefined ? '?' : formatDisplayNumber(batteryCapacity);
    emitLine(`  Battery: ${storedText}/${capacityText}`);
  }
  if (fuelInputs) emitLine(`  Fuel Inputs: ${fuelInputs}`);
  if (remediation) emitLine(`  ${remediation}`);
  return true;
}

export function emitStationFuelPricing(result: Record<string, unknown>, indent = ''): boolean {
  const fuelPrice = result.fuel_price;
  const fuelTax = result.fuel_tax_per_unit;
  const allInPrice = result.fuel_price_all_in;
  if (fuelPrice === undefined && fuelTax === undefined && allInPrice === undefined) return false;

  if (fuelPrice !== undefined) emitLine(`${indent}Fuel Price: ${formatDisplayNumber(fuelPrice)} credits`);
  if (fuelTax !== undefined) emitLine(`${indent}Fuel Tax: ${formatDisplayNumber(fuelTax)} credits/unit`);
  if (allInPrice !== undefined)
    emitLine(`${indent}All-in Refuel Price: ${formatDisplayNumber(allInPrice)} credits/unit`);
  return true;
}

function summarizeConstructionMaterials(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((material) => {
      const name = material.name ?? material.item_id ?? '?';
      const required = material.quantity_required;
      const stored = material.quantity_in_storage;
      const missing = material.quantity_missing;
      const progress =
        required !== undefined || stored !== undefined
          ? `${formatDisplayNumber(stored ?? '?')}/${formatDisplayNumber(required ?? '?')}`
          : '';
      const missingText = missing !== undefined ? `${formatDisplayNumber(missing)} missing` : '';
      const detail = [progress, missingText].filter(Boolean).join(', ');
      return detail ? `${name}: ${detail}` : String(name);
    })
    .join('; ');
}

function constructionRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((row) => ({
    ...row,
    eta: row.ticks_until_complete === undefined ? undefined : `${formatDisplayNumber(row.ticks_until_complete)} ticks`,
    materials_summary: summarizeConstructionMaterials(row.materials),
  }));
}

export function emitStationConstruction(construction: unknown): boolean {
  if (!isRecord(construction)) return false;
  const pending = constructionRows(construction.pending);
  const underConstruction = constructionRows(construction.under_construction);
  if (!pending?.length && !underConstruction?.length) return false;

  emitLine('');
  emitLine(`${c.bright}=== Construction ===${c.reset}`);
  const columns: Array<[string, string[]]> = [
    ['Name', ['name']],
    ['ID', ['definition_id', 'id']],
    ['Category', ['category']],
    ['Status', ['status']],
    ['ETA', ['eta']],
    ['Materials', ['materials_summary']],
  ];
  if (pending?.length) printCompactTable('Pending', pending, columns, { maxCellWidth: 64 });
  if (underConstruction?.length)
    printCompactTable('Under Construction', underConstruction, columns, {
      maxCellWidth: 64,
    });
  return true;
}

export { firstArray, rowValue };
