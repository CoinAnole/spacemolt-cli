import { c, emitLine, isRecord, printCompactTable } from './helpers.ts';

const PRIZE_TABLE_LIMIT = 10;

export function emitNearbyPrizes(args: { prizes: unknown; prizeCount?: unknown; title?: string }): boolean {
  const prizes = Array.isArray(args.prizes) ? args.prizes.filter(isRecord) : [];
  const count =
    typeof args.prizeCount === 'number' && Number.isFinite(args.prizeCount) ? args.prizeCount : prizes.length;
  if (count <= 0 && prizes.length === 0) return false;

  const title = args.title ?? 'Prizes';
  const rows = prizes.slice(0, PRIZE_TABLE_LIMIT).map(projectNearbyPrize);
  emitLine(`\n${c.bright}${title} (${count}):${c.reset}`);
  if (rows.length) printCompactTable(title, rows, nearbyPrizeColumns(rows));
  if (count > PRIZE_TABLE_LIMIT) emitLine(`  ... and ${count - PRIZE_TABLE_LIMIT} more`);
  return true;
}

function hasAnyField(rows: Array<Record<string, unknown>>, fields: string[]): boolean {
  return rows.some((row) =>
    fields.some((field) => row[field] !== undefined && row[field] !== null && row[field] !== ''),
  );
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value) return value;
  return undefined;
}

function ratioDisplay(current: unknown, max: unknown): string | undefined {
  const left = scalarText(current);
  const right = scalarText(max);
  if (left === undefined && right === undefined) return undefined;
  return `${left ?? '?'}/${right ?? '?'}`;
}

function projectNearbyPrize(prize: Record<string, unknown>): Record<string, unknown> {
  return {
    prize_id: prize.prize_id,
    actor_id: prize.actor_id,
    ship_name: prize.ship_name,
    ship_class: prize.ship_class,
    status: prize.status,
    wait_reason: prize.wait_reason,
    hull_display: ratioDisplay(prize.hull, prize.max_hull),
    shield_display: ratioDisplay(prize.shield, prize.max_shield),
    combat_display: prize.in_combat === true ? 'yes' : '',
    in_combat: prize.in_combat,
  };
}

function nearbyPrizeColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [['Prize ID', ['prize_id']]];
  if (hasAnyField(rows, ['actor_id'])) columns.push(['Actor', ['actor_id']]);
  if (hasAnyField(rows, ['ship_name'])) columns.push(['Name', ['ship_name']]);
  columns.push(['Class', ['ship_class']], ['Status', ['status']]);
  if (hasAnyField(rows, ['wait_reason'])) columns.push(['Wait', ['wait_reason']]);
  if (hasAnyField(rows, ['hull_display'])) columns.push(['Hull', ['hull_display']]);
  if (hasAnyField(rows, ['shield_display'])) columns.push(['Shield', ['shield_display']]);
  if (hasAnyField(rows, ['in_combat'])) columns.push(['Combat', ['combat_display']]);
  return columns;
}
