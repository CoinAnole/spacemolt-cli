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

function hasTransitFields(prize: Record<string, unknown>): boolean {
  return [
    'transit_kind',
    'transit_from_system_id',
    'transit_to_system_id',
    'transit_from_poi_id',
    'transit_to_poi_id',
  ].some((field) => prize[field] !== undefined && prize[field] !== null && prize[field] !== '');
}

function formatPrizeTransit(prize: Record<string, unknown>): string | undefined {
  const kind = typeof prize.transit_kind === 'string' && prize.transit_kind ? prize.transit_kind : undefined;
  const fromSystem = scalarText(prize.transit_from_system_id);
  const toSystem = scalarText(prize.transit_to_system_id);
  const fromPoi = scalarText(prize.transit_from_poi_id);
  const toPoi = scalarText(prize.transit_to_poi_id);
  const preferPoi = kind === 'travel';
  const preferSystem =
    kind === 'jump' || (!preferPoi && (kind !== undefined || fromSystem !== undefined || toSystem !== undefined));

  const from = preferPoi ? (fromPoi ?? fromSystem) : preferSystem ? (fromSystem ?? fromPoi) : (fromPoi ?? fromSystem);
  const to = preferPoi ? (toPoi ?? toSystem) : preferSystem ? (toSystem ?? toPoi) : (toPoi ?? toSystem);

  if (kind && from && to) return `${kind} ${from} → ${to}`;
  if (kind && to) return `${kind} → ${to}`;
  if (kind && from) return `${kind} ${from}`;
  if (from && to) return `${from} → ${to}`;
  if (kind) return kind;
  return from ?? to;
}

function shipDisplay(prize: Record<string, unknown>): string | undefined {
  const name = typeof prize.ship_name === 'string' && prize.ship_name ? prize.ship_name : undefined;
  const shipClass = typeof prize.ship_class === 'string' && prize.ship_class ? prize.ship_class : undefined;
  if (name && shipClass && name !== shipClass) return `${name} (${shipClass})`;
  return name ?? shipClass;
}

function crewDisplay(prize: Record<string, unknown>): string | undefined {
  const fit = scalarText(prize.prize_crew_fit);
  const disposition =
    typeof prize.crew_disposition === 'string' && prize.crew_disposition ? prize.crew_disposition : undefined;
  const parts = [fit, disposition].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' ') : undefined;
}

function locationDisplay(prize: Record<string, unknown>): string | undefined {
  if (hasTransitFields(prize)) return formatPrizeTransit(prize);
  const parts = [scalarText(prize.system_id), scalarText(prize.poi_id)].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(' / ') : undefined;
}

function projectPrizeRecovery(prize: Record<string, unknown>): Record<string, unknown> {
  return {
    prize_id: prize.prize_id,
    ship_display: shipDisplay(prize),
    status: prize.status,
    destination_base_id: prize.destination_base_id,
    crew_display: crewDisplay(prize),
    hull_display: ratioDisplay(prize.hull, prize.max_hull),
    fuel_display: ratioDisplay(prize.fuel, prize.max_fuel),
    location_display: locationDisplay(prize),
    transit_arrival_tick: prize.transit_arrival_tick,
    wait_reason: prize.wait_reason,
  };
}

function recoveryColumns(rows: Array<Record<string, unknown>>): Array<[string, string[]]> {
  const columns: Array<[string, string[]]> = [['Prize ID', ['prize_id']]];
  if (hasAnyField(rows, ['ship_display'])) columns.push(['Ship', ['ship_display']]);
  columns.push(['Status', ['status']]);
  if (hasAnyField(rows, ['destination_base_id'])) columns.push(['Destination', ['destination_base_id']]);
  if (hasAnyField(rows, ['crew_display'])) columns.push(['Crew', ['crew_display']]);
  if (hasAnyField(rows, ['hull_display'])) columns.push(['Hull', ['hull_display']]);
  if (hasAnyField(rows, ['fuel_display'])) columns.push(['Fuel', ['fuel_display']]);
  if (hasAnyField(rows, ['location_display'])) columns.push(['Location', ['location_display']]);
  if (hasAnyField(rows, ['transit_arrival_tick'])) columns.push(['Arrival', ['transit_arrival_tick']]);
  if (hasAnyField(rows, ['wait_reason'])) columns.push(['Wait', ['wait_reason']]);
  return columns;
}

export function emitPrizeRecoveries(recoveries: unknown): boolean {
  if (!Array.isArray(recoveries) || recoveries.length === 0) return false;
  const rows = recoveries.filter(isRecord).map(projectPrizeRecovery);
  if (!rows.length) return false;
  printCompactTable('Prize recoveries', rows, recoveryColumns(rows));
  return true;
}
