import { type CommandParseError, convertPayloadTypes, normalizeParsedPayload, validateRequiredArgs } from './args.ts';
import type { CliWriter } from './cli-context.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandError, PreparedPayload } from './command-types.ts';
import { displayMissingArgument, displayUnknownCommand, printJsonError, showCommandHelp } from './help.ts';
import {
  type CachedIdResolveResult,
  cachedIdAmbiguityMessage,
  formatCachedIdAmbiguity,
  type IdKind,
  idKindForCommandField,
  loadIdCacheSync,
  resolveCachedId,
} from './id-cache.ts';
import { wantsMachineReadableErrorOutput } from './output-state.ts';
import { colorsForPlain } from './output-style.ts';
import type { GlobalOptions } from './types.ts';

type PayloadResolveResult =
  | { type: 'payload'; payload: Record<string, unknown> }
  | { type: 'ambiguous'; field: string; result: Extract<CachedIdResolveResult, { type: 'ambiguous' }> };

const EMPIRE_RECIPIENT_ALIASES = new Set([
  'solarian',
  'solarian_confederacy',
  'confederacy',
  'voidborn',
  'voidborn_collective',
  'collective',
  'crimson',
  'crimson_pact',
  'pact',
  'nebula',
  'nebula_trade_federation',
  'trade_federation',
  'outerrim',
  'outer_rim',
  'outer_rim_explorers',
  'explorers',
]);

export function preparePayload(
  command: string,
  rawPayload: Record<string, unknown>,
  options: GlobalOptions,
  sessionPath?: string,
  writer?: CliWriter,
  registry: Pick<CommandRegistrySnapshot, 'commands'> = BUNDLED_COMMAND_REGISTRY,
  display?: {
    command?: string;
    registry?: Pick<CommandRegistrySnapshot, 'commands'>;
  },
): PreparedPayload {
  const displayCommand = display?.command ?? command;
  const displayRegistry = display?.registry ?? registry;

  if (!registry.commands[command]) {
    if (wantsMachineReadableErrorOutput(options)) {
      printJsonError('unknown_command', `Unknown command: ${displayCommand}`, writer);
      return { type: 'exit', exitCode: 1 };
    }
    displayUnknownCommand(displayCommand, writer, { plain: options.plain }, displayRegistry.commands);
    return { type: 'exit', exitCode: 1 };
  }

  if (rawPayload.help === 'true' || rawPayload.help === '1') {
    showCommandHelp(displayCommand, writer, displayRegistry.commands, { plain: options.plain });
    return { type: 'exit', exitCode: 0 };
  }

  const missingArg = validateRequiredArgs(command, rawPayload, registry);
  if (missingArg) {
    if (wantsMachineReadableErrorOutput(options)) {
      printJsonError('missing_required_argument', `Missing required argument: ${missingArg}`, writer);
      return { type: 'exit', exitCode: 1 };
    }
    displayMissingArgument(displayCommand, missingArg, writer, displayRegistry.commands, options);
    return { type: 'exit', exitCode: 1 };
  }

  const requestPayload = restoreCommandLocalSearch(
    command,
    normalizeParsedPayload(command, rawPayload, registry),
    options,
    registry,
  );
  const resolvedPayload = resolveCachedIdsForPayload(command, requestPayload, sessionPath);
  if (resolvedPayload.type === 'ambiguous') {
    if (wantsMachineReadableErrorOutput(options)) {
      printJsonError('ambiguous_cached_id', cachedIdAmbiguityMessage(resolvedPayload.result), writer);
      return { type: 'exit', exitCode: 1 };
    }
    const writeErr = writer?.err.bind(writer) ?? console.error;
    for (const line of formatCachedIdAmbiguity(displayCommand, resolvedPayload.field, resolvedPayload.result, {
      plain: options.plain,
    })) {
      writeErr(line);
    }
    return { type: 'exit', exitCode: 1 };
  }

  const payload =
    Object.keys(resolvedPayload.payload).length > 0
      ? materializePayloadDefaults(command, convertPayloadTypes(resolvedPayload.payload, command, registry))
      : {};
  return { type: 'payload', payload };
}

function materializePayloadDefaults(command: string, payload: Record<string, unknown>): Record<string, unknown> {
  if (command === 'storage' && payload.action === 'view' && payload.target === undefined) {
    return { ...payload, target: 'self' };
  }
  return payload;
}

