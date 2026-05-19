#!/usr/bin/env bun
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
export { main, runInvocation, getRuntimeConfig } from './main.ts';
export { compareVersions } from './update.ts';
export { SpaceMoltClient, execute } from './api.ts';
export type { SpaceMoltClientOptions } from './api.ts';
export { createDefaultConfig, LegacySpaceMoltConfig } from './runtime.ts';
export type { SpaceMoltConfig } from './runtime.ts';
export { SessionManager, getSessionPath } from './session.ts';


import { main } from './main.ts';

if (import.meta.main) {
  main();
}
