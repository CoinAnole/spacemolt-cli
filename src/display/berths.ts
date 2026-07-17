import { isRecord } from './helpers.ts';

const BERTH_CLASSES = [
  ['economy', 'Economy'],
  ['business', 'Business'],
  ['first', 'First'],
] as const;

function finiteCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function formatBerthSummary(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const parts = BERTH_CLASSES.flatMap(([key, label]) => {
    const counts = value[key];
    if (!isRecord(counts)) return [];
    const total = finiteCount(counts.total);
    const free = finiteCount(counts.free);
    return total === undefined || free === undefined ? [] : [`${label}: ${free}/${total} free`];
  });
  return parts.length ? parts.join(' | ') : undefined;
}
