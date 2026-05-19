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
export const VERSION = '2.0.0';
// Mutations block until the server tick resolves. Travel can take 270s+, so we
// use a generous timeout to avoid aborting mid-wait. 600s covers the longest
// known travel times with plenty of headroom.
export const FETCH_TIMEOUT_MS = 600_000;
export const MAX_SESSION_RECOVERY_ATTEMPTS = 1;
export const MAX_RATE_LIMIT_RETRIES = 3;
export const GITHUB_REPO = 'CoinAnole/spacemolt-cli';
export const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ANSI colors
export const rawColors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

export function colorize(text: string, code: string): string {
  if (PLAIN) return text;
  return code + text + rawColors.reset;
}

export const c = {
  get reset() {
    return colorize('', rawColors.reset);
  },
  get bright() {
    return colorize('', rawColors.bright);
  },
  get dim() {
    return colorize('', rawColors.dim);
  },
  get red() {
    return colorize('', rawColors.red);
  },
  get green() {
    return colorize('', rawColors.green);
  },
  get yellow() {
    return colorize('', rawColors.yellow);
  },
  get blue() {
    return colorize('', rawColors.blue);
  },
  get magenta() {
    return colorize('', rawColors.magenta);
  },
  get cyan() {
    return colorize('', rawColors.cyan);
  },
};

export function hexColor(text: string, fg?: string, bg?: string): string {
  if (!fg && !bg) return text;
  if (PLAIN) return text;

  const hex = (value: string) => {
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) return null;
    return [parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)];
  };

  let prefix = '';
  if (fg) {
    const rgb = hex(fg);
    if (rgb) prefix += `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }
  if (bg) {
    const rgb = hex(bg);
    if (rgb) prefix += `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
  }

  return prefix ? `${prefix}${text}\x1b[0m` : text;
}

export function formatPlayer(p: Record<string, unknown>): string {
  const rawName = p.anonymous ? '[Anonymous]' : String(p.username || 'Unknown');
  const name = hexColor(rawName, p.primary_color as string | undefined, p.secondary_color as string | undefined);
  const faction = p.faction_tag ? ` [${p.faction_tag}]` : '';
  const status = p.status_message ? ` - "${p.status_message}"` : '';
  const combat = p.in_combat ? ` ${c.red}[IN COMBAT]${c.reset}` : '';
  const ship = p.ship_class ? ` (${p.ship_class})` : '';
  return `${name}${faction}${ship}${status}${combat}`;
}

export function printItemTable(items: Array<Record<string, unknown>>, indent = '  '): void {
  console.log(`${c.bright}Items (${items.length}):${c.reset}`);
  if (!items.length) {
    console.log(`${indent}(Empty)`);
    return;
  }

  console.log('');
  const idW = Math.max(2, ...items.map((i) => String(i.item_id || '').length));
  const nameW = Math.max(4, ...items.map((i) => String(i.name || i.item_id || '').length));
  const qtyW = Math.max(3, ...items.map((i) => String(i.quantity ?? '').length));
  const sizeW = Math.max(9, ...items.map((i) => String(i.size ?? '').length));

  console.log(
    `${indent}${'Name'.padEnd(nameW)} | ${'ID'.padEnd(idW)} | ${'Qty'.padStart(qtyW)} | ${'Unit Size'.padStart(sizeW)}`,
  );
  console.log(`${indent}${'-'.repeat(nameW)}-+-${'-'.repeat(idW)}-+-${'-'.repeat(qtyW)}-+-${'-'.repeat(sizeW)}`);
  for (const item of items) {
    const name = String(item.name || item.item_id || '').padEnd(nameW);
    const id = String(item.item_id || '').padEnd(idW);
    const qty = String(item.quantity ?? '').padStart(qtyW);
    const size = String(item.size ?? '').padStart(sizeW);
    console.log(`${indent}${name} | ${id} | ${qty} | ${size}`);
  }
}

export function firstArray(
  result: Record<string, unknown>,
  keys: string[],
): Array<Record<string, unknown>> | undefined {
  for (const key of keys) {
    const value = result[key];
    if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  }
  return undefined;
}

export function rowValue(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

export function printCompactTable(
  title: string,
  rows: Array<Record<string, unknown>>,
  columns: Array<[string, string[]]>,
): void {
  console.log(`\n${c.bright}=== ${title} ===${c.reset}`);
  if (!rows.length) {
    console.log('(None)');
    return;
  }

  const widths = columns.map(([label, keys]) =>
    Math.max(label.length, ...rows.map((row) => rowValue(row, keys).length)),
  );
  console.log('');
  console.log(`  ${columns.map(([label], idx) => label.padEnd(widths[idx] || label.length)).join(' | ')}`);
  console.log(`  ${widths.map((width) => '-'.repeat(width)).join('-+-')}`);
  for (const row of rows) {
    console.log(`  ${columns.map(([, keys], idx) => rowValue(row, keys).padEnd(widths[idx] || 0)).join(' | ')}`);
  }
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
