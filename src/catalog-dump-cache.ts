import * as fs from 'node:fs';
import * as path from 'node:path';
import type { CliWriter } from './cli-context.ts';
import { isRecord } from './response.ts';
import { DEFAULT_USER_AGENT, FETCH_TIMEOUT_MS } from './runtime.ts';
import { getSpacemoltHome, hardenPermissions } from './session.ts';
import type { APIResponse } from './types.ts';

export interface CatalogDumpCacheFile {
  fetchedAt: string;
  etag?: string;
  maxAgeSeconds: number;
  version: string;
  catalog: Record<string, unknown>;
}

export interface LoadCatalogDumpOptions {
  url: string;
  refresh: boolean;
  cacheDir: string;
  userAgent?: string;
  now: Date;
  writer?: CliWriter;
  debug?: boolean;
  quiet?: boolean;
  timeoutMs?: number;
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const CACHE_FILE_MODE = 0o600;
const CACHE_DIR_MODE = 0o700;
const DEFAULT_MAX_AGE_SECONDS = 3600;
const RATE_LIMITED_NO_CACHE_MESSAGE = 'Rate limited — 1 request per minute per IP';

export function defaultCatalogDumpCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return getSpacemoltHome(undefined, undefined, env);
}

export function catalogDumpCachePath(cacheDir = defaultCatalogDumpCacheDir()): string {
  return path.join(cacheDir, 'catalog-dump.json');
}

export async function loadCatalogDump(options: LoadCatalogDumpOptions): Promise<APIResponse> {
  const cachePath = catalogDumpCachePath(options.cacheDir);
  const cache = readCatalogDumpCache(cachePath);
  const now = options.now;

  if (cache && !options.refresh && isCacheFresh(cache, now)) {
    debugCacheHit(options, cache, now);
    return { structuredContent: cache.catalog };
  }

  const fetchImpl = options.fetch ?? globalThis.fetch;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip',
    'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
  };
  if (cache?.etag) headers['If-None-Match'] = cache.etag;

  let response: Response;
  try {
    response = await fetchImpl(options.url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (cache) {
      warnCachedDump(options.writer, cache.fetchedAt, 'request-failed');
      return { structuredContent: cache.catalog };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { error: { code: 'network_error', message: `Catalog dump request failed: ${message}` } };
  }

  if (response.status === 304) {
    if (!cache) {
      return { error: { code: 'invalid_response', message: 'Catalog dump returned 304 without a local cache.' } };
    }
    const next = {
      ...cache,
      fetchedAt: now.toISOString(),
      etag: response.headers.get('etag') || cache.etag,
      maxAgeSeconds: parseMaxAgeSeconds(response.headers.get('cache-control')) ?? cache.maxAgeSeconds,
    };
    await writeCatalogDumpCache(cachePath, next);
    return { structuredContent: cache.catalog };
  }

  if (response.status === 429) {
    if (cache) {
      warnCachedDump(options.writer, cache.fetchedAt, 'rate-limited');
      return { structuredContent: cache.catalog };
    }
    return { error: { code: 'rate_limited', message: RATE_LIMITED_NO_CACHE_MESSAGE } };
  }

  if (!response.ok) {
    if (cache) {
      warnCachedDump(options.writer, cache.fetchedAt, 'request-failed');
      return { structuredContent: cache.catalog };
    }
    return { error: { code: 'http_error', message: `Catalog dump failed: HTTP ${response.status}` } };
  }

  let dump: unknown;
  try {
    dump = await response.json();
  } catch {
    return { error: { code: 'invalid_response', message: 'Catalog dump response was not valid JSON.' } };
  }
  if (!isRecord(dump)) {
    return { error: { code: 'invalid_response', message: 'Catalog dump response was not a JSON object.' } };
  }

  const etag = response.headers.get('etag') || undefined;
  const next: CatalogDumpCacheFile = {
    fetchedAt: now.toISOString(),
    ...(etag ? { etag } : {}),
    maxAgeSeconds: parseMaxAgeSeconds(response.headers.get('cache-control')) ?? DEFAULT_MAX_AGE_SECONDS,
    version: typeof dump.version === 'string' ? dump.version : '',
    catalog: dump,
  };
  await writeCatalogDumpCache(cachePath, next);
  return { structuredContent: dump };
}

function readCatalogDumpCache(cachePath: string): CatalogDumpCacheFile | undefined {
  try {
    if (!fs.existsSync(cachePath)) return undefined;
    hardenPermissions(cachePath, CACHE_FILE_MODE);
    return parseCacheFile(fs.readFileSync(cachePath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function parseCacheFile(raw: string): CatalogDumpCacheFile | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  if (typeof parsed.fetchedAt !== 'string' || parsed.fetchedAt.trim() === '') return undefined;
  if (typeof parsed.version !== 'string') return undefined;
  if (typeof parsed.maxAgeSeconds !== 'number' || !Number.isFinite(parsed.maxAgeSeconds) || parsed.maxAgeSeconds < 0) {
    return undefined;
  }
  if (!isRecord(parsed.catalog)) return undefined;
  const etag = typeof parsed.etag === 'string' && parsed.etag ? parsed.etag : undefined;
  return {
    fetchedAt: parsed.fetchedAt,
    ...(etag ? { etag } : {}),
    maxAgeSeconds: parsed.maxAgeSeconds,
    version: parsed.version,
    catalog: parsed.catalog,
  };
}

function isCacheFresh(cache: CatalogDumpCacheFile, now: Date): boolean {
  const fetched = Date.parse(cache.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return now.getTime() - fetched < cache.maxAgeSeconds * 1000;
}

function parseMaxAgeSeconds(cacheControl: string | null): number | undefined {
  if (!cacheControl) return undefined;
  const match = cacheControl.match(/max-age=(\d+)/i);
  if (!match?.[1]) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : undefined;
}

function debugCacheHit(options: LoadCatalogDumpOptions, cache: CatalogDumpCacheFile, now: Date): void {
  if (!options.debug || options.quiet) return;
  const fetched = Date.parse(cache.fetchedAt);
  const ageSeconds = Number.isFinite(fetched) ? Math.floor((now.getTime() - fetched) / 1000) : 0;
  options.writer?.err(`catalog-dump cache hit age=${ageSeconds}s version=${cache.version}`);
}

function warnCachedDump(
  writer: CliWriter | undefined,
  fetchedAt: string,
  reason: 'rate-limited' | 'request-failed',
): void {
  const suffix = reason === 'rate-limited' ? 'endpoint rate-limited' : 'request failed';
  writer?.err(`Using cached catalog dump from ${fetchedAt} (${suffix}).`);
}

async function writeCatalogDumpCache(cachePath: string, cache: CatalogDumpCacheFile): Promise<void> {
  const parentDir = path.dirname(cachePath);
  if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true, mode: CACHE_DIR_MODE });
  hardenPermissions(parentDir, CACHE_DIR_MODE);

  const tmpPath = path.join(
    parentDir,
    `.${path.basename(cachePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );
  const contents = JSON.stringify(cache);

  try {
    const handle = await fs.promises.open(tmpPath, 'wx', CACHE_FILE_MODE);
    try {
      await handle.writeFile(contents, 'utf-8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.promises.rename(tmpPath, cachePath);
    hardenPermissions(cachePath, CACHE_FILE_MODE);
  } catch (err) {
    try {
      await fs.promises.unlink(tmpPath);
    } catch {
      /* best effort */
    }
    throw err;
  }
}
