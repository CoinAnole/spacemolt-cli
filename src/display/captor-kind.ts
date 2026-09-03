const KNOWN_CAPTOR_KINDS = new Set(['player', 'pirate', 'npc']);

/** Non-empty strings only. Known tokens print as lowercase enum values. */
export function normalizeCaptorKind(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const canonical = text.toLowerCase();
  return KNOWN_CAPTOR_KINDS.has(canonical) ? canonical : text;
}
