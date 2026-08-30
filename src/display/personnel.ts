import { c, emitLine, finiteNumber, isRecord } from './helpers.ts';

const PERSONNEL_SCALARS = [
  'effective_crew_capacity',
  'effective_marine_capacity',
  'minimum_crew',
  'crew_efficiency',
  'operational_speed',
  'incapacitated',
  'personnel_recovery_tick',
  'personnel_recovery_ticks_remaining',
] as const;

export interface PersonnelEmitOptions {
  indent?: string;
}

function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== '';
}

function formatCrewEfficiency(value: unknown): string | undefined {
  const number = finiteNumber(value);
  if (number === undefined) return undefined;
  const pct = Math.abs(number) <= 1 ? number * 100 : number;
  return `${Number.isInteger(pct) ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

function formatSpeed(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toString();
}

function occupancyCount(value: unknown, personnelPresent: boolean): string | undefined {
  const number = finiteNumber(value);
  if (number !== undefined) return String(number);
  return personnelPresent ? '?' : undefined;
}

function emitComplementLine(args: {
  indent: string;
  label: string;
  fit: unknown;
  capacity: unknown;
  injured: unknown;
  min?: unknown;
  personnelPresent: boolean;
  shouldEmit: boolean;
}): boolean {
  if (!args.shouldEmit) return false;
  const fitText = occupancyCount(args.fit, args.personnelPresent);
  const capacityText = occupancyCount(args.capacity, args.personnelPresent);
  const injuredCount = finiteNumber(args.injured);
  const minCount = finiteNumber(args.min);
  if (fitText === undefined && capacityText === undefined && minCount === undefined) {
    if (injuredCount === undefined || injuredCount <= 0) return false;
  }

  const parts = [`${args.label}: ${fitText ?? '?'}/${capacityText ?? '?'} fit`];
  if (injuredCount !== undefined && injuredCount > 0) parts.push(`${injuredCount} injured`);
  let line = parts.join(', ');
  if (minCount !== undefined) line += ` (min ${minCount})`;
  emitLine(`${args.indent}${line}`);
  return true;
}

export function formatCrewRatio(ship: Record<string, unknown>): string | undefined {
  if (!isRecord(ship.personnel)) return undefined;
  const fit = finiteNumber(ship.personnel.fit_crew);
  const capacity = finiteNumber(ship.effective_crew_capacity);
  if (fit === undefined || capacity === undefined) return undefined;
  return `${fit}/${capacity}`;
}

export function emitShipPersonnel(ship: Record<string, unknown>, options?: PersonnelEmitOptions): boolean {
  const personnel = isRecord(ship.personnel) ? ship.personnel : undefined;
  const hasScalars = PERSONNEL_SCALARS.some((key) => isPresent(ship[key]));
  if (!personnel && !hasScalars) return false;

  const indent = options?.indent ?? '';
  let emitted = false;

  const personnelPresent = Boolean(personnel);
  if (
    emitComplementLine({
      indent,
      label: 'Crew',
      fit: personnel?.fit_crew,
      capacity: ship.effective_crew_capacity,
      injured: personnel?.injured_crew,
      min: ship.minimum_crew,
      personnelPresent,
      shouldEmit:
        personnelPresent &&
        (isPresent(personnel?.fit_crew) ||
          isPresent(personnel?.injured_crew) ||
          isPresent(ship.effective_crew_capacity) ||
          isPresent(ship.minimum_crew)),
    })
  ) {
    emitted = true;
  }
  if (
    emitComplementLine({
      indent,
      label: 'Marines',
      fit: personnel?.fit_marines,
      capacity: ship.effective_marine_capacity,
      injured: personnel?.injured_marines,
      personnelPresent,
      shouldEmit:
        personnelPresent &&
        (isPresent(personnel?.fit_marines) ||
          isPresent(personnel?.injured_marines) ||
          isPresent(ship.effective_marine_capacity)),
    })
  ) {
    emitted = true;
  }

  const efficiency = formatCrewEfficiency(ship.crew_efficiency);
  if (efficiency !== undefined) {
    emitLine(`${indent}Efficiency: ${efficiency}`);
    emitted = true;
  }

  const operational = finiteNumber(ship.operational_speed);
  if (operational !== undefined) {
    const base = finiteNumber(ship.speed);
    const suffix = base !== undefined && base !== operational ? ` (base ${formatSpeed(base)})` : '';
    emitLine(`${indent}Operational speed: ${formatSpeed(operational)}${suffix}`);
    emitted = true;
  }

  if (ship.incapacitated === true) {
    emitLine(`${indent}${c.yellow}INCAPACITATED: no fit crew — ship operations unavailable${c.reset}`);
    emitted = true;
  }

  const remaining = finiteNumber(ship.personnel_recovery_ticks_remaining);
  if (remaining !== undefined) {
    const tick = finiteNumber(ship.personnel_recovery_tick);
    const tickText = tick === undefined ? '' : ` (tick ${tick})`;
    emitLine(`${indent}Survivor recovery: ${remaining} ticks${tickText}`);
    emitted = true;
  }

  return emitted;
}
