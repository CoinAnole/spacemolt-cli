import { type CommandConfig, routeSignature } from './commands.ts';
import { generatedCommandName } from './dynamic-commands.ts';
import type { GeneratedApiRoute } from './openapi-metadata.ts';

export interface ApiMdArg {
  name: string;
  optional: boolean;
}

export interface ApiMdCommandEntry {
  name: string;
  args: ApiMdArg[];
  description: string;
  category: string;
}

export type ApiMdCommandMap = Record<string, ApiMdCommandEntry>;

export interface CommandHelpReportInput {
  commands: Record<string, CommandConfig>;
  generatedRoutes: Record<string, GeneratedApiRoute>;
  apiMdCommands: ApiMdCommandMap;
  command?: string;
}

export interface CommandHelpDifference {
  field: string;
  status: 'different' | 'missing' | 'match' | 'curated-only';
  curated?: unknown;
  openapi?: unknown;
  apiMd?: unknown;
}

export interface CommandHelpCommandReport {
  command: string;
  routeSignature: string;
  differences: CommandHelpDifference[];
}

export interface CommandHelpReport {
  commands: CommandHelpCommandReport[];
  differenceCount: number;
}

export interface FormatCommandHelpReportOptions {
  includeAll?: boolean;
}

export interface ReportArgs {
  includeAll: boolean;
  json: boolean;
  command?: string;
  failOnDiff: boolean;
}

function stripMutationMarker(value: string): string {
  return value.replace(/\s*\*\*Mutation\.\*\*\s*$/i, '').trim();
}

function parseSignatureArgs(argsText: string): ApiMdArg[] {
  const trimmed = argsText.trim();
  if (!trimmed) return [];
  return trimmed.split(',').map((raw) => {
    const token = raw.trim();
    return { name: token.replace(/\?$/, ''), optional: token.endsWith('?') };
  });
}

export function parseApiMdCommands(markdown: string): ApiMdCommandMap {
  const entries: ApiMdCommandMap = {};
  const lines = markdown.split(/\r?\n/);
  let inClientCommands = false;
  let category = '';

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)\s*$/);
    if (heading) {
      inClientCommands = heading[1] === 'Client Commands';
      if (!inClientCommands && Object.keys(entries).length > 0) break;
      continue;
    }
    if (!inClientCommands) continue;

    const categoryMatch = line.match(/^###\s+(.+)\s*$/);
    if (categoryMatch) {
      category = categoryMatch[1] || '';
      continue;
    }

    const entryMatch = line.match(/^- `([^`(]+)\(([^`]*)\)` -- (.+)$/);
    if (!entryMatch) continue;

    const name = entryMatch[1] || '';
    entries[name] = {
      name,
      args: parseSignatureArgs(entryMatch[2] || ''),
      description: stripMutationMarker(entryMatch[3] || ''),
      category,
    };
  }

  return entries;
}

function normalizeText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().replace(/\s+/g, ' ');
}

function valuesMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft === normalizedRight;
}

function generatedArgNames(generated?: GeneratedApiRoute): string[] {
  if (!generated?.schema) return [];
  const positional = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  const remaining = Object.keys(generated.schema).filter((field) => !positional.includes(field));
  return [...positional, ...remaining];
}

function usageArgNames(usage: string | undefined): string[] {
  if (!usage) return [];
  const names: string[] = [];
  for (const match of usage.matchAll(/[<[{]([a-zA-Z0-9_=-]+)(?:[=>|\]}]|\|)/g)) {
    const name = match[1]?.split('=')[0];
    if (name) names.push(name);
  }
  return names;
}

function openApiCommandName(generated: GeneratedApiRoute | undefined): string | undefined {
  if (!generated) return undefined;
  const summary = generated.summary?.trim();
  if (summary && /^[a-z][a-z0-9_]*$/.test(summary)) return summary;
  return generatedCommandName(generated);
}

function findApiMdCommand(
  command: string,
  generated: GeneratedApiRoute | undefined,
  apiMdCommands: ApiMdCommandMap,
): ApiMdCommandEntry | undefined {
  return apiMdCommands[command] ?? (generated?.summary ? apiMdCommands[generated.summary] : undefined);
}

function pushComparedDifference(
  differences: CommandHelpDifference[],
  field: string,
  curated: unknown,
  openapi: unknown,
  apiMd: unknown,
): void {
  const presentValues = [curated, openapi, apiMd].filter((value) => value !== undefined);
  const allMatch = presentValues.length <= 1 || presentValues.every((value) => valuesMatch(value, presentValues[0]));
  differences.push({ field, status: allMatch ? 'match' : 'different', curated, openapi, apiMd });
}

