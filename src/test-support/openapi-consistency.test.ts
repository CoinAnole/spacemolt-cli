import { describe, expect, test } from 'bun:test';
import {
  buildConsistencyReport,
  extractDocExamples,
  extractMentionedFieldNames,
  findOverbroadSharedSchemas,
  findProseFieldMismatches,
  findResponseProseMismatches,
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

describe('response prose mismatch (base_fare style)', () => {
  function addComponentSchema(spec: OpenApiSpec, name: string, schema: any) {
    if (!spec.components) spec.components = { schemas: {} };
    (spec.components.schemas as any)[name] = schema;
  }

  test('does not flag ListPassengersResponse when base_fare is inside passengers[] items', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'ListPassengersResponse', {
      description: 'Response containing passengers with base_fare information.',
      properties: {
        passengers: {
          items: {
            properties: {
              name: { type: 'string' },
              base_fare: { type: 'integer' },
            },
          },
        },
      },
    });

    const findings = findResponseProseMismatches(spec);
    const baseFareFlags = findings.filter(
      (f) =>
        f.kind === 'missing-response-field-prose' &&
        f.schemaName === 'ListPassengersResponse' &&
        f.field === 'base_fare',
    );
    expect(baseFareFlags).toHaveLength(0);
  });

  test('does not flag a oneOf Unload-style response containing base_fare in variants', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'UnloadPassengerResponse', {
      description: 'Unload result may include base_fare in the response or delivered list.',
      oneOf: [
        {
          properties: {
            base_fare: { type: 'integer' },
            message: { type: 'string' },
          },
        },
        {
          properties: {
            delivered: {
              items: { properties: { base_fare: { type: 'integer' } } },
            },
          },
        },
      ],
    });

    const findings = findResponseProseMismatches(spec);
    const flags = findings.filter(
      (f) =>
        f.kind === 'missing-response-field-prose' &&
        f.schemaName === 'UnloadPassengerResponse' &&
        f.field === 'base_fare',
    );
    expect(flags).toHaveLength(0);
  });

  test('does not flag DockResponse with base_fare inside passenger_arrivals.delivered[]', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'DockResponse', {
      description: 'Dock may report passenger_arrivals with base_fare in delivered entries.',
      properties: {
        passenger_arrivals: {
          properties: {
            delivered: {
              items: {
                properties: {
                  name: { type: 'string' },
                  base_fare: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    });

    const findings = findResponseProseMismatches(spec);
    const flags = findings.filter(
      (f) =>
        f.kind === 'missing-response-field-prose' &&
        f.schemaName === 'DockResponse' &&
        f.field === 'base_fare',
    );
    expect(flags).toHaveLength(0);
  });

  test('still flags when a term is referenced in prose but truly absent from the schema tree', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'SomeResponse', {
      properties: {
        count: { type: 'integer' },
      },
    });

    // Term referenced only in prose description; absent from the schema shape.
    (spec.components!.schemas as any).SomeResponse.description =
      'Returns base_fare and other things.';

    const findings = findResponseProseMismatches(spec);
    const flag = findings.find(
      (f) => f.kind === 'missing-response-field-prose' && f.schemaName === 'SomeResponse',
    );
    expect(flag).toBeDefined();
  });
});
