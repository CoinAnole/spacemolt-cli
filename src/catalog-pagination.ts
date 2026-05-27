function finiteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function catalogCollection(result: Record<string, unknown>): { key: string; items: unknown[] } | undefined {
  if (Array.isArray(result.items)) return { key: 'items', items: result.items };
  if (Array.isArray(result.recipes)) return { key: 'recipes', items: result.recipes };
  return undefined;
}

function catalogLabel(result: Record<string, unknown>, key: string): string {
  return typeof result.type === 'string' && result.type.trim() ? result.type.trim() : key;
}

export function catalogTruncationWarning(command: string, result: Record<string, unknown>): string | undefined {
  if (command !== 'catalog') return undefined;

  const collection = catalogCollection(result);
  if (!collection) return undefined;

  const total = finiteNumber(result.total ?? result.total_count);
  if (total === undefined || collection.items.length >= total) return undefined;

  const page = finiteNumber(result.page) ?? 1;
  const nextPage = Math.max(1, Math.floor(page)) + 1;
  const label = catalogLabel(result, collection.key);
  return `(Showing ${collection.items.length} of ${total} ${label}. Use --page ${nextPage} for more results.)`;
}
