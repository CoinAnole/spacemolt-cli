import type { CliEnv } from './cli-context.ts';
import { setActiveProfile, validateProfileName } from './session.ts';
import type { GlobalOptions, OutputFormat } from './types.ts';

const VALID_FORMATS = new Set(['table', 'json', 'yaml', 'text']);

export interface GlobalOptionParseError {
  code: 'invalid_global_option';
  option: string;
  message: string;
  plain?: boolean;
  quiet?: boolean;
  json?: boolean;
  structured?: boolean;
  debug?: boolean;
}

export type GlobalOptionParseResult =
  | { ok: true; options: GlobalOptions }
  | { ok: false; error: GlobalOptionParseError };

type PartialOutputState = Partial<Pick<GlobalOptions, 'plain' | 'quiet' | 'json' | 'format' | 'structured' | 'debug'>>;

function parseError(option: string, message: string, state: PartialOutputState = {}): GlobalOptionParseResult {
  return {
    ok: false,
    error: {
      code: 'invalid_global_option',
      option,
      message,
      ...state,
    },
  };
}

function outputState(options: PartialOutputState): PartialOutputState {
  return {
    ...(options.plain ? { plain: true } : {}),
    ...(options.quiet ? { quiet: true } : {}),
    ...(options.json || options.format === 'json' ? { json: true } : {}),
    ...(options.structured ? { structured: true } : {}),
    ...(options.debug ? { debug: true } : {}),
  };
}

function parseFields(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseWatchValue(option: string, value: string, state: PartialOutputState): number | GlobalOptionParseResult {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return parseError(option, '--watch requires a positive number (seconds).', state);
  }
  return parsed;
}

function parseFormatValue(
  option: string,
  value: string,
  state: PartialOutputState,
): OutputFormat | GlobalOptionParseResult {
  if (!VALID_FORMATS.has(value)) {
    return parseError(option, `Invalid format "${value}". Expected one of: table, json, yaml, text.`, state);
  }
  return value as OutputFormat;
}

function parseProfileValue(option: string, value: string, state: PartialOutputState): string | GlobalOptionParseResult {
  try {
    return validateProfileName(value);
  } catch (err) {
    return parseError(option, err instanceof Error ? err.message : String(err), state);
  }
}

function parseRequiredPatternValue(
  option: string,
  value: string | undefined,
  state: PartialOutputState,
): string | GlobalOptionParseResult {
  if (value === undefined || value.trim() === '') {
    return parseError(option, `${option} requires a pattern.`, state);
  }
  return value.trim();
}

function parseRequiredSeparatedPatternValue(
  option: string,
  args: string[],
  index: number,
  state: PartialOutputState,
): string | GlobalOptionParseResult {
  const value = args[index + 1];
  return parseRequiredPatternValue(option, value !== undefined && !value.startsWith('-') ? value : undefined, state);
}

