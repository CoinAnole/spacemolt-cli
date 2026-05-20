import { type CommandParseError, convertPayloadTypes, normalizeParsedPayload, validateRequiredArgs } from './args.ts';
import type { CliWriter } from './cli-context.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandError, PreparedPayload } from './command-types.ts';
import { displayMissingArgument, displayUnknownCommand, printJsonError, showCommandHelp } from './help.ts';
import {
  type CachedIdResolveResult,
  cachedIdAmbiguityMessage,
  formatCachedIdAmbiguity,
  idKindForCommandField,
  loadIdCacheSync,
  resolveCachedId,
} from './id-cache.ts';
import { c } from './runtime.ts';
import type { GlobalOptions } from './types.ts';

type PayloadResolveResult =
  | { type: 'payload'; payload: Record<string, unknown> }
  | { type: 'ambiguous'; field: string; result: Extract<CachedIdResolveResult, { type: 'ambiguous' }> };

export function preparePayload(
  command: string,
  rawPayload: Record<string, unknown>,
  options: GlobalOptions,
  sessionPath?: string,
  writer?: CliWriter,
  registry: Pick<CommandRegistrySnapshot, 'commands'> = BUNDLED_COMMAND_REGISTRY,
): PreparedPayload {
  if (!registry.commands[command]) {
    if (options.json) {
      printJsonError('unknown_command', `Unknown command: ${command}`, writer);
      return { type: 'exit', exitCode: 1 };
    }
    displayUnknownCommand(command, writer);
    return { type: 'exit', exitCode: 1 };
  }

  if (rawPayload.help === 'true' || rawPayload.help === '1') {
    showCommandHelp(command, writer, registry.commands);
    return { type: 'exit', exitCode: 0 };
  }

  const missingArg = validateRequiredArgs(command, rawPayload, registry);
  if (missingArg) {
    if (options.json) {
      printJsonError('missing_required_argument', `Missing required argument: ${missingArg}`, writer);
      return { type: 'exit', exitCode: 1 };
    }
    displayMissingArgument(command, missingArg, writer, registry.commands);
    return { type: 'exit', exitCode: 1 };
  }

  const requestPayload = normalizeParsedPayload(command, rawPayload, registry);
  const resolvedPayload = resolveCachedIdsForPayload(command, requestPayload, sessionPath);
  if (resolvedPayload.type === 'ambiguous') {
    if (options.json) {
      printJsonError('ambiguous_cached_id', cachedIdAmbiguityMessage(resolvedPayload.result), writer);
      return { type: 'exit', exitCode: 1 };
    }
    const writeErr = writer?.err.bind(writer) ?? console.error;
    for (const line of formatCachedIdAmbiguity(command, resolvedPayload.field, resolvedPayload.result)) {
      writeErr(line);
    }
    return { type: 'exit', exitCode: 1 };
  }

  const payload =
    Object.keys(resolvedPayload.payload).length > 0
      ? convertPayloadTypes(resolvedPayload.payload, command, registry)
      : {};
  return { type: 'payload', payload };
}

function resolveCachedIdsForPayload(
  command: string,
  payload: Record<string, unknown>,
  sessionPath?: string,
): PayloadResolveResult {
  const resolvedPayload: Record<string, unknown> = { ...payload };
  const hints = loadIdCacheSync(sessionPath);

  for (const [field, value] of Object.entries(payload)) {
    const kind = idKindForCommandField(command, field);
    if (!kind) continue;

    if (Array.isArray(value)) {
      const resolvedArray: string[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          const resolved = resolveCachedId(kind, item, hints);
          if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
          if (resolved.type === 'resolved') resolvedArray.push(resolved.value);
          else resolvedArray.push(item);
        } else {
          resolvedArray.push(String(item));
        }
      }
      resolvedPayload[field] = resolvedArray;
    } else if (typeof value === 'string') {
      const resolved = resolveCachedId(kind, value, hints);
      if (resolved.type === 'ambiguous') return { type: 'ambiguous', field, result: resolved };
      if (resolved.type === 'resolved') resolvedPayload[field] = resolved.value;
    }
  }

  return { type: 'payload', payload: resolvedPayload };
}

export function displayCommandParseErrors(
  errors: CommandParseError[],
  options: GlobalOptions,
  writer?: CliWriter,
): void {
  if (options.json) {
    printJsonError('validation_error', errors.map((e) => e.message).join('; '), writer);
    return;
  }
  const writeErr = writer?.err.bind(writer) ?? console.error;
  for (const err of errors) {
    writeErr(`${c.red}Error:${c.reset} ${err.message}`);
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
