import { CURATED_COMMAND_DESCRIPTIONS } from './command-descriptions.ts';
import { GENERATED_API_ROUTES } from './generated/api-commands.ts';
import type { GeneratedApiRoute } from './openapi-metadata.ts';

export type CommandArg = string | { rest: string };

export interface V2Route {
  tool: string;
  action: string;
  method?: 'GET' | 'POST';
  /** Static payload fields to inject (e.g., target=faction for faction storage commands) */
  defaults?: Record<string, string>;
}

export interface CommandFieldSchema {
  type?: string;
  enum?: string[];
  description?: string;
  positionalIndex?: number;
}

export interface CommandConfig {
  args?: CommandArg[];
  required?: string[];
  usage?: string;
  description?: string;
  example?: string;
  discoverWith?: string[];
  seeAlso?: string[];
  category?: string;
  aliases?: Record<string, string>;
  route: V2Route;
  schema?: Record<string, CommandFieldSchema>;
  /** Fields whose string values should be split into arrays (e.g., "a,b,c" => ["a","b","c"]) */
  arrayFields?: string[];
  /** Payload fields accepted by the CLI for local rendering/filtering but not sent to the API */
  clientOnlyFields?: string[];
}

export type LocalCommandConfig = Omit<CommandConfig, 'route' | 'schema'>;

export const SINGLE_ENDPOINT_TOOLS = new Set(['agentlogs', 'session', 'spacemolt_catalog']);

export type CommandOverride = {
  apiRoute: string;
  positionals?: CommandArg[];
  usage?: string;
  description?: string;
  example?: string;
  discoverWith?: string[];
  seeAlso?: string[];
  category?: string;
  aliases?: Record<string, string>;
  defaults?: Record<string, string>;
  schemaExtensions?: Record<string, CommandFieldSchema>;
  arrayFields?: string[];
  clientOnlyFields?: string[];
};

export const ALLOWED_COMMAND_OVERRIDE_FIELDS = [
  'apiRoute',
  'positionals',
  'usage',
  'description',
  'example',
  'discoverWith',
  'seeAlso',
  'category',
  'aliases',
  'defaults',
  'schemaExtensions',
  'arrayFields',
  'clientOnlyFields',
] as const;

import { COMMAND_OVERRIDES } from './command-overrides.ts';
export { COMMAND_OVERRIDES };

export const LOCAL_COMMANDS: Record<string, LocalCommandConfig> = {
  help: {
    usage: '[command|group|all|command=<name>|search terms...]',
    description: 'Local command help, usage details, command groups, and command search.',
    example: 'spacemolt help travel',
    category: 'Reference & Help',
    args: [],
    required: [],
    seeAlso: ['commands', 'sync-api', 'get_guide'],
  },
  'server-help': {
    usage: '[topic]',
    description: 'Fetch live gameserver help for an action, category, or keyword.',
    example: 'spacemolt server-help repair',
    category: 'Reference & Help',
    args: [],
    required: [],
    seeAlso: ['help', 'commands', 'sync-api', 'get_commands'],
  },
  ids: {
    usage: '<poi|system|item|player|ship|faction|drone|wreck|facility|listing> [--search text]',
    description: 'Show recently discovered IDs from cached command output.',
    example: 'spacemolt ids item --search fuel',
    category: 'Reference & Help',
    args: ['kind'],
    required: ['kind'],
    seeAlso: ['get_system', 'get_cargo', 'view_market', 'get_nearby'],
  },
  'where-can-i': {
    usage: '<item>',
    description: 'Search cached command output for where an item was last seen.',
    example: 'spacemolt where-can-i ore_iron',
    category: 'Reference & Help',
    args: [{ rest: 'item' }],
    required: ['item'],
    seeAlso: ['ids', 'catalog', 'view_market'],
  },
  profile: {
    usage: '[list|default [name]]',
    description: 'List saved named profile sessions or show/change the default profile.',
    example: 'spacemolt profile default pilot',
    category: 'Session management',
    args: [],
    required: [],
    seeAlso: ['login', 'session'],
  },
  'sync-api': {
    usage: '[no args]',
    description: 'Refresh the cached OpenAPI command metadata.',
    example: 'spacemolt sync-api',
    category: 'Reference & Help',
    seeAlso: ['doctor', 'commands', 'help'],
  },
};

export function routeToPath(route: Pick<V2Route, 'tool' | 'action'>, options?: { includeApiPrefix?: boolean }): string {
  const path =
    route.tool === route.action || SINGLE_ENDPOINT_TOOLS.has(route.tool) ? route.tool : `${route.tool}/${route.action}`;
  return options?.includeApiPrefix ? `/api/v2/${path}` : path;
}

