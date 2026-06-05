import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SpaceMoltClient, type SpaceMoltClientOptions } from './api.ts';
import type { CommandConfig } from './commands.ts';
import { runCommand } from './response-renderer.ts';
import { VERSION } from './runtime.ts';
import { getDefaultProfile, profileNameForUsername, SessionManager, setDefaultProfile } from './session.ts';
import type { APIResponse, JsonRequestOptions, Session } from './types.ts';

const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalXdgConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
});

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sess_old',
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2099-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function response(overrides: Partial<APIResponse> = {}): APIResponse {
  return {
    structuredContent: { ok: true },
    ...overrides,
  };
}

function createStore(initial = session()): NonNullable<SpaceMoltClientOptions['sessionStore']> & {
  saved: Session[];
  current: Session | null;
  authError: APIResponse | null;
  defaultProfile: string | undefined;
} {
  let defaultProfile: string | undefined;
  return {
    current: initial,
    saved: [],
    authError: null,
    ensureDefaultProfile(profile?: string) {
      if (!defaultProfile && profile) defaultProfile = profile;
    },
    get defaultProfile() {
      return defaultProfile;
    },
    async getSession() {
      if (!this.current) this.current = session();
      return this.current;
    },
    async loadSession() {
      return this.current;
    },
    async saveSession(nextSession) {
      this.current = { ...nextSession };
      this.saved.push({ ...nextSession });
    },
    async createSession() {
      this.current = session({ id: 'sess_new' });
      this.saved.push({ ...this.current });
      return this.current;
    },
    async authenticateProfileSession() {
      return this.authError;
    },
  };
}

