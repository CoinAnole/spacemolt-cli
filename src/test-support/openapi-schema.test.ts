import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  buildResponseSchemaCandidates,
  collectAllPropertyNames,
  getEffectiveSchema,
  loadOpenApiSpec,
  type OpenApiSpec,
  resolveSuccessResponseSchema,
} from './openapi-schema';

const DEFAULT_OPENAPI_PATH = path.join(import.meta.dir, '..', '..', 'spacemolt-docs', 'openapi.json');

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
      '/api/v2/spacemolt/ref-craft': {
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
                          structuredContent: { $ref: '#/components/schemas/RefCraftStructuredContent' },
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
        RefCraftStructuredContent: {
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
  test('loadOpenApiSpec does not return a custom spec for later default loads', () => {
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-openapi-schema-'));
    const customPath = path.join(customDir, 'openapi.json');

    try {
      fs.writeFileSync(
        customPath,
        JSON.stringify({
          info: { 'x-gameserver-version': 'v0.custom-cache' },
          paths: {},
          components: { schemas: {} },
        }),
      );

      const customSpec = loadOpenApiSpec(customPath);
      const expectedDefaultSpec = JSON.parse(fs.readFileSync(DEFAULT_OPENAPI_PATH, 'utf8')) as OpenApiSpec;
      const defaultSpec = loadOpenApiSpec();

      expect(customSpec.info?.['x-gameserver-version']).toBe('v0.custom-cache');
      expect(defaultSpec.info?.['x-gameserver-version']).toBe(expectedDefaultSpec.info?.['x-gameserver-version']);
    } finally {
      fs.rmSync(customDir, { recursive: true, force: true });
    }
  });

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

  test('resolveSuccessResponseSchema merges structuredContent refs that use allOf', () => {
    const spec = makeSpec();
    const resolved = resolveSuccessResponseSchema(spec, 'POST /api/v2/spacemolt/ref-craft');

    expect(resolved.primarySchemaName).toBe('RefCraftStructuredContent');
    expect(Object.keys(resolved.schema.properties || {}).sort()).toEqual(['details', 'player']);
  });

  test('buildResponseSchemaCandidates includes structuredContent, details, and oneOf branches', () => {
    const spec = makeSpec();
    const resolved = resolveSuccessResponseSchema(spec, 'POST /api/v2/spacemolt/craft');
    const candidates = buildResponseSchemaCandidates(spec, resolved.schema, resolved.primarySchemaName);

    expect(candidates.map((c) => c.label)).toEqual(['structuredContent', 'details.oneOf[0]', 'details.oneOf[1]']);
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
