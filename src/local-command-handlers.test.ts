import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SpaceMoltClient } from './api';
import { ApiCommandHandler } from './api-command-handler';
import type { CliEnv, CliRuntimeContext } from './cli-context';
import { buildCommandRegistrySnapshot, type CommandRegistrySnapshot } from './command-registry';
import type { CommandHandler } from './command-types';
import { GENERATED_API_GAMESERVER_VERSION, GENERATED_API_ROUTES } from './generated/api-commands';
import { resolveHandler } from './local-command-handlers';
import { runInvocation } from './main';
import type { GeneratedApiRoute } from './openapi-metadata';
import type { GlobalOptions } from './types';

const options: GlobalOptions = {
  json: false,
  dryRun: false,
  allowUnknown: false,
  plain: false,
  compact: false,
  quiet: false,
  format: 'table',
  noTimestamp: false,
  args: [],
};

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-sync-api-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function localHandler(args: string[]): CommandHandler {
  const handler = resolveHandler(args, options);
  expect(handler).toBeDefined();
  return handler as CommandHandler;
}

function captureContext(env: CliEnv = { HOME: '/tmp/spacemolt-test-home' }): {
  context: CliRuntimeContext;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = fakeContext(stdout, stderr, env);
  return {
    stdout,
    stderr,
    context,
  };
}

function captureDefaultLikeContext(): { context: CliRuntimeContext; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    context: {
      env: { HOME: '/tmp/spacemolt-test-home', SPACEMOLT_UPDATE_CHECK: 'true' },
      writer: {
        out(message = '') {
          stdout.push(`${message}\n`);
        },
        err(message = '') {
          stderr.push(`${message}\n`);
        },
        writeOut(chunk) {
          stdout.push(chunk);
        },
      },
      clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
      sleep: async () => {},
    },
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
    clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
    sleep: async () => {},
  };
}

function dynamicRegistry(): CommandRegistrySnapshot {
  const route: GeneratedApiRoute = {
    operationId: 'spacemolt_lab_calibrate',
    summary: 'Generated API repair command from cached OpenAPI metadata',
    route: { tool: 'spacemolt_lab', action: 'calibrate', method: 'POST' },
    cli: { category: 'Shipyard' },
    required: ['ship_id'],
    schema: {
      ship_id: { type: 'string', positionalIndex: 0, description: 'Ship to repair' },
    },
  };
  return buildCommandRegistrySnapshot({
    generatedRoutes: {
      ...GENERATED_API_ROUTES,
      'POST /api/v2/spacemolt_lab/calibrate': route,
    },
    includeDynamic: true,
  });
}

