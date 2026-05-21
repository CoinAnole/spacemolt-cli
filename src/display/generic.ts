import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

function formatRecordEntries(value: Record<string, unknown>, suffix = ''): string {
  return Object.entries(value)
    .filter(([, entry]) => entry !== undefined && entry !== null && entry !== '' && entry !== 0)
    .map(([key, entry]) => `${key}${suffix} +${entry}`)
    .join(', ');
}

function summarizeProgress(objective: Record<string, unknown>): string {
  const progress = objective.progress;
  if (isRecord(progress)) {
    const current = progress.current ?? progress.completed ?? progress.amount ?? progress.count ?? progress.progress;
    const target = progress.required ?? progress.target ?? progress.total ?? progress.quantity;
    if (current !== undefined && target !== undefined) return `${current}/${target}`;
  }

  const current =
    objective.current ??
    objective.completed ??
    objective.amount ??
    objective.count ??
    objective.progress ??
    objective.delivered;
  const target =
    objective.required ?? objective.target_quantity ?? objective.target_count ?? objective.total ?? objective.quantity;
  if (current !== undefined && target !== undefined) return `${current}/${target}`;
  if (typeof progress === 'string' || typeof progress === 'number' || typeof progress === 'boolean')
    return String(progress);
  return '';
}

function summarizeObjective(objective: unknown): string {
  if (!isRecord(objective)) return String(objective);
  const description = objective.description ?? objective.title ?? objective.type;
  const target =
    objective.target ??
    objective.target_name ??
    objective.target_username ??
    objective.target_base_name ??
    objective.system_name ??
    objective.item_id;
  const parts = [description, isRecord(target) ? (target.name ?? target.id) : target, summarizeProgress(objective)]
    .filter((part) => part !== undefined && part !== null && part !== '')
    .map(String);
  return parts.join(' ');
}

function summarizeRewards(rewards: unknown): string {
  if (!isRecord(rewards)) return '';
  const parts: string[] = [];
  if (rewards.credits !== undefined && rewards.credits !== null && rewards.credits !== 0)
    parts.push(`${rewards.credits} cr`);
  if (isRecord(rewards.skill_xp)) {
    const xp = formatRecordEntries(rewards.skill_xp, ' XP');
    if (xp) parts.push(xp);
  }
  if (isRecord(rewards.items)) {
    const items = Object.entries(rewards.items)
      .filter(([, quantity]) => quantity !== undefined && quantity !== null && quantity !== '' && quantity !== 0)
      .map(([item, quantity]) => `${item} x${quantity}`)
      .join(', ');
    if (items) parts.push(items);
  }
  if (rewards.reputation !== undefined && rewards.reputation !== null && rewards.reputation !== 0)
    parts.push(`rep +${rewards.reputation}`);
  if (rewards.pirate_rep !== undefined && rewards.pirate_rep !== null && rewards.pirate_rep !== 0)
    parts.push(`pirate rep +${rewards.pirate_rep}`);
  return parts.join('; ');
}

function activeMissionRows(result: Record<string, unknown>): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(result.active_missions)) return result.active_missions.filter(isRecord);
  if (Array.isArray(result.active)) return result.active.filter(isRecord);
  const missions = result.missions;
  if (Array.isArray(missions)) return missions.filter(isRecord);
  if (isRecord(missions) && Array.isArray(missions.active)) return missions.active.filter(isRecord);
  return undefined;
}

function activeMissionCapacity(result: Record<string, unknown>, missionCount: number): string | undefined {
  const missions = result.missions;
  const maxMissions = isRecord(missions) ? missions.max_missions : result.max_missions;
  return maxMissions === undefined ? undefined : `${missionCount}/${maxMissions}`;
}

const GENERIC_LIST_KEYS = [
  'items',
  'missions',
  'factions',
  'facilities',
  'facility_types',
  'types',
  'ships',
  'orders',
  'notes',
  'threads',
  'results',
] as const;

const GENERIC_LIST_COLUMNS: Array<[string, string[]]> = [
  ['Name', ['name', 'title', 'item_name', 'ship_name', 'class_name', 'type_name', 'leader_username']],
  [
    'ID',
    [
      'id',
      'item_id',
      'mission_id',
      'faction_id',
      'facility_id',
      'type_id',
      'ship_id',
      'order_id',
      'note_id',
      'thread_id',
    ],
  ],
  ['Type', ['type', 'category', 'class_id', 'rarity', 'side', 'status']],
  ['Qty', ['quantity', 'remaining', 'count', 'member_count']],
  ['Value', ['price_each', 'price', 'base_value', 'difficulty', 'level', 'tier', 'size']],
  ['Owner', ['owner_name', 'seller_name', 'leader_username', 'empire', 'faction_tag']],
];

