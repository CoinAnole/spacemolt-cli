import { defaultClient, type SpaceMoltClient } from './api.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import { displayResult } from './display/index.ts';
import { displayError, printJsonResponse } from './help.ts';
import { cacheIdsFromResponse, idKindForCommandField, printCachedIdSuggestions } from './id-cache.ts';
import { displayNotifications } from './notifications.ts';
import { createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { c } from './runtime.ts';
import { getSessionPath } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';

export interface CommandRunResult {
  command: string;
  displayCommand: string;
  response: APIResponse;
}

export async function runCommand(
  command: string,
  payload: Record<string, unknown>,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
): Promise<CommandRunResult> {
  const serverPreviewCommand = options.dryRun ? getServerPreviewCommand(command, payload) : null;
  const response = options.dryRun
    ? serverPreviewCommand
      ? await client.execute(serverPreviewCommand, payload)
      : createDryRunResponse(command, payload)
    : await client.execute(command, payload);

  return {
    command,
    displayCommand: serverPreviewCommand || command,
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
  const hasProjection = Boolean(options.jq || (options.fields && options.fields.length > 0));
  const writer = context?.writer;

  if (isJson && response.error) {
    printJsonResponse(response);
    return 1;
  }

  if (!isJson && !hasProjection && response.notifications?.length && !options.quiet) {
    const header = `${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`;
    if (writer) writer.out(header);
    else console.log(header);
    displayNotifications(response.notifications, writer);
    if (writer) writer.out('');
    else console.log('');
  }

  if (!isJson && response.error) {
    displayError(displayCommand, response.error, { noTimestamp: options.noTimestamp });
    const sessionPath = getSessionPath(client.config);
    if (shouldShowCachedIdSuggestions(command, response.error)) {
      printCachedIdSuggestions(command, undefined, sessionPath);
    }
    return 1;
  }

  const sessionPath = getSessionPath(client.config);
  if (!options.dryRun) await cacheIdsFromResponse(command, response, sessionPath);

  if (isJson && !hasProjection) {
    printJsonResponse(response, options.compact);
    return response.error ? 1 : 0;
  }

  const success = displayResult(displayCommand, response, hasProjection ? { ...options, noTimestamp: true } : options);
  return success === false ? 1 : 0;
}

function shouldShowCachedIdSuggestions(command: string, error: { code: string; message: string }): boolean {
  if (!idKindForCommandField(command)) return false;
  const text = `${error.code} ${error.message}`.toLowerCase();
  return /invalid|unknown|not_found|not found|missing/.test(text);
}
