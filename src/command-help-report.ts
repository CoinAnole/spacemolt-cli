interface OpenApiOperation {
  operationId?: unknown;
  summary?: unknown;
  description?: unknown;
  'x-cli-command'?: unknown;
}

interface OpenApiDocument {
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

export interface OpenApiHelpEntry {
  command: string;
  routeSignature: string;
  aliases: string[];
  operationId?: string;
  summary?: string;
  description?: string;
}

export interface CommandHelpReportInput {
  v1Entries: OpenApiHelpEntry[];
  v2Entries: OpenApiHelpEntry[];
  command?: string;
}

export interface CommandHelpDifference {
  field: 'summary' | 'description' | 'openapi-v1 operation';
  status: 'different' | 'missing' | 'match';
  signal: 'review' | 'intentional' | 'info' | 'match';
  openapiV1?: unknown;
  openapiV2?: unknown;
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

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete']);

function normalizeText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value).trim().replace(/[—–]/g, '-').replace(/→/g, '->').replace(/\s+/g, ' ');
}

function normalizedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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

function commandNameFromPath(pathName: string): string | undefined {
  const segments = pathName
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
  if (segments.length === 0) return undefined;
  return segments[segments.length - 1];
}

function isCommandToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z][a-z0-9_]*$/.test(value.trim());
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

export function parseOpenApiHelpEntries(document: OpenApiDocument): OpenApiHelpEntry[] {
  const entries: OpenApiHelpEntry[] = [];

  for (const [pathName, pathItem] of Object.entries(document.paths || {})) {
    for (const [method, operation] of Object.entries(pathItem || {})) {
      if (!HTTP_METHODS.has(method.toLowerCase()) || !operation || typeof operation !== 'object') continue;

      const pathCommand = commandNameFromPath(pathName);
      const cliCommand = normalizedString(operation['x-cli-command']);
      const summary = normalizedString(operation.summary);
      const summaryCommand = isCommandToken(summary) ? summary.trim() : undefined;
      const operationId = normalizedString(operation.operationId);
      const command = cliCommand ?? summaryCommand ?? pathCommand ?? operationId;
      if (!command) continue;

      entries.push({
        aliases: uniqueStrings([command, cliCommand, summaryCommand, pathCommand, operationId]),
        command,
        description: normalizedString(operation.description),
        operationId,
        routeSignature: `${method.toUpperCase()} ${pathName}`,
        summary,
      });
    }
  }

  return entries.sort((a, b) => a.routeSignature.localeCompare(b.routeSignature));
}

function buildAliasIndex(entries: OpenApiHelpEntry[]): Map<string, OpenApiHelpEntry> {
  const index = new Map<string, OpenApiHelpEntry>();
  for (const entry of entries) {
    for (const alias of entry.aliases) {
      if (!index.has(alias)) index.set(alias, entry);
    }
  }
  return index;
}

function findMatchingV1Entry(
  v2Entry: OpenApiHelpEntry,
  v1Index: Map<string, OpenApiHelpEntry>,
): OpenApiHelpEntry | undefined {
  for (const alias of v2Entry.aliases) {
    const entry = v1Index.get(alias);
    if (entry) return entry;
  }
  return undefined;
}

function compareHelpField(
  field: 'summary' | 'description',
  openapiV1: string | undefined,
  openapiV2: string | undefined,
): CommandHelpDifference {
  if (valuesMatch(openapiV1, openapiV2)) {
    return { field, status: 'match', signal: 'match', openapiV1, openapiV2 };
  }

  const status = openapiV1 === undefined || openapiV2 === undefined ? 'missing' : 'different';
  const v1IsUseful = field === 'summary' ? isUsefulHelpText(openapiV1) : Boolean(normalizeText(openapiV1));
  const v2NeedsHelp = openapiV2 === undefined || (field === 'summary' && isWeakCommandText(openapiV2));

  return {
    field,
    status,
    signal: v1IsUseful && (v2NeedsHelp || !valuesMatch(openapiV1, openapiV2)) ? 'review' : 'info',
    openapiV1,
    openapiV2,
  };
}

function countActionableDifferences(differences: CommandHelpDifference[]): number {
  return differences.filter((difference) => difference.signal === 'review').length;
}

export function buildCommandHelpReport(input: CommandHelpReportInput): CommandHelpReport {
  const v1Index = buildAliasIndex(input.v1Entries);
  const commands: CommandHelpCommandReport[] = [];

  for (const v2Entry of input.v2Entries) {
    if (input.command && v2Entry.command !== input.command && !v2Entry.aliases.includes(input.command)) continue;

    const v1Entry = findMatchingV1Entry(v2Entry, v1Index);
    const differences: CommandHelpDifference[] = [];

    if (!v1Entry) {
      differences.push({
        field: 'openapi-v1 operation',
        status: 'missing',
        signal: 'info',
        openapiV2: v2Entry.command,
      });
    }

    differences.push(compareHelpField('summary', v1Entry?.summary, v2Entry.summary));
    differences.push(compareHelpField('description', v1Entry?.description, v2Entry.description));
    commands.push({ command: v2Entry.command, routeSignature: v2Entry.routeSignature, differences });
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
  const lines = ['OpenAPI Help Comparison', `Review differences: ${report.differenceCount}`];

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
      if (difference.openapiV1 !== undefined) lines.push(`    openapi-v1: ${formatValue(difference.openapiV1)}`);
      if (difference.openapiV2 !== undefined) lines.push(`    openapi-v2: ${formatValue(difference.openapiV2)}`);
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
