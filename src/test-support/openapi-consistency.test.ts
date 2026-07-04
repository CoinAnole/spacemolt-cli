import { describe, expect, test } from 'bun:test';
import {
  buildConsistencyReport,
  type ConsistencyReport,
  extractDocExamples,
  extractMentionedFieldNames,
  extractResponseFieldCandidatesWithProvenance,
  type FieldCandidate,
  type Finding,
  findOverbroadSharedSchemas,
  findProseFieldMismatches,
  findResponseProseMismatches,
  formatConsistencyReport,
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

function addPostOperation(
  spec: OpenApiSpec,
  apiPath: string,
  description: string,
  requestProps: Record<string, unknown>,
) {
  if (!spec.paths) spec.paths = {};
  // biome-ignore lint/suspicious/noExplicitAny: test fixture for arbitrary request/response shapes
  const postOp: any = {
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
  };
  spec.paths[apiPath] = postOp;
}

function addPostOperationWithResponse(
  spec: OpenApiSpec,
  apiPath: string,
  description: string,
  requestProps: Record<string, unknown>,
  responseSchema: Record<string, unknown>,
) {
  if (!spec.paths) spec.paths = {};
  // biome-ignore lint/suspicious/noExplicitAny: test fixture for arbitrary request/response shapes
  const postOp: any = {
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
      responses: {
        '200': {
          content: {
            'application/json': {
              schema: responseSchema,
            },
          },
        },
      },
    },
  };
  spec.paths[apiPath] = postOp;
}

function addComponentSchema(spec: OpenApiSpec, name: string, schema: unknown) {
  if (!spec.components) spec.components = { schemas: {} };
  // biome-ignore lint/suspicious/noExplicitAny: test fixture for arbitrary request/response shapes
  const schemas = spec.components.schemas as any;
  schemas[name] = schema;
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
    expect(dirFinding?.evidence.schemaEnum).toEqual(['to_faction', 'to_player', 'forward', 'reverse']);
    expect(dirFinding?.evidence.sharedWith?.some((r) => r.includes('transfer'))).toBe(true);
  });

  test('adds an info cluster when broad enum affected routes exceed route-level findings', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/types', 'types', broadFacilitySchema);

    const findings = findOverbroadSharedSchemas(spec);
    const cluster = findings.find((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'));

    expect(cluster).toBeDefined();
    expect(cluster?.severity).toBe('info');
    expect(cluster?.confidence).toBe('high');
    expect(cluster?.evidence.schemaEnum).toEqual(['to_faction', 'to_player', 'forward', 'reverse']);
    expect(cluster?.evidence.affectedRouteCount).toBe(4);
    expect(cluster?.evidence.flaggedRouteCount).toBe(2);
    expect(cluster?.evidence.unflaggedRoutes).toEqual([
      'POST /api/v2/spacemolt_facility/list',
      'POST /api/v2/spacemolt_facility/types',
    ]);
  });

  test('records narrowed enum siblings for shared schema clusters', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };
    const jobAddSchema = {
      ...broadFacilitySchema,
      direction: {
        type: 'string',
        enum: ['forward', 'reverse'],
        description: "Job direction: 'forward' crafts, 'reverse' recycles.",
      },
    };
    const transferSchema = {
      ...broadFacilitySchema,
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player'],
        description: "Transfer direction: 'to_faction' or 'to_player'.",
      },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/job_add', 'job add', jobAddSchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/transfer', 'transfer', transferSchema);

    const findings = findOverbroadSharedSchemas(spec);
    const cluster = findings.find((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'));

    expect(cluster?.evidence.narrowedEnumRoutes).toEqual([
      {
        route: 'POST /api/v2/spacemolt_facility/job_add',
        enum: ['forward', 'reverse'],
      },
      {
        route: 'POST /api/v2/spacemolt_facility/transfer',
        enum: ['to_faction', 'to_player'],
      },
    ]);
    expect(cluster?.evidence.enumGroups).toEqual([
      {
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        routes: [
          'POST /api/v2/spacemolt_facility/build',
          'POST /api/v2/spacemolt_facility/buy_listing',
          'POST /api/v2/spacemolt_facility/list',
        ],
      },
      {
        enum: ['forward', 'reverse'],
        routes: ['POST /api/v2/spacemolt_facility/job_add'],
      },
      {
        enum: ['to_faction', 'to_player'],
        routes: ['POST /api/v2/spacemolt_facility/transfer'],
      },
    ]);
  });

  test('groups shared schema clusters by enum value set instead of enum order', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };
    const permutedBroadFacilitySchema = {
      ...broadFacilitySchema,
      direction: {
        type: 'string',
        enum: ['reverse', 'forward', 'to_player', 'to_faction'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', permutedBroadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/types', 'types', permutedBroadFacilitySchema);

    const findings = findOverbroadSharedSchemas(spec);
    const clusters = findings.filter((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'));

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.evidence.affectedRouteCount).toBe(4);
    expect(clusters[0]?.evidence.flaggedRouteCount).toBe(2);
    expect(clusters[0]?.evidence.unflaggedRoutes).toEqual([
      'POST /api/v2/spacemolt_facility/list',
      'POST /api/v2/spacemolt_facility/types',
    ]);
  });

  test('does not add an aggregate cluster when all broad enum routes are individually flagged', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);

    const findings = findOverbroadSharedSchemas(spec);

    expect(findings.some((f) => f.id.startsWith('overbroad-shared-schema-cluster|'))).toBe(false);
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

  test('buildConsistencyReport summarizes shared schema aggregate clusters', () => {
    const spec = makeMinimalSpec();
    const broadFacilitySchema = {
      direction: {
        type: 'string',
        enum: ['to_faction', 'to_player', 'forward', 'reverse'],
        description: "Transfer direction for 'transfer' action or job direction for 'job_add'.",
      },
      facility_id: { type: 'string' },
      foo: { type: 'string' },
      bar: { type: 'string' },
      baz: { type: 'integer' },
    };

    addPostOperation(spec, '/api/v2/spacemolt_facility/build', 'build', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/buy_listing', 'buy listing', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/list', 'list', broadFacilitySchema);
    addPostOperation(spec, '/api/v2/spacemolt_facility/types', 'types', broadFacilitySchema);

    const report = buildConsistencyReport(spec);

    expect(report.findings.some((f) => f.id.startsWith('overbroad-shared-schema-cluster|direction|'))).toBe(true);
    expect(report.summary.sharedSchemaClusters).toEqual({ total: 1, affectedRoutes: 4 });
  });
});

