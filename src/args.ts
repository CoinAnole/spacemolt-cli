import * as fs from 'node:fs';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandConfig } from './commands.ts';

type CommandRegistrySource = Pick<CommandRegistrySnapshot, 'commands'>;

function commandConfig(command: string | undefined, registry: CommandRegistrySource): CommandConfig | undefined {
  if (!command) return undefined;
  return registry.commands[command];
}

export function normalizeParsedPayload(
  command: string,
  payload: Record<string, unknown>,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...payload };
  const config = commandConfig(command, registry);

  const aliases = config?.aliases || {};
  for (const [from, to] of Object.entries(aliases)) {
    if (normalized[from] !== undefined && normalized[to] === undefined) normalized[to] = normalized[from];
    if (from !== to) delete normalized[from];
  }

  return normalized;
}

export function getValidArgNames(
  command: string,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): Set<string> {
  const config = commandConfig(command, registry);
  const argDefs = config?.args || [];
  const validArgNames = new Set<string>(['help']);
  for (const def of argDefs) {
    if (typeof def === 'string') validArgNames.add(def);
    else if (def && typeof def === 'object' && def.rest) validArgNames.add(def.rest);
  }
  if (config?.required) for (const required of config.required) validArgNames.add(required);
  if (config?.aliases) {
    for (const [from, to] of Object.entries(config.aliases)) {
      validArgNames.add(from);
      validArgNames.add(to);
    }
  }
  if (config?.schema) for (const field of Object.keys(config.schema)) validArgNames.add(field);
  return validArgNames;
}

export interface ParsedArgs {
  command: string;
  payload: Record<string, unknown>;
  errors?: ValidationError[];
}

export type FileResolveResult = { ok: true; value: string } | { ok: false; error: string };

export type FileResolver = (filePath: string) => FileResolveResult;

export interface ParseArgsOptions {
  allowUnknown?: boolean;
  registry?: CommandRegistrySource;
  resolveFile?: FileResolver;
}

export type CommandParseError = ValidationError;

export type CommandParseResult =
  | { ok: true; command: string; payload: Record<string, unknown> }
  | { ok: false; errors: CommandParseError[] };

