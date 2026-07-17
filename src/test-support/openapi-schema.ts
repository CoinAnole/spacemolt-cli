import * as fs from 'node:fs';
import * as path from 'node:path';

const DEFAULT_OPENAPI_PATH = path.join(import.meta.dir, '..', '..', 'spacemolt-docs', 'openapi.json');

export interface OpenApiDiscriminator {
  propertyName: string;
  mapping?: Record<string, string>;
}

export type JsonSchema = Record<string, unknown> & {
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  $ref?: string;
  allOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  description?: string;
  discriminator?: OpenApiDiscriminator;
};

export interface OpenApiOperation {
  description?: string;
  requestBody?: {
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }>;
}

export interface OpenApiSpec {
  info?: Record<string, unknown>;
  paths?: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

export interface OpenApiSchemaCandidate {
  label: string;
  comparedAgainst: string;
  schema: JsonSchema;
  primarySchemaName?: string;
  discriminator?: { propertyName: string; value: string };
}

const specCache = new Map<string, OpenApiSpec>();
const propNamesMemo = new WeakMap<object, Set<string>>();

export function loadOpenApiSpec(customPath?: string): OpenApiSpec {
  const specPath = path.resolve(customPath ?? DEFAULT_OPENAPI_PATH);
  const cachedSpec = specCache.get(specPath);
  if (cachedSpec) return cachedSpec;

  const raw = fs.readFileSync(specPath, 'utf8');
  const spec = JSON.parse(raw) as OpenApiSpec;
  specCache.set(specPath, spec);
  return spec;
}

export function resolveRef(spec: OpenApiSpec, ref: string, seen = new Set<string>()): JsonSchema {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  if (seen.has(ref)) return {};
  seen.add(ref);

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return {};
    }
  }
  const schema = current as JsonSchema;
  return schema?.$ref ? resolveRef(spec, schema.$ref, seen) : schema;
}

export function schemaRefName(schema: JsonSchema | undefined): string | undefined {
  return typeof schema?.$ref === 'string' ? schema.$ref.split('/').pop() : undefined;
}

export function mergeAllOf(spec: OpenApiSpec, schemas: JsonSchema[], seen = new Set<string>()): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  const out: JsonSchema = {};

  for (const s of schemas) {
    const resolved = s.$ref ? resolveRef(spec, s.$ref, seen) : s;
    const effective = resolved.allOf ? mergeAllOf(spec, resolved.allOf, seen) : resolved;

    for (const [key, value] of Object.entries(effective)) {
      if (key === 'properties' || key === 'required' || key === 'allOf') continue;
      if (out[key] === undefined) out[key] = value;
    }

    if (effective.properties) {
      for (const [key, propertySchema] of Object.entries(effective.properties)) {
        properties[key] = { ...(properties[key] ?? {}), ...propertySchema };
      }
    }
    if (effective.required) required.push(...effective.required);
  }

  if (Object.keys(properties).length > 0) out.properties = properties;
  if (required.length > 0) out.required = Array.from(new Set(required));
  return out;
}

export function getEffectiveSchema(spec: OpenApiSpec, schema: JsonSchema, seen = new Set<string>()): JsonSchema {
  const resolved = schema.$ref ? resolveRef(spec, schema.$ref, seen) : schema;
  return resolved.allOf && resolved.allOf.length > 0 ? mergeAllOf(spec, resolved.allOf, seen) : resolved;
}

export function resolveSuccessResponseSchema(
  spec: OpenApiSpec,
  apiRoute: string,
): { schema: JsonSchema; primarySchemaName?: string } {
  const parts = apiRoute.split(' ');
  const methodRaw = parts[0];
  const apiPath = parts.slice(1).join(' ');
  if (!methodRaw || !apiPath) return { schema: {} };

  const operation = spec.paths?.[apiPath]?.[methodRaw.toLowerCase()];
  const resp = operation?.responses?.['200'] ?? operation?.responses?.[200 as unknown as string];
  const schema = resp?.content?.['application/json']?.schema;
  if (!schema) return { schema: {} };

  let effective = getEffectiveSchema(spec, schema);
  let primarySchemaName: string | undefined;
  const structuredContent = effective.properties?.structuredContent;

  if (structuredContent) {
    primarySchemaName = schemaRefName(structuredContent);
    effective = getEffectiveSchema(spec, structuredContent);
  }

  return { schema: effective, primarySchemaName };
}

export function resolveDetailsSubschema(spec: OpenApiSpec, schema: JsonSchema): JsonSchema | undefined {
  const details = schema.properties?.details;
  if (!details) return undefined;
  const resolved = getEffectiveSchema(spec, details);
  if (
    resolved.properties &&
    Object.keys(resolved.properties).length === 0 &&
    !resolved.allOf &&
    !resolved.oneOf &&
    !resolved.anyOf
  ) {
    return undefined;
  }
  return resolved;
}

