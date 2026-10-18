import {
  c,
  emitLine,
  formatIntegerText,
  isRecord,
  namedFormatter,
  printCompactTable,
  type ResultFormatter,
} from './helpers.ts';

const FIND_ROUTE_KEYS = [
  'found',
  'route',
  'total_jumps',
  'target_system',
  'message',
  'fuel_per_jump',
  'estimated_fuel',
  'fuel_available',
  'cargo_used',
  'fleet_fuel',
  'target_poi',
  'target_poi_name',
] as const;

const ROUTE_COLUMNS: Array<[string, string[]]> = [
  ['System', ['system']],
  ['ID', ['id']],
  ['Jumps', ['jumps']],
  ['Wormhole', ['wormhole']],
  ['Entrance', ['entrance']],
];

const FLEET_COLUMNS: Array<[string, string[]]> = [
  ['Player', ['player']],
  ['ID', ['id']],
  ['Ship', ['ship']],
  ['Per jump', ['per_jump']],
  ['Estimated', ['estimated']],
  ['Available', ['available']],
  ['On arrival', ['on_arrival']],
  ['Can complete', ['can_complete']],
];

type RouteStatus = 'found' | 'not found' | '(omitted)' | '(invalid)';

function integerCell(value: unknown): string {
  if (value === undefined) return '(omitted)';
  if (value === null) return '(null)';
  return formatIntegerText(value) ?? '(invalid)';
}

function stringCell(value: unknown, omitted = '(omitted)'): string {
  if (value === undefined) return omitted;
  if (value === null) return '(null)';
  if (typeof value !== 'string') return '(invalid)';
  const trimmed = value.trim();
  return trimmed === '' ? '(empty)' : trimmed;
}

function trimmedText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

function claimsFindRoute(result: Record<string, unknown>): boolean {
  return FIND_ROUTE_KEYS.some((key) => Object.hasOwn(result, key));
}

function routeStatus(result: Record<string, unknown>): RouteStatus {
  const foundPresent = Object.hasOwn(result, 'found');
  const found = result.found;
  if (foundPresent && found !== true && found !== false) return '(invalid)';

  if (!Object.hasOwn(result, 'route')) {
    if (!foundPresent) return '(omitted)';
    return found === false ? 'not found' : 'found';
  }

  const route = result.route;
  if (route === null) return 'not found';
  if (Array.isArray(route)) {
    if (found === false) return 'not found';
    if (found === true) return 'found';
    return route.length === 0 ? 'not found' : 'found';
  }
  if (found === false) return 'not found';
  if (found === true) return 'found';
  return '(omitted)';
}

function foundDetail(value: unknown): string {
  if (value === null) return 'Found: (null)';
  if (typeof value === 'string') return value.trim() === '' ? 'Found: (empty)' : `Found: ${value}`;
  const text = formatIntegerText(value);
  if (text !== undefined) return `Found: ${text}`;
  return 'Found: (invalid)';
}

function travelLine(result: Record<string, unknown>): string | undefined {
  const hasName = Object.hasOwn(result, 'target_poi_name');
  const hasPoi = Object.hasOwn(result, 'target_poi');
  if (!hasName && !hasPoi) return undefined;
  const name = trimmedText(result.target_poi_name);
  const poi = trimmedText(result.target_poi);
  if (name && poi) return `Then travel: ${name} (${poi})`;
  if (name || poi) return `Then travel: ${name ?? poi}`;
  return 'Then travel: (empty)';
}

function yesNoCell(record: Record<string, unknown>, key: string): string {
  if (!Object.hasOwn(record, key)) return '';
  if (record[key] === true) return 'yes';
  if (record[key] === false) return 'no';
  return '(invalid)';
}

function entranceCell(step: Record<string, unknown>): string {
  const present = Object.hasOwn(step, 'entrance_poi');
  if (step.via_wormhole === true && (!present || step.entrance_poi === null)) return '(missing)';
  if (!present) return '';
  return stringCell(step.entrance_poi, '');
}

