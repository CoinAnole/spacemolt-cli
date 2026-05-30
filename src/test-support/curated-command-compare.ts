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

export interface CuratedCommandComparisonDifference {
  kind: 'command-name' | 'config-value' | 'route-value' | 'schema-field' | 'schema-value' | 'missing-generated-route';
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

function pushDifference(
  differences: CuratedCommandComparisonDifference[],
  difference: CuratedCommandComparisonDifference,
): void {
  differences.push(difference);
}

function compareScalarField(
  differences: CuratedCommandComparisonDifference[],
  kind: CuratedCommandComparisonDifference['kind'],
  field: string,
  curated: unknown,
  generated: unknown,
): void {
  if (valuesEqual(curated, generated)) return;
  pushDifference(differences, {
    kind,
    field,
    message: `curated ${formatValue(curated)} vs generated ${formatValue(generated)}`,
    curated,
    generated,
  });
}

function compareRoute(differences: CuratedCommandComparisonDifference[], curated: V2Route, generated: V2Route): void {
  for (const field of COMPARED_ROUTE_FIELDS) {
    compareScalarField(differences, 'route-value', `route.${field}`, curated[field], generated[field]);
  }
}

function compareSchemaField(
  differences: CuratedCommandComparisonDifference[],
  field: string,
  curated: CommandFieldSchema | undefined,
  generated: CommandFieldSchema | undefined,
): void {
  if (!curated && generated) {
    pushDifference(differences, {
      kind: 'schema-field',
      field: `schema.${field}`,
      message: 'field present in generated schema but absent from curated schema',
      curated,
      generated,
    });
    return;
  }
  if (curated && !generated) {
    pushDifference(differences, {
      kind: 'schema-field',
      field: `schema.${field}`,
      message: 'field present in curated schema but absent from generated schema',
      curated,
      generated,
    });
    return;
  }
  if (!curated || !generated) return;

  for (const schemaField of COMPARED_SCHEMA_FIELDS) {
    compareScalarField(
      differences,
      'schema-value',
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
): void {
  const fields = new Set([...Object.keys(curated || {}), ...Object.keys(generated || {})]);
  for (const field of [...fields].sort()) {
    compareSchemaField(differences, field, curated?.[field], generated?.[field]);
  }
}

function summaryFor(differences: CuratedCommandComparisonDifference[]): string {
  if (differences.length === 0) return 'no curated/generated divergences detected';

  const counts = new Map<CuratedCommandComparisonDifference['kind'], number>();
  for (const difference of differences) counts.set(difference.kind, (counts.get(difference.kind) || 0) + 1);
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(', ');
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
    const generated = generatedRoutes[override.apiRoute];
    const generatedCommand = generated ? generatedCommandName(generated) : undefined;
    if (!matchesOnly(command, generatedCommand, options.only)) continue;

    const differences: CuratedCommandComparisonDifference[] = [];
    if (!generated) {
      differences.push({
        kind: 'missing-generated-route',
        field: 'apiRoute',
        message: 'curated override references a route not present in generated OpenAPI metadata',
        curated: override.apiRoute,
      });
      commands.push({
        command,
        apiRoute: override.apiRoute,
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
        kind: 'command-name',
        field: 'commandName',
        message: `curated command "${command}" differs from generated command "${generatedCommand}"`,
        curated: command,
        generated: generatedCommand,
      });
    }

    for (const field of COMPARED_CONFIG_FIELDS) {
      compareScalarField(differences, 'config-value', field, curatedConfig[field], generatedConfig[field]);
    }
    compareRoute(differences, curatedConfig.route, generatedConfig.route);
    compareSchema(differences, curatedConfig.schema, generatedConfig.schema);

    commands.push({
      command,
      apiRoute: override.apiRoute,
      generatedCommand,
      differences,
      summary: summaryFor(differences),
    });
  }

  return { commands: commands.sort((a, b) => a.command.localeCompare(b.command)) };
}

function differencesByKind(differences: CuratedCommandComparisonDifference[]) {
  return {
    'missing-generated-route': differences.filter((d) => d.kind === 'missing-generated-route'),
    'command-name': differences.filter((d) => d.kind === 'command-name'),
    'config-value': differences.filter((d) => d.kind === 'config-value'),
    'route-value': differences.filter((d) => d.kind === 'route-value'),
    'schema-field': differences.filter((d) => d.kind === 'schema-field'),
    'schema-value': differences.filter((d) => d.kind === 'schema-value'),
  };
}

export function formatCuratedCommandComparisonReport(report: CuratedCommandComparisonReport): string {
  const lines: string[] = [];
  lines.push('Curated Command vs Generated OpenAPI Command Divergence Report');
  lines.push(`Generated for ${report.commands.length} curated command(s)`);
  lines.push('');

  for (const comparison of report.commands) {
    lines.push(`## ${comparison.command}`);
    lines.push(`   apiRoute: ${comparison.apiRoute}`);
    if (comparison.generatedCommand) lines.push(`   generated command: ${comparison.generatedCommand}`);
    lines.push(`   summary: ${comparison.summary}`);
    if (comparison.differences.length === 0) {
      lines.push('   (no divergences)');
      lines.push('');
      continue;
    }

    const byKind = differencesByKind(comparison.differences);
    for (const [kind, differences] of Object.entries(byKind)) {
      if (differences.length === 0) continue;
      lines.push(`   ${kind}:`);
      for (const difference of differences) {
        lines.push(`     - ${difference.field}: ${difference.message}`);
      }
    }
    lines.push('');
  }

  lines.push('Legend:');
  lines.push('  command-name            = curated command name differs from the generated OpenAPI command name');
  lines.push('  config-value            = curated user-facing command metadata differs from generated metadata');
  lines.push('  route-value             = curated route/defaults differ from generated route metadata');
  lines.push('  schema-field            = a request schema field exists on only one side');
  lines.push('  schema-value            = request schema metadata differs for a shared field');
  lines.push('  missing-generated-route = curated apiRoute is absent from generated OpenAPI metadata');
  lines.push('');
  lines.push('Or: bun run report:curated-commands [--only get_status,market]');

  return lines.join('\n');
}
