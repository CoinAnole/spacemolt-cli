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
  _command: string,
  result: Record<string, unknown>,
): Record<string, unknown> {
  return result;
}
