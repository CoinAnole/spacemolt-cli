import { catalogTruncationWarning } from '../catalog-pagination.ts';
import { summarizeAmmoEffects } from './combat-effects.ts';
import { c, emitLine, finiteNumber, firstArray, formatter, isRecord, printCompactTable } from './helpers.ts';

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

function formatCount(value: unknown): string | undefined {
  const number = finiteNumber(value);
  if (number === undefined) return undefined;
  return number.toLocaleString();
}

function countFromFieldOrArray(
  result: Record<string, unknown>,
  countField: string,
  arrayField: string,
): string | undefined {
  const count = formatCount(result[countField]);
  if (count !== undefined) return count;
  const value = result[arrayField];
  return Array.isArray(value) ? value.length.toLocaleString() : undefined;
}

function sumNumericRecord(value: unknown): number | undefined {
  if (!isRecord(value)) return undefined;
  let total = 0;
  let hasValue = false;
  for (const entry of Object.values(value)) {
    const number = finiteNumber(entry);
    if (number === undefined) continue;
    total += number;
    hasValue = true;
  }
  return hasValue ? total : undefined;
}

function emitDockSummaryLine(label: string, value: string | undefined, suffix = ''): void {
  if (value === undefined) return;
  emitLine(`${label}: ${value}${suffix}`);
}

const GENERIC_LIST_KEYS = [
  'commands',
  'items',
  'missions',
  'factions',
  'systems',
  'agents',
  'invites',
  'guides',
  'facilities',
  'facility_types',
  'types',
  'ships',
  'orders',
  'notes',
  'threads',
  'results',
  'policies',
  'versions',
  'resources',
  'route',
  'citizenships',
  'empires',
  'petitions',
  'recent_decisions',
  'renounced',
  'rules',
] as const;

