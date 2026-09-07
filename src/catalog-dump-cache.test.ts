import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type CatalogDumpCacheFile,
  catalogDumpCachePath,
  defaultCatalogDumpCacheDir,
  loadCatalogDump,
} from './catalog-dump-cache';
import { BUNDLED_COMMAND_REGISTRY } from './command-registry';
import { buildRequestUrl } from './commands';
import { DEFAULT_V2_API_BASE } from './runtime';

const NOW = new Date('2026-09-07T12:00:00.000Z');
const FRESH_FETCHED_AT = '2026-09-07T11:30:00.000Z';
const STALE_FETCHED_AT = '2026-09-07T10:00:00.000Z';
const DUMP_URL = 'https://game.spacemolt.com/api/catalog.json';

const dump = {
  version: '0.596.2',
  mining: {
    precision_k: 20,
    overkill_ratio: 4,
    depletion_floor: 0.25,
    rare_ore_rarity_weight_per_level: 0.1,
  },
  ships: [],
  skills: [],
  recipes: [],
  items: [],
  facilities: [],
  achievements: [],
  faction_achievements: [],
  hidden_achievement_count: 9,
  hidden_faction_achievement_count: 2,
};

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-catalog-dump-'));
  tempDirs.push(dir);
  return dir;
}

function writeCache(dir: string, cache: CatalogDumpCacheFile): string {
  fs.mkdirSync(dir, { recursive: true });
  const cachePath = catalogDumpCachePath(dir);
  fs.writeFileSync(cachePath, JSON.stringify(cache));
  return cachePath;
}

function headerValue(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const headerName = entry[0];
      if (headerName && headerName.toLowerCase() === name.toLowerCase()) return entry[1];
    }
    return undefined;
  }
  const record = headers as Record<string, string>;
  const key = Object.keys(record).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? record[key] : undefined;
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetch: fetchImpl, calls };
}

function captureWriter() {
  const err: string[] = [];
  return {
    err,
    writer: {
      out() {},
      err(message = '') {
        err.push(message);
      },
    },
  };
}

