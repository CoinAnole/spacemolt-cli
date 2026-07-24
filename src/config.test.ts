import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SpaceMoltClient } from './api.ts';
import * as clientEntrypoint from './client.ts';
import { getRuntimeConfig } from './main.ts';
import { createDefaultConfig, createRuntimeState, type SpaceMoltConfig } from './runtime.ts';
import { resolveFuzzyIdsEnabled } from './runtime-config.ts';
import {
  getCliConfigPath,
  loadCliConfig,
  SessionManager,
  saveCliConfig,
  setActiveProfile,
  setDefaultProfile,
} from './session.ts';

describe('Explicit Runtime Configuration', () => {
  test('createDefaultConfig returns a frozen env-backed snapshot', () => {
    const env: Record<string, string | undefined> = {
      SPACEMOLT_URL: 'https://env-test.spacemolt.com/api/v2',
      SPACEMOLT_OUTPUT: 'json',
      DEBUG: 'true',
      SPACEMOLT_PROFILE: 'env-pilot',
    };
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-user-agent-config-'));
    env.XDG_CONFIG_HOME = configHome;
    saveCliConfig({ userAgent: 'ENDL-TradeBot/1.0' }, undefined, undefined, env);
    const config = createDefaultConfig({}, env);
    const configWithOverrides = createDefaultConfig({
      apiBase: 'https://custom-test.spacemolt.com/api/v2',
      jsonOutput: true,
      userAgent: 'OverrideBot/2.0',
    });

    expect(config).toMatchObject({
      apiBase: 'https://env-test.spacemolt.com/api/v2',
      jsonOutput: true,
      debug: true,
      format: 'json',
      profile: 'env-pilot',
      userAgent: 'ENDL-TradeBot/1.0',
    });
    expect(Object.isFrozen(config)).toBe(true);
    expect(configWithOverrides.apiBase).toBe('https://custom-test.spacemolt.com/api/v2');
    expect(configWithOverrides.jsonOutput).toBe(true);
    expect(configWithOverrides.userAgent).toBe('OverrideBot/2.0');
    fs.rmSync(configHome, { recursive: true, force: true });
  });

  test('client entrypoint omits removed legacy runtime exports', () => {
    expect('LegacySpaceMoltConfig' in clientEntrypoint).toBe(false);
    expect('GlobalBackedConfig' in clientEntrypoint).toBe(false);
    expect('setOutputMode' in clientEntrypoint).toBe(false);
  });

  test('SessionManager isolates default and explicit profile paths', () => {
    const originalConfigHome = process.env.XDG_CONFIG_HOME;
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-config-test-'));
    process.env.XDG_CONFIG_HOME = configHome;
    try {
      setActiveProfile(undefined);
      setDefaultProfile('default-pilot');

      const defaultManager = new SessionManager();
      expect(defaultManager.getSessionPath()).toContain('sessions/default-pilot.json');

      const profileManager = new SessionManager({ profile: 'test-profile-123' });
      expect(profileManager.getSessionPath()).toContain('sessions/test-profile-123.json');
    } finally {
      setActiveProfile(undefined);
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
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runtime-config-user-agent-'));
    fs.mkdirSync(path.join(configHome, 'spacemolt-cli'), { recursive: true });
    fs.writeFileSync(
      getCliConfigPath(undefined, undefined, { XDG_CONFIG_HOME: configHome }),
      `${JSON.stringify({ userAgent: 'ConfigBot/1.0' }, null, 2)}\n`,
    );

    const config = getRuntimeConfig(options, { XDG_CONFIG_HOME: configHome });
    expect(config.jsonOutput).toBe(true);
    expect(config.plain).toBe(true);
    expect(config.quiet).toBe(true);
    expect(config.compact).toBe(true);
    expect(config.debug).toBe(true);
    expect(config.profile).toBe('my-custom-profile');
    expect(config.userAgent).toBe('ConfigBot/1.0');
    fs.rmSync(configHome, { recursive: true, force: true });
  });

  test('loadCliConfig ignores invalid user agent values from config.json', () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-invalid-user-agent-'));
    fs.mkdirSync(path.join(configHome, 'spacemolt-cli'), { recursive: true });
    fs.writeFileSync(
      getCliConfigPath(undefined, undefined, { XDG_CONFIG_HOME: configHome }),
      `${JSON.stringify({ defaultProfile: 'pilot', userAgent: 'bad\nagent' }, null, 2)}\n`,
    );

    expect(loadCliConfig(undefined, undefined, { XDG_CONFIG_HOME: configHome })).toEqual({
      defaultProfile: 'pilot',
    });

    fs.rmSync(configHome, { recursive: true, force: true });
  });

  test('loadCliConfig accepts boolean fuzzyIds and ignores non-boolean values', () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-fuzzy-ids-config-'));
    const env = { XDG_CONFIG_HOME: configHome };
    fs.mkdirSync(path.join(configHome, 'spacemolt-cli'), { recursive: true });
    const configPath = getCliConfigPath(undefined, undefined, env);

    fs.writeFileSync(configPath, `${JSON.stringify({ defaultProfile: 'pilot', fuzzyIds: true })}\n`);
    expect(loadCliConfig(undefined, undefined, env)).toEqual({ defaultProfile: 'pilot', fuzzyIds: true });

    fs.writeFileSync(configPath, `${JSON.stringify({ defaultProfile: 'pilot', fuzzyIds: 'true' })}\n`);
    expect(loadCliConfig(undefined, undefined, env)).toEqual({ defaultProfile: 'pilot' });

    fs.writeFileSync(configPath, `${JSON.stringify({ defaultProfile: 'pilot', fuzzyIds: 1 })}\n`);
    expect(loadCliConfig(undefined, undefined, env)).toEqual({ defaultProfile: 'pilot' });

    fs.rmSync(configHome, { recursive: true, force: true });
  });

  test('resolveFuzzyIdsEnabled precedence is CLI > env > config boolean > false', () => {
    expect(resolveFuzzyIdsEnabled({}, {}, {})).toBe(false);
    expect(resolveFuzzyIdsEnabled({}, {}, { fuzzyIds: true })).toBe(true);
    expect(resolveFuzzyIdsEnabled({}, { SPACEMOLT_FUZZY_IDS: '1' }, { fuzzyIds: false })).toBe(true);
    expect(resolveFuzzyIdsEnabled({}, { SPACEMOLT_FUZZY_IDS: 'false' }, { fuzzyIds: true })).toBe(false);
    expect(resolveFuzzyIdsEnabled({}, { SPACEMOLT_FUZZY_IDS: '0' }, { fuzzyIds: true })).toBe(false);
    expect(resolveFuzzyIdsEnabled({}, { SPACEMOLT_FUZZY_IDS: 'true' }, {})).toBe(true);
    // CLI explicit wins over env and config.
    expect(
      resolveFuzzyIdsEnabled(
        { fuzzyIds: false, fuzzyIdsCliExplicit: true },
        { SPACEMOLT_FUZZY_IDS: '1' },
        { fuzzyIds: true },
      ),
    ).toBe(false);
    expect(
      resolveFuzzyIdsEnabled(
        { fuzzyIds: true, fuzzyIdsCliExplicit: true },
        { SPACEMOLT_FUZZY_IDS: '0' },
        { fuzzyIds: false },
      ),
    ).toBe(true);
    // Non-boolean config is ignored (caller typically strips via loadCliConfig).
    expect(resolveFuzzyIdsEnabled({}, {}, { fuzzyIds: 'yes' as unknown as boolean })).toBe(false);
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
      userAgent: 'StateBot/1.0',
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
      userAgent: 'StateBot/1.0',
    });
  });

  test('createRuntimeState requires explicit config state', () => {
    // @ts-expect-error createRuntimeState no longer supports implicit global-backed state.
    expect(() => createRuntimeState()).toThrow();
  });
});
