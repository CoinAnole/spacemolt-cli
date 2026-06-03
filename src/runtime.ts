// =============================================================================
// Configuration
// =============================================================================

import { colorCodes } from './display/ansi.ts';

export const DEFAULT_V2_API_BASE = 'https://game.spacemolt.com/api/v2';
export const API_BASE = process.env.SPACEMOLT_URL || DEFAULT_V2_API_BASE;
export const VERSION = '2.3.0';

export interface SpaceMoltConfig {
  apiBase: string;
  jsonOutput: boolean;
  debug: boolean;
  plain: boolean;
  quiet: boolean;
  format: 'table' | 'json' | 'yaml' | 'text';
  compact: boolean;
  profile?: string;
  profileIsExplicit?: boolean;
}

export type RuntimeState = Required<Omit<SpaceMoltConfig, 'profile' | 'profileIsExplicit'>> &
  Pick<SpaceMoltConfig, 'profile'> & { profileIsExplicit: boolean };

export function createRuntimeState(config: SpaceMoltConfig): RuntimeState {
  return {
    apiBase: config.apiBase,
    jsonOutput: config.jsonOutput,
    debug: config.debug,
    plain: config.plain,
    quiet: config.quiet,
    format: config.format,
    compact: config.compact,
    profile: config.profile,
    profileIsExplicit: Boolean(config.profileIsExplicit),
  };
}

export { createDefaultConfig } from './output-state.ts';

// Mutations block until the server tick resolves. Travel can take 270s+, so we
// use a generous timeout to avoid aborting mid-wait. 600s covers the longest
// known travel times with plenty of headroom.
export const FETCH_TIMEOUT_MS = 600_000;
export const MAX_SESSION_RECOVERY_ATTEMPTS = 1;
export const MAX_RATE_LIMIT_RETRIES = 3;
export const GITHUB_REPO = 'CoinAnole/spacemolt-cli';
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export const c = colorCodes(false);
