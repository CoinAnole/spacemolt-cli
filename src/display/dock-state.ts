function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Non-empty strings only. Never `String(null)`, never numbers. */
function scalar(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

export function formatNameId(name: string | undefined, id: string | undefined): string | undefined {
  if (!name) return id;
  if (!id || id === name) return name;
  return `${name} (${id})`;
}

/**
 * One human line for a post-mutation dock-state delta.
 * `docked_at === undefined` → skip (not a dock-state payload).
 * `docked_at === null` or empty string → undocked.
 * non-empty string → docked at that base id.
 */
export function formatDockStateLine(location: unknown): string | undefined {
  if (!isRecord(location) || location.docked_at === undefined) return undefined;

  const poiName = scalar(location.poi_name) ?? scalar(location.poi) ?? scalar(location.station_name);
  const poiId = scalar(location.poi_id) ?? scalar(location.station_id);
  const systemName = scalar(location.system_name);
  const systemId = scalar(location.system_id);

  if (typeof location.docked_at === 'string') {
    const dockedId = scalar(location.docked_at);
    if (dockedId) {
      const station = formatNameId(poiName, dockedId) ?? dockedId;
      return `Docked at: ${station}`;
    }
  }

  const poi = formatNameId(poiName, poiId);
  const system = formatNameId(systemName, systemId);
  const where = [poi, system].filter(Boolean).join(', ');
  return where ? `Undocked at: ${where}` : 'Undocked';
}

/** Flattened detailsViewModel fallback when sibling `location` is absent. */
export function locationFromAliasedDetails(details: Record<string, unknown>): Record<string, unknown> | undefined {
  if (details.docked_at === undefined) return undefined;
  return {
    docked_at: details.docked_at,
    poi_name: details.poi_name ?? details.poi ?? details.station_name ?? details.base_name,
    poi_id: details.poi_id ?? details.station_id,
    system_name: details.system_name,
    system_id: details.system_id,
  };
}

export const LOCATION_ALIAS_COPIES: ReadonlyArray<{ dest: string; source: string; requiresDockedAt?: boolean }> = [
  { dest: 'system_id', source: 'system_id' },
  { dest: 'system_name', source: 'system_name' },
  { dest: 'poi_id', source: 'poi_id' },
  { dest: 'poi', source: 'poi_name' },
  { dest: 'poi_name', source: 'poi_name' },
  { dest: 'docked_at', source: 'docked_at', requiresDockedAt: true },
  { dest: 'station_id', source: 'docked_at', requiresDockedAt: true },
  { dest: 'station_name', source: 'poi_name', requiresDockedAt: true },
  { dest: 'base_id', source: 'docked_at', requiresDockedAt: true },
  { dest: 'base_name', source: 'poi_name', requiresDockedAt: true },
  { dest: 'online_players', source: 'nearby_players' },
  { dest: 'online_players_count', source: 'nearby_player_count' },
];

/** Dest-key set for skipping aliased location fields in scalar dumps. */
export const LOCATION_ALIAS_DUMP_KEYS = new Set(LOCATION_ALIAS_COPIES.map((row) => row.dest));
