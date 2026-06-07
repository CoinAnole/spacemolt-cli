import { ApiCommandHandler, hasApiCommand } from './api-command-handler.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandHandler } from './command-types.ts';
import type { CommandConfig, LocalCommandConfig } from './commands.ts';
import { generateCompletion } from './completion.ts';
import {
  type CompletionCandidate,
  type CompletionRequest,
  completeWords,
  formatCompletionCandidates,
} from './completion-runtime.ts';
import { type DoctorResult, printDoctorResult, runDoctor } from './doctor.ts';
import { GENERATED_API_GAMESERVER_VERSION } from './generated/api-commands.ts';
import {
  displayUnknownCommand,
  getUsageLine,
  hasCommandGroup,
  parseCommandSearchQuery,
  printJsonError,
  showCommandExplanation,
  showCommandGroup,
  showCommandGroups,
  showCommandSearch,
  showFullHelp,
  showHelp,
  showProgressiveHelp,
} from './help.ts';
import {
  hintsForKind,
  type IdHint,
  type IdKind,
  isIdKind,
  loadIdCacheSync,
  printIds,
  printWhereCanI,
  searchIdHints,
  searchItemHints,
} from './id-cache.ts';
import {
  defaultOpenApiCacheDir,
  loadOpenApiCacheVersion,
  type OpenApiCacheFile,
  refreshOpenApiCache,
} from './openapi-cache.ts';
import { type CommandRunResult, renderResponse, runCommand } from './response-renderer.ts';
import { API_BASE, VERSION } from './runtime.ts';
import { getRuntimeConfig } from './runtime-config.ts';
import {
  getSessionPath,
  listProfileNames,
  setDefaultProfile,
  showDefaultProfile,
  showProfiles,
  tryGetSessionPath,
} from './session.ts';
import type { GlobalOptions } from './types.ts';

function writeJson(context: CliRuntimeContext | undefined, value: unknown, space: number | undefined = 2): void {
  const json = JSON.stringify(value, null, space);
  if (context) context.writer.out(json);
  else console.log(json);
}

function localOutputOptions(options: GlobalOptions, context?: CliRuntimeContext): { plain?: boolean; quiet?: boolean } {
  return {
    plain: context?.config?.plain ?? context?.output?.plain ?? options.plain,
    quiet: context?.config?.quiet ?? context?.output?.quiet ?? options.quiet,
  };
}

