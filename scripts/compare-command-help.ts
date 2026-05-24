#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildCommandHelpReport,
  formatCommandHelpReport,
  type OpenApiHelpEntry,
  parseOpenApiHelpEntries,
  parseReportArgs,
} from '../src/command-help-report.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readOpenApiHelpEntries(specPath: string): OpenApiHelpEntry[] {
  const entries = parseOpenApiHelpEntries(JSON.parse(fs.readFileSync(specPath, 'utf-8')));
  if (entries.length === 0) throw new Error('no operations found');
  return entries;
}

function main(argv: string[]): number {
  const args = parseReportArgs(argv);
  const openApiV1Path = path.join(root, 'spacemolt-docs', 'openapi-v1.json');
  const openApiV2Path = path.join(root, 'spacemolt-docs', 'openapi.json');
  let v1Entries: OpenApiHelpEntry[];
  let v2Entries: OpenApiHelpEntry[];

  try {
    v1Entries = readOpenApiHelpEntries(openApiV1Path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${openApiV1Path}: ${message}`);
    return 1;
  }

  try {
    v2Entries = readOpenApiHelpEntries(openApiV2Path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${openApiV2Path}: ${message}`);
    return 1;
  }

  const command = args.command;
  if (
    command &&
    !v2Entries.some((entry) => entry.command === command || entry.aliases.includes(command)) &&
    !(args.includeV1Only && v1Entries.some((entry) => entry.command === command || entry.aliases.includes(command)))
  ) {
    console.error(`Unknown OpenAPI command: ${command}`);
    return 1;
  }

  const report = buildCommandHelpReport({
    v1Entries,
    v2Entries,
    command,
    includeV1Only: args.includeV1Only,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      formatCommandHelpReport(report, {
        includeAll: args.includeAll,
        includeIntentional: args.includeIntentional,
        includeV1Only: args.includeV1Only,
      }),
    );
  }

  return args.failOnDiff && report.differenceCount > 0 ? 1 : 0;
}

process.exitCode = main(Bun.argv.slice(2));
