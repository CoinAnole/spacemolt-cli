import {
  extractFields,
  getObjectResult,
  getStructuredResult,
  normalizeStructuredResultForDisplay,
} from '../response.ts';
import { c, PLAIN, QUIET } from '../runtime.ts';
import type { APIResponse } from '../types.ts';
import { resultFormatters } from './formatters.ts';

export function displayStructuredResult(command: string, result: Record<string, unknown>, fields?: string[]): void {
  if (!result) return;

  // Handle --fields extraction
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

  const viewModel = normalizeStructuredResultForDisplay(result);

  // Show auto-dock/undock flags before the viewModel (skip in quiet mode)
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

  // Default: print JSON
  console.log(`\n${c.bright}=== Response ===${c.reset}`);
  console.log(JSON.stringify(viewModel, null, 2));
}

export function displayResult(command: string, response: APIResponse, fields?: string[]): void {
  // Skip timestamp in quiet mode
  if (!QUIET) {
    console.log(`${c.dim}[${new Date().toISOString()}]${c.reset}`);
  }
  const structured = getStructuredResult(response);
  if (structured) {
    displayStructuredResult(command, structured, fields);
    return;
  }

  const viewModel = getObjectResult(response);
  if (viewModel) {
    displayStructuredResult(command, viewModel, fields);
    return;
  }

  if (typeof response.result === 'string' && response.result.trim()) {
    console.log(response.result);
    return;
  }

  if (command === 'session') return;
}
