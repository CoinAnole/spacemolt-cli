import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import { SpaceMoltClient as RealSpaceMoltClient } from './api';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { cargoFixture } from './display/formatter-fixtures';
import { runInvocation } from './main';
import { VERSION } from './runtime';
import {
  ACTIVE_PROFILE,
  type EnvLike,
  getDefaultProfile,
  SessionManager,
  setActiveProfile,
  setDefaultProfile,
} from './session';
import type { JsonRequestOptions, Session } from './types';

async function captureInvocation(
  argv: string[],
  env: CliEnv = process.env,
  dependencies: Parameters<typeof runInvocation>[3] = {},
): Promise<{ exitCode: number; stdout: string; stderr: string; config?: SpaceMoltClient['config'] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = fakeContext(stdout, stderr, env);
  let config: SpaceMoltClient['config'] | undefined;
  const exitCode = await runInvocation(argv, undefined, context, {
    ...dependencies,
    createClient(clientConfig) {
      config = clientConfig;
      return (
        dependencies.createClient?.(clientConfig) ??
        ({
          config: clientConfig,
          async execute() {
            return { structuredContent: { ok: true } };
          },
        } as unknown as SpaceMoltClient)
      );
    },
  });
  return {
    exitCode,
    stdout: stdout.join('\n'),
    stderr: stderr.join('\n'),
    config,
  };
}

