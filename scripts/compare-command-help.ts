#!/usr/bin/env bun
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  type ApiMdCommandMap,
  buildCommandHelpReport,
  formatCommandHelpReport,
  type OpenApiV1DescriptionMap,
  parseApiMdCommands,
  parseOpenApiV1Descriptions,
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
  let apiMdCommands: ApiMdCommandMap;
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

  const openApiV1Path = path.join(root, 'spacemolt-docs', 'openapi-v1.json');
  let openApiV1Descriptions: OpenApiV1DescriptionMap;
  try {
    openApiV1Descriptions = parseOpenApiV1Descriptions(JSON.parse(fs.readFileSync(openApiV1Path, 'utf-8')));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to parse ${openApiV1Path}: ${message}`);
    return 1;
  }
  if (Object.keys(openApiV1Descriptions).length === 0) {
    console.error(`Failed to parse ${openApiV1Path}: no operation descriptions found.`);
    return 1;
  }

  const report = buildCommandHelpReport({
    commands: COMMANDS,
    generatedRoutes: GENERATED_API_ROUTES,
    apiMdCommands,
    openApiV1Descriptions,
    command: args.command,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      formatCommandHelpReport(report, {
        includeAll: args.includeAll,
        includeIntentional: args.includeIntentional,
      }),
    );
  }

  return args.failOnDiff && report.differenceCount > 0 ? 1 : 0;
}

process.exitCode = main(Bun.argv.slice(2));
