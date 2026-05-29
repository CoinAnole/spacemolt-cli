import * as fs from 'node:fs';
import * as path from 'node:path';
import { COMMAND_OVERRIDES } from '../command-overrides.ts';
import { highValueCommandFixtures } from '../display/formatter-fixtures.ts';

type HighValueFixtureEntry = { command: string; fixture: Record<string, unknown> };

export interface Divergence {
  path: string;
  kind: 'extra-in-fixture' | 'extra-in-schema' | 'type-mismatch' | 'required-missing';
  message: string;
  fixtureValue?: unknown;
  schemaInfo?: string;
}

export interface FixtureSchemaComparison {
  label: string;
  command: string;
  apiRoute: string;
  primarySchemaName?: string;
  divergences: Divergence[];
  summary: string;
  isPartialExample: boolean;
}

export interface CompareOptions {
  /** Only compare these labels or command names (substring match) */
  only?: string[];
  /** Max recursion depth for nested comparison */
  maxDepth?: number;
}

const DEFAULT_OPENAPI_PATH = path.join(import.meta.dir, '..', '..', 'spacemolt-docs', 'openapi.json');

type JsonSchema = Record<string, unknown> & {
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
};

interface OpenApiSpec {
  paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }> }>>;
  components?: { schemas?: Record<string, JsonSchema> };
}

let cachedSpec: OpenApiSpec | null = null;

export function loadOpenApiSpec(customPath?: string): OpenApiSpec {
  if (cachedSpec && !customPath) return cachedSpec;
  const specPath = customPath ?? DEFAULT_OPENAPI_PATH;
  const raw = fs.readFileSync(specPath, 'utf8');
  cachedSpec = JSON.parse(raw) as OpenApiSpec;
  return cachedSpec;
}

function resolveRef(spec: OpenApiSpec, ref: string, seen = new Set<string>()): JsonSchema {
  if (!ref.startsWith('#/')) throw new Error(`Unsupported $ref: ${ref}`);
  if (seen.has(ref)) return {}; // cycle guard
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
  if (schema?.$ref) {
    return resolveRef(spec, schema.$ref, seen);
  }
  return schema;
}

function mergeAllOf(spec: OpenApiSpec, schemas: JsonSchema[], seen = new Set<string>()): JsonSchema {
  const out: JsonSchema = { type: 'object', properties: {}, required: [] };
  for (const s of schemas) {
    const resolved = s.$ref ? resolveRef(spec, s.$ref, seen) : s;
    if (resolved.allOf) {
      const merged = mergeAllOf(spec, resolved.allOf, seen);
      Object.assign(out.properties!, merged.properties || {});
      if (merged.required) out.required!.push(...merged.required);
    } else {
      if (resolved.properties) Object.assign(out.properties!, resolved.properties);
      if (resolved.required) out.required!.push(...resolved.required);
      if (resolved.type && !out.type) out.type = resolved.type;
    }
  }
  // dedupe required
  out.required = Array.from(new Set(out.required));
  return out;
}

function getEffectiveSchema(spec: OpenApiSpec, schema: JsonSchema, seen = new Set<string>()): JsonSchema {
  if (schema.$ref) return resolveRef(spec, schema.$ref, seen);
  if (schema.allOf && schema.allOf.length > 0) {
    return mergeAllOf(spec, schema.allOf, seen);
  }
  return schema;
}

/**
 * Given a full apiRoute like "POST /api/v2/spacemolt/get_status",
 * return the resolved 200 response schema (merged).
 */
export function resolveSuccessResponseSchema(
  spec: OpenApiSpec,
  apiRoute: string,
): { schema: JsonSchema; primarySchemaName?: string } {
  const parts = apiRoute.split(' ');
  const methodRaw = parts[0];
  const pathParts = parts.slice(1);
  if (!methodRaw) return { schema: {} };
  const method = methodRaw.toLowerCase() as 'get' | 'post';
  const apiPath = pathParts.join(' ');

  const pathItem = spec.paths?.[apiPath];
  if (!pathItem) {
    return { schema: {} };
  }
  const operation = pathItem[method];
  if (!operation) {
    return { schema: {} };
  }

  const resp = operation.responses?.['200'] ?? operation.responses?.[200];
  const media = resp?.content?.['application/json'];
  if (!media?.schema) {
    return { schema: {} };
  }

  let effective = getEffectiveSchema(spec, media.schema as JsonSchema);

  // Common pattern: V2Response envelope + structuredContent
  let primaryName: string | undefined;
  const sc = effective.properties?.structuredContent as JsonSchema | undefined;
  if (sc) {
    if (sc.$ref) {
      primaryName = sc.$ref.split('/').pop();
      effective = resolveRef(spec, sc.$ref);
    } else if (sc.allOf) {
      effective = mergeAllOf(spec, sc.allOf);
    } else {
      effective = sc;
    }
  } else if (effective.properties) {
    // Some responses put data at top level (e.g. register success, simple actions)
    // Keep the merged effective schema as primary.
  }

  return { schema: effective, primarySchemaName: primaryName };
}

