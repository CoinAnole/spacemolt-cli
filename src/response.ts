import type { APIResponse } from './types.ts';

export function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function getFieldValue(obj: unknown, path: string): unknown {
  if (!path || typeof obj !== 'object' || obj === null) return undefined;

  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      current = Number.isNaN(index) ? undefined : current[index];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

export function extractFields(data: Record<string, unknown>, paths: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const path of paths) {
    const value = getFieldValue(data, path);
    if (value !== undefined) {
      result[path] = value;
    }
  }
  return result;
}

export function getStructuredResult(response: APIResponse): Record<string, unknown> | undefined {
  return isRecord(response.structuredContent) ? response.structuredContent : undefined;
}

export function getObjectResult(response: APIResponse): Record<string, unknown> | undefined {
  return isRecord(response.result) ? response.result : undefined;
}

export function normalizeStructuredResultForDisplay(result: Record<string, unknown>): Record<string, unknown> {
  const view = structuredClone(result);
  const loc = view.location as Record<string, unknown> | undefined;
  if (loc && !view.system) {
    view.system = { id: loc.system_id, name: loc.system_name };
  }
  if (loc && !view.poi) {
    view.poi = { id: loc.poi_id, name: loc.poi_name, base_name: loc.poi_id };
  }
  if (loc && view.player) {
    const p = view.player as Record<string, unknown>;
    if (p.current_system === undefined) p.current_system = loc.system_name;
    if (p.current_poi === undefined) p.current_poi = loc.poi_name;
    if (p.docked_at_base === undefined && loc.docked_at) p.docked_at_base = loc.docked_at;
  }
  if (loc?.nearby_players && !view.nearby) {
    view.nearby = loc.nearby_players;
  }
  return view;
}

export function normalizeStructuredResultForOutput(
  command: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  const limited = limitStructuredNearbyForOutput(command, result);
  if (normalizeCommandName(command) === 'list_ships') return normalizeListShipsForOutput(limited);
  return limited;
}

const STRUCTURED_NEARBY_LIMIT = 10;
const NEARBY_LIMITED_COMMANDS = new Set(['get_location', 'get_nearby', 'get_status']);

export function limitStructuredNearbyForOutput(
  command: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  if (!NEARBY_LIMITED_COMMANDS.has(command)) return result;

  const view = structuredClone(result);
  limitNearbyArrays(view);

  const location = view.location;
  if (isRecord(location)) limitNearbyArrays(location);

  return view;
}

function limitNearbyArrays(container: Record<string, unknown>): void {
  limitArray(container, 'nearby_players', 'nearby_player_count');
  limitArray(container, 'nearby', 'nearby_player_count', ['count']);
  limitArray(container, 'players', 'nearby_player_count', ['count']);
  limitArray(container, 'nearby_empire_npcs', 'nearby_empire_npc_count');
  limitArray(container, 'empire_npcs', 'nearby_empire_npc_count', ['empire_npc_count']);
}

function limitArray(
  container: Record<string, unknown>,
  arrayKey: string,
  countKey: string,
  countAliases: string[] = [],
): void {
  const value = container[arrayKey];
  if (!Array.isArray(value) || value.length <= STRUCTURED_NEARBY_LIMIT) return;

  if (container[countKey] === undefined) {
    container[countKey] = findExistingCount(container, countAliases) ?? value.length;
  }
  container[arrayKey] = value.slice(0, STRUCTURED_NEARBY_LIMIT);
}

function findExistingCount(container: Record<string, unknown>, countAliases: string[]): number | undefined {
  for (const key of countAliases) {
    const value = container[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function normalizeCommandName(command: string): string {
  return command.startsWith('v2_') ? command.slice(3) : command;
}

function normalizeListShipsForOutput(result: Record<string, unknown>): Record<string, unknown> {
  if (!Array.isArray(result.ships)) return result;

  const view = structuredClone(result);
  view.ships = result.ships.map((ship) => (isRecord(ship) ? normalizeListedShip(ship) : ship));
  return view;
}

function normalizeListedShip(ship: Record<string, unknown>): Record<string, unknown> {
  const customName = stringOrNull(ship.custom_name ?? ship.ship_name);
  return {
    ...ship,
    ship_class: ship.ship_class ?? ship.class_id ?? ship.class_name ?? null,
    custom_name: customName,
    name: ship.name ?? customName,
    active: booleanOrDefault(ship.active ?? ship.is_active, false),
    location: normalizeListedShipLocation(ship),
  };
}

function normalizeListedShipLocation(ship: Record<string, unknown>): Record<string, unknown> {
  const location = isRecord(ship.location) ? ship.location : {};
  const baseId = ship.location_base_id ?? ship.base_id ?? ship.poi_id ?? location.poi_id;
  const docked = booleanOrDefault(ship.docked ?? ship.is_docked ?? location.docked, baseId !== undefined);
  return {
    system_id: location.system_id ?? ship.system_id ?? null,
    poi_id: location.poi_id ?? baseId ?? null,
    docked,
    raw: typeof ship.location === 'string' ? ship.location : null,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function booleanOrDefault(value: unknown, defaultValue: boolean): boolean {
  return typeof value === 'boolean' ? value : defaultValue;
}
