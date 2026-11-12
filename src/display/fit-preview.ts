import { emitLine, formatter, isRecord, printCompactTable, type ResultFormatter } from './helpers.ts';

const TOP_LEVEL_KEYS = new Set(['issues', 'ship_id', 'stats', 'steps', 'valid']);

/** OpenAPI FitPreviewStats property order. Present keys only; do not derive ratios or free cargo. */
const STAT_KEY_ORDER = [
  'max_hull',
  'max_shield',
  'shield_recharge',
  'armor',
  'speed',
  'max_fuel',
  'cargo_capacity',
  'cargo_used',
  'cpu_capacity',
  'cpu_used',
  'power_capacity',
  'power_used',
  'weapon_slots',
  'weapon_slots_used',
  'defense_slots',
  'defense_slots_used',
  'utility_slots',
  'utility_slots_used',
  'effective_crew_capacity',
  'effective_marine_capacity',
  'crew',
  'marines',
] as const;

function formatStatText(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return Object.is(value, -0) ? '0' : String(value);
  return undefined;
}

function readStringField(record: Record<string, unknown>, key: string): string | undefined | null {
  if (!Object.hasOwn(record, key)) return undefined;
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

function readIssues(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    for (const key of Object.keys(entry)) {
      if (key !== 'code' && key !== 'message') return undefined;
    }
    const code = readStringField(entry, 'code');
    const message = readStringField(entry, 'message');
    if (code === null || message === null) return undefined;
    const row: Record<string, unknown> = {};
    if (code !== undefined) row.code = code;
    if (message !== undefined) row.message = message;
    rows.push(row);
  }
  return rows;
}

function readSteps(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return undefined;
    for (const key of Object.keys(entry)) {
      if (key !== 'action' && key !== 'module_id' && key !== 'type_id' && key !== 'name' && key !== 'temporary') {
        return undefined;
      }
    }
    const row: Record<string, unknown> = {};
    for (const key of ['action', 'module_id', 'type_id', 'name'] as const) {
      const text = readStringField(entry, key);
      if (text === null) return undefined;
      if (text !== undefined) row[key] = text;
    }
    if (Object.hasOwn(entry, 'temporary')) {
      if (typeof entry.temporary !== 'boolean') return undefined;
      row.temporary_display = entry.temporary ? 'yes' : 'no';
    } else {
      row.temporary_display = '';
    }
    rows.push(row);
  }
  return rows;
}

function readStats(value: unknown): Array<[string, string]> | undefined {
  if (!isRecord(value)) return undefined;
  const known = new Set<string>(STAT_KEY_ORDER);
  const ordered = [
    ...STAT_KEY_ORDER.filter((key) => Object.hasOwn(value, key)),
    ...Object.keys(value).filter((key) => !known.has(key)),
  ];
  const lines: Array<[string, string]> = [];
  for (const key of ordered) {
    if (!Object.hasOwn(value, key)) continue;
    const stat = value[key];
    if (stat === undefined) continue;
    const text = formatStatText(stat);
    if (text === undefined) return undefined;
    lines.push([key, text]);
  }
  return lines;
}

function formatFitPreview(result: Record<string, unknown>): boolean {
  for (const key of Object.keys(result)) {
    if (!TOP_LEVEL_KEYS.has(key)) return false;
  }
  if (typeof result.ship_id !== 'string' || typeof result.valid !== 'boolean') return false;
  const issues = readIssues(result.issues);
  const steps = readSteps(result.steps);
  const stats = readStats(result.stats);
  if (!issues || !steps || !stats) return false;

  emitLine(`Ship: ${result.ship_id}`);
  emitLine(`Valid: ${result.valid ? 'yes' : 'no'}`);
  if (issues.length > 0) {
    printCompactTable(
      'Issues',
      issues,
      [
        ['code', ['code']],
        ['message', ['message']],
      ],
      { maxCellWidth: 120 },
    );
  }
  for (const [key, text] of stats) emitLine(`${key}: ${text}`);
  if (steps.length === 0) {
    emitLine('Steps: (none)');
  } else {
    printCompactTable(
      'Steps',
      steps,
      [
        ['action', ['action']],
        ['module_id', ['module_id']],
        ['type_id', ['type_id']],
        ['name', ['name']],
        ['Temporary', ['temporary_display']],
      ],
      { maxCellWidth: 120 },
    );
  }
  return true;
}

export const fitPreviewFormatters: ResultFormatter[] = [
  formatter(formatFitPreview, { commands: ['fit_preview'], suppressShapeFallbackOnDecline: true }),
];
