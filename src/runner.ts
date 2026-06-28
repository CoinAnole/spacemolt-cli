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
import { buildCommandRegistrySnapshot } from './command-registry.ts';
import { GENERATED_API_GAMESERVER_VERSION, GENERATED_API_ROUTES } from './generated/api-commands.ts';
import type { GlobalOptionParseError } from './global-options.ts';
import { applyGlobalOptions, parseGlobalOptions } from './global-options.ts';
import { displayUnknownCommand, printJsonError } from './help.ts';
import { defaultOpenApiCacheDir, loadCachedGeneratedRoutes, loadOpenApiCacheVersion } from './openapi-cache.ts';
import { outputStateFromGlobalOptionError } from './output-state.ts';
import { colorsForPlain } from './output-style.ts';
import { API_BASE } from './runtime.ts';
import { getDefaultProfile, setActiveProfile, validateProfileName } from './session.ts';
import type { GlobalOptions } from './types.ts';
import { checkForUpdates, compareVersions } from './update.ts';

export interface Invocation {
  options: GlobalOptions;
  args: string[];
}

export interface RunnerDependencies {
  loadCachedGeneratedRoutes?: typeof loadCachedGeneratedRoutes;
  loadOpenApiCacheVersion?: typeof loadOpenApiCacheVersion;
  defaultOpenApiCacheDir?: typeof defaultOpenApiCacheDir;
  checkForUpdates?: typeof checkForUpdates;
  getDefaultProfile?: typeof getDefaultProfile;
  resolveHandler?: typeof resolveHandler;
  createClient?: (config: SpaceMoltClient['config']) => SpaceMoltClient;
  onSigint?: (listener: () => void) => () => void;
}

const defaultRunnerDependencies: Required<RunnerDependencies> = {
  loadCachedGeneratedRoutes,
  loadOpenApiCacheVersion,
  defaultOpenApiCacheDir,
  checkForUpdates,
  getDefaultProfile,
  resolveHandler,
  createClient(config) {
    return new SpaceMoltClient({ config });
  },
  onSigint(listener) {
    process.on('SIGINT', listener);
    return () => process.removeListener('SIGINT', listener);
  },
};

export type InvocationParseResult = { ok: true; invocation: Invocation } | { ok: false; error: GlobalOptionParseError };

function defaultGlobalOptions(args: string[]): GlobalOptions {
  return {
    json: false,
    quiet: false,
    plain: false,
    debug: false,
    allowUnknown: false,
    dryRun: false,
    fields: undefined,
    noTimestamp: false,
    compact: false,
    args,
  };
}

export function parseInvocation(argv: string[], context?: CliRuntimeContext): InvocationParseResult {
  if (argv[0] === '__complete') {
    const options = defaultGlobalOptions(argv);
    applyGlobalOptions(options, context?.env);
    return { ok: true, invocation: { options, args: argv } };
  }

  const parsed = parseGlobalOptions(argv);
  if (!parsed.ok) return parsed;

  const envProfile = context?.env.SPACEMOLT_PROFILE;
  const outputState = {
    json: parsed.options.json || parsed.options.format === 'json',
    plain: parsed.options.plain,
    quiet: parsed.options.quiet,
    debug: parsed.options.debug,
  };
  const profile = parsed.options.profile ?? (envProfile ? validateEnvProfile(envProfile, outputState) : undefined);
  if (typeof profile !== 'string' && profile) return { ok: false, error: profile };
  const options = profile ? { ...parsed.options, profile } : parsed.options;

  applyGlobalOptions(options, context?.env);
  return { ok: true, invocation: { options, args: options.args } };
}

function validateEnvProfile(
  value: string,
  state: Pick<GlobalOptionParseError, 'json' | 'plain' | 'quiet' | 'debug'>,
): string | GlobalOptionParseError {
  try {
    return validateProfileName(value);
  } catch (err) {
    return {
      code: 'invalid_global_option',
      option: 'SPACEMOLT_PROFILE',
      message: err instanceof Error ? err.message : String(err),
      ...state,
    };
  }
}