function getJsonType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function compareValueToSchema(
  value: unknown,
  schema: JsonSchema,
  path: string,
  required: string[] | undefined,
  depth: number,
  maxDepth: number,
  divergences: Divergence[],
): void {
  if (depth > maxDepth) return;

  const vType = getJsonType(value);
  const sType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  // Type check when schema declares a type
  if (sType && vType !== 'undefined') {
    const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const numericCompat = (vType === 'number' && (schemaTypes.includes('integer') || schemaTypes.includes('number')));
    if (!numericCompat && !schemaTypes.includes(vType) && !schemaTypes.includes('object') && vType !== 'null') {
      // loose: many schemas use "object" for maps too
      if (!(vType === 'object' && schemaTypes.includes('object'))) {
        divergences.push({
          path,
          kind: 'type-mismatch',
          message: `type ${vType} vs schema ${schemaTypes.join('|')}`,
          fixtureValue: value,
        });
      }
    }
  }

  if (vType === 'object' && value && schema.properties) {
    const obj = value as Record<string, unknown>;
    const schemaProps = schema.properties;

    // Extra in fixture (not declared)
    for (const k of Object.keys(obj)) {
      if (!(k in schemaProps)) {
        const addl = schema.additionalProperties;
        if (addl === false || (typeof addl === 'object' && Object.keys(addl).length === 0)) {
          divergences.push({
            path: path ? `${path}.${k}` : k,
            kind: 'extra-in-fixture',
            message: 'field not present in schema (additionalProperties: false)',
            fixtureValue: obj[k],
          });
        } else {
          // permissive additionalProperties or not specified
          divergences.push({
            path: path ? `${path}.${k}` : k,
            kind: 'extra-in-fixture',
            message: 'field not declared in schema',
            fixtureValue: obj[k],
          });
        }
      }
    }

    // Recurse into known properties
    for (const [k, propSchema] of Object.entries(schemaProps)) {
      const childPath = path ? `${path}.${k}` : k;
      const childVal = (obj as Record<string, unknown>)[k];
      const childRequired = (propSchema as JsonSchema).required || schema.required;

      if (childVal !== undefined) {
        compareValueToSchema(childVal, propSchema as JsonSchema, childPath, childRequired, depth + 1, maxDepth, divergences);
      } else if (required?.includes(k)) {
        divergences.push({
          path: childPath,
          kind: 'required-missing',
          message: 'required by schema but absent from fixture',
        });
      }
    }
  } else if (vType === 'array' && Array.isArray(value) && schema.items) {
    const itemSchema = schema.items as JsonSchema;
    for (let i = 0; i < Math.min(value.length, 3); i++) {
      // sample first few items to keep report short
      compareValueToSchema(value[i], itemSchema, `${path}[${i}]`, undefined, depth + 1, maxDepth, divergences);
    }
    if (value.length > 3) {
      divergences.push({
        path,
        kind: 'extra-in-schema',
        message: `array has ${value.length} items; only sampled first 3 for comparison`,
      });
    }
  }
}

/**
 * Compare one fixture value against its corresponding response schema.
 */
export function compareFixtureToSchema(
  fixtureValue: unknown,
  schema: JsonSchema,
  opts: { label: string; command: string; apiRoute: string; primarySchemaName?: string; maxDepth?: number } = {
    label: '',
    command: '',
    apiRoute: '',
  },
): FixtureSchemaComparison {
  const maxDepth = opts.maxDepth ?? 4;
  const divergences: Divergence[] = [];

  // Top level required from the primary schema
  const topRequired = Array.isArray(schema.required) ? schema.required : undefined;

  compareValueToSchema(fixtureValue, schema, '', topRequired, 0, maxDepth, divergences);

  // Fields declared in schema but completely absent from fixture (informational for partial examples)
  if (schema.properties && typeof fixtureValue === 'object' && fixtureValue !== null) {
    const present = new Set(Object.keys(fixtureValue as Record<string, unknown>));
    for (const [k, prop] of Object.entries(schema.properties)) {
      if (!present.has(k)) {
        const isRequired = topRequired?.includes(k);
        divergences.push({
          path: k,
          kind: 'extra-in-schema',
          message: isRequired
            ? 'declared as required in schema but not exercised by fixture'
            : 'present in live response schema but not exercised by this fixture',
          schemaInfo: (prop as JsonSchema).description ? String((prop as JsonSchema).description).slice(0, 80) : undefined,
        });
      }
    }
  }

  const extraInFixture = divergences.filter((d) => d.kind === 'extra-in-fixture').length;
  const typeIssues = divergences.filter((d) => d.kind === 'type-mismatch').length;
  const missingRequired = divergences.filter((d) => d.kind === 'required-missing').length;

  const isPartial = divergences.some((d) => d.kind === 'extra-in-schema');
  const summaryParts: string[] = [];
  if (extraInFixture > 0) summaryParts.push(`${extraInFixture} extra-in-fixture`);
  if (typeIssues > 0) summaryParts.push(`${typeIssues} type mismatch(es)`);
  if (missingRequired > 0) summaryParts.push(`${missingRequired} missing required`);
  const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'no structural divergences detected';

  return {
    label: opts.label,
    command: opts.command,
    apiRoute: opts.apiRoute,
    primarySchemaName: opts.primarySchemaName,
    divergences,
    summary,
    isPartialExample: isPartial,
  };
}

