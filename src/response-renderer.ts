import { defaultClient, type SpaceMoltClient } from './api.ts';
import { catalogTruncationWarning } from './catalog-pagination.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { CommandConfig } from './commands.ts';
import { displayResult } from './display/index.ts';
import { displayError, printJsonResponse } from './help.ts';
import { cacheIdsFromResponse, idKindForCommandField, loadIdCacheSync, printCachedIdSuggestions } from './id-cache.ts';
import { displayNotifications } from './notifications.ts';
import { hasOutputSearch } from './output-search.ts';
import { colorsForPlain } from './output-style.ts';
import { createCommandConfigDryRunResponse, createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { getStructuredResult, isRecord, normalizeStructuredResultForOutput } from './response.ts';
import { tryGetSessionPath } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';

export interface CommandRunResult {
  command: string;
  displayCommand: string;
  commandConfig?: CommandConfig;
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
  const requestCommandConfig = routeCommandConfigForPayload(command, commandConfig, requestPayload);
  const serverPreviewCommand = options.dryRun ? getServerPreviewCommand(command, requestPayload) : null;
  const response = options.dryRun
    ? serverPreviewCommand
      ? await client.execute(serverPreviewCommand, requestPayload)
      : requestCommandConfig
        ? createCommandConfigDryRunResponse(command, requestCommandConfig, requestPayload)
        : createDryRunResponse(command, requestPayload)
    : requestCommandConfig && typeof client.executeCommandConfig === 'function'
      ? await client.executeCommandConfig(command, requestCommandConfig, requestPayload)
      : await client.execute(command, requestPayload);

  return {
    command,
    displayCommand: serverPreviewCommand || command,
    commandConfig: requestCommandConfig ?? commandConfig,
    payload,
    response,
  };
}

function routeCommandConfigForPayload(
  command: string,
  commandConfig: CommandConfig | undefined,
  payload: Record<string, unknown>,
): CommandConfig | undefined {
  if (command !== 'storage' || !commandConfig) return commandConfig;
  const action = typeof payload.action === 'string' ? payload.action : undefined;
  if (action !== 'loot' && action !== 'jettison') return commandConfig;
  return {
    ...commandConfig,
    route: {
      ...commandConfig.route,
      action,
    },
  };
}

export async function renderResponse(
  commandRun: CommandRunResult,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
  context?: CliRuntimeContext,
): Promise<number> {
  const { command, displayCommand, response } = commandRun;
  const renderOptions = optionsForCommandLocalSearch(commandRun, options);
  const isJson = renderOptions.json || renderOptions.format === 'json';
  const hasProjection = Boolean(
    renderOptions.jq ||
      renderOptions.keys !== undefined ||
      renderOptions.field ||
      (renderOptions.fields && renderOptions.fields.length > 0) ||
      hasOutputSearch(renderOptions),
  );
  const writer = context?.writer;

  if ((isJson || renderOptions.structured) && response.error) {
    printJsonResponse(response, false, writer);
    return 1;
  }

  if (
    !isJson &&
    !renderOptions.structured &&
    !hasProjection &&
    response.notifications?.length &&
    !renderOptions.quiet
  ) {
    const colors = colorsForPlain(Boolean(renderOptions.plain));
    const header = `${colors.dim}--- Notifications (${response.notifications.length}) ---${colors.reset}`;
    if (writer) writer.out(header);
    else console.log(header);
    displayNotifications(response.notifications, writer, renderOptions.quiet, { plain: renderOptions.plain });
    if (writer) writer.out('');
    else console.log('');
  }

  if (!isJson && response.error) {
    displayError(displayCommand, response.error, { noTimestamp: renderOptions.noTimestamp, context });
    const sessionPath = tryGetSessionPath(client.config, context?.env);
    if (!renderOptions.quiet && shouldShowCachedIdSuggestions(command, response.error)) {
      printCachedIdSuggestions(command, undefined, sessionPath, writer, {
        quiet: renderOptions.quiet,
        plain: renderOptions.plain,
      });
    }
    return 1;
  }

  const sessionPath = tryGetSessionPath(client.config, context?.env);
  if (!options.dryRun) await cacheIdsFromResponse(command, response, sessionPath);

  const filteredResponse = applyDisplayFilters(command, response, commandRun.payload);

  if ((isJson || renderOptions.structured) && !hasProjection) {
    if (renderOptions.structured && filteredResponse.structuredContent) {
      const out = writer?.out.bind(writer) ?? console.log;
      const warning =
        renderOptions.quiet || isJson
          ? undefined
          : catalogTruncationWarning(displayCommand, filteredResponse.structuredContent);
      if (warning) {
        const err = writer?.err.bind(writer) ?? console.error;
        err(warning);
      }
      out(
        JSON.stringify(
          normalizeStructuredResultForOutput(displayCommand, filteredResponse.structuredContent),
          null,
          renderOptions.compact ? 0 : 2,
        ),
      );
      return 0;
    }
    printJsonResponse(filteredResponse, renderOptions.compact, writer);
    return filteredResponse.error ? 1 : 0;
  }

  const display = prepareHumanDisplay(commandRun, filteredResponse, {
    sessionPath,
    options: renderOptions,
    hasProjection,
    isJson,
  });
  const success = displayResult(
    display.command,
    display.response,
    display.noTimestamp || hasProjection ? { ...renderOptions, noTimestamp: true } : renderOptions,
    context,
  );
  return success === false ? 1 : 0;
}

function optionsForCommandLocalSearch(commandRun: CommandRunResult, options: GlobalOptions): GlobalOptions {
  const outputSearch = options.outputSearch;
  if (!outputSearch || commandRun.payload?.search !== outputSearch) return options;

  const config = commandRun.commandConfig;
  const declaresSearch = Boolean(config?.schema?.search) || Boolean(config?.clientOnlyFields?.includes('search'));
  return declaresSearch ? { ...options, outputSearch: undefined } : options;
}

interface HumanDisplayOptions {
  sessionPath?: string;
  options: GlobalOptions;
  hasProjection: boolean;
  isJson: boolean;
}

function prepareHumanDisplay(
  commandRun: CommandRunResult,
  response: APIResponse,
  displayOptions: HumanDisplayOptions,
): { command: string; response: APIResponse; noTimestamp?: boolean } {
  if (shouldUseGetStatusSummary(commandRun, displayOptions)) {
    return { command: 'get_status_summary', response, noTimestamp: true };
  }

  if (!isDepositItemsCarrierLoad(commandRun, response)) {
    return { command: commandRun.displayCommand, response };
  }

  return {
    command: 'deposit_items_carrier_load',
    response: enrichCarrierLoadDisplayResponse(commandRun, response, displayOptions.sessionPath),
  };
}

function shouldUseGetStatusSummary(commandRun: CommandRunResult, displayOptions: HumanDisplayOptions): boolean {
  if (commandRun.command !== 'get_status') return false;
  if (commandRun.payload?.summary !== true) return false;
  if (displayOptions.isJson || displayOptions.options.structured || displayOptions.hasProjection) return false;
  if (displayOptions.options.compact) return false;

  const format = displayOptions.options.format ?? 'table';
  return format === 'table' || format === 'text';
}

function isDepositItemsCarrierLoad(commandRun: CommandRunResult, response: APIResponse): boolean {
  if (commandRun.command !== 'deposit_items') return false;

  const payload = commandRun.payload ?? {};
  if (payload.target !== 'self') return false;
  if (Number(payload.quantity) !== 1) return false;

  const result = getStructuredResult(response);
  if (!result || result.action !== 'deposit_items') return false;

  const payloadItemId = typeof payload.item_id === 'string' ? payload.item_id : undefined;
  const responseItemId = typeof result.item_id === 'string' ? result.item_id : undefined;
  const itemId = payloadItemId ?? responseItemId;
  if (!itemId || !isUuidLike(itemId)) return false;
  if (payloadItemId && responseItemId && payloadItemId !== responseItemId) return false;

  return true;
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function enrichCarrierLoadDisplayResponse(
  commandRun: CommandRunResult,
  response: APIResponse,
  sessionPath?: string,
): APIResponse {
  const result = getStructuredResult(response);
  if (!result) return response;

  const nextResult = { ...result };
  const shipId =
    (typeof result.item_id === 'string' ? result.item_id : undefined) ??
    (typeof commandRun.payload?.item_id === 'string' ? commandRun.payload.item_id : undefined);
  if (shipId && nextResult.ship_id === undefined) nextResult.ship_id = shipId;

  const shipHint = shipId ? findCachedShipHint(shipId, sessionPath) : undefined;
  if (shipHint) {
    if (nextResult.ship_name === undefined && shipHint.name) nextResult.ship_name = shipHint.name;
    if (isRecord(shipHint.context)) {
      if (nextResult.class_id === undefined && typeof shipHint.context.class_id === 'string') {
        nextResult.class_id = shipHint.context.class_id;
      }
      if (nextResult.class_name === undefined && typeof shipHint.context.class_name === 'string') {
        nextResult.class_name = shipHint.context.class_name;
      }
      if (nextResult.base_id === undefined && typeof shipHint.context.location_base_id === 'string') {
        nextResult.base_id = shipHint.context.location_base_id;
      }
    }
  }

  if (nextResult.bay_slots_remaining === undefined && result.cargo_space !== undefined) {
    nextResult.bay_slots_remaining = result.cargo_space;
  }

  return { ...response, structuredContent: nextResult };
}

function findCachedShipHint(shipId: string, sessionPath?: string) {
  return loadIdCacheSync(sessionPath).find((hint) => hint.kind === 'ship' && hint.id === shipId);
}

function applyDisplayFilters(command: string, response: APIResponse, payload?: Record<string, unknown>): APIResponse {
  if (command === 'get_cargo') return applyCargoDisplayFilters(response, payload ?? {});
  if (!payload || !['view_storage', 'view_faction_storage', 'view_market'].includes(command)) return response;
  const itemFilter = typeof payload.item_id === 'string' ? payload.item_id : undefined;
  const searchFilter = typeof payload.search === 'string' ? payload.search : undefined;
  const itemsFilter = parseItemIdFilter(payload.items);
  if (!itemFilter && !searchFilter && !itemsFilter) return response;

  const structuredContent = response.structuredContent;
  if (!structuredContent || !Array.isArray(structuredContent.items)) return response;

  const nextStructuredContent = structuredClone(structuredContent);
  const items = nextStructuredContent.items as Array<Record<string, unknown>>;
  if (nextStructuredContent.total_items === undefined) nextStructuredContent.total_items = items.length;
  nextStructuredContent.items = items.filter(
    (item) => itemIdMatches(item, itemsFilter) && storageItemMatches(item, itemFilter, searchFilter),
  );
  return { ...response, structuredContent: nextStructuredContent };
}

function parseItemIdFilter(value: unknown): Set<string> | undefined {
  if (typeof value !== 'string') return undefined;
  const itemIds = value
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return itemIds.length ? new Set(itemIds) : undefined;
}

function itemIdMatches(item: Record<string, unknown>, itemFilter?: Set<string>): boolean {
  if (!itemFilter) return true;
  const itemId = item.item_id ?? item.id;
  return typeof itemId === 'string' && itemFilter.has(itemId.toLowerCase());
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
    const needles = searchNeedles(searchFilter);
    const normalizedHaystack = haystack.map(normalizeSearchText);
    return needles.some((needle) => normalizedHaystack.some((value) => value.includes(needle)));
  }

  return true;
}

function searchNeedles(searchFilter: string): string[] {
  return searchFilter.split(',').map(normalizeSearchText).filter(Boolean);
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .trim();
}

function applyCargoDisplayFilters(response: APIResponse, payload: Record<string, unknown>): APIResponse {
  const structuredContent = response.structuredContent;
  if (!structuredContent || !Array.isArray(structuredContent.cargo)) return response;

  const showEmpty = parseBooleanFlag(payload.show_empty);
  const top = parsePositiveInteger(payload.top);
  const itemsFilter = parseItemIdFilter(payload.items);
  const nextStructuredContent = structuredClone(structuredContent);
  const cargo = nextStructuredContent.cargo as Array<Record<string, unknown>>;
  const matchingCargo = itemsFilter ? cargo.filter((item) => itemIdMatches(item, itemsFilter)) : cargo;
  const visibleCargo = showEmpty ? matchingCargo : matchingCargo.filter((item) => numericQuantity(item) > 0);
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
