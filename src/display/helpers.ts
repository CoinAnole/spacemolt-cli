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
  suppressShapeFallbackOnDecline?: boolean;
};

export interface ResultFormatterOptions {
  commands?: readonly string[];
  shapeFallback?: boolean;
  suppressShapeFallbackOnDecline?: boolean;
}

export function formatter(
  format: (result: Record<string, unknown>, command?: string, options?: GlobalOptions) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = format as ResultFormatter;
  resultFormatter.commands = options.commands;
  resultFormatter.shapeFallback = options.shapeFallback ?? false;
  resultFormatter.suppressShapeFallbackOnDecline = options.suppressShapeFallbackOnDecline ?? false;
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

/** Normalize CLI command names for formatter matching (`faction profile` → `faction_profile`). */
export function normalizeCommandName(command: string): string {
  const withoutV2 = command.startsWith('v2_') ? command.slice(3) : command;
  return withoutV2.replaceAll(' ', '_');
}

export function commandNameEquals(command: string | undefined, expected: string): boolean {
  if (!command) return false;
  return normalizeCommandName(command) === normalizeCommandName(expected);
}

export function formatterMatchesCommand(formatter: ResultFormatter, command: string): boolean {
  const commands = formatter.commands;
  if (!commands?.length) return false;
  // Grouped CLI surfaces pass display names like "faction profile"; formatters
  // register the internal underscore form "faction_profile".
  const normalized = normalizeCommandName(command);
  return commands.includes(command) || commands.includes(normalized);
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

function formatMaintenanceItemList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter(isRecord)
    .map((item) => {
      const quantity = finiteNumber(item.quantity);
      const quantityText = quantity === undefined ? '?' : quantity.toLocaleString();
      const name = item.name ?? item.item_id ?? 'item';
      return `${quantityText} ${name}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Human upkeep for facility rows/definitions.
 * Supports bunker-style `maintenance_fuel` (integer fuel/cycle) plus item lists
 * on `maintenance_per_cycle` (live FacilityEntry) or `maintenance_inputs` (catalog FacilityDefinition).
 * FacilityEntry OpenAPI does not declare `maintenance_fuel`; formatting it here is defensive for
 * live extras and for catalog/definition payloads that do include the field.
 */
export function formatFacilityMaintenanceUpkeep(row: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const fuel = finiteNumber(row.maintenance_fuel);
  if (fuel !== undefined) {
    parts.push(`${fuel.toLocaleString()} fuel/cycle`);
  }
  const items = formatMaintenanceItemList(row.maintenance_per_cycle) ?? formatMaintenanceItemList(row.maintenance_inputs);
  if (items) parts.push(items);
  return parts.length ? parts.join(', ') : undefined;
}

/**
 * Format API `depletion_percent` for human output.
 * Server semantics: 0 = full, 100 = empty (percent depleted).
 * Display shows remaining percent so miners read "how much is left".
 */
export function formatDepletionRemainingSuffix(depletionPercent: unknown): string {
  const depleted = finiteNumber(depletionPercent);
  if (depleted === undefined) return '';
  const remainingPct = 100 - depleted;
  const color = remainingPct > 25 ? c.green : remainingPct >= 5 ? c.yellow : c.red;
  return ` (${color}${remainingPct.toFixed(2)}% remaining${c.reset})`;
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

/** Station combat/defence stats from get_base (hull/shield/armor/guns). Replaces legacy defense_level. */
export function emitStationDefences(base: unknown, indent = ''): boolean {
  if (!isRecord(base)) return false;
  const hasHull = base.hull !== undefined || base.max_hull !== undefined;
  const hasShield = base.shield !== undefined || base.max_shield !== undefined;
  const hasArmor = base.armor !== undefined;
  const hasGuns = base.weapon_dps !== undefined || base.weapon_reach !== undefined;
  const wrecked = base.wrecked === true;
  if (!hasHull && !hasShield && !hasArmor && !hasGuns && !wrecked) return false;

  if (wrecked) emitLine(`${indent}${c.bright}Wrecked${c.reset}: facilities offline until repaired`);
  if (hasHull) emitLine(`${indent}Hull: ${base.hull ?? '?'}/${base.max_hull ?? '?'}`);
  if (hasShield) emitLine(`${indent}Shield: ${base.shield ?? '?'}/${base.max_shield ?? '?'}`);
  if (hasArmor) emitLine(`${indent}Armor: ${base.armor ?? 0}`);
  if (hasGuns) {
    const dps = base.weapon_dps ?? '?';
    const reach = base.weapon_reach;
    const reachText = reach === undefined ? '' : ` (reach ${reach})`;
    emitLine(`${indent}Guns: ${dps} DPS${reachText}`);
  }
  return true;
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

function summarizeLifeSupportMaintenance(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  const parts = value
    .filter(isRecord)
    .map((item) => {
      const quantity = item.quantity_per_cycle ?? item.quantity;
      const name = item.name ?? item.item_id ?? 'item';
      return `${name} x${formatDisplayNumber(quantity ?? '?')}`;
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : undefined;
}

export function emitStationLifeSupport(lifeSupport: unknown): boolean {
  if (!isRecord(lifeSupport)) return false;
  const supply = lifeSupport.supply;
  const demand = lifeSupport.demand;
  const plants = lifeSupport.plants;
  const cycleTicks = lifeSupport.maintenance_cycle_ticks;
  const maintenance = summarizeLifeSupportMaintenance(lifeSupport.maintenance);
  const starved = summarizeLifeSupportMaintenance(lifeSupport.starved);
  const remediation =
    typeof lifeSupport.remediation === 'string' && lifeSupport.remediation.trim() ? lifeSupport.remediation : undefined;
  const hasSlots = supply !== undefined || demand !== undefined;
  if (!hasSlots && plants === undefined && !maintenance && !starved && !remediation) return false;

  emitLine('');
  emitLine(`${c.bright}Life Support:${c.reset}`);
  if (hasSlots) {
    const demandText = demand === undefined ? '?' : formatDisplayNumber(demand);
    const supplyText = supply === undefined ? '?' : formatDisplayNumber(supply);
    emitLine(`  Slots: ${demandText}/${supplyText} used`);
  }
  if (plants !== undefined) emitLine(`  Plants online: ${formatDisplayNumber(plants)}`);
  if (maintenance) {
    const cadence = cycleTicks === undefined ? '' : ` every ${formatDisplayNumber(cycleTicks)} ticks`;
    emitLine(`  Upkeep${cadence}: ${maintenance}`);
  } else if (cycleTicks !== undefined) {
    emitLine(`  Upkeep every ${formatDisplayNumber(cycleTicks)} ticks`);
  }
  if (starved) emitLine(`  Short of upkeep: ${starved}`);
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
