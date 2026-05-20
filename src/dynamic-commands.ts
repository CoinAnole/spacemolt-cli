import type { CommandConfig } from './commands.ts';
import type { GeneratedApiRoute } from './openapi-metadata.ts';

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
  const positional = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  const remaining = Object.keys(generated.schema).filter((field) => !positional.includes(field));
  const args = [...positional, ...remaining];
  return args.length > 0 ? args : undefined;
}

function generatedUsage(generated: GeneratedApiRoute, args: string[] | undefined): string | undefined {
  if (!generated.schema || !args) return undefined;
  const required = new Set(generated.required || []);
  return args
    .map((field) => {
      const fieldSchema = generated.schema?.[field];
      const hint = fieldSchema?.enum?.join('|') ?? (fieldSchema?.type === 'boolean' ? 'true/false' : '...');
      return required.has(field) ? `<${field}>` : `[${field}=${hint}]`;
    })
    .join(' ');
}

function shouldExposeGeneratedRoute(signature: string, generated: GeneratedApiRoute): boolean {
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
    const args = generatedArgs(generated);
    commands[command] = {
      args,
      required: generated.required,
      description: generated.summary,
      usage: generatedUsage(generated, args),
      category: generated.cli?.category || 'Generated API',
      route: generated.route,
      schema: generated.schema,
    };
  }

  return commands;
}