function projectStep(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return { system: '(invalid)', id: '', jumps: '', wormhole: '', entrance: '' };
  }
  return {
    system: stringCell(value.name, ''),
    id: stringCell(value.system_id, ''),
    jumps: integerCell(value.jumps),
    wormhole: yesNoCell(value, 'via_wormhole'),
    entrance: entranceCell(value),
  };
}

function fleetIdentity(value: unknown): string {
  if (value === undefined || value === '') return '';
  if (value === null) return '(null)';
  return typeof value === 'string' ? value : '(invalid)';
}

function projectFleetMember(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {
      player: '(invalid)',
      id: '',
      ship: '',
      per_jump: '',
      estimated: '',
      available: '',
      on_arrival: '',
      can_complete: '',
    };
  }
  return {
    player: fleetIdentity(value.username),
    id: fleetIdentity(value.player_id),
    ship: fleetIdentity(value.ship_class),
    per_jump: integerCell(value.fuel_per_jump),
    estimated: integerCell(value.estimated_fuel),
    available: integerCell(value.fuel_available),
    on_arrival: integerCell(value.fuel_on_arrival),
    can_complete: yesNoCell(value, 'can_complete'),
  };
}

function emitFleet(value: unknown): void {
  if (value === null) {
    emitLine('Fleet fuel: (null)');
    return;
  }
  if (!Array.isArray(value)) {
    emitLine('Fleet fuel: (invalid)');
    return;
  }
  if (value.length === 0) {
    emitLine('Fleet fuel: (none)');
    return;
  }
  printCompactTable('Fleet Fuel', value.map(projectFleetMember), FLEET_COLUMNS, { maxCellWidth: 64 });
}

function emitHop(result: Record<string, unknown>, status: RouteStatus): void {
  if (!Object.hasOwn(result, 'route')) {
    emitLine('Steps: (omitted)');
    return;
  }
  const route = result.route;
  if (route === null) return;
  if (!Array.isArray(route)) {
    emitLine('Steps: (invalid)');
    return;
  }
  if (route.length > 0 && (status === 'found' || status === '(invalid)')) {
    printCompactTable('Route', route.map(projectStep), ROUTE_COLUMNS, { maxCellWidth: 64 });
    const first = route[0];
    if (isRecord(first) && first.via_wormhole === true) {
      emitLine('Wormhole on the first step has no previous system.');
    }
    return;
  }
  if (route.length === 0) {
    emitLine(status === 'found' ? 'Steps: (none)' : 'Steps: 0');
    return;
  }
  emitLine(`Steps: ${route.length}`);
}

function emitFoundLine(result: Record<string, unknown>): void {
  if (!Object.hasOwn(result, 'found')) return;
  const found = result.found;
  const routeNull = Object.hasOwn(result, 'route') && result.route === null;
  if (found === true && routeNull) {
    emitLine('Found: true');
    return;
  }
  if (found !== true && found !== false) emitLine(foundDetail(found));
}

function emitMessage(value: unknown): void {
  if (typeof value === 'string' && value) emitLine(`${c.dim}${value}${c.reset}`);
}

function formatFindRoute(result: Record<string, unknown>): boolean {
  if (!claimsFindRoute(result)) return false;
  const status = routeStatus(result);
  emitLine(`Route: ${status}`);
  emitFoundLine(result);
  emitLine(`Target: ${stringCell(result.target_system)}`);
  emitLine(`Total jumps: ${integerCell(result.total_jumps)}`);
  emitLine(`Fuel per jump: ${integerCell(result.fuel_per_jump)}`);
  emitLine(`Estimated fuel: ${integerCell(result.estimated_fuel)}`);
  emitLine(`Fuel available: ${integerCell(result.fuel_available)}`);
  emitLine(`Cargo used: ${integerCell(result.cargo_used)}`);
  const travel = travelLine(result);
  if (travel) emitLine(travel);
  emitHop(result, status);
  if (Object.hasOwn(result, 'fleet_fuel')) emitFleet(result.fleet_fuel);
  emitMessage(result.message);
  return true;
}

export const findRouteFormatters: ResultFormatter[] = [
  namedFormatter('find_route', ['found', 'route', 'fuel_per_jump'], formatFindRoute, {
    commands: ['find_route'],
    suppressShapeFallbackOnDecline: true,
  }),
];
