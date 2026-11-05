import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ServiceUnavailableError } from './errors.ts';
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
  mergePublishedSession,
  saveCliConfig,
  SessionManager,
  setActiveProfile,
  setDefaultProfile,
  showDefaultProfile,
  updateCliConfig,
} = await import('./session.ts');

const { acquireAdvisoryLock, lockOwnerAlive, procStatStartTicks, processStartedAfterLock, staleAdvisoryLockDecision } =
  await import('./advisory-lock.ts');

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

  test('similar saved profile names never influence a requested profile path', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'profile-exact-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const sessionsDir = path.join(home, '.config', 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'arbiter67.json'),
      JSON.stringify({
        id: 'sess_arbiter67',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );

    const manager = new SessionManager({ profile: 'Arbiter47', profileIsExplicit: true, env });

    expect(manager.getSessionPath()).toBe(path.join(sessionsDir, 'arbiter47.json'));
    expect(await manager.loadSession()).toBeNull();
    await expect(manager.getSession()).rejects.toThrow('No saved session for profile "arbiter47"');
  });

  test('normalization does not case-match a legacy filename', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'profile-case-exact-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const sessionsDir = path.join(home, '.config', 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(sessionsDir, 'Arbiter47.json'), JSON.stringify({ id: 'legacy' }));

    const manager = new SessionManager({ profile: 'ARBITER47', env });

    expect(manager.getSessionPath()).toBe(path.join(sessionsDir, 'arbiter47.json'));
    expect(await manager.loadSession()).toBeNull();
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

    updateCliConfig((config) => ({ ...config, userAgent: 'FleetBot/1.0' }), undefined, undefined, testEnv);
    expect(loadCliConfig(undefined, undefined, testEnv)).toEqual({
      defaultProfile: 'marlowe',
      userAgent: 'FleetBot/1.0',
    });
    if (process.platform !== 'win32') {
      expect(fs.statSync(configPath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(configPath)).mode & 0o777).toBe(0o700);
    }
  });

  test('concurrent config mutations preserve unrelated fields', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'config-concurrent-'));
    const configHome = path.join(home, '.config');
    const moduleUrl = pathToFileURL(path.join(import.meta.dir, 'session.ts')).href;
    const env = { ...process.env, HOME: home, XDG_CONFIG_HOME: configHome };
    const first = Bun.spawn(
      [
        process.execPath,
        '-e',
        `const { updateCliConfig } = await import(${JSON.stringify(moduleUrl)}); updateCliConfig((c) => { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); return { ...c, defaultProfile: 'arbiter47' }; });`,
      ],
      { env, stdout: 'pipe', stderr: 'pipe' },
    );
    await Bun.sleep(20);
    const second = Bun.spawn(
      [
        process.execPath,
        '-e',
        `const { updateCliConfig } = await import(${JSON.stringify(moduleUrl)}); updateCliConfig((c) => ({ ...c, userAgent: 'FleetBot/1.0' }));`,
      ],
      { env, stdout: 'pipe', stderr: 'pipe' },
    );

    expect(await Promise.all([first.exited, second.exited])).toEqual([0, 0]);
    expect(loadCliConfig(home, undefined, env)).toEqual({
      defaultProfile: 'arbiter47',
      userAgent: 'FleetBot/1.0',
    });
    expect(fs.existsSync(`${getCliConfigPath(home, undefined, env)}.lock`)).toBe(false);
  });

  test('config updates recover a lock owned by an exited process', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'config-dead-lock-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const configPath = getCliConfigPath(home, undefined, env);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    const child = Bun.spawn([process.execPath, '-e', ''], { stdout: 'ignore', stderr: 'ignore' });
    expect(await child.exited).toBe(0);
    fs.writeFileSync(`${configPath}.lock`, `${child.pid}\n`);

    setDefaultProfile('arbiter47', home, undefined, env);

    expect(getDefaultProfile(home, undefined, env)).toBe('arbiter47');
    expect(fs.existsSync(`${configPath}.lock`)).toBe(false);
  });

  test('config updates recover an old malformed lock', () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'config-old-lock-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const configPath = getCliConfigPath(home, undefined, env);
    const lockPath = `${configPath}.lock`;
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(lockPath, 'not-a-pid\n');
    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(lockPath, old, old);

    setDefaultProfile('arbiter47', home, undefined, env);

    expect(getDefaultProfile(home, undefined, env)).toBe('arbiter47');
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  test('config updates fail clearly while a live process owns the lock', () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'config-live-lock-'));
    const env = { HOME: home, XDG_CONFIG_HOME: path.join(home, '.config') };
    const configPath = getCliConfigPath(home, undefined, env);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(`${configPath}.lock`, `${process.pid}\n`);

    expect(() => setDefaultProfile('arbiter47', home, undefined, env)).toThrow(
      `Timed out waiting to update CLI configuration at ${configPath}.`,
    );

    fs.unlinkSync(`${configPath}.lock`);
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
    // The valid session's later expiry would be kept across this id change.
    await fs.promises.unlink(manager.getSessionPath());

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

  test('createTransientSession retries a 503 then succeeds', async () => {
    const waits: number[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onRetryWait: (seconds) => {
        waits.push(seconds);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 503,
            ok: false,
            retryAfterHeader: '2',
            data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_after_503',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });

    const session = await manager.createTransientSession();
    expect(session.id).toBe('sess_after_503');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
    expect(waits).toEqual([2]);
  });

  test('createTransientSession throws ServiceUnavailableError after four 503s', async () => {
    let calls = 0;
    const waits: number[] = [];
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async () => {},
      onRetryWait: (seconds) => {
        waits.push(seconds);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        return {
          status: 503,
          ok: false,
          retryAfterHeader: '2',
          data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
        };
      }) as unknown as typeof requestJson,
    });

    try {
      await manager.createTransientSession();
      throw new Error('expected ServiceUnavailableError');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableError);
      expect((error as Error).message).not.toContain('Failed to create session: invalid token');
      expect((error as ServiceUnavailableError).code).toBe('service_unavailable');
    }
    expect(calls).toBe(4);
    expect(waits).toEqual([2, 2, 2]);
  });

  test('createTransientSession retries rate_limited then succeeds', async () => {
    const waits: number[] = [];
    const rateLimitWaits: number[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onRetryWait: (seconds) => {
        waits.push(seconds);
      },
      onRateLimitWait: (seconds) => {
        rateLimitWaits.push(seconds);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 429,
            ok: false,
            data: { error: { code: 'rate_limited', message: 'slow down', retry_after: 2 } },
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_after_429',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });

    const session = await manager.createTransientSession();
    expect(session.id).toBe('sess_after_429');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
    expect(rateLimitWaits).toEqual([2]);
    expect(waits).toEqual([]);
  });

  test('createTransientSession retries details.retry_after and header-only integer Retry-After', async () => {
    const detailsSleeps: number[] = [];
    let detailsCalls = 0;
    const detailsManager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        detailsSleeps.push(ms);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        detailsCalls += 1;
        if (detailsCalls === 1) {
          return {
            status: 429,
            ok: false,
            data: { error: { code: 'rate_limited', message: 'slow down', details: { retry_after: 2 } } },
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_details',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });
    expect((await detailsManager.createTransientSession()).id).toBe('sess_details');
    expect(detailsCalls).toBe(2);
    expect(detailsSleeps).toEqual([2000]);

    const headerSleeps: number[] = [];
    let headerCalls = 0;
    const headerManager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        headerSleeps.push(ms);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        headerCalls += 1;
        if (headerCalls === 1) {
          return {
            status: 429,
            ok: false,
            retryAfterHeader: '2',
            data: { error: { code: 'rate_limited', message: 'slow down' } },
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_header',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });
    expect((await headerManager.createTransientSession()).id).toBe('sess_header');
    expect(headerCalls).toBe(2);
    expect(headerSleeps).toEqual([2000]);
  });

  test('createTransientSession hydrates a flat 429 string error then retries', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 429,
            ok: false,
            data: { error: 'rate_limited', message: 'slow down', retry_after: 2 } as unknown as APIResponse,
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_flat_429',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });

    const session = await manager.createTransientSession();
    expect(session.id).toBe('sess_flat_429');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([2000]);
  });

  test('createTransientSession exhausts four rate_limited responses without ServiceUnavailableError', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        return {
          status: 429,
          ok: false,
          data: { error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } },
        };
      }) as unknown as typeof requestJson,
    });

    try {
      await manager.createTransientSession();
      throw new Error('expected session create failure');
    } catch (error) {
      expect(error).not.toBeInstanceOf(ServiceUnavailableError);
      expect((error as Error).message).toBe('Failed to create session: slow down');
    }
    expect(calls).toBe(4);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  test('createTransientSession does not retry wait 61, ip_timed_out, or action_pending', async () => {
    async function rejectOnce(
      data: APIResponse,
      status = 429,
    ): Promise<{
      calls: number;
      sleeps: number[];
      message: string;
    }> {
      let calls = 0;
      const sleeps: number[] = [];
      const manager = new SessionManager({
        profile: 'test_profile',
        apiBase: 'https://api.spacemolt.test/api/v2',
        env: testEnv,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
        transport: (async (): Promise<JsonResponse<APIResponse>> => {
          calls += 1;
          return { status, ok: false, data };
        }) as unknown as typeof requestJson,
      });
      try {
        await manager.createTransientSession();
        throw new Error('expected session create failure');
      } catch (error) {
        expect(error).not.toBeInstanceOf(ServiceUnavailableError);
        return { calls, sleeps, message: (error as Error).message };
      }
    }

    const tooLong = await rejectOnce({ error: { code: 'rate_limited', message: 'too long', retry_after: 61 } });
    expect(tooLong.calls).toBe(1);
    expect(tooLong.sleeps).toEqual([]);
    expect(tooLong.message).toBe('Failed to create session: too long');

    const timedOut = await rejectOnce({
      error: { code: 'ip_timed_out', message: 'IP timed out for 120 seconds', retry_after: 120 },
    });
    expect(timedOut.calls).toBe(1);
    expect(timedOut.sleeps).toEqual([]);
    expect(timedOut.message).toBe('Failed to create session: IP timed out for 120 seconds');

    const pending = await rejectOnce({
      error: { code: 'action_pending', message: 'queued', retry_after: 10, pending_command: 'mine' },
    });
    expect(pending.calls).toBe(1);
    expect(pending.sleeps).toEqual([]);
    expect(pending.message).toBe('Failed to create session: queued');
  });

  test('createTransientSession does not retry ip_timed_out with details.retry_after under the 60s cap', async () => {
    let calls = 0;
    const sleeps: number[] = [];
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        return {
          status: 429,
          ok: false,
          data: {
            error: {
              code: 'ip_timed_out',
              message: 'This IP is temporarily blocked.',
              details: { retry_after: 30, limit: 'ip_timeout', scope: 'per_ip' },
            },
          },
        };
      }) as unknown as typeof requestJson,
    });

    try {
      await manager.createTransientSession();
      throw new Error('expected session create failure');
    } catch (error) {
      expect(error).not.toBeInstanceOf(ServiceUnavailableError);
      expect((error as Error).message).toBe('Failed to create session: This IP is temporarily blocked.');
    }
    expect(calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test('createTransientSession keeps 503 and rate-limit retry budgets independent', async () => {
    const unavailableWaits: number[] = [];
    const rateLimitWaits: number[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      onRetryWait: (seconds) => {
        unavailableWaits.push(seconds);
      },
      onRateLimitWait: (seconds) => {
        rateLimitWaits.push(seconds);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 503,
            ok: false,
            retryAfterHeader: '2',
            data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
          };
        }
        if (calls === 2) {
          return {
            status: 429,
            ok: false,
            data: { error: { code: 'rate_limited', message: 'slow down', retry_after: 3 } },
          };
        }
        return {
          status: 200,
          ok: true,
          data: {
            session: {
              id: 'sess_mixed',
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            },
          },
        };
      }) as unknown as typeof requestJson,
    });

    const session = await manager.createTransientSession();
    expect(session.id).toBe('sess_mixed');
    expect(calls).toBe(3);
    expect(sleeps).toEqual([2000, 3000]);
    expect(unavailableWaits).toEqual([2]);
    expect(rateLimitWaits).toEqual([3]);
  });

  test('authenticateProfileSession returns service_unavailable after four 503s', async () => {
    let calls = 0;
    const waits: number[] = [];
    const manager = new SessionManager({
      profile: 'test_profile',
      apiBase: 'https://api.spacemolt.test/api/v2',
      env: testEnv,
      sleep: async () => {},
      onRetryWait: (seconds) => {
        waits.push(seconds);
      },
      transport: (async (): Promise<JsonResponse<APIResponse>> => {
        calls += 1;
        return {
          status: 503,
          ok: false,
          retryAfterHeader: '0',
          data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
        };
      }) as unknown as typeof requestJson,
    });
    const sessionObj: Session = {
      id: 'sess_auth_503',
      username: 'my_user',
      password: 'my_password',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };

    const result = await manager.authenticateProfileSession(sessionObj);
    expect(result?.error?.code).toBe('service_unavailable');
    expect(result?.error?.code).not.toBe('invalid_credentials');
    expect(calls).toBe(4);
    expect(waits).toEqual([0, 0, 0]);
    expect(sessionObj.player_id).toBeUndefined();
  });

  test('mergePublishedSession keeps omitted credentials and the later expiry for the same id', () => {
    const incoming: Session = {
      id: 'same',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
    };
    const result = mergePublishedSession(incoming, {
      id: 'same',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-05-01T00:00:00.000Z',
      username: 'pilot',
      password: 'secret',
      player_id: 'player_1',
    });

    expect(result).not.toBe(incoming);
    expect(incoming.password).toBeUndefined();
    expect(result).toMatchObject({
      id: 'same',
      username: 'pilot',
      password: 'secret',
      player_id: 'player_1',
      expires_at: '2026-06-06T00:00:00.000Z',
    });
  });

  test('mergePublishedSession lets a non-empty incoming password replace the saved one', () => {
    const result = mergePublishedSession(
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-05-01T00:00:00.000Z',
        password: 'new-secret',
      },
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-06-06T00:00:00.000Z',
        password: 'secret',
      },
    );

    expect(result.password).toBe('new-secret');
  });

  test('mergePublishedSession does not copy credentials onto a different id', () => {
    const result = mergePublishedSession(
      {
        id: 'new',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-05-01T00:00:00.000Z',
      },
      {
        id: 'old',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-06-06T00:00:00.000Z',
        username: 'pilot',
        password: 'secret',
        player_id: 'player_1',
      },
    );

    expect(result.password).toBeUndefined();
    expect(result.username).toBeUndefined();
    expect(result.player_id).toBeUndefined();
    expect(result.expires_at).toBe('2026-06-06T00:00:00.000Z');
    expect(result.id).toBe('new');
  });

  test('mergePublishedSession publishes incoming when the file has no session id', () => {
    const incoming: Session = {
      id: 'incoming',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
      password: 'secret',
    };

    expect(mergePublishedSession(incoming, null)).toBe(incoming);
    expect(
      mergePublishedSession(incoming, {
        id: '',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-07-01T00:00:00.000Z',
        password: 'other',
      }),
    ).toBe(incoming);
  });

  test('mergePublishedSession treats an empty password as omitted', () => {
    const result = mergePublishedSession(
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-06-06T00:00:00.000Z',
        username: '',
        password: '',
        player_id: '',
      },
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-05-01T00:00:00.000Z',
        username: 'pilot',
        password: 'secret',
        player_id: 'player_1',
      },
    );

    expect(result.username).toBe('pilot');
    expect(result.password).toBe('secret');
    expect(result.player_id).toBe('player_1');
  });

  test('later expiry ignores a non-string and keeps an unparseable side from winning', () => {
    const incoming: Session = {
      id: 'same',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2020-01-01T00:00:00.000Z',
    };
    const numericOnDisk = mergePublishedSession(incoming, {
      id: 'same',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: 1_700_000_000_000 as unknown as string,
    });
    expect(numericOnDisk.expires_at).toBe('2020-01-01T00:00:00.000Z');
    expect(typeof numericOnDisk.expires_at).toBe('string');
    expect(incoming.expires_at).toBe('2020-01-01T00:00:00.000Z');

    const unparseableIncoming = mergePublishedSession(
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: 'not-a-timestamp',
      },
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-06-06T00:00:00.000Z',
      },
    );
    expect(unparseableIncoming.expires_at).toBe('2026-06-06T00:00:00.000Z');

    const numericIncoming = mergePublishedSession(
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: 2_500_000_000_000 as unknown as string,
      },
      {
        id: 'same',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2026-06-06T00:00:00.000Z',
      },
    );
    expect(numericIncoming.expires_at).toBe('2026-06-06T00:00:00.000Z');
  });

  test('overlapping saveSession calls keep the password and the newer expiry', async () => {
    const manager = new SessionManager({
      profile: 'merge_overlap',
      profileIsExplicit: true,
      env: testEnv,
    });
    const older = '2026-01-02T00:00:00.000Z';
    const newer = '2026-06-06T00:00:00.000Z';
    const withPassword: Session = {
      id: 'sess_shared',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: older,
      username: 'pilot',
      password: 'secret',
    };
    const withExpiry: Session = {
      id: 'sess_shared',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: newer,
    };

    await Promise.all([manager.saveSession(withPassword), manager.saveSession(withExpiry)]);

    expect(withExpiry.password).toBeUndefined();
    expect(await manager.loadSession()).toMatchObject({
      id: 'sess_shared',
      username: 'pilot',
      password: 'secret',
      expires_at: newer,
    });
  });

  test('two processes merge a password and a newer expiry under the session lock', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'session-two-process-'));
    const configHome = path.join(home, '.config');
    const moduleUrl = pathToFileURL(path.join(import.meta.dir, 'session.ts')).href;
    const older = '2026-01-02T00:00:00.000Z';
    const newer = '2026-06-06T00:00:00.000Z';
    const sessionPath = path.join(configHome, 'spacemolt-cli', 'sessions', 'pilot.json');
    const lockPath = `${sessionPath}.lock`;
    const script = `
      import * as fs from 'node:fs';
      const { SessionManager } = await import(${JSON.stringify(moduleUrl)});
      const originalRename = fs.promises.rename.bind(fs.promises);
      fs.promises.rename = async (from, to) => {
        await Bun.sleep(200);
        return originalRename(from, to);
      };
      const manager = new SessionManager({
        profile: 'pilot',
        profileIsExplicit: true,
        env: { HOME: ${JSON.stringify(home)}, XDG_CONFIG_HOME: ${JSON.stringify(configHome)} },
      });
      const session = {
        id: 'sess_shared',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: process.env.EXPIRES,
      };
      if (process.env.PASSWORD) {
        session.username = 'pilot';
        session.password = process.env.PASSWORD;
      }
      await manager.saveSession(session);
    `;
    const spawnSaver = (expires: string, password?: string) =>
      Bun.spawn([process.execPath, '-e', script], {
        env: {
          ...process.env,
          HOME: home,
          XDG_CONFIG_HOME: configHome,
          EXPIRES: expires,
          ...(password ? { PASSWORD: password } : {}),
        },
        stdout: 'pipe',
        stderr: 'pipe',
      });

    const passwordChild = spawnSaver(older, 'secret');
    const expiryChild = spawnSaver(newer);
    let sawLock = false;
    const started = Date.now();
    let codes: Array<number | null> = [passwordChild.exitCode, expiryChild.exitCode];
    while (Date.now() - started < 5_000) {
      if (fs.existsSync(lockPath)) sawLock = true;
      codes = [passwordChild.exitCode, expiryChild.exitCode];
      if (codes.every((code) => code !== null)) break;
      await Bun.sleep(2);
    }
    if (codes.some((code) => code === null)) {
      passwordChild.kill();
      expiryChild.kill();
      await Promise.all([passwordChild.exited, expiryChild.exited]);
      codes = [passwordChild.exitCode, expiryChild.exitCode];
    }
    const [passwordErr, expiryErr] = await Promise.all([
      new Response(passwordChild.stderr).text(),
      new Response(expiryChild.stderr).text(),
    ]);
    const detail = `${passwordErr}\n${expiryErr}`;
    if (codes[0] !== 0 || codes[1] !== 0) {
      throw new Error(`session savers exited ${codes.join(',')}\n${detail}`);
    }
    if (!sawLock) throw new Error(`session lock file did not appear\n${detail}`);
    expect(JSON.parse(fs.readFileSync(sessionPath, 'utf8'))).toMatchObject({
      password: 'secret',
      username: 'pilot',
      expires_at: newer,
    });
    expect(fs.existsSync(lockPath)).toBe(false);
  }, 20_000);

  test('saveSession of a new id drops the old password and keeps the later expiry', async () => {
    const manager = new SessionManager({
      profile: 'merge_new_id',
      profileIsExplicit: true,
      env: testEnv,
    });
    await manager.saveSession({
      id: 'sess_old',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
      username: 'pilot',
      password: 'secret',
    });
    await manager.saveSession({
      id: 'sess_new',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-05-01T00:00:00.000Z',
    });

    const loaded = await manager.loadSession();
    expect(loaded?.id).toBe('sess_new');
    expect(loaded?.password).toBeUndefined();
    expect(loaded?.username).toBeUndefined();
    expect(loaded?.expires_at).toBe('2026-06-06T00:00:00.000Z');
  });

  test('saveSession recovers a lock owned by an exited process', async () => {
    const manager = new SessionManager({
      profile: 'merge_dead_lock',
      profileIsExplicit: true,
      env: testEnv,
    });
    const sessionPath = manager.getSessionPath();
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    const child = Bun.spawn([process.execPath, '-e', ''], { stdout: 'ignore', stderr: 'ignore' });
    expect(await child.exited).toBe(0);
    const lockPath = `${sessionPath}.lock`;
    fs.writeFileSync(lockPath, `${child.pid} nonce-a\n`);

    await manager.saveSession({
      id: 'sess_dead',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
      password: 'secret',
    });

    expect(fs.existsSync(lockPath)).toBe(false);
    expect(await manager.loadSession()).toMatchObject({ password: 'secret' });
  });

  test('saveSession fails clearly while a live process owns the session lock', async () => {
    const manager = new SessionManager({
      profile: 'merge_live_lock',
      profileIsExplicit: true,
      env: testEnv,
    });
    const session: Session = {
      id: 'sess_live',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
      password: 'secret',
    };
    await manager.saveSession(session);
    const sessionPath = manager.getSessionPath();
    const before = fs.readFileSync(sessionPath);
    const lockPath = `${sessionPath}.lock`;
    fs.writeFileSync(lockPath, `${process.pid} nonce-a\n`);

    await expect(manager.saveSession({ ...session, password: 'other' })).rejects.toThrow(
      `Timed out waiting to update the session file at ${sessionPath}.`,
    );
    expect(fs.readFileSync(sessionPath)).toEqual(before);
    expect(fs.existsSync(lockPath)).toBe(true);
    fs.unlinkSync(lockPath);
  });

  test('saveSession recovers a live-pid session lock that is 31s old', async () => {
    const manager = new SessionManager({
      profile: 'merge_stale_pid',
      profileIsExplicit: true,
      env: testEnv,
    });
    const sessionPath = manager.getSessionPath();
    fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
    const lockPath = `${sessionPath}.lock`;
    fs.writeFileSync(lockPath, `${process.pid} not-this-acquire\n`);
    const old = new Date(Date.now() - 31_000);
    fs.utimesSync(lockPath, old, old);

    await manager.saveSession({
      id: 'sess_stale_pid',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2026-06-06T00:00:00.000Z',
      password: 'secret',
    });

    expect(fs.existsSync(lockPath)).toBe(false);
    expect(await manager.loadSession()).toMatchObject({ id: 'sess_stale_pid', password: 'secret' });
  });

  test('staleAdvisoryLockDecision keeps a young live holder and a differing nonce', () => {
    const match = {
      observed: '10 nonce-a\n',
      still: '10 nonce-a\n',
      ownerAlive: true as boolean | undefined,
      processStartedAfterLock: false,
      ageMs: 1_000,
      staleMs: 30_000,
    };

    expect(staleAdvisoryLockDecision(match)).toBe('keep');
    expect(staleAdvisoryLockDecision({ ...match, processStartedAfterLock: true })).toBe('remove');
    expect(staleAdvisoryLockDecision({ ...match, ageMs: 30_000 })).toBe('remove');
    expect(staleAdvisoryLockDecision({ ...match, ownerAlive: false, ageMs: 0 })).toBe('remove');
    expect(staleAdvisoryLockDecision({ ...match, still: '10 other\n' })).toBe('keep');
    expect(staleAdvisoryLockDecision({ ...match, ownerAlive: false, still: '10 other\n' })).toBe('keep');
    expect(staleAdvisoryLockDecision({ ...match, ownerAlive: undefined })).toBe('keep');
    expect(staleAdvisoryLockDecision({ ...match, ownerAlive: undefined, ageMs: 30_000 })).toBe('remove');
  });

  test('lock owner stays alive for every kill error except ESRCH', () => {
    const original = process.kill;
    try {
      process.kill = (() => {
        const error = new Error('denied') as NodeJS.ErrnoException;
        error.code = 'EPERM';
        throw error;
      }) as typeof process.kill;
      expect(lockOwnerAlive(1)).toBe(true);

      process.kill = (() => {
        const error = new Error('denied') as NodeJS.ErrnoException;
        error.code = 'EACCES';
        throw error;
      }) as typeof process.kill;
      expect(lockOwnerAlive(1)).toBe(true);

      process.kill = (() => {
        const error = new Error('gone') as NodeJS.ErrnoException;
        error.code = 'ESRCH';
        throw error;
      }) as typeof process.kill;
      expect(lockOwnerAlive(1)).toBe(false);

      process.kill = (() => {
        throw new Error('other');
      }) as typeof process.kill;
      expect(lockOwnerAlive(1)).toBe(true);
    } finally {
      process.kill = original;
    }

    expect(lockOwnerAlive(Number.NaN)).toBeUndefined();
    expect(lockOwnerAlive(0)).toBeUndefined();
    expect(lockOwnerAlive(-1)).toBeUndefined();
    expect(lockOwnerAlive(process.pid)).toBe(true);
  });

  test('proc stat start ticks are field 22 after the last parenthesis', () => {
    const starttime = 5000;
    const line = `42 (weird) name) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 ${starttime} 99`;
    expect(procStatStartTicks(line)).toBe(starttime);
    const btimeSec = 1_700_000_000;
    const clkTck = 250;
    const startedMs = (btimeSec + starttime / clkTck) * 1000;
    expect(processStartedAfterLock({ statLine: line, btimeSec, clkTck, mtimeMs: startedMs - 1 })).toBe(true);
    expect(processStartedAfterLock({ statLine: line, btimeSec, clkTck, mtimeMs: startedMs })).toBe(false);
    expect(processStartedAfterLock({ statLine: '42 no-paren S 1', btimeSec, clkTck, mtimeMs: 0 })).toBe(false);
    expect(processStartedAfterLock({ statLine: '42 (x) S 1 2', btimeSec, clkTck, mtimeMs: 0 })).toBe(false);
    const notANumber = '42 (x) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 not-a-number';
    expect(processStartedAfterLock({ statLine: notANumber, btimeSec, clkTck, mtimeMs: 0 })).toBe(false);
  });

  test('advisory lock release unlinks only its own token', async () => {
    const home = fs.mkdtempSync(path.join(tempDir, 'lock-release-'));
    const lockPath = path.join(home, 'session.json.lock');
    const options = {
      timeoutMs: 2_000,
      retryMs: 10,
      staleMs: 30_000,
      timeoutError: 'timed out',
    };
    const release = await acquireAdvisoryLock(lockPath, options);
    const token = fs.readFileSync(lockPath, 'utf8');
    expect(token.startsWith(`${process.pid} `)).toBe(true);
    expect(token.endsWith('\n')).toBe(true);
    expect(token).not.toContain('secret');
    fs.writeFileSync(lockPath, `${process.pid} other-nonce\n`);
    await release();
    expect(fs.readFileSync(lockPath, 'utf8')).toBe(`${process.pid} other-nonce\n`);
    fs.unlinkSync(lockPath);

    const releaseOwn = await acquireAdvisoryLock(lockPath, options);
    await releaseOwn();
    expect(fs.existsSync(lockPath)).toBe(false);

    const releaseMissing = await acquireAdvisoryLock(lockPath, options);
    fs.unlinkSync(lockPath);
    await releaseMissing();
    expect(fs.existsSync(lockPath)).toBe(false);
  });
});
