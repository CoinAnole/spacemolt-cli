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
  signal: 'review' | 'intentional' | 'info' | 'match';
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
  includeIntentional?: boolean;
}

export interface ReportArgs {
  includeAll: boolean;
  includeIntentional: boolean;
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
  return String(value).trim().replace(/[—–]/g, '-').replace(/→/g, '->').replace(/\s+/g, ' ');
}

function valuesMatch(left: unknown, right: unknown): boolean {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);
  return normalizedLeft === normalizedRight;
}

function isWeakCommandText(value: unknown): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && /^[a-z][a-z0-9_]*$/.test(normalized));
}

function isUsefulHelpText(value: unknown): boolean {
  const normalized = normalizeText(value);
  return Boolean(normalized && !isWeakCommandText(normalized));
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
  signalForDifference: CommandHelpDifference['signal'] = 'review',
): void {
  const presentValues = [curated, openapi, apiMd].filter((value) => value !== undefined);
  const allMatch = presentValues.length <= 1 || presentValues.every((value) => valuesMatch(value, presentValues[0]));
  differences.push({
    field,
    status: allMatch ? 'match' : 'different',
    signal: allMatch ? 'match' : signalForDifference,
    curated,
    openapi,
    apiMd,
  });
}

function pushCuratedOnly(differences: CommandHelpDifference[], field: string, value: unknown): void {
  const hasValue = Array.isArray(value)
    ? value.length > 0
    : value && typeof value === 'object'
      ? Object.keys(value).length > 0
      : value !== undefined && value !== '';
  if (hasValue) differences.push({ field, status: 'curated-only', signal: 'info', curated: value });
}

function countActionableDifferences(differences: CommandHelpDifference[]): number {
  return differences.filter((difference) => difference.signal === 'review').length;
}

function descriptionSignal(
  curated: string | undefined,
  openapi: string | undefined,
  apiMd: string | undefined,
): CommandHelpDifference['signal'] {
  if ((isWeakCommandText(curated) || valuesMatch(curated, openapi)) && isUsefulHelpText(apiMd)) return 'review';
  return 'intentional';
}

function missingApiMdSignal(
  command: string,
  generated: GeneratedApiRoute | undefined,
): CommandHelpDifference['signal'] {
  if (generated && openApiCommandName(generated) !== command) return 'intentional';
  return 'review';
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
      differences.push({ field: 'openapi route', status: 'missing', signal: 'review', curated: signature });
    }
    if (!apiMd) {
      differences.push({
        field: 'api.md command',
        status: 'missing',
        signal: missingApiMdSignal(command, generated),
        curated: command,
      });
    }

    if (generated || apiMd) {
      pushComparedDifference(
        differences,
        'command name',
        command,
        openApiCommandName(generated),
        apiMd?.name,
        'intentional',
      );
      pushComparedDifference(
        differences,
        'description',
        config.description,
        generated?.summary,
        apiMd?.description,
        descriptionSignal(config.description, generated?.summary, apiMd?.description),
      );
      pushComparedDifference(
        differences,
        'usage',
        usageArgNames(config.usage),
        generatedArgNames(generated),
        apiMd?.args.map((arg) => arg.name),
        'intentional',
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
  return includeAll || difference.signal === 'review';
}

export function formatCommandHelpReport(
  report: CommandHelpReport,
  options: FormatCommandHelpReportOptions = {},
): string {
  const includeAll = Boolean(options.includeAll);
  const includeIntentional = Boolean(options.includeIntentional);
  const lines = ['Command Help Comparison', `Review differences: ${report.differenceCount}`];

  for (const commandReport of report.commands) {
    const visibleDifferences = commandReport.differences.filter(
      (difference) =>
        shouldShowDifference(difference, includeAll) || (includeIntentional && difference.signal === 'intentional'),
    );
    if (!includeAll && visibleDifferences.length === 0) continue;

    lines.push('', `${commandReport.command} (${commandReport.routeSignature})`);
    if (visibleDifferences.length === 0) {
      lines.push('  No differences.');
      continue;
    }
    for (const difference of visibleDifferences) {
      lines.push(`  - ${difference.field} [${difference.status}, ${difference.signal}]`);
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
    includeIntentional: false,
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
    if (arg === '--include-intentional') {
      parsed.includeIntentional = true;
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
