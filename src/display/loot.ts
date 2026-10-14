import { isAliasCopiedDumpKey } from './dock-state.ts';
import {
  c,
  emitLine,
  formatIntegerText,
  isRecord,
  namedFormatter,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

const LOOTED_COLUMNS: Array<[string, string[]]> = [
  ['Item', ['item_id']],
  ['Qty', ['quantity_display']],
];

const MODULE_COLUMNS: Array<[string, string[]]> = [
  ['Name', ['name']],
  ['Type', ['type']],
  ['Type ID', ['type_id']],
  ['ID', ['id']],
];

const SKIPPED_COLUMNS: Array<[string, string[]]> = [...MODULE_COLUMNS, ['Reason', ['reason']]];

function formatLootSkillXp(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = Object.entries(value)
    .filter(([, xp]) => xp !== undefined && xp !== null && xp !== '' && xp !== 0)
    .map(([skill, xp]) => {
      const number = typeof xp === 'number' ? xp : Number(xp);
      const text = typeof xp === 'number' ? xp.toLocaleString() : String(xp);
      const signed = Number.isFinite(number) && number < 0 ? text : `+${text}`;
      return `${skill} ${signed}`;
    });
  return parts.length ? `Skill XP: ${parts.join(', ')}` : undefined;
}

function cellText(value: unknown): string {
  if (typeof value !== 'string') {
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') return String(value);
    return '';
  }
  // A newline inside a cell splits the compact-table grid.
  return value.replace(/[\r\n]+/g, ' ');
}

function emitYesNo(label: string, value: unknown): void {
  if (value !== true && value !== false) return;
  emitLine(`${label}: ${value ? 'yes' : 'no'}`);
}

function isOptionalArray(value: unknown): boolean {
  return value === undefined || Array.isArray(value);
}

function isLootWreckAll(result: Record<string, unknown>): result is Record<string, unknown> & {
  looted?: unknown[];
  looted_modules?: unknown[];
  skipped?: unknown[];
} {
  return (
    result.action === 'loot_wreck_all' &&
    isOptionalArray(result.looted) &&
    isOptionalArray(result.looted_modules) &&
    isOptionalArray(result.skipped)
  );
}

function projectLooted(row: Record<string, unknown>): Record<string, unknown> {
  return {
    item_id: cellText(row.item_id),
    quantity_display: formatIntegerText(row.quantity) ?? '',
  };
}

function projectModule(row: Record<string, unknown>): Record<string, unknown> {
  return {
    name: cellText(row.name),
    type: cellText(row.type),
    type_id: cellText(row.type_id),
    id: cellText(row.id),
  };
}

function projectSkipped(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...projectModule(row),
    reason: cellText(row.reason),
  };
}

function emitRecordTable(
  title: string,
  entries: unknown[],
  columns: Array<[string, string[]]>,
  project: (row: Record<string, unknown>) => Record<string, unknown>,
): void {
  const rows: Array<Record<string, unknown>> = [];
  let unreadable = 0;
  for (const entry of entries) {
    if (!isRecord(entry)) {
      unreadable += 1;
      continue;
    }
    rows.push(project(entry));
  }
  printCompactTable(title, rows, columns, { maxCellWidth: 48 });
  if (unreadable > 0) emitLine(`${c.dim}Unreadable ${title} rows: ${unreadable}${c.reset}`);
}

function labelForScalarKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleForScalarAction(action: unknown): string {
  if (typeof action !== 'string' || action.trim() === '') return 'Result';
  return labelForScalarKey(action);
}

function formatSingleLootWithXp(result: Record<string, unknown>, command?: string): boolean {
  if (result.action !== 'loot_wreck' || !isRecord(result.xp_gained)) return false;

  const entries = Object.entries(result).filter(
    ([key, value]) =>
      key !== 'xp_gained' &&
      value !== undefined &&
      value !== null &&
      value !== '' &&
      !isAliasCopiedDumpKey(result, key),
  );
  const maxEntries = 16;
  if (!entries.length || entries.length > maxEntries) return false;
  if (
    entries.some(([, value]) => {
      const scalar = value === null || ['string', 'number', 'boolean'].includes(typeof value);
      return !scalar && !Array.isArray(value);
    })
  ) {
    return false;
  }
  const hasActionMarker =
    typeof result.action === 'string' ||
    typeof result.success === 'boolean' ||
    typeof result.message === 'string' ||
    entries.some(([key]) => key.endsWith('_id') || key === 'id');
  if (!hasActionMarker) return false;

  emitLine(`\n${c.bright}=== ${titleForScalarAction(result.action ?? command)} ===${c.reset}`);
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      emitLine(`${labelForScalarKey(key)}: ${value.length} item(s)`);
    } else {
      emitLine(`${labelForScalarKey(key)}: ${String(value)}`);
    }
  }
  if (entries.length === 1 && result.action !== undefined) emitLine(`${c.green}OK${c.reset}`);
  const xp = formatLootSkillXp(result.xp_gained);
  if (xp) emitLine(xp);
  return true;
}

function formatLootWreckAll(result: Record<string, unknown>, command?: string): boolean {
  if (!isLootWreckAll(result)) return formatSingleLootWithXp(result, command);

  emitLine(`\n${c.bright}=== Wreck Loot ===${c.reset}`);
  emitYesNo('Wreck empty', result.wreck_empty);
  emitYesNo('Auto-docked', result.auto_docked);
  emitYesNo('Auto-undocked', result.auto_undocked);

  if (result.looted === undefined) {
    emitLine('Looted: (not in response)');
  } else {
    emitRecordTable('Looted', result.looted, LOOTED_COLUMNS, projectLooted);
  }
  if (result.looted_modules !== undefined) {
    emitRecordTable('Looted Modules', result.looted_modules, MODULE_COLUMNS, projectModule);
  }
  if (result.skipped !== undefined) {
    emitRecordTable('Skipped', result.skipped, SKIPPED_COLUMNS, projectSkipped);
  }

  if (typeof result.message === 'string' && result.message !== '') {
    emitLine(`${c.dim}${result.message}${c.reset}`);
  }
  const xp = formatLootSkillXp(result.xp_gained);
  if (xp) emitLine(xp);
  return true;
}

export const lootFormatters: ResultFormatter[] = [
  namedFormatter('loot_wreck_all', ['action', 'looted'], formatLootWreckAll, {
    commands: ['loot_wreck', 'storage_loot'],
    shapeFallback: false,
  }),
];