function jsonResponse(body: unknown, init: { status?: number; etag?: string; cacheControl?: string } = {}): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (init.etag) headers.set('etag', init.etag);
  if (init.cacheControl) headers.set('cache-control', init.cacheControl);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('catalog dump cache', () => {
  test('defaults to the CLI config directory', () => {
    expect(defaultCatalogDumpCacheDir({ XDG_CONFIG_HOME: '/tmp/spacemolt-config-test' })).toBe(
      '/tmp/spacemolt-config-test/spacemolt-cli',
    );
  });

  test('buildRequestUrl strips /api/v2 when apiBase is DEFAULT_V2_API_BASE', () => {
    const route = BUNDLED_COMMAND_REGISTRY.commands.catalog_dump?.route;
    expect(route).toBeDefined();
    if (!route) return;
    expect(buildRequestUrl(DEFAULT_V2_API_BASE, route)).toBe(DUMP_URL);
  });

  test('serves a fresh cache without fetching', async () => {
    const dir = tempDir();
    writeCache(dir, {
      fetchedAt: FRESH_FETCHED_AT,
      etag: '"fresh"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch, calls } = mockFetch(() => {
      throw new Error('network should not be used');
    });
    const captured = captureWriter();

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      writer: captured.writer,
      fetch,
    });

    expect(calls).toHaveLength(0);
    expect(response).toEqual({ structuredContent: dump });
    expect(captured.err).toEqual([]);
  });

  test('debug cache-hit lines honor quiet', async () => {
    const dir = tempDir();
    writeCache(dir, {
      fetchedAt: FRESH_FETCHED_AT,
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch } = mockFetch(() => {
      throw new Error('network should not be used');
    });
    const debug = captureWriter();
    await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      writer: debug.writer,
      fetch,
      debug: true,
    });
    expect(debug.err).toEqual(['catalog-dump cache hit age=1800s version=0.596.2']);

    const quiet = captureWriter();
    await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      writer: quiet.writer,
      fetch,
      debug: true,
      quiet: true,
    });
    expect(quiet.err).toEqual([]);
  });

  test('revalidates a stale cache with If-None-Match and keeps the body on 304', async () => {
    const dir = tempDir();
    const cachePath = writeCache(dir, {
      fetchedAt: STALE_FETCHED_AT,
      etag: '"stale"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch, calls } = mockFetch(
      () => new Response(null, { status: 304, headers: { etag: '"stale"', 'cache-control': 'public, max-age=3600' } }),
    );

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(DUMP_URL);
    expect(headerValue(calls[0]?.init, 'If-None-Match')).toBe('"stale"');
    expect(headerValue(calls[0]?.init, 'Accept-Encoding')).toBe('gzip');
    expect(response).toEqual({ structuredContent: dump });
    const stored = JSON.parse(fs.readFileSync(cachePath, 'utf-8')) as CatalogDumpCacheFile;
    expect(stored.fetchedAt).toBe(NOW.toISOString());
    expect(stored.catalog).toEqual(dump);
  });

  test('replaces a stale cache on 200 and writes compact JSON', async () => {
    const dir = tempDir();
    const cachePath = writeCache(dir, {
      fetchedAt: STALE_FETCHED_AT,
      etag: '"old"',
      maxAgeSeconds: 3600,
      version: '0.1.0',
      catalog: { version: '0.1.0' },
    });
    const { fetch, calls } = mockFetch(() =>
      jsonResponse(dump, { etag: '"new"', cacheControl: 'public, max-age=1800' }),
    );

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({ structuredContent: dump });
    const raw = fs.readFileSync(cachePath, 'utf-8');
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)));
    expect(raw).not.toContain('\n');
    const stored = JSON.parse(raw) as CatalogDumpCacheFile;
    expect(stored).toEqual({
      fetchedAt: NOW.toISOString(),
      etag: '"new"',
      maxAgeSeconds: 1800,
      version: '0.596.2',
      catalog: dump,
    });
  });

  test('HTTP 429 with cache returns the dump and warns on stderr even when quiet', async () => {
    const dir = tempDir();
    writeCache(dir, {
      fetchedAt: STALE_FETCHED_AT,
      etag: '"stale"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch, calls } = mockFetch(() => new Response('rate limited', { status: 429 }));
    const captured = captureWriter();

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      writer: captured.writer,
      fetch,
      quiet: true,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({ structuredContent: dump });
    expect(captured.err).toEqual([`Using cached catalog dump from ${STALE_FETCHED_AT} (endpoint rate-limited).`]);
  });

  test('HTTP 429 without cache returns rate_limited and does not retry', async () => {
    const dir = tempDir();
    const { fetch, calls } = mockFetch(() => new Response('rate limited', { status: 429 }));

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({
      error: { code: 'rate_limited', message: 'Rate limited — 1 request per minute per IP' },
    });
  });

  test('network error with cache returns the dump and warns even when quiet', async () => {
    const dir = tempDir();
    writeCache(dir, {
      fetchedAt: STALE_FETCHED_AT,
      etag: '"stale"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch, calls } = mockFetch(() => {
      throw new Error('socket hang up');
    });
    const captured = captureWriter();

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      writer: captured.writer,
      fetch,
      quiet: true,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({ structuredContent: dump });
    expect(captured.err).toEqual([`Using cached catalog dump from ${STALE_FETCHED_AT} (request failed).`]);
  });

  test('refresh=true bypasses max-age but still sends If-None-Match', async () => {
    const dir = tempDir();
    writeCache(dir, {
      fetchedAt: FRESH_FETCHED_AT,
      etag: '"fresh"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const { fetch, calls } = mockFetch(() => new Response(null, { status: 304, headers: { etag: '"fresh"' } }));

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: true,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(headerValue(calls[0]?.init, 'If-None-Match')).toBe('"fresh"');
    expect(response).toEqual({ structuredContent: dump });
  });

  test('corrupt JSON and missing keys are cache misses', async () => {
    const corruptDir = tempDir();
    fs.writeFileSync(catalogDumpCachePath(corruptDir), '{not-json');
    const missingDir = tempDir();
    fs.writeFileSync(catalogDumpCachePath(missingDir), JSON.stringify({ fetchedAt: FRESH_FETCHED_AT }));
    const { fetch, calls } = mockFetch(() => jsonResponse(dump, { etag: '"new"' }));

    const corrupt = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: corruptDir,
      now: NOW,
      fetch,
    });
    const missing = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: missingDir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(2);
    expect(headerValue(calls[0]?.init, 'If-None-Match')).toBeUndefined();
    expect(headerValue(calls[1]?.init, 'If-None-Match')).toBeUndefined();
    expect(corrupt).toEqual({ structuredContent: dump });
    expect(missing).toEqual({ structuredContent: dump });
  });
});
