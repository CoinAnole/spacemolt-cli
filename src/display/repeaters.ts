import { c, emitLine, isRecord } from './helpers.ts';

function labelText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

function finiteText(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

function ratioSegment(label: string, current: unknown, max: unknown): string {
  const currentAbsent = current === undefined || current === null;
  const maxAbsent = max === undefined || max === null;
  if (currentAbsent && maxAbsent) return '';
  return ` - ${label} ${finiteText(current) ?? '?'}/${finiteText(max) ?? '?'}`;
}

function battleSegment(value: unknown): string {
  if (value === true) return ' - in battle yes';
  if (value === false) return ' - in battle no';
  return '';
}

function formatRepeaterLine(row: Record<string, unknown>): string {
  const id = labelText(row.repeater_id);
  const name = labelText(row.name) ?? id ?? 'Unknown';
  const shipClass = labelText(row.ship_class);
  const classText = shipClass ? ` (${shipClass})` : '';
  const idSuffix = id && id !== name ? ` [${id}]` : '';
  return `${name}${classText}${ratioSegment('hull', row.hull, row.max_hull)}${ratioSegment('shield', row.shield, row.max_shield)}${battleSegment(row.in_battle)}${idSuffix}`;
}

/** A missing or non-finite count is not a total. Count 0 with an empty list prints nothing. */
export function emitRepeaterSection(repeaters: unknown, repeaterCount: unknown, title: string): boolean {
  const rows = Array.isArray(repeaters) ? repeaters.filter(isRecord) : [];
  const finiteCount =
    typeof repeaterCount === 'number' && finiteText(repeaterCount) !== undefined ? repeaterCount : undefined;
  const headerCount = finiteCount !== undefined && finiteCount >= rows.length ? finiteCount : rows.length;
  const show = rows.length > 0 || (finiteCount !== undefined && finiteCount > 0);
  if (!show) return false;
  emitLine(`\n${c.yellow}${title} (${headerCount}):${c.reset}`);
  for (const row of rows) emitLine(`  ${formatRepeaterLine(row)}`);
  if (finiteCount !== undefined && finiteCount > rows.length) {
    emitLine(`  ... and ${finiteCount - rows.length} more`);
  }
  return true;
}
