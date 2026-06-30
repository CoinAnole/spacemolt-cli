export interface OpenApiSpec {
  info: {
    'x-gameserver-version': string;
    [key: string]: unknown;
  };
  paths: Record<string, Record<string, Operation>>;
}

interface Operation {
  operationId?: string;
  summary?: string;
  'x-state-sections'?: unknown;
  requestBody?: {
    content?: {
      'application/json'?: {
        schema?: JsonSchema;
      };
    };
  };
}

interface JsonSchema {
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  type?: string;
  enum?: string[];
  description?: string;
  'x-positional-index'?: number;
  'x-cli-command'?: string;
  'x-cli-category'?: string;
  'x-cli-hidden'?: boolean;
}

export interface GeneratedApiField {
  type?: string;
  enum?: string[];
  description?: string;
  positionalIndex?: number;
}

export interface GeneratedApiRoute {
  operationId?: string;
  summary?: string;
  stateSections?: string[];
  route: {
    tool: string;
    action: string;
    method: 'GET' | 'POST';
  };
  required?: string[];
  schema?: Record<string, GeneratedApiField>;
  cli?: {
    command?: string;
    category?: string;
    hidden?: boolean;
  };
}

export function gameserverVersionFromSpec(spec: OpenApiSpec): string {
  const version = spec.info?.['x-gameserver-version'];
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('OpenAPI spec is missing info.x-gameserver-version');
  }
  return version;
}

function routeParts(apiPath: string): { tool: string; action: string } {
  const parts = apiPath.replace(/^\/api\/v2\/?/, '').split('/');
  const tool = parts[0];
  if (!tool) throw new Error(`Invalid API path: ${apiPath}`);
  return {
    tool,
    action: parts[1] || tool,
  };
}

function fieldSchema(schema: JsonSchema): GeneratedApiField {
  const field: GeneratedApiField = {};
  if (schema.type) field.type = schema.type;
  if (schema.enum) field.enum = schema.enum;
  else if (schema.items?.enum) field.enum = schema.items.enum;
  if (schema.description) field.description = schema.description;
  if (schema['x-positional-index'] !== undefined) field.positionalIndex = schema['x-positional-index'];
  return field;
}

function cliMetadata(schema: JsonSchema): GeneratedApiRoute['cli'] | undefined {
  const cli: GeneratedApiRoute['cli'] = {};
  if (schema['x-cli-command'] !== undefined) cli.command = schema['x-cli-command'];
  if (schema['x-cli-category'] !== undefined) cli.category = schema['x-cli-category'];
  if (schema['x-cli-hidden'] !== undefined) cli.hidden = schema['x-cli-hidden'];
  return Object.keys(cli).length === 0 ? undefined : cli;
}

function requestSchema(operation: Operation): Pick<GeneratedApiRoute, 'required' | 'schema' | 'cli'> {
  const schema = operation.requestBody?.content?.['application/json']?.schema;
  if (!schema?.properties) {
    const cli = schema ? cliMetadata(schema) : undefined;
    return cli ? { cli } : {};
  }

  const generated: Pick<GeneratedApiRoute, 'required' | 'schema' | 'cli'> = {
    required: schema.required,
    schema: Object.fromEntries(
      Object.entries(schema.properties)
        .map(([name, property]) => [name, fieldSchema(property)] as const)
        .sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  const cli = cliMetadata(schema);
  if (cli) generated.cli = cli;

  return generated;
}

function stateSections(operation: Operation): string[] | undefined {
  const sections = operation['x-state-sections'];
  if (!Array.isArray(sections)) return undefined;
  const validSections = sections.filter((section): section is string => typeof section === 'string' && section !== '');
  return validSections.length > 0 ? validSections : undefined;
}

export function generateApiRoutes(spec: OpenApiSpec): Record<string, GeneratedApiRoute> {
  const routes: Record<string, GeneratedApiRoute> = {};

  for (const [apiPath, methods] of Object.entries(spec.paths).sort(([a], [b]) => a.localeCompare(b))) {
    for (const method of ['get', 'post'] as const) {
      const operation = methods[method];
      if (!operation) continue;
      const route = routeParts(apiPath);
      const operationStateSections = stateSections(operation);
      const generated: GeneratedApiRoute = {
        operationId: operation.operationId,
        summary: operation.summary,
        ...(operationStateSections ? { stateSections: operationStateSections } : {}),
        route: {
          ...route,
          method: method.toUpperCase() as 'GET' | 'POST',
        },
        ...requestSchema(operation),
      };
      routes[`${generated.route.method} ${apiPath}`] = generated;
    }
  }

  return routes;
}
