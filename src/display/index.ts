import type { CliRuntimeContext } from '../cli-context.ts';
import { evaluateJq, formatJqResult, jqResultValue } from '../jq.ts';
import {
  extractFields,
  getFieldValue,
  getObjectResult,
  getStructuredResult,
  isRecord,
  normalizeStructuredResultForDisplay,
  normalizeStructuredResultForOutput,
} from '../response.ts';
import { findOutputSearchMatches, formatOutputSearchLine, hasOutputSearch } from '../output-search.ts';
import type { APIResponse, GlobalOptions, OutputFormat } from '../types.ts';
import { toYaml } from '../yaml.ts';
import { commandScopedFormatters, resultFormatters, shapeFallbackFormatters } from './formatters.ts';
import { c, type DisplayRenderBuffer, emitError, emitLine, withDisplayRenderBuffer } from './helpers.ts';

export interface RenderedDisplay {
  success: boolean;
  stdout: string[];
  stderr: string[];
}

type DisplayContext = Pick<CliRuntimeContext, 'clock'> &
  Partial<Pick<CliRuntimeContext, 'config' | 'output' | 'writer'>>;

function hasFields(fields: string[] | undefined): fields is string[] {
  return Boolean(fields && fields.length > 0);
}

function hasField(field: string | undefined): field is string {
  return Boolean(field && field.length > 0);
}

function hasKeys(keys: string | undefined): keys is string {
  return keys !== undefined;
}

function fieldPaths(field: string): string[] {
  return field
    .split(',')
    .map((path) => path.trim())
    .filter(Boolean);
}

function getOutputFormat(options?: GlobalOptions, context?: DisplayContext): OutputFormat {
  if (options?.format) return options.format;
  if (options?.json ?? context?.output?.json ?? context?.config?.jsonOutput) return 'json';
  if (options?.structured) return 'json';
  return context?.output?.format ?? context?.config?.format ?? 'table';
}

function isQuiet(options?: GlobalOptions, context?: DisplayContext): boolean {
  return options?.quiet ?? context?.output?.quiet ?? context?.config?.quiet ?? false;
}

function isCompact(options?: GlobalOptions, context?: DisplayContext): boolean {
  return options?.compact ?? context?.output?.compact ?? context?.config?.compact ?? false;
}

function isPlain(options?: GlobalOptions, context?: DisplayContext): boolean {
  return options?.plain ?? context?.output?.plain ?? context?.config?.plain ?? false;
}

function isDebug(context?: DisplayContext): boolean {
  return context?.config?.debug ?? false;
}

function stringifyJson(value: unknown, compact: boolean): string {
  return JSON.stringify(value, null, compact ? 0 : 2);
}

function formatProjection(
  value: unknown,
  format: OutputFormat,
  compact: boolean,
  projection: 'jq' | 'fields' | 'field',
): string {
  if (format === 'yaml') return toYaml(projection === 'jq' ? jqResultValue(value) : value);
  if (format === 'text') {
    if (projection === 'jq') return formatJqResult(value, compact);
    if (typeof value === 'string') return value;
    if (value === undefined) return 'null';
    return stringifyJson(value, compact);
  }
  if (format === 'json') return stringifyJson(projection === 'jq' ? jqResultValue(value) : value, compact);
  if (projection === 'field') {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (value === undefined) return 'null';
    return stringifyJson(value, compact);
  }
  if (projection === 'jq') return formatJqResult(value, compact);
  return JSON.stringify(value);
}

function isEmptyJqOutput(value: unknown): boolean {
  const output = jqResultValue(value);
  return output === undefined || output === '' || (Array.isArray(output) && output.length === 0);
}

function formatEmptyJqOutputWarning(): string {
  return [
    `${c.yellow}[warning]${c.reset} --jq produced no output. Path may not exist in structuredContent.`,
    'Use --keys to explore available fields, or add --fuzzy for auto-resolution.',
  ].join('\n');
}

