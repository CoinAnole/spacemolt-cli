import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadPassengerFixture } from '../display/passenger.fixtures';
import {
  compareFixtureAgainstResponseCandidates,
  compareFixtureToSchema,
  compareHighValueFixturesToSpec,
  DEFAULT_SCHEMA_BASELINE_PATH,
  divergenceSignature,
  filterBlockingDivergences,
  formatComparisonReport,
  type JsonSchema,
  type OpenApiSpec,
} from './fixture-schema-compare';
import {
  assertGoldenFileSet,
  assertGoldenOutput,
  assertGoldenUpdateAllowed,
  expectedGoldenFiles,
  goldenFilePath,
  normalizeOutputLines,
  shouldUpdateGolden,
  validateGoldenOutput,
} from './output-golden';

function responseSpecWithSchemas(schemas: Record<string, JsonSchema>, detailsRef?: string): OpenApiSpec {
  return {
    paths: {
      '/api/v2/sample/action': {
        post: {
          responses: {
            '200': {
              content: {
                'application/json': {
                  schema: {
                    allOf: [
                      { $ref: '#/components/schemas/V2Response' },
                      {
                        type: 'object',
                        properties: {
                          structuredContent: detailsRef
                            ? {
                                allOf: [
                                  { $ref: '#/components/schemas/V2GameState' },
                                  {
                                    type: 'object',
                                    properties: {
                                      details: { $ref: detailsRef },
                                    },
                                  },
                                ],
                              }
                            : { $ref: '#/components/schemas/V2GameState' },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        V2Response: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            structuredContent: { type: 'object' },
          },
        },
        V2GameState: {
          type: 'object',
          properties: {
            player: { type: 'object' },
            ship: { type: 'object' },
            location: { type: 'object' },
            details: { type: 'object' },
          },
        },
        ...schemas,
      },
    },
  };
}

function discriminatedResponseSpec(): OpenApiSpec {
  return {
    paths: {},
    components: {
      schemas: {
        CommandResponse: {
          discriminator: {
            propertyName: 'kind',
            mapping: {
              alpha: '#/components/schemas/AlphaResponse',
              beta: '#/components/schemas/BetaResponse',
            },
          },
          oneOf: [{ $ref: '#/components/schemas/AlphaResponse' }, { $ref: '#/components/schemas/BetaResponse' }],
        },
        AlphaResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string' },
            alpha: { type: 'string' },
            beta: { type: 'string' },
          },
        },
        BetaResponse: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string' },
            beta: { type: 'string' },
          },
        },
      },
    },
  };
}

const sampleContext = {
  label: 'sample',
  command: 'sample',
  apiRoute: 'POST /api/v2/sample/action',
};

describe('output golden test support', () => {
  test('schema comparison prefers the fixture discriminator over a structurally cheaper branch', () => {
    const spec = discriminatedResponseSpec();
    const comparison = compareFixtureAgainstResponseCandidates(
      { kind: 'beta', alpha: 'structurally misleading', beta: 'selected' },
      {
        ...sampleContext,
        spec,
        responseSchema: { $ref: '#/components/schemas/CommandResponse' },
      },
    );

    expect(comparison.primarySchemaName).toBe('BetaResponse');
    expect(comparison.selectionReason).toBe('discriminator');
  });

  test('schema comparison falls back to structural scoring for an unknown discriminator value', () => {
    const spec = discriminatedResponseSpec();
    const comparison = compareFixtureAgainstResponseCandidates(
      { kind: 'unknown', alpha: 'selected structurally' },
      {
        ...sampleContext,
        spec,
        responseSchema: { $ref: '#/components/schemas/CommandResponse' },
      },
    );

    expect(comparison.primarySchemaName).toBe('AlphaResponse');
    expect(comparison.selectionReason).toBe('best-score');
  });

  test('fixture schema baseline path is exported for report tooling', () => {
    expect(path.basename(DEFAULT_SCHEMA_BASELINE_PATH)).toBe('fixture-schema-baseline.json');
  });

  test('storage inventory fixtures compare against the storage view response schema', () => {
    const comparisons = compareHighValueFixturesToSpec({ only: ['storage'] });
    const byLabel = new Map(comparisons.map((comparison) => [comparison.label, comparison]));

    expect(byLabel.get('storage')?.apiRoute).toBe('POST /api/v2/spacemolt_storage/view');
    expect(byLabel.get('storage_view')?.apiRoute).toBe('POST /api/v2/spacemolt_storage/view');
    expect(byLabel.get('storage')?.primarySchemaName).toBe('ViewStorageResponse');
    expect(byLabel.get('storage_view')?.primarySchemaName).toBe('ViewStorageResponse');
  });

  test('standalone route fixtures are excluded from OpenAPI schema comparison', () => {
    expect(compareHighValueFixturesToSpec({ only: ['get_mobile_base'] })).toEqual([]);
  });

  test('schema divergence signatures are stable and sortable', () => {
    expect(
      divergenceSignature({
        label: 'get_status',
        command: 'get_status',
        path: 'ship.name',
        kind: 'extra-in-fixture',
      }),
    ).toBe('get_status|get_status|extra-in-fixture|ship.name');
  });

  test('blocking schema divergences exclude extra-in-schema coverage gaps', () => {
    const blocking = filterBlockingDivergences([
      {
        label: 'sample',
        command: 'sample',
        apiRoute: 'POST /api/v2/sample',
        summary: '',
        isPartialExample: false,
        divergences: [
          { path: 'old_field', kind: 'extra-in-fixture', message: 'field not declared' },
          { path: 'new_field', kind: 'extra-in-schema', message: 'not exercised' },
        ],
      },
    ]);

    expect(blocking.map((entry) => divergenceSignature(entry))).toEqual(['sample|sample|extra-in-fixture|old_field']);
  });

  test('fixture schema report matches load_passenger against LoadPassengersResponse details', () => {
    const [comparison] = compareHighValueFixturesToSpec({ only: ['load_passenger'] });

    expect(comparison?.command).toBe('load_passenger');
    expect(comparison?.primarySchemaName).toBe('LoadPassengersResponse');
    expect(comparison?.comparedAgainst).toBe('details');
    expect(comparison?.selectionReason).toBe('best-score');
    expect(comparison?.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain('extra-in-fixture:loaded');
    expect(comparison?.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain('extra-in-fixture:count');
    expect(comparison?.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain('extra-in-fixture:total_fare');
    expect(comparison?.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain(
      'extra-in-fixture:skipped_unfunded',
    );
  });

  test('fixture schema report names selected details schema and ambiguity diagnostics', () => {
    const detailsReport = formatComparisonReport([
      {
        label: 'load_passenger',
        command: 'load_passenger',
        apiRoute: 'POST /api/v2/spacemolt/load_passenger',
        primarySchemaName: 'LoadPassengersResponse',
        comparedAgainst: 'details',
        selectionReason: 'best-score',
        candidateScores: [
          {
            label: 'details',
            primarySchemaName: 'LoadPassengersResponse',
            score: 0,
            summary: 'no structural divergences detected',
          },
        ],
        divergences: [],
        summary: 'no structural divergences detected',
        isPartialExample: false,
      },
      {
        label: 'ambiguous_sample',
        command: 'sample',
        apiRoute: 'POST /api/v2/sample/action',
        primarySchemaName: 'A',
        comparedAgainst: 'ambiguous',
        selectionReason: 'ambiguous',
        candidateScores: [
          {
            label: 'structuredContent',
            primarySchemaName: 'A',
            score: 0,
            summary: 'no structural divergences detected',
          },
          { label: 'details', primarySchemaName: 'B', score: 0, summary: 'no structural divergences detected' },
        ],
        divergences: [{ path: '', kind: 'schema-target-ambiguous', message: 'fixture matched multiple candidates' }],
        summary: 'ambiguous schema target',
        isPartialExample: true,
      },
    ]);

    expect(detailsReport).toContain(
      'primary schema: LoadPassengersResponse (fixture matched structuredContent.details)',
    );
    expect(detailsReport).toContain('summary: ambiguous schema target');
    expect(detailsReport).toContain('Schema target ambiguity:');
    expect(detailsReport).toContain('candidate scores:');
    expect(detailsReport).toContain('structuredContent -> A: 0');
    expect(detailsReport).toContain('details -> B: 0');
  });

  test('schema candidate scoring chooses details for a details-shaped fixture without heuristic markers', () => {
    const spec = responseSpecWithSchemas(
      {
        ActionDetails: {
          type: 'object',
          required: ['message', 'loaded', 'count'],
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            loaded: { type: 'array', items: { type: 'object' } },
            count: { type: 'integer' },
            total_fare: { type: 'integer' },
            skipped_unfunded: { type: 'integer' },
          },
        },
      },
      '#/components/schemas/ActionDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(loadPassengerFixture, {
      ...sampleContext,
      spec,
      responseSchema: {
        allOf: [
          { $ref: '#/components/schemas/V2GameState' },
          {
            type: 'object',
            properties: {
              details: { $ref: '#/components/schemas/ActionDetails' },
            },
          },
        ],
      },
      primarySchemaName: 'V2GameState',
    });

    expect(comparison.primarySchemaName).toBe('ActionDetails');
    expect(comparison.comparedAgainst).toBe('details');
    expect(comparison.selectionReason).toBe('best-score');
    expect(comparison.summary).toBe('no structural divergences detected');
  });

  test('explicit schemaTarget structuredContent overrides a better details score', () => {
    const spec = responseSpecWithSchemas(
      {
        ActionDetails: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
          },
        },
      },
      '#/components/schemas/ActionDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      { message: 'ok' },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          allOf: [
            { $ref: '#/components/schemas/V2GameState' },
            {
              type: 'object',
              properties: {
                details: { $ref: '#/components/schemas/ActionDetails' },
              },
            },
          ],
        },
        primarySchemaName: 'V2GameState',
        explicitTarget: 'structuredContent',
      },
    );

    expect(comparison.comparedAgainst).toBe('structuredContent');
    expect(comparison.primarySchemaName).toBe('V2GameState');
    expect(comparison.selectionReason).toBe('explicit-target');
    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('extra-in-fixture:message');
  });

  test('schema candidate ties are reported as ambiguity instead of definitive drift', () => {
    const spec = responseSpecWithSchemas(
      {
        ActionDetails: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
      '#/components/schemas/ActionDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      { message: 'ok' },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            details: { $ref: '#/components/schemas/ActionDetails' },
          },
        },
        primarySchemaName: 'StructuredWithMessage',
      },
    );

    expect(comparison.selectionReason).toBe('ambiguous');
    expect(comparison.comparedAgainst).toBe('ambiguous');
    expect(comparison.divergences).toEqual([
      expect.objectContaining({
        kind: 'schema-target-ambiguous',
        path: '',
      }),
    ]);
    expect(filterBlockingDivergences([comparison])).toEqual([]);
  });

  test('non-zero schema candidate ties keep blocking divergence evidence', () => {
    const spec = responseSpecWithSchemas(
      {
        ActionDetails: {
          type: 'object',
          additionalProperties: false,
          properties: {
            known: { type: 'string' },
            details: { type: 'object' },
          },
        },
      },
      '#/components/schemas/ActionDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      { known: 'ok', unexpected: true },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            known: { type: 'string' },
            details: { $ref: '#/components/schemas/ActionDetails' },
          },
        },
        primarySchemaName: 'StructuredWithKnown',
      },
    );

    expect(comparison.selectionReason).toBe('ambiguous');
    expect(comparison.comparedAgainst).toBe('ambiguous');
    expect(comparison.divergences.map((d) => d.kind)).toContain('schema-target-ambiguous');
    expect(filterBlockingDivergences([comparison]).map((d) => `${d.kind}:${d.path}`)).toContain(
      'extra-in-fixture:unexpected',
    );
  });

  test('schema candidate scoring can select a matching oneOf details branch', () => {
    const spec = responseSpecWithSchemas(
      {
        LoadedPassengers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            loaded: { type: 'array', items: { type: 'object' } },
            count: { type: 'integer' },
          },
        },
        NoPassengers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        PassengerDetails: {
          oneOf: [{ $ref: '#/components/schemas/LoadedPassengers' }, { $ref: '#/components/schemas/NoPassengers' }],
        },
      },
      '#/components/schemas/PassengerDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      { message: 'Loaded passengers.', loaded: [], count: 0 },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          allOf: [
            { $ref: '#/components/schemas/V2GameState' },
            {
              type: 'object',
              properties: {
                details: { $ref: '#/components/schemas/PassengerDetails' },
              },
            },
          ],
        },
        primarySchemaName: 'V2GameState',
      },
    );

    expect(comparison.primarySchemaName).toBe('LoadedPassengers');
    expect(comparison.comparedAgainst).toBe('details');
    expect(comparison.selectionReason).toBe('best-score');
    expect(comparison.summary).toBe('no structural divergences detected');
  });

  test('schema candidate scoring can select a matching anyOf details branch behind an empty wrapper', () => {
    const spec = responseSpecWithSchemas(
      {
        LoadedPassengers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            loaded: { type: 'array', items: { type: 'object' } },
            count: { type: 'integer' },
          },
        },
        NoPassengers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            reason: { type: 'string' },
          },
        },
        PassengerDetails: {
          type: 'object',
          properties: {},
          anyOf: [{ $ref: '#/components/schemas/LoadedPassengers' }, { $ref: '#/components/schemas/NoPassengers' }],
        },
      },
      '#/components/schemas/PassengerDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      { message: 'Loaded passengers.', loaded: [], count: 0 },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          allOf: [
            { $ref: '#/components/schemas/V2GameState' },
            {
              type: 'object',
              properties: {
                details: { $ref: '#/components/schemas/PassengerDetails' },
              },
            },
          ],
        },
        primarySchemaName: 'V2GameState',
      },
    );

    expect(comparison.primarySchemaName).toBe('LoadedPassengers');
    expect(comparison.comparedAgainst).toBe('details');
    expect(comparison.selectionReason).toBe('best-score');
    expect(comparison.summary).toBe('no structural divergences detected');
  });

  test('schema candidate scoring prefers declared fixture keys over fewer missing partial fields', () => {
    const spec = responseSpecWithSchemas({
      MapList: {
        type: 'object',
        additionalProperties: false,
        required: ['systems', 'total_count'],
        properties: {
          systems: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: [
                'system_id',
                'name',
                'position',
                'connections',
                'visited',
                'visited_at',
                'poi_count',
                'online',
              ],
              properties: {
                system_id: { type: 'string' },
                name: { type: 'string' },
                position: { type: 'object' },
                connections: { type: 'array', items: { type: 'string' } },
                visited: { type: 'boolean' },
                visited_at: { type: 'string' },
                poi_count: { type: 'integer' },
                online: { type: 'integer' },
              },
            },
          },
          total_count: { type: 'integer' },
        },
      },
      SingleSystem: {
        type: 'object',
        additionalProperties: false,
        required: ['system_id', 'name', 'position', 'connections', 'visited', 'visited_at', 'poi_count', 'online'],
        properties: {
          system_id: { type: 'string' },
          name: { type: 'string' },
          position: { type: 'object' },
          connections: { type: 'array', items: { type: 'string' } },
          visited: { type: 'boolean' },
          visited_at: { type: 'string' },
          poi_count: { type: 'integer' },
          online: { type: 'integer' },
        },
      },
    });

    const comparison = compareFixtureAgainstResponseCandidates(
      {
        systems: [
          { system_id: 'sol', name: 'Sol' },
          { system_id: 'alpha_centauri', name: 'Alpha Centauri' },
        ],
        total_count: 2,
      },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          oneOf: [{ $ref: '#/components/schemas/MapList' }, { $ref: '#/components/schemas/SingleSystem' }],
        },
        primarySchemaName: 'MapResponse',
      },
    );

    expect(comparison.primarySchemaName).toBe('MapList');
    expect(comparison.comparedAgainst).toBe('structuredContent');
    expect(comparison.selectionReason).toBe('best-score');
    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain('extra-in-fixture:systems');
    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).not.toContain('extra-in-fixture:total_count');
  });

  test('explicit schemaTarget details scores oneOf branches instead of choosing the first branch', () => {
    const spec = responseSpecWithSchemas(
      {
        DeliveredPassenger: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            delivered: { type: 'boolean' },
          },
        },
        UnloadedPassengers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            message: { type: 'string' },
            delivered: { type: 'array', items: { type: 'object' } },
            stranded: { type: 'array', items: { type: 'object' } },
            fare_collected: { type: 'integer' },
          },
        },
        UnloadPassengerDetails: {
          oneOf: [
            { $ref: '#/components/schemas/DeliveredPassenger' },
            { $ref: '#/components/schemas/UnloadedPassengers' },
          ],
        },
      },
      '#/components/schemas/UnloadPassengerDetails',
    );

    const comparison = compareFixtureAgainstResponseCandidates(
      {
        message: 'Unloaded passengers.',
        delivered: [],
        stranded: [],
        fare_collected: 0,
      },
      {
        ...sampleContext,
        spec,
        responseSchema: {
          allOf: [
            { $ref: '#/components/schemas/V2GameState' },
            {
              type: 'object',
              properties: {
                details: { $ref: '#/components/schemas/UnloadPassengerDetails' },
              },
            },
          ],
        },
        primarySchemaName: 'V2GameState',
        explicitTarget: 'details',
      },
    );

    expect(comparison.selectionReason).toBe('explicit-target');
    expect(comparison.comparedAgainst).toBe('details');
    expect(comparison.primarySchemaName).toBe('UnloadedPassengers');
    expect(comparison.summary).toBe('no structural divergences detected');
  });

  test('schema comparison follows nested refs inside array items', () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          Row: {
            type: 'object',
            required: ['id'],
            additionalProperties: false,
            properties: { id: { type: 'string' } },
          },
        },
      },
    };
    const schema = {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { $ref: '#/components/schemas/Row' } },
      },
    };

    const comparison = compareFixtureToSchema({ rows: [{ id: 'row-1', extra: true }] }, schema, {
      label: 'sample',
      command: 'sample',
      apiRoute: 'POST /api/v2/sample',
      spec,
    });

    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('extra-in-fixture:rows[0].extra');
  });

  test('schema comparison checks required fields inside resolved array item refs', () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          Row: {
            type: 'object',
            required: ['id'],
            properties: { id: { type: 'string' } },
          },
        },
      },
    };
    const schema = {
      type: 'object',
      properties: {
        rows: { type: 'array', items: { $ref: '#/components/schemas/Row' } },
      },
    };

    const comparison = compareFixtureToSchema({ rows: [{}] }, schema, {
      label: 'sample',
      command: 'sample',
      apiRoute: 'POST /api/v2/sample',
      spec,
    });

    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('required-missing:rows[0].id');
  });

  test('schema comparison preserves scalar constraints through nested allOf refs', () => {
    const spec = {
      paths: {},
      components: {
        schemas: {
          Id: { type: 'integer' },
        },
      },
    };
    const schema = {
      type: 'object',
      properties: {
        id: { allOf: [{ $ref: '#/components/schemas/Id' }] },
      },
    };

    const comparison = compareFixtureToSchema({ id: 'not-a-number' }, schema, {
      label: 'sample',
      command: 'sample',
      apiRoute: 'POST /api/v2/sample',
      spec,
    });

    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('type-mismatch:id');
  });

  test('schema comparison merges duplicate allOf property schemas', () => {
    const schema = {
      allOf: [
        {
          type: 'object',
          properties: {
            id: { type: 'integer' },
          },
        },
        {
          type: 'object',
          properties: {
            id: { description: 'Stable row id' },
          },
        },
      ],
    };

    const comparison = compareFixtureToSchema({ id: 'not-a-number' }, schema, {
      label: 'sample',
      command: 'sample',
      apiRoute: 'POST /api/v2/sample',
      spec: { paths: {} },
    });

    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('type-mismatch:id');
  });

  test('schema comparison treats nullable schema types as allowing null', () => {
    const comparison = compareFixtureToSchema(
      { name: null },
      { type: 'object', properties: { name: { type: ['string', 'null'] } } },
      { label: 'sample', command: 'sample', apiRoute: 'POST /api/v2/sample' },
    );

    expect(comparison.divergences.filter((d) => d.kind === 'type-mismatch')).toEqual([]);
  });

  test('schema comparison rejects null when schema type is not nullable', () => {
    const comparison = compareFixtureToSchema(
      { name: null },
      { type: 'object', properties: { name: { type: 'string' } } },
      { label: 'sample', command: 'sample', apiRoute: 'POST /api/v2/sample' },
    );

    expect(comparison.divergences.map((d) => `${d.kind}:${d.path}`)).toContain('type-mismatch:name');
  });

  test('normalizes buffered output with newlines between captured writes', () => {
    expect(normalizeOutputLines(['alpha', 'beta', 'gamma'])).toBe('alpha\nbeta\ngamma\n');
    expect(normalizeOutputLines([])).toBe('');
  });

  test('validates JSON stdout when requested', () => {
    expect(validateGoldenOutput({ stdout: '{"ok":true}', stderr: '' }, { stdoutFormat: 'json' })).toEqual([]);
    expect(validateGoldenOutput({ stdout: '{"ok":', stderr: '' }, { stdoutFormat: 'json' })).toEqual([
      'stdout is not valid JSON',
    ]);
    expect(validateGoldenOutput({ stdout: '', stderr: '' }, { stdoutFormat: 'json' })).toEqual([
      'stdout is not valid JSON',
    ]);
  });

  test('validates expected YAML top-level keys without parsing YAML', () => {
    expect(
      validateGoldenOutput(
        { stdout: '\nplayer:\n  username: Marlowe\nship:\n  fuel: 80', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player', 'ship'] },
      ),
    ).toEqual([]);
    expect(
      validateGoldenOutput(
        { stdout: '\nplayer:\n  username: Marlowe', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player', 'ship'] },
      ),
    ).toEqual(['YAML stdout is missing top-level key "ship"']);
    expect(
      validateGoldenOutput(
        { stdout: '  player:\n    username: Marlowe', stderr: '' },
        { stdoutFormat: 'yaml', expectedYamlKeys: ['player'] },
      ),
    ).toEqual(['YAML stdout is missing top-level key "player"']);
  });

  test('detects fallback and accidental diagnostic tokens', () => {
    expect(validateGoldenOutput({ stdout: '\n=== Response ===\n{}', stderr: '' })).toEqual([
      'stdout contains raw response fallback marker',
    ]);
    expect(validateGoldenOutput({ stdout: 'Fuel: NaN', stderr: '' })).toEqual([
      'output contains accidental token "NaN"',
    ]);
    expect(validateGoldenOutput({ stdout: '', stderr: 'value=[object Object]' })).toEqual([
      'output contains accidental token "[object Object]"',
    ]);
  });

  test('assertGoldenOutput writes and compares stdout and stderr in update mode', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      assertGoldenOutput(
        {
          group: 'renderer',
          name: 'sample.case',
          expectedExitCode: 3,
          goldenRoot,
          update: true,
          only: [],
          env: {},
        },
        { exitCode: 3, stdout: 'out', stderr: 'err' },
      );

      expect(
        fs.readFileSync(goldenFilePath({ group: 'renderer', name: 'sample.case', goldenRoot }, 'stdout'), 'utf8'),
      ).toBe('out');
      expect(
        fs.readFileSync(goldenFilePath({ group: 'renderer', name: 'sample.case', goldenRoot }, 'stderr'), 'utf8'),
      ).toBe('err');
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('assertGoldenOutput validates guardrails before writing in update mode', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'invalid.case',
        goldenRoot,
        update: true,
        only: [],
        env: {},
        stdoutFormat: 'json' as const,
      };

      expect(() => assertGoldenOutput(options, { stdout: '{"ok":', stderr: '' })).toThrow(
        'renderer/invalid.case guardrails',
      );
      expect(fs.existsSync(goldenFilePath(options, 'stdout'))).toBe(false);
      expect(fs.existsSync(goldenFilePath(options, 'stderr'))).toBe(false);
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('assertGoldenOutput missing golden error includes path and generic update guidance', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'missing.case',
        goldenRoot,
      };
      const missingPath = goldenFilePath(options, 'stdout');

      expect(() => assertGoldenOutput(options, { stdout: 'out', stderr: '' })).toThrow(
        `Missing golden file: ${missingPath}\nRun UPDATE_GOLDENS=1 bun test <golden test file>`,
      );
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('update filter only updates matching golden cases', () => {
    expect(
      shouldUpdateGolden({ group: 'renderer', name: 'get_status.table' }, { update: true, only: ['status'] }),
    ).toBe(true);
    expect(
      shouldUpdateGolden({ group: 'cli', name: 'unknown-command.table' }, { update: true, only: ['renderer/'] }),
    ).toBe(false);
    expect(shouldUpdateGolden({ group: 'cli', name: 'unknown-command.table' }, { update: false })).toBe(false);
  });

  test('assertGoldenOutput explicit empty filter bypasses ambient GOLDEN_ONLY', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'sample.case',
        goldenRoot,
        update: true,
        only: [],
        env: { GOLDEN_ONLY: 'status' },
      };

      assertGoldenOutput(options, { stdout: 'out', stderr: '' });

      expect(fs.readFileSync(goldenFilePath(options, 'stdout'), 'utf8')).toBe('out');
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('assertGoldenOutput uses ambient GOLDEN_ONLY when no explicit filter is supplied', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      const options = {
        group: 'renderer' as const,
        name: 'sample.case',
        goldenRoot,
        update: true,
        env: { GOLDEN_ONLY: 'status' },
      };

      expect(() => assertGoldenOutput(options, { stdout: 'out', stderr: '' })).toThrow('Missing golden file');
      expect(fs.existsSync(goldenFilePath(options, 'stdout'))).toBe(false);
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('CI update guard requires explicit allow flag', () => {
    expect(() =>
      assertGoldenUpdateAllowed({
        update: true,
        env: { CI: 'true', ALLOW_CI_GOLDEN_UPDATE: undefined },
      }),
    ).toThrow('Refusing to update golden files in CI');

    expect(() =>
      assertGoldenUpdateAllowed({
        update: true,
        env: { CI: 'true', ALLOW_CI_GOLDEN_UPDATE: '1' },
      }),
    ).not.toThrow();
  });

  test('CI update guard ignores falsey CI flag values', () => {
    expect(() =>
      assertGoldenUpdateAllowed({
        update: true,
        env: { CI: 'false', ALLOW_CI_GOLDEN_UPDATE: undefined },
      }),
    ).not.toThrow();

    expect(() =>
      assertGoldenUpdateAllowed({
        update: true,
        env: { CI: '0', ALLOW_CI_GOLDEN_UPDATE: undefined },
      }),
    ).not.toThrow();
  });

  test('builds expected stdout and stderr paths for manifest entries', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      expect(
        expectedGoldenFiles(
          [
            { group: 'renderer', name: 'sample.table' },
            { group: 'cli', name: 'sample.--json' },
          ],
          goldenRoot,
        ).map((file) => path.relative(goldenRoot, file)),
      ).toEqual([
        path.join('cli', 'sample.--json.stderr'),
        path.join('cli', 'sample.--json.stdout'),
        path.join('renderer', 'sample.table.stderr'),
        path.join('renderer', 'sample.table.stdout'),
      ]);
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('detects stale golden files that are not in the manifest', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      fs.mkdirSync(path.join(goldenRoot, 'renderer'), { recursive: true });
      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'kept.stdout'), 'out');
      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'kept.stderr'), '');
      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'stale.stdout'), 'old');

      expect(() => assertGoldenFileSet([{ group: 'renderer', name: 'kept' }], { goldenRoot })).toThrow(
        'Unexpected golden file',
      );
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });

  test('ignores missing golden files in update mode while still detecting stale files', () => {
    const goldenRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-golden-helper-'));
    try {
      fs.mkdirSync(path.join(goldenRoot, 'renderer'), { recursive: true });
      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'kept.stdout'), 'out');
      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'kept.stderr'), '');

      expect(() =>
        assertGoldenFileSet(
          [
            { group: 'renderer', name: 'kept' },
            { group: 'renderer', name: 'missing' },
          ],
          { goldenRoot, update: true, env: {} },
        ),
      ).not.toThrow();

      fs.writeFileSync(path.join(goldenRoot, 'renderer', 'stale.stdout'), 'old');

      expect(() =>
        assertGoldenFileSet(
          [
            { group: 'renderer', name: 'kept' },
            { group: 'renderer', name: 'missing' },
          ],
          { goldenRoot, update: true, env: {} },
        ),
      ).toThrow('Unexpected golden file');
    } finally {
      fs.rmSync(goldenRoot, { recursive: true, force: true });
    }
  });
});