export function parseGlobalOptions(args: string[]): GlobalOptionParseResult {
  const result: Omit<GlobalOptions, 'args'> = {
    json: false,
    quiet: false,
    plain: false,
    debug: false,
    allowUnknown: false,
    dryRun: false,
    fuzzy: false,
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
    } else if (arg === '--debug') {
      result.debug = true;
    } else if (arg === '--raw' || arg === '--allow-unknown' || arg === '-allow-unknown') {
      result.allowUnknown = true;
    } else if (arg === '--raw-notifications') {
      result.rawNotifications = true;
    } else if (arg === '--verbose-notifications') {
      result.verboseNotifications = true;
    } else if (arg === '--dry-run' || arg === '--preview') {
      result.dryRun = true;
    } else if (arg.startsWith('--dry-run=') || arg.startsWith('--preview=')) {
      const value = arg.substring(arg.indexOf('=') + 1).toLowerCase();
      result.dryRun = value !== 'false' && value !== '0';
    } else if (arg === '--fuzzy') {
      result.fuzzy = true;
    } else if (arg === '--fuzzy-ids') {
      result.fuzzyIds = true;
      result.fuzzyIdsCliExplicit = true;
    } else if (arg === '--no-fuzzy-ids') {
      result.fuzzyIds = false;
      result.fuzzyIdsCliExplicit = true;
    } else if (arg === '--no-timestamp') {
      result.noTimestamp = true;
    } else if (arg === '--compact') {
      result.compact = true;
    } else if (arg === '--structured') {
      result.structured = true;
    } else if (arg === '--keys') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-') && filteredArgs.length > 0) {
        result.keys = nextArg.trim();
        i++;
      } else {
        result.keys = '';
      }
    } else if (arg.startsWith('--keys=')) {
      result.keys = arg.slice('--keys='.length).trim();
    } else if (arg === '--search') {
      const parsed = parseRequiredSeparatedPatternValue(arg, args, i, outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearch = parsed;
      i++;
    } else if (arg.startsWith('--search=')) {
      const parsed = parseRequiredPatternValue('--search', arg.slice('--search='.length), outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearch = parsed;
    } else if (arg === '--search-keys') {
      const parsed = parseRequiredSeparatedPatternValue(arg, args, i, outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchKeys = parsed;
      i++;
    } else if (arg.startsWith('--search-keys=')) {
      const parsed = parseRequiredPatternValue(
        '--search-keys',
        arg.slice('--search-keys='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchKeys = parsed;
    } else if (arg === '--search-values') {
      const parsed = parseRequiredSeparatedPatternValue(arg, args, i, outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchValues = parsed;
      i++;
    } else if (arg.startsWith('--search-values=')) {
      const parsed = parseRequiredPatternValue(
        '--search-values',
        arg.slice('--search-values='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchValues = parsed;
    } else if (arg === '--search-regex') {
      const parsed = parseRequiredSeparatedPatternValue(arg, args, i, outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchRegex = parsed;
      i++;
    } else if (arg.startsWith('--search-regex=')) {
      const parsed = parseRequiredPatternValue(
        '--search-regex',
        arg.slice('--search-regex='.length),
        outputState(result),
      );
      if (typeof parsed !== 'string') return parsed;
      result.outputSearchRegex = parsed;
    } else if (arg === '--watch' || arg === '-w') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseWatchValue(arg, nextArg, outputState(result));
        if (typeof parsed !== 'number') return parsed;
        result.watch = parsed;
        i++;
      } else {
        result.watch = 10;
      }
    } else if (arg.startsWith('--watch=')) {
      const parsed = parseWatchValue('--watch', arg.slice('--watch='.length), outputState(result));
      if (typeof parsed !== 'number') return parsed;
      result.watch = parsed;
    } else if (arg === '--format' || arg === '-fmt') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseFormatValue(arg, nextArg, outputState(result));
        if (typeof parsed !== 'string') return parsed;
        result.format = parsed;
        i++;
      } else {
        return parseError(arg, '--format requires a value: table, json, yaml, text.', outputState(result));
      }
    } else if (arg.startsWith('--format=')) {
      const parsed = parseFormatValue('--format', arg.slice('--format='.length), outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.format = parsed;
    } else if (arg.startsWith('-fmt=')) {
      const parsed = parseFormatValue('-fmt', arg.slice(5), outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.format = parsed;
    } else if (arg === '--jq') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.jq = nextArg;
        i++;
      } else {
        return parseError(arg, '--jq requires a path expression.', outputState(result));
      }
    } else if (arg.startsWith('--jq=')) {
      result.jq = arg.slice('--jq='.length);
    } else if (arg === '--profile') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        const parsed = parseProfileValue(arg, nextArg, outputState(result));
        if (typeof parsed !== 'string') return parsed;
        result.profile = parsed;
        i++;
      } else {
        return parseError(arg, '--profile requires a profile name.', outputState(result));
      }
    } else if (arg.startsWith('--profile=')) {
      const parsed = parseProfileValue('--profile', arg.slice('--profile='.length), outputState(result));
      if (typeof parsed !== 'string') return parsed;
      result.profile = parsed;
    } else if (arg === '--field' || arg === '--extract') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.field = nextArg.trim();
        i++;
      } else {
        return parseError(arg, `${arg} requires a value: ${arg} key1.key2`, outputState(result));
      }
    } else if (arg.startsWith('--field=')) {
      result.field = arg.slice('--field='.length).trim();
    } else if (arg.startsWith('--extract=')) {
      result.field = arg.slice('--extract='.length).trim();
    } else if (arg === '--fields' || arg === '-f') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        result.fields = parseFields(nextArg);
        i++;
      } else {
        return parseError(arg, '--fields requires a value: --fields key1,key2.key3', outputState(result));
      }
    } else if (arg.startsWith('--fields=')) {
      result.fields = parseFields(arg.slice('--fields='.length));
    } else if (arg.startsWith('-f=')) {
      result.fields = parseFields(arg.slice(3));
    } else {
      filteredArgs.push(arg);
    }
  }

  if (result.keys !== undefined && result.jq) {
    return parseError('--keys', '--keys and --jq are mutually exclusive.', outputState(result));
  }

  return {
    ok: true,
    options: {
      ...result,
      args: filteredArgs,
    },
  };
}

export function applyGlobalOptions(options: GlobalOptions, env: CliEnv = process.env): void {
  setActiveProfile(options.profile || env.SPACEMOLT_PROFILE);
}
