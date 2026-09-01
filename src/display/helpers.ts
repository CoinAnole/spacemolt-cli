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

/** Format API reputation-change maps consistently across human-readable output. */
export function formatReputationChangesSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = Object.entries(value)
    .filter(([, change]) => change !== undefined && change !== null && change !== '')
    .map(([empire, change]) => {
      const number = Number(change);
      const prefix = Number.isFinite(number) && number > 0 ? '+' : '';
      return `${empire} ${prefix}${change}`;
    });
  return parts.length ? parts.join(', ') : undefined;
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
 * Human required-stock display for facility rows/definitions (gameserver 0.550.0 stock-on-hand).
 * Wire field names remain historical (`maintenance_per_cycle`, `maintenance_fuel`, …); values are
 * on-hand stock thresholds, not per-cycle burn. Supports bunker-style `maintenance_fuel` (integer
 * fuel stock) plus item lists on `maintenance_per_cycle` (live FacilityEntry) or
 * `maintenance_inputs` (catalog FacilityDefinition). FacilityEntry OpenAPI does not declare
 * `maintenance_fuel`; formatting it here is defensive for live extras and for catalog/definition
 * payloads that do include the field.
 */
export function formatFacilityMaintenanceUpkeep(row: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  const fuel = finiteNumber(row.maintenance_fuel);
  if (fuel !== undefined) {
    parts.push(`${fuel.toLocaleString()} fuel stock`);
  }
  const items =
    formatMaintenanceItemList(row.maintenance_per_cycle) ?? formatMaintenanceItemList(row.maintenance_inputs);
  if (items) parts.push(items);
  return parts.length ? parts.join(', ') : undefined;
}

/** True when this facility is not accruing new rent. Allowlist — not `status != 'active'`. */
export function facilityBillingPaused(row: Record<string, unknown>): boolean {
  if (row.damaged === true || row.under_construction === true || row.dismantling === true) return true;
  const status = typeof row.status === 'string' ? row.status : '';
  return status === 'damaged' || status === 'repairing' || status === 'under_construction' || status === 'dismantling';
}

