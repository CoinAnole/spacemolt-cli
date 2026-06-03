// =============================================================================
// Configuration
// =============================================================================

export const DEFAULT_V2_API_BASE = 'https://game.spacemolt.com/api/v2';
export const API_BASE = process.env.SPACEMOLT_URL || DEFAULT_V2_API_BASE;
export let JSON_OUTPUT = process.env.SPACEMOLT_OUTPUT === 'json';
export let DEBUG = process.env.DEBUG === 'true';
export let PLAIN = false;
export let QUIET = false;
export let FORMAT: 'table' | 'json' | 'yaml' | 'text' = 'table';
export let COMPACT = false;
export const VERSION = '2.3.0';

import {
  colorCodes,
  colorize as colorizeText,
  formatPlayer as formatPlayerValue,
  hexColor as hexColorText,
  rawColors,
} from './display/ansi.ts';
import { firstArray, formatCompactTable, formatItemTable, rowValue } from './display/tables.ts';
import { ACTIVE_PROFILE } from './session.ts';

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

export class GlobalBackedConfig implements SpaceMoltConfig {
  get apiBase(): string {
    return API_BASE;
  }
  get jsonOutput(): boolean {
    return JSON_OUTPUT;
  }
  get debug(): boolean {
    return DEBUG;
  }
  get plain(): boolean {
    return PLAIN;
  }
  get quiet(): boolean {
    return QUIET;
  }
  get format(): 'table' | 'json' | 'yaml' | 'text' {
    return FORMAT;
  }
  get compact(): boolean {
    return COMPACT;
  }
  get profile(): string | undefined {
    return ACTIVE_PROFILE;
  }
  get profileIsExplicit(): boolean {
    return false;
  }
}

/** @deprecated Use explicit SpaceMoltConfig objects. This alias is removed in the global-state cleanup. */
export const LegacySpaceMoltConfig = GlobalBackedConfig;

export type RuntimeState = Required<Omit<SpaceMoltConfig, 'profile' | 'profileIsExplicit'>> &
  Pick<SpaceMoltConfig, 'profile'> & { profileIsExplicit: boolean };

export function createRuntimeState(config: SpaceMoltConfig = new GlobalBackedConfig()): RuntimeState {
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

export function createDefaultConfig(overrides?: Partial<SpaceMoltConfig>): SpaceMoltConfig {
  const base = new GlobalBackedConfig();
  if (!overrides) return base;
  return {
    get apiBase() {
      return overrides.apiBase !== undefined ? overrides.apiBase : base.apiBase;
    },
    get jsonOutput() {
      return overrides.jsonOutput !== undefined ? overrides.jsonOutput : base.jsonOutput;
    },
    get debug() {
      return overrides.debug !== undefined ? overrides.debug : base.debug;
    },
    get plain() {
      return overrides.plain !== undefined ? overrides.plain : base.plain;
    },
    get quiet() {
      return overrides.quiet !== undefined ? overrides.quiet : base.quiet;
    },
    get format() {
      return overrides.format !== undefined ? overrides.format : base.format;
    },
    get compact() {
      return overrides.compact !== undefined ? overrides.compact : base.compact;
    },
    get profile() {
      return overrides.profile !== undefined ? overrides.profile : base.profile;
    },
    get profileIsExplicit() {
      return overrides.profileIsExplicit !== undefined ? overrides.profileIsExplicit : base.profileIsExplicit;
    },
  };
}
// Mutations block until the server tick resolves. Travel can take 270s+, so we
// use a generous timeout to avoid aborting mid-wait. 600s covers the longest
// known travel times with plenty of headroom.
export const FETCH_TIMEOUT_MS = 600_000;
export const MAX_SESSION_RECOVERY_ATTEMPTS = 1;
export const MAX_RATE_LIMIT_RETRIES = 3;
export const GITHUB_REPO = 'CoinAnole/spacemolt-cli';
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export { rawColors };

export function colorize(text: string, code: string): string {
  return colorizeText(text, code, PLAIN);
}

const runtimeColors = colorCodes();

export const c: typeof runtimeColors = {
  get reset() {
    return colorizeText('', rawColors.reset, PLAIN);
  },
  get bright() {
    return colorizeText('', rawColors.bright, PLAIN);
  },
  get dim() {
    return colorizeText('', rawColors.dim, PLAIN);
  },
  get red() {
    return colorizeText('', rawColors.red, PLAIN);
  },
  get green() {
    return colorizeText('', rawColors.green, PLAIN);
  },
  get yellow() {
    return colorizeText('', rawColors.yellow, PLAIN);
  },
  get blue() {
    return colorizeText('', rawColors.blue, PLAIN);
  },
  get magenta() {
    return colorizeText('', rawColors.magenta, PLAIN);
  },
  get cyan() {
    return colorizeText('', rawColors.cyan, PLAIN);
  },
};

export function hexColor(text: string, fg?: string, bg?: string): string {
  return hexColorText(text, fg, bg, PLAIN);
}

export function formatPlayer(p: Record<string, unknown>): string {
  return formatPlayerValue(p, c, PLAIN);
}

export function printItemTable(items: Array<Record<string, unknown>>, indent = '  '): void {
  const lines = formatItemTable(items, indent);
  if (lines[0] !== undefined) lines[0] = `${c.bright}${lines[0]}${c.reset}`;
  for (const line of lines) console.log(line);
}

export { firstArray, rowValue };

export function printCompactTable(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string[]]>,
): void {
  const lines = formatCompactTable(title, rows, columns);
  if (lines[0] !== undefined) lines[0] = lines[0].replace(`=== ${title} ===`, `${c.bright}=== ${title} ===${c.reset}`);
  for (const line of lines) console.log(line);
}

export function setOutputMode(options: {
  json?: boolean;
  quiet?: boolean;
  plain?: boolean;
  debug?: boolean;
  format?: 'table' | 'json' | 'yaml' | 'text';
  compact?: boolean;
}): void {
  if (options.json !== undefined) JSON_OUTPUT = options.json;
  if (options.quiet !== undefined) QUIET = options.quiet;
  if (options.plain !== undefined) PLAIN = options.plain;
  if (options.debug !== undefined) DEBUG = options.debug;
  if (options.format !== undefined) FORMAT = options.format;
  if (options.compact !== undefined) COMPACT = options.compact;
}
