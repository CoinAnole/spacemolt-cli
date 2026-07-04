import { describe, expect, test } from 'bun:test';
import {
  buildResponseSchemaCandidates,
  collectAllPropertyNames,
  getEffectiveSchema,
  resolveSuccessResponseSchema,
  type OpenApiSpec,
} from './openapi-schema';

function makeSpec(): OpenApiSpec {
  return {
    info: { 'x-gameserver-version': 'v0.test.1' },
    paths: {
      '/api/v2/spacemolt/craft': {
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
                          structuredContent: {
                            allOf: [
                              { $ref: '#/components/schemas/V2GameState' },
                              {
                                type: 'object',
                                properties: {
                                  details: { $ref: '#/components/schemas/CraftJobResponse' },
                                },
                              },
                            ],
                          },
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
            result: { type: 'string' },
            structuredContent: { type: 'object' },
          },
        },
        V2GameState: {
          type: 'object',
          properties: {
            player: { type: 'object', properties: { id: { type: 'string' } } },
          },
        },
        CraftJobResponse: {
          oneOf: [
            {
              type: 'object',
              properties: {
                action: { type: 'string' },
                job_id: { type: 'string' },
              },
            },
            {
              type: 'object',
              properties: {
                action: { type: 'string' },
                refunded: {
                  type: 'object',
                  properties: {
                    credits: { type: 'integer' },
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
}

describe('OpenAPI schema utilities', () => {
  test('getEffectiveSchema resolves refs and merges allOf properties', () => {
    const spec = makeSpec();
    const effective = getEffectiveSchema(spec, {
      allOf: [
        { $ref: '#/components/schemas/V2GameState' },
        { type: 'object', properties: { details: { $ref: '#/components/schemas/CraftJobResponse' } } },
      ],
    });

    expect(Object.keys(effective.properties || {}).sort()).toEqual(['details', 'player']);
  });

  test('resolveSuccessResponseSchema unwraps V2Response structuredContent', () => {
    const spec = makeSpec();
    const resolved = resolveSuccessResponseSchema(spec, 'POST /api/v2/spacemolt/craft');

    expect(resolved.primarySchemaName).toBeUndefined();
    expect(Object.keys(resolved.schema.properties || {}).sort()).toEqual(['details', 'player']);
  });

  test('buildResponseSchemaCandidates includes structuredContent, details, and oneOf branches', () => {
    const spec = makeSpec();
    const resolved = resolveSuccessResponseSchema(spec, 'POST /api/v2/spacemolt/craft');
    const candidates = buildResponseSchemaCandidates(spec, resolved.schema, resolved.primarySchemaName);

    expect(candidates.map((c) => c.label)).toEqual([
      'structuredContent',
      'details.oneOf[0]',
      'details.oneOf[1]',
    ]);
    expect(candidates.map((c) => c.comparedAgainst)).toEqual(['structuredContent', 'details', 'details']);
  });

  test('collectAllPropertyNames walks nested arrays and oneOf variants', () => {
    const spec = makeSpec();
    const fields = collectAllPropertyNames(
      {
        type: 'object',
        properties: {
          passengers: {
            type: 'array',
            items: {
              oneOf: [
                { type: 'object', properties: { base_fare: { type: 'integer' } } },
                { type: 'object', properties: { speed_bonus: { type: 'number' } } },
              ],
            },
          },
        },
      },
      spec,
    );

    expect([...fields].sort()).toEqual(['base_fare', 'passengers', 'speed_bonus']);
  });
});
