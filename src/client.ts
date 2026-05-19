#!/usr/bin/env bun
export type { SpaceMoltClientOptions } from './api.ts';
export { execute, SpaceMoltClient } from './api.ts';
export {
  applyPayloadTransforms,
  convertPayloadTypes,
  getPayloadConversionSchema,
  normalizeParsedPayload,
  parseArgs,
  validateKnownPayloadFields,
  validatePayloadAgainstSchema,
  validateRequiredArgs,
} from './args.ts';
export type { CliClock, CliEnv, CliRuntimeContext, CliWriter } from './cli-context.ts';
export { createDefaultCliRuntimeContext } from './cli-context.ts';
export { COMMANDS, V2_TOOL_MAP } from './commands.ts';
export { displayStructuredResult } from './display/index.ts';
export {
  ERROR_CODES,
  ERROR_REGISTRY,
  getErrorSuggestion,
  getRelatedCommands,
  isAuthError,
  isKnownErrorCode,
  isRetryableError,
} from './errors.ts';
export { applyGlobalOptions, parseGlobalOptions } from './global-options.ts';
export { getRuntimeConfig, main, runInvocation } from './main.ts';
export type { SpaceMoltConfig } from './runtime.ts';
export { createDefaultConfig, LegacySpaceMoltConfig } from './runtime.ts';
export { getSessionPath, SessionManager } from './session.ts';
export { compareVersions } from './update.ts';

import { main } from './main.ts';

if (import.meta.main) {
  main();
}
