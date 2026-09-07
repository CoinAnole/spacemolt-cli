/** Protocol event names (changelog / Notification_action_result.command). */
export const UNSOLICITED_STATE_EVENTS = new Set([
  'player_died',
  'ship_captured',
  'emergency_warp_stabilizer',
  'passenger_stranded',
  'fleet_kicked',
  'fleet_disbanded',
  'mobile_capital_transit',
]);

/** Command strings that are events rather than completed mutations (`UNSOLICITED_STATE_EVENTS` plus `fleet_dock`). */
export const NON_COMPLETION_ACTION_RESULT_COMMANDS = new Set([...UNSOLICITED_STATE_EVENTS, 'fleet_dock']);

/** Reject non-strings; trim and lowercase. Empty after trim is missing. */
export function normalizeActionResultCommand(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const command = value.trim().toLowerCase();
  return command || undefined;
}
