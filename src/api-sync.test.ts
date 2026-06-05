/**
 * API sync test — verifies that the commands in client.ts match the v2 API spec.
 *
 * Catches two classes of drift:
 *   - Stale commands: in client.ts but not in the server API (hard fail)
 *   - Missing commands: in the server API but not in client.ts (hard fail)
 *
 * Run with: bun test src/api-sync.test.ts
 * Use live spec: LIVE_API_SYNC=1 bun test src/api-sync.test.ts
 * Skip with: SKIP_API_SYNC=1 bun test
 */

import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generate, type OpenApiSpec } from '../scripts/generate-api-metadata';
import { COMMANDS, routeToPath, V2_TOOL_MAP } from './commands';
import { GENERATED_API_GAMESERVER_VERSION, GENERATED_API_ROUTES } from './generated/api-commands';

const OPENAPI_URL = 'https://game.spacemolt.com/api/v2/openapi.json';
const LOCAL_OPENAPI_PATH = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');

type OpenApiFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
type OpenApiEtagFallback = (timeoutMs: number) => Promise<string | undefined> | string | undefined;

interface FetchLiveOpenApiSpecOptions {
  fetchImpl?: OpenApiFetch;
  fetchLiveEtagFallback?: OpenApiEtagFallback;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  log?: (message: string) => void;
  localOpenApiPath?: string;
}

interface OpenApiSpecLoaderOptions {
  liveApiSync?: boolean;
  fetchLive?: () => Promise<OpenApiSpec>;
  readLocal?: () => OpenApiSpec;
}

function isInfrastructureSpecRoute(route: string): boolean {
  return route.endsWith('/help');
}

async function fetchLiveOpenApiSpec(options: FetchLiveOpenApiSpecOptions = {}): Promise<OpenApiSpec> {
  const fetchImpl = options.fetchImpl || fetch;
  const fetchLiveEtagFallback = options.fetchLiveEtagFallback || fetchLiveOpenApiEtagWithCurl;
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.maxAttempts ?? Number(process.env.LIVE_API_SYNC_MAX_ATTEMPTS || 4);
  const retryDelayMs = options.retryDelayMs ?? Number(process.env.LIVE_API_SYNC_RETRY_DELAY_MS || 1_000);
  const timeoutMs = options.timeoutMs ?? 10_000;
  const log = options.log || console.log;
  const localOpenApiPath = options.localOpenApiPath || LOCAL_OPENAPI_PATH;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const resp = await fetchImpl(OPENAPI_URL, { signal: AbortSignal.timeout(timeoutMs) });
    if (resp.status === 429) {
      const fallback = await readLocalOpenApiSpecWithMatchingLiveEtag(
        fetchImpl,
        localOpenApiPath,
        timeoutMs,
        fetchLiveEtagFallback,
      );
      if (fallback) {
        log('[FALLBACK] OpenAPI GET rate-limited (429); live ETag matches local spec.');
        return fallback;
      }
      if (attempt < maxAttempts) {
        log(`[RETRY] OpenAPI spec rate-limited (429); retrying ${attempt + 1}/${maxAttempts}`);
        await sleep(retryDelayMs);
        continue;
      }
    }
    expect(resp.status, `Failed to fetch OpenAPI spec: HTTP ${resp.status}`).toBe(200);
    return (await resp.json()) as OpenApiSpec;
  }

  throw new Error('Failed to fetch OpenAPI spec');
}

function readLocalOpenApiSpec(): OpenApiSpec {
  return JSON.parse(fs.readFileSync(LOCAL_OPENAPI_PATH, 'utf-8')) as OpenApiSpec;
}

async function readLocalOpenApiSpecWithMatchingLiveEtag(
  fetchImpl: OpenApiFetch,
  localOpenApiPath: string,
  timeoutMs: number,
  fetchLiveEtagFallback: OpenApiEtagFallback,
): Promise<OpenApiSpec | undefined> {
  const localBytes = fs.readFileSync(localOpenApiPath);
  const localHashPrefix = crypto.createHash('sha256').update(localBytes).digest('hex').slice(0, 16);
  const etag = await fetchLiveOpenApiEtag(fetchImpl, timeoutMs, fetchLiveEtagFallback);
  if (!etag || normalizeEtag(etag) !== localHashPrefix) return undefined;

  return JSON.parse(localBytes.toString('utf-8')) as OpenApiSpec;
}

