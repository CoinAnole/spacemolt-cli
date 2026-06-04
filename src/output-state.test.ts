import { describe, expect, test } from 'bun:test';
import {
  createDefaultConfig,
  type ImmutableSpaceMoltConfig,
  type OutputRuntimeState,
  outputStateFromGlobalOptionError,
  outputStateFromOptions,
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

function assertImmutableConfigType(config: ImmutableSpaceMoltConfig) {
  // @ts-expect-error Immutable config snapshots should not expose writable fields.
  config.apiBase = 'https://mutated.example.test/api/v2';
}

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

  test('env json output does not rewrite the derived format', () => {
    const envJson = outputStateFromOptions(baseOptions, { DEBUG: undefined, SPACEMOLT_OUTPUT: 'json' });
    const optionJson = outputStateFromOptions({ ...baseOptions, json: true }, { DEBUG: undefined });

    expect(envJson).toEqual<OutputRuntimeState>({
      jsonOutput: true,
      debug: false,
      plain: false,
      quiet: false,
      format: 'table',
      compact: false,
    });
    expect(optionJson).toEqual<OutputRuntimeState>({
      jsonOutput: true,
      debug: false,
      plain: false,
      quiet: false,
      format: 'json',
      compact: false,
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
    expect(Object.isFrozen(config)).toBe(true);
    void assertImmutableConfigType;
  });
});