function parseRawArgs(args: string[], registry: CommandRegistrySource): ParsedArgs {
  const command = args[0] || '';
  const payload: Record<string, unknown> = {};
  const errors: ValidationError[] = [];
  const config = commandConfig(command, registry);
  const argDefs = config?.args || [];
  let positionalIndex = 0;
  let inPositionalOnlyMode = false;

  const setPayloadField = (key: string, val: string) => {
    const existing = payload[key];
    if (existing !== undefined) {
      if (Array.isArray(existing)) {
        existing.push(val);
      } else {
        payload[key] = [existing, val];
      }
    } else {
      payload[key] = val;
    }
  };

  const isPrivateChat = () => command === 'chat' && (payload.channel === 'private' || payload.target === 'private');
  const looksLikeNamedArgument = (value: string) =>
    value.startsWith('-') || parseKeyValue(value) !== null || value === '--';
  const hasNamedContentAfter = (startIndex: number) =>
    args.slice(startIndex).some((value) => {
      const flag = parseCliFlag(value);
      if (flag?.key === 'content') return true;
      const keyValue = parseKeyValue(value);
      return keyValue?.key === 'content';
    });
  const pushPrivateChatMissingContentError = () => {
    errors.push({
      field: 'content',
      message: 'Private chat requires both a target and message. Use: spacemolt chat private "Player Name" "Message"',
      code: 'missing_private_chat_content',
    });
  };
  const pushAmbiguousPrivateChatTargetError = (targetPrefix: string, nextToken: string) => {
    errors.push({
      field: 'target_id',
      message: `Ambiguous private chat target "${targetPrefix} ${nextToken}". Quote multi-word player names, or use: spacemolt chat private "Player Name" "Message"`,
      code: 'ambiguous_private_chat_target',
    });
  };
  const pushAmbiguousChatContentError = () => {
    errors.push({
      field: 'content',
      message: 'Chat message must be quoted or passed with --content.',
      code: 'ambiguous_chat_content',
    });
  };

  for (let i = 1; i < args.length; i++) {
    if (errors.length > 0) break;

    const arg = args[i];
    if (!arg) continue;

    if (arg === '--' && !inPositionalOnlyMode) {
      inPositionalOnlyMode = true;
      continue;
    }

    const flag = !inPositionalOnlyMode ? parseCliFlag(arg) : null;
    if (flag) {
      if (flag.value !== undefined) {
        setPayloadField(flag.key, flag.value);
        continue;
      }

      const nextArg = args[i + 1];
      const fieldType = getCommandFieldType(command, flag.key, registry);
      if (fieldType !== 'boolean' && nextArg && !nextArg.startsWith('-') && nextArg.indexOf('=') === -1) {
        setPayloadField(flag.key, nextArg);
        const tokenAfterValue = args[i + 2];
        if (
          command === 'chat' &&
          flag.key === 'target_id' &&
          isPrivateChat() &&
          tokenAfterValue &&
          !looksLikeNamedArgument(tokenAfterValue)
        ) {
          pushAmbiguousPrivateChatTargetError(nextArg, tokenAfterValue);
        }
        if (
          command === 'chat' &&
          flag.key === 'content' &&
          tokenAfterValue &&
          !looksLikeNamedArgument(tokenAfterValue)
        ) {
          pushAmbiguousChatContentError();
        }
        i++;
      } else {
        setPayloadField(flag.key, 'true');
      }
      continue;
    }

    const argDef = argDefs[positionalIndex];
    const keyValue = !inPositionalOnlyMode ? parseKeyValue(arg) : null;
    if (argDef && typeof argDef === 'object' && argDef.rest && (!keyValue || keyValue.key !== argDef.rest)) {
      if (isPrivateChat()) {
        if (payload.target_id === undefined) {
          const nextArg = args[i + 1];
          setPayloadField('target_id', arg);
          if (!nextArg) {
            pushPrivateChatMissingContentError();
            break;
          }
          if (hasNamedContentAfter(i + 1) && !looksLikeNamedArgument(nextArg)) {
            pushAmbiguousPrivateChatTargetError(arg, nextArg);
            break;
          }
          if (looksLikeNamedArgument(nextArg)) {
            positionalIndex++;
            continue;
          }
          const contentTokens = args.slice(i + 1);
          if (contentTokens.length > 1) {
            pushAmbiguousChatContentError();
            break;
          }
          payload[argDef.rest] = nextArg;
          break;
        }

        if (hasNamedContentAfter(i + 1) && !looksLikeNamedArgument(arg)) {
          const targetId = Array.isArray(payload.target_id) ? String(payload.target_id[0]) : String(payload.target_id);
          pushAmbiguousPrivateChatTargetError(targetId, arg);
          break;
        }
      }
      if (command === 'chat' && args.slice(i).length > 1) {
        pushAmbiguousChatContentError();
        break;
      }
      payload[argDef.rest] = args.slice(i).join(' ');
      break;
    }

    if (keyValue) {
      setPayloadField(keyValue.key, keyValue.value);
    } else {
      if (argDef) {
        if (typeof argDef === 'string') {
          setPayloadField(argDef, arg);
        } else if (argDef.rest) {
          payload[argDef.rest] = args.slice(i).join(' ');
          break;
        }
      } else if (positionalIndex === 0 && !payload.id && !payload.target_id) {
        payload.id = arg;
      }
      positionalIndex++;
    }
  }

  return errors.length > 0 ? { command, payload, errors } : { command, payload };
}

function defaultResolveFile(filePath: string): FileResolveResult {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { ok: true, value: content };
  } catch (e: unknown) {
    return { ok: false, error: `Could not read file "${filePath}": ${e instanceof Error ? e.message : String(e)}` };
  }
}

