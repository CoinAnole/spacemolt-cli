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
const LATER = new Date(NOW.getTime() + 1000);
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

  test('a 200 then refresh=true and HTTP 429 keeps the 200 catalog and fetchedAt', async () => {
    const dir = tempDir();
    const cachePath = catalogDumpCachePath(dir);
    let rateLimited = false;
    const { fetch, calls } = mockFetch(() => {
      if (!rateLimited) return jsonResponse(dump, { etag: '"from-200"', cacheControl: 'public, max-age=3600' });
      return jsonResponse({ version: '429-version', marker: 'from-429' }, { status: 429 });
    });

    const first = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });
    expect(first).toEqual({ structuredContent: dump });
    const afterFirst = fs.readFileSync(cachePath, 'utf-8');

    rateLimited = true;
    const second = await loadCatalogDump({
      url: DUMP_URL,
      refresh: true,
      cacheDir: dir,
      now: LATER,
      fetch,
    });

    expect(calls).toHaveLength(2);
    expect(second).toEqual({ structuredContent: dump });
    expect(fs.readFileSync(cachePath, 'utf-8')).toBe(afterFirst);
    const stored = JSON.parse(afterFirst) as CatalogDumpCacheFile;
    expect(stored.fetchedAt).toBe(NOW.toISOString());
    expect(stored.catalog).toEqual(dump);
  });

  test('a 200 then refresh=true and HTTP 304 keeps the 200 catalog and moves fetchedAt', async () => {
    const dir = tempDir();
    let revalidate = false;
    const { fetch, calls } = mockFetch(() => {
      if (!revalidate) return jsonResponse(dump, { etag: '"from-200"', cacheControl: 'public, max-age=3600' });
      return new Response(JSON.stringify({ version: '304-version', marker: 'from-304' }), {
        status: 304,
        headers: { etag: '"revalidated"', 'cache-control': 'max-age=120', 'content-type': 'application/json' },
      });
    });

    const first = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });
    expect(first).toEqual({ structuredContent: dump });

    revalidate = true;
    const second = await loadCatalogDump({
      url: DUMP_URL,
      refresh: true,
      cacheDir: dir,
      now: LATER,
      fetch,
    });

    expect(calls).toHaveLength(2);
    expect(second).toEqual({ structuredContent: dump });
    const stored = JSON.parse(fs.readFileSync(catalogDumpCachePath(dir), 'utf-8')) as CatalogDumpCacheFile;
    expect(stored).toEqual({
      fetchedAt: LATER.toISOString(),
      etag: '"revalidated"',
      maxAgeSeconds: 120,
      version: '0.596.2',
      catalog: dump,
    });
  });

  test('HTTP 304 with no cache file is invalid_response and creates no file', async () => {
    const dir = tempDir();
    const { fetch, calls } = mockFetch(
      () => new Response(null, { status: 304, headers: { etag: '"revalidated"', 'cache-control': 'max-age=120' } }),
    );

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({
      error: { code: 'invalid_response', message: 'Catalog dump returned 304 without a local cache.' },
    });
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  test('HTTP 500 with a cache returns the cached catalog and keeps fetchedAt', async () => {
    const dir = tempDir();
    const cachePath = writeCache(dir, {
      fetchedAt: STALE_FETCHED_AT,
      etag: '"stale"',
      maxAgeSeconds: 3600,
      version: '0.596.2',
      catalog: dump,
    });
    const before = fs.readFileSync(cachePath, 'utf-8');
    const { fetch, calls } = mockFetch(() => new Response('server error', { status: 500 }));

    const response = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: dir,
      now: NOW,
      fetch,
    });

    expect(calls).toHaveLength(1);
    expect(response).toEqual({ structuredContent: dump });
    expect(fs.readFileSync(cachePath, 'utf-8')).toBe(before);
    expect((JSON.parse(before) as CatalogDumpCacheFile).fetchedAt).toBe(STALE_FETCHED_AT);
  });

  test('HTTP 200 array, null, and invalid JSON are invalid_response and leave the cache byte for byte', async () => {
    const badBodies = [
      {
        label: 'array',
        message: 'Catalog dump response was not a JSON object.',
        respond: () => jsonResponse([{ marker: 'from-200-array' }]),
      },
      {
        label: 'null',
        message: 'Catalog dump response was not a JSON object.',
        respond: () => jsonResponse(null),
      },
      {
        label: 'invalid JSON',
        message: 'Catalog dump response was not valid JSON.',
        respond: () => new Response('{not-json', { status: 200, headers: { 'content-type': 'application/json' } }),
      },
    ];

    for (const body of badBodies) {
      const dir = tempDir();
      const cachePath = writeCache(dir, {
        fetchedAt: STALE_FETCHED_AT,
        etag: '"stale"',
        maxAgeSeconds: 3600,
        version: '0.596.2',
        catalog: dump,
      });
      const before = fs.readFileSync(cachePath, 'utf-8');
      const { fetch, calls } = mockFetch(() => body.respond());

      const response = await loadCatalogDump({
        url: DUMP_URL,
        refresh: false,
        cacheDir: dir,
        now: NOW,
        fetch,
      });

      expect({ label: body.label, calls: calls.length, response, file: fs.readFileSync(cachePath, 'utf-8') }).toEqual({
        label: body.label,
        calls: 1,
        response: { error: { code: 'invalid_response', message: body.message } },
        file: before,
      });
    }
  });

  test('age equal to maxAgeSeconds fetches and age 1ms under it does not', async () => {
    const maxAgeSeconds = 3600;
    const exactDir = tempDir();
    writeCache(exactDir, {
      fetchedAt: new Date(NOW.getTime() - maxAgeSeconds * 1000).toISOString(),
      etag: '"cached"',
      maxAgeSeconds,
      version: '0.596.2',
      catalog: dump,
    });
    const exact = mockFetch(() => {
      throw new Error('socket hang up');
    });
    const exactResponse = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: exactDir,
      now: NOW,
      fetch: exact.fetch,
    });
    expect(exact.calls).toHaveLength(1);
    expect(exact.calls[0]?.url).toBe(DUMP_URL);
    expect(exactResponse).toEqual({ structuredContent: dump });

    const insideDir = tempDir();
    writeCache(insideDir, {
      fetchedAt: new Date(NOW.getTime() - maxAgeSeconds * 1000 + 1).toISOString(),
      etag: '"cached"',
      maxAgeSeconds,
      version: '0.596.2',
      catalog: dump,
    });
    const inside = mockFetch(() => {
      throw new Error('network should not be used');
    });
    const insideResponse = await loadCatalogDump({
      url: DUMP_URL,
      refresh: false,
      cacheDir: insideDir,
      now: NOW,
      fetch: inside.fetch,
    });
    expect(inside.calls).toHaveLength(0);
    expect(insideResponse).toEqual({ structuredContent: dump });
  });
});