function restoreCommandLocalSearch(
  command: string,
  payload: Record<string, unknown>,
  options: GlobalOptions,
  registry: Pick<CommandRegistrySnapshot, 'commands'>,
): Record<string, unknown> {
  const search = options.outputSearch;
  if (!search || payload.search !== undefined) return payload;

  const config = registry.commands[command];
  const declaresSearch = Boolean(config?.schema?.search) || Boolean(config?.clientOnlyFields?.includes('search'));
  if (!declaresSearch) return payload;

  return { ...payload, search };
}

function resolveCachedIdsForPayload(
  command: string,
  payload: Record<string, unknown>,
  sessionPath?: string,
): PayloadResolveResult {
  const resolvedPayload: Record<string, unknown> = { ...payload };
  const hints = loadIdCacheSync(sessionPath);

  for (const [field, value] of Object.entries(payload)) {
    const kind = idKindForPayloadField(command, field, payload);
    if (!kind) continue;

    if (Array.isArray(value)) {
      const resolvedArray: unknown[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          const resolved = resolveCachedId(kind, item, hints);
          if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
          if (resolved.type === 'resolved') resolvedArray.push(resolved.value);
          // Use resolver-normalized unresolved values (e.g. package:id → bare package_id).
          else resolvedArray.push(resolved.value !== item ? resolved.value : item);
        } else {
          resolvedArray.push(item);
        }
      }
      resolvedPayload[field] = resolvedArray;
    } else if (typeof value === 'string') {
      const reservedValue = reservedIdValue(command, field, value, kind, payload);
      if (reservedValue) {
        resolvedPayload[field] = reservedValue;
        continue;
      }
      const resolved = resolveCachedId(kind, value, hints);
      if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
      if (resolved.type === 'resolved') resolvedPayload[field] = resolved.value;
      // Apply package: prefix stripping even when the id is not in cache.
      else if (resolved.value !== value) resolvedPayload[field] = resolved.value;
    }
  }

  return { type: 'payload', payload: resolvedPayload };
}

function idKindForPayloadField(command: string, field: string, payload: Record<string, unknown>): IdKind | undefined {
  if (command !== 'storage') return idKindForCommandField(command, field);

  const action = typeof payload.action === 'string' ? payload.action : undefined;
  if (field === 'station_id' && action === 'view') return 'poi';
  if (field === 'wreck_id' && action === 'loot') return 'wreck';
  if (field === 'item_id' && ['deposit', 'withdraw', 'loot', 'jettison'].includes(action || '')) return 'item';
  if (field === 'target' && action === 'deposit') return 'player';
  return undefined;
}

function reservedIdValue(
  command: string,
  field: string,
  value: string,
  kind: string | undefined,
  payload: Record<string, unknown>,
): string | undefined {
  if (isReservedStorageTarget(command, field, value, kind, payload)) {
    return value.trim();
  }
  if (command === 'jump' && (field === 'id' || field === 'target_system') && isNumericJumpBearing(value)) {
    return value.trim();
  }
  if (kind === 'item') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'fuel' || normalized === 'tank_fuel') return 'fuel';
  }
  return undefined;
}

function isReservedStorageTarget(
  command: string,
  field: string,
  value: string,
  kind: string | undefined,
  payload: Record<string, unknown>,
): boolean {
  if (command !== 'storage' || field !== 'target' || kind !== 'player' || payload.action !== 'deposit') return false;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'self' || normalized === 'faction' || normalized.startsWith('faction:')) return true;
  return isEmpireRecipientAlias(value);
}

function isEmpireRecipientAlias(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (normalized.startsWith('empire:')) return true;
  return EMPIRE_RECIPIENT_ALIASES.has(normalized);
}

function isNumericJumpBearing(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed));
}

export function displayCommandParseErrors(
  errors: CommandParseError[],
  options: GlobalOptions,
  writer?: CliWriter,
): void {
  if (wantsMachineReadableErrorOutput(options)) {
    printJsonError('validation_error', errors.map((e) => e.message).join('; '), writer);
    return;
  }
  const writeErr = writer?.err.bind(writer) ?? console.error;
  const colors = colorsForPlain(Boolean(options.plain));
  for (const err of errors) {
    writeErr(`${colors.red}Error:${colors.reset} ${err.message}`);
  }
}

export function validationErrorFromParseErrors(errors: CommandParseError[]): CommandError {
  return {
    code: 'validation_error',
    message: errors.map((e) => e.message).join('; '),
    errors,
    exitCode: 1,
  };
}
