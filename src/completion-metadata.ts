import type { CommandArg, CommandConfig, LocalCommandConfig } from './commands.ts';

export interface CompletionOption {
  long?: string;
  short?: string;
  description: string;
  values?: string[];
  takesValue?: boolean;
}

export type CompletionArgKind = 'enum' | 'boolean' | 'id' | 'field' | 'hint';

export interface CompletionArg {
  name: string;
  description: string;
  values?: string[];
  insert: string;
  kind: CompletionArgKind;
}

export const HINT_VALUES: Record<string, Record<string, string>> = {
  set_colors: {
    primary_color: '<#hex>',
    secondary_color: '<#hex>',
  },
};

export const GLOBAL_COMPLETION_OPTIONS: CompletionOption[] = [
  { long: '--json', short: '-j', description: 'Raw JSON response' },
  { long: '--quiet', short: '-q', description: 'Suppress notifications' },
  { long: '--plain', short: '-p', description: 'No ANSI colors' },
  { long: '--debug', description: 'Print verbose diagnostics' },
  { long: '--raw', description: 'Allow unknown payload fields' },
  { long: '--allow-unknown', description: 'Allow unknown payload fields' },
  { short: '-allow-unknown', description: 'Allow unknown payload fields' },
  { long: '--dry-run', description: 'Preview supported mutations without executing', values: ['true', 'false'] },
  { long: '--preview', description: 'Alias for --dry-run', values: ['true', 'false'] },
  { long: '--no-timestamp', description: 'Hide timestamps where supported' },
  { long: '--compact', description: 'Use compact output where supported' },
  { long: '--structured', description: 'Prefer structured response output' },
  { long: '--watch', short: '-w', description: 'Repeat command every N seconds', takesValue: true },
  {
    long: '--format',
    short: '-fmt',
    description: 'Output format',
    values: ['table', 'json', 'yaml', 'text'],
    takesValue: true,
  },
  { long: '--jq', description: 'Extract a JSON path expression', takesValue: true },
  { long: '--fuzzy', description: 'Auto-resolve simple --jq paths to similar keys' },
  { long: '--keys', description: 'List keys at a JSON dotpath', takesValue: true },
  { long: '--profile', description: 'Use a named profile', takesValue: true },
  { long: '--field', description: 'Extract one response field, or comma-separated fields', takesValue: true },
  { long: '--extract', description: 'Alias for --field', takesValue: true },
  { long: '--fields', short: '-f', description: 'Extract comma-separated response fields', takesValue: true },
  { long: '--help', short: '-h', description: 'Show help' },
  { long: '--version', short: '-v', description: 'Show version' },
];

export const LOCAL_COMPLETION_COMMANDS: Record<string, { description: string }> = {
  doctor: { description: 'Diagnose local CLI configuration/session/API setup.' },
  version: { description: 'Show CLI version and API base URL.' },
};

export const SPECIAL_COMPLETIONS: Record<string, { values: string[]; description: string }> = {
  completion: { values: ['bash', 'zsh', 'fish'], description: 'Generate shell completion' },
  ids: { values: ['poi', 'system', 'item', 'player'], description: 'Cached ID kind' },
  profile: { values: ['list', 'default'], description: 'Profile action' },
};

export function globalOptionWords(): string[] {
  return GLOBAL_COMPLETION_OPTIONS.flatMap((option) => [option.long, option.short].filter(Boolean) as string[]);
}

function commandArgName(arg: CommandArg): string {
  return typeof arg === 'string' ? arg : arg.rest;
}

function isRestArg(arg: CommandArg): boolean {
  return typeof arg === 'object' && Boolean(arg.rest);
}

function isIdLikeArg(name: string): boolean {
  return name === 'id' || name.endsWith('_id') || name.endsWith('_ids') || name.startsWith('target_');
}

function fieldSchema(commandConfig: CommandConfig | LocalCommandConfig, arg: string) {
  if (!('schema' in commandConfig) || !commandConfig.schema) return undefined;
  const canonicalArg = commandConfig.aliases?.[arg] || arg;
  return commandConfig.schema[canonicalArg] || commandConfig.schema[arg];
}

export function completionArgsForCommand(
  command: string,
  commandConfig: CommandConfig | LocalCommandConfig | undefined,
): CompletionArg[] {
  if (!commandConfig) return [];

  return (commandConfig.args || []).map((argDef) => {
    const name = commandArgName(argDef);
    const schema = fieldSchema(commandConfig, name);
    const description = schema?.description || HINT_VALUES[command]?.[name] || name;

    if (schema?.enum?.length) {
      return {
        name,
        description,
        values: schema.enum,
        insert: schema.enum[0] || name,
        kind: 'enum',
      };
    }

    if (schema?.type === 'boolean') {
      return {
        name,
        description,
        values: ['true', 'false'],
        insert: `${name}=`,
        kind: 'boolean',
      };
    }

    if (schema && isIdLikeArg(name)) {
      return {
        name,
        description,
        insert: `${name}=`,
        kind: 'id',
      };
    }

    if (schema) {
      return {
        name,
        description,
        insert: `${name}=`,
        kind: 'field',
      };
    }

    if (!isRestArg(argDef) && isIdLikeArg(name)) {
      return {
        name,
        description,
        insert: `${name}=`,
        kind: 'id',
      };
    }

    if (!isRestArg(argDef)) {
      return {
        name,
        description,
        insert: `${name}=`,
        kind: 'field',
      };
    }

    return {
      name,
      description,
      insert: HINT_VALUES[command]?.[name] || name,
      kind: 'hint',
    };
  });
}
