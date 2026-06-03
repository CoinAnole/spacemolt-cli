import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SpaceMoltClient } from './api.ts';
import { getRuntimeConfig } from './main.ts';
import {
  createDefaultConfig,
  createRuntimeState,
  GlobalBackedConfig,
  LegacySpaceMoltConfig,
  type SpaceMoltConfig,
  setOutputMode,
} from './runtime.ts';
import { SessionManager, setDefaultProfile } from './session.ts';

describe('Explicit Runtime Configuration', () => {
  test('GlobalBackedConfig resolves globals dynamically', () => {
    const config = new GlobalBackedConfig();

    expect(config.apiBase).toBeDefined();

    const configWithOverrides = createDefaultConfig({
      apiBase: 'https://custom-test.spacemolt.com/api/v2',
      jsonOutput: true,
    });

    expect(configWithOverrides.apiBase).toBe('https://custom-test.spacemolt.com/api/v2');
    expect(configWithOverrides.jsonOutput).toBe(true);
  });

  test('LegacySpaceMoltConfig remains a temporary alias', () => {
    expect(new LegacySpaceMoltConfig()).toBeInstanceOf(GlobalBackedConfig);
  });

  test('SessionManager isolates default and explicit profile paths', () => {
    const originalConfigHome = process.env.XDG_CONFIG_HOME;
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-config-test-'));
    process.env.XDG_CONFIG_HOME = configHome;
    try {
      setDefaultProfile('default-pilot');

      const defaultManager = new SessionManager();
      expect(defaultManager.getSessionPath()).toContain('sessions/default-pilot.json');

      const profileManager = new SessionManager({ profile: 'test-profile-123' });
      expect(profileManager.getSessionPath()).toContain('sessions/test-profile-123.json');
    } finally {
      if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = originalConfigHome;
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('SpaceMoltClient respects config injected via constructor', () => {
    const customBase = 'https://injected-client.spacemolt.com/api/v2';
    const client = new SpaceMoltClient({
      config: createDefaultConfig({
        apiBase: customBase,
        jsonOutput: true,
      }),
    });

    expect(client.config.apiBase).toBe(customBase);
    expect(client.config.jsonOutput).toBe(true);
  });

  test('getRuntimeConfig maps GlobalOptions accurately', () => {
    const options = {
      json: true,
      quiet: true,
      plain: true,
      allowUnknown: false,
      dryRun: false,
      noTimestamp: false,
      compact: true,
      debug: true,
      args: [],
      format: 'json' as const,
      profile: 'my-custom-profile',
    };

    const config = getRuntimeConfig(options);
    expect(config.jsonOutput).toBe(true);
    expect(config.plain).toBe(true);
    expect(config.quiet).toBe(true);
    expect(config.compact).toBe(true);
    expect(config.debug).toBe(true);
    expect(config.profile).toBe('my-custom-profile');
  });

  test('createRuntimeState maps config into output flags without reading globals', () => {
    const config: SpaceMoltConfig = {
      apiBase: 'https://example.test/api/v2',
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: true,
      format: 'yaml',
      compact: true,
      profile: 'pilot',
    };

    expect(createRuntimeState(config)).toEqual({
      apiBase: 'https://example.test/api/v2',
      jsonOutput: true,
      debug: true,
      plain: true,
      quiet: true,
      format: 'yaml',
      compact: true,
      profile: 'pilot',
      profileIsExplicit: false,
    });
  });

  test('legacy output globals remain mutable for backwards compatibility', () => {
    setOutputMode({ json: false, quiet: false, plain: false, debug: false, format: 'table', compact: false });
    try {
      setOutputMode({ json: true, quiet: true, plain: true, debug: true, format: 'text', compact: true });

      const state = createRuntimeState();
      expect(state.jsonOutput).toBe(true);
      expect(state.quiet).toBe(true);
      expect(state.plain).toBe(true);
      expect(state.debug).toBe(true);
      expect(state.format).toBe('text');
      expect(state.compact).toBe(true);
    } finally {
      setOutputMode({ json: false, quiet: false, plain: false, debug: false, format: 'table', compact: false });
    }
  });
});
