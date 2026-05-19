import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { requestJson } from './transport.ts';
import type { APIResponse, JsonRequestOptions, JsonResponse } from './types.ts';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-session-test-'));

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

const { SessionManager } = await import('./session.ts');

import type { Session } from './types.ts';

beforeAll(() => {
  const credDir = path.join(tempDir, '.hermes', 'spacemolt');
  fs.mkdirSync(credDir, { recursive: true });
  fs.writeFileSync(
    path.join(credDir, 'spacemolt_credentials.yaml'),
    `
credentials:
  test_profile:
    username: my_user
    password: my_password
`,
    'utf-8',
  );
});

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('SessionManager', () => {
  test('save path and permission behavior', async () => {
    const manager = new SessionManager({ profile: 'test_profile' });
    const expectedPath = path.join(tempDir, '.hermes', 'spacemolt', 'sessions', 'test_profile.json');
    expect(manager.getSessionPath()).toBe(expectedPath);

    const defaultManager = new SessionManager();
    expect(defaultManager.getSessionPath()).toBe(path.join(tempDir, '.hermes', 'spacemolt', 'session.json'));

    const customPath = path.join(tempDir, 'custom.json');
    const customManager = new SessionManager({ sessionPath: customPath });
    expect(customManager.getSessionPath()).toBe(customPath);

    const sessionObj: Session = {
      id: 'sess_test_perms',
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString(),
    };
    await manager.saveSession(sessionObj);

    expect(fs.existsSync(expectedPath)).toBe(true);

    if (process.platform !== 'win32') {
      const fileStat = fs.statSync(expectedPath);
      expect(fileStat.mode & 0o777).toBe(0o600);

      const dirStat = fs.statSync(path.dirname(expectedPath));
      expect(dirStat.mode & 0o777).toBe(0o700);
    }

    const loaded = await manager.loadSession();
    expect(loaded).toEqual(sessionObj);
  });

  test('profile credentials loaded into new sessions', async () => {
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
      transport: mockTransport as unknown as typeof requestJson,
    });

    const session = await manager.createSession();
    expect(transportCalled).toBe(true);
    expect(session.id).toBe('sess_created_123');
    expect(session.username).toBe('my_user');
    expect(session.password).toBe('my_password');

    const loaded = await manager.loadSession();
    expect(loaded?.id).toBe('sess_created_123');
    expect(loaded?.username).toBe('my_user');
    expect(loaded?.password).toBe('my_password');
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
});