export function withPausedRentSuffix(formattedRate: string, row: Record<string, unknown>): string {
  return facilityBillingPaused(row) ? `${formattedRate} (paused)` : formattedRate;
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

/** Canonical station Base ID and optional station POI ID. */
export function emitStationIds(base: unknown, indent = ''): boolean {
  if (!isRecord(base)) return false;
  emitLine(`${indent}ID: ${base.id || base.base_id || 'unknown'}`);
  if (base.poi_id) emitLine(`${indent}POI: ${base.poi_id}`);
  return true;
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

const STATION_SERVICE_POOL_KEYS: ReadonlyArray<[string, string]> = [
  ['personnel', 'Personnel'],
  ['medical', 'Medical'],
  ['marine_training', 'Marine training'],
];

function formatStationServicePoolLine(label: string, pool: Record<string, unknown>): string {
  const remaining = finiteNumber(pool.remaining);
  const capacity = finiteNumber(pool.capacity);
  const remainingText = remaining === undefined ? '?' : String(remaining);
  const capacityText = capacity === undefined ? '?' : String(capacity);
  let line = `  ${label}: ${remainingText}/${capacityText} remaining`;
  const refill = finiteNumber(pool.refill_per_cycle);
  const supply = typeof pool.supply_item === 'string' && pool.supply_item ? pool.supply_item : undefined;
  if (refill !== undefined) {
    line += ` (+${refill}/cycle`;
    if (supply) line += `, ${supply}`;
    line += ')';
  }
  const need = finiteNumber(pool.next_cycle_supply_required);
  if (need !== undefined && need > 0) line += ` (need ${need} next cycle)`;
  return line;
}

export function emitStationServicePools(pools: unknown): boolean {
  if (!isRecord(pools)) return false;
  const lines: string[] = [];
  for (const [key, label] of STATION_SERVICE_POOL_KEYS) {
    const pool = pools[key];
    if (!isRecord(pool)) continue;
    lines.push(formatStationServicePoolLine(label, pool));
  }
  if (!lines.length) return false;

  emitLine('');
  emitLine(`${c.bright}Service pools:${c.reset}`);
  for (const line of lines) emitLine(line);
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

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function formatStationMaterial(material: Record<string, unknown>): string | undefined {
  const name = nonEmptyString(material.name) ?? nonEmptyString(material.item_id);
  if (!name) return undefined;
  const required = material.quantity_required;
  const stored = material.quantity_in_storage;
  const missing = material.quantity_missing;
  const progress =
    required !== undefined || stored !== undefined
      ? `${formatDisplayNumber(stored ?? '?')}/${formatDisplayNumber(required ?? '?')}`
      : '';
  const missingText = missing !== undefined ? `${formatDisplayNumber(missing)} missing` : '';
  const detail = [progress, missingText].filter(Boolean).join(', ');
  return detail ? `${name}: ${detail}` : name;
}

function summarizeStationMaterials(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map(formatStationMaterial)
    .filter((part): part is string => Boolean(part))
    .join('; ');
}

function constructionRows(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((row) => ({
    ...row,
    eta: row.ticks_until_complete === undefined ? undefined : `${formatDisplayNumber(row.ticks_until_complete)} ticks`,
    materials_summary: summarizeStationMaterials(row.materials),
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

function stationJobEta(value: unknown): string | undefined {
  const ticks = finiteNumber(value);
  return ticks === undefined ? undefined : `${formatDisplayNumber(ticks)} ticks`;
}

function hasPrintableRepairEntry(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  if (
    nonEmptyString(value.name) ||
    nonEmptyString(value.instance_id) ||
    nonEmptyString(value.definition_id) ||
    nonEmptyString(value.status) ||
    nonEmptyString(value.category)
  ) {
    return true;
  }
  if (finiteNumber(value.ticks_until_complete) !== undefined) return true;
  if (!Array.isArray(value.materials)) return false;
  return value.materials.filter(isRecord).some((material) => Boolean(formatStationMaterial(material)));
}

function hasStationRepairWork(repairs: Record<string, unknown>): boolean {
  if (repairs.wrecked === true) return true;
  for (const key of ['damaged_count', 'repairing_count', 'waiting_count'] as const) {
    const count = finiteNumber(repairs[key]);
    if (count !== undefined && count > 0) return true;
  }
  if (Array.isArray(repairs.facilities) && repairs.facilities.some(hasPrintableRepairEntry)) return true;
  if (hasPrintableRepairEntry(repairs.next_blocked)) return true;
  const hullMissing = finiteNumber(repairs.hull_missing);
  if (hullMissing !== undefined && hullMissing > 0) return true;
  const hullCurrent = finiteNumber(repairs.hull_current);
  const hullRequired = finiteNumber(repairs.hull_required);
  if (hullCurrent !== undefined && hullRequired !== undefined && hullCurrent !== hullRequired) return true;
  if (
    Array.isArray(repairs.materials) &&
    repairs.materials.filter(isRecord).some((material) => Boolean(formatStationMaterial(material)))
  ) {
    return true;
  }
  return Boolean(nonEmptyString(repairs.remediation));
}

function repairQueueRows(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(hasPrintableRepairEntry).map((row) => ({
    name: nonEmptyString(row.name) ?? '',
    instance_id: nonEmptyString(row.instance_id) ?? '',
    definition_id: nonEmptyString(row.definition_id) ?? '',
    category: nonEmptyString(row.category) ?? '',
    status: nonEmptyString(row.status) ?? '',
    eta: stationJobEta(row.ticks_until_complete),
    materials_summary: summarizeStationMaterials(row.materials),
  }));
}

/** StationRepairResponse from get_base / inspect docked base. No-op if empty. */
export function emitStationRepairs(repairs: unknown, options: { skipWrecked?: boolean } = {}): boolean {
  if (!isRecord(repairs) || !hasStationRepairWork(repairs)) return false;

  emitLine('');
  emitLine(`${c.bright}=== Repairs ===${c.reset}`);

  if (repairs.wrecked === true && !options.skipWrecked) emitLine('Wrecked: yes');

  const queueSegments: string[] = [];
  for (const [key, label] of [
    ['damaged_count', 'damaged'],
    ['repairing_count', 'repairing'],
    ['waiting_count', 'waiting'],
  ] as const) {
    const count = finiteNumber(repairs[key]);
    if (count !== undefined) queueSegments.push(`${formatDisplayNumber(count)} ${label}`);
  }
  if (queueSegments.length) emitLine(`Queue: ${queueSegments.join(', ')}`);

  const supply = nonEmptyString(repairs.supply_method);
  if (supply) emitLine(`Supply: ${supply}`);

  const hullCurrent = finiteNumber(repairs.hull_current);
  const hullRequired = finiteNumber(repairs.hull_required);
  const hullMissing = finiteNumber(repairs.hull_missing);
  if (hullCurrent !== undefined || hullRequired !== undefined || hullMissing !== undefined) {
    const currentText = hullCurrent === undefined ? '?' : formatDisplayNumber(hullCurrent);
    const requiredText = hullRequired === undefined ? '?' : formatDisplayNumber(hullRequired);
    const missingText = hullMissing === undefined ? '' : ` (${formatDisplayNumber(hullMissing)} missing)`;
    emitLine(`Hull recovery: ${currentText}/${requiredText}${missingText}`);
  }

  const nextBlocked = repairs.next_blocked;
  if (hasPrintableRepairEntry(nextBlocked)) {
    const title =
      nonEmptyString(nextBlocked.name) ??
      nonEmptyString(nextBlocked.instance_id) ??
      nonEmptyString(nextBlocked.definition_id);
    emitLine(`Next blocked:${title ? ` ${title}` : ''}`);
    const instanceId = nonEmptyString(nextBlocked.instance_id);
    if (instanceId) emitLine(`  Facility ID: ${instanceId}`);
    const definitionId = nonEmptyString(nextBlocked.definition_id);
    if (definitionId) emitLine(`  Type: ${definitionId}`);
    const category = nonEmptyString(nextBlocked.category);
    if (category) emitLine(`  Category: ${category}`);
    const status = nonEmptyString(nextBlocked.status);
    if (status) emitLine(`  Status: ${status}`);
    const eta = stationJobEta(nextBlocked.ticks_until_complete);
    if (eta) emitLine(`  ETA: ${eta}`);
    if (Array.isArray(nextBlocked.materials)) {
      for (const material of nextBlocked.materials) {
        if (!isRecord(material)) continue;
        const formatted = formatStationMaterial(material);
        if (formatted) emitLine(`  ${formatted}`);
      }
    }
  }

  const facilityRows = repairQueueRows(repairs.facilities);
  if (facilityRows.length) {
    printCompactTable(
      'Repair Queue',
      facilityRows,
      [
        ['Name', ['name']],
        ['Facility ID', ['instance_id']],
        ['Type', ['definition_id']],
        ['Category', ['category']],
        ['Status', ['status']],
        ['ETA', ['eta']],
        ['Materials', ['materials_summary']],
      ],
      { maxCellWidth: 64 },
    );
  }

  const combined: string[] = [];
  if (Array.isArray(repairs.materials)) {
    for (const material of repairs.materials) {
      if (!isRecord(material)) continue;
      const formatted = formatStationMaterial(material);
      if (formatted) combined.push(formatted);
    }
  }
  if (combined.length) {
    emitLine('Combined shortages:');
    for (const line of combined) emitLine(`  ${line}`);
  }

  const remediation = nonEmptyString(repairs.remediation);
  if (remediation) {
    if (combined.length) emitLine('');
    emitLine(remediation);
  }
  return true;
}

export { firstArray, rowValue };