export async function runInvocation(
  argv: string[],
  client?: SpaceMoltClient,
  context: CliRuntimeContext = createDefaultCliRuntimeContext(),
  dependencies: RunnerDependencies = {},
): Promise<number> {
  const deps = { ...defaultRunnerDependencies, ...dependencies };
  const outputTracker = createOutputTracker(context.writer);
  const trackedContext = { ...context, writer: outputTracker.writer };
  const fallbackOutput = fallbackOutputMode(argv, context);
  return withCliWriter(outputTracker.writer, async () => {
    const exitCode = await runInvocationWithContext(argv, client, trackedContext, deps);
    renderFallbackDiagnosticIfSilent(exitCode, trackedContext, outputTracker, fallbackOutput);
    return exitCode;
  });
}

interface OutputTracker {
  writer: CliRuntimeContext['writer'];
  hasStdout(): boolean;
  hasStderr(): boolean;
}

function createOutputTracker(writer: CliRuntimeContext['writer']): OutputTracker {
  let stdoutWrites = 0;
  let stderrWrites = 0;
  return {
    writer: {
      out(message = '') {
        stdoutWrites += 1;
        writer.out(message);
      },
      err(message = '') {
        stderrWrites += 1;
        writer.err(message);
      },
      writeOut: writer.writeOut
        ? (chunk: string) => {
            stdoutWrites += 1;
            writer.writeOut?.(chunk);
          }
        : undefined,
    },
    hasStdout() {
      return stdoutWrites > 0;
    },
    hasStderr() {
      return stderrWrites > 0;
    },
  };
}

function renderFallbackDiagnosticIfSilent(
  exitCode: number,
  context: CliRuntimeContext,
  outputTracker: OutputTracker,
  output: { machineReadable: boolean },
): void {
  if (exitCode === 0) return;
  const message = 'Command failed without an error message.';

  if (output.machineReadable) {
    if (outputTracker.hasStdout()) return;
    printJsonError('missing_error_output', message, context.writer);
    return;
  }

  if (outputTracker.hasStderr()) return;
  context.writer.err(`Error: ${message}`);
}

function fallbackOutputMode(argv: string[], context: CliRuntimeContext): { machineReadable: boolean } {
  const parsed = parseInvocation(argv, context);
  if (!parsed.ok) {
    const output = outputStateFromGlobalOptionError(parsed.error, context.env);
    return { machineReadable: output.jsonOutput };
  }

  const config = getRuntimeConfig(parsed.invocation.options, context.env);
  return { machineReadable: config.jsonOutput || parsed.invocation.options.structured === true };
}

