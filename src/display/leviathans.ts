import { rawColors } from './ansi.ts';
import { colorText, emitLine, isRecord } from './helpers.ts';

export function emitLeviathanContacts(leviathans: unknown, title: string): boolean {
  if (!Array.isArray(leviathans)) return false;
  const rows = leviathans.filter(isRecord);
  if (rows.length === 0) return false;
  emitLine(`\n${colorText(`${title} (${rows.length}):`, rawColors.red)}`);
  for (const row of rows) emitLine(`  ${formatLeviathanContactLine(row)}`);
  return true;
}

function trimmedIdentity(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function hullSide(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '?';
}

function formatLeviathanContactLine(row: Record<string, unknown>): string {
  const id = trimmedIdentity(row.leviathan_id);
  const name = trimmedIdentity(row.name) ?? id ?? 'Unknown';
  const species = trimmedIdentity(row.species);
  const stage = trimmedIdentity(row.stage);
  let aggressive = '';
  if (row.aggressive === true) aggressive = ' - aggressive';
  else if (row.aggressive === false) aggressive = ' - not aggressive';
  const combat = row.in_combat === true ? ' - in combat' : '';
  const identity = `${name}${id ? ` [${id}]` : ''}${species ? ` (${species})` : ''}${stage ? ` - ${stage}` : ''}`;
  return `${identity} - hull ${hullSide(row.hull)}/${hullSide(row.max_hull)}${aggressive}${combat}`;
}
