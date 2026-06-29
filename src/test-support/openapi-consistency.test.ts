import { describe, expect, test } from 'bun:test';
import {
  buildConsistencyReport,
  extractDocExamples,
  extractMentionedFieldNames,
  extractResponseFieldCandidatesWithProvenance,
  type FieldCandidate,
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

type FutureSharedSchemaEvidence = {
  affectedRouteCount?: number;
  flaggedRouteCount?: number;
  unflaggedRoutes?: string[];
  narrowedEnumRoutes?: Array<{ route: string; enum: string[] }>;
  enumGroups?: Array<{ enum: string[]; routes: string[] }>;
};

function sharedSchemaEvidence(finding: { evidence: unknown } | undefined): FutureSharedSchemaEvidence | undefined {
  return finding?.evidence as FutureSharedSchemaEvidence | undefined;
}

function futureConsistencyReport(report: unknown): Parameters<typeof formatConsistencyReport>[0] {
  return report as Parameters<typeof formatConsistencyReport>[0];
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
    expect(sharedSchemaEvidence(cluster)?.affectedRouteCount).toBe(4);
    expect(sharedSchemaEvidence(cluster)?.flaggedRouteCount).toBe(2);
    expect(sharedSchemaEvidence(cluster)?.unflaggedRoutes).toEqual([
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

    expect(sharedSchemaEvidence(cluster)?.narrowedEnumRoutes).toEqual([
      {
        route: 'POST /api/v2/spacemolt_facility/job_add',
        enum: ['forward', 'reverse'],
      },
      {
        route: 'POST /api/v2/spacemolt_facility/transfer',
        enum: ['to_faction', 'to_player'],
      },
    ]);
    expect(sharedSchemaEvidence(cluster)?.enumGroups).toEqual([
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
});

describe('openapi consistency report formatter', () => {
  test('renders shared schema aggregate evidence', () => {
    const output = formatConsistencyReport(
      futureConsistencyReport({
        gameserverVersion: 'v0.test.1',
        generatedAt: '2026-06-29T00:00:00.000Z',
        findings: [
          {
            id: 'overbroad-shared-schema-cluster|direction|POST /api/v2/spacemolt_facility/build',
            kind: 'overbroad-shared-schema',
            severity: 'info',
            field: 'direction',
            message: 'shared request schema exposes broad "direction" enum on 4 routes; 2 are emitted as action findings',
            evidence: {
              schemaEnum: ['to_faction', 'to_player', 'forward', 'reverse'],
              affectedRouteCount: 4,
              flaggedRouteCount: 2,
              unflaggedRoutes: [
                'POST /api/v2/spacemolt_facility/list',
                'POST /api/v2/spacemolt_facility/types',
              ],
              narrowedEnumRoutes: [
                {
                  route: 'POST /api/v2/spacemolt_facility/job_add',
                  enum: ['forward', 'reverse'],
                },
              ],
            },
            confidence: 'high',
          },
        ],
        summary: {
          total: 1,
          byKind: { 'overbroad-shared-schema': 1 },
          bySeverity: { info: 1 },
          sharedSchemaClusters: { total: 1, affectedRoutes: 4 },
        },
      }),
    );

    expect(output).toContain('Shared schema clusters: 1 cluster, 4 affected routes');
    expect(output).toContain('affected routes: 4');
    expect(output).toContain('individually flagged: 2');
    expect(output).toContain(
      'unflagged affected routes: POST /api/v2/spacemolt_facility/list, POST /api/v2/spacemolt_facility/types',
    );
    expect(output).toContain('narrowed siblings: POST /api/v2/spacemolt_facility/job_add (forward | reverse)');
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

    const findings = findResponseProseMismatches(spec);
    const flag = findings.find((f) => f.kind === 'missing-response-field-prose' && f.schemaName === 'SomeResponse');
    expect(flag).toBeDefined();
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

  test('provenance is attached to missing-response-field-prose findings', () => {
    const spec = makeMinimalSpec();
    addComponentSchema(spec, 'PassengerResponse', {
      // Include a cue-like context + the compound to exercise the path
      description: 'Response payload lists base fare for each passenger.',
      properties: { count: { type: 'integer' } },
    });

    const findings = findResponseProseMismatches(spec);
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

    const r1 = findResponseProseMismatches(spec);
    const r2 = findResponseProseMismatches(spec);
    expect(r1.length).toBe(r2.length);
    // If base_fare is present it should never produce a missing-prose flag
    const baseFlags = [...r1, ...r2].filter((f) => f.field === 'base_fare');
    expect(baseFlags.length).toBe(0);
  });
});
