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
    checkForUpdates({
      env: resolvedContext.env,
      clock: resolvedContext.clock,
      writer: resolvedContext.writer,
    });
  }

  const handler = resolveHandler(invocation.args, invocation.options);
  const activeClient = client ?? new SpaceMoltClient({ config });

  if (invocation.options.watch) {
    if (!handler) return renderUnknownCommand(invocation, resolvedContext);
    return runWatchLoop(invocation, handler, activeClient, resolvedContext);
  }

  if (!handler) return renderUnknownCommand(invocation, resolvedContext);

  try {
    const parsed = handler.parse(invocation.args, invocation.options, resolvedContext);
    if (!parsed.ok) return renderCommandError(parsed.error, invocation.options, resolvedContext);

    const runResult = await handler.run(parsed.payload, invocation.options, activeClient, resolvedContext);
    return await handler.render(runResult, invocation.options, activeClient, resolvedContext);
  } catch (error) {
    return renderConnectionError(error, invocation.options, resolvedContext);
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
      if (!parsed.ok) return renderCommandError(parsed.error, invocation.options, context);

      const runResult = await handler.run(parsed.payload, invocation.options, client, context);

      if (context.writer.writeOut) context.writer.writeOut('\x1b[2J\x1b[H');
      else context.writer.out('\x1b[2J\x1b[H');

      const watchOptions: GlobalOptions = {
        ...invocation.options,
        noTimestamp: true,
      };
      await handler.render(runResult, watchOptions, client, context);

      if (running) {
        context.writer.out(`${c.dim}[next refresh in ${interval}s — Ctrl+C to stop]${c.reset}`);
        await context.sleep(interval * 1000);
      }
    }
  } catch (error) {
    return renderConnectionError(error, invocation.options, context);
  } finally {
    process.removeListener('SIGINT', stop);
  }

  return 0;
}

function renderUnknownCommand(invocation: Invocation, context: CliRuntimeContext): number {
  const commandName = invocation.args[0] || 'help';
  if (invocation.options.json) {
    printJsonError('unknown_command', `Unknown command: ${commandName}`, context.writer);
  } else {
    displayUnknownCommand(commandName, context.writer);
  }
  return 1;
}

function renderCommandError(error: CommandError, options: GlobalOptions, context: CliRuntimeContext): number {
  if (error.code === 'validation_error' && error.errors) {
    displayCommandParseErrors(error.errors, options, context.writer);
  } else if (error.code !== 'exit') {
    if (options.json) {
      printJsonError(error.code, error.message, context.writer);
    } else if (error.customStderr) {
      context.writer.err(error.customStderr);
    } else {
      context.writer.err(`${c.red}Error:${c.reset} ${error.message}`);
    }
  }
  return error.exitCode ?? 1;
}

function renderConnectionError(error: unknown, options: GlobalOptions, context: CliRuntimeContext): number {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (options.json) {
    printJsonError('connection_error', errorMessage, context.writer);
    return 1;
  }
  context.writer.err(`${c.red}${c.bright}Connection Error:${c.reset} ${errorMessage}`);
  context.writer.err('');

  if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
    context.writer.err(`${c.yellow}Troubleshooting:${c.reset}`);
    context.writer.err(`  1. Check your internet connection`);
    context.writer.err(`  2. Verify the API is reachable: ${API_BASE}`);
    context.writer.err(`  3. The game server may be temporarily down`);
    context.writer.err(`  4. Try again in a few moments`);
  }

  if (DEBUG) {
    context.writer.err(`\n${c.dim}[DEBUG] Full error:${c.reset}`);
    context.writer.err(String(error));
  }

  return 1;
}
