#!/usr/bin/env bun
export {
  convertPayloadTypes,
  getPayloadConversionSchema,
  normalizeParsedPayload,
  parseArgs,
  validateRequiredArgs,
} from './args.ts';
export { COMMANDS, V2_TOOL_MAP } from './commands.ts';
export { displayStructuredResult } from './display/index.ts';
export { main } from './main.ts';
export { normalizeCommandPayload } from './response.ts';
export { compareVersions } from './update.ts';

import { main } from './main.ts';

if (import.meta.main) {
  main();
}