describe('openapi consistency report formatter', () => {
  test('renders shared schema aggregate evidence', () => {
    const finding: Finding = {
      id: 'overbroad-shared-schema-cluster|direction|POST /api/v2/spacemolt_facility/build',
      kind: 'overbroad-shared-schema',
      severity: 'info',
      field: 'direction',
      message: 'shared request schema exposes broad "direction" enum on 4 routes; 2 are emitted as action findings',
      evidence: {
        schemaEnum: ['to_faction', 'to_player', 'forward', 'reverse'],
        affectedRouteCount: 4,
        flaggedRouteCount: 2,
        unflaggedRoutes: ['POST /api/v2/spacemolt_facility/list', 'POST /api/v2/spacemolt_facility/types'],
        narrowedEnumRoutes: [
          {
            route: 'POST /api/v2/spacemolt_facility/job_add',
            enum: ['forward', 'reverse'],
          },
        ],
      },
      confidence: 'high',
    };
    const report: ConsistencyReport = {
      gameserverVersion: 'v0.test.1',
      generatedAt: '2026-06-29T00:00:00.000Z',
      findings: [finding],
      summary: {
        total: 1,
        byKind: { 'overbroad-shared-schema': 1 },
        bySeverity: { info: 1 },
        sharedSchemaClusters: { total: 1, affectedRoutes: 4 },
      },
    };

    const output = formatConsistencyReport(report);

    expect(output).toContain('Shared schema clusters: 1 cluster, 4 affected routes');
    expect(output).toContain('affected routes: 4');
    expect(output).toContain('individually flagged: 2');
    expect(output).toContain(
      'unflagged affected routes: POST /api/v2/spacemolt_facility/list, POST /api/v2/spacemolt_facility/types',
    );
    expect(output).toContain('narrowed siblings: POST /api/v2/spacemolt_facility/job_add (forward | reverse)');
  });

  test('renders response candidate evidence', () => {
    const report: ConsistencyReport = {
      gameserverVersion: 'v0.test.1',
      generatedAt: '2026-06-29T00:00:00.000Z',
      findings: [
        {
          id: 'missing-response-field-prose|POST /api/v2/spacemolt/repair|refund_amount',
          kind: 'missing-response-field-prose',
          severity: 'medium',
          route: 'POST /api/v2/spacemolt/repair',
          field: 'refund_amount',
          message: 'prose references "refund_amount" but it is absent from the response schema',
          evidence: {
            responseCandidates: ['structuredContent', 'details'],
          },
          confidence: 'medium',
        },
      ],
      summary: {
        total: 1,
        byKind: { 'missing-response-field-prose': 1 },
        bySeverity: { medium: 1 },
      },
    };

    expect(formatConsistencyReport(report)).toContain('response candidates: structuredContent, details');
  });
});

