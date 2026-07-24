/** Local isRecord — same style as ship-commission-receipt.ts; no import from response.ts. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const DEFAULT_COUNT_MAP_LIMIT = 6;

/**
 * Format `{ jump: 12, undock: 1 }` as `jump×12, undock×1` (top entries only).
 * Default limit 6 (unified multi-line + table).
 */
export function formatCountMap(value: unknown, limit = DEFAULT_COUNT_MAP_LIMIT): string | undefined {
  const record = isRecord(value) ? value : undefined;
  if (!record) return undefined;
  const entries = Object.entries(record)
    .map(([key, count]) => {
      const n = finiteNumber(count);
      if (!key.trim() || n === undefined || n <= 0) return undefined;
      return [key, n] as const;
    })
    .filter((entry): entry is readonly [string, number] => Boolean(entry))
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (!entries.length) return undefined;
  const preview = entries
    .slice(0, limit)
    .map(([key, count]) => `${key}×${count}`)
    .join(', ');
  const suffix = entries.length > limit ? `, +${entries.length - limit} more` : '';
  return `${preview}${suffix}`;
}
