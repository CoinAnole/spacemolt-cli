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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { generate, type OpenApiSpec } from '../scripts/generate-api-metadata';
import { COMMANDS, routeToPath, V2_TOOL_MAP } from './commands';
import { GENERATED_API_GAMESERVER_VERSION, GENERATED_API_ROUTES } from './generated/api-commands';

const OPENAPI_URL = 'https://game.spacemolt.com/api/v2/openapi.json';
const LOCAL_OPENAPI_PATH = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');
let liveOpenApiSpecPromise: Promise<OpenApiSpec> | undefined;

function isInfrastructureSpecRoute(route: string): boolean {
  return route.endsWith('/help');
}

async function fetchLiveOpenApiSpec(): Promise<OpenApiSpec> {
  const resp = await fetch(OPENAPI_URL, { signal: AbortSignal.timeout(10_000) });
  if (resp.status === 429) {
    console.log('[SKIP] OpenAPI spec rate-limited (429) — skipping API sync check');
    return { info: { 'x-gameserver-version': 'rate-limited' }, paths: {} };
  }
  expect(resp.status, `Failed to fetch OpenAPI spec: HTTP ${resp.status}`).toBe(200);
  return (await resp.json()) as OpenApiSpec;
}

async function loadOpenApiSpec(): Promise<OpenApiSpec> {
  if (process.env.LIVE_API_SYNC === '1') {
    liveOpenApiSpecPromise ??= fetchLiveOpenApiSpec();
    return liveOpenApiSpecPromise;
  }

  return JSON.parse(fs.readFileSync(LOCAL_OPENAPI_PATH, 'utf-8')) as OpenApiSpec;
}

const skip = process.env.SKIP_API_SYNC === '1';

describe('api sync', () => {
  test('LIVE_API_SYNC reuses one OpenAPI fetch per test process', async () => {
    const originalLiveApiSync = process.env.LIVE_API_SYNC;
    const originalFetch = globalThis.fetch;
    let fetchCount = 0;
    const spec = {
      info: { 'x-gameserver-version': 'v.test' },
      paths: {},
    } as OpenApiSpec;

    process.env.LIVE_API_SYNC = '1';
    liveOpenApiSpecPromise = undefined;
    globalThis.fetch = (async () => {
      fetchCount += 1;
      return new Response(JSON.stringify(spec), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    try {
      const first = await loadOpenApiSpec();
      const second = await loadOpenApiSpec();

      expect(first).toEqual(spec);
      expect(second).toEqual(spec);
      expect(fetchCount).toBe(1);
    } finally {
      if (originalLiveApiSync === undefined) delete process.env.LIVE_API_SYNC;
      else process.env.LIVE_API_SYNC = originalLiveApiSync;
      liveOpenApiSpecPromise = undefined;
      globalThis.fetch = originalFetch;
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

      expect(
        GENERATED_API_GAMESERVER_VERSION,
        'Generated metadata in src/generated/api-commands.ts was built from a different gameserver version. Run `bun run generate:api`.',
      ).toBe(spec.info['x-gameserver-version']);
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
