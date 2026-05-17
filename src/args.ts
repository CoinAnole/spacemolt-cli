import { COMMANDS, type CommandConfig } from './commands.ts';

export function normalizeParsedPayload(command: string, payload: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = { ...payload };
  const aliases = COMMANDS[command]?.aliases || {};

  for (const [from, to] of Object.entries(aliases)) {
    if (normalized[from] !== undefined && normalized[to] === undefined) normalized[to] = normalized[from];
    if (from !== to) delete normalized[from];
  }

  return normalized;
}

export function parseArgs(args: string[]): { command: string; payload: Record<string, string>; warnings: string[] } {
  const command = args[0] || '';
  const payload: Record<string, string> = {};
  const warnings: string[] = [];
  const config = COMMANDS[command];
  const argDefs = config?.args || [];
  const validArgNames = new Set<string>();
  for (const def of argDefs) {
    if (typeof def === 'string') validArgNames.add(def);
    else if (def && typeof def === 'object' && def.rest) validArgNames.add(def.rest);
  }
  if (config?.required) for (const required of config.required) validArgNames.add(required);
  let positionalIndex = 0;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg.startsWith('--') && arg.indexOf('=') === -1 && !validArgNames.has(arg.slice(2))) {
      warnings.push(`Unknown flag "${arg}" — treated as positional arg. Use "spacemolt ${command}" for usage.`);
    }

    const eqIndex = arg.indexOf('=');
    if (eqIndex > 0) {
      payload[arg.substring(0, eqIndex)] = arg.substring(eqIndex + 1);
    } else {
      const argDef = argDefs[positionalIndex];
      if (argDef) {
        if (typeof argDef === 'string') {
          payload[argDef] = arg;
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

  return { command, payload, warnings };
}

export function validateRequiredArgs(command: string, payload: Record<string, string>): string | null {
  const required = COMMANDS[command]?.required;
  if (!required) return null;
  const normalized = normalizeParsedPayload(command, payload);
  for (const arg of required) {
    if (payload[arg]) continue;
    const canonicalRequired = normalizeParsedPayload(command, { [arg]: '__required__' });
    const canonicalKeys = Object.keys(canonicalRequired);
    if (canonicalKeys.some((key) => normalized[key])) continue;
    return arg;
  }
  return null;
}

export function getArgNames(config: CommandConfig): string[] {
  const names: string[] = [];
  for (const arg of config.args || []) {
    names.push(typeof arg === 'string' ? arg : arg.rest);
  }
  for (const arg of config.required || []) {
    if (!names.includes(arg)) names.push(arg);
  }
  return names;
}

const NUMERIC_FIELDS = new Set([
  'quantity',
  'price_each',
  'new_price',
  'slot_idx',
  'weapon_idx',
  'page',
  'limit',
  'offset',
  'coverage_percent',
  'credits',
  'index',
  'ticks',
  'amount',
  'priority',
  'expiration_hours',
  'per_page',
  'level',
  'max_price',
  'price',
  'page_size',
  'side_id',
]);

export function convertPayloadTypes(payload: Record<string, string>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (NUMERIC_FIELDS.has(key)) {
      const num = parseFloat(value);
      if (!Number.isNaN(num)) {
        result[key] = num;
        continue;
      }
    }
    if (value === 'true') {
      result[key] = true;
      continue;
    }
    if (value === 'false') {
      result[key] = false;
      continue;
    }
    result[key] = value;
  }
  return result;
}