type FieldProjectionResult = { success: true; value: unknown } | { success: false; message: string; fatal: boolean };
type KeysProjectionResult = { success: true; keys: string[] } | { success: false; message: string; fatal: boolean };

function formatAvailableKeys(result: Record<string, unknown>): string | undefined {
  const keys = Object.keys(result);
  if (keys.length === 0) return undefined;
  return `Available keys: ${keys.join(', ')}`;
}

function formatFieldNotFoundMessage(result: Record<string, unknown>, field: string): string {
  return [`Field not found: "${field}"`, formatAvailableKeys(result)].filter(Boolean).join('\n');
}

function formatFieldsNotFoundMessage(result: Record<string, unknown>, fields: string[]): string | undefined {
  const availableKeys = formatAvailableKeys(result);
  if (!availableKeys) return undefined;
  return [`Fields not found: ${fields.join(', ')}`, availableKeys].join('\n');
}

function formatAvailableTopLevelKeys(result: Record<string, unknown>): string {
  const keys = Object.keys(result);
  return keys.length > 0 ? `Available top-level keys: ${keys.join(', ')}` : 'Available top-level keys:';
}

function normalizeKeysPath(result: Record<string, unknown>, path: string): string {
  const normalized = path.trim().replace(/^\./, '');
  if (normalized === 'structuredContent' && !Object.hasOwn(result, 'structuredContent')) return '';
  if (normalized.startsWith('structuredContent.') && !Object.hasOwn(result, 'structuredContent')) {
    return normalized.slice('structuredContent.'.length);
  }
  return normalized;
}

function resolveKeysValue(
  result: Record<string, unknown>,
  path: string,
): { found: true; value: unknown } | { found: false } {
  const normalized = normalizeKeysPath(result, path);
  if (!normalized) return { found: true, value: result };

  let current: unknown = result;
  for (const part of normalized.split('.')) {
    if (!part) continue;
    if (Array.isArray(current)) {
      const index = Number.parseInt(part, 10);
      if (Number.isNaN(index) || !Object.hasOwn(current, index)) return { found: false };
      current = current[index];
    } else if (isRecord(current)) {
      if (!Object.hasOwn(current, part)) return { found: false };
      current = current[part];
    } else {
      return { found: false };
    }
  }

  return { found: true, value: current };
}

