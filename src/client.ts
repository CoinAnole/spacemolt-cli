#!/usr/bin/env bun
export {
  applyPayloadTransforms,
  convertPayloadTypes,
  getPayloadConversionSchema,
  normalizeParsedPayload,
  parseArgs,
  validatePayloadAgainstSchema,
  validateRequiredArgs,
} from './args.ts';
export { COMMANDS, V2_TOOL_MAP } from './commands.ts';
export { displayStructuredResult } from './display/index.ts';
export { main } from './main.ts';
export { compareVersions } from './update.ts';

import { main } from './main.ts';

if (import.meta.main) {
  main();
}
