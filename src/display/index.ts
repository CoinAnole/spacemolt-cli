import type { CliRuntimeContext } from '../cli-context.ts';
import { withCliWriterSync } from '../cli-context.ts';
import { evaluateJq, formatJqResult } from '../jq.ts';
import {
  extractFields,
  getObjectResult,
  getStructuredResult,
  normalizeStructuredResultForDisplay,
} from '../response.ts';
import { COMPACT, c, FORMAT, QUIET } from '../runtime.ts';
import type { APIResponse, GlobalOptions, OutputFormat } from '../types.ts';
import { toYaml } from '../yaml.ts';
import { commandScopedFormatters, resultFormatters, shapeFallbackFormatters } from './formatters.ts';

function hasFields(fields: string[] | undefined): fields is string[] {
  return Boolean(fields && fields.length > 0);
}

function getOutputFormat(options?: GlobalOptions, context?: CliRuntimeContext): OutputFormat {
  if (options?.format) return options.format;
  if (options?.json ?? context?.output?.json ?? context?.config?.jsonOutput) return 'json';
  return context?.output?.format ?? context?.config?.format ?? FORMAT;
}

function isQuiet(options?: GlobalOptions, context?: CliRuntimeContext): boolean {
  return options?.quiet ?? context?.output?.quiet ?? context?.config?.quiet ?? QUIET;
}

function isCompact(options?: GlobalOptions, context?: CliRuntimeContext): boolean {
  return options?.compact ?? context?.output?.compact ?? context?.config?.compact ?? COMPACT;
}

function stringifyJson(value: unknown, compact: boolean): string {
  return JSON.stringify(value, null, compact ? 0 : 2);
}

function formatProjection(value: unknown, format: OutputFormat, compact: boolean, projection: 'jq' | 'fields'): string {
  if (format === 'yaml') return toYaml(value);
  if (format === 'text') {
    if (typeof value === 'string') return value;
    if (value === undefined) return 'null';
    return stringifyJson(value, compact);
  }
  if (format === 'json') return stringifyJson(value, compact);
  if (projection === 'jq') return formatJqResult(value, compact);
  return JSON.stringify(value);
}

export function displayStructuredResult(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  if (context) {
    return withCliWriterSync(context.writer, () => displayStructuredResultInternal(command, result, options, context));
  }
  return displayStructuredResultInternal(command, result, options, context);
}

function displayStructuredResultInternal(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  if (!result) return true;

  const fields = options?.fields;
  const format = getOutputFormat(options, context);
  const compact = isCompact(options, context);
  const jqExpr = options?.jq;

  if (jqExpr) {
    try {
      const jqResult = evaluateJq(result, jqExpr);
      console.log(formatProjection(jqResult, format, compact, 'jq'));
      return true;
    } catch (err) {
      console.error(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  if (hasFields(fields)) {
    const extracted = extractFields(result, fields);
    console.log(formatProjection(extracted, format, compact, 'fields'));
    return true;
  }

  if (format === 'json') {
    console.log(stringifyJson(result, compact));
    return true;
  }

  if (format === 'yaml') {
    console.log(toYaml(result));
    return true;
  }

  if (format === 'text') {
    console.log(JSON.stringify(result, null, 2));
    return true;
  }

  if (compact) {
    console.log(JSON.stringify(result));
    return true;
  }

  const viewModel = normalizeStructuredResultForDisplay(result);

  if (!isQuiet(options, context)) {
    if (viewModel.auto_docked)
      console.log(`${c.cyan}[AUTO-DOCKED]${c.reset} Automatically docked at station (cost 1 extra tick)`);
    if (viewModel.auto_undocked)
      console.log(`${c.cyan}[AUTO-UNDOCKED]${c.reset} Automatically undocked from station (cost 1 extra tick)`);
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
  if (nearMisses.length > 0) {
    const names = nearMisses
      .map((formatter) => formatter.formatterName)
      .filter(Boolean)
      .join(', ');
    console.error(
      `${c.yellow}[DRIFT WARNING]${c.reset} '${command}' response has keys matching formatter(s) [${names}] but none matched. Response keys: [${resultKeys.join(', ')}]`,
    );
  }

  console.log(`\n${c.bright}=== Response ===${c.reset}`);
  console.log(JSON.stringify(viewModel, null, 2));
  return true;
}

export function displayResult(
  command: string,
  response: APIResponse,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  if (context) {
    return withCliWriterSync(context.writer, () => displayResultInternal(command, response, options, context));
  }
  return displayResultInternal(command, response, options, context);
}

function displayResultInternal(
  command: string,
  response: APIResponse,
  options?: GlobalOptions,
  context?: CliRuntimeContext,
): boolean {
  const noTimestamp = options?.noTimestamp ?? false;
  if (!isQuiet(options, context) && !noTimestamp) {
    console.log(`${c.dim}[${(context?.clock.now() ?? new Date()).toISOString()}]${c.reset}`);
  }
  const structured = getStructuredResult(response);
  if (structured) {
    return displayStructuredResult(command, structured, options, context);
  }

  const viewModel = getObjectResult(response);
  if (viewModel) {
    return displayStructuredResult(command, viewModel, options, context);
  }

  if (typeof response.result === 'string' && response.result.trim()) {
    console.log(response.result);
    return true;
  }

  if (command === 'session') return true;
  return true;
}
