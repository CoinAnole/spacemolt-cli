import { evaluateJq, formatJqResult } from '../jq.ts';
import {
  extractFields,
  getObjectResult,
  getStructuredResult,
  normalizeStructuredResultForDisplay,
} from '../response.ts';
import { COMPACT, c, FORMAT, PLAIN, QUIET } from '../runtime.ts';
import type { APIResponse, GlobalOptions } from '../types.ts';
import { toYaml } from '../yaml.ts';
import { resultFormatters } from './formatters.ts';

export function displayStructuredResult(
  command: string,
  result: Record<string, unknown>,
  options?: GlobalOptions,
): void {
  if (!result) return;

  const fields = options?.fields;
  const format = options?.format ?? FORMAT;
  const compact = options?.compact ?? COMPACT;
  const jqExpr = options?.jq;

  if (fields && fields.length > 0) {
    const extracted = extractFields(result, fields);
    if (PLAIN) {
      for (const [key, value] of Object.entries(extracted)) {
        console.log(`${key}=${JSON.stringify(value)}`);
      }
    } else {
      console.log(JSON.stringify(extracted));
    }
    return;
  }

  if (jqExpr) {
    try {
      const jqResult = evaluateJq(result, jqExpr);
      console.log(formatJqResult(jqResult));
    } catch (err) {
      console.error(`${c.red}Error:${c.reset} ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (format === 'yaml') {
    console.log(toYaml(result));
    return;
  }

  if (format === 'text') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (compact) {
    console.log(JSON.stringify(result));
    return;
  }

  const viewModel = normalizeStructuredResultForDisplay(result);

  if (!QUIET) {
    if (viewModel.auto_docked)
      console.log(`${c.cyan}[AUTO-DOCKED]${c.reset} Automatically docked at station (cost 1 extra tick)`);
    if (viewModel.auto_undocked)
      console.log(`${c.cyan}[AUTO-UNDOCKED]${c.reset} Automatically undocked from station (cost 1 extra tick)`);
  }

  for (const formatter of resultFormatters) {
    if (formatter(viewModel, command)) return;
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
}

export function displayResult(command: string, response: APIResponse, options?: GlobalOptions): void {
  const noTimestamp = options?.noTimestamp ?? false;
  if (!QUIET && !noTimestamp) {
    console.log(`${c.dim}[${new Date().toISOString()}]${c.reset}`);
  }
  const structured = getStructuredResult(response);
  if (structured) {
    displayStructuredResult(command, structured, options);
    return;
  }

  const viewModel = getObjectResult(response);
  if (viewModel) {
    displayStructuredResult(command, viewModel, options);
    return;
  }

  if (typeof response.result === 'string' && response.result.trim()) {
    console.log(response.result);
    return;
  }

  if (command === 'session') return;
}
