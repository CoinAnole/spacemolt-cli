#!/usr/bin/env bun
/**
 * Report inconsistencies between OpenAPI request/response schemas and the prose,
 * examples, and reality documented in the same spec (and optionally live server help).
 *
 * Focuses on the classes of problems we have seen repeatedly:
 * - Field names in **Example:** prose vs actual schema property names (e.g. "name"/"destination" vs "id")
 * - Over-shared request schemas on dedicated action paths (e.g. job_add vs transfer sharing "direction")
 * - Response fields referenced in docs but missing from schemas (e.g. base_fare)
 *
 * Usage:
 *   bun run report:openapi-consistency
 *   bun run report:openapi-consistency --only passenger,facility,job
 *   bun run report:openapi-consistency --json
 *
 * This is a diagnostic / high-recall fuzzy tool. It is informational unless you add your own gating.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildConsistencyReport,
  formatConsistencyReport,
  loadOpenApiSpec,
} from '../src/test-support/openapi-consistency';

const _root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

interface CliArgs {
  only?: string[];
  json: boolean;
  specPath?: string;
  includeLow: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    json: false,
    includeLow: false,
  };
  const only: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--only' || a === '-o') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        only.push(
          ...next
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        );
        i++;
      }
    } else if (a.startsWith('--only=')) {
      only.push(
        ...a
          .slice(7)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      );
    } else if (a === '--json') {
      args.json = true;
    } else if (a === '--include-low' || a === '--low-confidence') {
      args.includeLow = true;
    } else if (a === '--spec') {
      const next = argv[i + 1];
      if (next) {
        args.specPath = path.resolve(next);
        i++;
      }
    } else if (a.startsWith('--spec=')) {
      args.specPath = path.resolve(a.slice(7));
    }
  }

  if (only.length) args.only = only;
  return args;
}

function main() {
  const cli = parseArgs(Bun.argv.slice(2));

  const spec = loadOpenApiSpec(cli.specPath);
  const report = buildConsistencyReport(spec, {
    only: cli.only,
    includeLowConfidence: cli.includeLow,
  });

  const output = formatConsistencyReport(report, { json: cli.json });
  console.log(output);

  // Always exit 0 for diagnostic tool (like the other report:* scripts).
  // Use downstream scripting or --strict in future if you want gating.
  return 0;
}

process.exitCode = main();
