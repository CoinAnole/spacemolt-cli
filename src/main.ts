#!/usr/bin/env bun
import { getRuntimeConfig, preparePayload, renderResponse } from './command-handlers.ts';
import { runInvocation } from './runner.ts';

export type CliResult = { exitCode: number; stdout?: string; stderr?: string };

export { getRuntimeConfig, preparePayload, renderResponse, runInvocation };

export async function main(): Promise<CliResult> {
  const exitCode = await runInvocation(process.argv.slice(2));
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