function specialCompletionWords(shell: string, completion: string, command: string): string[] {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (shell === 'bash') {
    const match = completion.match(new RegExp(`^\\s*${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'));
    const body = match?.groups?.body;
    return (
      body
        ?.match(/compgen -W "([^"]*)"/)?.[1]
        ?.split(/\s+/)
        .filter(Boolean) || []
    );
  }
  if (shell === 'zsh') {
    const match = completion.match(new RegExp(`^\\s*${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'));
    const body = match?.groups?.body;
    return (
      body
        ?.match(/_arguments "1:[^"]*:\(([^)]*)\)"/)?.[1]
        ?.split(/\s+/)
        .filter(Boolean) || []
    );
  }

  return completion
    .split('\n')
    .filter((line) => line.includes(`__fish_seen_subcommand_from ${command}`))
    .map((line) => line.match(/(?:^|\s)-a\s+(\S+)/)?.[1]?.replace(/^"|"$/g, ''))
    .filter(Boolean) as string[];
}

describe('local command handlers', () => {
  test('resolveHandler creates an API handler for a command supplied by a registry snapshot', () => {
    const command = 'dynamic_handler_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          args: ['target_id'],
          required: ['target_id'],
          route: { tool: 'dynamic_handler', action: 'snapshot_test' },
          schema: {
            target_id: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;

    const handler = resolveHandler([command, 'ship_123'], options, registry);

    expect(handler).toBeInstanceOf(ApiCommandHandler);
    expect(handler?.name).toBe(command);
  });

  test('registry API handlers render missing argument help from registry metadata', () => {
    const command = 'dynamic_missing_arg_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          args: ['target_id'],
          required: ['target_id'],
          usage: '<target_id>',
          description: 'Dynamic command with required args',
          route: { tool: 'dynamic_missing_arg', action: 'snapshot_test' },
          schema: {
            target_id: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const handler = resolveHandler([command], options, registry);
    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const { context, stderr } = captureContext();

    const parsed = handler.parse([command], { ...options, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    expect(stderr.join('\n')).toContain(`spacemolt ${command} <target_id>`);
    expect(stderr.join('\n')).toContain(`spacemolt ${command} target_id=...`);
  });

  test('registry API handlers run with their registry command config', async () => {
    const command = 'dynamic_handler_run_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          args: ['target_id'],
          required: ['target_id'],
          route: { tool: 'dynamic_handler', action: 'run_snapshot' },
          schema: {
            target_id: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const handler = resolveHandler([command, 'ship_123'], options, registry);
    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const parsed = handler.parse([command, 'ship_123'], { ...options, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const calls: Array<{ command: string; config: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      async executeCommandConfig(executedCommand: string, config: unknown, payload: Record<string, unknown>) {
        calls.push({ command: executedCommand, config, payload });
        return { result: 'ok' };
      },
    };

    await handler.run(parsed.payload, options, client as never);

    expect(calls).toEqual([
      {
        command,
        config: registry.commands[command],
        payload: { target_id: 'ship_123' },
      },
    ]);
  });

  test('completion renders through CliRuntimeContext writer', async () => {
    const handler = localHandler(['completion', 'fish']);
    expect(handler.name).toBe('completion');
    const parsed = handler.parse(['completion', 'fish'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = (await handler.run(parsed.payload, options)) as { completion: string };
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('complete -c spacemolt');
  });

  test('hidden __complete command routes and renders line protocol candidates', async () => {
    const handler = resolveHandler(['__complete', 'fish', '--', 'spacemolt', 'sell', 'ir'], options);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('__complete');
    expect(handler?.requiresNetwork).toBe(false);
    if (!handler) return;

    const parsed = handler.parse(['__complete', 'fish', '--', 'spacemolt', 'sell', 'ir'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const home = tempDir();
    const { context, stdout, stderr } = captureContext({
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      SPACEMOLT_PROFILE: 'isolated',
    });
    const result = await handler.run(parsed.payload, options, { config: { profile: 'isolated' } } as never, context);

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('');

    const optionParsed = handler.parse(['__complete', 'fish', '--', 'spacemolt', '--pl'], options);
    expect(optionParsed.ok).toBe(true);
    if (!optionParsed.ok) return;
    const optionResult = await handler.run(optionParsed.payload, options);
    const optionCapture = captureContext();

    expect(await handler.render(optionResult, options, undefined, optionCapture.context)).toBe(0);
    expect(optionCapture.stdout.join('')).toContain('--plain\tNo ANSI colors\n');
  });

  test('hidden __complete preserves global-looking completion words end to end', async () => {
    const cases: Array<[string, string]> = [
      ['--format', '--format\tOutput format\n'],
      ['--profile', '--profile\tUse a named profile\n'],
      ['-f', '-f\tExtract comma-separated response fields\n'],
    ];
    for (const [word, expected] of cases) {
      const { context, stdout, stderr } = captureDefaultLikeContext();

      const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', word], undefined, context, {
        checkForUpdates() {
          throw new Error('__complete should not check for updates');
        },
      });

      expect(exitCode, word).toBe(0);
      expect(stderr, word).toEqual([]);
      expect(stdout.join(''), word).toContain(expected);
    }
  });

  test('hidden __complete renders one exact protocol line for a single candidate', async () => {
    const { context, stdout, stderr } = captureDefaultLikeContext();

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', '--plain'], undefined, context, {
      checkForUpdates() {
        throw new Error('__complete should not check for updates');
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('--plain\tNo ANSI colors\n');
  });

  test('hidden __complete renders empty end-to-end output without a newline', async () => {
    const { context, stdout, stderr } = captureDefaultLikeContext();

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', 'zzz'], undefined, context, {
      checkForUpdates() {
        throw new Error('__complete should not check for updates');
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('');
  });

  test('hidden __complete renders no candidates after a command positional starts without cached ID context', async () => {
    const { context, stdout, stderr } = captureDefaultLikeContext();

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', 'sell', ''], undefined, context, {
      checkForUpdates() {
        throw new Error('__complete should not check for updates');
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('');
  });

  test('hidden __complete renders global option values end to end', async () => {
    const { context, stdout, stderr } = captureDefaultLikeContext();

    const exitCode = await runInvocation(
      ['__complete', 'fish', '--', 'spacemolt', '--format', ''],
      undefined,
      context,
      {
        checkForUpdates() {
          throw new Error('__complete should not check for updates');
        },
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('table\t\njson\t\nyaml\t\ntext\t\n');
  });

  test('hidden __complete keeps completing top-level after non-value global flags', async () => {
    const { context, stdout, stderr } = captureDefaultLikeContext();

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', '--plain', ''], undefined, context, {
      checkForUpdates() {
        throw new Error('__complete should not check for updates');
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('sell\tSell cargo items.');
  });

  test('hidden __complete command is not listed by commands or full help', async () => {
    const commandsHandler = localHandler(['commands']);
    const commandsParsed = commandsHandler.parse(['commands'], options);
    expect(commandsParsed.ok).toBe(true);
    if (!commandsParsed.ok) return;
    const commandsResult = await commandsHandler.run(commandsParsed.payload, options);
    const commandsCapture = captureContext();

    expect(await commandsHandler.render(commandsResult, options, undefined, commandsCapture.context)).toBe(0);
    expect(commandsCapture.stdout.join('\n')).not.toContain('__complete');

    const helpHandler = localHandler(['help', 'all']);
    const helpParsed = helpHandler.parse(['help', 'all'], options);
    expect(helpParsed.ok).toBe(true);
    if (!helpParsed.ok) return;
    const helpResult = await helpHandler.run(helpParsed.payload, options);
    const helpCapture = captureContext();

    expect(await helpHandler.render(helpResult, options, undefined, helpCapture.context)).toBe(0);
    expect(helpCapture.stdout.join('\n')).not.toContain('__complete');
  });

  test('commands search includes commands supplied only by a registry snapshot', async () => {
    const registry = dynamicRegistry();
    const handler = resolveHandler(['commands', '--search', 'shipyard'], options, registry);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('commands');
    if (!handler) return;
    const parsed = handler.parse(['commands', '--search', 'shipyard'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = (await handler.run(parsed.payload, options)) as { completion: string };
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('lab_calibrate');
    expect(stdout.join('\n')).toContain('Generated API');
  });

  test('completion includes commands supplied only by a registry snapshot', async () => {
    const registry = dynamicRegistry();
    const handler = resolveHandler(['completion', 'fish'], options, registry);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('completion');
    if (!handler) return;
    const parsed = handler.parse(['completion', 'fish'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = (await handler.run(parsed.payload, options)) as { completion: string };

    expect(result.completion).toContain('lab_calibrate');
    expect(result.completion).toContain('Generated API');
  });

  test('completion handler includes local command and subcommand completions for every shell', async () => {
    const expectedCommands = ['doctor', 'version', 'profile', 'ids', 'where-can-i', 'sync-api'];
    const expectedSubcommands = {
      completion: ['bash', 'zsh', 'fish'],
      ids: ['poi', 'system', 'item', 'player'],
      profile: ['list', 'default'],
    };

    for (const shell of ['bash', 'zsh', 'fish']) {
      const handler = localHandler(['completion', shell]);
      const parsed = handler.parse(['completion', shell], options);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;

      const result = (await handler.run(parsed.payload, options)) as { completion: string };

      for (const command of expectedCommands) {
        expect(result.completion, `${shell} completion should include ${command}`).toContain(command);
      }
      for (const [command, values] of Object.entries(expectedSubcommands)) {
        expect(specialCompletionWords(shell, result.completion, command), `${shell} ${command} values`).toEqual(values);
      }
    }
  });

  test('ids command renders JSON with cached hints', async () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
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
    const client = { config: { profile: 'pilot' } } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--json', 'ids', 'poi'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join('\n')).structuredContent.ids[0].id).toBe('sol_earth');
  });

  test('ids command filters cached hints with search forms', async () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'item',
            id: 'fuel_cell',
            name: 'Fuel Cell',
            sourceCommand: 'view_market',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'item',
            id: 'ore_iron',
            name: 'Iron Ore',
            sourceCommand: 'get_cargo',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const client = { config: { profile: 'pilot' } } as unknown as SpaceMoltClient;

    for (const args of [
      ['--json', 'ids', 'item', '--search', 'fuel'],
      ['--json', 'ids', 'item', '--search=fuel'],
      ['--json', 'ids', 'item', 'search=fuel'],
    ]) {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const exitCode = await runInvocation(
        args,
        client,
        fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
      );

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      const ids = JSON.parse(stdout.join('\n')).structuredContent.ids;
      expect(ids.map((hint: { id: string }) => hint.id)).toEqual(['fuel_cell']);
    }
  });

  test('ids command filters text output with search', async () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.ids.json'),
      `${JSON.stringify({
        version: 1,
        hints: [
          {
            kind: 'poi',
            id: 'nova_terra_central',
            name: 'Central Station',
            sourceCommand: 'get_system',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
          {
            kind: 'poi',
            id: 'nova_terra_industrial_belt',
            name: 'Industrial Belt',
            sourceCommand: 'get_system',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const client = { config: { profile: 'pilot' } } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['ids', 'poi', '--search', 'belt'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('nova_terra_industrial_belt');
    expect(stdout.join('\n')).not.toContain('nova_terra_central');
  });

  test('where-can-i requires a search query before reading cache', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const client = {
      get config(): never {
        throw new Error('cache should not be read for missing where-can-i query');
      },
    } as unknown as SpaceMoltClient;

    const exitCode = await runInvocation(['where-can-i'], client, fakeContext(stdout, stderr));

    expect(exitCode).toBe(1);
    expect(stderr.join('\n')).toContain('Usage: spacemolt where-can-i <item>');
  });

  test('api command parsing resolves cached IDs from injected config home', () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
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
    const handler = resolveHandler(['travel', 'earth'], options);
    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;

    const parsed = handler.parse(
      ['travel', 'earth'],
      options,
      fakeContext([], [], { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.payload).toEqual({ id: 'sol_earth' });
  });

  test('unknown profile action shows profile usage', () => {
    const handler = localHandler(['profile']);
    const parsed = handler.parse(['profile', 'remove'], options);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.customStderr).toContain('Usage: spacemolt profile [list|default [name]]');
  });

  test('version renders through CliRuntimeContext writer', async () => {
    const handler = localHandler(['version']);
    expect(handler.name).toBe('version');
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({
      HOME: '/tmp/spacemolt-test-home',
      XDG_CONFIG_HOME: tempDir(),
    });
    const result = await handler.run(parsed.payload, options, undefined, context);

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout[0]).toMatch(/^SpaceMolt Client v/);
    expect(stdout[1]).toMatch(/^API: /);
    expect(stdout[2]).toBe(`Bundled OpenAPI metadata: gameserver ${GENERATED_API_GAMESERVER_VERSION}`);
    expect(stdout[3]).toBe('Cached OpenAPI metadata: not synced');
  });

  test('version renders cached OpenAPI metadata as current when versions match', async () => {
    const configHome = tempDir();
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-23T12:00:00.000Z',
        gameserverVersion: GENERATED_API_GAMESERVER_VERSION,
        routes: {},
      }),
    );
    const handler = localHandler(['version']);
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({ HOME: '/tmp/spacemolt-test-home', XDG_CONFIG_HOME: configHome });

    const result = await handler.run(parsed.payload, options, undefined, context);
    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout).toContain(`Cached OpenAPI metadata: gameserver ${GENERATED_API_GAMESERVER_VERSION} (current)`);
  });

  test('version renders cached OpenAPI metadata as stale when versions differ', async () => {
    const configHome = tempDir();
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-23T12:00:00.000Z',
        gameserverVersion: 'v0.323.0',
        routes: {},
      }),
    );
    const handler = localHandler(['version']);
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({ HOME: '/tmp/spacemolt-test-home', XDG_CONFIG_HOME: configHome });

    const result = await handler.run(parsed.payload, options, undefined, context);
    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Cached OpenAPI metadata: gameserver v0.323.0 (stale)');
  });

  test('version renders cached OpenAPI metadata as newer when it is ahead of bundled metadata', async () => {
    const configHome = tempDir();
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-23T12:00:00.000Z',
        gameserverVersion: 'v999.0.0',
        routes: {},
      }),
    );
    const handler = localHandler(['version']);
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({ HOME: '/tmp/spacemolt-test-home', XDG_CONFIG_HOME: configHome });

    const result = await handler.run(parsed.payload, options, undefined, context);
    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Cached OpenAPI metadata: gameserver v999.0.0 (newer than bundled)');
  });

  test('version renders cached OpenAPI metadata as invalid when the cache lacks a version', async () => {
    const configHome = tempDir();
    const cacheDir = path.join(configHome, 'spacemolt-cli');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(cacheDir, 'openapi-cache.json'),
      JSON.stringify({
        fetchedAt: '2026-05-23T12:00:00.000Z',
        routes: {},
      }),
    );
    const handler = localHandler(['version']);
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({ HOME: '/tmp/spacemolt-test-home', XDG_CONFIG_HOME: configHome });

    const result = await handler.run(parsed.payload, options, undefined, context);
    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout).toContain('Cached OpenAPI metadata: invalid (run spacemolt sync-api)');
  });

  test('explain unknown command emits JSON error for json mode', async () => {
    const handler = localHandler(['explain']);
    expect(handler.name).toBe('explain');
    const parsed = handler.parse(['explain', 'nope_nope'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, json: true }, undefined, context);

    expect(exitCode).toBe(1);
    expect(JSON.parse(stdout.join('\n'))).toEqual({
      error: { code: 'unknown_command', message: 'Unknown command: nope_nope' },
    });
  });

  test('explain recognizes commands supplied by a registry snapshot', async () => {
    const command = 'dynamic_explain_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          description: 'Dynamic command for explain tests',
          route: { tool: 'dynamic_explain', action: 'snapshot_test' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const handler = resolveHandler(['explain', command], options, registry);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('explain');
    if (!handler) return;

    const parsed = handler.parse(['explain', command], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = await handler.run(parsed.payload, options);

    expect(result).toEqual({ found: true, command });
  });

  test('explain renders commands supplied by a registry snapshot', async () => {
    const command = 'dynamic_explain_render_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          description: 'Dynamic command for explain render tests',
          category: 'Generated API',
          route: { tool: 'dynamic_explain', action: 'render_snapshot' },
        },
      },
      allCommands: {},
    } satisfies Pick<CommandRegistrySnapshot, 'commands' | 'allCommands'>;
    registry.allCommands = registry.commands;
    const handler = resolveHandler(['explain', command], options, registry);
    expect(handler).toBeDefined();
    if (!handler) return;
    const parsed = handler.parse(['explain', command], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Dynamic command for explain render tests');
    expect(stdout.join('\n')).toContain('POST /api/v2/dynamic_explain/render_snapshot');
  });

  test('help renders commands supplied by a registry snapshot', async () => {
    const command = 'dynamic_help_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          description: 'Dynamic command for help tests',
          route: { tool: 'dynamic_help', action: 'snapshot_test' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const handler = resolveHandler(['help', command], options, registry);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', command], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Dynamic command for help tests');
  });

  test('help travel renders local command explanation with accepted forms and API route', async () => {
    const handler = resolveHandler(['help', 'travel'], options);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', 'travel'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout, stderr } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    const output = stdout.join('\n');
    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(output).toContain('spacemolt travel');
    expect(output).toContain('Accepted forms:');
    expect(output).toContain('API route:');
  });

  test('full help includes commands supplied only by a registry snapshot', async () => {
    const registry = dynamicRegistry();
    const handler = resolveHandler(['help', 'all'], options, registry);
    expect(handler).toBeDefined();
    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', 'all'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('lab_calibrate');
    expect(stdout.join('\n')).toContain('Generated API');
  });

  test('help command key-value form remains an API command', () => {
    const handler = resolveHandler(['help', 'command=get_status'], options);

    expect(handler).toBeInstanceOf(ApiCommandHandler);
    expect(handler?.name).toBe('help');
  });

  test('api command inline help renders commands supplied by a registry snapshot', () => {
    const command = 'dynamic_inline_help_snapshot_test';
    const registry = {
      commands: {
        [command]: {
          description: 'Dynamic command for inline help tests',
          route: { tool: 'dynamic_inline_help', action: 'snapshot_test' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const handler = resolveHandler([command], options, registry);
    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse([command, '--help'], { ...options, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    expect(parsed.error.exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Dynamic command for inline help tests');
  });

  test('sync-api refreshes cached OpenAPI routes and renders a text summary', async () => {
    const configHome = tempDir();
    const fetches: string[] = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input) => {
      fetches.push(String(input));
      return new Response(
        JSON.stringify({
          openapi: '3.0.3',
          info: { 'x-gameserver-version': 'v0.324.1' },
          paths: {
            '/api/v2/spacemolt_shipyard/repair': {
              post: {
                summary: 'repair',
                requestBody: {
                  content: {
                    'application/json': {
                      schema: {
                        properties: { ship_id: { type: 'string' } },
                        required: ['ship_id'],
                      },
                    },
                  },
                },
              },
            },
          },
        }),
      );
    }) as typeof fetch;
    try {
      const handler = localHandler(['sync-api']);
      expect(handler.requiresNetwork).toBe(true);
      const parsed = handler.parse(['sync-api'], options);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const { context, stdout } = captureContext();
      context.env.XDG_CONFIG_HOME = configHome;
      context.config = {
        apiBase: 'https://example.test/api/v2',
        jsonOutput: false,
        debug: false,
        plain: false,
        quiet: false,
        format: 'table',
        compact: false,
      };

      const result = await handler.run(parsed.payload, options, undefined, context);
      const exitCode = await handler.render(result, options, undefined, context);

      expect(exitCode).toBe(0);
      expect(fetches).toEqual(['https://example.test/api/v2/openapi.json']);
      expect(stdout).toEqual(['Synced 1 OpenAPI routes for gameserver v0.324.1.']);
      expect(fs.existsSync(path.join(configHome, 'spacemolt-cli', 'openapi-cache.json'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('sync-api renders a JSON summary for json mode', async () => {
    const configHome = tempDir();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          openapi: '3.0.3',
          info: { 'x-gameserver-version': 'v0.324.1' },
          paths: {
            '/api/v2/spacemolt_shipyard/repair': { post: { summary: 'repair' } },
            '/api/v2/status': { get: { summary: 'status' } },
          },
        }),
      )) as unknown as typeof fetch;
    try {
      const handler = localHandler(['sync-api']);
      const parsed = handler.parse(['sync-api'], { ...options, json: true });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      const { context, stdout } = captureContext();
      context.env.XDG_CONFIG_HOME = configHome;
      context.config = {
        apiBase: 'https://example.test/api/v2',
        jsonOutput: true,
        debug: false,
        plain: false,
        quiet: false,
        format: 'json',
        compact: false,
      };

      const result = await handler.run(parsed.payload, { ...options, json: true }, undefined, context);
      const exitCode = await handler.render(result, { ...options, json: true }, undefined, context);

      expect(exitCode).toBe(0);
      expect(JSON.parse(stdout.join('\n'))).toEqual({
        routeCount: 2,
        fetchedAt: expect.any(String),
        gameserverVersion: 'v0.324.1',
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('sync-api is discoverable through local help and command search', async () => {
    const helpHandler = localHandler(['help', 'sync-api']);
    const parsedHelp = helpHandler.parse(['help', 'sync-api'], options);
    expect(parsedHelp.ok).toBe(true);
    if (!parsedHelp.ok) return;
    const helpResult = await helpHandler.run(parsedHelp.payload, options);
    const helpCapture = captureContext();

    const helpExitCode = await helpHandler.render(helpResult, options, undefined, helpCapture.context);

    expect(helpExitCode).toBe(0);
    expect(helpCapture.stdout.join('\n')).toContain('Refresh the cached OpenAPI command metadata.');

    const commandsHandler = localHandler(['commands', 'sync-api']);
    const parsedCommands = commandsHandler.parse(['commands', 'sync-api'], options);
    expect(parsedCommands.ok).toBe(true);
    if (!parsedCommands.ok) return;
    const commandsResult = await commandsHandler.run(parsedCommands.payload, options);
    const commandsCapture = captureContext();

    const commandsExitCode = await commandsHandler.render(commandsResult, options, undefined, commandsCapture.context);

    expect(commandsExitCode).toBe(0);
    expect(commandsCapture.stdout.join('\n')).toContain('sync-api');
  });
});
