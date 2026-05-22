import * as fs from 'node:fs';
import * as path from 'node:path';
import { type GeneratedApiRoute, generateApiRoutes, type OpenApiSpec } from './openapi-metadata.ts';
import { getSpacemoltHome } from './session.ts';

export interface OpenApiCacheFile {
  fetchedAt: string;
  etag?: string;
  routes: Record<string, GeneratedApiRoute>;
}

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
    return parsed.routes && typeof parsed.routes === 'object' ? parsed.routes : undefined;
  } catch {
    return undefined;
  }
}

export async function refreshOpenApiCache(options: {
  apiBase: string;
  cacheDir?: string;
  fetch?: OpenApiFetch;
}): Promise<OpenApiCacheFile> {
  const fetchImpl = options.fetch || fetch;
  const url = `${options.apiBase.replace(/\/$/, '')}/openapi.json`;
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`OpenAPI refresh failed: HTTP ${response.status}`);

  const spec = (await response.json()) as OpenApiSpec;
  const cache: OpenApiCacheFile = {
    fetchedAt: new Date().toISOString(),
    etag: response.headers.get('etag') || undefined,
    routes: generateApiRoutes(spec),
  };

  const cacheDir = options.cacheDir || defaultOpenApiCacheDir();
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(openApiCachePath(cacheDir), JSON.stringify(cache, null, 2));
  return cache;
}
