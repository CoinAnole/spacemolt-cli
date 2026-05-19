import { describe, expect, test } from 'bun:test';
import { SpaceMoltClient, type SpaceMoltClientOptions } from './api.ts';
import type { APIResponse, JsonRequestOptions, Session } from './types.ts';

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
} {
  return {
    current: initial,
    saved: [],
    authError: null,
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
