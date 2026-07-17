import {
  buildCuratedCommands,
  COMMAND_OVERRIDES,
  type CommandConfig,
  type CommandFieldSchema,
  type CommandOverride,
  type V2Route,
} from '../commands.ts';
import { buildGeneratedCommandConfig, generatedCommandName } from '../dynamic-commands.ts';
import { GENERATED_API_ROUTES } from '../generated/api-commands.ts';
import type { GeneratedApiRoute } from '../openapi-metadata.ts';

export type CuratedCommandComparisonDifferenceKind =
  | 'missing-generated-route'
  | 'route-contract'
  | 'schema-contract'
  | 'schema-enum'
  | 'schema-required'
  | 'schema-positional'
  | 'client-only'
  | 'curated-cosmetic';

export interface CuratedCommandComparisonDifference {
  kind: CuratedCommandComparisonDifferenceKind;
  field: string;
  message: string;
  curated?: unknown;
  generated?: unknown;
}

export interface CuratedCommandComparison {
  command: string;
  apiRoute: string;
  generatedCommand?: string;
  differences: CuratedCommandComparisonDifference[];
  summary: string;
}

export interface CuratedCommandComparisonReport {
  commands: CuratedCommandComparison[];
  summary: CuratedCommandComparisonSummary;
}

export interface CuratedCommandComparisonSummary {
  totalCommands: number;
  commandsWithDifferences: number;
  actionableCommands: number;
  cosmeticOnlyCommands: number;
  clientOnlyFields: number;
  differencesByKind: Record<CuratedCommandComparisonDifferenceKind, number>;
}

export interface CompareCuratedCommandsOptions {
  overrides?: Record<string, CommandOverride>;
  generatedRoutes?: Record<string, GeneratedApiRoute>;
  only?: string[];
}

const COMPARED_CONFIG_FIELDS = ['args', 'required', 'usage', 'description', 'category'] as const;
const COMPARED_SCHEMA_FIELDS = ['type', 'enum', 'description', 'positionalIndex'] as const;
const COMPARED_ROUTE_FIELDS = ['tool', 'action', 'method', 'defaults'] as const;

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return stableStringify(left) === stableStringify(right);
}

function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  const formatted = stableStringify(value);
  return formatted.length > 100 ? `${formatted.slice(0, 97)}...` : formatted;
}

const ACTIONABLE_KINDS = new Set<CuratedCommandComparisonDifferenceKind>([
  'missing-generated-route',
  'route-contract',
  'schema-contract',
  'schema-enum',
  'schema-required',
  'schema-positional',
]);

function isActionableDifference(difference: CuratedCommandComparisonDifference): boolean {
  return ACTIONABLE_KINDS.has(difference.kind);
}

function schemaValueKind(schemaField: string): CuratedCommandComparisonDifferenceKind {
  if (schemaField === 'enum') return 'schema-enum';
  if (schemaField === 'positionalIndex') return 'schema-positional';
  if (schemaField === 'description') return 'curated-cosmetic';
  return 'schema-contract';
}

function compareScalarField(
  differences: CuratedCommandComparisonDifference[],
  kind: CuratedCommandComparisonDifferenceKind,
  field: string,
  curated: unknown,
  generated: unknown,
): void {
  if (valuesEqual(curated, generated)) return;
  differences.push({
    kind,
    field,
    message: `curated ${formatValue(curated)} vs generated ${formatValue(generated)}`,
    curated,
    generated,
  });
}

function summarizeReport(commands: CuratedCommandComparison[]): CuratedCommandComparisonSummary {
  const differencesByKind = Object.fromEntries(
    [
      'missing-generated-route',
      'route-contract',
      'schema-contract',
      'schema-enum',
      'schema-required',
      'schema-positional',
      'client-only',
      'curated-cosmetic',
    ].map((kind) => [kind, 0]),
  ) as Record<CuratedCommandComparisonDifferenceKind, number>;

  let actionableCommands = 0;
  let cosmeticOnlyCommands = 0;
  let clientOnlyFields = 0;
  let commandsWithDifferences = 0;

  for (const command of commands) {
    if (command.differences.length > 0) commandsWithDifferences++;
    const hasActionable = command.differences.some(isActionableDifference);
    const hasOnlyCosmetic =
      command.differences.length > 0 && command.differences.every((d) => d.kind === 'curated-cosmetic');
    if (hasActionable) actionableCommands++;
    if (hasOnlyCosmetic) cosmeticOnlyCommands++;

    for (const difference of command.differences) {
      differencesByKind[difference.kind] += 1;
      if (difference.kind === 'client-only') clientOnlyFields++;
    }
  }

  return {
    totalCommands: commands.length,
    commandsWithDifferences,
    actionableCommands,
    cosmeticOnlyCommands,
    clientOnlyFields,
    differencesByKind,
  };
}

