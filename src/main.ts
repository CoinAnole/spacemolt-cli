#!/usr/bin/env bun
import { execute, SpaceMoltClient, defaultClient } from './api.ts';
import {
  type CommandParseError,
  convertPayloadTypes,
  normalizeParsedPayload,
  parseArgs,
  validateRequiredArgs,
} from './args.ts';
import { COMMANDS } from './commands.ts';
import { generateCompletion } from './completion.ts';
import { displayResult } from './display/index.ts';
import { printDoctorResult, runDoctor } from './doctor.ts';
import type { GlobalOptionParseError } from './global-options.ts';
import { applyGlobalOptions, parseGlobalOptions } from './global-options.ts';
import {
  displayError,
  displayMissingArgument,
  displayUnknownCommand,
  parseCommandSearchQuery,
  printJsonError,
  printJsonResponse,
  showCommandExplanation,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showFullHelp,
  showHelp,
  showProgressiveHelp,
} from './help.ts';
import {
  type CachedIdResolveResult,
  cachedIdAmbiguityMessage,
  cacheIdsFromResponse,
  formatCachedIdAmbiguity,
  hintsForKind,
  idKindForCommandField,
  isIdKind,
  printCachedIdSuggestions,
  printIds,
  printWhereCanI,
  resolveCachedId,
  searchItemHints,
  loadIdCacheSync,
} from './id-cache.ts';
import { displayNotifications } from './notifications.ts';
import { createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { getObjectResult, getStructuredResult, isRecord } from './response.ts';
import { API_BASE, c, DEBUG, VERSION, type SpaceMoltConfig, DEFAULT_V2_API_BASE } from './runtime.ts';
import { getSession, loadSession, saveSession, showProfiles, getSessionPath, SessionManager } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';
import { checkForUpdates } from './update.ts';

export type CliResult = { exitCode: number; stdout?: string; stderr?: string };

export function getRuntimeConfig(options: GlobalOptions): SpaceMoltConfig {
  return {
    apiBase: process.env.SPACEMOLT_URL || DEFAULT_V2_API_BASE,
    jsonOutput: options.json || options.format === 'json' || process.env.SPACEMOLT_OUTPUT === 'json',
    debug: process.env.DEBUG === 'true',
    plain: options.plain,
    quiet: options.quiet,
    format: options.format || 'table',
    compact: options.compact,
    profile: options.profile,
    sessionPath: process.env.SPACEMOLT_SESSION,
  };
}

type CommandStatus = { type: 'exit'; exitCode: number };
type ParsedCommand = { type: 'command'; command: string; rawPayload: Record<string, any> };
type ResolvedCommand = CommandStatus | ParsedCommand;
type PreparedPayload = CommandStatus | { type: 'payload'; payload: Record<string, unknown> };
type PayloadResolveResult =
  | { type: 'payload'; payload: Record<string, any> }
  | { type: 'ambiguous'; field: string; result: Extract<CachedIdResolveResult, { type: 'ambiguous' }> };

export interface Invocation {
  options: GlobalOptions;
  args: string[];
}

export type InvocationParseResult = { ok: true; invocation: Invocation } | { ok: false; error: GlobalOptionParseError };

export interface CommandRun {
  command: string;
  displayCommand: string;
  response: APIResponse;
}

export function parseInvocation(argv: string[]): InvocationParseResult {
  const parsed = parseGlobalOptions(argv);
  if (!parsed.ok) return parsed;

  applyGlobalOptions(parsed.options);
  return { ok: true, invocation: { options: parsed.options, args: parsed.options.args } };
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

  const parsedArgs = parseArgs(args, { allowUnknown: options.allowUnknown });
  if (!parsedArgs.ok) {
    displayCommandParseErrors(parsedArgs.errors, options);
    return { type: 'exit', exitCode: 1 };
  }

  const { command, payload } = parsedArgs;

  if (!command) {
    showHelp();
    return { type: 'exit', exitCode: 0 };
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
  rawPayload: Record<string, any>,
  options: GlobalOptions,
  sessionPath?: string,
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
  const resolvedPayload = resolveCachedIdsForPayload(command, requestPayload, sessionPath);
  if (resolvedPayload.type === 'ambiguous') {
    if (options.json) {
      printJsonError('ambiguous_cached_id', cachedIdAmbiguityMessage(resolvedPayload.result));
      return { type: 'exit', exitCode: 1 };
    }
    for (const line of formatCachedIdAmbiguity(command, resolvedPayload.field, resolvedPayload.result)) {
      console.error(line);
    }
    return { type: 'exit', exitCode: 1 };
  }

  const payload =
    Object.keys(resolvedPayload.payload).length > 0 ? convertPayloadTypes(resolvedPayload.payload, command) : {};
  return { type: 'payload', payload };
}

function resolveCachedIdsForPayload(
  command: string,
  payload: Record<string, any>,
  sessionPath?: string,
): PayloadResolveResult {
  const resolvedPayload: Record<string, any> = { ...payload };
  const hints = loadIdCacheSync(sessionPath);

  for (const [field, value] of Object.entries(payload)) {
    const kind = idKindForCommandField(command, field);
    if (!kind) continue;

    if (Array.isArray(value)) {
      const resolvedArray: string[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          const resolved = resolveCachedId(kind, item, hints);
          if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
          if (resolved.type === 'resolved') resolvedArray.push(resolved.value);
          else resolvedArray.push(item);
        } else {
          resolvedArray.push(String(item));
        }
      }
      resolvedPayload[field] = resolvedArray;
    } else if (typeof value === 'string') {
      const resolved = resolveCachedId(kind, value, hints);
      if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
      if (resolved.type === 'resolved') resolvedPayload[field] = resolved.value;
    }
  }

  return { type: 'payload', payload: resolvedPayload };
}

function displayCommandParseErrors(errors: CommandParseError[], options: GlobalOptions): void {
  if (options.json) {
    printJsonError('validation_error', errors.map((e) => e.message).join('; '));
    return;
  }
  for (const err of errors) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
}

export async function runCommand(
  command: string,
  payload: Record<string, unknown>,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
): Promise<CommandRun> {
  await persistSubmittedCredentials(command, payload, client);

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
  commandRun: CommandRun,
  options: GlobalOptions,
  client: SpaceMoltClient = defaultClient,
): Promise<number> {
  const { command, displayCommand, response } = commandRun;
  const isJson = options.json || options.format === 'json';
  const hasProjection = Boolean(options.jq || (options.fields && options.fields.length > 0));

  if (isJson && response.error) {
    printJsonResponse(response);
    return 1;
  }

  if (!isJson && !hasProjection && response.notifications?.length && !options.quiet) {
    console.log(`${c.dim}--- Notifications (${response.notifications.length}) ---${c.reset}`);
    displayNotifications(response.notifications);
    console.log('');
  }

  if (!isJson && response.error) {
    displayError(displayCommand, response.error, { noTimestamp: options.noTimestamp });
    const sessionPath = getSessionPath(client.config);
    if (shouldShowCachedIdSuggestions(command, response.error)) {
      printCachedIdSuggestions(command, undefined, sessionPath);
    }
    return 1;
  }

  await persistResponseCredentials(command, response, client);
  const sessionPath = getSessionPath(client.config);
  if (!options.dryRun) await cacheIdsFromResponse(command, response, sessionPath);

  if (isJson && !hasProjection) {
    printJsonResponse(response, options.compact);
    return response.error ? 1 : 0;
  }

  const success = displayResult(displayCommand, response, hasProjection ? { ...options, noTimestamp: true } : options);
  return success === false ? 1 : 0;
}

export interface CommandError {
  code: string;
  message: string;
  customStderr?: string;
  errors?: any[];
  exitCode?: number;
}

export interface CommandHandler {
  name: string;
  aliases?: string[];
  requiresNetwork: boolean;
  parse(
    argv: string[],
    options: GlobalOptions,
  ): { ok: true; payload: any } | { ok: false; error: CommandError };
  run(payload: any, options: GlobalOptions, client?: SpaceMoltClient): Promise<any> | any;
  render(runResult: any, options: GlobalOptions, client?: SpaceMoltClient): Promise<number> | number;
}

const profileHandler: CommandHandler = {
  name: 'profile',
  requiresNetwork: false,
  parse(argv, options) {
    const action = argv[1] || 'list';
    if (action !== 'list') {
      return {
        ok: false,
        error: {
          code: 'unknown_command',
          message: `Unknown profile command: ${action}`,
          customStderr: `${c.red}Error:${c.reset} Unknown profile command "${action}"\nUsage: spacemolt profile list`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { action } };
  },
  run(payload, options) {
    showProfiles();
    return { action: payload.action };
  },
  render(result, options) {
    return 0;
  },
};

const commandsHandler: CommandHandler = {
  name: 'commands',
  requiresNetwork: false,
  parse(argv, options) {
    return { ok: true, payload: { args: argv.slice(1) } };
  },
  run(payload, options) {
    return { query: parseCommandSearchQuery(payload.args) };
  },
  render(result, options) {
    showCommandSearch(result.query);
    return 0;
  },
};

const explainHandler: CommandHandler = {
  name: 'explain',
  requiresNetwork: false,
  parse(argv, options) {
    const explainCommand = argv[1];
    if (!explainCommand) {
      return {
        ok: false,
        error: {
          code: 'missing_argument',
          message: 'Missing command name.',
          customStderr: `${c.red}Error:${c.reset} Missing command name.\nUsage: spacemolt explain <command>`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { command: explainCommand } };
  },
  run(payload, options) {
    const found = showCommandExplanation(payload.command);
    return { found, command: payload.command };
  },
  render(result, options) {
    if (!result.found) {
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${result.command}`);
        return 1;
      }
      displayUnknownCommand(result.command);
      return 1;
    }
    return 0;
  },
};

const completionHandler: CommandHandler = {
  name: 'completion',
  requiresNetwork: false,
  parse(argv, options) {
    const shell = argv[1] || 'bash';
    if (!['bash', 'zsh', 'fish'].includes(shell)) {
      return {
        ok: false,
        error: {
          code: 'validation_error',
          message: `Unsupported shell: ${shell}. Use bash, zsh, or fish.`,
          customStderr: `${c.red}Error:${c.reset} Unsupported shell: ${shell}. Use bash, zsh, or fish.`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { shell } };
  },
  run(payload, options) {
    return { completion: generateCompletion(payload.shell) };
  },
  render(result, options) {
    console.log(result.completion);
    return 0;
  },
};

const doctorHandler: CommandHandler = {
  name: 'doctor',
  requiresNetwork: false,
  parse(argv, options) {
    return { ok: true, payload: {} };
  },
  async run(payload, options, client) {
    const doctorResult = await runDoctor(client?.config);
    return { doctorResult };
  },
  render(result, options, client) {
    const { doctorResult } = result;
    if (options.json) {
      console.log(JSON.stringify({ structuredContent: doctorResult }, null, 2));
    } else {
      printDoctorResult(doctorResult);
    }
    return doctorResult.ok ? 0 : 1;
  },
};

const idsHandler: CommandHandler = {
  name: 'ids',
  requiresNetwork: false,
  parse(argv, options) {
    const kind = argv[1];
    if (!kind || !isIdKind(kind)) {
      return {
        ok: false,
        error: {
          code: 'validation_error',
          message: 'Usage: spacemolt ids <poi|system|item|player>',
          customStderr: `${c.red}Error:${c.reset} Usage: spacemolt ids <poi|system|item|player>`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { kind } };
  },
  run(payload, options, client) {
    const sessionPath = client ? getSessionPath(client.config) : undefined;
    const hints = loadIdCacheSync(sessionPath);
    return { kind: payload.kind, hints: hintsForKind(payload.kind, hints) };
  },
  render(result, options, client) {
    if (options.json) {
      console.log(JSON.stringify({ structuredContent: { kind: result.kind, ids: result.hints } }, null, 2));
    } else {
      const sessionPath = client ? getSessionPath(client.config) : undefined;
      printIds(result.kind, sessionPath);
    }
    return 0;
  },
};

const whereCanIHandler: CommandHandler = {
  name: 'where-can-i',
  requiresNetwork: false,
  parse(argv, options) {
    const query = argv.slice(1).join(' ').trim();
    if (!query) {
      return {
        ok: false,
        error: {
          code: 'missing_required_argument',
          message: 'Missing required argument: item',
          customStderr: `${c.red}Error:${c.reset} Usage: spacemolt where-can-i <item>`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { query } };
  },
  run(payload, options, client) {
    const sessionPath = client ? getSessionPath(client.config) : undefined;
    const hints = loadIdCacheSync(sessionPath);
    return { query: payload.query, matches: searchItemHints(payload.query, hints) };
  },
  render(result, options, client) {
    if (options.json) {
      console.log(JSON.stringify({ structuredContent: { query: result.query, matches: result.matches } }, null, 2));
    } else {
      const sessionPath = client ? getSessionPath(client.config) : undefined;
      printWhereCanI(result.query, sessionPath);
    }
    return 0;
  },
};

const versionHandler: CommandHandler = {
  name: 'version',
  aliases: ['--version', '-v'],
  requiresNetwork: false,
  parse(argv, options) {
    return { ok: true, payload: {} };
  },
  run(payload, options) {
    return {};
  },
  render(result, options) {
    console.log(`SpaceMolt Client v${VERSION}`);
    console.log(`API: ${API_BASE}`);
    return 0;
  },
};

const localHelpHandler: CommandHandler = {
  name: 'help',
  aliases: ['--help', '-h'],
  requiresNetwork: false,
  parse(argv, options) {
    const commandName = argv[0];
    const subArgs = argv.slice(1);

    if (argv.length === 0) {
      return { ok: true, payload: { type: 'showHelp' } };
    }

    if (commandName === '--help' || commandName === '-h') {
      const helpCommand = subArgs[0];
      if (helpCommand) {
        return { ok: true, payload: { type: 'helpCommand', target: helpCommand } };
      }
      return { ok: true, payload: { type: 'showHelpAndGroups' } };
    }

    const target = subArgs[0];
    if (!target) {
      return { ok: true, payload: { type: 'progressiveOrHelp' } };
    }

    if (target === 'all') {
      return { ok: true, payload: { type: 'helpAll' } };
    }

    if (showCommandGroup(target)) {
      return { ok: true, payload: { type: 'helpGroup', target } };
    }

    return { ok: true, payload: { type: 'showHelp' } };
  },
  async run(payload, options) {
    return payload;
  },
  async render(result, options) {
    const { type, target } = result;
    if (type === 'showHelp') {
      showHelp();
      return 0;
    }
    if (type === 'showHelpAndGroups') {
      showHelp();
      showCommandGroups();
      return 0;
    }
    if (type === 'helpAll') {
      showFullHelp();
      return 0;
    }
    if (type === 'helpGroup' && target) {
      showCommandGroup(target);
      return 0;
    }
    if (type === 'progressiveOrHelp') {
      if (options.watch) {
        showHelp();
      } else {
        await showProgressiveHelp();
      }
      return 0;
    }
    if (type === 'helpCommand' && target) {
      if (showCommandHelp(target) || showCommandGroup(target)) {
        return 0;
      }
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${target}`);
        return 1;
      }
      displayUnknownCommand(target);
      return 1;
    }
    return 0;
  },
};

class ApiCommandHandler implements CommandHandler {
  constructor(public name: string) {}
  requiresNetwork = true;

  parse(argv: string[], options: GlobalOptions): { ok: true; payload: any } | { ok: false; error: CommandError } {
    const parsedArgs = parseArgs(argv, { allowUnknown: options.allowUnknown });
    if (!parsedArgs.ok) {
      return {
        ok: false,
        error: {
          code: 'validation_error',
          message: parsedArgs.errors.map((e) => e.message).join('; '),
          errors: parsedArgs.errors,
          exitCode: 1,
        },
      };
    }

    const config = getRuntimeConfig(options);
    const sessionPath = getSessionPath(config);

    const prepared = preparePayload(this.name, parsedArgs.payload, options, sessionPath);
    if (prepared.type === 'exit') {
      return {
        ok: false,
        error: {
          code: 'exit',
          message: '',
          exitCode: prepared.exitCode,
        },
      };
    }

    return { ok: true, payload: prepared.payload };
  }

  async run(payload: any, options: GlobalOptions, client?: SpaceMoltClient) {
    return runCommand(this.name, payload, options, client);
  }

  async render(runResult: any, options: GlobalOptions, client?: SpaceMoltClient) {
    return renderResponse(runResult, options, client);
  }
}

class CommandRegistry {
  private handlers = new Map<string, CommandHandler>();

  register(handler: CommandHandler) {
    this.handlers.set(handler.name, handler);
    if (handler.aliases) {
      for (const alias of handler.aliases) {
        this.handlers.set(alias, handler);
      }
    }
  }

  get(name: string): CommandHandler | undefined {
    return this.handlers.get(name);
  }
}

const registry = new CommandRegistry();
registry.register(profileHandler);
registry.register(commandsHandler);
registry.register(explainHandler);
registry.register(completionHandler);
registry.register(doctorHandler);
registry.register(idsHandler);
registry.register(whereCanIHandler);
registry.register(versionHandler);

function resolveHandler(argv: string[], options: GlobalOptions): CommandHandler | undefined {
  const commandName = argv[0];

  if (
    argv.length === 0 ||
    commandName === '--help' ||
    commandName === '-h' ||
    (commandName === 'help' && (!argv[1] || argv[1] === 'all' || showCommandGroup(argv[1])))
  ) {
    return localHelpHandler;
  }

  if (commandName) {
    const handler = registry.get(commandName);
    if (handler) return handler;
  }

  if (commandName && COMMANDS[commandName]) {
    return new ApiCommandHandler(commandName);
  }

  return undefined;
}

export async function runInvocation(argv: string[], client?: SpaceMoltClient): Promise<number> {
  const parsedInvocation = parseInvocation(argv);
  if (!parsedInvocation.ok) {
    console.error(`${c.red}Error:${c.reset} ${parsedInvocation.error.message}`);
    return 1;
  }
  const { invocation } = parsedInvocation;

  if (!invocation.options.json && !invocation.options.quiet && !invocation.options.watch) {
    checkForUpdates();
  }

  const handler = resolveHandler(invocation.args, invocation.options);

  const config = getRuntimeConfig(invocation.options);
  const activeClient = client ?? new SpaceMoltClient({ config });

  if (invocation.options.watch) {
    if (!handler) {
      const commandName = invocation.args[0] || 'help';
      if (invocation.options.json) {
        printJsonError('unknown_command', `Unknown command: ${commandName}`);
      } else {
        displayUnknownCommand(commandName);
      }
      return 1;
    }
    return runWatchLoop(invocation, handler, activeClient);
  }

  if (!handler) {
    const commandName = invocation.args[0] || 'help';
    if (invocation.options.json) {
      printJsonError('unknown_command', `Unknown command: ${commandName}`);
    } else {
      displayUnknownCommand(commandName);
    }
    return 1;
  }

  try {
    const parsed = handler.parse(invocation.args, invocation.options);
    if (!parsed.ok) {
      if (parsed.error.code === 'validation_error' && parsed.error.errors) {
        displayCommandParseErrors(parsed.error.errors, invocation.options);
      } else if (parsed.error.code !== 'exit') {
        if (invocation.options.json) {
          printJsonError(parsed.error.code, parsed.error.message);
        } else if (parsed.error.customStderr) {
          console.error(parsed.error.customStderr);
        } else {
          console.error(`${c.red}Error:${c.reset} ${parsed.error.message}`);
        }
      }
      return parsed.error.exitCode ?? 1;
    }

    const runResult = await handler.run(parsed.payload, invocation.options, activeClient);
    return await handler.render(runResult, invocation.options, activeClient);
  } catch (error) {
    return renderConnectionError(error, invocation.options);
  }
}

function shouldShowCachedIdSuggestions(command: string, error: { code: string; message: string }): boolean {
  if (!idKindForCommandField(command)) return false;
  const text = `${error.code} ${error.message}`.toLowerCase();
  return /invalid|unknown|not_found|not found|missing/.test(text);
}

async function runWatchLoop(invocation: Invocation, handler: CommandHandler, client: SpaceMoltClient): Promise<number> {
  const interval = invocation.options.watch;
  if (!interval) return 0;

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on('SIGINT', stop);

  while (running) {
    try {
      const parsed = handler.parse(invocation.args, invocation.options);
      if (!parsed.ok) {
        if (parsed.error.code === 'validation_error' && parsed.error.errors) {
          displayCommandParseErrors(parsed.error.errors, invocation.options);
        } else if (parsed.error.code !== 'exit') {
          if (invocation.options.json) {
            printJsonError(parsed.error.code, parsed.error.message);
          } else if (parsed.error.customStderr) {
            console.error(parsed.error.customStderr);
          } else {
            console.error(`${c.red}Error:${c.reset} ${parsed.error.message}`);
          }
        }
        return parsed.error.exitCode ?? 1;
      }

      const runResult = await handler.run(parsed.payload, invocation.options, client);

      process.stdout.write('\x1b[2J\x1b[H');

      const watchOptions: GlobalOptions = {
        ...invocation.options,
        noTimestamp: true,
      };
      await handler.render(runResult, watchOptions, client);

      if (running) {
        console.log(`${c.dim}[next refresh in ${interval}s — Ctrl+C to stop]${c.reset}`);
        await sleep(interval * 1000);
      }
    } catch (error) {
      return renderConnectionError(error, invocation.options);
    }
  }

  process.removeListener('SIGINT', stop);
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function persistSubmittedCredentials(
  command: string,
  payload: Record<string, unknown>,
  client: SpaceMoltClient,
): Promise<void> {
  if (command === 'login' && typeof payload.username === 'string' && typeof payload.password === 'string') {
    const session = await client.sessionStore.getSession();
    session.username = payload.username;
    session.password = payload.password;
    await client.sessionStore.saveSession(session);
    if (client.debug) console.log(`${c.dim}[DEBUG] Saved credentials to session${c.reset}`);
  }

  if (command === 'register' && typeof payload.username === 'string') {
    const session = await client.sessionStore.getSession();
    session.username = payload.username;
    await client.sessionStore.saveSession(session);
  }
}

async function persistResponseCredentials(
  command: string,
  response: APIResponse,
  client: SpaceMoltClient,
): Promise<void> {
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
      const session = await client.sessionStore.loadSession();
      if (session) {
        session.password = password;
        if (playerId) session.player_id = playerId;
        await client.sessionStore.saveSession(session);
        if (client.debug) console.log(`${c.dim}[DEBUG] Saved password to session${c.reset}`);
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
      const session = await client.sessionStore.loadSession();
      if (session) {
        session.player_id = playerId;
        await client.sessionStore.saveSession(session);
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

export async function main(): Promise<CliResult> {
  const exitCode = await runInvocation(process.argv.slice(2));
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
