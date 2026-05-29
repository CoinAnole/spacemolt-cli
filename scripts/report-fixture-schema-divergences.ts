#!/usr/bin/env bun
/**
 * Report divergences between curated golden fixtures and the OpenAPI response schemas.
 *
 * Usage:
 *   bun run report:fixture-schemas
 *   bun run report:fixture-schemas --only get_status,view_market
 *   bun run report:fixture-schemas --only cargo
 *
 * This is a diagnostic tool. It does not fail CI or modify golden files.
 * It exists so maintainers can quickly see how the hand-curated test fixtures
 * relate to the current committed OpenAPI contract.
 */

import { compareHighValueFixturesToSpec, formatComparisonReport } from '../src/test-support/fixture-schema-compare.ts';

function parseArgs(argv: string[]): { only?: string[] } {
  const only: string[] = [];
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
    }
  }
  return { only: only.length ? only : undefined };
}

const options = parseArgs(process.argv.slice(2));
const comparisons = compareHighValueFixturesToSpec({ only: options.only });

console.log(formatComparisonReport(comparisons));

if (comparisons.some((c) => c.divergences.some((d) => d.kind === 'extra-in-fixture' || d.kind === 'type-mismatch'))) {
  console.error('\n[note] Some fixtures contain fields or types not present in the current OpenAPI schema.');
  // Do not exit non-zero; this is informational only.
}