function pushCuratedOnly(differences: CommandHelpDifference[], field: string, value: unknown): void {
  const hasValue = Array.isArray(value)
    ? value.length > 0
    : value && typeof value === 'object'
      ? Object.keys(value).length > 0
      : value !== undefined && value !== '';
  if (hasValue) differences.push({ field, status: 'curated-only', curated: value });
}

function countActionableDifferences(differences: CommandHelpDifference[]): number {
  return differences.filter((difference) => difference.status !== 'curated-only' && difference.status !== 'match')
    .length;
}

export function buildCommandHelpReport(input: CommandHelpReportInput): CommandHelpReport {
  const commandEntries = Object.entries(input.commands)
    .filter(([command]) => !input.command || command === input.command)
    .sort(([a], [b]) => a.localeCompare(b));
  const commands: CommandHelpCommandReport[] = [];

  for (const [command, config] of commandEntries) {
    const signature = routeSignature(config.route);
    const generated = input.generatedRoutes[signature];
    const apiMd = findApiMdCommand(command, generated, input.apiMdCommands);
    const differences: CommandHelpDifference[] = [];

    if (!generated) {
      differences.push({ field: 'openapi route', status: 'missing', curated: signature });
    }
    if (!apiMd) {
      differences.push({ field: 'api.md command', status: 'missing', curated: command });
    }

    if (generated || apiMd) {
      pushComparedDifference(differences, 'command name', command, openApiCommandName(generated), apiMd?.name);
      pushComparedDifference(differences, 'description', config.description, generated?.summary, apiMd?.description);
      pushComparedDifference(
        differences,
        'usage',
        usageArgNames(config.usage),
        generatedArgNames(generated),
        apiMd?.args.map((arg) => arg.name),
      );
    }

    if (config.schema && generated?.schema) {
      for (const field of Object.keys(config.schema).sort()) {
        const curatedDescription = config.schema[field]?.description;
        const openApiDescription = generated.schema[field]?.description;
        pushComparedDifference(
          differences,
          `field.${field}.description`,
          curatedDescription,
          openApiDescription,
          undefined,
        );
      }
    }

    pushCuratedOnly(differences, 'curated-only example', config.example);
    pushCuratedOnly(differences, 'curated-only aliases', config.aliases);
    pushCuratedOnly(differences, 'curated-only discoverWith', config.discoverWith);
    pushCuratedOnly(differences, 'curated-only seeAlso', config.seeAlso);

    commands.push({ command, routeSignature: signature, differences });
  }

  return {
    commands,
    differenceCount: commands.reduce((total, entry) => total + countActionableDifferences(entry.differences), 0),
  };
}

function formatValue(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (Array.isArray(value)) return value.join(', ');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, entryValue]) => `${key} -> ${String(entryValue)}`)
      .join(', ');
  }
  return String(value);
}

function shouldShowDifference(difference: CommandHelpDifference, includeAll: boolean): boolean {
  return includeAll || (difference.status !== 'match' && difference.status !== 'curated-only');
}

export function formatCommandHelpReport(
  report: CommandHelpReport,
  options: FormatCommandHelpReportOptions = {},
): string {
  const includeAll = Boolean(options.includeAll);
  const lines = ['Command Help Comparison', `Actionable differences: ${report.differenceCount}`];

  for (const commandReport of report.commands) {
    const visibleDifferences = commandReport.differences.filter((difference) =>
      shouldShowDifference(difference, includeAll),
    );
    if (!includeAll && visibleDifferences.length === 0) continue;

    lines.push('', `${commandReport.command} (${commandReport.routeSignature})`);
    if (visibleDifferences.length === 0) {
      lines.push('  No differences.');
      continue;
    }
    for (const difference of visibleDifferences) {
      lines.push(`  - ${difference.field} [${difference.status}]`);
      if (difference.curated !== undefined) lines.push(`    curated: ${formatValue(difference.curated)}`);
      if (difference.openapi !== undefined) lines.push(`    openapi: ${formatValue(difference.openapi)}`);
      if (difference.apiMd !== undefined) lines.push(`    api.md: ${formatValue(difference.apiMd)}`);
    }
  }

  if (!includeAll && lines.length === 2) lines.push('', 'No command help differences found.');
  return lines.join('\n');
}

export function parseReportArgs(args: string[]): ReportArgs {
  const parsed: ReportArgs = {
    includeAll: false,
    json: false,
    failOnDiff: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--all') {
      parsed.includeAll = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--fail-on-diff') {
      parsed.failOnDiff = true;
      continue;
    }
    if (arg === '--command') {
      const command = args[i + 1];
      if (command) {
        parsed.command = command;
        i += 1;
      }
      continue;
    }
    if (arg?.startsWith('--command=')) {
      parsed.command = arg.slice('--command='.length) || undefined;
    }
  }

  return parsed;
}
