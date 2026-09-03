/** OpenAPI terminal BoardingStateLogEntry.event values only. Non-terminals (progress, latch, hold, …) are unknown: trimmed, case-preserving, no gloss. */
const KNOWN_TERMINAL_BOARDING_EVENTS = new Set([
  'capture_ready',
  'plundered',
  'withdrawn',
  'attacker_destroyed',
  'attacker_incapacitated',
  'target_destroyed',
  'target_self_destructed',
  'restart_canceled',
]);

const BOARDING_EVENT_GLOSS: Record<string, string> = {
  plundered: 'cargo taken, hull left',
};

/** Non-empty strings only. Terminal tokens lowercase; plundered appends a short gloss. Non-terminals print trimmed as-is. */
export function formatBoardingEvent(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  if (!text) return undefined;
  const canonical = text.toLowerCase();
  const token = KNOWN_TERMINAL_BOARDING_EVENTS.has(canonical) ? canonical : text;
  const gloss = BOARDING_EVENT_GLOSS[canonical];
  return gloss ? `${token} (${gloss})` : token;
}
