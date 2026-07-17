import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  defaultOpenApiCacheDir,
  loadCachedGeneratedRoutes,
  refreshOpenApiCache,
  resolveGeneratedRouteSources,
} from './openapi-cache';
import type { GeneratedApiRoute } from './openapi-metadata';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-openapi-cache-'));
  tempDirs.push(dir);
  return dir;
}

const bundledRoutes: Record<string, GeneratedApiRoute> = {
  'POST /api/v2/spacemolt_shipping/quote': {
    summary: 'Bundled shipping quote',
    route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
    required: ['package_id'],
    schema: { package_id: { type: 'string' } },
  },
};

const cachedRoutes: Record<string, GeneratedApiRoute> = {
  'POST /api/v2/spacemolt_cached/probe': {
    summary: 'Cached probe',
    route: { tool: 'spacemolt_cached', action: 'probe', method: 'POST' },
  },
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('OpenAPI cache', () => {
  test('uses bundled routes when cached metadata is absent, invalid, or older', () => {
    for (const testCase of [
      { cachedRoutes: undefined, cacheVersion: { status: 'not_synced' } as const },
      { cachedRoutes, cacheVersion: { status: 'invalid' } as const },
      {
        cachedRoutes,
        cacheVersion: {
          status: 'valid',
          gameserverVersion: 'v0.521.0',
          fetchedAt: '2026-07-16T00:00:00.000Z',
        } as const,
      },
    ]) {
      expect(
        resolveGeneratedRouteSources({
          bundledRoutes,
          bundledVersion: 'v0.522.0',
          ...testCase,
        }),
      ).toEqual({
        generatedRoutes: bundledRoutes,
        dynamicGeneratedRoutes: bundledRoutes,
        cacheIsUsable: false,
      });
    }
  });

  test('uses an equal or newer cache as the authoritative dynamic route catalog', () => {
    for (const gameserverVersion of ['v0.522.0', 'v0.523.0']) {
      const result = resolveGeneratedRouteSources({
        bundledRoutes,
        bundledVersion: 'v0.522.0',
        cachedRoutes,
        cacheVersion: {
          status: 'valid',
          gameserverVersion,
          fetchedAt: '2026-07-17T00:00:00.000Z',
        },
      });

      expect(result.cacheIsUsable).toBe(true);
      expect(result.dynamicGeneratedRoutes).toBe(cachedRoutes);
      expect(result.dynamicGeneratedRoutes['POST /api/v2/spacemolt_shipping/quote']).toBeUndefined();
      expect(result.generatedRoutes).toEqual({ ...bundledRoutes, ...cachedRoutes });
    }
  });

  test('lets usable cached records override matching bundled metadata', () => {
    const signature = 'POST /api/v2/spacemolt_shipping/quote';
    const cachedOverride: Record<string, GeneratedApiRoute> = {
      [signature]: {
        summary: 'Cached shipping quote',
        route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
        required: ['cache_only'],
        schema: { cache_only: { type: 'string' } },
      },
    };

    const result = resolveGeneratedRouteSources({
      bundledRoutes,
      bundledVersion: 'v0.522.0',
      cachedRoutes: cachedOverride,
      cacheVersion: {
        status: 'valid',
        gameserverVersion: 'v0.523.0',
        fetchedAt: '2026-07-17T00:00:00.000Z',
      },
    });

    expect(result.generatedRoutes[signature]).toBe(cachedOverride[signature]);
    expect(result.dynamicGeneratedRoutes).toBe(cachedOverride);
  });

  test('defaults to the CLI config directory', () => {
    expect(defaultOpenApiCacheDir({ XDG_CONFIG_HOME: '/tmp/spacemolt-config-test' })).toBe(
      '/tmp/spacemolt-config-test/spacemolt-cli',
    );
  });

  test('refreshes OpenAPI cache, writes pretty JSON, and returns generated routes', async () => {
    const dir = tempDir();
    const requests: Array<{ url: string; init?: RequestInit }> = [];

    const result = await refreshOpenApiCache({
      apiBase: 'https://example.test/api/v2/',
      cacheDir: dir,
      userAgent: 'ENDL-TradeBot/1.0',
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            openapi: '3.0.3',
            info: { 'x-gameserver-version': 'v0.324.1' },
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

    expect(requests).toEqual([
      {
        url: 'https://example.test/api/v2/openapi.json',
        init: { headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip', 'User-Agent': 'ENDL-TradeBot/1.0' } },
      },
    ]);
    expect(result.etag).toBe('"abc"');
    expect(result.gameserverVersion).toBe('v0.324.1');
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

  test('rejects refreshed OpenAPI specs without a gameserver version', async () => {
    const dir = tempDir();

    await expect(
      refreshOpenApiCache({
        apiBase: 'https://example.test/api/v2/',
        cacheDir: dir,
        fetch: async () =>
          new Response(
            JSON.stringify({
              openapi: '3.0.3',
              info: { version: '2.0.0' },
              paths: {},
            }),
          ),
      }),
    ).rejects.toThrow('OpenAPI spec is missing info.x-gameserver-version');

    expect(fs.existsSync(path.join(dir, 'openapi-cache.json'))).toBe(false);
  });

  test('loads cached generated routes from disk', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        etag: '"abc"',
        gameserverVersion: 'v0.324.1',
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

  test('does not load cached routes from files without a gameserver version', () => {
    const dir = tempDir();
    fs.writeFileSync(
      path.join(dir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        routes: {
          'POST /api/v2/spacemolt_shipyard/repair': {
            summary: 'repair',
            route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
          },
        },
      }),
    );

    expect(loadCachedGeneratedRoutes(dir)).toBeUndefined();
  });
});
