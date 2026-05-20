import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadCachedGeneratedRoutes, refreshOpenApiCache } from './openapi-cache';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-openapi-cache-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('OpenAPI cache', () => {
  test('refreshes OpenAPI cache, writes pretty JSON, and returns generated routes', async () => {
    const dir = tempDir();
    const requestedUrls: string[] = [];

    const result = await refreshOpenApiCache({
      apiBase: 'https://example.test/api/v2/',
      cacheDir: dir,
      fetch: async (url) => {
        requestedUrls.push(String(url));
        return new Response(
          JSON.stringify({
            openapi: '3.0.3',
            paths: {
              '/api/v2/spacemolt_shipyard/repair': {
                post: {
                  operationId: 'repairShip',
                  summary: 'repair',
                  requestBody: {
                    content: {
                      'application/json': {
                        schema: {
                          properties: { ship_id: { type: 'string' } },
                          required: ['ship_id'],
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
          { headers: { etag: '"abc"' } },
        );
      },
    });

    expect(requestedUrls).toEqual(['https://example.test/api/v2/openapi.json']);
    expect(result.etag).toBe('"abc"');
    expect(result.routes['POST /api/v2/spacemolt_shipyard/repair']).toEqual({
      operationId: 'repairShip',
      summary: 'repair',
      route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
      required: ['ship_id'],
      schema: { ship_id: { type: 'string' } },
    });

    const cachePath = path.join(dir, 'openapi-cache.json');
    expect(fs.existsSync(cachePath)).toBe(true);
    expect(fs.readFileSync(cachePath, 'utf-8')).toContain('\n  "fetchedAt":');
  });

  test('loads cached generated routes from disk', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        etag: '"abc"',
        routes: {
          'POST /api/v2/spacemolt_shipyard/repair': {
            summary: 'repair',
            route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
          },
        },
      }),
    );

    const cached = loadCachedGeneratedRoutes(dir);

    expect(cached?.['POST /api/v2/spacemolt_shipyard/repair']).toEqual({
      summary: 'repair',
      route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
    });
  });
});
