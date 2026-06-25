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
  /** Indicates the fixture was compared against a subschema (e.g. the action details payload) rather than the raw top-level structuredContent response. */
  comparedAgainst?: 'details' | 'structuredContent';
  divergences: Divergence[];
  summary: string;
  isPartialExample: boolean;
}

export type BlockingDivergenceKind = 'extra-in-fixture' | 'type-mismatch' | 'required-missing';

export interface LabeledDivergence extends Divergence {
  label: string;
  command: string;
  apiRoute?: string;
}

export interface FixtureSchemaBaseline {
  generatedAtGameserver?: string;
  blockingDivergenceSignatures: string[];
}

export interface CompareOptions {
  /** Only compare these labels or command names (substring match) */
  only?: string[];
  /** Max recursion depth for nested comparison */
  maxDepth?: number;
}

const DEFAULT_OPENAPI_PATH = path.join(import.meta.dir, '..', '..', 'spacemolt-docs', 'openapi.json');
export const DEFAULT_SCHEMA_BASELINE_PATH = path.join(import.meta.dir, 'fixture-schema-baseline.json');

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

export interface OpenApiSpec {
  paths: Record<
    string,
    Record<string, { responses?: Record<string, { content?: Record<string, { schema?: JsonSchema }> }> }>
  >;
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

function getEffectiveSchema(spec: OpenApiSpec, schema: JsonSchema, seen = new Set<string>()): JsonSchema {
  const resolved = schema.$ref ? resolveRef(spec, schema.$ref, seen) : schema;
  if (resolved.allOf && resolved.allOf.length > 0) {
    return mergeAllOf(spec, resolved.allOf, seen);
  }
  return resolved;
}

function resolveChildSchema(schema: JsonSchema, spec?: OpenApiSpec): JsonSchema {
  if (!spec) return schema;
  return getEffectiveSchema(spec, schema);
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

/** Common top-level state keys in V2GameState / full responses. */
const STATE_KEYS = ['cargo', 'credits', 'player', 'ship', 'location', 'missions', 'modules', 'queue', 'skills', 'hints', 'riding', 'version', 'details'] as const;

function hasStateLikeKeys(obj: Record<string, unknown>): boolean {
  return Object.keys(obj).some((k) => (STATE_KEYS as readonly string[]).includes(k));
}

/** Heuristic: does this fixture look like a pure action/details payload rather than a full structuredContent/V2GameState? */
function fixtureLooksLikePureActionResult(fixture: Record<string, unknown>): boolean {
  if (!fixture || typeof fixture !== 'object' || Array.isArray(fixture)) return false;
  const keys = Object.keys(fixture);
  if (keys.length === 0) return false;
  if (hasStateLikeKeys(fixture)) return false;
  if ('details' in fixture) return false;
  // Common markers for action result payloads the CLI surfaces / tests
  if ('action' in fixture) return true;
  if (typeof (fixture as any).success === 'boolean') return true;
  if ('target_id' in fixture || 'fuel' in fixture || 'base_id' in fixture) return true;
  if (keys.some((k) => k === 'name' || k.endsWith('_id') || k === 'total_value' || k === 'xp_gained')) return true;
  return false;
}

function resolveDetailsSubschema(spec: OpenApiSpec, schema: JsonSchema): JsonSchema | undefined {
  const d = schema.properties?.details as JsonSchema | undefined;
  if (!d) return undefined;
  let resolvedD = d;
  if (resolvedD.$ref) {
    resolvedD = resolveRef(spec, resolvedD.$ref);
  }
  resolvedD = getEffectiveSchema(spec, resolvedD);
  // If it ended up empty or without properties, don't use it
  if (!resolvedD || (resolvedD.properties && Object.keys(resolvedD.properties).length === 0 && !resolvedD.allOf && !resolvedD.oneOf)) {
    return undefined;
  }
  return resolvedD;
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
  spec?: OpenApiSpec,
  allowedExtraKeys?: Set<string>,
): void {
  if (depth > maxDepth) return;

  const vType = getJsonType(value);
  const sType = Array.isArray(schema.type) ? schema.type[0] : schema.type;

  // Type check when schema declares a type
  if (sType && vType !== 'undefined') {
    const schemaTypes = Array.isArray(schema.type) ? schema.type : [schema.type];
    const numericCompat = vType === 'number' && (schemaTypes.includes('integer') || schemaTypes.includes('number'));
    const nullableCompat = vType === 'null' && schemaTypes.includes('null');
    if (vType === 'null' && !nullableCompat) {
      divergences.push({
        path,
        kind: 'type-mismatch',
        message: `type ${vType} vs schema ${schemaTypes.join('|')}`,
        fixtureValue: value,
      });
    } else if (!numericCompat && !nullableCompat && !schemaTypes.includes(vType) && !schemaTypes.includes('object')) {
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
        if (allowedExtraKeys && allowedExtraKeys.has(k)) {
          // Known extra for this fixture (e.g. chat send view vs ack schema); do not flag
          continue;
        }
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
      const resolvedPropSchema = resolveChildSchema(propSchema as JsonSchema, spec);
      const childPath = path ? `${path}.${k}` : k;
      const childVal = (obj as Record<string, unknown>)[k];
      const childRequired = resolvedPropSchema.required || schema.required;

      if (childVal !== undefined) {
        compareValueToSchema(
          childVal,
          resolvedPropSchema,
          childPath,
          childRequired,
          depth + 1,
          maxDepth,
          divergences,
          spec,
          allowedExtraKeys,
        );
      } else if (required?.includes(k)) {
        divergences.push({
          path: childPath,
          kind: 'required-missing',
          message: 'required by schema but absent from fixture',
        });
      }
    }
  } else if (vType === 'array' && Array.isArray(value) && schema.items) {
    const itemSchema = resolveChildSchema(schema.items as JsonSchema, spec);
    const itemRequired = Array.isArray(itemSchema.required) ? itemSchema.required : undefined;
    for (let i = 0; i < Math.min(value.length, 3); i++) {
      // sample first few items to keep report short
      compareValueToSchema(value[i], itemSchema, `${path}[${i}]`, itemRequired, depth + 1, maxDepth, divergences, spec, allowedExtraKeys);
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
  opts: {
    label: string;
    command: string;
    apiRoute: string;
    primarySchemaName?: string;
    maxDepth?: number;
    spec?: OpenApiSpec;
    /** Keys that are present in the fixture but should not be treated as extra-in-fixture (e.g. chat send view fields) */
    allowedExtraKeys?: string[];
    comparedAgainst?: FixtureSchemaComparison['comparedAgainst'];
  } = {
    label: '',
    command: '',
    apiRoute: '',
  },
): FixtureSchemaComparison {
  const maxDepth = opts.maxDepth ?? 4;
  const divergences: Divergence[] = [];
  const effectiveSchema = resolveChildSchema(schema, opts.spec);
  const allowedSet = opts.allowedExtraKeys && opts.allowedExtraKeys.length ? new Set(opts.allowedExtraKeys) : undefined;

  // Top level required from the primary schema
  const topRequired = Array.isArray(effectiveSchema.required) ? effectiveSchema.required : undefined;

  compareValueToSchema(fixtureValue, effectiveSchema, '', topRequired, 0, maxDepth, divergences, opts.spec, allowedSet);

  // Fields declared in schema but completely absent from fixture (informational for partial examples)
  if (effectiveSchema.properties && typeof fixtureValue === 'object' && fixtureValue !== null) {
    const present = new Set(Object.keys(fixtureValue as Record<string, unknown>));
    for (const [k, prop] of Object.entries(effectiveSchema.properties)) {
      if (!present.has(k)) {
        const isRequired = topRequired?.includes(k);
        divergences.push({
          path: k,
          kind: 'extra-in-schema',
          message: isRequired
            ? 'declared as required in schema but not exercised by fixture'
            : 'present in live response schema but not exercised by this fixture',
          schemaInfo: (prop as JsonSchema).description
            ? String((prop as JsonSchema).description).slice(0, 80)
            : undefined,
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

  const out: FixtureSchemaComparison = {
    label: opts.label,
    command: opts.command,
    apiRoute: opts.apiRoute,
    primarySchemaName: opts.primarySchemaName,
    divergences,
    summary,
    isPartialExample: isPartial,
    comparedAgainst: opts.comparedAgainst,
  };
  return out;
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
    if (
      only &&
      !only.some((needle) => label.toLowerCase().includes(needle) || entry.command.toLowerCase().includes(needle))
    ) {
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

    // Choose the most appropriate schema for this fixture.
    // Many action command fixtures are written as the "details" payload (or a chat send view)
    // rather than the full structuredContent / V2GameState envelope.
    let schemaForCompare = resolved.schema;
    let primaryForCompare = resolved.primarySchemaName;
    let allowedExtraKeys: string[] | undefined;

    const looksLikeAction = fixtureLooksLikePureActionResult(entry.fixture);
    let comparedAgainst: FixtureSchemaComparison['comparedAgainst'] = undefined;

    if (looksLikeAction) {
      const detailsSchema = resolveDetailsSubschema(spec, resolved.schema);
      if (detailsSchema) {
        schemaForCompare = detailsSchema;
        // Prefer a nice name like "RefuelResponse" when the ref is available
        const detailsProp = (resolved.schema.properties?.details as JsonSchema | undefined) || {};
        const refName = typeof detailsProp.$ref === 'string' ? detailsProp.$ref.split('/').pop() : undefined;
        primaryForCompare = refName || resolved.primarySchemaName || 'details';
        comparedAgainst = 'details';
      } else {
        comparedAgainst = 'structuredContent';
      }
    }

    if (comparedAgainst === undefined) {
      comparedAgainst = 'structuredContent';
    }

    // Chat send confirmation fixture uses a client-oriented shape (action/target/content)
    // that the formatter accepts in addition to the declared ChatResponse ack shape.
    if (label === 'chat' || entry.command === 'chat') {
      allowedExtraKeys = ['action', 'target', 'content'];
    }

    const comparison = compareFixtureToSchema(entry.fixture, schemaForCompare, {
      label,
      command: entry.command,
      apiRoute,
      primarySchemaName: primaryForCompare,
      maxDepth,
      spec,
      allowedExtraKeys,
      comparedAgainst,
    });

    results.push(comparison);
  }

  return results.sort((a, b) => a.label.localeCompare(b.label));
}

export function isBlockingDivergence(
  divergence: Divergence,
): divergence is Divergence & { kind: BlockingDivergenceKind } {
  return (
    divergence.kind === 'extra-in-fixture' ||
    divergence.kind === 'type-mismatch' ||
    divergence.kind === 'required-missing'
  );
}

export function divergenceSignature(
  divergence: Pick<LabeledDivergence, 'label' | 'command' | 'kind' | 'path'>,
): string {
  return `${divergence.label}|${divergence.command}|${divergence.kind}|${divergence.path}`;
}

export function filterBlockingDivergences(comparisons: FixtureSchemaComparison[]): LabeledDivergence[] {
  return comparisons
    .flatMap((comparison) =>
      comparison.divergences.filter(isBlockingDivergence).map((divergence) => ({
        ...divergence,
        label: comparison.label,
        command: comparison.command,
        apiRoute: comparison.apiRoute,
      })),
    )
    .sort((a, b) => divergenceSignature(a).localeCompare(divergenceSignature(b)));
}

export function loadFixtureSchemaBaseline(customPath = DEFAULT_SCHEMA_BASELINE_PATH): FixtureSchemaBaseline {
  const raw = fs.readFileSync(customPath, 'utf8');
  const parsed = JSON.parse(raw) as FixtureSchemaBaseline;
  return {
    generatedAtGameserver: parsed.generatedAtGameserver,
    blockingDivergenceSignatures: [...(parsed.blockingDivergenceSignatures ?? [])].sort(),
  };
}

export function formatBlockingDivergenceDiff(actual: string[], expected: string[]): string {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const added = actual.filter((signature) => !expectedSet.has(signature));
  const removed = expected.filter((signature) => !actualSet.has(signature));
  const lines: string[] = [];

  if (added.length > 0) {
    lines.push('Added blocking fixture/schema divergence signatures:');
    lines.push(...added.map((signature) => `  + ${signature}`));
  }

  if (removed.length > 0) {
    if (lines.length > 0) lines.push('');
    lines.push('Removed blocking fixture/schema divergence signatures:');
    lines.push(...removed.map((signature) => `  - ${signature}`));
  }

  return lines.length > 0 ? lines.join('\n') : 'No blocking fixture/schema divergence signature changes.';
}

export function assertFixtureSchemaBaseline(options: { baselinePath?: string } = {}): void {
  const actual = filterBlockingDivergences(compareHighValueFixturesToSpec())
    .map((divergence) => divergenceSignature(divergence))
    .sort();
  const expected = loadFixtureSchemaBaseline(options.baselinePath).blockingDivergenceSignatures;

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      [
        'Blocking fixture/schema divergences do not match the reviewed baseline.',
        formatBlockingDivergenceDiff(actual, expected),
        '',
        'Review the schema drift, then run:',
        '  bun run report:fixture-schemas --update-baseline',
      ].join('\n'),
    );
  }
}

export function formatComparisonReport(comparisons: FixtureSchemaComparison[]): string {
  const lines: string[] = [];
  lines.push('Fixture vs OpenAPI Response Schema Divergence Report');
  lines.push(`Generated for ${comparisons.length} high-value fixture(s)`);
  lines.push('');

  for (const c of comparisons) {
    lines.push(`## ${c.label}  (command: ${c.command})`);
    lines.push(`   apiRoute: ${c.apiRoute}`);
    let schemaLine = '';
    if (c.primarySchemaName) schemaLine = `   primary schema: ${c.primarySchemaName}`;
    if (c.comparedAgainst === 'details') {
      schemaLine += ' (fixture compared as action details payload)';
    }
    if (schemaLine) lines.push(schemaLine);
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
  lines.push(
    '  extra-in-fixture  = fixture contains keys the current OpenAPI schema does not declare (review carefully)',
  );
  lines.push('  type-mismatch     = fixture value type differs from schema declaration');
  lines.push('  required-missing  = schema marks a field required but fixture omits it (common for partial examples)');
  lines.push('');
  lines.push(
    'Run with SHOW_FIXTURE_SCHEMA_DIVERGENCES=1 bun test src/output-golden.test.ts to see this during golden runs.',
  );
  lines.push('Or: bun run report:fixture-schemas [--only get_status,view_market]');

  return lines.join('\n');
}
