import type { CommandConfig } from './commands.ts';
import { type GeneratedApiRoute, schemaAllowsType } from './openapi-metadata.ts';

function stripToolPrefix(tool: string): string {
  return tool.replace(/^spacemolt_/, '');
}

function normalizeCommandName(name: string): string {
  return name
    .replace(/^spacemolt_/, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

export function generatedCommandName(route: GeneratedApiRoute): string {
  if (route.cli?.command) return normalizeCommandName(route.cli.command);
  const tool = stripToolPrefix(route.route.tool);
  const action = route.route.action === route.route.tool ? tool : route.route.action;
  return normalizeCommandName(action === tool ? tool : `${tool}_${action}`);
}

function generatedArgs(generated: GeneratedApiRoute): string[] | undefined {
  if (!generated.schema) return undefined;
  const fields = Object.keys(generated.schema);
  const positionalByIndex = new Map<number, string>();
  const duplicatePositionals: string[] = [];

  for (const [field, schema] of Object.entries(generated.schema)) {
    const index = schema.positionalIndex;
    if (index === undefined || !Number.isSafeInteger(index) || index < 0) continue;
    if (positionalByIndex.has(index)) duplicatePositionals.push(field);
    else positionalByIndex.set(index, field);
  }

  for (const field of generated.required || []) {
    if (!generated.schema[field] || [...positionalByIndex.values(), ...duplicatePositionals].includes(field)) continue;
    let firstOpenIndex = 0;
    while (positionalByIndex.has(firstOpenIndex)) firstOpenIndex += 1;
    positionalByIndex.set(firstOpenIndex, field);
  }

  const orderedPositionals = [
    ...[...positionalByIndex.entries()].sort(([a], [b]) => a - b).map(([, field]) => field),
    ...duplicatePositionals,
  ];
  const remaining = fields.filter((field) => !orderedPositionals.includes(field));
  const args = [...orderedPositionals, ...remaining];
  return args.length > 0 ? args : undefined;
}

function generatedUsage(generated: GeneratedApiRoute, args: string[] | undefined): string | undefined {
  if (!generated.schema || !args) return undefined;
  const required = new Set(generated.required || []);
  return args
    .map((field) => {
      const fieldSchema = generated.schema?.[field];
      const hint =
        fieldSchema?.enum?.join('|') ?? (schemaAllowsType(fieldSchema?.type, 'boolean') ? 'true/false' : '...');
      return required.has(field) ? `<${field}>` : `[${field}=${hint}]`;
    })
    .join(' ');
}

export function buildGeneratedCommandConfig(generated: GeneratedApiRoute): CommandConfig {
  const args = generatedArgs(generated);
  return {
    args,
    required: generated.required,
    description: generated.summary,
    usage: generatedUsage(generated, args),
    category: generated.cli?.category || 'Generated API',
    ...(generated.stateSections ? { stateSections: generated.stateSections } : {}),
    route: generated.route,
    schema: generated.schema,
  };
}

// Extension point for intentionally hiding generated routes. Storage routes are
// claimed by curated storage_* group commands — keep the Set even when empty.
const SUPPRESSED_GENERATED_ROUTE_SIGNATURES = new Set<string>([]);

function shouldExposeGeneratedRoute(signature: string, generated: GeneratedApiRoute): boolean {
  if (SUPPRESSED_GENERATED_ROUTE_SIGNATURES.has(signature)) return false;
  if (generated.cli?.hidden) return false;
  if (signature.endsWith('/help')) return false;
  if (generated.route.action === 'help') return false;
  if (generated.route.tool === 'session') return false;
  return true;
}

export function buildDynamicCommands(
  generatedRoutes: Record<string, GeneratedApiRoute>,
  curatedCommandNames: Set<string>,
  curatedRouteSignatures: Set<string> = new Set(),
): Record<string, CommandConfig> {
  const commands: Record<string, CommandConfig> = {};

  for (const [signature, generated] of Object.entries(generatedRoutes)) {
    if (!shouldExposeGeneratedRoute(signature, generated)) continue;
    if (curatedRouteSignatures.has(signature)) continue;
    const command = generatedCommandName(generated);
    if (!command || curatedCommandNames.has(command) || commands[command]) continue;
    commands[command] = buildGeneratedCommandConfig(generated);
  }

  return commands;
}
