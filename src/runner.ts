import { SpaceMoltClient } from './api.ts';
import {
  type CommandHandler,
  displayCommandParseErrors,
  getRuntimeConfig,
  resolveHandler,
} from './command-handlers.ts';
import type { GlobalOptionParseError } from './global-options.ts';
import { applyGlobalOptions, parseGlobalOptions } from './global-options.ts';
import { displayUnknownCommand, printJsonError } from './help.ts';
import { API_BASE, c, DEBUG } from './runtime.ts';
import type { GlobalOptions } from './types.ts';
import { checkForUpdates } from './update.ts';

export interface Invocation {
  options: GlobalOptions;
  args: string[];
}

export type InvocationParseResult = { ok: true; invocation: Invocation } | { ok: false; error: GlobalOptionParseError };

export function parseInvocation(argv: string[]): InvocationParseResult {
  const parsed = parseGlobalOptions(argv);
  if (!parsed.ok) return parsed;

  applyGlobalOptions(parsed.options);
  return { ok: true, invocation: { options: parsed.options, args: parsed.options.args } };
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
