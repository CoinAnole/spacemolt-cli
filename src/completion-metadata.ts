export interface CompletionOption {
  long?: string;
  short?: string;
  description: string;
  values?: string[];
  takesValue?: boolean;
}

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
  { long: '--profile', description: 'Use a named profile', takesValue: true },
  { long: '--field', description: 'Extract one response field', takesValue: true },
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
