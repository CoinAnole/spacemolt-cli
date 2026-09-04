/** ZoneMoveLogEntry.reason tokens that lowercase and may carry a gloss. */
const KNOWN_ZONE_MOVE_REASONS = new Set(['retreat_intercepted']);

const ZONE_MOVE_REASON_GLOSS: Record<string, string> = {
  retreat_intercepted: 'retreat cancelled by interceptor',
};

/** Non-empty strings only. Known glossed tokens lowercase; unknowns print trimmed as-is. */
export function formatZoneMoveReason(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const canonical = text.toLowerCase();
  const token = KNOWN_ZONE_MOVE_REASONS.has(canonical) ? canonical : text;
  const gloss = ZONE_MOVE_REASON_GLOSS[canonical];
  return gloss ? `${token} (${gloss})` : token;
}
