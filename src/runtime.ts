import { spawnSync } from 'node:child_process';

// =============================================================================
// Configuration
// =============================================================================

export const DEFAULT_V2_API_BASE = 'https://game.spacemolt.com/api/v2';
export const API_BASE = process.env.SPACEMOLT_URL || DEFAULT_V2_API_BASE;
export const VERSION = '2.7.0';
const EMBEDDED_BUILD_COMMIT = process.env.SPACEMOLT_BUILD_COMMIT?.trim() ?? '';
export const DEFAULT_USER_AGENT = `SpaceMolt-Client/${VERSION}`;

export function getBuildCommit(options: { cwd?: string; embeddedCommit?: string } = {}): string {
  const embeddedCommit = options.embeddedCommit ?? EMBEDDED_BUILD_COMMIT;
  if (embeddedCommit) return embeddedCommit;

  try {
    const result = spawnSync('git', ['rev-parse', 'HEAD'], {
      cwd: options.cwd ?? process.cwd(),
      encoding: 'utf8',
      timeout: 1_000,
      windowsHide: true,
    });
    if (result.status === 0) {
      const commit = result.stdout.trim();
      if (commit) return commit;
    }
  } catch {
    // Git metadata is best-effort for source runs outside a checkout.
  }

  return 'unknown';
}

export function normalizeUserAgent(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('User agent cannot be empty.');
  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) throw new Error('User agent cannot contain control characters.');
  }
  return normalized;
}

export function userAgentFromConfigValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return normalizeUserAgent(value);
  } catch {
    return undefined;
  }
}

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
  userAgent?: string;
}

export type RuntimeState = Required<Omit<SpaceMoltConfig, 'profile' | 'profileIsExplicit' | 'userAgent'>> &
  Pick<SpaceMoltConfig, 'profile'> & { profileIsExplicit: boolean; userAgent: string };

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
    userAgent: config.userAgent ?? DEFAULT_USER_AGENT,
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
