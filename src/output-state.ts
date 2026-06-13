import type { CliEnv } from './cli-context.ts';
import type { GlobalOptionParseError } from './global-options.ts';
import { DEFAULT_USER_AGENT, DEFAULT_V2_API_BASE, type SpaceMoltConfig } from './runtime.ts';
import { loadCliConfig } from './session.ts';
import type { GlobalOptions, OutputFormat } from './types.ts';

export type ImmutableSpaceMoltConfig = Readonly<SpaceMoltConfig>;

export interface OutputRuntimeState {
  jsonOutput: boolean;
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  format: OutputFormat;
  compact: boolean;
}

export function outputStateFromOptions(options: GlobalOptions, env: CliEnv = process.env): OutputRuntimeState {
  const format = options.format ?? (options.json ? 'json' : 'table');
  const jsonOutput = options.json || format === 'json' || env.SPACEMOLT_OUTPUT === 'json';
  return {
    jsonOutput,
    debug: Boolean(options.debug || env.DEBUG === 'true'),
    plain: options.plain,
    quiet: options.quiet,
    format,
    compact: options.compact,
  };
}

export function outputStateFromGlobalOptionError(
  error: GlobalOptionParseError,
  env: CliEnv = process.env,
): OutputRuntimeState {
  const jsonOutput = Boolean(error.json || env.SPACEMOLT_OUTPUT === 'json');
  return {
    jsonOutput,
    debug: Boolean(error.debug || env.DEBUG === 'true'),
    plain: Boolean(error.plain),
    quiet: Boolean(error.quiet),
    format: jsonOutput ? 'json' : 'table',
    compact: false,
  };
}

export function createDefaultConfig(
  overrides: Partial<SpaceMoltConfig> = {},
  env: CliEnv = process.env,
): ImmutableSpaceMoltConfig {
  const jsonOutput = overrides.jsonOutput ?? env.SPACEMOLT_OUTPUT === 'json';
  const cliConfig = loadCliConfig(undefined, undefined, env);
  return Object.freeze({
    apiBase: overrides.apiBase ?? env.SPACEMOLT_URL ?? DEFAULT_V2_API_BASE,
    jsonOutput,
    debug: overrides.debug ?? env.DEBUG === 'true',
    plain: overrides.plain ?? false,
    quiet: overrides.quiet ?? false,
    format: overrides.format ?? (jsonOutput ? 'json' : 'table'),
    compact: overrides.compact ?? false,
    profile: overrides.profile ?? env.SPACEMOLT_PROFILE,
    profileIsExplicit: overrides.profileIsExplicit ?? false,
    userAgent: overrides.userAgent ?? cliConfig.userAgent ?? DEFAULT_USER_AGENT,
  });
}
