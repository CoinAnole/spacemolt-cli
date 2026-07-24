import { CURATED_COMMAND_DESCRIPTIONS } from './command-descriptions.ts';
import { GENERATED_API_ROUTES } from './generated/api-commands.ts';
import { type GeneratedApiRoute, type OpenApiFieldType, schemaAllowsType } from './openapi-metadata.ts';
import { trimTrailingSlash } from './response.ts';

export type CommandArg = string | { rest: string };

export interface V2Route {
  tool: string;
  action: string;
  method?: 'GET' | 'POST';
  /** Static payload fields to inject (e.g., target=faction for faction storage commands) */
  defaults?: Record<string, string>;

  /**
   * For endpoints served outside the normal /api/v2 structure (e.g. public root endpoints).
   * When set, the full URL is constructed as <game-root>/<rootPath> (game-root derived from apiBase by stripping /api/v2).
   */
  rootPath?: string;

  /**
   * Payload field names substituted into `rootPath` placeholders like `{name}`.
   * Values are encodeURIComponent'd and removed from the residual query/body payload.
   */
  pathParams?: string[];

  /** Do not create or send any session (X-Session-Id). For truly public unauthenticated endpoints. */
  publicUnauthenticated?: boolean;

  /** The raw response body from the server is the data (e.g. { system: "..." }) rather than a wrapped V2Response.
   * Client will place it under structuredContent for uniform handling. */
  bareResponse?: boolean;
}

export interface CommandFieldSchema {
  type?: OpenApiFieldType;
  enum?: string[];
  description?: string;
  positionalIndex?: number;
  minimum?: number;
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
  stateSections?: string[];
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
  /** Standard path from the server OpenAPI (POST /api/v2/...). Mutually exclusive with `route`. */
  apiRoute?: string;
  /**
   * Literal route for standalone/public endpoints not documented in the v2 OpenAPI
   * (e.g. GET /wheres-mobile-base). Use together with V2Route extensions (rootPath, publicUnauthenticated, bareResponse).
   */
  route?: V2Route;
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
  /** Override required fields when an endpoint has conditional requirements not expressible in its generated schema. */
  required?: string[];
};

