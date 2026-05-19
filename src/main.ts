#!/usr/bin/env bun
import { createDefaultCliRuntimeContext } from './cli-context.ts';
import { getRuntimeConfig, preparePayload, renderResponse } from './command-handlers.ts';
import { runInvocation } from './runner.ts';

export type CliResult = { exitCode: number; stdout?: string; stderr?: string };

export type { CliClock, CliEnv, CliRuntimeContext, CliWriter } from './cli-context.ts';
export { createDefaultCliRuntimeContext };
export { getRuntimeConfig, preparePayload, renderResponse, runInvocation };

export async function main(): Promise<CliResult> {
  const exitCode = await runInvocation(process.argv.slice(2), undefined, createDefaultCliRuntimeContext());
  process.exit(exitCode);
}

if (import.meta.main) {
  main();
}
