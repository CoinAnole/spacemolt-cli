import { formatCompactTable } from './display/tables.ts';
import type { DirectColors } from './output-style.ts';
import { isRecord } from './response.ts';

export const MISSING_MATERIAL_ERROR_CODES = ['missing_materials', 'missing_faction_materials'] as const;
export type MissingMaterialErrorCode = (typeof MISSING_MATERIAL_ERROR_CODES)[number];

export interface MissingMaterialRow {
  item_id: string;
  item_name: string;
  need: number;
  have: number;
}

export function isMissingMaterialErrorCode(code: string): code is MissingMaterialErrorCode {
  return (MISSING_MATERIAL_ERROR_CODES as readonly string[]).includes(code);
}

export function parseMissingMaterialRows(details: unknown): MissingMaterialRow[] {
  if (!isRecord(details) || !Array.isArray(details.missing)) return [];

  const rows: MissingMaterialRow[] = [];
  for (const entry of details.missing) {
    if (!isRecord(entry)) continue;

    const item_id = usableString(entry.item_id) ?? '';
    const item_name = usableString(entry.item_name) ?? item_id;
    if (!item_name) continue;

    const need = finiteQuantity(entry.need);
    const have = finiteQuantity(entry.have);
    if (need === undefined || have === undefined) continue;

    rows.push({ item_id, item_name, need, have });
  }
  return rows;
}

export function formatMissingMaterialsErrorLines(rows: MissingMaterialRow[], colors: DirectColors): string[] {
  if (rows.length === 0) return [];

  const TITLE = 'Missing materials';
  const raw = formatCompactTable(
    TITLE,
    rows.map((row) => ({
      item_name: row.item_name,
      item_id: row.item_id,
      need: String(row.need),
      have: String(row.have),
    })),
    [
      ['Item', ['item_name', 'item_id']],
      ['ID', ['item_id']],
      ['Need', ['need']],
      ['Have', ['have']],
    ],
    { maxCellWidth: 48 },
  );
  const visual = raw.flatMap((line) => line.split('\n'));
  const titleIndex = visual.findIndex((line) => line.includes(`=== ${TITLE} ===`));
  const titleLine = titleIndex >= 0 ? visual[titleIndex] : undefined;
  if (titleIndex >= 0 && titleLine !== undefined) {
    visual[titleIndex] = titleLine.replace(`=== ${TITLE} ===`, `${colors.bright}=== ${TITLE} ===${colors.reset}`);
  }
  visual.push('');
  return visual;
}

function usableString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

// Number([]) === 0, Number(true) === 1, Number('') === 0 — only finite numbers and numeric strings.
function finiteQuantity(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}
