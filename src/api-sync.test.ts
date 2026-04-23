/**
 * API sync test — verifies that the commands in client.ts match the live server.
 *
 * Catches two classes of drift:
 *   - Stale commands: in client.ts but not in the server API (hard fail)
 *   - Missing commands: in the server API but not in client.ts (hard fail)
 *
 * Run with: bun test src/api-sync.test.ts
 * Skip with: SKIP_API_SYNC=1 bun test
 */

import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OPENAPI_URL = 'https://game.spacemolt.com/api/v2/openapi.json';

const UNDOCUMENTED_IN_SPEC = new Set<string>([
  '/api/v2/spacemolt_catalog/catalog',
  '/api/v2/spacemolt_catalog/get_guide',
  '/api/v2/spacemolt_catalog/help',
]);

/**
 * Extracts the command names from the COMMANDS block in client.ts.
 * Parses only lines within the COMMANDS const (lines 87–505), not notification
 * handlers or other objects that share the same 2-space key format.
 */
function extractClientCommands(src: string): string[] {
  // Isolate the COMMANDS block — from its opening brace to the closing `};`
  // at column 0, stopping before V2_TOOL_MAP
  const start = src.indexOf('const COMMANDS:');
  const end = src.indexOf('\nconst V2_TOOL_MAP');
  if (start === -1 || end === -1) throw new Error('Could not locate COMMANDS block in client.ts');

  const block = src.slice(start, end);
  // Match 2-space-indented top-level keys: `  keyname: {` or `  keyname: (`
  const matches = [...block.matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*[{(]/gm)];
  return matches.map((m) => m[1]).filter((value): value is string => Boolean(value));
}

function extractV2ToolMap(src: string): Record<string, string> {
  const start = src.indexOf('const V2_TOOL_MAP:');
  const end = src.indexOf('\n\n// =============================================================================\n// Error Help Messages');
  if (start === -1 || end === -1) throw new Error('Could not locate V2_TOOL_MAP block in client.ts');

  const block = src.slice(start, end);
  const matches = [...block.matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*\{\s*tool:\s*'([^']+)',\s*action:\s*'([^']+)'\s*\},?$/gm)];
  return Object.fromEntries(matches.map((m) => {
    const [, cmd, tool, action] = m;
    const route = tool === action ? `/api/v2/${tool}` : `/api/v2/${tool}/${action}`;
    return [cmd, route];
  }));
}

const skip = process.env.SKIP_API_SYNC === '1';

describe('api sync', () => {
  test.skipIf(skip)(
    'client.ts V2 map matches live OpenAPI spec',
    async () => {
      const clientPath = path.join(import.meta.dir, 'client.ts');
      const src = fs.readFileSync(clientPath, 'utf-8');
      const clientCommands = new Set(extractClientCommands(src));
      const v2ToolMap = extractV2ToolMap(src);

      // Fetch the live OpenAPI spec
      const resp = await fetch(OPENAPI_URL, { signal: AbortSignal.timeout(10_000) });
      if (resp.status === 429) {
        console.log('[SKIP] OpenAPI spec rate-limited (429) — skipping API sync check');
        return;
      }
      expect(resp.status, `Failed to fetch OpenAPI spec: HTTP ${resp.status}`).toBe(200);
      const spec = (await resp.json()) as { paths: Record<string, { post?: unknown }> };
      const v2PostPaths = new Set(
        Object.entries(spec.paths)
          .filter(([, methods]) => Boolean(methods.post))
          .map(([route]) => route),
      );

      for (const route of UNDOCUMENTED_IN_SPEC) v2PostPaths.add(route);

      const staleMappings = Object.entries(v2ToolMap)
        .filter(([, route]) => !v2PostPaths.has(route))
        .map(([command, route]) => `${command} -> ${route}`);
      expect(
        staleMappings,
        `Stale V2 mappings in client.ts (not in v2 OpenAPI):\n  ${staleMappings.join('\n  ')}\n\nFix the tool/action pair or move the route to UNDOCUMENTED_IN_SPEC if the spec is behind.`,
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