function createClient(
  responses: APIResponse[],
  store = createStore(),
  options: Partial<SpaceMoltClientOptions> = {},
): {
  client: SpaceMoltClient;
  calls: Array<{ url: string; options?: JsonRequestOptions }>;
  store: ReturnType<typeof createStore>;
  sleeps: number[];
} {
  const calls: Array<{ url: string; options?: JsonRequestOptions }> = [];
  const sleeps: number[] = [];
  const client = new SpaceMoltClient({
    config: {
      apiBase: 'https://game.test/api/v2/',
      jsonOutput: true,
      debug: false,
      plain: false,
      quiet: true,
      format: 'table',
      compact: false,
    },
    ...options,
    sessionStore: store,
    transport: {
      async requestJson<T>(url: string, requestOptions?: JsonRequestOptions) {
        calls.push({ url, options: requestOptions });
        return { status: 200, data: (responses.shift() ?? response()) as T };
      },
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  return { client, calls, store, sleeps };
}

describe('SpaceMoltClient', () => {
  test('defaults market buys to station storage delivery', async () => {
    const { client, calls } = createClient([response()]);

    await client.execute('buy', { id: 'iron_ore', quantity: 76270 });

    expect(calls[0]?.url).toBe('https://game.test/api/v2/spacemolt/buy');
    expect(calls[0]?.options?.payload).toEqual({
      deliver_to: 'storage',
      id: 'iron_ore',
      quantity: 76270,
    });
  });

  test('allows market buys to explicitly deliver to cargo', async () => {
    const { client, calls } = createClient([response()]);

    await client.execute('buy', { id: 'iron_ore', quantity: 10, deliver_to: 'cargo' });

    expect(calls[0]?.options?.payload).toEqual({
      deliver_to: 'cargo',
      id: 'iron_ore',
      quantity: 10,
    });
  });

  test('constructs routes and applies command defaults', async () => {
    const { client, calls } = createClient([response()]);

    await client.execute('faction_deposit_credits', { quantity: 500 });

    expect(calls[0]?.url).toBe('https://game.test/api/v2/spacemolt_storage/deposit');
    expect(calls[0]?.options?.method).toBe('POST');
    expect(calls[0]?.options?.sessionId).toBe('sess_old');
    expect(calls[0]?.options?.payload).toEqual({
      target: 'faction',
      item_id: 'credits',
      quantity: 500,
    });
  });

  test('get_empire_info can run with an anonymous session when no default profile exists', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-public-command-'));
    const env = { XDG_CONFIG_HOME: tempDir };
    const sessionCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const commandCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const sessionManager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env,
      transport: (async (url: string, requestOptions?: JsonRequestOptions) => {
        sessionCalls.push({ url, options: requestOptions });
        return {
          status: 200,
          data: {
            session: {
              id: 'sess_public',
              created_at: '2026-01-01T00:00:00.000Z',
              expires_at: '2099-01-01T00:00:00.000Z',
            },
          },
        };
      }) as typeof import('./transport.ts').requestJson,
    });
    const client = new SpaceMoltClient({
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
      },
      sessionStore: sessionManager,
      transport: {
        async requestJson<T>(url: string, requestOptions?: JsonRequestOptions) {
          commandCalls.push({ url, options: requestOptions });
          return {
            status: 200,
            data: response({
              structuredContent: { empires: [] },
              session: {
                id: 'sess_public',
                created_at: '2026-01-01T00:00:00.000Z',
                expires_at: '2099-01-01T01:00:00.000Z',
              },
            }) as T,
          };
        },
      },
    });

    await client.execute('get_empire_info', { id: 'solarian' });

    expect(sessionCalls).toEqual([
      {
        url: 'https://game.test/api/v2/session',
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': `SpaceMolt-Client/${VERSION}` },
        },
      },
    ]);
    expect(commandCalls).toEqual([
      {
        url: 'https://game.test/api/v2/spacemolt/get_empire_info',
        options: {
          method: 'POST',
          sessionId: 'sess_public',
          payload: { id: 'solarian' },
        },
      },
    ]);
    expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
  });

  test('executes a registry command config without static route metadata', async () => {
    const { client, calls } = createClient([response()]);
    const config: CommandConfig = {
      route: {
        tool: 'spacemolt_shipyard',
        action: 'repair',
        method: 'POST',
        defaults: { mode: 'standard' },
      },
      arrayFields: ['ship_ids'],
    };

    await client.executeCommandConfig('shipyard_repair_dynamic', config, { ship_ids: 'ship_1, ship_2' });

    expect(calls[0]?.url).toBe('https://game.test/api/v2/spacemolt_shipyard/repair');
    expect(calls[0]?.options?.payload).toEqual({
      mode: 'standard',
      ship_ids: ['ship_1', 'ship_2'],
    });
  });

  test('serializes GET command payloads as query parameters', async () => {
    const { client, calls } = createClient([response()]);

    await client.execute('help', { topic: 'travel' });

    expect(calls[0]?.url).toBe('https://game.test/api/v2/spacemolt/help?topic=travel');
    expect(calls[0]?.options?.method).toBe('GET');
    expect(calls[0]?.options?.payload).toBeUndefined();
  });

  test('dry-runs a registry command config without static route metadata', async () => {
    const config: CommandConfig = {
      route: {
        tool: 'spacemolt_shipyard',
        action: 'repair',
        method: 'POST',
        defaults: { mode: 'standard' },
      },
      arrayFields: ['ship_ids'],
    };

    const result = await runCommand(
      'shipyard_repair_dynamic',
      { ship_ids: 'ship_1, ship_2' },
      {
        json: false,
        dryRun: true,
        allowUnknown: false,
        plain: false,
        compact: false,
        quiet: false,
        format: 'table',
        noTimestamp: false,
        args: [],
      },
      undefined,
      config,
    );

    expect(result.response.structuredContent).toMatchObject({
      dry_run: true,
      command: 'shipyard_repair_dynamic',
      method: 'POST',
      payload: {
        mode: 'standard',
        ship_ids: ['ship_1', 'ship_2'],
      },
    });
  });

  test('retries rate-limited responses using retry_after', async () => {
    const { client, calls, sleeps } = createClient([
      response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 2 } }),
      response({ structuredContent: { ok: true } }),
    ]);

    const result = await client.execute('mine');

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  test('recovers expired sessions and retries the original command', async () => {
    const store = createStore(session({ username: 'Pilot', password: 'secret' }));
    const {
      client,
      calls,
      store: usedStore,
    } = createClient(
      [
        response({ error: { code: 'session_expired', message: 'expired' } }),
        response({
          session: {
            id: 'sess_new',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
            player_id: 'player_1',
          },
        }),
        response({ structuredContent: { ok: true } }),
      ],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error).toBeUndefined();
    expect(calls.map((call) => call.url)).toEqual([
      'https://game.test/api/v2/spacemolt/mine',
      'https://game.test/api/v2/spacemolt_auth/login',
      'https://game.test/api/v2/spacemolt/mine',
    ]);
    expect(usedStore.current?.id).toBe('sess_new');
    expect(usedStore.current?.player_id).toBe('player_1');
  });

  test('returns profile authentication errors before sending command requests', async () => {
    const store = createStore();
    store.authError = response({ error: { code: 'invalid_credentials', message: 'bad profile' } });
    const { client, calls } = createClient([response()], store);

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('invalid_credentials');
    expect(calls).toHaveLength(0);
  });

  test('persists successful login credentials and player id', async () => {
    const { client, store } = createClient([
      response({
        structuredContent: { player: { id: 'player_login' } },
        session: {
          id: 'sess_old',
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      }),
    ]);

    await client.execute('login', { username: 'Pilot', password: 'secret' });

    expect(store.current?.username).toBe('Pilot');
    expect(store.current?.password).toBe('secret');
    expect(store.current?.player_id).toBe('player_login');
  });

  test('successful login initializes the default profile from username', async () => {
    const store = createStore(session());
    const { client } = createClient(
      [
        response({
          structuredContent: { player: { id: 'player_login' } },
        }),
      ],
      store,
    );

    await client.execute('login', { username: 'Pilot', password: 'secret' });

    expect(store.defaultProfile).toBe('pilot');
  });

  test('session debug output uses explicit plain logger', async () => {
    const lines: string[] = [];
    const manager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      debug: true,
      plain: true,
      logger: {
        log(message) {
          lines.push(message);
        },
      },
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });

    await manager.createTransientSession();

    expect(lines.join('\n')).toContain('[DEBUG] Creating new session...');
    expect(lines.join('\n')).not.toContain('\x1b[');
  });

  test('successful login with no default profile creates a username profile session', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-profile-test-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const apiBase = 'https://game.test/api/v2';
    const manager = new SessionManager({
      apiBase,
      profile: 'DefaultPilot',
      profileIsExplicit: false,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });
    const client = new SpaceMoltClient({
      config: {
        apiBase,
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { player: { id: 'player_login' } },
            }) as T,
          };
        },
      },
    });

    try {
      await client.execute('login', { username: 'Pilot', password: 'secret' });

      expect(getDefaultProfile()).toBe('pilot');
      const sessionPath = path.join(configRoot, 'spacemolt-cli', 'sessions', 'pilot.json');
      expect(fs.existsSync(sessionPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))).toMatchObject({
        id: 'sess_bootstrap',
        username: 'Pilot',
        password: 'secret',
        player_id: 'player_login',
      });
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('login with existing default profile writes the username profile session', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-profile-default-test-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const apiBase = 'https://game.test/api/v2';
    const sessionsDir = path.join(configRoot, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    setDefaultProfile('DefaultPilot');
    const defaultSession = {
      id: 'sess_default',
      username: 'DefaultPilot',
      password: 'default-secret',
      player_id: 'player_default',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const defaultSessionPath = path.join(sessionsDir, 'DefaultPilot.json');
    fs.writeFileSync(defaultSessionPath, `${JSON.stringify(defaultSession, null, 2)}\n`);
    const manager = new SessionManager({
      apiBase,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_other_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });
    const client = new SpaceMoltClient({
      config: {
        apiBase,
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { player: { id: 'player_other' } },
            }) as T,
          };
        },
      },
    });

    try {
      await client.execute('login', { username: 'OtherUser', password: 'other-secret' });

      expect(JSON.parse(fs.readFileSync(defaultSessionPath, 'utf-8'))).toEqual(defaultSession);
      const otherSessionPath = path.join(sessionsDir, 'otheruser.json');
      expect(fs.existsSync(otherSessionPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(otherSessionPath, 'utf-8'))).toMatchObject({
        id: 'sess_other_bootstrap',
        username: 'OtherUser',
        password: 'other-secret',
        player_id: 'player_other',
      });
      expect(getDefaultProfile()).toBe('defaultpilot');
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('login with explicit profile writes selected profile instead of username profile', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-profile-explicit-test-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const apiBase = 'https://game.test/api/v2';
    const sessionsDir = path.join(configRoot, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const manager = new SessionManager({
      apiBase,
      profile: 'pilot',
      profileIsExplicit: true,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_pilot_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });
    const client = new SpaceMoltClient({
      config: {
        apiBase,
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
        profile: 'pilot',
        profileIsExplicit: true,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { player: { id: 'player_other' } },
            }) as T,
          };
        },
      },
    });

    try {
      await client.execute('login', { username: 'OtherUser', password: 'other-secret' });

      expect(fs.existsSync(path.join(sessionsDir, 'OtherUser.json'))).toBe(false);
      expect(JSON.parse(fs.readFileSync(path.join(sessionsDir, 'pilot.json'), 'utf-8'))).toMatchObject({
        id: 'sess_pilot_bootstrap',
        username: 'OtherUser',
        password: 'other-secret',
        player_id: 'player_other',
      });
      expect(getDefaultProfile()).toBe('pilot');
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('login without explicit profile derives a safe profile for API-valid usernames', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-profile-safe-test-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const apiBase = 'https://game.test/api/v2';
    const username = "Nova Pilot's 🚀!";
    const profile = profileNameForUsername(username);
    const manager = new SessionManager({
      apiBase,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_safe_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });
    const client = new SpaceMoltClient({
      config: {
        apiBase,
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { player: { id: 'player_safe' } },
            }) as T,
          };
        },
      },
    });

    try {
      await client.execute('login', { username, password: 'safe-secret' });

      expect(getDefaultProfile()).toBe(profile);
      expect(profile).not.toBe(username);
      const sessionPath = path.join(configRoot, 'spacemolt-cli', 'sessions', `${profile}.json`);
      expect(fs.existsSync(sessionPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(sessionPath, 'utf-8'))).toMatchObject({
        id: 'sess_safe_bootstrap',
        username,
        password: 'safe-secret',
        player_id: 'player_safe',
      });
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('does not persist failed login credentials', async () => {
    const { client, store } = createClient([
      response({ error: { code: 'invalid_credentials', message: 'bad login' } }),
    ]);

    await client.execute('login', { username: 'Pilot', password: 'wrong' });

    expect(store.current?.username).toBeUndefined();
    expect(store.current?.password).toBeUndefined();
  });

  test('persists generated register password after success', async () => {
    const { client, store } = createClient([
      response({
        structuredContent: { password: 'generated', player_id: 'player_register' },
      }),
    ]);

    await client.execute('register', {
      username: 'NewPilot',
      empire: 'solarian',
      registration_code: 'code',
    });

    expect(store.current?.username).toBe('NewPilot');
    expect(store.current?.password).toBe('generated');
    expect(store.current?.player_id).toBe('player_register');
  });

  test('successful register initializes the default profile from username', async () => {
    const store = createStore(session());
    const { client } = createClient(
      [
        response({
          structuredContent: { password: 'generated', player_id: 'player_register' },
        }),
      ],
      store,
    );

    await client.execute('register', {
      username: 'NewPilot',
      empire: 'solarian',
      registration_code: 'code',
    });

    expect(store.defaultProfile).toBe('newpilot');
  });

  test('rate-limit retry cap limits the number of retries', async () => {
    const { client, calls, sleeps } = createClient([
      response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } }),
      response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } }),
      response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } }),
      response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } }),
      response({ structuredContent: { ok: true } }),
    ]);

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('rate_limited');
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([1000, 1000, 1000]);
  });

  test('retries rate-limited responses using wait_seconds', async () => {
    const { client, calls, sleeps } = createClient([
      response({ error: { code: 'rate_limited', message: 'slow down', wait_seconds: 3.5 } }),
      response({ structuredContent: { ok: true } }),
    ]);

    const result = await client.execute('mine');

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([4000]);
  });

  test('login skips profile auto-auth', async () => {
    const store = createStore();
    store.authError = response({ error: { code: 'invalid_credentials', message: 'bad profile' } });

    const { client, calls } = createClient(
      [
        response({
          structuredContent: { player: { id: 'player_login' } },
          session: { id: 'sess_old', created_at: '2026-01-01T00:00:00.000Z', expires_at: '2099-01-01T00:00:00.000Z' },
        }),
      ],
      store,
    );

    const result = await client.execute('login', { username: 'Pilot', password: 'secret' });
    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  test('login starts with a fresh session when the saved session is stale', async () => {
    const store = createStore(session({ id: 'sess_stale' }));
    const { client, calls } = createClient(
      [
        response({
          structuredContent: { player: { id: 'player_login' } },
          session: {
            id: 'sess_new',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }),
      ],
      store,
    );

    const result = await client.execute('login', { username: 'Pilot', password: 'secret' });

    expect(result.error).toBeUndefined();
    expect(calls.map((call) => call.options?.sessionId)).toEqual(['sess_new']);
    expect(store.current?.username).toBe('Pilot');
    expect(store.current?.password).toBe('secret');
    expect(store.current?.player_id).toBe('player_login');
  });

  test('register starts with a fresh session when the saved session is stale', async () => {
    const store = createStore(session({ id: 'sess_stale' }));
    const { client, calls } = createClient(
      [
        response({
          structuredContent: { password: 'generated', player_id: 'player_register' },
          session: {
            id: 'sess_new',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }),
      ],
      store,
    );

    const result = await client.execute('register', {
      username: 'NewPilot',
      empire: 'solarian',
      registration_code: 'code',
    });

    expect(result.error).toBeUndefined();
    expect(calls.map((call) => call.options?.sessionId)).toEqual(['sess_new']);
    expect(store.current?.username).toBe('NewPilot');
    expect(store.current?.password).toBe('generated');
    expect(store.current?.player_id).toBe('player_register');
  });

  test('register skips profile auto-auth', async () => {
    const store = createStore();
    store.authError = response({ error: { code: 'invalid_credentials', message: 'bad profile' } });

    const { client, calls } = createClient(
      [
        response({
          structuredContent: { password: 'generated', player_id: 'player_register' },
        }),
      ],
      store,
    );

    const result = await client.execute('register', {
      username: 'NewPilot',
      empire: 'solarian',
      registration_code: 'code',
    });
    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  test('session recovery stops after the configured attempt limit', async () => {
    const store = createStore(session({ username: 'Pilot', password: 'secret' }));
    const { client, calls } = createClient(
      [
        response({ error: { code: 'session_expired', message: 'expired' } }),
        response({
          session: {
            id: 'sess_new',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
            player_id: 'player_1',
          },
        }),
        response({ error: { code: 'session_expired', message: 'expired again' } }),
      ],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error?.message).toBe('expired again');
    expect(calls.map((call) => call.url)).toEqual([
      'https://game.test/api/v2/spacemolt/mine',
      'https://game.test/api/v2/spacemolt_auth/login',
      'https://game.test/api/v2/spacemolt/mine',
    ]);
  });
});