const GENERIC_LIST_COLUMNS: Array<[string, string[]]> = [
  ['Name', ['name', 'title', 'item_name', 'ship_name', 'class_name', 'type_name', 'leader_username', 'version']],
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
      'system_id',
      'player_id',
      'base_id',
      'template_id',
      'policy_id',
      'listing_id',
      'drone_id',
      'wreck_id',
      'commission_id',
      'petition_id',
      'route_id',
      'empire_id',
      'citizenship_id',
      'grant_id',
      'version',
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
    ['Effects', ['effects_summary']],
  ],
  missions: [
    ['Title', ['title', 'name']],
    ['ID', ['mission_id', 'id', 'template_id']],
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

function printCatalogTruncationWarning(command: string | undefined, result: Record<string, unknown>): void {
  const warning = catalogTruncationWarning(command ?? '', result);
  if (warning) emitLine(`${c.yellow}${warning}${c.reset}`);
}

function titleForListKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isScalarDisplayValue(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function labelForScalarKey(key: string): string {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function titleForScalarAction(action: unknown): string {
  if (typeof action !== 'string' || action.trim() === '') return 'Result';
  return labelForScalarKey(action);
}

function summarizeItemQuantities(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value
    .filter(isRecord)
    .map((item) => {
      const quantity = item.quantity ?? '?';
      const id = item.item_id ?? item.id ?? item.name ?? '?';
      return `${quantity}x ${id}`;
    })
    .join(', ');
}

function summarizePassiveRecipes(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.filter((recipe) => typeof recipe === 'string').join(', ');
}

function recipeAvailability(recipe: Record<string, unknown>, passive = false): string {
  if (passive) return 'ship passive';
  if (recipe.ship_passive === true || recipe.passive === true) return 'ship passive';
  if (recipe.facility_only === true) return 'facility only';
  return 'craftable';
}

function printRecipeRows(
  title: string,
  recipes: Array<Record<string, unknown>>,
  options: { passive?: boolean } = {},
): void {
  const rows = recipes.map((recipe) => ({
    ...recipe,
    inputs_summary: summarizeItemQuantities(recipe.inputs),
    outputs_summary: summarizeItemQuantities(recipe.outputs),
    availability: recipeAvailability(recipe, options.passive),
  }));
  printCompactTable(
    title,
    rows,
    [
      ['Name', ['name']],
      ['ID', ['id', 'recipe_id']],
      ['Category', ['category']],
      ['Inputs', ['inputs_summary']],
      ['Outputs', ['outputs_summary']],
      ['Use', ['availability']],
    ],
    { maxCellWidth: 56 },
  );
}

export const genericFormatters = [
  formatter(
    (r) => {
      if (r.action !== 'dock' || typeof r.story !== 'string') return false;

      const base = String(r.base ?? r.base_name ?? 'station');
      emitLine(`\n${c.bright}=== Docked: ${base} ===${c.reset}`);
      emitLine(r.story.trimEnd());

      const stationCondition = r.station_condition;
      if (isRecord(stationCondition)) {
        const condition = stationCondition.condition_text ?? stationCondition.condition;
        const satisfaction = formatCount(stationCondition.satisfaction_pct);
        if (condition !== undefined || satisfaction !== undefined) {
          const suffix = satisfaction === undefined ? '' : ` (${satisfaction}%)`;
          emitLine(`Station condition: ${condition ?? 'unknown'}${suffix}`);
        }
      }

      emitDockSummaryLine('Storage items', formatCount(r.storage_items));
      emitDockSummaryLine('Open orders', countFromFieldOrArray(r, 'open_orders_count', 'open_orders'));
      const tradeFillSuffix = r.trade_fills_truncated === true ? ' (showing recent, truncated)' : '';
      emitDockSummaryLine('Trade fills', countFromFieldOrArray(r, 'trade_fills_count', 'trade_fills'), tradeFillSuffix);

      const unreadChat = sumNumericRecord(r.unread_chat);
      if (unreadChat !== undefined) emitLine(`Unread chat: ${unreadChat.toLocaleString()}`);
      if (typeof r.unread_chat_note === 'string') emitLine(`${c.dim}${r.unread_chat_note}${c.reset}`);
      return true;
    },
    { shapeFallback: true },
  ),

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
    { commands: ['get_active_missions', 'accept_mission', 'abandon_mission'] },
  ),

  formatter(
    (r) => {
      if (r.type !== 'ships' || !Array.isArray(r.items) || !r.items.every(isRecord)) return false;
      const rows = (r.items as Array<Record<string, unknown>>).map((ship) => ({
        ...ship,
        passive_recipes_summary: summarizePassiveRecipes(ship.passive_recipes),
      }));
      printCompactTable(
        'Items',
        rows,
        [
          ['Name', ['name', 'class_name']],
          ['ID', ['id', 'class_id']],
          ['Class', ['class', 'category']],
          ['Tier', ['tier']],
          ['Empire', ['empire']],
          ['Yard', ['shipyard_tier']],
          ['Pilot', ['piloting_required']],
          ['Rep', ['required_reputation']],
          ['Passive Recipes', ['passive_recipes_summary']],
        ],
        { maxCellWidth: 72 },
      );

      const passiveRecipeDetails = firstArray(r, ['passive_recipe_details']);
      if (passiveRecipeDetails) printRecipeRows('Passive Recipes', passiveRecipeDetails, { passive: true });
      printMetadata(r);
      printCatalogTruncationWarning('catalog', r);
      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { commands: ['catalog'] },
  ),

  formatter(
    (r) => {
      const recipes = firstArray(r, ['recipes']);
      if (!recipes) return false;
      printRecipeRows('Recipes', recipes);
      printMetadata(r);
      printCatalogTruncationWarning('catalog', r);
      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { commands: ['catalog'] },
  ),

  // Generic table fallback for common list-shaped responses.
  formatter(
    (r, command) => {
      let matches = GENERIC_LIST_KEYS.filter((key) => {
        const arr = r[key];
        if (!Array.isArray(arr)) return false;
        if (arr.length === 0) return false;
        return arr.every(isRecord);
      });
      if (matches.length === 0) {
        const emptyArrays = GENERIC_LIST_KEYS.filter(
          (key) => Array.isArray(r[key]) && (r[key] as unknown[]).length === 0,
        );
        if (emptyArrays.length === 1) matches = emptyArrays;
      }
      if (matches.length !== 1) return false;

      const key = matches[0];
      if (!key) return false;
      const rows = r[key] as unknown[];
      if (!rows.every(isRecord)) return false;
      const recordRows = (rows as Array<Record<string, unknown>>).map((row) =>
        key === 'items' ? { ...row, effects_summary: summarizeAmmoEffects(row) } : row,
      );
      const columnCandidates = GENERIC_LIST_COLUMNS_BY_KEY[key] ?? GENERIC_LIST_COLUMNS;
      const columns = scalarColumns(recordRows, columnCandidates);
      if (recordRows.length > 0 && columns.length < 1) return false;

      const title = titleForListKey(key);
      printCompactTable(title, recordRows, columns.length ? columns : [['ID', ['id']]], {
        maxCellWidth: key === 'items' ? 80 : undefined,
      });
      printMetadata(r);
      printCatalogTruncationWarning(command, r);
      if (r.message) emitLine(`${c.dim}${r.message}${c.reset}`);
      return true;
    },
    { shapeFallback: true },
  ),

  // Simple message
  formatter(
    (r) => {
      if (!r.message) return false;
      const extraKeys = Object.keys(r).filter((key) => key !== 'message');
      if (extraKeys.length > 1) return false;
      if (extraKeys.some((key) => isRecord(r[key]) || Array.isArray(r[key]))) return false;
      emitLine(`${c.green}OK:${c.reset} ${r.message}`);
      return true;
    },
    { shapeFallback: true },
  ),

  // Conservative fallback for scalar-only action responses.
  formatter(
    (r, command) => {
      const entries = Object.entries(r).filter(([, value]) => value !== undefined && value !== null && value !== '');
      if (!entries.length || entries.length > 16) return false;
      if (entries.some(([, value]) => !isScalarDisplayValue(value) && !Array.isArray(value))) return false;
      const hasActionMarker =
        typeof r.action === 'string' ||
        typeof r.success === 'boolean' ||
        typeof r.message === 'string' ||
        entries.some(([key]) => key.endsWith('_id') || key === 'id');
      if (!hasActionMarker) return false;

      emitLine(`\n${c.bright}=== ${titleForScalarAction(r.action ?? command)} ===${c.reset}`);
      for (const [key, value] of entries) {
        if (Array.isArray(value)) {
          emitLine(`${labelForScalarKey(key)}: ${value.length} item(s)`);
        } else {
          emitLine(`${labelForScalarKey(key)}: ${String(value)}`);
        }
      }
      if (entries.length === 1 && r.action !== undefined) emitLine(`${c.green}OK${c.reset}`);
      return true;
    },
    { shapeFallback: true },
  ),
];
