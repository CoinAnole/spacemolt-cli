#!/usr/bin/env bun
/**
 * Report divergences between curated command overrides and generated OpenAPI command configs.
 *
 * Usage:
 *   bun run report:curated-commands
 *   bun run report:curated-commands --only get_status,market
 *
 * This is a diagnostic tool. It does not fail CI or modify files.
 */

import {
  compareCuratedCommandsToGenerated,
  formatCuratedCommandComparisonReport,
} from '../src/test-support/curated-command-compare.ts';

function parseArgs(argv: string[]): { only?: string[] } {
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
    }
  }
  return { only: only.length ? only : undefined };
}

const options = parseArgs(process.argv.slice(2));
const report = compareCuratedCommandsToGenerated({ only: options.only });

console.log(formatCuratedCommandComparisonReport(report));

if (report.commands.some((command) => command.differences.length > 0)) {
  console.error('\n[note] Some curated commands differ from generated OpenAPI command metadata.');
  // Do not exit non-zero; this is informational only.
}