describe('response prose mismatch (base_fare style)', () => {
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

    const findings = findResponseProseMismatches(spec, { includeComponentProse: true });
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

    const findings = findResponseProseMismatches(spec, { includeComponentProse: true });
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

    const findings = findResponseProseMismatches(spec, { includeComponentProse: true });
    const flags = findings.filter(
      (f) => f.kind === 'missing-response-field-prose' && f.schemaName === 'DockResponse' && f.field === 'base_fare',
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
    // biome-ignore lint/suspicious/noExplicitAny: test fixture construction
    (spec.components?.schemas as any).SomeResponse.description = 'Returns base_fare and other things.';

    const findings = findResponseProseMismatches(spec, { includeComponentProse: true });
    const flag = findings.find((f) => f.kind === 'missing-response-field-prose' && f.schemaName === 'SomeResponse');
    expect(flag).toBeDefined();
  });

  test('component prose scan is opt-in', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'SomeResponse', {
      description: 'Returns base_fare and other things.',
      properties: {
        count: { type: 'integer' },
      },
    });

    expect(findResponseProseMismatches(spec)).toHaveLength(0);
    expect(findResponseProseMismatches(spec, { includeComponentProse: true })).toHaveLength(1);
  });

  test('generic response envelopes are informational when component prose is included', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'V2Response', {
      description:
        'Optional structured details about the error. Shape varies by error code. For example, missing_materials includes item details.',
      properties: {
        result: { type: 'string' },
      },
    });

    const finding = findResponseProseMismatches(spec, { includeComponentProse: true }).find(
      (f) => f.schemaName === 'V2Response' && f.field === 'missing_materials',
    );

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('info');
  });

  test('command-specific responses with envelope-like fields stay high severity', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'CreateSessionResponse', {
      description: 'Returns session_secret for clients.',
      properties: {
        session: { type: 'object' },
      },
    });

    const finding = findResponseProseMismatches(spec, { includeComponentProse: true }).find(
      (f) => f.schemaName === 'CreateSessionResponse' && f.field === 'session_secret',
    );

    expect(finding).toBeDefined();
    expect(finding?.severity).toBe('high');
  });
});

describe('context-sensitive extraction and provenance', () => {
  test('extractMentionedFieldNames and rich candidates respect context blocks (ignores unrelated prose)', () => {
    const text = [
      'General chatter here with no payload meaning.',
      '',
      'Use payload to send station_id or use "quoted".',
      '',
      '**Example:** `{"type": "foo", "payload": {"special_key": 1}}`',
      '',
      '**Rate limited:** mutation',
      '',
      'After rate limit notes we may mention stray words like destination but should not synthesize from them.',
    ].join('\n\n');

    const names = extractMentionedFieldNames(text);
    expect(names).toContain('station_id');
    expect(names).toContain('quoted');
    expect(names).toContain('special_key');
    // "destination" appears only after rate-limit note => should be filtered by context
    expect(names).not.toContain('destination');

    const rich = extractResponseFieldCandidatesWithProvenance(text);
    const special = rich.find((c: FieldCandidate) => c.term === 'special_key');
    expect(special?.provenance).toMatch(/JSON in example/);
    const station = rich.find((c: FieldCandidate) => c.term === 'station_id');
    expect(station?.provenance).toMatch(/loose proseKey/);
  });

  test('compound synthesis only in relevant blocks and carries provenance', () => {
    const text =
      'General text about most mission stuff.\n\n**Example:** `{"type":"x"}`\n\nShows the base fare and speed bonus plus ticks remaining.\n\n**Rate limited:** x';
    const rich = extractResponseFieldCandidatesWithProvenance(text);
    const baseFare = rich.find((c) => c.term === 'base_fare');
    const speedBonus = rich.find((c) => c.term === 'speed_bonus');
    const ticksRem = rich.find((c) => c.term === 'ticks_remaining');

    expect(baseFare).toBeTruthy();
    expect(baseFare?.provenance).toMatch(/compound 'base fare'/);
    expect(speedBonus).toBeTruthy();
    expect(ticksRem).toBeTruthy();

    // "most mission" should not synthesize (bad starter + not promoted by positive stem or near-code)
    expect(rich.some((c) => /most_mission|mission_stuff/.test(c.term))).toBe(false);
  });

  test('compound synthesis ignores ordinary prose with unsupported stems', () => {
    const text = [
      'Use query parameters to control limit, clearing, and type filtering.',
      'Use get_system to see available POIs. Consumes fuel based on ship speed and distance.',
      'Current speed reduction is shown as a percentage.',
    ].join('\n\n');

    const fields = extractResponseFieldCandidatesWithProvenance(text).map((c) => c.term);

    expect(fields).not.toContain('control_limit');
    expect(fields).not.toContain('Consumes_fuel');
    expect(fields).not.toContain('Current_speed');
  });

  test('provenance is attached to missing-response-field-prose findings', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'PassengerResponse', {
      // Include a cue-like context + the compound to exercise the path
      description: 'Response payload lists base fare for each passenger.',
      properties: { count: { type: 'integer' } },
    });

    const findings = findResponseProseMismatches(spec, { includeComponentProse: true });
    const f = findings.find((ff) => ff.field === 'base_fare' && ff.schemaName === 'PassengerResponse');
    expect(f).toBeDefined();
    expect(f?.evidence.candidateProvenance).toMatch(/compound|proseKey|JSON/);
  });

  test('prose-field-mismatch findings carry "from JSON in example" provenance', () => {
    const spec = makeMinimalSpec();
    addPostOperation(
      spec,
      '/api/v2/spacemolt/test_cmd',
      '**Example:** `{"type": "test_cmd", "payload": {"mystery": 42}}`',
      { id: { type: 'string' } },
    );
    const findings = findProseFieldMismatches(spec);
    const f = findings.find((ff) => ff.field === 'mystery');
    expect(f?.evidence.candidateProvenance).toBe('from JSON in example');
  });
});

