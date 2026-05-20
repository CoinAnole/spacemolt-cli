import { c, emitLine, formatter, isRecord, printCompactTable } from './helpers.ts';

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