function fakeContext(stdout: string[], stderr: string[], env: CliEnv = process.env): CliRuntimeContext {
  return {
    env,
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
      writeOut(chunk) {
        stdout.push(chunk);
      },
    },
    clock: {
      now() {
        return new Date('2026-01-01T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
  };
}

async function withConfigHome<T>(configHome: string, fn: () => Promise<T>): Promise<T> {
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;
  try {
    return await fn();
  } finally {
    if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalConfigHome;
  }
}

afterEach(() => {
  setActiveProfile(undefined);
  // Best-effort reset of default profile to reduce cross-test pollution
  // (tests that need a default explicitly set it inside their withConfigHome)
});

describe('runInvocation option isolation', () => {
  test('keeps documented view_market --search out of the API payload', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-search-filter-'));
    const configHome = path.join(tempDir, 'config');
    const capturedPayloads: Array<Record<string, unknown>> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
        capturedPayloads.push(payload);
        return {
          structuredContent: {
            action: 'view_market',
            items: [
              { item_id: 'ore_iron', item_name: 'Iron Ore' },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell' },
            ],
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['view_market', '--search', 'iron'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(capturedPayloads).toEqual([{}]);
  });

  test('documented API --search keeps JSON response output raw instead of projecting matches', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-search-json-'));
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            action: 'view_market',
            items: [
              { item_id: 'ore_iron', item_name: 'Iron Ore' },
              { item_id: 'fuel_cell', item_name: 'Fuel Cell' },
            ],
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--json', 'view_market', '--search', 'iron'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const body = JSON.parse(stdout.join('\n'));
    expect(body.structuredContent.items.map((item: { item_id: string }) => item.item_id)).toEqual([
      'ore_iron',
      'fuel_cell',
    ]);
  });

  test('dispatches bundled generated shipping commands without an OpenAPI cache', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-dynamic-'));
    const configHome = path.join(tempDir, 'config');
    const calls: Array<{ command: string; route: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        calls.push({ command, route: config.route, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        ['--json', 'shipping_quote', 'package_id=package-1', 'destination_base_id=earth-station', 'insured=true'],
        client,
        fakeContext(stdout, stderr, {
          HOME: tempDir,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_PROFILE: 'pilot',
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(calls).toEqual([
        {
          command: 'shipping_quote',
          route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
          payload: {
            package_id: 'package-1',
            destination_base_id: 'earth-station',
            insured: true,
          },
        },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('rejects a non-positive shipping post reward before dry-run output or transport', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-shipping-minimum-'));
    const calls: string[] = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string) {
        calls.push(command);
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        ['--json', '--dry-run', 'shipping_post', 'package-1', 'nova-station', '0'],
        client,
        fakeContext(stdout, stderr, {
          HOME: tempDir,
          XDG_CONFIG_HOME: path.join(tempDir, 'config'),
          SPACEMOLT_PROFILE: 'pilot',
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        }),
      );

      expect(exitCode).toBe(1);
      expect(calls).toEqual([]);
      expect(stdout).toEqual([]);
      expect(JSON.parse(stderr.join('\n'))).toEqual({
        error: {
          code: 'validation_error',
          message: 'Parameter "base_reward" must be at least 1, but received "0".',
        },
      });
      expect(stderr.join('\n')).not.toContain('server_request_sent');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('clean-profile local help and search discover bundled generated commands', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-help-'));
    const env = {
      HOME: tempDir,
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      SPACEMOLT_NO_UPDATE_CHECK: 'true',
    };

    try {
      const help = await captureInvocation(['--plain', 'help', 'shipping_quote'], env);
      const search = await captureInvocation(['--plain', 'commands', '--search', 'shipping quote'], env);

      expect(help.exitCode).toBe(0);
      expect(help.stderr).toBe('');
      expect(help.stdout).toContain('spacemolt shipping_quote');
      expect(search.exitCode).toBe(0);
      expect(search.stdout).toContain('shipping_quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('clean-profile dry run previews a bundled generated route without sending a request', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-bundled-preview-'));
    const env = {
      HOME: tempDir,
      XDG_CONFIG_HOME: path.join(tempDir, 'config'),
      SPACEMOLT_NO_UPDATE_CHECK: 'true',
    };

    try {
      const result = await captureInvocation(
        ['--json', '--dry-run', 'shipping_quote', 'package_id=package-1', 'destination_base_id=earth-station'],
        env,
      );
      const body = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(body.structuredContent).toMatchObject({
        command: 'shipping_quote',
        method: 'POST',
        payload: {
          package_id: 'package-1',
          destination_base_id: 'earth-station',
        },
        server_request_sent: false,
      });
      expect(body.structuredContent.url).toContain('/api/v2/spacemolt_shipping/quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('loads cached OpenAPI routes when resolving dynamic commands', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-openapi-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/runner_dynamic/invoke': {
            operationId: 'runnerDynamicInvoke',
            summary: 'Invoke runner dynamic command',
            route: {
              tool: 'runner_dynamic',
              action: 'invoke',
              method: 'POST',
            },
            required: ['target_id'],
            schema: {
              target_id: {
                type: 'string',
                positionalIndex: 0,
              },
            },
            cli: {
              command: 'runner_cached_dynamic',
            },
          },
        },
      })}\n`,
    );
    const calls: Array<{ command: string; route: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        calls.push({ command, route: config.route, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--json', 'runner_cached_dynamic', 'ship_123'],
      client,
      fakeContext(stdout, stderr, {
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_PROFILE: 'pilot',
      }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'runner_cached_dynamic',
        route: {
          tool: 'runner_dynamic',
          action: 'invoke',
          method: 'POST',
        },
        payload: { target_id: 'ship_123' },
      },
    ]);
  });

  test('an accepted cache is authoritative for generated visibility and schemas', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-authoritative-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/spacemolt_shipping/quote': {
            operationId: 'spacemolt_shipping_quote',
            summary: 'Cached shipping quote',
            route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
            required: ['cache_only'],
            schema: { cache_only: { type: 'string' } },
          },
        },
      })}\n`,
    );
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push(payload);
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        ['--json', 'shipping_quote', 'cache_only=accepted'],
        client,
        fakeContext(stdout, stderr, {
          HOME: tempDir,
          XDG_CONFIG_HOME: configHome,
          SPACEMOLT_PROFILE: 'pilot',
          SPACEMOLT_NO_UPDATE_CHECK: 'true',
        }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(calls).toEqual([{ cache_only: 'accepted' }]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('an accepted cache can remove a bundled generated route from visibility', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-cache-removal-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/runner_dynamic/invoke': {
            summary: 'Cached-only command',
            route: { tool: 'runner_dynamic', action: 'invoke', method: 'POST' },
            cli: { command: 'runner_cached_dynamic' },
          },
        },
      })}\n`,
    );

    try {
      const result = await captureInvocation(['--plain', 'commands', '--search', 'shipping_quote'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('(No local command matches)');

      const invocation = await captureInvocation(['--plain', 'shipping_quote'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(invocation.exitCode).toBe(1);
      expect(invocation.stderr).toContain('Unknown command "shipping_quote"');
      expect(invocation.stderr).not.toContain('Did you mean: shipping_quote');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('unknown command suggestions include commands added by an accepted cache', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-cache-suggestions-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {
          'POST /api/v2/runner_dynamic/invoke': {
            summary: 'Cached-only command',
            route: { tool: 'runner_dynamic', action: 'invoke', method: 'POST' },
            cli: { command: 'runner_cached_dynamic' },
          },
        },
      })}\n`,
    );

    try {
      const result = await captureInvocation(['--plain', 'runner_cached_dynamc'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Unknown command "runner_cached_dynamc"');
      expect(result.stderr).toContain('Did you mean: runner_cached_dynamic');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('stale cached OpenAPI routes do not override bundled curated command schemas', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-stale-openapi-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        gameserverVersion: 'v0.366.0',
        routes: {
          'POST /api/v2/spacemolt_storage/deposit': {
            operationId: 'spacemolt_storage_deposit',
            summary: 'stale storage deposit',
            route: {
              tool: 'spacemolt_storage',
              action: 'deposit',
              method: 'POST',
            },
            schema: {
              item_id: { type: 'string' },
              quantity: { type: 'integer' },
              target: { type: 'string' },
            },
          },
        },
      })}\n`,
    );
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      [
        '--dry-run',
        '--json',
        'storage',
        'deposit',
        'target=faction',
        '--payload-json',
        '{"items":[{"item_id":"ore_iron","quantity":1},{"item_id":"ore_copper","quantity":2}]}',
      ],
      client,
      fakeContext(stdout, stderr, {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_PROFILE: 'pilot',
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const rendered = stdout.join('\n');
    expect(rendered).toContain('"command": "storage_deposit"');
    expect(rendered).toContain('"items"');
    expect(rendered).toContain('"item_id": "ore_iron"');
    expect(rendered).toContain('"quantity": 1');
    expect(rendered).toContain('"item_id": "ore_copper"');
    expect(rendered).toContain('"quantity": 2');
  });

  test('stale cached OpenAPI routes do not expose removed dynamic commands', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-stale-openapi-dynamic-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      `${JSON.stringify({
        fetchedAt: '2026-05-20T00:00:00.000Z',
        gameserverVersion: 'v0.366.0',
        routes: {
          'POST /api/v2/spacemolt_ship/claim_commission': {
            operationId: 'spacemolt_ship_claim_commission',
            summary: 'Claim a completed ship from a commission',
            route: {
              tool: 'spacemolt_ship',
              action: 'claim_commission',
              method: 'POST',
            },
            required: ['id'],
            schema: {
              id: {
                type: 'string',
                positionalIndex: 0,
              },
            },
          },
        },
      })}\n`,
    );
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--plain', 'commands', '--search', 'claim_commission'],
      undefined,
      fakeContext(stdout, stderr, {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).not.toContain('ship_claim_commission');

    const bundledStdout: string[] = [];
    const bundledStderr: string[] = [];
    const bundledExitCode = await runInvocation(
      ['--plain', 'commands', '--search', 'shipping_quote'],
      undefined,
      fakeContext(bundledStdout, bundledStderr, {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      }),
    );

    expect(bundledExitCode).toBe(0);
    expect(bundledStderr).toEqual([]);
    expect(bundledStdout.join('\n')).toContain('shipping_quote');
  });

  test('an invalid cache falls back to bundled generated routes', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-invalid-cache-'));
    const configHome = path.join(tempDir, 'config');
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-07-17T00:00:00.000Z',
        routes: {
          'POST /api/v2/spacemolt_ship/claim_commission': {
            route: { tool: 'spacemolt_ship', action: 'claim_commission', method: 'POST' },
          },
        },
      }),
    );

    try {
      const result = await captureInvocation(['--plain', 'help', 'shipping_quote'], {
        HOME: tempDir,
        XDG_CONFIG_HOME: configHome,
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('spacemolt shipping_quote');
      expect(result.stdout).not.toContain('claim_commission');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('nested command group invocation executes original API route', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-nested-group-'));
    const configHome = path.join(tempDir, 'config');
    const calls: Array<{
      command: string;
      payload: Record<string, unknown>;
      route: { tool?: string; action?: string; method?: string };
    }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(
        command: string,
        config: { route: { tool?: string; action?: string; method?: string } },
        payload: Record<string, unknown>,
      ) {
        calls.push({ command, payload, route: config.route });
        return { structuredContent: { ok: true } };
      },
    };
    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await runInvocation(
        ['faction', 'create_buy_order', 'ore_iron', '100', '12', '--structured'],
        client as never,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(calls).toEqual([
        {
          command: 'faction_create_buy_order',
          payload: { item_id: 'ore_iron', quantity: 100, price_each: 12 },
          route: { tool: 'spacemolt_faction_commerce', action: 'create_buy_order', method: 'POST' },
        },
      ]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('flat grouped command invocation is rejected before network dispatch', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-flat-group-'));
    const configHome = path.join(tempDir, 'config');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        throw new Error('flat grouped command should not execute');
      },
    };

    try {
      const exitCode = await runInvocation(
        ['faction_create_buy_order', 'ore_iron', '100', '12'],
        client as never,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );

      expect(exitCode).toBe(1);
      expect(stderr.join('\n')).toContain('Unknown command "faction_create_buy_order"');
      expect(stdout).toEqual([]);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('grouped faction create_sell_order with bucket param parses to payload on real runInvocation path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-faction-bucket-'));
    const configHome = path.join(tempDir, 'config');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const captured: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        captured.push({ command, payload });
        return { result: 'ok' };
      },
    } as unknown as SpaceMoltClient;

    try {
      const exitCode = await runInvocation(
        ['faction', 'create_sell_order', 'iron_ore', '50', '6', 'bucket=Export'],
        client,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );

      expect(exitCode).toBe(0);
      expect(stderr.join('')).not.toContain('Unknown command');
      expect(captured.length).toBeGreaterThan(0);
      const first = captured[0];
      expect(first).toBeDefined();
      expect(first?.payload).toMatchObject({
        item_id: 'iron_ore',
        quantity: 50,
        price_each: 6,
        bucket: 'Export',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('grouped faction build and facility job_add accept bucket/source on real path', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-faction-source-'));
    const configHome = path.join(tempDir, 'config');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const captured: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_c: string, _cfg: unknown, p: Record<string, unknown>) {
        captured.push({ command: _c, payload: p });
        return { result: 'ok' };
      },
    } as unknown as SpaceMoltClient;

    try {
      await runInvocation(
        ['faction', 'build', 'ore_refinery', 'bucket=Builds'],
        client,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );
      await runInvocation(
        ['facility', 'job_add', 'fac-1', 'refine', '3', 'forward', 'deliver_to=faction', 'source=storage'],
        client,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );

      expect(captured.some((c) => c.payload.bucket === 'Builds')).toBe(true);
      const job = captured.find((c) => c.payload.facility_id);
      expect(job?.payload).toMatchObject({ source: 'storage', deliver_to: 'faction' });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('facility_upgrade flag syntax prints structured API errors', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return {
          error: {
            code: 'missing_materials',
            message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
          },
        };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['facility', 'upgrade', '--facility-id', '3f67', '--facility-type', 'intel_center', '--structured'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'facility_upgrade',
        payload: { facility_id: '3f67', facility_type: 'intel_center' },
      },
    ]);
    expect(JSON.parse(stderr.join('\n'))).toEqual({
      error: {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
      },
    });
  });

  test('buy accepts delivery alias for the market delivery target', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-buy-alias-'));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--structured', 'buy', 'item_id=iron_ore', 'quantity=76270', 'delivery=cargo'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([
      {
        command: 'buy',
        payload: { id: 'iron_ore', quantity: 76270, deliver_to: 'cargo' },
      },
    ]);
  });

  test('public get_empire_info renders without a configured profile', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-public-render-'));
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: false,
        debug: false,
        plain: false,
        quiet: false,
        format: 'table',
        compact: false,
      },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { empires: [{ id: 'solarian', sales_tax_bps: 500 }] } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--structured', 'get_empire_info', 'solarian'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(calls).toEqual([{ command: 'get_empire_info', payload: { id: 'solarian' } }]);
    expect(JSON.parse(stdout.join('\n'))).toEqual({ empires: [{ id: 'solarian', sales_tax_bps: 500 }] });
  });

  test('public player_profile and faction profile render without a configured profile', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-public-profiles-'));
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const execute = async (command: string, payload: Record<string, unknown>) => {
      calls.push({ command, payload });
      if (command === 'player_profile') {
        return { structuredContent: { username: 'Arbiter47', online: true } };
      }
      return { structuredContent: { name: 'Interstellar Continental', tag: 'NOIR', member_count: 25 } };
    };
    const client = {
      config: {
        apiBase: 'https://game.test/api/v2',
        jsonOutput: false,
        debug: false,
        plain: false,
        quiet: false,
        format: 'table',
        compact: false,
      },
      execute,
      executeCommandConfig: async (command: string, _config: unknown, payload: Record<string, unknown>) =>
        execute(command, payload),
    } as unknown as SpaceMoltClient;

    const playerOut: string[] = [];
    const playerErr: string[] = [];
    const playerCode = await runInvocation(
      ['--structured', 'player_profile', 'Arbiter47'],
      client,
      fakeContext(playerOut, playerErr, { XDG_CONFIG_HOME: configHome }),
    );
    expect(playerCode).toBe(0);
    expect(playerErr).toEqual([]);
    expect(JSON.parse(playerOut.join('\n'))).toEqual({ username: 'Arbiter47', online: true });

    // Nested group surface: `faction profile` → internal command faction_profile
    const factionOut: string[] = [];
    const factionErr: string[] = [];
    const factionCode = await runInvocation(
      ['--structured', 'faction', 'profile', 'NOIR'],
      client,
      fakeContext(factionOut, factionErr, { XDG_CONFIG_HOME: configHome }),
    );
    expect(factionCode).toBe(0);
    expect(factionErr).toEqual([]);
    expect(JSON.parse(factionOut.join('\n'))).toEqual({
      name: 'Interstellar Continental',
      tag: 'NOIR',
      member_count: 25,
    });
    expect(calls).toEqual([
      { command: 'player_profile', payload: { name: 'Arbiter47' } },
      { command: 'faction_profile', payload: { tag: 'NOIR' } },
    ]);
  });

  test('server-help renders through a transient anonymous session without a configured profile', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-server-help-render-'));
    const env = { XDG_CONFIG_HOME: configHome, SPACEMOLT_URL: 'https://game.test/api/v2' };
    const stdout: string[] = [];
    const stderr: string[] = [];
    const sessionCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];
    const commandCalls: Array<{ url: string; options?: JsonRequestOptions }> = [];

    const exitCode = await runInvocation(
      ['--plain', 'server-help', 'faction', 'build'],
      undefined,
      fakeContext(stdout, stderr, env),
      {
        async checkForUpdates() {},
        createClient(config) {
          const sessionManager = new SessionManager({
            apiBase: config.apiBase,
            env,
            transport: (async (url: string, requestOptions?: JsonRequestOptions) => {
              sessionCalls.push({ url, options: requestOptions });
              return {
                status: 200,
                data: {
                  session: {
                    id: 'sess_runner_help',
                    created_at: '2026-01-01T00:00:00.000Z',
                    expires_at: '2099-01-01T00:00:00.000Z',
                  },
                },
              };
            }) as typeof import('./transport').requestJson,
          });
          return new RealSpaceMoltClient({
            config,
            sessionStore: sessionManager,
            transport: {
              async requestJson<T>(url: string, requestOptions?: JsonRequestOptions) {
                commandCalls.push({ url, options: requestOptions });
                return {
                  status: 200,
                  data: {
                    result: 'Faction build help',
                    session: {
                      id: 'sess_runner_help',
                      created_at: '2026-01-01T00:00:00.000Z',
                      expires_at: '2099-01-01T01:00:00.000Z',
                    },
                  } as T,
                };
              },
            },
          });
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('Faction build help');
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
          sessionId: 'sess_runner_help',
          payload: { topic: 'faction build' },
          userAgent: `SpaceMolt-Client/${VERSION}`,
        },
      },
    ]);
    expect(getDefaultProfile(undefined, undefined, env)).toBeUndefined();
    expect(fs.existsSync(path.join(configHome, 'spacemolt-cli', 'sessions'))).toBe(false);
  });

  test('switch_ship resolves cached ship class names and prints API errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-ship-cache-'));
    const configHome = path.join(tempDir, 'config');
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        if (command === 'list_ships') {
          return {
            structuredContent: {
              ships: [
                {
                  ship_id: '0ceb2c65cc4bf79727a8f0baec04dab0',
                  class_id: 'dust_devil',
                  class_name: 'Dust Devil',
                  is_active: false,
                },
              ],
              count: 1,
            },
          };
        }
        return {
          error: {
            code: 'ship_switch_failed',
            message: 'cargo must be unloaded before switching ships',
          },
        };
      },
    } as unknown as SpaceMoltClient;

    try {
      const env = { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' };
      const listExitCode = await runInvocation(['--quiet', 'list_ships'], client, fakeContext(stdout, stderr, env));
      const switchExitCode = await runInvocation(
        ['--plain', 'switch_ship', 'dust_devil'],
        client,
        fakeContext(stdout, stderr, env),
      );

      expect(listExitCode).toBe(0);
      expect(switchExitCode).toBe(1);
      expect(calls).toEqual([
        { command: 'list_ships', payload: {} },
        { command: 'switch_ship', payload: { id: '0ceb2c65cc4bf79727a8f0baec04dab0' } },
      ]);
      expect(stderr.join('\n')).toContain('cargo must be unloaded before switching ships');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('repeated direct invocations do not leak --json', async () => {
    const jsonResult = await captureInvocation(['--json', 'trvel']);
    expect(jsonResult.exitCode).toBe(1);
    expect(jsonResult.stdout).toBe('');
    expect(jsonResult.stderr).toContain('"unknown_command"');
    expect(jsonResult.config).toMatchObject({ jsonOutput: true, format: 'table' });

    const textResult = await captureInvocation(['trvel']);
    expect(textResult.exitCode).toBe(1);
    expect(textResult.stderr).toContain('Unknown command "trvel"');
    expect(textResult.stdout).not.toContain('"unknown_command"');
    expect(textResult.config).toMatchObject({ jsonOutput: process.env.SPACEMOLT_OUTPUT === 'json', format: 'table' });
  });

  test('--structured unknown command emits machine-readable JSON on stderr', async () => {
    const result = await captureInvocation(['--structured', 'trvel']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'unknown_command',
        message: 'Unknown command: trvel',
      },
    });
  });

  test('--structured command parse errors emit machine-readable JSON on stderr', async () => {
    const result = await captureInvocation(['--structured', 'travel']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'missing_required_argument',
        message: 'Missing required argument: target_poi',
      },
    });
  });

  test('repeated direct invocations do not leak --plain or --compact', async () => {
    const plainResult = await captureInvocation(['--plain', '--compact', '--json', 'trvel']);
    expect(plainResult.config).toMatchObject({ plain: true, compact: true });

    const defaultResult = await captureInvocation(['trvel']);
    expect(defaultResult.config).toMatchObject({ plain: false, compact: false });
  });

  test('repeated direct invocations do not leak --debug', async () => {
    const debugResult = await captureInvocation(['--debug', '--help']);
    expect(debugResult.config).toMatchObject({ debug: true });

    const defaultResult = await captureInvocation(['--help']);
    expect(defaultResult.config).toMatchObject({ debug: process.env.DEBUG === 'true' });
  });

  test('successful global parsing configures explicit runtime output state', async () => {
    const result = await captureInvocation(['--plain', '--compact', '--debug', '--format', 'json', 'trvel']);

    expect(result.exitCode).toBe(1);
    expect(result.config).toMatchObject({
      jsonOutput: true,
      format: 'json',
      plain: true,
      compact: true,
      debug: true,
    });
  });

  test('repeated direct invocations do not leak --profile', async () => {
    await captureInvocation(['--profile', 'pilot', '--help', 'travel']);
    expect(ACTIVE_PROFILE).toBe('pilot');

    await captureInvocation(['--help', 'travel'], {}, { getDefaultProfile: () => undefined });
    expect(ACTIVE_PROFILE).toBeUndefined();
  });

  test('SPACEMOLT_PROFILE supplies the active profile when --profile is omitted', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--help', 'travel'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'marlowe' }),
    );

    expect(exitCode).toBe(0);
    expect(ACTIVE_PROFILE).toBe('marlowe');
  });

  test('--profile overrides SPACEMOLT_PROFILE', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--profile', 'pilot', '--help', 'travel'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'marlowe' }),
    );

    expect(exitCode).toBe(0);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('saved default profile is used when --profile and SPACEMOLT_PROFILE are absent', async () => {
    const invocation = await captureInvocation(['--help', 'travel'], {}, { getDefaultProfile: () => 'marlowe' });

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('marlowe');
    expect(invocation.config?.profileIsExplicit).toBe(false);
    expect(ACTIVE_PROFILE).toBe('marlowe');
  });

  test('--profile overrides saved default profile', async () => {
    const invocation = await captureInvocation(
      ['--profile', 'pilot', '--help', 'travel'],
      {},
      { getDefaultProfile: () => 'marlowe' },
    );

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('pilot');
    expect(invocation.config?.profileIsExplicit).toBe(true);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('SPACEMOLT_PROFILE overrides saved default profile', async () => {
    const invocation = await captureInvocation(
      ['--help', 'travel'],
      { SPACEMOLT_PROFILE: 'pilot' },
      { getDefaultProfile: () => 'marlowe' },
    );

    expect(invocation.exitCode).toBe(0);
    expect(invocation.config?.profile).toBe('pilot');
    expect(invocation.config?.profileIsExplicit).toBe(true);
    expect(ACTIVE_PROFILE).toBe('pilot');
  });

  test('non-login command with missing explicit profile does not create a session file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-missing-profile-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    const stdout: string[] = [];
    const stderr: string[] = [];
    let sessionCreated = false;
    let apiRequested = false;

    try {
      const exitCode = await withConfigHome(configHome, async () =>
        runInvocation(
          ['--profile', 'dummy', 'get_status'],
          undefined,
          fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
          {
            createClient(config) {
              return new RealSpaceMoltClient({
                config,
                sessionStore: new SessionManager({
                  apiBase: config.apiBase,
                  profile: config.profile,
                  profileIsExplicit: config.profileIsExplicit,
                  transport: async <T>() => {
                    sessionCreated = true;
                    return {
                      status: 200,
                      ok: true,
                      data: {
                        session: {
                          id: 'sess_dummy',
                          created_at: '2026-01-01T00:00:00.000Z',
                          expires_at: '2099-01-01T00:00:00.000Z',
                        },
                      } as T,
                    };
                  },
                }),
                transport: {
                  async requestJson<T>() {
                    apiRequested = true;
                    return { status: 200, data: { structuredContent: { ok: true } } as T };
                  },
                },
              });
            },
          },
        ),
      );

      expect(exitCode).toBe(1);
      expect(stdout).toEqual([]);
      expect(stderr.join('\n')).toContain('No saved session for profile "dummy"');
      expect(sessionCreated).toBe(false);
      expect(apiRequested).toBe(false);
      expect(fs.existsSync(path.join(sessionsDir, 'dummy.json'))).toBe(false);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('login with saved default uses username profile without overwriting default session', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-login-default-'));
    const configHome = path.join(tempDir, 'config');
    const spacemoltHome = path.join(configHome, 'spacemolt-cli');
    const sessionsDir = path.join(spacemoltHome, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });

    // Pre-populate default profile via config file (more reliable than relying only on setDefaultProfile during run)
    fs.writeFileSync(
      path.join(spacemoltHome, 'config.json'),
      `${JSON.stringify({ defaultProfile: 'marlowe' }, null, 2)}\n`,
    );

    const defaultSession = {
      id: 'sess_marlowe',
      username: 'marlowe',
      password: 'marlowe-secret',
      player_id: 'player_marlowe',
      created_at: '2026-01-01T00:00:00.000Z',
      expires_at: '2099-01-01T00:00:00.000Z',
    };
    const defaultSessionPath = path.join(sessionsDir, 'marlowe.json');
    fs.writeFileSync(defaultSessionPath, `${JSON.stringify(defaultSession, null, 2)}\n`);

    // Capture session saves at a higher level for isolation from FS/env details inside SessionManager
    const sessionSaves: Array<{ session: Session; profile?: string }> = [];
    const baseSessionManager = new SessionManager({
      apiBase: 'https://game.test/api/v2',
      env: { XDG_CONFIG_HOME: configHome } as EnvLike,
      transport: async <T>() => ({
        status: 200,
        ok: true,
        data: {
          session: {
            id: 'sess_other_bootstrap',
            created_at: '2026-01-01T00:00:00.000Z',
            expires_at: '2099-01-01T00:00:00.000Z',
          },
        } as T,
      }),
    });
    // Override on the instance (shadows prototype) so all other methods remain available
    const originalSave = baseSessionManager.saveSession.bind(baseSessionManager);
    (baseSessionManager as { saveSession: (s: Session, p?: string) => Promise<void> }).saveSession = async (
      session: Session,
      profile?: string,
    ) => {
      sessionSaves.push({ session: JSON.parse(JSON.stringify(session)), profile });
      return originalSave(session, profile);
    };
    const capturingSessionStore = baseSessionManager;

    const stdout: string[] = [];
    const stderr: string[] = [];

    try {
      const exitCode = await withConfigHome(configHome, async () => {
        setDefaultProfile('marlowe');
        return runInvocation(
          ['login', 'OtherUser', 'other-secret'],
          undefined,
          fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome }),
          {
            createClient(config) {
              return new RealSpaceMoltClient({
                config,
                sessionStore: capturingSessionStore,
                transport: {
                  async requestJson<T>() {
                    return {
                      status: 200,
                      data: { structuredContent: { player: { id: 'player_other' } } } as T,
                    };
                  },
                },
              });
            },
          },
        );
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);

      // Default session file must remain completely untouched
      expect(JSON.parse(fs.readFileSync(defaultSessionPath, 'utf-8'))).toEqual(defaultSession);

      // Higher-level behavioral assertion via captured saves (more isolated from internal
      // SessionManager FS/env details): at least one save for the new bootstrap session occurred
      const newBootstrapSave = sessionSaves.find((s) => s.session?.id === 'sess_other_bootstrap');
      expect(newBootstrapSave).toBeTruthy();

      // The enriched final session file for the new user profile was still created on disk
      const otherUserPath = path.join(sessionsDir, 'otheruser.json');
      expect(fs.existsSync(otherUserPath)).toBe(true);
      expect(JSON.parse(fs.readFileSync(otherUserPath, 'utf-8'))).toMatchObject({
        id: 'sess_other_bootstrap',
        username: 'OtherUser',
        password: 'other-secret',
        player_id: 'player_other',
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('direct invocation writes through CliWriter without console monkeypatching', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;

    const exitCode = await runInvocation(['--json', 'trvel'], undefined, fakeContext(stdout, stderr));

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toContain('"unknown_command"');
    expect(console.log).toBe(originalLog);
    expect(console.error).toBe(originalError);
  });

  test('plain nonzero invocations get a fallback diagnostic when handlers write no output', async () => {
    const result = await captureInvocation(['silent_failure'], process.env, {
      resolveHandler() {
        return {
          name: 'silent_failure',
          requiresNetwork: false,
          parse() {
            return { ok: true, payload: {} };
          },
          run() {
            return {};
          },
          render() {
            return 1;
          },
        };
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Error: Command failed without an error message.');
  });

  test('--plain removes ANSI codes from global parse errors', async () => {
    const result = await captureInvocation(['--plain', '--format', 'nope', 'get_status']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Invalid format "nope"');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('--plain help renders without ANSI', async () => {
    const result = await captureInvocation(['--plain', '--help']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('SpaceMolt CLI');
    expect(result.stdout).toContain('Command Groups');
    expect(result.stdout).not.toContain('\x1b[');
    expect(result.stderr).toBe('');
  });

  test('--plain payload command help renders without ANSI', async () => {
    const result = await captureInvocation(['--plain', 'travel', 'help=true']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('travel');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).not.toContain('\x1b[');
    expect(result.stderr).toBe('');
  });

  test('parse errors render from explicit output state', async () => {
    const result = await captureInvocation(['--format=invalid'], { SPACEMOLT_OUTPUT: 'json', DEBUG: 'true' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'invalid_global_option',
      },
    });
  });

  test('--structured global parse errors emit machine-readable JSON on stderr', async () => {
    const result = await captureInvocation(['--structured', '--format=invalid']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toMatchObject({
      error: {
        code: 'invalid_global_option',
      },
    });
  });

  test('plain parse errors use explicit plain state', async () => {
    const result = await captureInvocation(['--plain', '--format=invalid']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Error:');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('invalid env profile preserves parsed JSON output state', async () => {
    const result = await captureInvocation(['--json', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves parsed format json output state', async () => {
    const result = await captureInvocation(['--format=json', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves env JSON output state', async () => {
    const result = await captureInvocation(['help'], {
      SPACEMOLT_PROFILE: 'bad/name',
      SPACEMOLT_OUTPUT: 'json',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('invalid_global_option');
  });

  test('invalid env profile preserves parsed plain output state', async () => {
    const result = await captureInvocation(['--plain', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Profile names may only contain');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('invalid env profile preserves parsed quiet output state', async () => {
    const result = await captureInvocation(['--quiet', 'help'], { SPACEMOLT_PROFILE: 'bad/name' });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Profile names may only contain');
  });

  test('quiet parse errors still render diagnostics', async () => {
    const result = await captureInvocation(['--quiet', '--format=invalid']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Invalid format "invalid"');
  });

  test('--format json preserves JSON output for later global parse errors', async () => {
    const result = await captureInvocation(['--format', 'json', '--format', 'nope', 'get_status']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr).error.code).toBe('invalid_global_option');
  });

  test('repeated global parse failures do not leak output mode', async () => {
    const jsonResult = await captureInvocation(['--json', '--format', 'nope']);
    expect(jsonResult.exitCode).toBe(1);
    expect(jsonResult.stdout).toBe('');
    expect(JSON.parse(jsonResult.stderr).error.code).toBe('invalid_global_option');

    const textResult = await captureInvocation(['--format', 'nope']);
    expect(textResult.exitCode).toBe(1);
    expect(textResult.stdout).toBe('');
    expect(textResult.stderr).toContain('Invalid format "nope"');
  });

  test('env JSON output applies to global parse errors', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--format', 'nope'],
      undefined,
      fakeContext(stdout, stderr, { SPACEMOLT_OUTPUT: 'json' }),
    );

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(JSON.parse(stderr.join('\n')).error.code).toBe('invalid_global_option');
  });

  test('context env resolves output mode and profile config', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const env = {
      SPACEMOLT_OUTPUT: 'json',
      SPACEMOLT_PROFILE: 'pilot',
      SPACEMOLT_URL: 'https://context.example/api/v2',
    };

    const exitCode = await runInvocation(['trvel'], undefined, fakeContext(stdout, stderr, env));

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join('\n')).toContain('"unknown_command"');
  });

  test('get_action_log dry-run sends an ordered event array and numeric cursor fields', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-action-log-dry-run-'));
    try {
      const result = await captureInvocation(
        [
          '--json',
          '--dry-run',
          'get_action_log',
          'event_type=faction.production_cycle,ship.buy_order_filled',
          'since_id=42',
          'page_size=100',
        ],
        { ...process.env, XDG_CONFIG_HOME: path.join(tempDir, 'config') },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe('');
      const body = JSON.parse(result.stdout);
      expect(body.structuredContent).toMatchObject({
        command: 'get_action_log',
        method: 'POST',
        payload: {
          event_type: ['faction.production_cycle', 'ship.buy_order_filled'],
          since_id: 42,
          page_size: 100,
        },
        server_request_sent: false,
      });
      expect(body.structuredContent.url).toEndWith('/spacemolt_social/get_action_log');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('connection errors use explicit output state after parsing', async () => {
    const result = await captureInvocation(
      ['--plain', '--debug', 'get_status'],
      { SPACEMOLT_URL: 'https://configured.test/api/v2' },
      {
        createClient(config) {
          return {
            config,
            async execute() {
              throw new Error('fetch failed');
            },
          } as unknown as SpaceMoltClient;
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Connection Error: fetch failed');
    expect(result.stderr).toContain('Verify the API is reachable: https://configured.test/api/v2');
    expect(result.stderr).toContain('[DEBUG] Full error:');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('--structured connection errors emit machine-readable JSON on stderr', async () => {
    const result = await captureInvocation(['--structured', 'get_status'], process.env, {
      createClient(config) {
        return {
          config,
          async execute() {
            throw new Error('fetch failed');
          },
        } as unknown as SpaceMoltClient;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(JSON.parse(result.stderr)).toEqual({
      error: {
        code: 'connection_error',
        message: 'fetch failed',
      },
    });
  });

  test('plain command parse errors use explicit output state', async () => {
    const result = await captureInvocation(['--plain', 'travel']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required argument');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('ambiguous private chat target is rejected before sending a request', async () => {
    let requestSent = false;
    const result = await captureInvocation(
      ['--plain', 'chat', 'private', '--target-id', 'Vex', 'Nebulon', '--content', 'Hello'],
      process.env,
      {
        createClient(config) {
          return {
            config,
            async execute() {
              requestSent = true;
              return { structuredContent: { ok: true } };
            },
          } as unknown as SpaceMoltClient;
        },
      },
    );

    expect(result.exitCode).toBe(1);
    expect(requestSent).toBe(false);
    expect(result.stderr).toContain('Ambiguous private chat target "Vex Nebulon"');
    expect(result.stderr).toContain('Quote multi-word player names');
  });

  test('unquoted chat message is rejected before sending a request', async () => {
    let requestSent = false;
    const result = await captureInvocation(['--plain', 'chat', 'local', 'hello', 'world'], process.env, {
      createClient(config) {
        return {
          config,
          async execute() {
            requestSent = true;
            return { structuredContent: { ok: true } };
          },
        } as unknown as SpaceMoltClient;
      },
    });

    expect(result.exitCode).toBe(1);
    expect(requestSent).toBe(false);
    expect(result.stderr).toContain('Chat message must be quoted or passed with --content.');
  });

  test('quiet command parse errors suppress cached ID suggestions but keep required diagnostics', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-id-cache-'));
    const configHome = path.join(tempDir, 'config');
    const spacemoltHome = path.join(configHome, 'spacemolt-cli');
    const sessionsDir = path.join(spacemoltHome, 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(path.join(spacemoltHome, 'config.json'), `${JSON.stringify({ defaultProfile: 'pilot' })}\n`);
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'sol_earth',
            name: 'Earth',
            sourceCommand: 'get_system',
            seenAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      })}\n`,
    );

    try {
      const result = await withConfigHome(configHome, () =>
        captureInvocation(['--quiet', 'travel'], { XDG_CONFIG_HOME: configHome }),
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Missing required argument');
      expect(result.stderr).not.toContain('Cached poi IDs:');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('plain unknown command diagnostics use explicit output state', async () => {
    const result = await captureInvocation(['--plain', 'trvel']);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command "trvel"');
    expect(result.stderr).not.toContain('\x1b[');
  });

  test('plain local command parse diagnostics use explicit output state', async () => {
    const profileResult = await captureInvocation(['--plain', 'profile', 'nope']);
    const explainResult = await captureInvocation(['--plain', 'explain']);
    const completionResult = await captureInvocation(['--plain', 'completion', 'powershell']);

    expect(profileResult.exitCode).toBe(1);
    expect(explainResult.exitCode).toBe(1);
    expect(completionResult.exitCode).toBe(1);
    expect(`${profileResult.stderr}\n${explainResult.stderr}\n${completionResult.stderr}`).not.toContain('\x1b[');
  });

  test('--plain profile list renders without ANSI', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-profile-plain-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.json'),
      JSON.stringify({
        id: 's',
        username: 'pilot',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
      }),
    );

    try {
      const result = await captureInvocation(['--plain', 'profile', 'list'], { XDG_CONFIG_HOME: configHome });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Profiles');
      expect(result.stdout).not.toContain('\x1b[');
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test('context profile is used for API payload preparation', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-runner-context-'));
    const configHome = path.join(tempDir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'sol_earth',
            name: 'Earth',
            sourceCommand: 'get_system',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const stdout: string[] = [];
    const stderr: string[] = [];
    const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async execute(command: string, payload: Record<string, unknown>) {
        calls.push({ command, payload });
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--quiet', 'travel', 'earth'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(calls).toEqual([{ command: 'travel', payload: { id: 'sol_earth' } }]);
  });
});

describe('runInvocation watch cleanup', () => {
  test('runner dependencies can disable update checks and inject cache routes', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const updates: string[] = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: { route: unknown }, payload: Record<string, unknown>) {
        return { structuredContent: { command, route: config.route, payload } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(
      ['--json', 'deps_dynamic', 'target_1'],
      client,
      fakeContext(stdout, stderr, { SPACEMOLT_PROFILE: 'pilot' }),
      {
        async checkForUpdates() {
          updates.push('called');
        },
        loadCachedGeneratedRoutes() {
          return {
            'POST /api/v2/deps/probe': {
              summary: 'Dependency route',
              route: { tool: 'deps', action: 'probe', method: 'POST' },
              required: ['id'],
              schema: { id: { type: 'string', positionalIndex: 0 } },
              cli: { command: 'deps_dynamic' },
            },
          };
        },
        loadOpenApiCacheVersion() {
          return { status: 'valid', gameserverVersion: 'v999.0.0', fetchedAt: '2026-01-01T00:00:00.000Z' };
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(updates).toEqual([]);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('deps_dynamic');
  });

  test('runner dependency signal hooks are cleaned up in watch mode', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const registered: Array<() => void> = [];
    const removed: Array<() => void> = [];
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const context = fakeContext(stdout, stderr);
    context.sleep = async () => {
      registered[0]?.();
    };

    const exitCode = await runInvocation(
      ['--profile', 'pilot', '--watch=1', '--quiet', 'get_status'],
      client,
      context,
      {
        onSigint(listener) {
          registered.push(listener);
          return () => removed.push(listener);
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(registered).toHaveLength(1);
    expect(removed).toEqual(registered);
  });

  test('watch refresh footer uses explicit plain output state', async () => {
    let ticks = 0;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const client = {
      config: {},
      async execute() {
        ticks += 1;
        if (ticks > 1) throw new Error('stop');
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(['--plain', '--watch=1', 'get_status'], client, fakeContext(stdout, stderr), {
      onSigint() {
        return () => {};
      },
    });

    expect(exitCode).toBe(1);
    const footer = stdout.find((line) => line.includes('[next refresh in 1s')) ?? '';
    expect(footer).toContain('[next refresh in 1s');
    expect(footer).not.toContain('\x1b[');
  });

  test('removes SIGINT listener on normal stop', async () => {
    const before = process.listenerCount('SIGINT');
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: { ok: true } };
      },
    } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = fakeContext(stdout, stderr);
    context.sleep = async () => {
      process.emit('SIGINT');
    };

    const exitCode = await runInvocation(['--profile', 'pilot', '--watch=1', '--quiet', 'get_status'], client, context);

    expect(exitCode).toBe(0);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch parse failure', async () => {
    const before = process.listenerCount('SIGINT');
    const exitCode = await runInvocation(['--watch=1', 'travel'], undefined, fakeContext([], []));

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch connection error', async () => {
    const before = process.listenerCount('SIGINT');
    const client = {
      config: {},
      async execute() {
        throw new Error('network down');
      },
    } as unknown as SpaceMoltClient;
    const exitCode = await runInvocation(['--watch=1', '--quiet', 'get_status'], client, fakeContext([], []));

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });

  test('removes SIGINT listener after watch render error', async () => {
    const before = process.listenerCount('SIGINT');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-watch-render-'));
    const configHome = path.join(tempDir, 'config');
    const configRoot = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(configRoot, { recursive: true });
    fs.writeFileSync(path.join(configRoot, 'sessions'), '');
    const client = {
      config: { profile: 'pilot' },
      async execute() {
        return { structuredContent: cargoFixture };
      },
    } as unknown as SpaceMoltClient;
    const exitCode = await withConfigHome(configHome, () =>
      runInvocation(['--watch=1', '--quiet', 'get_cargo'], client, fakeContext([], [])),
    );

    expect(exitCode).toBe(1);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