function resolveValue(val: string, resolveFile: FileResolver): FileResolveResult {
  if (val.startsWith('@')) {
    const filePath = val.slice(1);
    return resolveFile(filePath);
  }
  return { ok: true, value: val };
}

function resolvePayloadFiles(
  payload: Record<string, unknown>,
  resolveFile: FileResolver,
): { ok: true; payload: Record<string, unknown> } | { ok: false; field: string; error: string } {
  const resolved: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      const resolvedArray: unknown[] = [];
      for (const item of value) {
        if (typeof item === 'string') {
          const res = resolveValue(item, resolveFile);
          if (!res.ok) {
            return { ok: false, field: key, error: res.error };
          }
          resolvedArray.push(res.value);
        } else {
          resolvedArray.push(item);
        }
      }
      resolved[key] = resolvedArray;
    } else if (typeof value === 'string') {
      const res = resolveValue(value, resolveFile);
      if (!res.ok) {
        return { ok: false, field: key, error: res.error };
      }
      resolved[key] = res.value;
    } else {
      resolved[key] = value;
    }
  }
  return { ok: true, payload: resolved };
}

export function parseArgs(args: string[], options: ParseArgsOptions = {}): CommandParseResult {
  const registry = options.registry || BUNDLED_COMMAND_REGISTRY;
  const parsed = parseRawArgs(args, registry);

  const resolved = resolvePayloadFiles(parsed.payload, options.resolveFile ?? defaultResolveFile);
  if (!resolved.ok) {
    return {
      ok: false,
      errors: [
        {
          field: resolved.field,
          message: resolved.error,
          code: 'file_read_error',
        },
      ],
    };
  }

  const payload = resolved.payload;

  if (payload.payload_json !== undefined) {
    const payloadJsonVal = payload.payload_json;
    delete payload.payload_json;

    const jsonStrings = Array.isArray(payloadJsonVal) ? payloadJsonVal : [payloadJsonVal];
    for (const jsonStr of jsonStrings) {
      if (typeof jsonStr !== 'string') {
        return {
          ok: false,
          errors: [
            {
              field: 'payload_json',
              message: 'Invalid --payload-json: value must be a JSON object.',
              code: 'invalid_field_type',
            },
          ],
        };
      }
      try {
        const parsedJson = JSON.parse(jsonStr);
        if (parsedJson === null || typeof parsedJson !== 'object' || Array.isArray(parsedJson)) {
          return {
            ok: false,
            errors: [
              {
                field: 'payload_json',
                message: 'Invalid --payload-json: value must be a JSON object.',
                code: 'invalid_field_type',
              },
            ],
          };
        }
        for (const [k, v] of Object.entries(parsedJson)) {
          payload[k] = v;
        }
      } catch (e: unknown) {
        return {
          ok: false,
          errors: [
            {
              field: 'payload_json',
              message: `Failed to parse --payload-json: ${e instanceof Error ? e.message : String(e)}`,
              code: 'invalid_field_type',
            },
          ],
        };
      }
    }
  }

  const errors = [
    ...(parsed.errors ?? []),
    ...(options.allowUnknown ? [] : validateKnownPayloadFields(parsed.command, payload, registry)),
    ...validatePayloadAgainstSchema(parsed.command, payload, registry),
  ];
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, command: parsed.command, payload };
}

function normalizeCliKey(key: string): string {
  return key.replace(/^-+/, '').replace(/-/g, '_');
}

function parseCliFlag(arg: string): { key: string; value?: string } | null {
  if (!arg.startsWith('--') || arg === '--') return null;
  const eqIndex = arg.indexOf('=');
  if (eqIndex > 0) return { key: normalizeCliKey(arg.slice(2, eqIndex)), value: arg.slice(eqIndex + 1) };
  return { key: normalizeCliKey(arg.slice(2)) };
}

function parseKeyValue(arg: string): { key: string; value: string } | null {
  const eqIndex = arg.indexOf('=');
  if (eqIndex <= 0) return null;
  return { key: normalizeCliKey(arg.substring(0, eqIndex)), value: arg.substring(eqIndex + 1) };
}