function jsonValueKind(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function formatNotObjectMessage(path: string, value: unknown): string {
  const displayPath = path.trim().replace(/^\./, '') || '.';
  const kind = jsonValueKind(value);
  if (kind === 'string' || kind === 'number' || kind === 'boolean') {
    return `"${displayPath}" is a scalar (${kind}), not an object.`;
  }
  const article = kind === 'array' || kind === 'object' ? 'an' : 'a';
  return `"${displayPath}" is ${article} ${kind}, not an object.`;
}

function resolveKeysProjection(result: Record<string, unknown>, path: string): KeysProjectionResult {
  const resolved = resolveKeysValue(result, path);
  if (!resolved.found) {
    const displayPath = path.trim().replace(/^\./, '');
    return {
      success: false,
      message: `Path "${displayPath}" not found. ${formatAvailableTopLevelKeys(result)}`,
      fatal: true,
    };
  }
  if (!isRecord(resolved.value)) {
    return { success: false, message: formatNotObjectMessage(path, resolved.value), fatal: true };
  }
  return { success: true, keys: Object.keys(resolved.value) };
}

function resolveFieldProjection(result: Record<string, unknown>, field: string): FieldProjectionResult {
  const exact = getFieldValue(result, field);
  if (exact !== undefined) return { success: true, value: exact };
  if (field.includes('.')) return { success: false, message: formatFieldNotFoundMessage(result, field), fatal: false };

  const matches = Object.entries(result)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .filter(([, value]) => Object.hasOwn(value, field))
    .map(([key, value]) => ({ path: `${key}.${field}`, value: value[field] }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const singleMatch = matches[0];
  if (matches.length === 1 && singleMatch) return { success: true, value: singleMatch.value };
  if (matches.length > 1) {
    return {
      success: false,
      message: `Ambiguous field "${field}". Use one of: ${matches.map((match) => match.path).join(', ')}`,
      fatal: true,
    };
  }

  return { success: false, message: formatFieldNotFoundMessage(result, field), fatal: false };
}

export function displayStructuredResult(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  const rendered = renderStructuredResult(command, result, options, context);
  writeRendered(rendered, context);
  return rendered.success;
}

export function renderStructuredResult(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
  context?: DisplayContext,
): RenderedDisplay {
  const buffer: DisplayRenderBuffer = { stdout: [], stderr: [] };
  const success = withDisplayRenderBuffer(
    buffer,
    () => displayStructuredResultInternal(command, result, options, context),
    { plain: isPlain(options, context) },
  );
  return { success, stdout: buffer.stdout, stderr: buffer.stderr };
}

function displayStructuredResultInternal(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
  context?: DisplayContext,
): boolean {
  if (!result) return true;

  const fields = options?.fields;
  const field = options?.field;
  const format = getOutputFormat(options, context);
  const compact = isCompact(options, context);
  const jqExpr = options?.jq;
  const outputSearch = hasOutputSearch(options);
  const keysPath = options?.keys;
  const structuredOutputResult = normalizeStructuredResultForOutput(command, result);

  if (hasKeys(keysPath)) {
    if (jqExpr) {
      emitError(`${c.red}Error:${c.reset} --keys and --jq are mutually exclusive.`);
      return false;
    }
    const resolved = resolveKeysProjection(structuredOutputResult, keysPath);
    if (!resolved.success) {
      emitError(`${c.red}Error:${c.reset} ${resolved.message}`);
      return !resolved.fatal;
    }
    for (const key of resolved.keys) emitLine(key);
    return true;
  }

  if (jqExpr) {
    try {
      const jqResult = evaluateJq(structuredOutputResult, jqExpr, { fuzzy: options?.fuzzy });
      if (isEmptyJqOutput(jqResult)) {
        emitError(formatEmptyJqOutputWarning());
        return false;
      }
      if (outputSearch) {
        const searchResult = findOutputSearchMatches(jqResultValue(jqResult), options ?? ({} as GlobalOptions));
        if (!searchResult.ok) {
          emitError(`${c.red}Error:${c.reset} ${searchResult.message}`);
          return false;
        }
        for (const match of searchResult.matches) emitLine(formatOutputSearchLine(match));
        return true;
      }
      emitLine(formatProjection(jqResult, format, compact, 'jq'));
      return true;
    } catch (err) {
      emitError(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  if (outputSearch) {
    const searchResult = findOutputSearchMatches(structuredOutputResult, options ?? ({} as GlobalOptions));
    if (!searchResult.ok) {
      emitError(`${c.red}Error:${c.reset} ${searchResult.message}`);
      return false;
    }
    for (const match of searchResult.matches) emitLine(formatOutputSearchLine(match));
    return true;
  }

  if (hasField(field)) {
    const paths = fieldPaths(field);
    if (paths.length > 1) {
      const extracted = extractFields(structuredOutputResult, paths);
      emitLine(formatProjection(extracted, format, compact, 'fields'));
      return true;
    }

    const resolved = resolveFieldProjection(structuredOutputResult, field);
    if (!resolved.success) {
      emitError(`${c.red}Error:${c.reset} ${resolved.message}`);
      if (resolved.fatal) return false;
      emitLine(formatProjection(undefined, format, compact, 'field'));
      return true;
    }
    const extracted = resolved.value;
    emitLine(formatProjection(extracted, format, compact, 'field'));
    return true;
  }

  if (hasFields(fields)) {
    const extracted = extractFields(structuredOutputResult, fields);
    if (Object.keys(extracted).length === 0) {
      const message = formatFieldsNotFoundMessage(structuredOutputResult, fields);
      if (message) emitError(`${c.red}Error:${c.reset} ${message}`);
    }
    emitLine(formatProjection(extracted, format, compact, 'fields'));
    return true;
  }

  if (format === 'json') {
    emitLine(stringifyJson(structuredOutputResult, compact));
    return true;
  }

  if (format === 'yaml') {
    emitLine(toYaml(structuredOutputResult));
    return true;
  }

  if (compact) {
    emitLine(JSON.stringify(structuredOutputResult));
    return true;
  }

  const viewModel = normalizeStructuredResultForDisplay(result);

  if (!isQuiet(options, context)) {
    if (viewModel.auto_docked)
      emitLine(`${c.cyan}[AUTO-DOCKED]${c.reset} Automatically docked at station (cost 1 extra tick)`);
    if (viewModel.auto_undocked)
      emitLine(`${c.cyan}[AUTO-UNDOCKED]${c.reset} Automatically undocked from station (cost 1 extra tick)`);
  }

  for (const formatter of commandScopedFormatters(resultFormatters, command)) {
    if (formatter(viewModel, command)) return true;
  }

  for (const formatter of shapeFallbackFormatters(resultFormatters, command)) {
    if (formatter(viewModel, command)) return true;
  }

  const resultKeys = Object.keys(viewModel);
  const nearMisses = resultFormatters.filter(
    (formatter) => formatter.hintKeys?.length && formatter.hintKeys.every((key) => resultKeys.includes(key)),
  );
  if (isDebug(context) && nearMisses.length > 0) {
    const names = nearMisses
      .map((formatter) => formatter.formatterName)
      .filter(Boolean)
      .join(', ');
    emitError(
      `${c.yellow}[DRIFT WARNING]${c.reset} '${command}' response has keys matching formatter(s) [${names}] but none matched. Response keys: [${resultKeys.join(', ')}]`,
    );
  }

  emitLine(`\n${c.bright}=== Response ===${c.reset}`);
  emitLine(JSON.stringify(viewModel, null, 2));
  return true;
}

export function displayResult(
  command: string,
  response: APIResponse,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  const rendered = renderResult(command, response, options, context);
  writeRendered(rendered, context);
  return rendered.success;
}

export function renderResult(
  command: string,
  response: APIResponse,
  options?: GlobalOptions,
  context?: DisplayContext,
): RenderedDisplay {
  const buffer: DisplayRenderBuffer = { stdout: [], stderr: [] };
  const success = withDisplayRenderBuffer(buffer, () => displayResultInternal(command, response, options, context), {
    plain: isPlain(options, context),
  });
  return { success, stdout: buffer.stdout, stderr: buffer.stderr };
}

function displayResultInternal(
  command: string,
  response: APIResponse,
  options?: GlobalOptions,
  context?: DisplayContext,
): boolean {
  const noTimestamp = options?.noTimestamp ?? false;
  if (!isQuiet(options, context) && !noTimestamp) {
    emitLine(`${c.dim}[${(context?.clock.now() ?? new Date()).toISOString()}]${c.reset}`);
  }
  const structured = getStructuredResult(response);
  if (structured) {
    return displayStructuredResultInternal(command, structured, options, context);
  }

  const viewModel = getObjectResult(response);
  if (viewModel) {
    return displayStructuredResultInternal(command, viewModel, options, context);
  }

  if (typeof response.result === 'string' && response.result.trim()) {
    emitLine(response.result);
    return true;
  }

  if (command === 'session') return true;
  return true;
}

function writeRendered(rendered: RenderedDisplay, context?: CliRuntimeContext): void {
  const writer = context?.writer;
  for (const line of rendered.stdout) {
    if (writer) writer.out(line);
    else console.log(line);
  }
  for (const line of rendered.stderr) {
    if (writer) writer.err(line);
    else console.error(line);
  }
}
