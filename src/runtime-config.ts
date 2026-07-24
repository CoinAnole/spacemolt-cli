import type { CliEnv } from './cli-context.ts';
import { DEFAULT_USER_AGENT, DEFAULT_V2_API_BASE, type SpaceMoltConfig } from './runtime.ts';
import { type CliConfig, loadCliConfig } from './session.ts';
import type { GlobalOptions } from './types.ts';

/**
 * Merge soft ID resolution preference: CLI flag > env > config.json boolean > false.
 * preparePayload never reads env; only the runner-merged options.fuzzyIds boolean.
 */
export function resolveFuzzyIdsEnabled(
  options: Pick<GlobalOptions, 'fuzzyIds' | 'fuzzyIdsCliExplicit'>,
  env: CliEnv,
  config: CliConfig = loadCliConfig(undefined, undefined, env),
): boolean {
  if (options.fuzzyIdsCliExplicit) return Boolean(options.fuzzyIds);
  const raw = env.SPACEMOLT_FUZZY_IDS?.trim().toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  if (typeof config.fuzzyIds === 'boolean') return config.fuzzyIds;
  return false;
}

export function getRuntimeConfig(options: GlobalOptions, env: CliEnv = process.env): SpaceMoltConfig {
  const envProfile = env.SPACEMOLT_PROFILE;
  const cliConfig = loadCliConfig(undefined, undefined, env);
  return {
    apiBase: env.SPACEMOLT_URL || DEFAULT_V2_API_BASE,
    jsonOutput: options.json || options.format === 'json' || env.SPACEMOLT_OUTPUT === 'json',
    debug: options.debug || env.DEBUG === 'true',
    plain: options.plain,
    quiet: options.quiet,
    format: options.format || 'table',
    compact: options.compact,
    profile: options.profile || envProfile,
    profileIsExplicit: Boolean(options.profile || envProfile),
    userAgent: cliConfig.userAgent ?? DEFAULT_USER_AGENT,
  };
}
