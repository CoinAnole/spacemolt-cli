import { defaultClient, type SpaceMoltClient } from './api.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { CommandConfig } from './commands.ts';
import { displayResult } from './display/index.ts';
import { displayError, printJsonResponse } from './help.ts';
import { cacheIdsFromResponse, idKindForCommandField, printCachedIdSuggestions } from './id-cache.ts';
import { displayNotifications } from './notifications.ts';
import { createCommandConfigDryRunResponse, createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { c } from './runtime.ts';
import { getSessionPath } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';

export interface CommandRunResult {
  command: string;
  displayCommand: string;
  payload?: Record<string, unknown>;
  response: APIResponse;
}

function stripClientOnlyFields(
  payload: Record<string, unknown>,
  commandConfig?: Pick<CommandConfig, 'clientOnlyFields'>,
): Record<string, unknown> {
  if (!commandConfig?.clientOnlyFields?.length) return payload;
  const stripped = { ...payload };
  for (const field of commandConfig.clientOnlyFields) delete stripped[field];
  return stripped;
}

export async function runCommand(
  command: string,
  payload: Record<string, unknown>,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
  commandConfig?: CommandConfig,
): Promise<CommandRunResult> {
  const requestPayload = stripClientOnlyFields(payload, commandConfig);
  const serverPreviewCommand = options.dryRun ? getServerPreviewCommand(command, requestPayload) : null;
  const response = options.dryRun
    ? serverPreviewCommand
      ? await client.execute(serverPreviewCommand, requestPayload)
      : commandConfig
        ? createCommandConfigDryRunResponse(command, commandConfig, requestPayload)
        : createDryRunResponse(command, requestPayload)
    : commandConfig && typeof client.executeCommandConfig === 'function'
      ? await client.executeCommandConfig(command, commandConfig, requestPayload)
      : await client.execute(command, requestPayload);

  return {
    command,
    displayCommand: serverPreviewCommand || command,
    payload,
    response,
  };
}

export async function renderResponse(
  commandRun: CommandRunResult,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
  context?: CliRuntimeContext,
): Promise<number> {
  const { command, displayCommand, response } = commandRun;
  const isJson = options.json || options.format === 'json';
  const hasProjection = Boolean(options.jq || options.field || (options.fields && options.fields.length > 0));
  const writer = context?.writer;

  if (isJson && response.error) {
    printJsonResponse(response, false, writer);
    return 1;
  }

  if (!isJson && !hasProjection && response.notifications?.length && !options.quiet) {
    const header = `${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`;
    if (writer) writer.out(header);
    else console.log(header);
    displayNotifications(response.notifications, writer, options.quiet);
    if (writer) writer.out('');
    else console.log('');
  }

  if (!isJson && response.error) {
    displayError(displayCommand, response.error, { noTimestamp: options.noTimestamp, context });
    const sessionPath = getSessionPath(client.config);
    if (!options.quiet && shouldShowCachedIdSuggestions(command, response.error)) {
      printCachedIdSuggestions(command, undefined, sessionPath, writer);
    }
    return 1;
  }

  const sessionPath = getSessionPath(client.config);
  if (!options.dryRun) await cacheIdsFromResponse(command, response, sessionPath);

  if (isJson && !hasProjection) {
    printJsonResponse(response, options.compact, writer);
    return response.error ? 1 : 0;
  }

  const displayResponse = applyDisplayFilters(command, response, commandRun.payload);

  const success = displayResult(
    displayCommand,
    displayResponse,
    hasProjection ? { ...options, noTimestamp: true } : options,
    context,
  );
  return success === false ? 1 : 0;
}

function applyDisplayFilters(command: string, response: APIResponse, payload?: Record<string, unknown>): APIResponse {
  if (command === 'get_cargo' || command === 'v2_get_cargo') return applyCargoDisplayFilters(response, payload ?? {});
  if (!payload || !['view_storage', 'view_faction_storage'].includes(command)) return response;
  const itemFilter = typeof payload.item_id === 'string' ? payload.item_id : undefined;
  const searchFilter = typeof payload.search === 'string' ? payload.search : undefined;
  if (!itemFilter && !searchFilter) return response;

  const structuredContent = response.structuredContent;
  if (!structuredContent || !Array.isArray(structuredContent.items)) return response;

  const nextStructuredContent = structuredClone(structuredContent);
  const items = nextStructuredContent.items as Array<Record<string, unknown>>;
  nextStructuredContent.items = items.filter((item) => storageItemMatches(item, itemFilter, searchFilter));
  return { ...response, structuredContent: nextStructuredContent };
}

function storageItemMatches(item: Record<string, unknown>, itemFilter?: string, searchFilter?: string): boolean {
  const haystack = [item.item_id, item.id, item.item_name, item.name, item.display_name]
    .filter((value): value is string | number | boolean => value !== undefined && value !== null)
    .map((value) => String(value).toLowerCase());

  if (itemFilter) {
    const needle = itemFilter.toLowerCase();
    const itemId = String(item.item_id || item.id || '').toLowerCase();
    if (itemId === needle) return true;
    return haystack.some((value) => value.includes(needle));
  }

  if (searchFilter) {
    const needle = searchFilter.toLowerCase();
    return haystack.some((value) => value.includes(needle));
  }

  return true;
}

function applyCargoDisplayFilters(response: APIResponse, payload: Record<string, unknown>): APIResponse {
  const structuredContent = response.structuredContent;
  if (!structuredContent || !Array.isArray(structuredContent.cargo)) return response;

  const showEmpty = parseBooleanFlag(payload.show_empty);
  const top = parsePositiveInteger(payload.top);
  const nextStructuredContent = structuredClone(structuredContent);
  const cargo = nextStructuredContent.cargo as Array<Record<string, unknown>>;
  const visibleCargo = showEmpty ? cargo : cargo.filter((item) => numericQuantity(item) > 0);
  const sortedCargo = [...visibleCargo].sort((left, right) => numericQuantity(right) - numericQuantity(left));

  nextStructuredContent.cargo = top === undefined ? sortedCargo : sortedCargo.slice(0, top);
  return { ...response, structuredContent: nextStructuredContent };
}

function numericQuantity(item: Record<string, unknown>): number {
  const value = item.quantity;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function parseBooleanFlag(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
  return parsed;
}

function shouldShowCachedIdSuggestions(command: string, error: { code: string; message: string }): boolean {
  if (!idKindForCommandField(command)) return false;
  const text = `${error.code} ${error.message}`.toLowerCase();
  return /invalid|unknown|not_found|not found|missing/.test(text);
}
