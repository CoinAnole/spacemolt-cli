import type { CliEnv } from './cli-context.ts';
import { DEFAULT_V2_API_BASE, type SpaceMoltConfig } from './runtime.ts';
import type { GlobalOptions } from './types.ts';

export function getRuntimeConfig(options: GlobalOptions, env: CliEnv = process.env): SpaceMoltConfig {
  const envProfile = env.SPACEMOLT_PROFILE;
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
  };
}