function compareRoute(differences: CuratedCommandComparisonDifference[], curated: V2Route, generated: V2Route): void {
  for (const field of COMPARED_ROUTE_FIELDS) {
    compareScalarField(differences, 'route-contract', `route.${field}`, curated[field], generated[field]);
  }
}

function compareSchemaField(
  differences: CuratedCommandComparisonDifference[],
  field: string,
  curated: CommandFieldSchema | undefined,
  generated: CommandFieldSchema | undefined,
  clientOnlyFields: Set<string>,
  positionallyEquivalentFields: Set<string>,
): void {
  if (!curated && generated) {
    differences.push({
      kind: 'schema-contract',
      field: `schema.${field}`,
      message: 'field present in generated schema but absent from curated schema',
      curated,
      generated,
    });
    return;
  }
  if (curated && !generated) {
    differences.push({
      kind: clientOnlyFields.has(field) ? 'client-only' : 'schema-contract',
      field: `schema.${field}`,
      message: clientOnlyFields.has(field)
        ? 'field is accepted by the CLI locally and is not sent to the API'
        : 'field present in curated schema but absent from generated schema',
      curated,
      generated,
    });
    return;
  }
  if (!curated || !generated) return;

  for (const schemaField of COMPARED_SCHEMA_FIELDS) {
    if (schemaField === 'positionalIndex' && positionallyEquivalentFields.has(field)) continue;
    compareScalarField(
      differences,
      schemaValueKind(schemaField),
      `schema.${field}.${schemaField}`,
      curated[schemaField],
      generated[schemaField],
    );
  }
}

function compareSchema(
  differences: CuratedCommandComparisonDifference[],
  curated: CommandConfig['schema'],
  generated: CommandConfig['schema'],
  clientOnlyFields: Set<string>,
  positionallyEquivalentFields: Set<string>,
): void {
  const fields = new Set([...Object.keys(curated || {}), ...Object.keys(generated || {})]);
  for (const field of [...fields].sort()) {
    compareSchemaField(
      differences,
      field,
      curated?.[field],
      generated?.[field],
      clientOnlyFields,
      positionallyEquivalentFields,
    );
  }
}