function schemaHasComparableShape(schema: JsonSchema | undefined): schema is JsonSchema {
  if (!schema) return false;
  if (schema.properties && Object.keys(schema.properties).length > 0) return true;
  if (schema.items) return true;
  const schemaTypes = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  return schemaTypes.some((type) => type !== 'object');
}

function mappedDiscriminators(
  schema: JsonSchema,
  branch: JsonSchema,
): Array<NonNullable<OpenApiSchemaCandidate['discriminator']>> {
  const discriminator = schema.discriminator;
  if (
    typeof discriminator?.propertyName !== 'string' ||
    discriminator.propertyName.length === 0 ||
    !discriminator.mapping ||
    typeof discriminator.mapping !== 'object' ||
    Array.isArray(discriminator.mapping) ||
    !branch.$ref
  ) {
    return [];
  }
  return Object.entries(discriminator.mapping).flatMap(([value, ref]) =>
    value && ref === branch.$ref ? [{ propertyName: discriminator.propertyName, value }] : [],
  );
}

function expandBranchCandidates(spec: OpenApiSpec, candidate: OpenApiSchemaCandidate): OpenApiSchemaCandidate[] {
  const effective = getEffectiveSchema(spec, candidate.schema);
  const branches = effective.oneOf ?? effective.anyOf;
  const out: OpenApiSchemaCandidate[] = schemaHasComparableShape(effective)
    ? [{ ...candidate, schema: effective }]
    : [];

  if (!branches) return out;

  for (let i = 0; i < branches.length; i++) {
    const branch = branches[i] as JsonSchema;
    const resolved = getEffectiveSchema(spec, branch);
    const refName = schemaRefName(branch);
    const mapped = mappedDiscriminators(effective, branch);
    const discriminators = mapped.length > 0 ? mapped : [candidate.discriminator];
    for (const discriminator of discriminators) {
      out.push(
        ...expandBranchCandidates(spec, {
          label: `${candidate.label}.${effective.oneOf ? 'oneOf' : 'anyOf'}[${i}]`,
          comparedAgainst: candidate.comparedAgainst,
          schema: resolved,
          primarySchemaName: refName ?? `${candidate.primarySchemaName ?? candidate.label}.${i}`,
          discriminator,
        }),
      );
    }
  }

  return out;
}

export function buildResponseSchemaCandidates(
  spec: OpenApiSpec,
  responseSchema: JsonSchema,
  primarySchemaName?: string,
): OpenApiSchemaCandidate[] {
  const effectiveResponseSchema = getEffectiveSchema(spec, responseSchema);
  const structured: OpenApiSchemaCandidate = {
    label: 'structuredContent',
    comparedAgainst: 'structuredContent',
    schema: effectiveResponseSchema,
    primarySchemaName,
  };
  const candidates: OpenApiSchemaCandidate[] = [...expandBranchCandidates(spec, structured)];

  const detailsProp = effectiveResponseSchema.properties?.details;
  const detailsSchema = resolveDetailsSubschema(spec, effectiveResponseSchema);
  if (detailsSchema) {
    candidates.push(
      ...expandBranchCandidates(spec, {
        label: 'details',
        comparedAgainst: 'details',
        schema: detailsSchema,
        primarySchemaName: schemaRefName(detailsProp) ?? 'details',
      }),
    );
  }

  const unique = new Map<string, OpenApiSchemaCandidate>();
  for (const candidate of candidates) {
    const tag = candidate.discriminator
      ? `${candidate.discriminator.propertyName}=${candidate.discriminator.value}`
      : '';
    unique.set(`${candidate.label}:${candidate.primarySchemaName ?? ''}:${tag}`, candidate);
  }
  return [...unique.values()];
}

export function collectAllPropertyNames(schema: JsonSchema, spec: OpenApiSpec, seen = new Set<string>()): Set<string> {
  if (!schema || typeof schema !== 'object') return new Set<string>();

  const cached = propNamesMemo.get(schema);
  if (cached) return new Set(cached);

  const fields = new Set<string>();
  const effective = getEffectiveSchema(spec, schema, seen);

  if (effective.properties && typeof effective.properties === 'object') {
    for (const [key, sub] of Object.entries(effective.properties)) {
      fields.add(key);
      for (const nested of collectAllPropertyNames(sub, spec, seen)) fields.add(nested);
    }
  }

  if (effective.items) {
    for (const nested of collectAllPropertyNames(effective.items, spec, seen)) fields.add(nested);
  }

  for (const variant of [...(effective.oneOf || []), ...(effective.allOf || []), ...(effective.anyOf || [])]) {
    for (const nested of collectAllPropertyNames(variant as JsonSchema, spec, seen)) fields.add(nested);
  }

  propNamesMemo.set(schema, new Set(fields));
  return fields;
}
