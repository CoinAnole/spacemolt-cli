import { describe, expect, test } from 'bun:test';
import {
  createDefaultConfig,
  outputStateFromGlobalOptionError,
  outputStateFromOptions,
  type OutputRuntimeState,
} from './output-state.ts';
import type { GlobalOptions } from './types.ts';

const baseOptions: GlobalOptions = {
  json: false,
  quiet: false,
  plain: false,
  debug: false,
  allowUnknown: false,
  dryRun: false,
  fields: undefined,
  noTimestamp: false,
  compact: false,
  args: [],
};

describe('explicit output state', () => {
  test('derives output state from parsed options and env', () => {
    const state = outputStateFromOptions(
      { ...baseOptions, format: 'yaml', plain: true, compact: true },
      { DEBUG: 'true', SPACEMOLT_OUTPUT: undefined },
    );

    expect(state).toEqual<OutputRuntimeState>({
      jsonOutput: false,
      debug: true,
      plain: true,
      quiet: false,
      format: 'yaml',
      compact: true,
    });
  });

  test('derives early parse-error output state from partial flags', () => {
    const state = outputStateFromGlobalOptionError(
      { code: 'invalid_global_option', option: '--format', message: 'bad', json: true, plain: true },
      { DEBUG: 'true', SPACEMOLT_OUTPUT: undefined },
    );

    expect(state).toEqual<OutputRuntimeState>({
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: false,
      format: 'json',
      compact: false,
    });
  });

  test('createDefaultConfig returns an immutable env-backed snapshot', () => {
    const config = createDefaultConfig(
      { plain: true, profile: 'pilot' },
      { SPACEMOLT_URL: 'https://example.test/api/v2', DEBUG: 'true', SPACEMOLT_OUTPUT: 'json' },
    );

    expect(config).toEqual({
      apiBase: 'https://example.test/api/v2',
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: false,
      format: 'json',
      compact: false,
      profile: 'pilot',
      profileIsExplicit: false,
    });
  });
});