export const ALLOWED_COMMAND_OVERRIDE_FIELDS = [
  'apiRoute',
  'route', // for standalone public endpoints not in the OpenAPI
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
  'required', // standalone/public overrides or conditional requirements missing from generated OpenAPI metadata
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
    usage: '<poi|system|item|player|ship|faction|drone|wreck|facility|listing|package> [--search text]',
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
  config: {
    usage: 'user-agent [value|--reset] | fuzzy-ids [on|off|--reset]',
    description:
      'Show or change local CLI preferences such as the API User-Agent header and fuzzy ID soft match.',
    example: 'spacemolt config fuzzy-ids on',
    category: 'Configuration',
    args: ['action'],
    required: ['action'],
    seeAlso: ['profile', 'doctor'],
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

export function routeToPath(
  route: Pick<V2Route, 'tool' | 'action' | 'rootPath'>,
  options?: { includeApiPrefix?: boolean },
): string {
  if (route.rootPath) {
    const path = route.rootPath.replace(/^\/+/, '');
    return options?.includeApiPrefix ? `/${path}` : path;
  }
  const path =
    route.tool === route.action || SINGLE_ENDPOINT_TOOLS.has(route.tool) ? route.tool : `${route.tool}/${route.action}`;
  return options?.includeApiPrefix ? `/api/v2/${path}` : path;
}

/** Returns the URL path segment or full special path for signatures/debug. */
function routePathForSignature(route: V2Route): string {
  return routeToPath(route, { includeApiPrefix: true });
}

export function routeSignature(route: V2Route): string {
  const method = route.method || 'POST';
  return `${method} ${routePathForSignature(route)}`;
}

/**
 * Build the full request URL for a route.
 * - Normal v2 routes: `${baseUrl}/${tool/action}`
 * - rootPath routes: derive game root from baseUrl and append rootPath.
 * Path placeholders (`{name}`) are left unsubstituted; use {@link applyPathParams}.
 */
export function buildRequestUrl(baseUrl: string, route: V2Route): string {
  const trimmedBase = trimTrailingSlash(baseUrl);
  if (route.rootPath) {
    const root = trimmedBase.replace(/\/api\/v2\/?$/, '');
    const p = route.rootPath.replace(/^\//, '');
    return `${root}/${p}`;
  }
  return `${trimmedBase}/${routeToPath(route)}`;
}

/**
 * Substitute `route.pathParams` into `{field}` placeholders in a built URL and
 * return the residual payload with those keys removed (so GET does not re-send them as query).
 * Throws when a declared path param is missing, null, or empty after stringification.
 */
export function applyPathParams(
  route: V2Route,
  url: string,
  payload: Record<string, unknown>,
): { url: string; residualPayload: Record<string, unknown> } {
  const pathParams = route.pathParams;
  if (!pathParams?.length) {
    return { url, residualPayload: payload };
  }

  let nextUrl = url;
  const residualPayload: Record<string, unknown> = { ...payload };
  for (const key of pathParams) {
    const value = residualPayload[key];
    delete residualPayload[key];
    if (value === undefined || value === null || String(value).length === 0) {
      throw new Error(`Missing path parameter: ${key}`);
    }
    const encoded = encodeURIComponent(String(value));
    nextUrl = nextUrl.split(`{${key}}`).join(encoded);
  }
  for (const key of pathParams) {
    if (nextUrl.includes(`{${key}}`)) {
      throw new Error(`Missing path parameter: ${key}`);
    }
  }
  return { url: nextUrl, residualPayload };
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
    const hint =
      fieldSchema?.enum?.join('|') ?? (schemaAllowsType(fieldSchema?.type, 'boolean') ? 'true/false' : '...');
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

function mergeSchemaExtensions(
  generatedSchema: GeneratedApiRoute['schema'] | undefined,
  schemaExtensions: Record<string, CommandFieldSchema> | undefined,
): Record<string, CommandFieldSchema> | undefined {
  if (!generatedSchema) return schemaExtensions;
  if (!schemaExtensions) return generatedSchema;

  const schema: Record<string, CommandFieldSchema> = { ...generatedSchema };
  for (const [field, extension] of Object.entries(schemaExtensions)) {
    schema[field] = { ...schema[field], ...extension };
  }
  return schema;
}

function mergeCommandConfig(
  command: string,
  config: CommandOverride,
  generatedRoutes: Record<string, GeneratedApiRoute>,
): CommandConfig {
  let generated: GeneratedApiRoute | undefined;
  let baseRoute: V2Route;

  if (config.route) {
    // Standalone / public endpoint defined directly (not present in server OpenAPI)
    baseRoute = { ...config.route };
  } else if (config.apiRoute) {
    generated = getGeneratedRoute(config.apiRoute, generatedRoutes);
    baseRoute = { ...generated.route };
  } else {
    throw new Error(`Command override for "${command}" must provide either "apiRoute" or "route".`);
  }

  const generatedAliases = generated ? generatedArgAliases(config.positionals, generated) : {};
  const aliases = { ...generatedAliases, ...config.aliases };
  const {
    apiRoute: _apiRoute,
    route: _route,
    defaults,
    positionals: _positionals,
    aliases: _aliases,
    schemaExtensions,
    ...uxConfig
  } = config;

  const route: V2Route = {
    ...baseRoute,
    defaults,
  };

  const args = config.positionals ?? (generated ? generatedArgs(generated) : undefined);
  const required =
    config.required ?? (generated ? displayRequiredFields(generated.required, config.positionals, aliases) : undefined);
  const description = config.description ?? CURATED_COMMAND_DESCRIPTIONS[command] ?? generated?.summary;
  const usage = config.usage ?? (generated ? buildUsageFromSchema(config, generated) : undefined);
  const stateSections = generated?.stateSections;

  return {
    ...uxConfig,
    args,
    required,
    description,
    usage,
    ...(stateSections ? { stateSections } : {}),
    aliases,
    route,
    schema: mergeSchemaExtensions(generated?.schema, schemaExtensions),
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
