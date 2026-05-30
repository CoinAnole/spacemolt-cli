#!/usr/bin/env bun
/**
 * Report divergences between curated golden fixtures and the OpenAPI response schemas.
 *
 * Usage:
 *   bun run report:fixture-schemas
 *   bun run report:fixture-schemas --only get_status,view_market
 *   bun run report:fixture-schemas --only cargo
 *   bun run report:fixture-schemas --strict
 *   bun run report:fixture-schemas --update-baseline
 *
 * This is a diagnostic tool unless --strict or --update-baseline is used.
 * It exists so maintainers can quickly see how the hand-curated test fixtures
 * relate to the current committed OpenAPI contract.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GENERATED_API_GAMESERVER_VERSION } from '../src/generated/api-commands.ts';
import {
  assertFixtureSchemaBaseline,
  compareHighValueFixturesToSpec,
  DEFAULT_SCHEMA_BASELINE_PATH,
  divergenceSignature,
  filterBlockingDivergences,
  formatComparisonReport,
} from '../src/test-support/fixture-schema-compare.ts';

function parseArgs(argv: string[]): { only?: string[]; strict: boolean; updateBaseline: boolean } {
  const only: string[] = [];
  let strict = false;
  let updateBaseline = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--only' || a === '-o') {
      const next = argv[i + 1];
      if (next && !next.startsWith('-')) {
        only.push(...next.split(',').map((s) => s.trim()).filter(Boolean));
        i++;
      }
    } else if (a.startsWith('--only=')) {
      only.push(...a.slice(7).split(',').map((s) => s.trim()).filter(Boolean));
    } else if (a === '--strict') {
      strict = true;
    } else if (a === '--update-baseline') {
      updateBaseline = true;
    }
  }
  return { only: only.length ? only : undefined, strict, updateBaseline };
}

function updateBaseline(): void {
  const signatures = filterBlockingDivergences(compareHighValueFixturesToSpec())
    .map((divergence) => divergenceSignature(divergence))
    .sort();
  const baseline = {
    generatedAtGameserver: GENERATED_API_GAMESERVER_VERSION,
    blockingDivergenceSignatures: signatures,
  };

  fs.writeFileSync(DEFAULT_SCHEMA_BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
  console.error(
    `[fixture-schema-compare] updated ${path.relative(process.cwd(), DEFAULT_SCHEMA_BASELINE_PATH)} with ${
      signatures.length
    } blocking divergence signature(s).`,
  );
}

const options = parseArgs(process.argv.slice(2));
const comparisons = compareHighValueFixturesToSpec({ only: options.only });

console.log(formatComparisonReport(comparisons));

if (options.updateBaseline) {
  updateBaseline();
}

if (options.strict) {
  assertFixtureSchemaBaseline();
}

if (comparisons.some((c) => c.divergences.some((d) => d.kind === 'extra-in-fixture' || d.kind === 'type-mismatch'))) {
  console.error('\n[note] Some fixtures contain fields or types not present in the current OpenAPI schema.');
  // Do not exit non-zero; this is informational only.
}