function summaryFor(differences: CuratedCommandComparisonDifference[]): string {
  if (differences.length === 0) return 'no curated/generated divergences detected';

  const counts = new Map<CuratedCommandComparisonDifferenceKind, number>();
  for (const difference of differences) counts.set(difference.kind, (counts.get(difference.kind) || 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(', ');
}

function canonicalRequiredFields(
  required: string[] | undefined,
  aliases: Record<string, string> | undefined,
): string[] {
  return [...new Set((required || []).map((field) => aliases?.[field] ?? field))].sort();
}

function compareRequiredField(
  differences: CuratedCommandComparisonDifference[],
  curatedConfig: CommandConfig,
  generatedConfig: CommandConfig,
): void {
  const curatedCanonical = canonicalRequiredFields(curatedConfig.required, curatedConfig.aliases);
  const generatedCanonical = canonicalRequiredFields(generatedConfig.required, undefined);
  const canonicalMatches = valuesEqual(curatedCanonical, generatedCanonical);
  if (valuesEqual(curatedConfig.required, generatedConfig.required) && canonicalMatches) return;

  differences.push({
    kind: canonicalMatches ? 'curated-cosmetic' : 'schema-required',
    field: 'required',
    message: canonicalMatches
      ? `curated display required ${formatValue(curatedConfig.required)} maps to generated ${formatValue(generatedConfig.required)}`
      : `curated canonical required ${formatValue(curatedCanonical)} vs generated ${formatValue(generatedCanonical)}`,
    curated: curatedConfig.required,
    generated: generatedConfig.required,
  });
}

function commandArgName(arg: NonNullable<CommandConfig['args']>[number]): string {
  return typeof arg === 'string' ? arg : arg.rest;
}

function generatedPositionalFields(config: CommandConfig): string[] {
  return Object.entries(config.schema || {})
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
}

function effectiveCuratedPositionalFields(config: CommandConfig, generatedFields: string[]): string[] {
  const generatedFieldSet = new Set(generatedFields);
  const fields: string[] = [];
  for (const arg of config.args || []) {
    const field = commandArgName(arg);
    const canonicalField = config.aliases?.[field] ?? field;
    if (typeof arg !== 'string' && !generatedFieldSet.has(canonicalField)) continue;
    fields.push(canonicalField);
  }
  return fields;
}

function compareEffectivePositionalOrder(
  differences: CuratedCommandComparisonDifference[],
  curatedConfig: CommandConfig,
  generatedConfig: CommandConfig,
): Set<string> {
  const generatedFields = generatedPositionalFields(generatedConfig);
  if (generatedFields.length === 0) return new Set();

  const curatedFields = effectiveCuratedPositionalFields(curatedConfig, generatedFields);
  const comparableCuratedFields = curatedFields.slice(0, generatedFields.length);
  const equivalent = valuesEqual(comparableCuratedFields, generatedFields);
  if (!equivalent) {
    differences.push({
      kind: 'schema-positional',
      field: 'args',
      message: `curated effective positionals ${formatValue(comparableCuratedFields)} vs generated ${formatValue(generatedFields)}`,
      curated: comparableCuratedFields,
      generated: generatedFields,
    });
    return new Set();
  }

  return new Set(
    generatedFields.filter(
      (field) => curatedConfig.schema?.[field]?.positionalIndex === generatedConfig.schema?.[field]?.positionalIndex,
    ),
  );
}

function matchesOnly(command: string, generatedCommand: string | undefined, only: string[] | undefined): boolean {
  if (!only || only.length === 0) return true;
  const haystacks = [command.toLowerCase(), generatedCommand?.toLowerCase()].filter(Boolean) as string[];
  return only.some((needle) => haystacks.some((haystack) => haystack.includes(needle.toLowerCase())));
}

export function compareCuratedCommandsToGenerated(
  options: CompareCuratedCommandsOptions = {},
): CuratedCommandComparisonReport {
  const overrides = options.overrides ?? COMMAND_OVERRIDES;
  const generatedRoutes = options.generatedRoutes ?? (GENERATED_API_ROUTES as Record<string, GeneratedApiRoute>);
  const commands: CuratedCommandComparison[] = [];

  for (const [command, override] of Object.entries(overrides)) {
    const apiRouteKey = override.apiRoute;
    const generated = apiRouteKey ? generatedRoutes[apiRouteKey] : undefined;
    const generatedCommand = generated ? generatedCommandName(generated) : undefined;
    if (!matchesOnly(command, generatedCommand, options.only)) continue;

    const differences: CuratedCommandComparisonDifference[] = [];
    if (override.route && !override.apiRoute) {
      // Standalone public endpoint (intentional; not in OpenAPI)
      commands.push({
        command,
        apiRoute: `GET ${override.route.rootPath || '(root path)'}`,
        generatedCommand,
        differences: [],
        summary: 'standalone public endpoint (not in OpenAPI)',
      });
      continue;
    }
    if (!generated) {
      differences.push({
        kind: 'missing-generated-route',
        field: 'apiRoute',
        message: 'curated override references a route not present in generated OpenAPI metadata',
        curated: override.apiRoute,
      });
      commands.push({
        command,
        apiRoute: override.apiRoute ?? '(standalone)',
        generatedCommand,
        differences,
        summary: summaryFor(differences),
      });
      continue;
    }

    const curatedConfig = buildCuratedCommands({ [command]: override }, generatedRoutes)[command];
    const generatedConfig = buildGeneratedCommandConfig(generated);
    if (!curatedConfig) continue;

    if (command !== generatedCommand) {
      differences.push({
        kind: 'curated-cosmetic',
        field: 'commandName',
        message: `curated command "${command}" differs from generated command "${generatedCommand}"`,
        curated: command,
        generated: generatedCommand,
      });
    }

    for (const field of COMPARED_CONFIG_FIELDS) {
      if (field === 'required') {
        compareRequiredField(differences, curatedConfig, generatedConfig);
        continue;
      }
      compareScalarField(differences, 'curated-cosmetic', field, curatedConfig[field], generatedConfig[field]);
    }
    compareRoute(differences, curatedConfig.route, generatedConfig.route);
    const positionallyEquivalentFields = compareEffectivePositionalOrder(differences, curatedConfig, generatedConfig);
    compareSchema(
      differences,
      curatedConfig.schema,
      generatedConfig.schema,
      new Set(override.clientOnlyFields || []),
      positionallyEquivalentFields,
    );

    commands.push({
      command,
      apiRoute: override.apiRoute ?? '(standalone)',
      generatedCommand,
      differences,
      summary: summaryFor(differences),
    });
  }

  const sortedCommands = commands.sort((a, b) => a.command.localeCompare(b.command));
  return { commands: sortedCommands, summary: summarizeReport(sortedCommands) };
}

function differencesByKind(differences: CuratedCommandComparisonDifference[]) {
  const grouped = new Map<CuratedCommandComparisonDifferenceKind, CuratedCommandComparisonDifference[]>();
  for (const difference of differences) {
    const current = grouped.get(difference.kind) || [];
    current.push(difference);
    grouped.set(difference.kind, current);
  }
  return grouped;
}

export function formatCuratedCommandComparisonReport(
  report: CuratedCommandComparisonReport,
  opts: { includeCosmetic?: boolean } = {},
): string {
  const lines: string[] = [];
  lines.push('Curated Command vs Generated OpenAPI Command Divergence Report');
  lines.push(`Generated for ${report.summary.totalCommands} curated command(s)`);
  lines.push(`Actionable commands: ${report.summary.actionableCommands}`);
  lines.push(`Cosmetic-only commands: ${report.summary.cosmeticOnlyCommands}`);
  lines.push(`Client-only fields: ${report.summary.clientOnlyFields}`);
  lines.push('');

  const visibleCommands = report.commands.filter((comparison) => {
    if (comparison.differences.some((difference) => difference.kind !== 'curated-cosmetic')) return true;
    return Boolean(opts.includeCosmetic && comparison.differences.length > 0);
  });

  if (visibleCommands.length === 0) {
    lines.push('No actionable curated/generated divergences detected.');
    lines.push('');
  }

  for (const comparison of visibleCommands) {
    const visibleDifferences = opts.includeCosmetic
      ? comparison.differences
      : comparison.differences.filter((difference) => difference.kind !== 'curated-cosmetic');

    lines.push(`## ${comparison.command}`);
    lines.push(`   apiRoute: ${comparison.apiRoute}`);
    if (comparison.generatedCommand) lines.push(`   generated command: ${comparison.generatedCommand}`);
    lines.push(`   summary: ${summaryFor(visibleDifferences)}`);

    const byKind = differencesByKind(visibleDifferences);
    for (const [kind, differences] of byKind.entries()) {
      if (differences.length === 0) continue;
      lines.push(`   ${kind}:`);
      for (const difference of differences) {
        lines.push(`     - ${difference.field}: ${difference.message}`);
      }
    }
    lines.push('');
  }

  lines.push('Legend:');
  lines.push('  missing-generated-route = curated apiRoute is absent from generated OpenAPI metadata');
  lines.push('  route-contract          = route method/tool/action/defaults differ');
  lines.push('  schema-contract         = request schema field or type differs');
  lines.push('  schema-enum             = request schema enum differs');
  lines.push('  schema-required         = required field list differs');
  lines.push('  schema-positional       = positional index differs');
  lines.push('  client-only             = field is intentionally handled by the CLI, not the server');
  lines.push('  curated-cosmetic        = friendly command metadata differs from generated metadata');
  lines.push('');
  lines.push('Or: bun run report:curated-commands [--only get_status,market] [--include-cosmetic]');

  return lines.join('\n');
}