async function runInvocationWithContext(
  argv: string[],
  client: SpaceMoltClient | undefined,
  context: CliRuntimeContext,
  deps: Required<RunnerDependencies>,
): Promise<number> {
  const parsedInvocation = parseInvocation(argv, context);
  if (!parsedInvocation.ok) {
    const output = outputStateFromGlobalOptionError(parsedInvocation.error, context.env);
    const colors = colorsForPlain(output.plain);
    if (output.jsonOutput) {
      printJsonError(parsedInvocation.error.code, parsedInvocation.error.message, context.writer);
    } else {
      context.writer.err(`${colors.red}Error:${colors.reset} ${parsedInvocation.error.message}`);
    }
    return 1;
  }
  const parsedOptions = parsedInvocation.invocation.options;
  const savedDefaultProfile =
    parsedOptions.profile || context.env.SPACEMOLT_PROFILE
      ? undefined
      : deps.getDefaultProfile(undefined, undefined, context.env);
  const effectiveOptions = savedDefaultProfile ? { ...parsedOptions, profile: savedDefaultProfile } : parsedOptions;
  setActiveProfile(effectiveOptions.profile);

  const config = getRuntimeConfig(effectiveOptions, context.env);
  config.profileIsExplicit = Boolean(parsedOptions.profile || context.env.SPACEMOLT_PROFILE);
  const invocation: Invocation = {
    ...parsedInvocation.invocation,
    options: {
      ...effectiveOptions,
      json: config.jsonOutput,
      format: config.format,
      profile: config.profile,
    },
  };
  const resolvedContext = withResolvedConfig(context, config);
  const cachedGeneratedRoutes = deps.loadCachedGeneratedRoutes(
    deps.defaultOpenApiCacheDir(resolvedContext.env as NodeJS.ProcessEnv),
  );
  const cacheVersion = deps.loadOpenApiCacheVersion(
    deps.defaultOpenApiCacheDir(resolvedContext.env as NodeJS.ProcessEnv),
  );
  const cacheCanExtendBundled =
    cacheVersion.status === 'valid' &&
    compareVersions(GENERATED_API_GAMESERVER_VERSION, cacheVersion.gameserverVersion) >= 0;
  const usableCachedGeneratedRoutes =
    cachedGeneratedRoutes && cacheCanExtendBundled ? cachedGeneratedRoutes : undefined;
  const generatedRoutes = usableCachedGeneratedRoutes
    ? { ...GENERATED_API_ROUTES, ...usableCachedGeneratedRoutes }
    : undefined;
  const commandRegistry = buildCommandRegistrySnapshot({
    generatedRoutes,
    dynamicGeneratedRoutes: usableCachedGeneratedRoutes,
    includeDynamic: Boolean(usableCachedGeneratedRoutes),
  });
  const isDynamicCompletion = invocation.args[0] === '__complete';

  if (!isDynamicCompletion && !invocation.options.json && !invocation.options.quiet && !invocation.options.watch) {
    deps.checkForUpdates({
      env: resolvedContext.env,
      clock: resolvedContext.clock,
      writer: resolvedContext.writer,
      debug: resolvedContext.config?.debug,
      plain: resolvedContext.config?.plain,
    });
  }

  const handler = deps.resolveHandler(invocation.args, invocation.options, commandRegistry);
  const activeClient = client ?? deps.createClient(config);

  if (invocation.options.watch) {
    if (!handler) return renderUnknownCommand(invocation, resolvedContext);
    return runWatchLoop(invocation, handler, activeClient, resolvedContext, deps);
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
  deps: Required<RunnerDependencies>,
): Promise<number> {
  const interval = invocation.options.watch;
  if (!interval) return 0;

  let running = true;
  const stop = () => {
    running = false;
  };
  const removeSigintListener = deps.onSigint(stop);

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
        const output = outputFromContext(context);
        const colors = colorsForPlain(output.plain);
        context.writer.out(`${colors.dim}[next refresh in ${interval}s — Ctrl+C to stop]${colors.reset}`);
        await context.sleep(interval * 1000);
      }
    }
  } catch (error) {
    return renderConnectionError(error, invocation.options, context);
  } finally {
    removeSigintListener();
  }

  return 0;
}

function renderUnknownCommand(invocation: Invocation, context: CliRuntimeContext): number {
  const commandName = invocation.args[0] || 'help';
  if (invocation.options.json) {
    printJsonError('unknown_command', `Unknown command: ${commandName}`, context.writer);
  } else {
    displayUnknownCommand(commandName, context.writer, { plain: context.config?.plain ?? context.output?.plain });
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
      const colors = colorsForPlain(Boolean(options.plain));
      context.writer.err(`${colors.red}Error:${colors.reset} ${error.message}`);
    }
  }
  return error.exitCode ?? 1;
}

function outputFromContext(context: CliRuntimeContext): {
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  apiBase: string;
} {
  return {
    debug: Boolean(context.config?.debug ?? context.output?.debug),
    plain: Boolean(context.config?.plain ?? context.output?.plain),
    quiet: Boolean(context.config?.quiet ?? context.output?.quiet),
    apiBase: context.config?.apiBase ?? context.env.SPACEMOLT_URL ?? API_BASE,
  };
}

function renderConnectionError(error: unknown, options: GlobalOptions, context: CliRuntimeContext): number {
  const errorMessage = error instanceof Error ? error.message : String(error);
  if (options.json) {
    printJsonError('connection_error', errorMessage, context.writer);
    return 1;
  }
  const output = outputFromContext(context);
  const colors = colorsForPlain(output.plain);
  context.writer.err(`${colors.red}${colors.bright}Connection Error:${colors.reset} ${errorMessage}`);
  context.writer.err('');

  if (errorMessage.includes('fetch') || errorMessage.includes('ECONNREFUSED') || errorMessage.includes('network')) {
    context.writer.err(`${colors.yellow}Troubleshooting:${colors.reset}`);
    context.writer.err(`  1. Check your internet connection`);
    context.writer.err(`  2. Verify the API is reachable: ${output.apiBase}`);
    context.writer.err(`  3. The game server may be temporarily down`);
    context.writer.err(`  4. Try again in a few moments`);
  }

  if (output.debug) {
    context.writer.err(`\n${colors.dim}[DEBUG] Full error:${colors.reset}`);
    context.writer.err(String(error));
  }

  return 1;
}