export function validateRequiredArgs(
  command: string,
  payload: Record<string, unknown>,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): string | null {
  const required = commandConfig(command, registry)?.required;
  if (!required) return null;
  const normalized = normalizeParsedPayload(command, payload, registry);
  for (const arg of required) {
    if (payload[arg]) continue;
    const canonicalRequired = normalizeParsedPayload(command, { [arg]: '__required__' }, registry);
    const canonicalKeys = Object.keys(canonicalRequired);
    if (canonicalKeys.some((key) => normalized[key])) continue;
    return arg;
  }
  return null;
}

export interface ValidationError {
  field: string;
  message: string;
  code:
    | 'unknown_field'
    | 'invalid_enum'
    | 'invalid_integer'
    | 'invalid_number'
    | 'invalid_boolean'
    | 'invalid_field_type'
    | 'file_read_error'
    | 'missing_private_chat_content'
    | 'ambiguous_private_chat_target'
    | 'ambiguous_chat_content';
}

export function validateKnownPayloadFields(
  command: string,
  payload: Record<string, unknown>,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): ValidationError[] {
  const config = commandConfig(command, registry);
  if (!config) return [];
  const validArgNames = getValidArgNames(command, registry);
  const errors: ValidationError[] = [];

  for (const key of Object.keys(payload)) {
    if (validArgNames.has(key)) continue;
    const suggestion = suggestClosest(key, [...validArgNames]);
    const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
    errors.push({
      field: key,
      message: `Unknown field "${key}" for "${command}".${hint} Use --allow-unknown or --raw to pass it through.`,
      code: 'unknown_field',
    });
  }

  return errors;
}

export function validatePayloadAgainstSchema(
  command: string,
  payload: Record<string, unknown>,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const config = commandConfig(command, registry);
  const schema = config?.schema;
  if (!schema) return errors;

  for (const [key, value] of Object.entries(payload)) {
    const fieldSchema = schema[key];
    if (!fieldSchema) continue;

    if (fieldSchema.enum && fieldSchema.enum.length > 0) {
      const values = Array.isArray(value)
        ? value
        : config.arrayFields?.includes(key) && typeof value === 'string'
          ? value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [value];
      const invalidValue = values.find((v) => !fieldSchema.enum?.includes(String(v)));
      if (invalidValue !== undefined) {
        errors.push({
          field: key,
          message: `Invalid value "${invalidValue}" for "${key}". Expected one of: ${fieldSchema.enum.join(', ')}`,
          code: 'invalid_enum',
        });
      }
    }

    if (fieldSchema.type === 'integer' || fieldSchema.type === 'number') {
      const values = Array.isArray(value) ? value : [value];
      for (const val of values) {
        if (typeof val === 'number') {
          if (fieldSchema.type === 'integer' && !Number.isInteger(val)) {
            errors.push({
              field: key,
              message: schemaTypeErrorMessage(key, 'integer', val),
              code: 'invalid_integer',
            });
          }
          continue;
        }
        const num = parseTypedNumber(String(val), fieldSchema.type);
        if (num === undefined) {
          errors.push({
            field: key,
            message: schemaTypeErrorMessage(key, fieldSchema.type, val),
            code: fieldSchema.type === 'integer' ? 'invalid_integer' : 'invalid_number',
          });
        }
      }
    }

    if (fieldSchema.type === 'boolean') {
      const values = Array.isArray(value) ? value : [value];
      for (const val of values) {
        if (typeof val === 'boolean') continue;
        if (val !== 'true' && val !== 'false') {
          const suggestion = suggestBooleanCorrection(String(val));
          const hint = suggestion ? ` Did you mean "${suggestion}"?` : '';
          errors.push({
            field: key,
            message: `${schemaTypeErrorMessage(key, 'boolean', val)}${hint}`,
            code: 'invalid_boolean',
          });
        }
      }
    }
  }

  return errors;
}