/**
 * Run comparisons for all (or filtered) high-value fixtures against the OpenAPI spec.
 */
export function compareHighValueFixturesToSpec(options: CompareOptions = {}): FixtureSchemaComparison[] {
  const spec = loadOpenApiSpec();
  const only = options.only?.map((s) => s.toLowerCase());
  const maxDepth = options.maxDepth ?? 4;

  const results: FixtureSchemaComparison[] = [];

  for (const [label, entry] of Object.entries(highValueCommandFixtures) as [string, HighValueFixtureEntry][]) {
    if (only && !only.some((needle) => label.toLowerCase().includes(needle) || entry.command.toLowerCase().includes(needle))) {
      continue;
    }

    const override = COMMAND_OVERRIDES[entry.command];
    const apiRoute = override?.apiRoute ?? `POST /api/v2/${entry.command}`;

    let resolved: { schema: JsonSchema; primarySchemaName?: string };
    try {
      resolved = resolveSuccessResponseSchema(spec, apiRoute);
    } catch {
      resolved = { schema: {} };
    }

    if (!resolved.schema || Object.keys(resolved.schema).length === 0) {
      results.push({
        label,
        command: entry.command,
        apiRoute,
        divergences: [
          {
            path: '',
            kind: 'extra-in-schema',
            message: 'could not resolve a response schema from the OpenAPI document for this route',
          },
        ],
        summary: 'schema resolution failed',
        isPartialExample: true,
        primarySchemaName: undefined,
      });
      continue;
    }

    const comparison = compareFixtureToSchema(entry.fixture, resolved.schema, {
      label,
      command: entry.command,
      apiRoute,
      primarySchemaName: resolved.primarySchemaName,
      maxDepth,
    });

    results.push(comparison);
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}

export function formatComparisonReport(comparisons: FixtureSchemaComparison[]): string {
  const lines: string[] = [];
  lines.push('Fixture vs OpenAPI Response Schema Divergence Report');
  lines.push(`Generated for ${comparisons.length} high-value fixture(s)`);
  lines.push('');

  for (const c of comparisons) {
    lines.push(`## ${c.label}  (command: ${c.command})`);
    lines.push(`   apiRoute: ${c.apiRoute}`);
    if (c.primarySchemaName) lines.push(`   primary schema: ${c.primarySchemaName}`);
    lines.push(`   summary: ${c.summary}`);
    if (c.divergences.length === 0) {
      lines.push('   (no divergences)');
      lines.push('');
      continue;
    }

    const byKind = {
      'extra-in-fixture': c.divergences.filter((d) => d.kind === 'extra-in-fixture'),
      'extra-in-schema': c.divergences.filter((d) => d.kind === 'extra-in-schema'),
      'type-mismatch': c.divergences.filter((d) => d.kind === 'type-mismatch'),
      'required-missing': c.divergences.filter((d) => d.kind === 'required-missing'),
    };

    if (byKind['extra-in-fixture'].length) {
      lines.push('   Fields present in fixture but not declared in schema:');
      for (const d of byKind['extra-in-fixture']) {
        lines.push(`     - ${d.path}: ${d.message}`);
      }
    }
    if (byKind['type-mismatch'].length) {
      lines.push('   Type mismatches:');
      for (const d of byKind['type-mismatch']) {
        lines.push(`     - ${d.path}: ${d.message}`);
      }
    }
    if (byKind['required-missing'].length) {
      lines.push('   Required fields missing from fixture:');
      for (const d of byKind['required-missing']) {
        lines.push(`     - ${d.path}`);
      }
    }
    if (byKind['extra-in-schema'].length) {
      const shown = byKind['extra-in-schema'].slice(0, 12);
      lines.push(`   Fields in schema not exercised by fixture (${byKind['extra-in-schema'].length} total):`);
      for (const d of shown) {
        const note = d.schemaInfo ? ` — ${d.schemaInfo}` : '';
        lines.push(`     - ${d.path}${note}`);
      }
      if (byKind['extra-in-schema'].length > 12) {
        lines.push(`     ... and ${byKind['extra-in-schema'].length - 12} more`);
      }
    }
    lines.push('');
  }

  lines.push('Legend:');
  lines.push('  extra-in-schema   = live API response shape has fields our curated golden fixture does not exercise');
  lines.push('  extra-in-fixture  = fixture contains keys the current OpenAPI schema does not declare (review carefully)');
  lines.push('  type-mismatch     = fixture value type differs from schema declaration');
  lines.push('  required-missing  = schema marks a field required but fixture omits it (common for partial examples)');
  lines.push('');
  lines.push('Run with SHOW_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts to see this during golden runs.');
  lines.push('Or: bun run report:fixture-schemas [--only get_status,view_market]');

  return lines.join('\n');
}
