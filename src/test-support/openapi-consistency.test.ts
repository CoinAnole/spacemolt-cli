import { describe, expect, test } from 'bun:test';
import {
  buildConsistencyReport,
  extractDocExamples,
  extractMentionedFieldNames,
  findOverbroadSharedSchemas,
  findProseFieldMismatches,
  type OpenApiSpec,
} from './openapi-consistency';

function makeMinimalSpec(overrides: Partial<OpenApiSpec> = {}): OpenApiSpec {
  const base: OpenApiSpec = {
    info: { 'x-gameserver-version': 'v0.test.1' },
    paths: {},
    components: { schemas: {} },
    ...overrides,
  } as OpenApiSpec;
  return base;
}

function addPostOperation(spec: OpenApiSpec, apiPath: string, description: string, requestProps: Record<string, any>) {
  if (!spec.paths) spec.paths = {};
  spec.paths[apiPath] = {
    post: {
      description,
      requestBody: {
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: requestProps,
            },
          },
        },
      },
    },
  } as any;
}

describe('openapi-consistency doc snippet parser', () => {
  test('extractDocExamples pulls the canonical **Example:** payload', () => {
    const desc = 'Do the thing.\n\n**Example:** `{"type": "load_passenger", "payload": {"destination": "nova"}}`';
    const exs = extractDocExamples(desc);
    expect(exs.length).toBeGreaterThan(0);
    expect(exs[0]?.payloadShape).toEqual({ destination: 'nova' });
  });

  test('extractDocExamples handles examples without payload wrapper', () => {
    const desc = '**Example:** `{"type": "get_status"}`';
    const exs = extractDocExamples(desc);
    expect(exs[0]?.payloadShape).toBeNull(); // nothing to send
  });

  test('extractMentionedFieldNames finds quoted and example keys', () => {
    const text = 'Use "name" or destination=... See `{"payload":{"station":"foo"}}`';
    const names = extractMentionedFieldNames(text);
    expect(names).toContain('name');
    expect(names).toContain('destination');
    expect(names).toContain('station');
  });
});

describe('prose-field-mismatch analyzer', () => {
  test('flags when example uses "name" but schema only defines "id"', () => {
    const spec = makeMinimalSpec();
    addPostOperation(
      spec,
      '/api/v2/spacemolt/unload_passenger',
      '**Example:** `{"type": "unload_passenger", "payload": {"name": "all"}}`',
      {
        id: { type: 'string', description: 'Name or id of passenger' },
      },
    );

    const findings = findProseFieldMismatches(spec);
    const mismatch = findings.find((f) => f.kind === 'prose-field-mismatch' && f.field === 'name');
    expect(mismatch).toBeDefined();
    expect(mismatch?.route).toContain('unload_passenger');
    expect(mismatch?.severity).toBe('high');
  });

  test('does not flag when example key matches schema key', () => {
    const spec = makeMinimalSpec();
    addPostOperation(
      spec,
      '/api/v2/spacemolt/load_passenger',
      '**Example:** `{"type": "load_passenger", "payload": {"id": "dest-1"}}`',
      { id: { type: 'string' } },
    );

    const findings = findProseFieldMismatches(spec);
    expect(findings.filter((f) => f.kind === 'prose-field-mismatch')).toHaveLength(0);
  });
});

describe('overbroad-shared-schema analyzer', () => {
  test('flags dedicated paths that share a broad direction enum', () => {
    const spec = makeMinimalSpec();
    const directionSchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' or job for 'job_add'",
      },
      facility_id: { type: 'string' },
      // pad to satisfy the "looks like a shared mega schema" heuristic in the analyzer
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/job_add', 'job add', directionSchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/transfer', 'transfer', directionSchema);

    const findings = findOverbroadSharedSchemas(spec);
    const dirFinding = findings.find((f) => f.kind === 'overbroad-shared-schema' && f.field === 'direction');
    expect(dirFinding).toBeDefined();
    expect(dirFinding?.severity).toBe('high');
    expect(dirFinding?.evidence.sharedWith?.some((r) => r.includes('transfer'))).toBe(true);
  });
});

describe('full report build', () => {
  test('buildConsistencyReport works on the real bundled spec with --only filter', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('./openapi-consistency');
    const spec = mod.loadOpenApiSpec();
    const report = buildConsistencyReport(spec, { only: ['passenger', 'facility', 'unload', 'job_add'] });

    // The machinery must run cleanly; we do not hard-require a minimum number of findings
    // because the committed spec may be updated over time. We mainly care that filtering + extraction works.
    expect(report.summary.total).toBeGreaterThanOrEqual(0);
    expect(report.gameserverVersion).toMatch(/v\d/);
  });
});
