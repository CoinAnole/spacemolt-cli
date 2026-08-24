import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SpaceMoltClient, type SpaceMoltClientOptions } from './api.ts';
import { reservedRoutingActionError } from './args.ts';
import type { CliRuntimeContext, CliWriter } from './cli-context.ts';
import { BUNDLED_COMMAND_REGISTRY } from './command-registry.ts';
import type { CommandConfig } from './commands.ts';
import { ServiceUnavailableError } from './errors.ts';
import { displayError } from './help.ts';
import { createCommandConfigDryRunResponse } from './preview.ts';
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

/** HTTP-layer mock. Distinct from APIResponse because those fixtures have no `data` key. */
type QueuedHttp = {
  status?: number; // default 200
  data: APIResponse;
  retryAfterHeader?: string;
};

function queuedHttp(data: APIResponse, extras: { status?: number; retryAfterHeader?: string } = {}): QueuedHttp {
  return { data, status: extras.status ?? 200, retryAfterHeader: extras.retryAfterHeader };
}

function unavailableFrame(retryAfterHeader = '2', message = 'auth provider down'): QueuedHttp {
  return queuedHttp(
    response({
      error: { code: 'service_unavailable', message },
      session: {
        id: 'sess_should_not_persist',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    }),
    { status: 503, retryAfterHeader },
  );
}

function createClient(
  responses: Array<APIResponse | QueuedHttp>,
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
        const next = responses.shift() ?? response();
        if (next && typeof next === 'object' && 'data' in next) {
          const frame = next as QueuedHttp;
          const status = frame.status ?? 200;
          return {
            status,
            ok: status >= 200 && status < 400,
            data: frame.data as T,
            retryAfterHeader: frame.retryAfterHeader,
          };
        }
        return { status: 200, ok: true, data: next as T };
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
          headers: { 'Content-Type': 'application/json' },
          userAgent: `SpaceMolt-Client/${VERSION}`,
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

  test('player_profile is fully unauthenticated and substitutes path params', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-player-profile-'));
    const env = { XDG_CONFIG_HOME: tempDir };
    const sessionCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const commandCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const sessionManager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env,
      transport: (async (url: string, requestOptions?: JsonRequestOptions) => {
        sessionCalls.push({ url, options: requestOptions });
        throw new Error('session should not be created for public unauthenticated commands');
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
            data: { username: 'Arbiter47', empire: 'voidborn', stats: { jumps_completed: 3 } } as T,
          };
        },
      },
    });

    const result = await client.execute('player_profile', { name: 'Arbiter47' });

    expect(sessionCalls).toEqual([]);
    expect(commandCalls).toEqual([
      {
        url: 'https://game.test/api/players/Arbiter47',
        options: {
          method: 'GET',
          sessionId: undefined,
          payload: undefined,
        },
      },
    ]);
    expect(result).toEqual({
      structuredContent: { username: 'Arbiter47', empire: 'voidborn', stats: { jumps_completed: 3 } },
    });
    expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
  });

  test('player_profile normalizes bare public error bodies', async () => {
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
      sessionStore: {
        async getSession() {
          throw new Error('No default profile set. Use: spacemolt profile default <name>');
        },
        async loadSession() {
          return null;
        },
        async saveSession() {},
        async createSession() {
          throw new Error('should not create session');
        },
        async createTransientSession() {
          throw new Error('should not create transient session');
        },
        async authenticateProfileSession() {
          return null;
        },
        ensureDefaultProfile() {},
      },
      transport: {
        async requestJson<T>() {
          return {
            status: 404,
            data: { error: 'player_not_found', message: 'No pilot by that name.' } as T,
          };
        },
      },
    });

    const result = await client.execute('player_profile', { name: 'missing' });
    expect(result).toEqual({
      error: { code: 'player_not_found', message: 'No pilot by that name.' },
    });
  });

  test('player_profile missing path param returns structured error without a network call', async () => {
    let networkCalls = 0;
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
      sessionStore: {
        async getSession() {
          throw new Error('should not create session');
        },
        async loadSession() {
          return null;
        },
        async saveSession() {},
        async createSession() {
          throw new Error('should not create session');
        },
        async createTransientSession() {
          throw new Error('should not create transient session');
        },
        async authenticateProfileSession() {
          return null;
        },
        ensureDefaultProfile() {},
      },
      transport: {
        async requestJson<T>() {
          networkCalls += 1;
          return { status: 200, data: {} as T };
        },
      },
    });

    const result = await client.execute('player_profile', {});
    expect(networkCalls).toBe(0);
    expect(result).toEqual({
      error: { code: 'missing_path_parameter', message: 'Missing path parameter: name' },
    });
  });

  test('player_profile 2xx body with string error field is not treated as failure', async () => {
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
      sessionStore: {
        async getSession() {
          throw new Error('should not create session');
        },
        async loadSession() {
          return null;
        },
        async saveSession() {},
        async createSession() {
          throw new Error('should not create session');
        },
        async createTransientSession() {
          throw new Error('should not create transient session');
        },
        async authenticateProfileSession() {
          return null;
        },
        ensureDefaultProfile() {},
      },
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: { error: 'not_an_api_error', message: 'still success payload', username: 'X' } as T,
          };
        },
      },
    });

    const result = await client.execute('player_profile', { name: 'X' });
    expect(result).toEqual({
      structuredContent: { error: 'not_an_api_error', message: 'still success payload', username: 'X' },
    });
  });

  test('faction_profile is fully unauthenticated and substitutes path params', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-faction-profile-'));
    const env = { XDG_CONFIG_HOME: tempDir };
    const sessionCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const commandCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const sessionManager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env,
      transport: (async (url: string, requestOptions?: JsonRequestOptions) => {
        sessionCalls.push({ url, options: requestOptions });
        throw new Error('session should not be created for public unauthenticated commands');
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
            data: { name: 'Interstellar Continental', tag: 'NOIR', member_count: 25 } as T,
          };
        },
      },
    });

    const result = await client.execute('faction_profile', { tag: 'NOIR' });

    expect(sessionCalls).toEqual([]);
    expect(commandCalls).toEqual([
      {
        url: 'https://game.test/api/factions/NOIR',
        options: {
          method: 'GET',
          sessionId: undefined,
          payload: undefined,
        },
      },
    ]);
    expect(result).toEqual({
      structuredContent: { name: 'Interstellar Continental', tag: 'NOIR', member_count: 25 },
    });
    expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
  });

  test('server-help can run with an anonymous session when no default profile exists', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-public-server-help-'));
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
              id: 'sess_public_help',
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
              result: 'Faction build help',
              session: {
                id: 'sess_public_help',
                created_at: '2026-01-01T00:00:00.000Z',
                expires_at: '2099-01-01T01:00:00.000Z',
              },
            }) as T,
          };
        },
      },
    });
    const config: CommandConfig = {
      route: { tool: 'spacemolt', action: 'help', method: 'POST' },
    };

    await client.executeCommandConfig('server-help', config, { topic: 'faction build' });

    expect(sessionCalls).toEqual([
      {
        url: 'https://game.test/api/v2/session',
        options: {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          userAgent: `SpaceMolt-Client/${VERSION}`,
        },
      },
    ]);
    expect(commandCalls).toEqual([
      {
        url: 'https://game.test/api/v2/spacemolt/help',
        options: {
          method: 'POST',
          sessionId: 'sess_public_help',
          payload: { topic: 'faction build' },
        },
      },
    ]);
    expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, 'spacemolt-cli', 'sessions'))).toBe(false);
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

    await client.execute('notifications', { clear: false, limit: 10 });

    expect(calls[0]?.url).toBe('https://game.test/api/v2/notifications?clear=false&limit=10');
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
    const apiBase = 'https://game.test/api/v2';
    const sessionsDir = path.join(configRoot, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    const manager = new SessionManager({
      apiBase,
      profile: 'pilot',
      profileIsExplicit: true,
      env: { XDG_CONFIG_HOME: configRoot },
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
      expect(getDefaultProfile(undefined, undefined, { XDG_CONFIG_HOME: configRoot })).toBeUndefined();
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('register with explicit profile writes only that profile and leaves the default unset', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-register-explicit-'));
    const env = { XDG_CONFIG_HOME: configRoot };
    const apiBase = 'https://game.test/api/v2';
    const manager = new SessionManager({
      apiBase,
      profile: 'Arbiter47',
      profileIsExplicit: true,
      env,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: 'sess_arbiter47',
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
        profile: 'Arbiter47',
        profileIsExplicit: true,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { password: 'generated-47', player_id: 'player_47' },
            }) as T,
          };
        },
      },
    });

    try {
      await client.execute('register', {
        username: 'Arbiter47',
        empire: 'voidborn',
        registration_code: 'code-47',
      });
      const saved = JSON.parse(
        fs.readFileSync(path.join(configRoot, 'spacemolt-cli', 'sessions', 'arbiter47.json'), 'utf-8'),
      );
      expect(saved).toMatchObject({
        id: 'sess_arbiter47',
        username: 'Arbiter47',
        password: 'generated-47',
        player_id: 'player_47',
      });
      expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  function createExplicitClient(configRoot: string, profile: string): SpaceMoltClient {
    const apiBase = 'https://game.test/api/v2';
    const manager = new SessionManager({
      apiBase,
      profile,
      profileIsExplicit: true,
      env: { XDG_CONFIG_HOME: configRoot },
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: response({
          session: {
            id: `sess_${profile.toLowerCase()}`,
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        }) as T,
      }),
    });
    return new SpaceMoltClient({
      config: {
        apiBase,
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
        profile,
        profileIsExplicit: true,
      },
      sessionStore: manager,
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: response({
              structuredContent: { player: { id: `player_${profile.slice(-2)}` } },
            }) as T,
          };
        },
      },
    });
  }

  test('parallel logins with similar explicit names persist isolated credentials', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-parallel-profiles-'));
    const profiles = ['Arbiter47', 'Arbiter57', 'Arbiter67'];
    try {
      await Promise.all(
        profiles.map((profile) =>
          createExplicitClient(configRoot, profile).execute('login', {
            username: profile,
            password: `password_${profile.slice(-2)}`,
          }),
        ),
      );
      for (const profile of profiles) {
        const suffix = profile.slice(-2);
        const saved = JSON.parse(
          fs.readFileSync(path.join(configRoot, 'spacemolt-cli', 'sessions', `${profile.toLowerCase()}.json`), 'utf-8'),
        );
        expect(saved).toMatchObject({
          username: profile,
          password: `password_${suffix}`,
          player_id: `player_${suffix}`,
        });
      }
      expect(getDefaultProfile(undefined, undefined, { XDG_CONFIG_HOME: configRoot })).toBeUndefined();
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

  test('does not recover credential errors with extra session or login requests', async () => {
    const store = createStore(session({ username: 'Pilot', password: 'wrong' }));
    const { client, calls } = createClient(
      [response({ error: { code: 'invalid_credentials', message: 'bad credentials' } })],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('invalid_credentials');
    expect(calls.map((call) => call.url)).toEqual(['https://game.test/api/v2/spacemolt/mine']);
    expect(store.current?.id).toBe('sess_old');
    expect(store.saved).toEqual([]);
  });

  test('does not create and retry anonymous sessions for auth-required commands without saved credentials', async () => {
    const store = createStore(session({ player_id: 'player_without_saved_credentials' }));
    const { client, calls } = createClient(
      [response({ error: { code: 'session_expired', message: 'expired' } })],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('session_expired');
    expect(calls.map((call) => call.url)).toEqual(['https://game.test/api/v2/spacemolt/mine']);
    expect(store.current?.id).toBe('sess_old');
    expect(store.saved).toEqual([]);
  });

  test('refuses craft and recycle action without sending a request', async () => {
    const { client, calls } = createClient([response()]);
    const reserved = reservedRoutingActionError('craft', { action: 'queue' });
    expect(reserved).toBeDefined();
    if (!reserved) throw new Error('expected reserved routing error');
    const craftConfig = BUNDLED_COMMAND_REGISTRY.commands.craft;
    const recycleConfig = BUNDLED_COMMAND_REGISTRY.commands.recycle;
    expect(craftConfig).toBeDefined();
    expect(recycleConfig).toBeDefined();
    if (!craftConfig || !recycleConfig) throw new Error('craft/recycle configs missing');

    const cases: Array<{ command: 'craft' | 'recycle'; payload: Record<string, unknown>; config: CommandConfig }> = [
      { command: 'craft', payload: { action: 'queue' }, config: craftConfig },
      { command: 'recycle', payload: { action: 'queue' }, config: recycleConfig },
      { command: 'craft', payload: { action: 'queue', id: 'iron_plates' }, config: craftConfig },
    ];

    for (const { command, payload, config } of cases) {
      const executeResult = await client.execute(command, payload);
      expect(executeResult).toEqual({ error: { code: 'reserved_routing_field', message: reserved.message } });

      const configResult = await client.executeCommandConfig(command, config, payload);
      expect(configResult).toEqual({ error: { code: 'reserved_routing_field', message: reserved.message } });

      const dryRun = createCommandConfigDryRunResponse(command, config, payload);
      expect(dryRun.error).toEqual({ code: 'reserved_routing_field', message: reserved.message });
      expect(dryRun.structuredContent).toMatchObject({
        dry_run: true,
        server_request_sent: false,
        error: { code: 'reserved_routing_field', message: reserved.message },
      });
      expect(JSON.stringify(dryRun.structuredContent?.payload ?? null)).not.toBe('{}');
    }

    expect(calls).toEqual([]);
  });

  test('retries a command HTTP 503 using Retry-After then succeeds', async () => {
    const { client, calls, sleeps } = createClient([unavailableFrame('2'), response()]);

    const result = await client.execute('mine');

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
  });

  test('HTTP-date Retry-After on a command 503 uses the injectable clock', async () => {
    const nowMs = Date.parse('Wed, 21 Oct 2015 07:28:00 GMT');
    const { client, calls, sleeps } = createClient(
      [
        queuedHttp(response({ error: { code: 'service_unavailable', message: 'down' } }), {
          status: 503,
          retryAfterHeader: 'Wed, 21 Oct 2015 07:28:12 GMT',
        }),
        response(),
      ],
      createStore(),
      { clock: { now: () => nowMs } },
    );

    const result = await client.execute('mine');

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([12000]);
  });

  test('four command 503s return service_unavailable without throwing or persisting session', async () => {
    const store = createStore();
    const { client, calls, sleeps } = createClient(
      [unavailableFrame('2'), unavailableFrame('2'), unavailableFrame('2'), unavailableFrame('2'), response()],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('service_unavailable');
    expect(result.error?.retry_after).toBe(2);
    expect(calls).toHaveLength(4);
    expect(sleeps).toEqual([2000, 2000, 2000]);
    expect(store.saved).toEqual([]);
    expect(store.current?.id).toBe('sess_old');
  });

  test('503 retries do not consume the rate-limit budget', async () => {
    const rateLimited = response({ error: { code: 'rate_limited', message: 'slow down', retry_after: 1 } });
    const { client, calls, sleeps } = createClient([
      unavailableFrame('2'),
      rateLimited,
      rateLimited,
      rateLimited,
      rateLimited,
      response(),
    ]);

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('rate_limited');
    expect(calls).toHaveLength(5);
    expect(sleeps).toEqual([2000, 1000, 1000, 1000]);
  });

  test('exhausted command 503 is not returned as invalid_credentials', async () => {
    const invalidToken = queuedHttp(response({ error: { code: 'invalid_credentials', message: 'invalid token' } }), {
      status: 503,
      retryAfterHeader: '0',
    });
    const { client } = createClient([invalidToken, invalidToken, invalidToken, invalidToken]);

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('service_unavailable');
    expect(result.error?.code).not.toBe('invalid_credentials');
    expect(result.error?.message).toBe('invalid token');
  });

  test('login 503 then success persists credentials', async () => {
    const { client, store, calls, sleeps } = createClient([
      unavailableFrame('2'),
      response({
        structuredContent: { player: { id: 'player_login' } },
        session: {
          id: 'sess_old',
          created_at: '2026-01-01T00:00:00.000Z',
          expires_at: '2099-01-01T00:00:00.000Z',
        },
      }),
    ]);

    const result = await client.execute('login', { username: 'Pilot', password: 'secret' });

    expect(result.error).toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(sleeps).toEqual([2000]);
    expect(store.current?.username).toBe('Pilot');
    expect(store.current?.password).toBe('secret');
    expect(store.current?.player_id).toBe('player_login');
  });

  test('login with four POST /session 503s returns service_unavailable and does not persist credentials', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-session-503-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const sessionCalls: string[] = [];
    const commandCalls: string[] = [];
    const manager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env: { XDG_CONFIG_HOME: configRoot },
      sleep: async () => {},
      transport: async <T>(url: string) => {
        sessionCalls.push(url);
        return {
          status: 503,
          ok: false,
          retryAfterHeader: '0',
          data: { error: { code: 'invalid_credentials', message: 'invalid token' } } as T,
        };
      },
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
      sessionStore: manager,
      sleep: async () => {},
      transport: {
        async requestJson<T>(url: string) {
          commandCalls.push(url);
          return { status: 200, data: response() as T };
        },
      },
    });

    try {
      const result = await client.execute('login', { username: 'Pilot', password: 'secret' });
      expect(result.error?.code).toBe('service_unavailable');
      expect(result.error?.code).not.toBe('invalid_credentials');
      expect(sessionCalls).toHaveLength(4);
      expect(commandCalls).toEqual([]);
      expect(fs.existsSync(path.join(configRoot, 'spacemolt-cli', 'sessions', 'pilot.json'))).toBe(false);
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('authenticateProfileSession service_unavailable is not stacked onto a command 503 budget', async () => {
    const store = createStore();
    store.authError = {
      error: {
        code: 'service_unavailable',
        message: 'The authentication provider is temporarily unreachable.',
        retry_after: 5,
      },
    };
    const { client, calls, sleeps } = createClient(
      [unavailableFrame('2'), unavailableFrame('2'), unavailableFrame('2'), unavailableFrame('2')],
      store,
    );

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('service_unavailable');
    expect(calls).toHaveLength(0);
    expect(sleeps).toEqual([]);
  });

  test('profile auth HTTP 503 budget does not start command-URL 503 retries', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-auth-503-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const authCalls: string[] = [];
    const commandCalls: string[] = [];
    const manager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      profile: 'pilot',
      profileIsExplicit: true,
      env: { XDG_CONFIG_HOME: configRoot },
      sleep: async () => {},
      transport: async <T>(url: string) => {
        authCalls.push(url);
        return {
          status: 503,
          ok: false,
          retryAfterHeader: '0',
          data: { error: { code: 'invalid_credentials', message: 'invalid token' } } as T,
        };
      },
    });
    await manager.saveSession(session({ username: 'Pilot', password: 'secret' }));
    const client = new SpaceMoltClient({
      config: {
        apiBase: 'https://game.test/api/v2',
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
      sleep: async () => {},
      transport: {
        async requestJson<T>(url: string) {
          commandCalls.push(url);
          return {
            status: 503,
            ok: false,
            retryAfterHeader: '0',
            data: { error: { code: 'service_unavailable', message: 'down' } } as T,
          };
        },
      },
    });

    try {
      const result = await client.execute('mine');
      expect(result.error?.code).toBe('service_unavailable');
      expect(result.error?.code).not.toBe('invalid_credentials');
      expect(authCalls).toEqual([
        'https://game.test/api/v2/spacemolt_auth/login',
        'https://game.test/api/v2/spacemolt_auth/login',
        'https://game.test/api/v2/spacemolt_auth/login',
        'https://game.test/api/v2/spacemolt_auth/login',
      ]);
      expect(commandCalls).toEqual([]);
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('recovery 503 returns service_unavailable instead of session_expired and does not prompt login', async () => {
    const logs: string[] = [];
    const store = createStore(session({ username: 'Pilot', password: 'secret' }));
    const { client, calls } = createClient(
      [
        response({ error: { code: 'session_expired', message: 'expired' } }),
        unavailableFrame('2'),
        unavailableFrame('2'),
        unavailableFrame('2'),
        unavailableFrame('2'),
      ],
      store,
      {
        config: {
          apiBase: 'https://game.test/api/v2/',
          jsonOutput: false,
          debug: false,
          plain: true,
          quiet: false,
          format: 'table',
          compact: false,
        },
        logger: {
          debug(message) {
            logs.push(message);
          },
          error(message) {
            logs.push(message);
          },
          warn(message) {
            logs.push(message);
          },
        },
      },
    );

    const result = await client.execute('mine');

    expect(result.error?.code).toBe('service_unavailable');
    expect(result.error?.code).not.toBe('session_expired');
    expect(result.error?.code).not.toBe('session_invalid');
    expect(result.error?.code).not.toBe('connection_error');
    expect(calls.map((call) => call.url)).toEqual([
      'https://game.test/api/v2/spacemolt/mine',
      'https://game.test/api/v2/spacemolt_auth/login',
      'https://game.test/api/v2/spacemolt_auth/login',
      'https://game.test/api/v2/spacemolt_auth/login',
      'https://game.test/api/v2/spacemolt_auth/login',
    ]);

    const stderr: string[] = [];
    const writer: CliWriter = {
      out() {},
      err(message = '') {
        stderr.push(message);
      },
      writeOut() {},
    };
    const context: CliRuntimeContext = {
      env: {},
      writer,
      clock: { now: () => new Date('2026-01-01T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };
    displayError('mine', result.error ?? {}, { context });

    const combined = `${logs.join('\n')}\n${stderr.join('\n')}`;
    expect(combined).not.toContain('Run "spacemolt login');
    expect(combined.toLowerCase()).not.toContain('authentication error');
    expect(combined).toMatch(/UNAVAILABLE|Do not change your password/);
  });

  test('login in-loop createSession 503s return service_unavailable without throwing', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-login-loop-503-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const sessionPayload = {
      session: {
        id: 'sess_boot',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      },
    };
    const sessionQueue: Array<{ status: number; retryAfterHeader?: string; data: APIResponse }> = [
      { status: 200, data: sessionPayload },
      {
        status: 503,
        retryAfterHeader: '0',
        data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
      },
      {
        status: 503,
        retryAfterHeader: '0',
        data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
      },
      {
        status: 503,
        retryAfterHeader: '0',
        data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
      },
      {
        status: 503,
        retryAfterHeader: '0',
        data: { error: { code: 'invalid_credentials', message: 'invalid token' } },
      },
    ];
    const sessionCalls: string[] = [];
    const manager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env: { XDG_CONFIG_HOME: configRoot },
      sleep: async () => {},
      transport: async <T>(url: string) => {
        sessionCalls.push(url);
        const next = sessionQueue.shift() ?? {
          status: 503,
          retryAfterHeader: '0',
          data: { error: { code: 'service_unavailable', message: 'down' } },
        };
        return {
          status: next.status,
          ok: next.status >= 200 && next.status < 400,
          retryAfterHeader: next.retryAfterHeader,
          data: next.data as T,
        };
      },
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
      sessionStore: manager,
      sleep: async () => {},
      transport: {
        async requestJson<T>() {
          return {
            status: 200,
            data: { error: { code: 'session_invalid', message: 'stale session' } } as T,
          };
        },
      },
    });

    try {
      const result = await client.execute('login', { username: 'Pilot', password: 'secret' });
      expect(result.error?.code).toBe('service_unavailable');
      expect(result.error?.code).not.toBe('session_invalid');
      expect(result.error?.code).not.toBe('connection_error');
      expect(sessionCalls).toHaveLength(5);
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('DEBUG logs Retry-After on the Response line', async () => {
    const logs: string[] = [];
    const { client } = createClient([unavailableFrame('8'), response()], createStore(), {
      config: {
        apiBase: 'https://game.test/api/v2/',
        jsonOutput: true,
        debug: true,
        plain: false,
        quiet: true,
        format: 'table',
        compact: false,
      },
      logger: {
        debug(message) {
          logs.push(message);
        },
        error() {},
        warn() {},
      },
    });

    await client.execute('mine');

    expect(logs.some((line) => /Response: 503 \(\d+ms\) Retry-After: 8/.test(line))).toBe(true);
  });

  test('recoverSession createSession 503s propagate as service_unavailable', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-recover-create-503-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const manager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      profile: 'pilot',
      profileIsExplicit: true,
      env: { XDG_CONFIG_HOME: configRoot },
      sleep: async () => {},
      transport: async <T>() => ({
        status: 503,
        ok: false,
        retryAfterHeader: '0',
        data: { error: { code: 'invalid_credentials', message: 'invalid token' } } as T,
      }),
    });
    await manager.saveSession(session({ username: 'Pilot', password: 'secret', player_id: 'player_1' }));
    const client = new SpaceMoltClient({
      config: {
        apiBase: 'https://game.test/api/v2',
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
      sleep: async () => {},
      transport: {
        async requestJson<T>() {
          return { status: 200, data: { error: { code: 'session_expired', message: 'expired' } } as T };
        },
      },
    });

    try {
      const result = await client.execute('mine');
      expect(result.error?.code).toBe('service_unavailable');
      expect(result.error?.code).not.toBe('session_expired');
      expect(await manager.loadSession()).toMatchObject({
        username: 'Pilot',
        password: 'secret',
        player_id: 'player_1',
      });
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('execute() does not throw ServiceUnavailableError after exhausted 503s', async () => {
    const { client } = createClient([
      unavailableFrame('0'),
      unavailableFrame('0'),
      unavailableFrame('0'),
      unavailableFrame('0'),
    ]);

    const result = await client.execute('mine');
    expect(result.error?.code).toBe('service_unavailable');
    expect(result).not.toBeInstanceOf(ServiceUnavailableError);
  });

  test('default SessionManager uses client sleep and omits wait banners when jsonOutput is true', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-default-session-json-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const logs: string[] = [];
    const sleeps: number[] = [];
    const urls: string[] = [];
    let sessionAttempts = 0;
    const client = new SpaceMoltClient({
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: true,
        debug: false,
        plain: true,
        quiet: true,
        format: 'table',
        compact: false,
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      logger: {
        debug() {},
        error(message) {
          logs.push(message);
        },
        warn(message) {
          logs.push(message);
        },
      },
      transport: {
        async requestJson<T>(url: string) {
          urls.push(url);
          if (url.endsWith('/session')) {
            sessionAttempts += 1;
            if (sessionAttempts === 1) {
              return {
                status: 503,
                ok: false,
                retryAfterHeader: '2',
                data: { error: { code: 'service_unavailable', message: 'down' } } as T,
              };
            }
            return {
              status: 200,
              ok: true,
              data: {
                session: {
                  id: 'sess_default_json',
                  created_at: '2026-01-01T00:00:00.000Z',
                  expires_at: '2099-01-01T00:00:00.000Z',
                },
              } as T,
            };
          }
          return {
            status: 200,
            ok: true,
            data: { structuredContent: { player: { id: 'player_login' } } } as T,
          };
        },
      },
    });

    try {
      const result = await client.execute('login', { username: 'Pilot', password: 'secret' });
      expect(result.error).toBeUndefined();
      expect(sessionAttempts).toBe(2);
      expect(sleeps).toEqual([2000]);
      expect(logs.join('\n')).not.toContain('[UNAVAILABLE]');
      expect(urls.some((url) => url.endsWith('/spacemolt_auth/login'))).toBe(true);
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });

  test('default SessionManager records the wait banner when jsonOutput is false', async () => {
    const configRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-api-default-session-human-'));
    process.env.XDG_CONFIG_HOME = configRoot;
    const logs: string[] = [];
    const sleeps: number[] = [];
    let sessionAttempts = 0;
    const client = new SpaceMoltClient({
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: false,
        debug: false,
        plain: true,
        quiet: false,
        format: 'table',
        compact: false,
      },
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      logger: {
        debug() {},
        error(message) {
          logs.push(message);
        },
        warn(message) {
          logs.push(message);
        },
      },
      transport: {
        async requestJson<T>(url: string) {
          if (url.endsWith('/session')) {
            sessionAttempts += 1;
            if (sessionAttempts === 1) {
              return {
                status: 503,
                ok: false,
                retryAfterHeader: '2',
                data: { error: { code: 'service_unavailable', message: 'down' } } as T,
              };
            }
            return {
              status: 200,
              ok: true,
              data: {
                session: {
                  id: 'sess_default_human',
                  created_at: '2026-01-01T00:00:00.000Z',
                  expires_at: '2099-01-01T00:00:00.000Z',
                },
              } as T,
            };
          }
          return {
            status: 200,
            ok: true,
            data: { structuredContent: { player: { id: 'player_login' } } } as T,
          };
        },
      },
    });

    try {
      const result = await client.execute('login', { username: 'Pilot', password: 'secret' });
      expect(result.error).toBeUndefined();
      expect(sessionAttempts).toBe(2);
      expect(sleeps).toEqual([2000]);
      expect(logs.join('\n')).toContain(
        '[UNAVAILABLE] Authentication provider unreachable. Waiting 2 seconds before retry...',
      );
    } finally {
      fs.rmSync(configRoot, { recursive: true, force: true });
    }
  });
});
