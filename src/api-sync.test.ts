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
import { COMMANDS, SINGLE_ENDPOINT_TOOLS, V2_TOOL_MAP } from './commands';

const OPENAPI_URL = 'https://game.spacemolt.com/api/v2/openapi.json';
const LOCAL_OPENAPI_PATH = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');

const SPEC_ROUTES_COVERED_BY_ALIASES = new Set([
  // The CLI exposes notification polling through POST /api/v2/spacemolt/get_notifications.
  'GET /api/v2/notifications',
]);

function isInfrastructureSpecRoute(route: string): boolean {
  return route.endsWith('/help') || SPEC_ROUTES_COVERED_BY_ALIASES.has(route);
}

function routePath(tool: string, action: string): string {
  return tool === action || SINGLE_ENDPOINT_TOOLS.has(tool) ? `/api/v2/${tool}` : `/api/v2/${tool}/${action}`;
}

async function loadOpenApiSpec(): Promise<{ paths: Record<string, { get?: unknown; post?: unknown }> }> {
  if (process.env.LIVE_API_SYNC === '1') {
    const resp = await fetch(OPENAPI_URL, { signal: AbortSignal.timeout(10_000) });
    if (resp.status === 429) {
      console.log('[SKIP] OpenAPI spec rate-limited (429) — skipping API sync check');
      return { paths: {} };
    }
    expect(resp.status, `Failed to fetch OpenAPI spec: HTTP ${resp.status}`).toBe(200);
    return (await resp.json()) as { paths: Record<string, { get?: unknown; post?: unknown }> };
  }

  return JSON.parse(fs.readFileSync(LOCAL_OPENAPI_PATH, 'utf-8')) as {
    paths: Record<string, { get?: unknown; post?: unknown }>;
  };
}

const skip = process.env.SKIP_API_SYNC === '1';

describe('api sync', () => {
  test.skipIf(skip)(
    'client.ts V2 map matches OpenAPI spec',
    async () => {
      const clientCommands = new Set(Object.keys(COMMANDS));
      const v2ToolMap = Object.fromEntries(
        Object.entries(V2_TOOL_MAP).map(([command, mapping]) => [
          command,
          {
            route: routePath(mapping.tool, mapping.action),
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
});
