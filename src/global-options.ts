import { setOutputMode } from './runtime.ts';
import { setActiveProfile, validateProfileName } from './session.ts';
import type { GlobalOptions, OutputFormat } from './types.ts';

const VALID_FORMATS = new Set(['table', 'json', 'yaml', 'text']);

export interface GlobalOptionParseError {
  code: 'invalid_global_option';
  option: string;
  message: string;
}

export type GlobalOptionParseResult =
  | { ok: true; options: GlobalOptions }
  | { ok: false; error: GlobalOptionParseError };

function parseError(option: string, message: string): GlobalOptionParseResult {
  return {
    ok: false,
    error: {
      code: 'invalid_global_option',
      option,
      message,
    },
  };
}

function parseFields(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseWatchValue(option: string, value: string): number | GlobalOptionParseResult {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return parseError(option, '--watch requires a positive number (seconds).');
  }
  return parsed;
}

function parseFormatValue(option: string, value: string): OutputFormat | GlobalOptionParseResult {
  if (!VALID_FORMATS.has(value)) {
    return parseError(option, `Invalid format "${value}". Expected one of: table, json, yaml, text.`);
  }
  return value as OutputFormat;
}

function parseProfileValue(option: string, value: string): string | GlobalOptionParseResult {
  try {
    return validateProfileName(value);
  } catch (err) {
    return parseError(option, err instanceof Error ? err.message : String(err));
  }
}

export function parseGlobalOptions(args: string[]): GlobalOptionParseResult {
  const result: Omit<GlobalOptions, 'args'> = {
    json: false,
    quiet: false,
    plain: false,
    allowUnknown: false,
    dryRun: false,
    fields: undefined,
    noTimestamp: false,
    compact: false,
  };
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg || arg === '-' || !arg.startsWith('-')) {
      if (arg) filteredArgs.push(arg);
      continue;
    }

    if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--quiet' || arg === '-q') {
      result.quiet = true;
    } else if (arg === '--plain' || arg === '-p') {
      result.plain = true;
    } else if (arg === '--raw' || arg === '--allow-unknown' || arg === '-allow-unknown') {
      result.allowUnknown = true;
    } else if (arg === '--dry-run' || arg === '--preview') {
      result.dryRun = true;
    } else if (arg.startsWith('--dry-run=') || arg.startsWith('--preview=')) {
      const value = arg.substring(arg.indexOf('=') + 1).toLowerCase();
      result.dryRun = value !== 'false' && value !== '0';
    } else if (arg === '--no-timestamp') {
      result.noTimestamp = true;
    } else if (arg === '--compact') {
      result.compact = true;
    } else if (arg === '--watch' || arg === '-w') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseWatchValue(arg, nextArg);
        if (typeof parsed !== 'number') return parsed;
        result.watch = parsed;
        i++;
      } else {
        result.watch = 10;
      }
    } else if (arg.startsWith('--watch=')) {
      const parsed = parseWatchValue('--watch', arg.slice('--watch='.length));
      if (typeof parsed !== 'number') return parsed;
      result.watch = parsed;
    } else if (arg === '--format' || arg === '-fmt') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseFormatValue(arg, nextArg);
        if (typeof parsed !== 'string') return parsed;
        result.format = parsed;
        i++;
      } else {
        return parseError(arg, '--format requires a value: table, json, yaml, text.');
      }
    } else if (arg.startsWith('--format=')) {
      const parsed = parseFormatValue('--format', arg.slice('--format='.length));
      if (typeof parsed !== 'string') return parsed;
      result.format = parsed;
    } else if (arg.startsWith('-fmt=')) {
      const parsed = parseFormatValue('-fmt', arg.slice(5));
      if (typeof parsed !== 'string') return parsed;
      result.format = parsed;
    } else if (arg === '--jq') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.jq = nextArg;
        i++;
      } else {
        return parseError(arg, '--jq requires a jq-like expression.');
      }
    } else if (arg.startsWith('--jq=')) {
      result.jq = arg.slice('--jq='.length);
    } else if (arg === '--profile') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseProfileValue(arg, nextArg);
        if (typeof parsed !== 'string') return parsed;
        result.profile = parsed;
        i++;
      } else {
        return parseError(arg, '--profile requires a profile name.');
      }
    } else if (arg.startsWith('--profile=')) {
      const parsed = parseProfileValue('--profile', arg.slice('--profile='.length));
      if (typeof parsed !== 'string') return parsed;
      result.profile = parsed;
    } else if (arg === '--fields' || arg === '-f') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.fields = parseFields(nextArg);
        i++;
      } else {
        return parseError(arg, '--fields requires a value: --fields key1,key2.key3');
      }
    } else if (arg.startsWith('--fields=')) {
      result.fields = parseFields(arg.slice('--fields='.length));
    } else if (arg.startsWith('-f=')) {
      result.fields = parseFields(arg.slice(3));
    } else {
      filteredArgs.push(arg);
    }
  }

  return {
    ok: true,
    options: {
      ...result,
      args: filteredArgs,
    },
  };
}

export function applyGlobalOptions(options: GlobalOptions): void {
  if (options.format) {
    setOutputMode({ format: options.format });
    if (options.format === 'json') setOutputMode({ json: true });
  } else if (options.json) {
    setOutputMode({ json: true, format: 'json' });
  }
  setOutputMode({ quiet: options.quiet, plain: options.plain, compact: options.compact });
  setActiveProfile(options.profile);
}
