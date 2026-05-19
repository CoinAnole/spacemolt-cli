import { defaultClient, type SpaceMoltClient } from './api.ts';
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
import {
  displayError,
  displayMissingArgument,
  displayUnknownCommand,
  hasCommandGroup,
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
  loadIdCacheSync,
  printCachedIdSuggestions,
  printIds,
  printWhereCanI,
  resolveCachedId,
  searchItemHints,
} from './id-cache.ts';
import { displayNotifications } from './notifications.ts';
import { createDryRunResponse, getServerPreviewCommand } from './preview.ts';
import { API_BASE, c, DEFAULT_V2_API_BASE, type SpaceMoltConfig, VERSION } from './runtime.ts';
import { getSessionPath, showProfiles } from './session.ts';
import type { APIResponse, GlobalOptions } from './types.ts';

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

export type CommandStatus = { type: 'exit'; exitCode: number };
export type PreparedPayload = CommandStatus | { type: 'payload'; payload: Record<string, unknown> };

type PayloadResolveResult =
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  | { type: 'payload'; payload: Record<string, any> }
  | { type: 'ambiguous'; field: string; result: Extract<CachedIdResolveResult, { type: 'ambiguous' }> };

export interface CommandError {
  code: string;
  message: string;
  customStderr?: string;
  errors?: CommandParseError[];
  exitCode?: number;
}

export interface CommandHandler {
  name: string;
  aliases?: string[];
  requiresNetwork: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  parse(argv: string[], options: GlobalOptions): { ok: true; payload: any } | { ok: false; error: CommandError };
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  run(payload: any, options: GlobalOptions, client?: SpaceMoltClient): Promise<any> | any;
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  render(runResult: any, options: GlobalOptions, client?: SpaceMoltClient): Promise<number> | number;
}

const profileHandler: CommandHandler = {
  name: 'profile',
  requiresNetwork: false,
  parse(argv, _options) {
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
  run(payload, _options) {
    showProfiles();
    return { action: payload.action };
  },
  render(_result, _options) {
    return 0;
  },
};

const commandsHandler: CommandHandler = {
  name: 'commands',
  requiresNetwork: false,
  parse(argv, _options) {
    return { ok: true, payload: { args: argv.slice(1) } };
  },
  run(payload, _options) {
    return { query: parseCommandSearchQuery(payload.args) };
  },
  render(result, _options) {
    showCommandSearch(result.query);
    return 0;
  },
};

const explainHandler: CommandHandler = {
  name: 'explain',
  requiresNetwork: false,
  parse(argv, _options) {
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
  run(payload, _options) {
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
  parse(argv, _options) {
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
  run(payload, _options) {
    return { completion: generateCompletion(payload.shell) };
  },
  render(result, _options) {
    console.log(result.completion);
    return 0;
  },
};

const doctorHandler: CommandHandler = {
  name: 'doctor',
  requiresNetwork: false,
  parse(_argv, _options) {
    return { ok: true, payload: {} };
  },
  async run(_payload, _options, client) {
    const doctorResult = await runDoctor(client?.config);
    return { doctorResult };
  },
  render(result, options, _client) {
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
  parse(argv, _options) {
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
  run(payload, _options, client) {
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
  parse(argv, _options) {
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
  run(payload, _options, client) {
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
  parse(_argv, _options) {
    return { ok: true, payload: {} };
  },
  run(_payload, _options) {
    return {};
  },
  render(_result, _options) {
    console.log(`SpaceMolt Client v${VERSION}`);
    console.log(`API: ${API_BASE}`);
    return 0;
  },
};

const localHelpHandler: CommandHandler = {
  name: 'help',
  aliases: ['--help', '-h'],
  requiresNetwork: false,
  parse(argv, _options) {
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

    if (hasCommandGroup(target)) {
      return { ok: true, payload: { type: 'helpGroup', target } };
    }

    return { ok: true, payload: { type: 'showHelp' } };
  },
  async run(payload, _options) {
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
      if (showCommandHelp(target) || (hasCommandGroup(target) && showCommandGroup(target))) {
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

export class ApiCommandHandler implements CommandHandler {
  constructor(public name: string) {}
  requiresNetwork = true;

  // biome-ignore lint/suspicious/noExplicitAny: generic payload
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

  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  async run(payload: any, options: GlobalOptions, client?: SpaceMoltClient) {
    return runCommand(this.name, payload, options, client);
  }

  // biome-ignore lint/suspicious/noExplicitAny: generic payload
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

export const registry = new CommandRegistry();
registry.register(profileHandler);
registry.register(commandsHandler);
registry.register(explainHandler);
registry.register(completionHandler);
registry.register(doctorHandler);
registry.register(idsHandler);
registry.register(whereCanIHandler);
registry.register(versionHandler);

export function resolveHandler(argv: string[], _options: GlobalOptions): CommandHandler | undefined {
  const commandName = argv[0];

  if (
    argv.length === 0 ||
    commandName === '--help' ||
    commandName === '-h' ||
    (commandName === 'help' && (!argv[1] || argv[1] === 'all' || hasCommandGroup(argv[1])))
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

export function preparePayload(
  command: string,
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
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
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
  payload: Record<string, any>,
  sessionPath?: string,
): PayloadResolveResult {
  // biome-ignore lint/suspicious/noExplicitAny: generic payload
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

export function displayCommandParseErrors(errors: CommandParseError[], options: GlobalOptions): void {
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
): Promise<{ command: string; displayCommand: string; response: APIResponse }> {
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
  commandRun: { command: string; displayCommand: string; response: APIResponse },
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
