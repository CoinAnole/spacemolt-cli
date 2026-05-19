import { ApiCommandHandler, hasApiCommand } from './api-command-handler.ts';
import type { CommandHandler } from './command-types.ts';
import { COMMANDS } from './commands.ts';
import { generateCompletion } from './completion.ts';
import { type DoctorResult, printDoctorResult, runDoctor } from './doctor.ts';
import {
  displayUnknownCommand,
  hasCommandGroup,
  parseCommandSearchQuery,
  printJsonError,
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
  hintsForKind,
  type IdHint,
  type IdKind,
  isIdKind,
  loadIdCacheSync,
  printIds,
  printWhereCanI,
  searchItemHints,
} from './id-cache.ts';
import { API_BASE, c, VERSION } from './runtime.ts';
import { getSessionPath, showProfiles } from './session.ts';
import type { GlobalOptions } from './types.ts';

const profileHandler: CommandHandler<{ action: 'list' }, { action: 'list' }> = {
  name: 'profile',
  requiresNetwork: false,
  parse(argv) {
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
  run(payload, _options, _client, context) {
    showProfiles(context?.env.HOME);
    return { action: payload.action };
  },
  render() {
    return 0;
  },
};

const commandsHandler: CommandHandler<{ args: string[] }, { query: ReturnType<typeof parseCommandSearchQuery> }> = {
  name: 'commands',
  requiresNetwork: false,
  parse(argv) {
    return { ok: true, payload: { args: argv.slice(1) } };
  },
  run(payload) {
    return { query: parseCommandSearchQuery(payload.args) };
  },
  render(result) {
    showCommandSearch(result.query);
    return 0;
  },
};

const explainHandler: CommandHandler<{ command: string }, { found: boolean; command: string }> = {
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
          customStderr: `${c.red}Error:${c.reset} Missing command name.\nUsage: spacemolt explain <command>`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { command: explainCommand } };
  },
  run(payload) {
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

const completionHandler: CommandHandler<{ shell: string }, { completion: string }> = {
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
          customStderr: `${c.red}Error:${c.reset} Unsupported shell: ${shell}. Use bash, zsh, or fish.`,
          exitCode: 1,
        },
      };
    }
    return { ok: true, payload: { shell } };
  },
  run(payload) {
    return { completion: generateCompletion(payload.shell) };
  },
  render(result, _options, _client, context) {
    if (context) context.writer.out(result.completion);
    else console.log(result.completion);
    return 0;
  },
};

const doctorHandler: CommandHandler<Record<string, never>, { doctorResult: DoctorResult }> = {
  name: 'doctor',
  requiresNetwork: false,
  parse() {
    return { ok: true, payload: {} };
  },
  async run(_payload, _options, client) {
    const doctorResult = await runDoctor(client?.config);
    return { doctorResult };
  },
  render(result, options, _client, context) {
    const { doctorResult } = result;
    if (options.json) {
      const json = JSON.stringify({ structuredContent: doctorResult }, null, 2);
      if (context) context.writer.out(json);
      else console.log(json);
    } else {
      printDoctorResult(doctorResult);
    }
    return doctorResult.ok ? 0 : 1;
  },
};

const idsHandler: CommandHandler<{ kind: IdKind }, { kind: IdKind; hints: IdHint[] }> = {
  name: 'ids',
  requiresNetwork: false,
  parse(argv) {
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
  render(result, options, client, context) {
    if (options.json) {
      const json = JSON.stringify({ structuredContent: { kind: result.kind, ids: result.hints } }, null, 2);
      if (context) context.writer.out(json);
      else console.log(json);
    } else {
      const sessionPath = client ? getSessionPath(client.config) : undefined;
      printIds(result.kind, sessionPath);
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
  render(result, options, client, context) {
    if (options.json) {
      const json = JSON.stringify({ structuredContent: { query: result.query, matches: result.matches } }, null, 2);
      if (context) context.writer.out(json);
      else console.log(json);
    } else {
      const sessionPath = client ? getSessionPath(client.config) : undefined;
      printWhereCanI(result.query, sessionPath);
    }
    return 0;
  },
};

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
    out(`SpaceMolt Client v${VERSION}`);
    out(`API: ${API_BASE}`);
    return 0;
  },
};

type HelpPayload =
  | { type: 'showHelp' }
  | { type: 'showHelpAndGroups' }
  | { type: 'progressiveOrHelp' }
  | { type: 'helpAll' }
  | { type: 'helpGroup'; target: string }
  | { type: 'helpCommand'; target: string };

const localHelpHandler: CommandHandler<HelpPayload, HelpPayload> = {
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
  async run(payload) {
    return payload;
  },
  async render(result, options) {
    if (result.type === 'showHelp') {
      showHelp();
      return 0;
    }
    if (result.type === 'showHelpAndGroups') {
      showHelp();
      showCommandGroups();
      return 0;
    }
    if (result.type === 'helpAll') {
      showFullHelp();
      return 0;
    }
    if (result.type === 'helpGroup') {
      showCommandGroup(result.target);
      return 0;
    }
    if (result.type === 'progressiveOrHelp') {
      if (options.watch) {
        showHelp();
      } else {
        await showProgressiveHelp();
      }
      return 0;
    }
    if (result.type === 'helpCommand') {
      if (showCommandHelp(result.target) || (hasCommandGroup(result.target) && showCommandGroup(result.target))) {
        return 0;
      }
      if (options.json) {
        printJsonError('unknown_command', `Unknown command: ${result.target}`);
        return 1;
      }
      displayUnknownCommand(result.target);
      return 1;
    }
    return 0;
  },
};

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

  if (hasApiCommand(commandName) && COMMANDS[commandName]) {
    return new ApiCommandHandler(commandName);
  }

  return undefined;
}

export type { CommandRegistry };