export function routeSignature(route: V2Route): string {
  return `${route.method || 'POST'} ${routeToPath(route, { includeApiPrefix: true })}`;
}

function generatedArgs(generated?: GeneratedApiRoute): string[] | undefined {
  if (!generated?.schema) return undefined;
  const positional = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  return positional.length > 0 ? positional : Object.keys(generated.schema);
}

function commandArgName(arg: CommandArg): string {
  return typeof arg === 'string' ? arg : arg.rest;
}

function generatedArgAliases(
  positionals: CommandArg[] | undefined,
  generated: GeneratedApiRoute,
): Record<string, string> {
  const generatedNames = generatedArgs(generated);
  if (!positionals || !generatedNames) return {};

  const aliases: Record<string, string> = {};
  const schemaFields = new Set(Object.keys(generated.schema || {}));
  for (let i = 0; i < positionals.length; i++) {
    const friendly = commandArgName(positionals[i] as CommandArg);
    const canonical = generatedNames[i];
    if (canonical && friendly !== canonical && !schemaFields.has(friendly)) aliases[friendly] = canonical;
  }
  return aliases;
}

function displayRequiredFields(
  required: string[] | undefined,
  positionals: CommandArg[] | undefined,
  aliases: Record<string, string>,
): string[] | undefined {
  if (!required) return undefined;
  const friendlyByCanonical = new Map(Object.entries(aliases).map(([friendly, canonical]) => [canonical, friendly]));
  const display = required.map((field) => friendlyByCanonical.get(field) ?? field);
  if (!positionals) return display;

  const positionalOrder = new Map(positionals.map((arg, index) => [commandArgName(arg), index]));
  return display.sort((a, b) => {
    const left = positionalOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
    const right = positionalOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
    return left - right;
  });
}

function buildUsageFromSchema(config: CommandOverride, generated: GeneratedApiRoute | undefined): string | undefined {
  if (config.usage) return config.usage;
  if (!generated?.schema) return undefined;
  const req = generated.required;
  if (!req || req.length === 0) return undefined;
  const allFields = generatedArgs(generated) || Object.keys(generated.schema);
  const parts: string[] = [];
  for (const f of allFields) {
    const fieldSchema = generated.schema[f];
    const isRequired = req.includes(f);
    const hint = fieldSchema?.enum?.join('|') ?? (fieldSchema?.type === 'boolean' ? 'true/false' : '...');
    parts.push(isRequired ? `<${f}>` : `[${f}=${hint}]`);
  }
  return parts.join(' ');
}

function getGeneratedRoute(apiRoute: string, generatedRoutes: Record<string, GeneratedApiRoute>): GeneratedApiRoute {
  const generated = generatedRoutes[apiRoute];
  if (!generated) {
    throw new Error(
      `Command override references unknown generated API route "${apiRoute}". Known routes: ${Object.keys(generatedRoutes).join(', ')}`,
    );
  }
  return generated;
}

function mergeCommandConfig(
  command: string,
  config: CommandOverride,
  generatedRoutes: Record<string, GeneratedApiRoute>,
): CommandConfig {
  const generated = getGeneratedRoute(config.apiRoute, generatedRoutes);
  const generatedAliases = generatedArgAliases(config.positionals, generated);
  const aliases = { ...generatedAliases, ...config.aliases };
  const {
    apiRoute: _apiRoute,
    defaults,
    positionals: _positionals,
    aliases: _aliases,
    schemaExtensions,
    ...uxConfig
  } = config;
  return {
    ...uxConfig,
    args: config.positionals ?? generatedArgs(generated),
    required: displayRequiredFields(generated.required, config.positionals, aliases),
    description: config.description ?? CURATED_COMMAND_DESCRIPTIONS[command] ?? generated.summary,
    usage: buildUsageFromSchema(config, generated),
    aliases,
    route: {
      ...generated.route,
      defaults,
    },
    schema: { ...generated.schema, ...schemaExtensions },
  };
}

export function buildCuratedCommands(
  overrides: Record<string, CommandOverride> = COMMAND_OVERRIDES,
  generatedRoutes: Record<string, GeneratedApiRoute> = GENERATED_API_ROUTES as Record<string, GeneratedApiRoute>,
): Record<string, CommandConfig> {
  return Object.fromEntries(
    Object.entries(overrides).map(([command, config]) => [
      command,
      mergeCommandConfig(command, config, generatedRoutes),
    ]),
  );
}

export const COMMANDS: Record<string, CommandConfig> = buildCuratedCommands();

export const V2_TOOL_MAP: Record<string, V2Route> = Object.fromEntries(
  Object.entries(COMMANDS).map(([command, config]) => [command, config.route]),
);
