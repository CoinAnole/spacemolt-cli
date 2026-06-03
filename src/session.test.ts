import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { requestJson } from './transport.ts';
import type { APIResponse, JsonRequestOptions, JsonResponse } from './types.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-session-test-'));
const testEnv = { HOME: tempDir, XDG_CONFIG_HOME: path.join(tempDir, '.config') };

// Mock node:os before importing session.ts
mock.module('node:os', () => {
  return {
    default: {
      ...os,
      homedir: () => tempDir,
    },
    ...os,
    homedir: () => tempDir,
  };
});

const {
  getCliConfigPath,
  getDefaultProfile,
  listProfileNames,
  getSpacemoltHome,
  loadCliConfig,
  saveCliConfig,
  SessionManager,
  setActiveProfile,
  setDefaultProfile,
  showDefaultProfile,
} = await import('./session.ts');

const publicClient = await import('./client.ts');

import type { Session } from './types.ts';

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

beforeEach(() => {
  setActiveProfile(undefined);
});

describe('SessionManager', () => {
  test('session paths always resolve to named profile files', async () => {
    const manager = new SessionManager({ profile: 'test_profile', env: testEnv });
    const expectedPath = path.join(tempDir, '.config', 'spacemolt-cli', 'sessions', 'test_profile.json');
    expect(manager.getSessionPath()).toBe(expectedPath);

    setDefaultProfile('default_pilot', undefined, undefined, testEnv);
    const defaultManager = new SessionManager({ env: testEnv });
    expect(defaultManager.getSessionPath()).toBe(
      path.join(tempDir, '.config', 'spacemolt-cli', 'sessions', 'default_pilot.json'),
    );

    const sessionObj: Session = {
      id: 'sess_test_perms',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    await manager.saveSession(sessionObj);

    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.config', 'spacemolt-cli', 'session.json'))).toBe(false);

    if (process.platform !== 'win32') {
      expect(fs.statSync(expectedPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(expectedPath)).mode & 0o777).toBe(0o700);
    }

    expect(await manager.loadSession()).toEqual(sessionObj);
  });

  test('new profile session paths normalize capitalization', () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'profile-normalize-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const manager = new SessionManager({ profile: 'Arbogast', env });

    expect(manager.getSessionPath()).toBe(path.join(home, '.config', 'spacemolt-cli', 'sessions', 'arbogast.json'));
  });

  test('session paths reuse a unique nearby saved profile name', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'profile-typo-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const sessionsDir = path.join(home, '.config', 'spacemolt-cli', 'sessions');
    const existingPath = path.join(sessionsDir, 'fuelrescue.json');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      existingPath,
      JSON.stringify({
        id: 'sess_fuelrescue',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );

    const manager = new SessionManager({ profile: 'fuelresue', env });

    expect(manager.getSessionPath()).toBe(existingPath);
    expect((await manager.loadSession())?.id).toBe('sess_fuelrescue');
    expect(fs.existsSync(path.join(sessionsDir, 'fuelresue.json'))).toBe(false);
  });

  test('missing active and default profile produces an actionable error', async () => {
    const configPath = path.join(tempDir, '.config', 'spacemolt-cli', 'config.json');
    fs.rmSync(configPath, { force: true });

    const manager = new SessionManager({ env: testEnv });
    expect(() => new SessionManager({ env: testEnv }).getSessionPath()).toThrow(
      'No default profile set. Run "spacemolt login <username> <password>" or use "--profile <name>".',
    );
    await expect(manager.loadSession()).rejects.toThrow(
      'No default profile set. Run "spacemolt login <username> <password>" or use "--profile <name>".',
    );
  });

  test('explicit options construction does not read active profile fallback', () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'explicit-no-active-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    setActiveProfile('leaked');

    expect(() => new SessionManager({ env }).getSessionPath()).toThrow(
      'No default profile set. Run "spacemolt login <username> <password>" or use "--profile <name>".',
    );
  });

  test('legacy no-argument construction still reads active profile fallback', () => {
    setActiveProfile('legacy-active');

    expect(new SessionManager().getSessionPath()).toContain('legacy-active.json');
  });

  test('default app directory follows Linux, macOS, and Windows conventions', () => {
    expect(getSpacemoltHome('/home/tester', 'linux', {})).toBe('/home/tester/.config/spacemolt-cli');
    expect(getSpacemoltHome('/home/tester', 'linux', { XDG_CONFIG_HOME: '/tmp/config' })).toBe(
      '/tmp/config/spacemolt-cli',
    );
    expect(getSpacemoltHome('/Users/tester', 'darwin', {})).toBe(
      '/Users/tester/Library/Application Support/spacemolt-cli',
    );
    expect(
      getSpacemoltHome('C:\\Users\\tester', 'win32', {
        APPDATA: 'C:\\Users\\tester\\AppData\\Roaming',
      }),
    ).toBe(path.win32.join('C:\\Users\\tester\\AppData\\Roaming', 'spacemolt-cli'));
    expect(getSpacemoltHome('C:\\Users\\tester', 'win32', {})).toBe(
      path.win32.join('C:\\Users\\tester', 'AppData', 'Roaming', 'spacemolt-cli'),
    );
  });

  test('CLI config stores the default profile in the config root', () => {
    expect(getCliConfigPath(undefined, undefined, testEnv)).toBe(
      path.join(tempDir, '.config', 'spacemolt-cli', 'config.json'),
    );
  });

  test('default profile config is read and written with hardened permissions', () => {
    const configPath = path.join(tempDir, '.config', 'spacemolt-cli', 'config.json');
    fs.rmSync(configPath, { force: true });

    expect(loadCliConfig(undefined, undefined, testEnv)).toEqual({});
    expect(getDefaultProfile(undefined, undefined, testEnv)).toBeUndefined();

    saveCliConfig({ defaultProfile: 'marlowe' }, undefined, undefined, testEnv);
    expect(loadCliConfig(undefined, undefined, testEnv)).toEqual({ defaultProfile: 'marlowe' });

    setDefaultProfile('marlowe', undefined, undefined, testEnv);

    expect(getDefaultProfile(undefined, undefined, testEnv)).toBe('marlowe');
    expect(loadCliConfig(undefined, undefined, testEnv)).toEqual({ defaultProfile: 'marlowe' });

    expect(JSON.parse(fs.readFileSync(configPath, 'utf-8'))).toEqual({ defaultProfile: 'marlowe' });
    if (process.platform !== 'win32') {
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(configPath)).mode & 0o777).toBe(0o700);
    }
  });

  test('showDefaultProfile writes no-default and current-default messages', () => {
    const configPath = path.join(tempDir, '.config', 'spacemolt-cli', 'config.json');
    fs.rmSync(configPath, { force: true });
    const stdout: string[] = [];
    const writer = { out: (message: string) => stdout.push(message) };

    showDefaultProfile(writer, undefined, undefined, testEnv);
    setDefaultProfile('marlowe', undefined, undefined, testEnv);
    showDefaultProfile(writer, undefined, undefined, testEnv);

    expect(stdout).toEqual(['No default profile set.', 'Default profile: marlowe']);
  });

  test('listProfileNames returns saved profile names without session contents', () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'profile-names-'));
    const sessionsDir = path.join(home, '.config', 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.json'),
      JSON.stringify({ username: 'pilot_user', password: 'secret', player_id: 'player_pilot' }),
    );
    fs.writeFileSync(path.join(sessionsDir, 'marlowe.json'), JSON.stringify({ id: 'sess_marlowe' }));
    fs.writeFileSync(path.join(sessionsDir, 'pilot.ids.json'), JSON.stringify({ hints: [] }));
    fs.writeFileSync(path.join(sessionsDir, 'pilot_state.json'), JSON.stringify({ state: true }));

    expect(listProfileNames(home, 'linux', {})).toEqual(['marlowe', 'pilot']);
  });

  test('public client exports default profile display helper', () => {
    expect(publicClient.showDefaultProfile).toBe(showDefaultProfile);
  });

  test('ensureDefaultProfile initializes only when no default exists', () => {
    const configPath = path.join(tempDir, '.config', 'spacemolt-cli', 'config.json');
    fs.rmSync(configPath, { force: true });

    const manager = new SessionManager({ env: testEnv });
    manager.ensureDefaultProfile();
    expect(getDefaultProfile(undefined, undefined, testEnv)).toBeUndefined();

    manager.ensureDefaultProfile('first_pilot');
    expect(getDefaultProfile(undefined, undefined, testEnv)).toBe('first_pilot');

    manager.ensureDefaultProfile('second_pilot');
    expect(getDefaultProfile(undefined, undefined, testEnv)).toBe('first_pilot');
  });

  test('invalid default profile config is ignored', () => {
    const configDir = path.join(tempDir, '.config', 'spacemolt-cli');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.json'), '{"defaultProfile":"../bad"}\n');

    expect(loadCliConfig(undefined, undefined, testEnv)).toEqual({});
    expect(getDefaultProfile(undefined, undefined, testEnv)).toBeUndefined();
  });

  test('credential files are ignored', async () => {
    const configDir = path.join(tempDir, '.config', 'spacemolt-cli');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'spacemolt_credentials.yaml'),
      'credentials:\n  test_profile:\n    username: ignored\n    password: ignored\n',
    );

    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: (async () => ({
        status: 200,
        ok: true,
        data: {
          session: {
            id: 'sess_created_without_credentials',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      })) as unknown as typeof requestJson,
    });

    const session = await manager.createSession();
    expect(session.username).toBeUndefined();
    expect(session.password).toBeUndefined();
  });

  test('new profile sessions are created without separate credential seeding', async () => {
    let transportCalled = false;
    const mockTransport = async (url: string, options?: JsonRequestOptions): Promise<JsonResponse<APIResponse>> => {
      transportCalled = true;
      expect(url).toBe('https://api.spacemolt.test/api/v2/session');
      expect(options?.method).toBe('POST');
      return {
        status: 200,
        ok: true,
        data: {
          session: {
            id: 'sess_created_123',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          },
        },
      };
    };

    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: mockTransport as unknown as typeof requestJson,
    });

    const session = await manager.createSession();
    expect(transportCalled).toBe(true);
    expect(session.id).toBe('sess_created_123');
    expect(session.username).toBeUndefined();
    expect(session.password).toBeUndefined();

    const loaded = await manager.loadSession();
    expect(loaded?.id).toBe('sess_created_123');
    expect(loaded?.username).toBeUndefined();
    expect(loaded?.password).toBeUndefined();
  });

  test('profile auth success behavior', async () => {
    const mockAuthResponse = {
      session: {
        id: 'sess_auth_success',
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 7200000).toISOString(),
        player_id: 'player_auth_success',
      },
      structuredContent: {
        player: { id: 'player_auth_success' },
      },
    };

    let authCalled = false;
    const mockTransport = async (url: string, options?: JsonRequestOptions): Promise<JsonResponse<APIResponse>> => {
      authCalled = true;
      expect(url).toBe('https://api.spacemolt.test/api/v2/spacemolt_auth/login');
      expect(options?.method).toBe('POST');
      expect(options?.payload).toEqual({ username: 'my_user', password: 'my_password' });
      return {
        status: 200,
        ok: true,
        data: mockAuthResponse,
      };
    };

    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: mockTransport as unknown as typeof requestJson,
    });

    const sessionObj: Session = {
      id: 'sess_auth_success',
      username: 'my_user',
      password: 'my_password',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    const result = await manager.authenticateProfileSession(sessionObj);
    expect(authCalled).toBe(true);
    expect(result).toBeNull();

    expect(sessionObj.player_id).toBe('player_auth_success');
    expect(sessionObj.expires_at).toBe(mockAuthResponse.session.expires_at);

    const loaded = await manager.loadSession();
    expect(loaded?.player_id).toBe('player_auth_success');
  });

  test('profile auth uses configured default profile when no active profile is set', async () => {
    const configPath = path.join(tempDir, '.config', 'spacemolt-cli', 'config.json');
    fs.rmSync(configPath, { force: true });
    setDefaultProfile('default_auth_profile', undefined, undefined, testEnv);

    let authCalled = false;
    const mockTransport = async (_url: string, options?: JsonRequestOptions): Promise<JsonResponse<APIResponse>> => {
      authCalled = true;
      expect(options?.sessionId).toBe('sess_default_auth');
      expect(options?.payload).toEqual({ username: 'default_user', password: 'default_password' });
      return {
        status: 200,
        ok: true,
        data: {
          session: {
            id: 'sess_default_auth',
            created_at: new Date().toISOString(),
            expires_at: new Date(Date.now() + 7200000).toISOString(),
            player_id: 'player_default_auth',
          },
        },
      };
    };

    const manager = new SessionManager({
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: mockTransport as unknown as typeof requestJson,
    });
    const sessionObj: Session = {
      id: 'sess_default_auth',
      username: 'default_user',
      password: 'default_password',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    const result = await manager.authenticateProfileSession(sessionObj);

    expect(authCalled).toBe(true);
    expect(result).toBeNull();
    expect(sessionObj.player_id).toBe('player_default_auth');
    expect(await manager.loadSession()).toEqual(sessionObj);
  });

  test('profile auth failure behavior', async () => {
    let authCalled = false;
    const mockTransport = async (): Promise<JsonResponse<APIResponse>> => {
      authCalled = true;
      return {
        status: 200,
        ok: true,
        data: {
          error: {
            code: 'invalid_credentials',
            message: 'Invalid username or password.',
          },
        },
      };
    };

    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: mockTransport as unknown as typeof requestJson,
    });

    const sessionObj: Session = {
      id: 'sess_auth_fail',
      username: 'my_user',
      password: 'wrong_password',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    const result = await manager.authenticateProfileSession(sessionObj);
    expect(authCalled).toBe(true);
    expect(result).not.toBeNull();
    expect(result?.error?.code).toBe('invalid_credentials');
    expect(sessionObj.player_id).toBeUndefined();
  });

  test('valid vs expired session handling', async () => {
    const fixedNow = Date.now();
    let transportCalled = false;
    let mockTransportImpl: (url: string, options?: JsonRequestOptions) => Promise<JsonResponse<APIResponse>> =
      async () => {
        transportCalled = true;
        return { status: 500, ok: false, data: {} };
      };
    const mockTransport = async (url: string, options?: JsonRequestOptions): Promise<JsonResponse<APIResponse>> =>
      mockTransportImpl(url, options);

    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: mockTransport as unknown as typeof requestJson,
      clock: () => fixedNow,
    });

    const validSession: Session = {
      id: 'sess_valid',
      created_at: new Date(fixedNow).toISOString(),
      expires_at: new Date(fixedNow + 7200000).toISOString(),
    };
    await manager.saveSession(validSession);

    const session1 = await manager.getSession();
    expect(transportCalled).toBe(false);
    expect(session1.id).toBe('sess_valid');

    const expiredSession: Session = {
      id: 'sess_expired',
      created_at: new Date(fixedNow).toISOString(),
      expires_at: new Date(fixedNow - 5000).toISOString(),
    };
    await manager.saveSession(expiredSession);

    mockTransportImpl = async (url: string): Promise<JsonResponse<APIResponse>> => {
      transportCalled = true;
      expect(url).toBe('https://api.spacemolt.test/api/v2/session');
      return {
        status: 200,
        ok: true,
        data: {
          session: {
            id: 'sess_refreshed',
            created_at: new Date(fixedNow).toISOString(),
            expires_at: new Date(fixedNow + 3600000).toISOString(),
          },
        },
      };
    };

    const session2 = await manager.getSession();
    expect(transportCalled).toBe(true);
    expect(session2.id).toBe('sess_refreshed');
  });

  test('expired session refresh preserves saved credentials without stale player id', async () => {
    const fixedNow = Date.now();
    const manager = new SessionManager({
      profile: 'refresh_credentials_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      transport: (async (url: string): Promise<JsonResponse<APIResponse>> => {
        expect(url).toBe('https://api.spacemolt.test/api/v2/session');
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_refreshed_with_credentials',
              created_at: new Date(fixedNow).toISOString(),
              expires_at: new Date(fixedNow + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
      clock: () => fixedNow,
    });

    await manager.saveSession({
      id: 'sess_expired_with_credentials',
      username: 'marlowe',
      password: 'secret',
      player_id: 'player_marlowe',
      created_at: new Date(fixedNow).toISOString(),
      expires_at: new Date(fixedNow - 5000).toISOString(),
    });

    const session = await manager.getSession();
    expect(session).toMatchObject({
      id: 'sess_refreshed_with_credentials',
      username: 'marlowe',
      password: 'secret',
    });
    expect(session.player_id).toBeUndefined();

    const loaded = await manager.loadSession();
    expect(loaded).toEqual(session);
  });
});