function compareGameserverVersions(left: string, right: string): number | undefined {
  const parse = (value: string): [number, number, number] | undefined => {
    const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
    if (!match) return undefined;
    return [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const leftParts = parse(left);
  const rightParts = parse(right);
  if (!leftParts || !rightParts) return undefined;
  const [leftMajor, leftMinor, leftPatch] = leftParts;
  const [rightMajor, rightMinor, rightPatch] = rightParts;
  if (leftMajor !== rightMajor) return leftMajor - rightMajor;
  if (leftMinor !== rightMinor) return leftMinor - rightMinor;
  if (leftPatch !== rightPatch) return leftPatch - rightPatch;
  return 0;
}

function describeOpenApiCacheState(cachedVersion: string, bundledVersion: string): string {
  const comparison = compareGameserverVersions(cachedVersion, bundledVersion);
  if (comparison === 0) return 'current';
  if (comparison === undefined) return cachedVersion === bundledVersion ? 'current' : 'different from bundled';
  return comparison > 0 ? 'newer than bundled' : 'stale';
}

type ProfilePayload = { action: 'list' } | { action: 'default'; name?: string };

const PROFILE_USAGE = 'spacemolt profile [list|default [name]]';

const profileHandler: CommandHandler<ProfilePayload, ProfilePayload> = {
  name: 'profile',
  requiresNetwork: false,
  parse(argv) {
    const action = argv[1] || 'list';
    if (action === 'list') return { ok: true, payload: { action } };
    if (action === 'default') return { ok: true, payload: { action, name: argv[2] } };
    return {
      ok: false,
      error: {
        code: 'unknown_command',
        message: `Unknown profile command: ${action}`,
        customStderr: `Error: Unknown profile command "${action}"\nUsage: ${PROFILE_USAGE}`,
        exitCode: 1,
      },
    };
  },
  run(payload, options, _client, context) {
    if (payload.action === 'list') {
      showProfiles(context?.env.HOME, context?.writer, context?.env, { plain: options.plain });
      return payload;
    }
    if (payload.name) {
      setDefaultProfile(payload.name, context?.env.HOME, undefined, context?.env);
    }
    showDefaultProfile(context?.writer, context?.env.HOME, undefined, context?.env);
    return payload;
  },
  render() {
    return 0;
  },
};

function createCommandsHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<{ args: string[] }, { query: ReturnType<typeof parseCommandSearchQuery> }> {
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  return {
    name: 'commands',
    requiresNetwork: false,
    parse(argv) {
      return { ok: true, payload: { args: argv.slice(1) } };
    },
    run(payload) {
      return { query: parseCommandSearchQuery(payload.args) };
    },
    render(result, options, _client, context) {
      showCommandSearch(result.query, context?.writer, allCommands, localOutputOptions(options, context));
      return 0;
    },
  };
}

const commandsHandler = createCommandsHandler();

function createExplainHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<{ command: string }, { found: boolean; command: string }> {
  return {
    name: 'explain',
    requiresNetwork: false,
    parse(argv) {
      const explainCommand = argv[1];
      if (!explainCommand) {
        return {
          ok: false,
          error: {
            code: 'missing_argument',
            message: 'Missing command name.',
            customStderr: `Error: Missing command name.\nUsage: spacemolt explain <command>`,
            exitCode: 1,
          },
        };
      }
      return { ok: true, payload: { command: explainCommand } };
    },
    run(payload) {
      const found = Boolean(registrySnapshot.commands[payload.command]);
      return { found, command: payload.command };
    },
    render(result, options, _client, context) {
      if (!result.found) {
        if (options.json) {
          const json = JSON.stringify(
            { error: { code: 'unknown_command', message: `Unknown command: ${result.command}` } },
            null,
            2,
          );
          if (context) context.writer.out(json);
          else printJsonError('unknown_command', `Unknown command: ${result.command}`);
          return 1;
        }
        displayUnknownCommand(result.command, context?.writer, {
          plain: context?.config?.plain ?? context?.output?.plain,
        });
        return 1;
      }
      showCommandExplanation(
        result.command,
        context?.writer,
        registrySnapshot.allCommands ?? registrySnapshot.commands,
        localOutputOptions(options, context),
      );
      return 0;
    },
  };
}

const explainHandler = createExplainHandler();

function createCompletionHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<{ shell: string }, { completion: string }> {
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  return {
    name: 'completion',
    requiresNetwork: false,
    parse(argv) {
      const shell = argv[1] || 'bash';
      if (!['bash', 'zsh', 'fish'].includes(shell)) {
        return {
          ok: false,
          error: {
            code: 'validation_error',
            message: `Unsupported shell: ${shell}. Use bash, zsh, or fish.`,
            customStderr: `Error: Unsupported shell: ${shell}. Use bash, zsh, or fish.`,
            exitCode: 1,
          },
        };
      }
      return { ok: true, payload: { shell } };
    },
    run(payload) {
      return { completion: generateCompletion(payload.shell, { allCommands }) };
    },
    render(result, _options, _client, context) {
      if (context) context.writer.out(result.completion);
      else console.log(result.completion);
      return 0;
    },
  };
}

const completionHandler = createCompletionHandler();

function completionProfileFromWords(words: string[]): string | undefined {
  const firstArgIndex = words[0] === 'spacemolt' ? 1 : 0;
  const lastCompletedWordIndex = Math.max(firstArgIndex, words.length - 2);
  for (let i = firstArgIndex; i <= lastCompletedWordIndex; i += 1) {
    const word = words[i];
    if (!word) continue;
    if (word === '--profile') {
      if (i + 1 <= lastCompletedWordIndex) return words[i + 1] || undefined;
      continue;
    }
    if (word.startsWith('--profile=')) return word.slice('--profile='.length) || undefined;
  }
  return undefined;
}

function completionSessionPath(
  payload: CompletionRequest,
  client: Parameters<CommandHandler<CompletionRequest>['run']>[2],
  context: Parameters<CommandHandler<CompletionRequest>['run']>[3],
): string | undefined {
  const typedProfile = completionProfileFromWords(payload.words);
  if (typedProfile) {
    try {
      return getSessionPath({ profile: typedProfile }, context?.env);
    } catch {
      return undefined;
    }
  }
  return client ? tryGetSessionPath(client.config, context?.env) : undefined;
}

function createDynamicCompletionHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<CompletionRequest, { candidates: CompletionCandidate[] }> {
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  return {
    name: '__complete',
    requiresNetwork: false,
    parse(argv) {
      const shell = argv[1];
      if (shell !== 'bash' && shell !== 'zsh' && shell !== 'fish') {
        return {
          ok: false,
          error: {
            code: 'validation_error',
            message: `Unsupported shell: ${shell || ''}. Use bash, zsh, or fish.`,
            customStderr: `Error: Unsupported shell: ${shell || ''}. Use bash, zsh, or fish.`,
            exitCode: 1,
          },
        };
      }

      const separatorIndex = argv.indexOf('--');
      const words = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv.slice(2);
      return { ok: true, payload: { shell, words, current: words.at(-1) || '' } };
    },
    run(payload, _options, client, context) {
      const sessionPath = completionSessionPath(payload, client, context);
      return {
        candidates: completeWords(payload, {
          registrySnapshot: { ...registrySnapshot, allCommands },
          sessionPath,
          profileNames: listProfileNames(context?.env.HOME, undefined, context?.env),
        }),
      };
    },
    render(result, _options, _client, context) {
      const output = formatCompletionCandidates(result.candidates);
      if (context?.writer.writeOut) context.writer.writeOut(output);
      else if (context && output) context.writer.out(output.endsWith('\n') ? output.slice(0, -1) : output);
      else process.stdout.write(output);
      return 0;
    },
  };
}

const doctorHandler: CommandHandler<Record<string, never>, { doctorResult: DoctorResult }> = {
  name: 'doctor',
  requiresNetwork: false,
  parse() {
    return { ok: true, payload: {} };
  },
  async run(_payload, _options, client, context) {
    const doctorResult = await runDoctor(client?.config, context?.env as NodeJS.ProcessEnv | undefined);
    return { doctorResult };
  },
  render(result, options, _client, context) {
    const { doctorResult } = result;
    if (options.json) {
      writeJson(context, { structuredContent: doctorResult });
    } else {
      printDoctorResult(doctorResult, context?.writer, localOutputOptions(options, context));
    }
    return doctorResult.ok ? 0 : 1;
  },
};

function parseSearchArg(argv: string[], startIndex: number): string | undefined {
  for (let i = startIndex; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--search' || arg === '-s')
      return (
        argv
          .slice(i + 1)
          .join(' ')
          .trim() || undefined
      );
    if (arg.startsWith('--search=')) return arg.slice('--search='.length).trim() || undefined;
    if (arg.startsWith('search=')) return arg.slice('search='.length).trim() || undefined;
  }
  return undefined;
}

const idsHandler: CommandHandler<
  { kind: IdKind; search?: string },
  { kind: IdKind; hints: IdHint[]; search?: string }
> = {
  name: 'ids',
  requiresNetwork: false,
  parse(argv) {
    const kind = argv[1];
    if (!kind || !isIdKind(kind)) {
      return {
        ok: false,
        error: {
          code: 'validation_error',
          message:
            'Usage: spacemolt ids <poi|system|item|player|ship|faction|drone|wreck|facility|listing> [--search text]',
          customStderr:
            'Error: Usage: spacemolt ids <poi|system|item|player|ship|faction|drone|wreck|facility|listing> [--search text]',
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { kind, search: parseSearchArg(argv, 2) } };
  },
  run(payload, _options, client, context) {
    const sessionPath = client ? tryGetSessionPath(client.config, context?.env) : undefined;
    const hints = loadIdCacheSync(sessionPath);
    return {
      kind: payload.kind,
      search: payload.search,
      hints: payload.search ? searchIdHints(payload.kind, payload.search, hints) : hintsForKind(payload.kind, hints),
    };
  },
  render(result, options, client, context) {
    if (options.json) {
      writeJson(context, { structuredContent: { kind: result.kind, search: result.search, ids: result.hints } });
    } else {
      const sessionPath = client ? tryGetSessionPath(client.config, context?.env) : undefined;
      printIds(result.kind, sessionPath, context?.writer, result.search, {
        plain: context?.config?.plain ?? context?.output?.plain,
      });
    }
    return 0;
  },
};

const whereCanIHandler: CommandHandler<{ query: string }, { query: string; matches: IdHint[] }> = {
  name: 'where-can-i',
  requiresNetwork: false,
  parse(argv) {
    const query = argv.slice(1).join(' ').trim();
    if (!query) {
      return {
        ok: false,
        error: {
          code: 'missing_required_argument',
          message: 'Missing required argument: item',
          customStderr: 'Error: Usage: spacemolt where-can-i <item>',
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { query } };
  },
  run(payload, _options, client, context) {
    const sessionPath = client ? tryGetSessionPath(client.config, context?.env) : undefined;
    const hints = loadIdCacheSync(sessionPath);
    return { query: payload.query, matches: searchItemHints(payload.query, hints) };
  },
  render(result, options, client, context) {
    if (options.json) {
      writeJson(context, { structuredContent: { query: result.query, matches: result.matches } });
    } else {
      const sessionPath = client ? tryGetSessionPath(client.config, context?.env) : undefined;
      printWhereCanI(result.query, sessionPath, context?.writer, {
        plain: context?.config?.plain ?? context?.output?.plain,
      });
    }
    return 0;
  },
};

type ServerHelpPayload = { topic?: string };

const SERVER_HELP_COMMAND_CONFIG: CommandConfig = {
  route: { tool: 'spacemolt', action: 'help', method: 'POST' },
  usage: '[topic]',
  description: 'Fetch live gameserver help for an action, category, or keyword.',
  category: 'Reference & Help',
  args: [{ rest: 'topic' }],
  required: [],
};

function parseServerHelpTopic(argv: string[], startIndex: number): ServerHelpPayload {
  const topic = argv.slice(startIndex).join(' ').trim();
  return topic ? { topic } : {};
}

const syncApiHandler: CommandHandler<Record<string, never>, { cache: OpenApiCacheFile }> = {
  name: 'sync-api',
  requiresNetwork: true,
  parse() {
    return { ok: true, payload: {} };
  },
  async run(_payload, options, _client, context) {
    const config = context?.config || getRuntimeConfig(options, context?.env);
    const cache = await refreshOpenApiCache({
      apiBase: config.apiBase,
      cacheDir: defaultOpenApiCacheDir(context?.env),
    });
    return { cache };
  },
  render(result, options, _client, context) {
    const routeCount = Object.keys(result.cache.routes).length;
    const out = context?.writer.out.bind(context.writer) ?? console.log;
    if (options.json) {
      writeJson(
        context,
        { fetchedAt: result.cache.fetchedAt, routeCount, gameserverVersion: result.cache.gameserverVersion },
        undefined,
      );
    } else {
      out(`Synced ${routeCount} OpenAPI routes for gameserver ${result.cache.gameserverVersion}.`);
    }
    return 0;
  },
};

const SERVER_HELP_TOOL_KEYS = ['tool', 'tool_name', 'server_tool'] as const;
const SERVER_HELP_ACTION_KEYS = ['action', 'action_name', 'command'] as const;

function stringValueForAnyKey(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const candidate = record[key];
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  return undefined;
}

function extractServerHelpTargetFromValue(value: unknown): { tool: string; action: string } | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const tool = stringValueForAnyKey(record, SERVER_HELP_TOOL_KEYS);
  const action = stringValueForAnyKey(record, SERVER_HELP_ACTION_KEYS);
  if (tool && action) return { tool, action };
  for (const nested of Object.values(record)) {
    const target = extractServerHelpTargetFromValue(nested);
    if (target) return target;
  }
  return undefined;
}

function extractServerHelpTarget(result: CommandRunResult): { tool: string; action: string } | undefined {
  return (
    extractServerHelpTargetFromValue(result.response.structuredContent) ??
    extractServerHelpTargetFromValue(result.response.result)
  );
}

function findLocalCommandForServerTarget(
  target: { tool: string; action: string },
  commands: Record<string, CommandConfig | LocalCommandConfig>,
): string | undefined {
  const matches = Object.entries(commands)
    .filter(
      (entry): entry is [string, CommandConfig] =>
        'route' in entry[1] && entry[1].route.tool === target.tool && entry[1].route.action === target.action,
    )
    .map(([command]) => command)
    .sort((a, b) => a.localeCompare(b));
  return matches.length === 1 ? matches[0] : undefined;
}

function shouldPrintServerHelpLocalMapping(options: GlobalOptions): boolean {
  return (
    !options.json &&
    options.format !== 'json' &&
    options.format !== 'yaml' &&
    !options.compact &&
    !options.structured &&
    !options.jq &&
    !options.field &&
    !options.fields?.length
  );
}

function printServerHelpLocalMapping(
  result: CommandRunResult,
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> & Partial<Pick<CommandRegistrySnapshot, 'allCommands'>>,
  context?: CliRuntimeContext,
): void {
  const target = extractServerHelpTarget(result);
  if (!target) return;
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  const localCommand = findLocalCommandForServerTarget(target, allCommands);
  if (!localCommand) return;
  const writer = context?.writer.out.bind(context.writer) ?? console.log;
  writer('');
  writer('CLI command:');
  writer(`  ${getUsageLine(localCommand, allCommands)}`);
}

function createServerHelpHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<ServerHelpPayload, CommandRunResult> {
  return {
    name: 'server-help',
    requiresNetwork: true,
    parse(argv) {
      const startIndex = argv[0] === 'help' && argv[1] === '--server' ? 2 : 1;
      return { ok: true, payload: parseServerHelpTopic(argv, startIndex) };
    },
    run(payload, options, client) {
      return runCommand('server-help', payload, options, client, SERVER_HELP_COMMAND_CONFIG);
    },
    async render(result, options, client, context) {
      const exitCode = await renderResponse(result, options, client, context);
      if (exitCode === 0 && shouldPrintServerHelpLocalMapping(options)) {
        printServerHelpLocalMapping(result, registrySnapshot, context);
      }
      return exitCode;
    },
  };
}

const versionHandler: CommandHandler<Record<string, never>, Record<string, never>> = {
  name: 'version',
  aliases: ['--version', '-v'],
  requiresNetwork: false,
  parse() {
    return { ok: true, payload: {} };
  },
  run() {
    return {};
  },
  render(_result, _options, _client, context) {
    const out = context?.writer.out.bind(context.writer) ?? console.log;
    const cachedVersion = loadOpenApiCacheVersion(defaultOpenApiCacheDir(context?.env));
    out(`SpaceMolt Client v${VERSION}`);
    out(`API: ${API_BASE}`);
    out(`Bundled OpenAPI metadata: gameserver ${GENERATED_API_GAMESERVER_VERSION}`);
    if (cachedVersion.status === 'not_synced') {
      out('Cached OpenAPI metadata: not synced');
    } else if (cachedVersion.status === 'invalid') {
      out('Cached OpenAPI metadata: invalid (run spacemolt sync-api)');
    } else {
      const cacheState = describeOpenApiCacheState(cachedVersion.gameserverVersion, GENERATED_API_GAMESERVER_VERSION);
      out(`Cached OpenAPI metadata: gameserver ${cachedVersion.gameserverVersion} (${cacheState})`);
    }
    return 0;
  },
};

type HelpPayload =
  | { type: 'showHelp' }
  | { type: 'showHelpAndGroups' }
  | { type: 'progressiveOrHelp' }
  | { type: 'helpAll' }
  | { type: 'helpGroup'; target: string }
  | { type: 'helpCommand'; target: string }
  | { type: 'helpSearch'; query: ReturnType<typeof parseCommandSearchQuery> };

function createLocalHelpHandler(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler<HelpPayload, HelpPayload> {
  const allCommands = registrySnapshot.allCommands ?? registrySnapshot.commands;
  return {
    name: 'help',
    aliases: ['--help', '-h'],
    requiresNetwork: false,
    parse(argv) {
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

      if (
        commandName &&
        hasCommandGroup(commandName) &&
        (subArgs[0] === '--help' || subArgs[0] === '-h' || subArgs[0] === 'help')
      ) {
        return { ok: true, payload: { type: 'helpGroup', target: commandName } };
      }

      const target = subArgs[0];
      if (!target) {
        return { ok: true, payload: { type: 'progressiveOrHelp' } };
      }

      if (subArgs.length === 1 && (target === '--help' || target === '-h')) {
        return { ok: true, payload: { type: 'showHelpAndGroups' } };
      }

      const normalizedSubArgs =
        subArgs.length === 1 && target.startsWith('command=') ? [target.slice('command='.length)] : subArgs;
      const normalizedTarget = normalizedSubArgs[0];

      if (target === 'all') {
        return { ok: true, payload: { type: 'helpAll' } };
      }

      if (normalizedSubArgs.length === 1 && normalizedTarget && allCommands[normalizedTarget]) {
        return { ok: true, payload: { type: 'helpCommand', target: normalizedTarget } };
      }

      if (normalizedSubArgs.length === 1 && normalizedTarget && hasCommandGroup(normalizedTarget)) {
        return { ok: true, payload: { type: 'helpGroup', target: normalizedTarget } };
      }

      return { ok: true, payload: { type: 'helpSearch', query: parseCommandSearchQuery(normalizedSubArgs) } };
    },
    async run(payload) {
      return payload;
    },
    async render(result, options, _client, context) {
      if (result.type === 'showHelp') {
        showHelp(context?.writer, localOutputOptions(options, context));
        return 0;
      }
      if (result.type === 'showHelpAndGroups') {
        showHelp(context?.writer, localOutputOptions(options, context));
        showCommandGroups(context?.writer, allCommands, localOutputOptions(options, context));
        return 0;
      }
      if (result.type === 'helpAll') {
        showFullHelp(context?.writer, allCommands, localOutputOptions(options, context));
        return 0;
      }
      if (result.type === 'helpGroup') {
        showCommandGroup(result.target, context?.writer, allCommands, localOutputOptions(options, context));
        return 0;
      }
      if (result.type === 'progressiveOrHelp') {
        if (options.watch) {
          showHelp(context?.writer, localOutputOptions(options, context));
        } else {
          await showProgressiveHelp(context?.writer, localOutputOptions(options, context));
        }
        return 0;
      }
      if (result.type === 'helpSearch') {
        showCommandSearch(result.query, context?.writer, allCommands, localOutputOptions(options, context));
        return 0;
      }
      if (result.type === 'helpCommand') {
        if (
          showCommandExplanation(result.target, context?.writer, allCommands, localOutputOptions(options, context)) ||
          (hasCommandGroup(result.target) &&
            showCommandGroup(result.target, context?.writer, allCommands, localOutputOptions(options, context)))
        ) {
          return 0;
        }
        if (options.json) {
          printJsonError('unknown_command', `Unknown command: ${result.target}`, context?.writer);
          return 1;
        }
        displayUnknownCommand(result.target, context?.writer, {
          plain: context?.config?.plain ?? context?.output?.plain,
        });
        return 1;
      }
      return 0;
    },
  };
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
registry.register(createDynamicCompletionHandler());
registry.register(doctorHandler);
registry.register(idsHandler);
registry.register(whereCanIHandler);
registry.register(syncApiHandler);
registry.register(createServerHelpHandler());
registry.register(versionHandler);

export function resolveHandler(
  argv: string[],
  _options: GlobalOptions,
  registrySnapshot: Pick<CommandRegistrySnapshot, 'commands'> &
    Partial<Pick<CommandRegistrySnapshot, 'allCommands'>> = BUNDLED_COMMAND_REGISTRY,
): CommandHandler | undefined {
  const commandName = argv[0];
  const groupInlineHelp =
    commandName && hasCommandGroup(commandName) && (argv[1] === '--help' || argv[1] === '-h' || argv[1] === 'help');

  if (commandName === 'help' && argv[1] === '--server') {
    return createServerHelpHandler(registrySnapshot);
  }

  if (
    argv.length === 0 ||
    commandName === '--help' ||
    commandName === '-h' ||
    groupInlineHelp ||
    commandName === 'help'
  ) {
    return createLocalHelpHandler(registrySnapshot);
  }

  if (commandName) {
    if (commandName === 'explain') return createExplainHandler(registrySnapshot);
    if (commandName === 'commands') return createCommandsHandler(registrySnapshot);
    if (commandName === 'completion') return createCompletionHandler(registrySnapshot);
    if (commandName === '__complete') return createDynamicCompletionHandler(registrySnapshot);
    if (commandName === 'server-help') return createServerHelpHandler(registrySnapshot);
    const handler = registry.get(commandName);
    if (handler) return handler;
  }

  if (hasApiCommand(commandName, registrySnapshot)) {
    return new ApiCommandHandler(commandName, registrySnapshot);
  }

  return undefined;
}

export type { CommandRegistry };
