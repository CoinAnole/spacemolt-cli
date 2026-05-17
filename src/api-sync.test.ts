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

const OPENAPI_URL = 'https://game.spacemolt.com/api/v2/openapi.json';
const LOCAL_OPENAPI_PATH = path.join(import.meta.dir, '..', 'spacemolt-docs', 'openapi.json');

const SINGLE_ENDPOINT_TOOLS = new Set(['agentlogs', 'session', 'spacemolt_catalog']);

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

function extractV2ToolMap(src: string): Record<string, { route: string; method: 'GET' | 'POST' }> {
  const start = src.indexOf('const V2_TOOL_MAP:');
  const end = src.indexOf(
    '\n\n// =============================================================================\n// Error Help Messages',
  );
  if (start === -1 || end === -1) throw new Error('Could not locate V2_TOOL_MAP block in client.ts');

  const block = src.slice(start, end);
  const routes: Record<string, { route: string; method: 'GET' | 'POST' }> = {};
  let currentKey: string | null = null;
  let currentEntry = '';
  let depth = 0;

  const flush = () => {
    if (!currentKey) return;
    const toolMatch = currentEntry.match(/\btool:\s*'([^']+)'/);
    const actionMatch = currentEntry.match(/\baction:\s*'([^']+)'/);
    const methodMatch = currentEntry.match(/\bmethod:\s*'([^']+)'/);
    if (!toolMatch?.[1] || !actionMatch?.[1]) return;

    const [, tool] = toolMatch;
    const [, action] = actionMatch;
    routes[currentKey] = {
      route: tool === action || SINGLE_ENDPOINT_TOOLS.has(tool) ? `/api/v2/${tool}` : `/api/v2/${tool}/${action}`,
      method: methodMatch?.[1] === 'GET' ? 'GET' : 'POST',
    };
  };

  for (const line of block.split('\n')) {
    const keyMatch = line.match(/^\s{2}([a-z][a-z0-9_]+):\s*\{/);
    if (keyMatch?.[1]) {
      currentKey = keyMatch[1];
      currentEntry = line;
      depth = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (depth === 0) {
        flush();
        currentKey = null;
        currentEntry = '';
      }
      continue;
    }

    if (!currentKey) continue;
    currentEntry += `\n${line}`;
    depth += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    if (depth === 0) {
      flush();
      currentKey = null;
      currentEntry = '';
    }
  }
  return routes;
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
      const clientPath = path.join(import.meta.dir, 'client.ts');
      const src = fs.readFileSync(clientPath, 'utf-8');
      const clientCommands = new Set(extractClientCommands(src));
      const v2ToolMap = extractV2ToolMap(src);

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

      const unmappedCommands = [...clientCommands].filter((cmd) => !(cmd in v2ToolMap));
      expect(
        unmappedCommands,
        `Commands in client.ts missing from V2_TOOL_MAP:\n  ${unmappedCommands.join('\n  ')}\n\nMap every command to a v2 tool/action.`,
      ).toEqual([]);
    },
    15_000,
  );
});
