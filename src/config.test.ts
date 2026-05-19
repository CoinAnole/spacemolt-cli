import { describe, expect, test } from 'bun:test';
import { SpaceMoltClient } from './api.ts';
import { getSessionPath, SessionManager } from './session.ts';
import { createDefaultConfig, LegacySpaceMoltConfig } from './runtime.ts';
import { getRuntimeConfig } from './main.ts';

describe('Explicit Runtime Configuration', () => {
  test('LegacySpaceMoltConfig resolves globals dynamically', () => {
    const config = new LegacySpaceMoltConfig();

    // Verify it resolves base URL
    expect(config.apiBase).toBeDefined();

    // Verify overriding specific fields works
    const configWithOverrides = createDefaultConfig({
      apiBase: 'https://custom-test.spacemolt.com/api/v2',
      jsonOutput: true,
    });

    expect(configWithOverrides.apiBase).toBe('https://custom-test.spacemolt.com/api/v2');
    expect(configWithOverrides.jsonOutput).toBe(true);
  });

  test('SessionManager isolates paths based on config', () => {
    // Default session manager resolves default or global session
    const defaultManager = new SessionManager();
    const defaultPath = defaultManager.getSessionPath();
    expect(defaultPath).toContain('session.json');

    // Custom sessionPath override
    const customPath = '/tmp/custom-spacemolt-session-test.json';
    const customManager = new SessionManager({ sessionPath: customPath });
    expect(customManager.getSessionPath()).toBe(customPath);

    // Profile-based session override
    const profileManager = new SessionManager({ profile: 'test-profile-123' });
    expect(profileManager.getSessionPath()).toContain('sessions/test-profile-123.json');
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
      args: [],
      format: 'json' as const,
      profile: 'my-custom-profile',
    };

    const config = getRuntimeConfig(options);
    expect(config.jsonOutput).toBe(true);
    expect(config.plain).toBe(true);
    expect(config.quiet).toBe(true);
    expect(config.compact).toBe(true);
    expect(config.profile).toBe('my-custom-profile');
  });
});
