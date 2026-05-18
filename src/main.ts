#!/usr/bin/env bun
import { execute } from './api.ts';
import { convertPayloadTypes, normalizeParsedPayload, parseArgs, validateRequiredArgs } from './args.ts';
import { COMMANDS } from './commands.ts';
import { generateCompletion } from './completion.ts';
import { displayResult } from './display/index.ts';
import {
  displayError,
  displayMissingArgument,
  displayUnknownCommand,
  parseCommandSearchQuery,
  parseGlobalOptions,
  printJsonError,
  printJsonResponse,
  showCommandExplanation,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showFullHelp,
  showHelp,
} from './help.ts';
import { displayNotifications } from './notifications.ts';
import { createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { getObjectResult, getStructuredResult, isRecord } from './response.ts';
import { API_BASE, c, DEBUG, VERSION } from './runtime.ts';
import { getSession, loadSession, saveSession, showProfiles } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';
import { checkForUpdates } from './update.ts';

type CommandStatus = { type: 'exit'; exitCode: number };
type ParsedCommand = { type: 'command'; command: string; rawPayload: Record<string, string> };
type ResolvedCommand = CommandStatus | ParsedCommand;
type PreparedPayload = CommandStatus | { type: 'payload'; payload: Record<string, unknown> };

export interface Invocation {
  options: GlobalOptions;
  args: string[];
}

export interface CommandRun {
  command: string;
  displayCommand: string;
  response: APIResponse;
}

export function parseInvocation(argv: string[]): Invocation {
  const options = parseGlobalOptions(argv);
  return { options, args: options.args };
}

export function resolveCommand(invocation: Invocation): ResolvedCommand {
  const { args, options } = invocation;

  if (args.length === 0) {
    showHelp();
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'profile') {
    const action = args[1] || 'list';
    if (action === 'list') {
      showProfiles();
      return { type: 'exit', exitCode: 0 };
    }
    if (options.json) {
      printJsonError('unknown_command', `Unknown profile command: ${action}`);
      return { type: 'exit', exitCode: 1 };
    }
    console.error(`${c.red}Error:${c.reset} Unknown profile command "${action}"`);
    console.error('Usage: spacemolt profile list');
    return { type: 'exit', exitCode: 1 };
  }

  if (args[0] === 'commands') {
    showCommandSearch(parseCommandSearchQuery(args.slice(1)));
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'explain') {
    const explainCommand = args[1];
    if (!explainCommand) {
      console.error(`${c.red}Error:${c.reset} Missing command name.`);
      console.error(`Usage: spacemolt explain <command>`);
      return { type: 'exit', exitCode: 1 };
    }
    if (!showCommandExplanation(explainCommand)) {
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${explainCommand}`);
        return { type: 'exit', exitCode: 1 };
      }
      displayUnknownCommand(explainCommand);
      return { type: 'exit', exitCode: 1 };
    }
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'completion') {
    const shell = args[1] || 'bash';
    if (!['bash', 'zsh', 'fish'].includes(shell)) {
      console.error(`${c.red}Error:${c.reset} Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
      return { type: 'exit', exitCode: 1 };
    }
    console.log(generateCompletion(shell));
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'help' && !args[1]) {
    showHelp();
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'help' && args[1] === 'all') {
    showFullHelp();
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === 'help' && args[1] && showCommandGroup(args[1])) {
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === '--help' || args[0] === '-h') {
    const helpCommand = args[1];
    if (helpCommand) {
      if (showCommandHelp(helpCommand) || showCommandGroup(helpCommand)) {
        return { type: 'exit', exitCode: 0 };
      }
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${helpCommand}`);
        return { type: 'exit', exitCode: 1 };
      }
      displayUnknownCommand(helpCommand);
      return { type: 'exit', exitCode: 1 };
    }
    showHelp();
    showCommandGroups();
    return { type: 'exit', exitCode: 0 };
  }

  if (args[0] === '--version' || args[0] === '-v') {
    console.log(`SpaceMolt Client v${VERSION}`);
    console.log(`API: ${API_BASE}`);
    return { type: 'exit', exitCode: 0 };
  }

  const { command, payload, warnings } = parseArgs(args);

  if (!command) {
    showHelp();
    return { type: 'exit', exitCode: 0 };
  }

  if (warnings.length > 0 && !options.quiet) {
    for (const w of warnings) console.error(`${c.yellow}Warning:${c.reset} ${w}`);
  }

  if (DEBUG) {
    console.log(`${c.dim}[DEBUG] Command: ${command}${c.reset}`);
    console.log(`${c.dim}[DEBUG] Payload: ${JSON.stringify(payload)}${c.reset}`);
    console.log(`${c.dim}[DEBUG] API: ${API_BASE}${c.reset}`);
  }

  return { type: 'command', command, rawPayload: payload };
}

export function preparePayload(
  command: string,
  rawPayload: Record<string, string>,
  options: GlobalOptions,
): PreparedPayload {
  if (!COMMANDS[command]) {
    if (options.json) {
      printJsonError('unknown_command', `Unknown command: ${command}`);
      return { type: 'exit', exitCode: 1 };
    }
    displayUnknownCommand(command);
    return { type: 'exit', exitCode: 1 };
  }

  if (rawPayload.help === 'true' || rawPayload.help === '1') {
    showCommandHelp(command);
    return { type: 'exit', exitCode: 0 };
  }

  const missingArg = validateRequiredArgs(command, rawPayload);
  if (missingArg) {
    if (options.json) {
      printJsonError('missing_required_argument', `Missing required argument: ${missingArg}`);
      return { type: 'exit', exitCode: 1 };
    }
    displayMissingArgument(command, missingArg);
    return { type: 'exit', exitCode: 1 };
  }

  const requestPayload = normalizeParsedPayload(command, rawPayload);
  const payload = Object.keys(requestPayload).length > 0 ? convertPayloadTypes(requestPayload, command) : {};
  return { type: 'payload', payload };
}

export async function runCommand(
  command: string,
  payload: Record<string, unknown>,
  options: GlobalOptions,
): Promise<CommandRun> {
  await persistSubmittedCredentials(command, payload);

  const serverPreviewCommand = options.dryRun ? getServerPreviewCommand(command, payload) : null;
  const response = options.dryRun
    ? serverPreviewCommand
      ? await execute(serverPreviewCommand, payload)
      : createDryRunResponse(command, payload)
    : await execute(command, payload);

  return {
    command,
    displayCommand: serverPreviewCommand || command,
    response,
  };
}

export async function renderResponse(commandRun: CommandRun, options: GlobalOptions): Promise<number> {
  const { command, displayCommand, response } = commandRun;

  if (options.json && response.error) {
    printJsonResponse(response);
    return 1;
  }

  if (!options.json && response.notifications?.length && !options.quiet) {
    console.log(`${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`);
    displayNotifications(response.notifications);
    console.log('');
  }

  if (!options.json && response.error) {
    displayError(displayCommand, response.error);
    return 1;
  }

  await persistResponseCredentials(command, response);

  if (options.json) {
    printJsonResponse(response);
    return response.error ? 1 : 0;
  }

  displayResult(displayCommand, response, options.fields);
  return 0;
}

export async function runInvocation(argv: string[]): Promise<number> {
  const invocation = parseInvocation(argv);

  // Check for updates in the background (non-blocking) - skip in quiet mode
  if (!invocation.options.json && !invocation.options.quiet) checkForUpdates();

  const resolved = resolveCommand(invocation);
  if (resolved.type === 'exit') return resolved.exitCode;

  try {
    const prepared = preparePayload(resolved.command, resolved.rawPayload, invocation.options);
    if (prepared.type === 'exit') return prepared.exitCode;

    const commandRun = await runCommand(resolved.command, prepared.payload, invocation.options);
    return await renderResponse(commandRun, invocation.options);
  } catch (error) {
    return renderConnectionError(error, invocation.options);
  }
}

async function persistSubmittedCredentials(command: string, payload: Record<string, unknown>): Promise<void> {
  if (command === 'login' && typeof payload.username === 'string' && typeof payload.password === 'string') {
    const session = await getSession();
    session.username = payload.username;
    session.password = payload.password;
    await saveSession(session);
    if (DEBUG) console.log(`${c.dim}[DEBUG] Saved credentials to session${c.reset}`);
  }

  if (command === 'register' && typeof payload.username === 'string') {
    const session = await getSession();
    session.username = payload.username;
    await saveSession(session);
  }
}

async function persistResponseCredentials(command: string, response: APIResponse): Promise<void> {
  const structuredResult = getStructuredResult(response);
  const resultRecord = structuredResult || getObjectResult(response);

  if (command === 'register') {
    const password = typeof resultRecord?.password === 'string' ? resultRecord.password : undefined;
    const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
    const playerId =
      typeof resultRecord?.player_id === 'string'
        ? resultRecord.player_id
        : typeof player?.id === 'string'
          ? player.id
          : response.session?.player_id;

    if (password) {
      const session = await loadSession();
      if (session) {
        session.password = password;
        if (playerId) session.player_id = playerId;
        await saveSession(session);
        if (DEBUG) console.log(`${c.dim}[DEBUG] Saved password to session${c.reset}`);
      }
    }
  }

  if (command === 'login') {
    const player = isRecord(resultRecord?.player) ? resultRecord.player : undefined;
    const playerId =
      typeof player?.id === 'string'
        ? player.id
        : typeof resultRecord?.player_id === 'string'
          ? resultRecord.player_id
          : response.session?.player_id;

    if (playerId) {
      const session = await loadSession();
      if (session) {
        session.player_id = playerId;
        await saveSession(session);
      }
    }
  }
}

function renderConnectionError(error: unknown, options: GlobalOptions): number {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (options.json) {
    printJsonError('connection_error', errorMessage);
    return 1;
  }
  console.error(`${c.red}${c.bright}Connection Error:${c.reset} ${errorMessage}`);
  console.error('');

  if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
    console.error(`${c.yellow}Troubleshooting:${c.reset}`);
    console.error(`  1. Check your internet connection`);
    console.error(`  2. Verify the API is reachable: ${API_BASE}`);
    console.error(`  3. The game server may be temporarily down`);
    console.error(`  4. Try again in a few moments`);
  }

  if (DEBUG) {
    console.error(`\n${c.dim}[DEBUG] Full error:${c.reset}`);
    console.error(error);
  }

  return 1;
}

export async function main(): Promise<void> {
  process.exit(await runInvocation(process.argv.slice(2)));
}

if (import.meta.main) {
  main();
}
