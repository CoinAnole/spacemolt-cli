import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type GeneratedApiRoute,
  gameserverVersionFromSpec,
  generateApiRoutes,
  type OpenApiSpec,
} from './openapi-metadata.ts';
import { DEFAULT_USER_AGENT } from './runtime.ts';
import { getSpacemoltHome } from './session.ts';

export interface OpenApiCacheFile {
  fetchedAt: string;
  etag?: string;
  gameserverVersion: string;
  routes: Record<string, GeneratedApiRoute>;
}

export type OpenApiCacheVersionStatus =
  | { status: 'not_synced' }
  | { status: 'invalid' }
  | { status: 'valid'; gameserverVersion: string; fetchedAt: string };

type OpenApiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function defaultOpenApiCacheDir(env: NodeJS.ProcessEnv = process.env): string {
  return getSpacemoltHome(undefined, undefined, env);
}

export function openApiCachePath(cacheDir = defaultOpenApiCacheDir()): string {
  return path.join(cacheDir, 'openapi-cache.json');
}

export function loadCachedGeneratedRoutes(
  cacheDir = defaultOpenApiCacheDir(),
): Record<string, GeneratedApiRoute> | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(openApiCachePath(cacheDir), 'utf-8')) as OpenApiCacheFile;
    if (typeof parsed.gameserverVersion !== 'string' || parsed.gameserverVersion.trim() === '') return undefined;
    return parsed.routes && typeof parsed.routes === 'object' ? parsed.routes : undefined;
  } catch {
    return undefined;
  }
}

export function loadOpenApiCacheVersion(cacheDir = defaultOpenApiCacheDir()): OpenApiCacheVersionStatus {
  try {
    const parsed = JSON.parse(fs.readFileSync(openApiCachePath(cacheDir), 'utf-8')) as Partial<OpenApiCacheFile>;
    if (typeof parsed.gameserverVersion !== 'string' || parsed.gameserverVersion.trim() === '') {
      return { status: 'invalid' };
    }
    return {
      status: 'valid',
      gameserverVersion: parsed.gameserverVersion,
      fetchedAt: typeof parsed.fetchedAt === 'string' ? parsed.fetchedAt : '',
    };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { status: 'not_synced' };
    return { status: 'invalid' };
  }
}

export async function refreshOpenApiCache(options: {
  apiBase: string;
  cacheDir?: string;
  fetch?: OpenApiFetch;
  userAgent?: string;
}): Promise<OpenApiCacheFile> {
  const fetchImpl = options.fetch || fetch;
  const url = `${options.apiBase.replace(/\/$/, '')}/openapi.json`;
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip',
      'User-Agent': options.userAgent ?? DEFAULT_USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`OpenAPI refresh failed: HTTP ${response.status}`);

  const spec = (await response.json()) as OpenApiSpec;
  const cache: OpenApiCacheFile = {
    fetchedAt: new Date().toISOString(),
    etag: response.headers.get('etag') || undefined,
    gameserverVersion: gameserverVersionFromSpec(spec),
    routes: generateApiRoutes(spec),
  };

  const cacheDir = options.cacheDir || defaultOpenApiCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(openApiCachePath(cacheDir), JSON.stringify(cache, null, 2));
  return cache;
}