function schemaTypeErrorMessage(field: string, expectedType: string, received: unknown): string {
  const article = expectedType === 'integer' ? 'an' : 'a';
  return `Parameter "${field}" must be ${article} ${expectedType}, but received ${formatReceivedValue(received)}.`;
}

function formatReceivedValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? String(value) : encoded;
}

function suggestBooleanCorrection(value: string): string | null {
  const lower = value.toLowerCase();
  if (levenshteinDistance(lower, 'true') <= 2 || (lower.startsWith('tr') && lower.length <= 4)) return 'true';
  if (levenshteinDistance(lower, 'false') <= 2 || (lower.startsWith('fa') && lower.length <= 5)) return 'false';
  if (lower === '1' || lower === 'yes' || lower === 'on') return 'true';
  if (lower === '0' || lower === 'no' || lower === 'off') return 'false';
  return null;
}

function suggestClosest(value: string, candidates: string[]): string | null {
  let best: { candidate: string; distance: number } | null = null;
  for (const candidate of candidates) {
    const distance = levenshteinDistance(value, candidate);
    if (!best || distance < best.distance) best = { candidate, distance };
  }
  if (!best) return null;
  const threshold = Math.max(2, Math.floor(Math.max(value.length, best.candidate.length) / 3));
  return best.distance <= threshold ? best.candidate : null;
}

function levenshteinDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < previous.length; j++) previous[j] = current[j] ?? 0;
  }
  return previous[b.length] ?? 0;
}

export function getArgNames(config: Pick<CommandConfig, 'args' | 'required'>): string[] {
  const names: string[] = [];
  for (const arg of config.args || []) {
    names.push(typeof arg === 'string' ? arg : arg.rest);
  }
  for (const arg of config.required || []) {
    if (!names.includes(arg)) names.push(arg);
  }
  return names;
}

type PayloadConversionSchema = Record<string, { type?: string; enum?: string[] }>;

export function getPayloadConversionSchema(
  command: string | undefined,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): PayloadConversionSchema {
  return commandConfig(command, registry)?.schema || {};
}

function getCommandFieldType(
  command: string | undefined,
  key: string,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): string | undefined {
  if (!command) return undefined;
  return getPayloadConversionSchema(command, registry)[key]?.type;
}

function parseTypedNumber(value: string, fieldType: string): number | undefined {
  if (value.trim() === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  if (fieldType === 'integer' && !Number.isInteger(num)) return undefined;
  return num;
}

export function convertPayloadTypes(
  payload: Record<string, unknown>,
  command?: string,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    const fieldType = getCommandFieldType(command, key, registry);

    const convertSingle = (val: unknown): unknown => {
      if (typeof val !== 'string') return val;
      if (fieldType === 'integer' || fieldType === 'number') {
        const num = parseTypedNumber(val, fieldType);
        if (num !== undefined) return num;
      }
      if (fieldType === 'boolean') {
        if (val === 'true') return true;
        if (val === 'false') return false;
      }
      if (val === 'true') return true;
      if (val === 'false') return false;
      return val;
    };

    if (Array.isArray(value)) {
      result[key] = value.map(convertSingle);
    } else {
      result[key] = convertSingle(value);
    }
  }
  return result;
}

export function applyPayloadTransforms(
  command: string,
  payload: Record<string, unknown>,
  registry: CommandRegistrySource = BUNDLED_COMMAND_REGISTRY,
): Record<string, unknown> {
  const config = commandConfig(command, registry);
  return applyCommandPayloadTransforms(config, payload);
}

export function applyCommandPayloadTransforms(
  config: Pick<CommandConfig, 'arrayFields'> | undefined,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const transformed = { ...payload };

  // Apply array field splitting from metadata
  if (config?.arrayFields) {
    for (const field of config.arrayFields) {
      const val = transformed[field];
      if (typeof val === 'string') {
        transformed[field] = val
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    }
  }

  return transformed;
}