const GENERIC_LIST_COLUMNS_BY_KEY: Record<string, Array<[string, string[]]>> = {
  factions: [
    ['Name', ['name']],
    ['Tag', ['tag', 'faction_tag']],
    ['Members', ['member_count']],
    ['Leader', ['leader_username']],
    ['Bases', ['owned_bases']],
    ['ID', ['id', 'faction_id']],
  ],
  items: [
    ['Name', ['name', 'item_name']],
    ['ID', ['id', 'item_id']],
    ['Category', ['category', 'type']],
    ['Rarity', ['rarity']],
    ['Value', ['base_value', 'price_each', 'price']],
    ['Size', ['size']],
  ],
  missions: [
    ['Title', ['title', 'name']],
    ['ID', ['mission_id', 'id']],
    ['Type', ['type']],
    ['Difficulty', ['difficulty']],
  ],
};

function hasScalarValue(row: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => {
    const value = row[key];
    return value !== undefined && value !== null && value !== '' && !isRecord(value) && !Array.isArray(value);
  });
}

function scalarColumns(
  rows: Array<Record<string, unknown>>,
  candidates: Array<[string, string[]]>,
): Array<[string, string[]]> {
  return candidates.filter(([, keys]) => rows.some((row) => hasScalarValue(row, keys)));
}

function printMetadata(result: Record<string, unknown>): void {
  const parts: string[] = [];
  if (result.page !== undefined && result.total_pages !== undefined)
    parts.push(`page ${result.page}/${result.total_pages}`);
  if (result.page_size !== undefined) parts.push(`page size ${result.page_size}`);
  if (result.limit !== undefined) parts.push(`limit ${result.limit}`);
  if (result.offset !== undefined) parts.push(`offset ${result.offset}`);
  const total = result.total ?? result.total_count;
  if (total !== undefined) parts.push(`total ${total}`);
  if (parts.length) emitLine(`${c.dim}${parts.join(' | ')}${c.reset}`);
}

function titleForListKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export const genericFormatters = [
  formatter(
    (r) => {
      const missions = activeMissionRows(r);
      if (!missions) return false;

      const rows = missions.map((mission) => ({
        ...mission,
        objectives_summary: Array.isArray(mission.objectives)
          ? mission.objectives.map(summarizeObjective).filter(Boolean).join('; ')
          : '',
        rewards_summary: summarizeRewards(mission.rewards),
      }));

      printCompactTable(
        'Active Missions',
        rows,
        [
          ['Title', ['title', 'name']],
          ['ID', ['mission_id', 'id']],
          ['Type', ['type']],
          ['Difficulty', ['difficulty']],
          ['Objectives', ['objectives_summary']],
          ['Rewards', ['rewards_summary']],
          ['Expires', ['expires_in_ticks', 'expiry_ticks', 'ticks_remaining']],
        ],
        { maxCellWidth: 64 },
      );

      const capacity = activeMissionCapacity(r, missions.length);
      if (capacity) emitLine(`${c.dim}missions ${capacity}${c.reset}`);
      return true;
    },
    { commands: ['get_active_missions'] },
  ),

  // Generic table fallback for common list-shaped responses.
  formatter(
    (r) => {
      const matches = GENERIC_LIST_KEYS.filter((key) => Array.isArray(r[key]));
      if (matches.length !== 1) return false;

      const key = matches[0];
      if (!key) return false;
      const rows = r[key] as unknown[];
      if (!rows.every(isRecord)) return false;
      const recordRows = rows as Array<Record<string, unknown>>;
      const columnCandidates = GENERIC_LIST_COLUMNS_BY_KEY[key] ?? GENERIC_LIST_COLUMNS;
      const columns = scalarColumns(recordRows, columnCandidates);
      if (recordRows.length > 0 && columns.length < 2) return false;

      const title = typeof r.type === 'string' && key === 'items' ? titleForListKey(r.type) : titleForListKey(key);
      printCompactTable(title, recordRows, columns.length ? columns : [['ID', ['id']]]);
      printMetadata(r);
      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { shapeFallback: true },
  ),

  // Simple message
  formatter(
    (r) => {
      if (!r.message || Object.keys(r).length > 2) return false;
      emitLine(`${c.green}OK:${c.reset} ${r.message}`);
      return true;
    },
    { shapeFallback: true },
  ),
];