async function fetchLiveOpenApiEtag(
  fetchImpl: OpenApiFetch,
  timeoutMs: number,
  fetchLiveEtagFallback: OpenApiEtagFallback,
): Promise<string | undefined> {
  const response = await fetchImpl(OPENAPI_URL, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
  if (response.ok) return response.headers.get('etag') || undefined;
  if (response.status === 429) return (await fetchLiveEtagFallback(timeoutMs)) || undefined;
  return undefined;
}

function fetchLiveOpenApiEtagWithCurl(timeoutMs: number): string | undefined {
  const maxTimeSeconds = Math.max(1, Math.ceil(timeoutMs / 1_000));
  const result = spawnSync('curl', ['-sSIL', '--max-time', String(maxTimeSeconds), OPENAPI_URL], {
    encoding: 'utf-8',
    timeout: timeoutMs + 1_000,
  });
  if (result.error) return undefined;

  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const statuses = Array.from(output.matchAll(/^HTTP\/\S+\s+(\d+)/gim));
  const lastStatus = statuses[statuses.length - 1]?.[1];
  if (lastStatus && Number(lastStatus) >= 400) return undefined;

  const etagLine = output
    .split(/\r?\n/)
    .reverse()
    .find((line) => /^etag:/i.test(line));
  return etagLine?.replace(/^etag:\s*/i, '').trim() || undefined;
}

function normalizeEtag(etag: string): string {
  return etag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');
}

function createOpenApiSpecLoader(options: OpenApiSpecLoaderOptions = {}): () => Promise<OpenApiSpec> {
  let liveOpenApiSpecPromise: Promise<OpenApiSpec> | undefined;

  return async () => {
    const liveApiSync = options.liveApiSync ?? process.env.LIVE_API_SYNC === '1';
    if (liveApiSync) {
      liveOpenApiSpecPromise ??= options.fetchLive ? options.fetchLive() : fetchLiveOpenApiSpec();
      return liveOpenApiSpecPromise;
    }

    return options.readLocal ? options.readLocal() : readLocalOpenApiSpec();
  };
}

const loadOpenApiSpec = createOpenApiSpecLoader();
const skip = process.env.SKIP_API_SYNC === '1';

describe('api sync', () => {
  test('LIVE_API_SYNC reuses one OpenAPI fetch per test process', async () => {
    let fetchCount = 0;
    const spec = {
      info: { 'x-gameserver-version': 'v.test' },
      paths: {},
    } as OpenApiSpec;
    const loadSpec = createOpenApiSpecLoader({
      liveApiSync: true,
      fetchLive: async () => {
        fetchCount += 1;
        return spec;
      },
    });

    const first = await loadSpec();
    const second = await loadSpec();

    expect(first).toEqual(spec);
    expect(second).toEqual(spec);
    expect(fetchCount).toBe(1);
  });

  test('LIVE_API_SYNC retries a rate-limited OpenAPI fetch before using the response', async () => {
    const methods: string[] = [];
    const spec = {
      info: { 'x-gameserver-version': 'v.retry' },
      paths: {},
    } as OpenApiSpec;

    const result = await fetchLiveOpenApiSpec({
      maxAttempts: 2,
      retryDelayMs: 0,
      sleep: async () => {},
      log: () => {},
      fetchImpl: async (_url, init) => {
        methods.push(init?.method || 'GET');
        if (methods.length === 1) return new Response('', { status: 429 });
        return new Response(JSON.stringify(spec), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      },
    });

    expect(result).toEqual(spec);
    expect(methods).toEqual(['GET', 'HEAD', 'GET']);
  });

  test('LIVE_API_SYNC falls back to a local spec when a rate-limited GET has a matching live ETag', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-sync-'));
    const spec = {
      info: { 'x-gameserver-version': 'v.etag' },
      paths: {},
    } as OpenApiSpec;
    const localOpenApiPath = path.join(dir, 'openapi.json');
    const body = JSON.stringify(spec);
    const etag = `W/"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
    const methods: string[] = [];
    fs.writeFileSync(localOpenApiPath, body);

    try {
      const result = await fetchLiveOpenApiSpec({
        maxAttempts: 2,
        retryDelayMs: 0,
        sleep: async () => {},
        log: () => {},
        localOpenApiPath,
        fetchImpl: async (_url, init) => {
          const method = init?.method || 'GET';
          methods.push(method);
          if (method === 'HEAD') return new Response('', { status: 200, headers: { etag } });
          return new Response('', { status: 429 });
        },
      });

      expect(result).toEqual(spec);
      expect(methods).toEqual(['GET', 'HEAD']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('LIVE_API_SYNC can verify a local spec when fetch GET and HEAD are both rate-limited', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-sync-'));
    const spec = {
      info: { 'x-gameserver-version': 'v.independent-etag' },
      paths: {},
    } as OpenApiSpec;
    const localOpenApiPath = path.join(dir, 'openapi.json');
    const body = JSON.stringify(spec);
    const etag = `W/"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 16)}"`;
    const methods: string[] = [];

    fs.writeFileSync(localOpenApiPath, body);

    try {
      const result = await fetchLiveOpenApiSpec({
        maxAttempts: 1,
        retryDelayMs: 0,
        sleep: async () => {},
        log: () => {},
        localOpenApiPath,
        fetchImpl: async (_url, init) => {
          methods.push(init?.method || 'GET');
          return new Response('', { status: 429 });
        },
        fetchLiveEtagFallback: async () => etag,
      });

      expect(result).toEqual(spec);
      expect(methods).toEqual(['GET', 'HEAD']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test.skipIf(skip)(
    'client.ts V2 map matches OpenAPI spec',
    async () => {
      const clientCommands = new Set(Object.keys(COMMANDS));
      const v2ToolMap = Object.fromEntries(
        Object.entries(V2_TOOL_MAP).map(([command, mapping]) => [
          command,
          {
            route: routeToPath(mapping, { includeApiPrefix: true }),
            method: mapping.method || 'POST',
          },
        ]),
      );

      const spec = await loadOpenApiSpec();
      if (Object.keys(spec.paths).length === 0) return;
      const v2Routes = new Set(
        Object.entries(spec.paths).flatMap(([route, methods]) => {
          const routes: string[] = [];
          if (methods.get) routes.push(`GET ${route}`);
          if (methods.post) routes.push(`POST ${route}`);
          return routes;
        }),
      );

      const staleMappings = Object.entries(v2ToolMap)
        .filter(([, mapping]) => !v2Routes.has(`${mapping.method} ${mapping.route}`))
        .map(([command, mapping]) => `${command} -> ${mapping.method} ${mapping.route}`);
      expect(
        staleMappings,
        `Stale V2 mappings in client.ts (not in v2 OpenAPI):\n  ${staleMappings.join('\n  ')}\n\nFix the tool/action pair or move the route to UNDOCUMENTED_IN_SPEC if the spec is behind.`,
      ).toEqual([]);

      const mappedRoutes = new Set(Object.values(v2ToolMap).map((mapping) => `${mapping.method} ${mapping.route}`));
      const unmappedSpecRoutes = [...v2Routes]
        .filter((route) => !isInfrastructureSpecRoute(route))
        .filter((route) => !mappedRoutes.has(route));
      expect(
        unmappedSpecRoutes,
        `V2 OpenAPI routes missing from client.ts V2_TOOL_MAP:\n  ${unmappedSpecRoutes.join('\n  ')}\n\nAdd CLI commands for these routes, or add a narrow alias/infra exemption if intentionally covered elsewhere.`,
      ).toEqual([]);

      const unmappedCommands = [...clientCommands].filter((cmd) => !(cmd in v2ToolMap));
      expect(
        unmappedCommands,
        `Commands in client.ts missing from V2_TOOL_MAP:\n  ${unmappedCommands.join('\n  ')}\n\nMap every command to a v2 tool/action.`,
      ).toEqual([]);
    },
    15_000,
  );

  test.skipIf(skip)(
    'generated OpenAPI metadata version matches cached spec',
    async () => {
      const spec = await loadOpenApiSpec();
      if (Object.keys(spec.paths).length === 0) return;
      const specVersion = spec.info['x-gameserver-version'];

      if (process.env.LIVE_API_SYNC === '1' && specVersion === 'unknown') {
        return;
      }

      expect(
        GENERATED_API_GAMESERVER_VERSION,
        'Generated metadata in src/generated/api-commands.ts was built from a different gameserver version. Run `bun run generate:api`.',
      ).toBe(specVersion);
    },
    5_000,
  );

  test.skipIf(skip)(
    'generated OpenAPI metadata is deterministic and matches cached spec',
    async () => {
      const spec = await loadOpenApiSpec();
      if (Object.keys(spec.paths).length === 0) return;

      const generated = generate(spec);
      expect(
        GENERATED_API_ROUTES,
        'Generated metadata in src/generated/api-commands.ts does not match the cached spec. Run `bun run generate:api`.',
      ).toEqual(generated as unknown as typeof GENERATED_API_ROUTES);
    },
    5_000,
  );
});
