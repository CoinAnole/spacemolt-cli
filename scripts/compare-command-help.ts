#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommandHelpReport,
  formatCommandHelpReport,
  parseApiMdCommands,
  parseReportArgs,
} from '../src/command-help-report.ts';
import { COMMANDS } from '../src/commands.ts';
import { GENERATED_API_ROUTES } from '../src/generated/api-commands.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function main(argv: string[]): number {
  const args = parseReportArgs(argv);
  if (args.command && !COMMANDS[args.command]) {
    console.error(`Unknown curated command: ${args.command}`);
    return 1;
  }

  const apiMdPath = path.join(root, 'spacemolt-docs', 'api.md');
  let apiMdCommands;
  try {
    apiMdCommands = parseApiMdCommands(fs.readFileSync(apiMdPath, 'utf-8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${apiMdPath}: ${message}`);
    return 1;
  }
  if (Object.keys(apiMdCommands).length === 0) {
    console.error(`Failed to parse ${apiMdPath}: no Client Commands entries found.`);
    return 1;
  }

  const report = buildCommandHelpReport({
    commands: COMMANDS,
    generatedRoutes: GENERATED_API_ROUTES,
    apiMdCommands,
    command: args.command,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatCommandHelpReport(report, { includeAll: args.includeAll }));
  }

  return args.failOnDiff && report.differenceCount > 0 ? 1 : 0;
}

process.exitCode = main(Bun.argv.slice(2));