describe('operation response prose mismatch filtering', () => {
  test('operation response scan still reports response prose fields absent from response schema', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/test_response_mismatch';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/test_response_mismatch',
      'Response payload includes base fare for audit.',
      { id: { type: 'string' } },
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('base_fare');
  });

  test('operation response scan captures comma-separated field lists and suppresses present fields', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/get_cargo';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/get_cargo',
      'Returns cargo items with resolved names and sizes. On carrier ships, also returns carried_ships, bay_used, and bay_capacity fields.',
      {},
      {
        type: 'object',
        properties: {
          carried_ships: { type: 'array' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('carried_ships');
    expect(fields).toContain('bay_used');
    expect(fields).toContain('bay_capacity');
  });

  test('operation response scan treats display verbs as response context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/list_station_passengers';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/list_station_passengers',
      "Shows each passenger's base fare. Also reports fare_surge for the station.",
      {},
      {
        type: 'object',
        properties: {
          fare_surge: { type: 'number' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('base_fare');
    expect(fields).not.toContain('fare_surge');
  });

  test('operation response scan ignores action catalogs and request examples', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_facility/job_add';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_facility/job_add',
      [
        "Actions: types, build, job_add, job_list, set_access, set_name. Call with no action or action 'help' for full documentation. PRODUCTION JOBS: queue work with 'job_add' (recipe_id, quantity, facility_id; direction=reverse to recycle).",
        '',
        '**Example:** `{"type": "facility", "payload": {"action": "types"}}`',
      ].join('\n'),
      {
        action: { type: 'string' },
        facility_id: { type: 'string' },
        recipe_id: { type: 'string' },
        quantity: { type: 'integer' },
        direction: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          queued: { type: 'boolean' },
          job_id: { type: 'string' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toEqual([]);
  });

  test('operation response scan does not treat request example wrapper keys or command names as response fields', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/list_passengers';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/list_passengers',
      [
        'Shows base fare, speed bonus, and ticks remaining for passengers.',
        '',
        '**Example:** `{"type": "list_passengers"}`',
      ].join('\n'),
      {},
      {
        type: 'object',
        properties: {
          passengers: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                base_fare: { type: 'integer' },
                speed_bonus: { type: 'integer' },
                ticks_remaining: { type: 'integer' },
              },
            },
          },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toEqual([]);
  });

  test('operation response scan trims inline action catalogs from mixed prose blocks', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_facility/station_set_name';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_facility/station_set_name',
      [
        "Must be docked at a station your faction owns. Action 'info' shows the current configuration. Outposts support only 'info', 'set_name', and 'set_description'. Actions: set_name (name), set_description (description), set_public (public: true/false), set_refuel_price (price per fuel unit), allow_player/remove_player/ban/unban (player: id or username).",
        '',
        '**Example:** `{"type": "station", "payload": {"action": "info"}}`',
      ].join('\n'),
      {
        name: { type: 'string' },
        public: { type: 'boolean' },
        player: { type: 'string' },
        price: { type: 'number' },
      },
      {
        type: 'object',
        properties: {
          current_configuration: { type: 'object' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toEqual([]);
  });

  test('operation response scan ignores command cross-references in prose', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/unload_passenger';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/unload_passenger',
      'Pass "all" to put every passenger off at once. Use list_passengers to see names before unloading.',
      { id: { type: 'string' } },
      {
        type: 'object',
        properties: {
          delivered: {
            type: 'array',
            items: { type: 'object', properties: { passenger_id: { type: 'string' } } },
          },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toEqual([]);
  });

  test('operation response scan ignores known command cross-references from route names', () => {
    const spec = makeMinimalSpec();
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/get_missions',
      'Returns available missions.',
      {},
      { type: 'object', properties: { missions: { type: 'array' } } },
    );
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_ship/browse_ships',
      'Returns listed ships.',
      {},
      { type: 'object', properties: { listings: { type: 'array' } } },
    );
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_ship/commission_ship',
      'Returns commission state.',
      {},
      { type: 'object', properties: { commission_id: { type: 'string' } } },
    );
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/accept_mission',
      'Use get_missions to see available missions and their IDs.',
      { mission_id: { type: 'string' } },
      { type: 'object', properties: { accepted: { type: 'boolean' } } },
    );
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/get_ships',
      'Returns all ship classes. Use browse_ships or commission_ship to purchase.',
      {},
      { type: 'object', properties: { ships: { type: 'array' } } },
    );

    const fields = findResponseProseMismatches(spec)
      .filter(
        (f) =>
          f.kind === 'missing-response-field-prose' &&
          (f.route === 'POST /api/v2/spacemolt/accept_mission' || f.route === 'POST /api/v2/spacemolt/get_ships'),
      )
      .map((f) => f.field);

    expect(fields).toEqual([]);
  });

  test('operation response scan ignores accepts request prose while keeping response prose', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/find_route';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/search_systems',
      'Returns matching systems.',
      { query: { type: 'string' } },
      { type: 'object', properties: { systems: { type: 'array' } } },
    );
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/find_route',
      'Accepts a system ID, POI ID, or base ID. Use search_systems to find system IDs. Response includes fuel_per_jump and estimated_fuel for trip planning.',
      { target_system: { type: 'string' } },
      { type: 'object', properties: { fuel_per_jump: { type: 'integer' } } },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toEqual(['estimated_fuel']);
  });

  test('operation response scan treats request-only prose as request context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_market/create_buy_order';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_market/create_buy_order',
      "Use item_id 'fuel' to post a buy order. Sort previews with sort_by 'price_asc'. Credits are escrowed before fills.",
      {
        item_id: { type: 'string' },
        sort_by: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);
    const requestFields = findProseFieldMismatches(spec)
      .filter((f) => f.kind === 'prose-field-mismatch' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('item_id');
    expect(fields).not.toContain('fuel');
    expect(fields).not.toContain('buy_order');
    expect(fields).not.toContain('price_asc');
    expect(requestFields).not.toContain('fuel');
    expect(requestFields).not.toContain('buy_order');
    expect(requestFields).not.toContain('price_asc');
  });

  test('prose-field analyzer reports explicit request prose absent from request schema', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_faction/post_mission';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_faction/post_mission',
      'Pass target_base_id when posting a delivery mission.',
      {
        mission_type: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
        },
      },
    );

    const requestFindings = findProseFieldMismatches(spec).filter(
      (f) => f.kind === 'prose-field-mismatch' && f.route === route,
    );
    const requestFinding = requestFindings.find((f) => f.field === 'target_base_id');
    const responseFields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(requestFinding).toBeDefined();
    expect(requestFinding?.confidence).toBe('medium');
    expect(requestFinding?.severity).toBe('medium');
    expect(requestFinding?.evidence.candidateProvenance).toContain('request context');
    expect(requestFindings.map((f) => f.field)).toEqual(['target_base_id']);
    expect(responseFields).not.toContain('target_base_id');
  });

  test('operation response scan keeps use prose for field-like response terms', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/test_use_field_prose';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/test_use_field_prose',
      'Use base_fare to audit pricing.',
      {},
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('base_fare');
  });

  test('operation response scan keeps command-prefix field-like response terms', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/test_repair_cost_prose';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/test_repair_cost_prose',
      'Use repair_cost to audit pricing.',
      {},
      {
        type: 'object',
        properties: {
          count: { type: 'integer' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('repair_cost');
  });

  test('operation response scan ignores quoted example values', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/uninstall_mod';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/uninstall_mod',
      "module_id accepts a module instance ID or a module type ID (e.g. 'pulse_laser_i'). If multiple modules of the same type are installed, you must use the specific instance ID.",
      { id: { type: 'string' } },
      {
        type: 'object',
        properties: {
          uninstalled: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('pulse_laser_i');
  });

  test('operation response scan ignores header-name prose compounds', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/session';
    addPostOperationWithResponse(
      spec,
      '/api/v2/session',
      'Creates a new API session. Returns a session ID that must be included as the `X-Session-Id` header on all subsequent calls.',
      {},
      {
        type: 'object',
        properties: {
          session: {
            type: 'object',
            properties: {
              id: { type: 'string' },
            },
          },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('session_ID');
    expect(fields).not.toContain('Session_Id');
  });

  test('operation response scan treats permission prose as neutral context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_faction/create_role';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_faction/create_role',
      'Requires `manage_roles` permission. Priority must exceed the new role priority.',
      {
        name: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          role: { type: 'object' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('manage_roles');
  });

  test('operation response scan treats help route tool names as neutral context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt_auth/help';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt_auth/help',
      'Returns documentation for all actions available in spacemolt_auth (same as GET). Pass an optional topic in the body for focused help.',
      {
        topic: { type: 'string' },
      },
      {
        type: 'object',
        properties: {
          actions: { type: 'array' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('spacemolt_auth');
    expect(fields).not.toContain('topic');
  });

  test('operation response scan checks route-bound details fields and records candidates', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/repair';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/repair',
      'Response includes repair_cost and refund_amount for accounting.',
      {},
      {
        type: 'object',
        properties: {
          structuredContent: {
            type: 'object',
            properties: {
              details: {
                type: 'object',
                properties: {
                  repair_cost: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    );

    const findings = findResponseProseMismatches(spec).filter(
      (f) => f.kind === 'missing-response-field-prose' && f.route === route,
    );
    const fields = findings.map((f) => f.field);
    const refundFinding = findings.find((f) => f.field === 'refund_amount');

    expect(fields).not.toContain('repair_cost');
    expect(fields).toContain('refund_amount');
    expect(refundFinding?.evidence.responseCandidates).toEqual(['structuredContent', 'details']);
  });

  test('operation response scan suppresses known error code terms', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/get_status';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/get_status',
      'Returns status. session_required means the X-Session-Id header is missing.',
      {},
      {
        type: 'object',
        properties: {
          status: { type: 'object' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('session_required');
  });

  test('operation response scan keeps known error terms in response-field context', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/craft';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/craft',
      'Response includes missing_materials details for failed crafting attempts.',
      {},
      {
        type: 'object',
        properties: {
          crafted: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).toContain('missing_materials');
  });

  test('operation response scan does not report error-response prose as missing 200-response fields', () => {
    const spec = makeMinimalSpec();
    const route = 'POST /api/v2/spacemolt/craft';
    addPostOperationWithResponse(
      spec,
      '/api/v2/spacemolt/craft',
      'The error response details may include missing_materials when the station lacks inputs.',
      {
        id: { type: 'string' },
        quantity: { type: 'integer' },
      },
      {
        type: 'object',
        properties: {
          queued: { type: 'boolean' },
        },
      },
    );

    const fields = findResponseProseMismatches(spec)
      .filter((f) => f.kind === 'missing-response-field-prose' && f.route === route)
      .map((f) => f.field);

    expect(fields).not.toContain('missing_materials');
  });
});

describe('memoization of schema walks', () => {
  test('repeated walks via public report API are stable (memo does not alter results)', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'MemoResponse', {
      description: 'Contains base_fare in nested items.',
      properties: {
        list: { items: { properties: { base_fare: { type: 'integer' } } } },
      },
    });

    const r1 = findResponseProseMismatches(spec, { includeComponentProse: true });
    const r2 = findResponseProseMismatches(spec, { includeComponentProse: true });
    expect(r1.length).toBe(r2.length);
    // If base_fare is present it should never produce a missing-prose flag
    const baseFlags = [...r1, ...r2].filter((f) => f.field === 'base_fare');
    expect(baseFlags.length).toBe(0);
  });
});
