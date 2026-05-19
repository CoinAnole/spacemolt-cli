import { SpaceMoltClient } from './api.ts';
import {
  type CliRuntimeContext,
  createDefaultCliRuntimeContext,
  withCliWriter,
  withResolvedConfig,
} from './cli-context.ts';
import {
  type CommandError,
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

export function parseInvocation(argv: string[], context?: CliRuntimeContext): InvocationParseResult {
  const parsed = parseGlobalOptions(argv);
  if (!parsed.ok) return parsed;

  applyGlobalOptions(parsed.options, context?.env);
  return { ok: true, invocation: { options: parsed.options, args: parsed.options.args } };
}

export async function runInvocation(
  argv: string[],
  client?: SpaceMoltClient,
  context: CliRuntimeContext = createDefaultCliRuntimeContext(),
): Promise<number> {
  return withCliWriter(context.writer, () => runInvocationWithContext(argv, client, context));
}

async function runInvocationWithContext(
  argv: string[],
  client: SpaceMoltClient | undefined,
  context: CliRuntimeContext,
): Promise<number> {
  const parsedInvocation = parseInvocation(argv, context);
  if (!parsedInvocation.ok) {
    context.writer.err(`${c.red}Error:${c.reset} ${parsedInvocation.error.message}`);
    return 1;
  }
  const config = getRuntimeConfig(parsedInvocation.invocation.options, context.env);
  const invocation: Invocation = {
    ...parsedInvocation.invocation,
    options: {
      ...parsedInvocation.invocation.options,
      json: config.jsonOutput,
      format: config.format,
      profile: config.profile,
    },
  };
  const resolvedContext = withResolvedConfig(context, config);

  if (!invocation.options.json && !invocation.options.quiet && !invocation.options.watch) {
    checkForUpdates();
  }

  const handler = resolveHandler(invocation.args, invocation.options);
  const activeClient = client ?? new SpaceMoltClient({ config });

  if (invocation.options.watch) {
    if (!handler) return renderUnknownCommand(invocation);
    return runWatchLoop(invocation, handler, activeClient, resolvedContext);
  }

  if (!handler) return renderUnknownCommand(invocation);

  try {
    const parsed = handler.parse(invocation.args, invocation.options, resolvedContext);
    if (!parsed.ok) return renderCommandError(parsed.error, invocation.options);

    const runResult = await handler.run(parsed.payload, invocation.options, activeClient, resolvedContext);
    return await handler.render(runResult, invocation.options, activeClient, resolvedContext);
  } catch (error) {
    return renderConnectionError(error, invocation.options);
  }
}

async function runWatchLoop(
  invocation: Invocation,
  handler: CommandHandler,
  client: SpaceMoltClient,
  context: CliRuntimeContext,
): Promise<number> {
  const interval = invocation.options.watch;
  if (!interval) return 0;

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on('SIGINT', stop);

  try {
    while (running) {
      const parsed = handler.parse(invocation.args, invocation.options, context);
      if (!parsed.ok) return renderCommandError(parsed.error, invocation.options);

      const runResult = await handler.run(parsed.payload, invocation.options, client, context);

      if (context.writer.writeOut) context.writer.writeOut('\x1b[2J\x1b[H');
      else context.writer.out('\x1b[2J\x1b[H');

      const watchOptions: GlobalOptions = {
        ...invocation.options,
        noTimestamp: true,
      };
      await handler.render(runResult, watchOptions, client, context);

      if (running) {
        console.log(`${c.dim}[next refresh in ${interval}s — Ctrl+C to stop]${c.reset}`);
        await context.sleep(interval * 1000);
      }
    }
  } catch (error) {
    return renderConnectionError(error, invocation.options);
  } finally {
    process.removeListener('SIGINT', stop);
  }

  return 0;
}

function renderUnknownCommand(invocation: Invocation): number {
  const commandName = invocation.args[0] || 'help';
  if (invocation.options.json) {
    printJsonError('unknown_command', `Unknown command: ${commandName}`);
  } else {
    displayUnknownCommand(commandName);
  }
  return 1;
}

function renderCommandError(error: CommandError, options: GlobalOptions): number {
  if (error.code === 'validation_error' && error.errors) {
    displayCommandParseErrors(error.errors, options);
  } else if (error.code !== 'exit') {
    if (options.json) {
      printJsonError(error.code, error.message);
    } else if (error.customStderr) {
      console.error(error.customStderr);
    } else {
      console.error(`${c.red}Error:${c.reset} ${error.message}`);
    }
  }
  return error.exitCode ?? 1;
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
