import { applyCommandPayloadTransforms, applyPayloadTransforms } from './args.ts';
import { type CommandConfig, routeToPath, V2_TOOL_MAP, type V2Route } from './commands.ts';
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
  return buildRoutePreview(command, mapping, normalizedPayload);
}

export function getCommandConfigRoutePreview(
  command: string,
  commandConfig: Pick<CommandConfig, 'arrayFields' | 'route'>,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedPayload = applyCommandPayloadTransforms(commandConfig, { ...payload });
  return buildRoutePreview(command, commandConfig.route, normalizedPayload);
}

function buildRoutePreview(
  command: string,
  mapping: V2Route,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const requestPayload = mapping.defaults ? { ...mapping.defaults, ...payload } : payload;

  return {
    dry_run: true,
    command,
    method: mapping.method || 'POST',
    url: `${trimTrailingSlash(API_BASE)}/${routeToPath(mapping)}`,
    payload: requestPayload,
    server_request_sent: false,
    notes: RISK_NOTES[command] || ['No mutation was sent. This is a client-side route and payload preview.'],
  };
}

export function createDryRunResponse(command: string, payload: Record<string, unknown>): APIResponse {
  const preview = getRoutePreview(command, payload);
  return createDryRunResponseFromPreview(command, preview);
}

export function createCommandConfigDryRunResponse(
  command: string,
  commandConfig: Pick<CommandConfig, 'arrayFields' | 'route'>,
  payload: Record<string, unknown>,
): APIResponse {
  const preview = getCommandConfigRoutePreview(command, commandConfig, payload);
  return createDryRunResponseFromPreview(command, preview);
}

function createDryRunResponseFromPreview(command: string, preview: Record<string, unknown>): APIResponse {
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
