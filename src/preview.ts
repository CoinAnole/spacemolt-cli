import { applyPayloadTransforms } from './args.ts';
import { SINGLE_ENDPOINT_TOOLS, V2_TOOL_MAP } from './commands.ts';
import { trimTrailingSlash } from './response.ts';
import { API_BASE } from './runtime.ts';
import type { APIResponse } from './types.ts';

const RISK_NOTES: Record<string, string[]> = {
  sell: [
    'Sells cargo from your active ship.',
    'auto_list=true may create a player sell order and pay a listing fee for unsold quantity.',
  ],
  buy: [
    'Buys from the current market.',
    'auto_list=true may create a buy order and pay a listing fee for unfilled quantity.',
    'Use a quantity to allow server-side estimate_purchase preview.',
  ],
  jump: ['Moves your ship to a connected system and may consume fuel or time.'],
  scrap_ship: ['Permanently destroys a stored ship. This cannot be undone.'],
  self_destruct: ['Destroys your active ship, creates a wreck, and respawns you at your home base.'],
  facility_build: ['Builds a player facility at the current base and spends required resources/credits.'],
  facility_upgrade: ['Upgrades a facility and spends required resources/credits.'],
  facility_toggle: ['Changes whether a facility is enabled.'],
  facility_list_for_sale: ['Lists a facility for sale at the requested price.'],
  facility_buy_listing: ['Buys a player-listed facility and spends credits.'],
  facility_cancel_listing: ['Cancels a facility sale listing.'],
  faction_facility_build: ['Builds a faction facility and spends faction resources/credits.'],
  faction_facility_upgrade: ['Upgrades a faction facility and spends faction resources/credits.'],
  faction_facility_toggle: ['Changes whether a faction facility is enabled.'],
};

export function getRoutePreview(command: string, payload: Record<string, unknown>): Record<string, unknown> {
  const mapping = V2_TOOL_MAP[command];
  if (!mapping) throw new Error(`Command "${command}" has no v2 route mapping.`);

  const normalizedPayload = applyPayloadTransforms(command, { ...payload });
  const requestPayload = mapping.defaults ? { ...mapping.defaults, ...normalizedPayload } : normalizedPayload;
  const routePath =
    mapping.tool === mapping.action || SINGLE_ENDPOINT_TOOLS.has(mapping.tool)
      ? mapping.tool
      : `${mapping.tool}/${mapping.action}`;

  return {
    dry_run: true,
    command,
    method: mapping.method || 'POST',
    url: `${trimTrailingSlash(API_BASE)}/${routePath}`,
    payload: requestPayload,
    server_request_sent: false,
    notes: RISK_NOTES[command] || ['No mutation was sent. This is a client-side route and payload preview.'],
  };
}

export function createDryRunResponse(command: string, payload: Record<string, unknown>): APIResponse {
  const preview = getRoutePreview(command, payload);
  return {
    structuredContent: preview,
    result: [
      `Dry run: ${command}`,
      `${preview.method} ${preview.url}`,
      `Payload: ${JSON.stringify(preview.payload)}`,
      ...(Array.isArray(preview.notes) ? preview.notes.map((note) => `- ${note}`) : []),
      'No request was sent.',
    ].join('\n'),
  };
}

export function getServerPreviewCommand(command: string, payload: Record<string, unknown>): string | null {
  if (command === 'buy' && payload.item_id && payload.quantity !== undefined) return 'estimate_purchase';
  return null;
}
