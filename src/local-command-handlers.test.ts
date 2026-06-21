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
import type { CommandRunResult } from './response-renderer';
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
    .filter((line) => new RegExp(`__fish_seen_subcommand_from ${escapedCommand}(?:"|\\s|$)`).test(line))
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

  test('nested API commands resolve and parse with original command configs', () => {
    const cases: Array<{ argv: string[]; payload: Record<string, unknown>; handlerName: string }> = [
      { argv: ['citizenship', 'apply', 'solarian'], payload: { target: 'solarian' }, handlerName: 'citizenship apply' },
      {
        argv: ['facility', 'job_add', 'facility-1', 'refine_steel', '12', 'reverse'],
        payload: { facility_id: 'facility-1', recipe_id: 'refine_steel', quantity: 12, direction: 'reverse' },
        handlerName: 'facility job_add',
      },
      {
        argv: ['faction', 'create_buy_order', 'ore_iron', '100', '12'],
        payload: { item_id: 'ore_iron', quantity: 100, price_each: 12 },
        handlerName: 'faction create_buy_order',
      },
      { argv: ['fleet', 'invite', 'PlayerName'], payload: { id: 'PlayerName' }, handlerName: 'fleet invite' },
      { argv: ['forum', 'get_thread', 'thread-1'], payload: { target: 'thread-1' }, handlerName: 'forum get_thread' },
      { argv: ['station', 'set_name', 'Aurora Freeport'], payload: { name: 'Aurora Freeport' }, handlerName: 'station set_name' },
      { argv: ['trade', 'offer', 'player-1', 'credits=500'], payload: { target: 'player-1', offer_credits: 500 }, handlerName: 'trade offer' },
    ];

    for (const entry of cases) {
      const handler = resolveHandler(entry.argv, options);
      expect(handler?.name, entry.argv.join(' ')).toBe(entry.handlerName);
      const parsed = handler?.parse(entry.argv, { ...options, profile: 'pilot' }, fakeContext([], []));
      expect(parsed?.ok, entry.argv.join(' ')).toBe(true);
      if (!parsed || !parsed.ok) continue;
      expect(parsed.payload, entry.argv.join(' ')).toEqual(entry.payload);
    }
  });

  test('removed flat grouped commands are unknown', () => {
    for (const command of ['citizenship_apply', 'facility_job_add', 'faction_info', 'fleet_invite', 'forum_get_thread', 'station_set_name', 'trade_offer']) {
      expect(resolveHandler([command], options), command).toBeUndefined();
    }
  });

  test('nested API command dry run keeps nested display name and original route', async () => {
    const handler = resolveHandler(['faction', 'create_buy_order', 'ore_iron', '100', '12'], options);
    expect(handler?.name).toBe('faction create_buy_order');
    if (!handler) return;
    const parsed = handler.parse(
      ['faction', 'create_buy_order', 'ore_iron', '100', '12'],
      { ...options, dryRun: true, profile: 'pilot' },
      fakeContext([], []),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const runResult = (await handler.run(parsed.payload, { ...options, dryRun: true }, undefined)) as CommandRunResult & {
      displayCommand?: string;
    };

    expect(runResult).toMatchObject({
      command: 'faction_create_buy_order',
      displayCommand: 'faction create_buy_order',
      payload: { item_id: 'ore_iron', quantity: 100, price_each: 12 },
    });
    expect(runResult.response.structuredContent?.url).toContain('/api/v2/spacemolt_faction_commerce/create_buy_order');
  });

  test('unknown nested actions fail without API dispatch', () => {
    expect(resolveHandler(['faction', 'made_up'], options)).toBeUndefined();
  });

  test('nested API command inline help uses grouped display name', () => {
    const handler = resolveHandler(['facility', 'job_add', 'help'], options);
    expect(handler?.name).toBe('facility job_add');
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['facility', 'job_add', 'help'], { ...options, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    const output = stdout.join('\n');
    expect(output).toContain('spacemolt facility job_add');
    expect(output).not.toContain('facility_job_add');
  });

  test('nested API command missing required argument output uses grouped display name', () => {
    const handler = resolveHandler(['facility', 'job_add'], options);
    expect(handler?.name).toBe('facility job_add');
    if (!handler) return;
    const { context, stderr } = captureContext();

    const parsed = handler.parse(['facility', 'job_add'], { ...options, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('missing_required_argument');
    const output = stderr.join('\n');
    expect(output).toContain('spacemolt facility job_add');
    expect(output).not.toContain('facility_job_add');
  });

  test('nested API command named args still report missing required fields with grouped display name', () => {
    const handler = resolveHandler(['facility', 'upgrade', '--facility-id', 'facility-1'], options);
    expect(handler?.name).toBe('facility upgrade');
    if (!handler) return;
    const { context, stderr } = captureContext();

    const parsed = handler.parse(
      ['facility', 'upgrade', '--facility-id', 'facility-1'],
      { ...options, profile: 'pilot' },
      context,
    );

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('missing_required_argument');
    const output = stderr.join('\n');
    expect(output).toContain('spacemolt facility upgrade');
    expect(output).not.toContain('facility_upgrade');
  });

  test('API command local search restoration does not mutate global output search options', () => {
    const handler = new ApiCommandHandler('view_market');
    const parseOptions: GlobalOptions = { ...options, outputSearch: 'iron' };

    const first = handler.parse(['view_market'], parseOptions, fakeContext([], []));
    const second = handler.parse(['view_market'], parseOptions, fakeContext([], []));

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.payload.search).toBe('iron');
    expect(second.payload.search).toBe('iron');
    expect(parseOptions.outputSearch).toBe('iron');
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

  test('commands --search filters through runInvocation global parsing', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['commands', '--search', 'shipyard'],
      undefined,
      fakeContext(stdout, stderr, { HOME: '/tmp/spacemolt-test-home' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('Commands matching "shipyard"');
    expect(stdout.join('\n')).toContain('commission_ship');
    expect(stdout.join('\n')).not.toContain('All Commands');
  });

  test('commands --search preserves multi-word queries through runInvocation global parsing', async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['commands', '--search', 'fuel', 'cell'],
      undefined,
      fakeContext(stdout, stderr, { HOME: '/tmp/spacemolt-test-home' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('Commands matching "fuel cell"');
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
    const expectedCommands = ['config', 'doctor', 'version', 'profile', 'ids', 'where-can-i', 'sync-api'];
    const expectedSubcommands = {
      config: ['user-agent'],
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

  test('config user-agent shows the default when no custom value is saved', async () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
    const handler = localHandler(['config', 'user-agent']);
    const parsed = handler.parse(['config', 'user-agent'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { context, stdout } = captureContext({ XDG_CONFIG_HOME: configHome });

    const result = await handler.run(parsed.payload, options, undefined, context);
    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toMatch(/^User agent: SpaceMolt-Client\/\d+\.\d+\.\d+$/);
  });

  test('config user-agent saves, shows, and resets a custom user agent', async () => {
    const dir = tempDir();
    const configHome = path.join(dir, 'config');
    const env = { XDG_CONFIG_HOME: configHome };
    const setHandler = localHandler(['config', 'user-agent', 'ENDL-TradeBot/1.0']);
    const showHandler = localHandler(['config', 'user-agent']);
    const resetHandler = localHandler(['config', 'user-agent', '--reset']);

    const setParsed = setHandler.parse(['config', 'user-agent', 'ENDL-TradeBot/1.0'], options);
    expect(setParsed.ok).toBe(true);
    if (!setParsed.ok) return;
    const setCapture = captureContext(env);
    const setResult = await setHandler.run(setParsed.payload, options, undefined, setCapture.context);
    expect(await setHandler.render(setResult, options, undefined, setCapture.context)).toBe(0);
    expect(setCapture.stdout.join('\n')).toBe('User agent: ENDL-TradeBot/1.0');

    const showParsed = showHandler.parse(['config', 'user-agent'], options);
    expect(showParsed.ok).toBe(true);
    if (!showParsed.ok) return;
    const showCapture = captureContext(env);
    const showResult = await showHandler.run(showParsed.payload, options, undefined, showCapture.context);
    expect(await showHandler.render(showResult, options, undefined, showCapture.context)).toBe(0);
    expect(showCapture.stdout.join('\n')).toBe('User agent: ENDL-TradeBot/1.0');

    const resetParsed = resetHandler.parse(['config', 'user-agent', '--reset'], options);
    expect(resetParsed.ok).toBe(true);
    if (!resetParsed.ok) return;
    const resetCapture = captureContext(env);
    const resetResult = await resetHandler.run(resetParsed.payload, options, undefined, resetCapture.context);
    expect(await resetHandler.render(resetResult, options, undefined, resetCapture.context)).toBe(0);
    expect(resetCapture.stdout.join('\n')).toMatch(/^User agent: SpaceMolt-Client\/\d+\.\d+\.\d+$/);
    expect(fs.readFileSync(path.join(configHome, 'spacemolt-cli', 'config.json'), 'utf-8')).not.toContain('userAgent');
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

  test('ids command preserves multi-word dashed search through runInvocation global parsing', async () => {
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
            id: 'fuel_rod',
            name: 'Fuel Rod',
            sourceCommand: 'view_market',
            seenAt: '2026-05-18T00:00:00.000Z',
          },
        ],
      })}\n`,
    );
    const client = { config: { profile: 'pilot' } } as unknown as SpaceMoltClient;
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(
      ['--json', 'ids', 'item', '--search', 'fuel', 'cell'],
      client,
      fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome, SPACEMOLT_PROFILE: 'pilot' }),
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    const body = JSON.parse(stdout.join('\n')).structuredContent;
    expect(body.search).toBe('fuel cell');
    expect(body.ids.map((hint: { id: string }) => hint.id)).toEqual(['fuel_cell']);
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
    expect(stdout[1]).toMatch(/^Commit: [0-9a-f]{7,40}$/);
    expect(stdout[2]).toMatch(/^API: /);
    expect(stdout[3]).toBe(`Bundled OpenAPI metadata: gameserver ${GENERATED_API_GAMESERVER_VERSION}`);
    expect(stdout[4]).toBe('Cached OpenAPI metadata: not synced');
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

  test('help for API-backed commands includes server-help pointer', async () => {
    const handler = resolveHandler(['help', 'travel'], options);
    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', 'travel'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Server help:');
    expect(stdout.join('\n')).toContain('spacemolt server-help travel');
  });

  test('help with unknown terms searches local commands', async () => {
    const handler = resolveHandler(['help', 'faction', 'build'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['help', 'faction', 'build'], { ...options, profile: 'pilot' }, context);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);
    const exitCode = await handler.render(result, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('Commands matching "faction build"');
    expect(output).toContain('faction_build <facility_type>');
  });

  test('group trailing --help renders local group help without network', async () => {
    const handler = resolveHandler(['faction', '--help'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['faction', '--help'], { ...options, profile: 'pilot' }, context);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);
    const exitCode = await handler.render(result, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Faction Commands');
  });

  test('group trailing -h renders local group help without network', async () => {
    const handler = resolveHandler(['facility', '-h'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['facility', '-h'], { ...options, profile: 'pilot' }, context);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);
    const exitCode = await handler.render(result, { ...options, profile: 'pilot' }, {} as SpaceMoltClient, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Facilities Commands');
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

  test('help command key-value form normalizes to command help', async () => {
    const handler = resolveHandler(['help', 'command=get_status'], options);

    expect(handler?.name).toBe('help');
    expect(handler).not.toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const parsed = handler.parse(['help', 'command=get_status'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('spacemolt get_status');
    expect(output).toContain('API route:');
    expect(output).not.toContain('Commands matching "command=get_status"');
  });

  test('help --help shows local help overview', async () => {
    const handler = resolveHandler(['help', '--help'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', '--help'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('SpaceMolt CLI');
    expect(output).toContain('Command Groups');
    expect(output).not.toContain('Commands matching "--help"');
  });

  test('help without --server remains local and network-free', async () => {
    const handler = resolveHandler(['help', 'repair'], options);
    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', 'repair'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('spacemolt repair');
  });

  test('help -h shows local help overview', async () => {
    const handler = resolveHandler(['help', '-h'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', '-h'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('SpaceMolt CLI');
    expect(output).toContain('Command Groups');
    expect(output).not.toContain('Commands matching "-h"');
  });

  test('help help renders local help metadata without API route', async () => {
    const handler = resolveHandler(['help', 'help'], options);

    expect(handler?.name).toBe('help');
    if (!handler) return;
    const parsed = handler.parse(['help', 'help'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('spacemolt help');
    expect(output).toContain('local helper command');
    expect(output).not.toContain('API route:');
    expect(output).not.toContain('Fetch server help');
    expect(output).not.toContain('Server help:');
    expect(output).not.toContain('spacemolt server-help help');
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

  test('api command trailing help renders local command help without network', async () => {
    const handler = resolveHandler(['facility_upgrade', 'help'], options);

    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['facility_upgrade', 'help'], { ...options, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    expect(parsed.error.exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('facility_upgrade');
    expect(stdout.join('\n')).toContain('spacemolt facility_upgrade --facility-type ... --facility-id ...');
  });

  test('api command trailing help respects plain output state', async () => {
    const handler = resolveHandler(['facility_upgrade', 'help'], { ...options, plain: true });

    expect(handler).toBeInstanceOf(ApiCommandHandler);
    if (!handler) return;
    const { context, stdout } = captureContext();

    const parsed = handler.parse(['facility_upgrade', 'help'], { ...options, plain: true, profile: 'pilot' }, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    expect(parsed.error.exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('facility_upgrade');
    expect(stdout.join('\n')).not.toContain('\x1b[');
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

  test('server-help dispatches canonical server help without topic', async () => {
    const calls: Array<{ command: string; config: unknown; payload: Record<string, unknown> }> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(command: string, config: unknown, payload: Record<string, unknown>) {
        calls.push({ command, config, payload });
        return { result: 'Server help index' };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help'], options);
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help'], { ...options, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);
    const { context, stdout, stderr } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.command).toBe('server-help');
    expect(calls[0]?.payload).toEqual({});
    expect(calls[0]?.config).toMatchObject({ route: { tool: 'spacemolt', action: 'help', method: 'POST' } });
    expect(stdout.join('\n')).toContain('Server help index');
    expect(stderr).toEqual([]);
  });

  test('server-help human output maps server tool and action to local command', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          result: 'Buy command help',
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, plain: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, profile: 'pilot', plain: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('CLI command:');
    expect(output).toContain('spacemolt buy');
  });

  test('server-help human output does not map mismatched server tool and action', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          result: 'Market buy command help',
          structuredContent: {
            tool: 'spacemolt_market',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, plain: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, profile: 'pilot', plain: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('Tool: spacemolt_market');
    expect(output).toContain('Action: buy');
    expect(output).not.toContain('CLI command:');
    expect(output).not.toContain('spacemolt buy');
  });

  test('server-help JSON output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, json: true, format: 'json' });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], {
      ...options,
      json: true,
      format: 'json',
      profile: 'pilot',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(
      parsed.payload,
      { ...options, json: true, format: 'json', profile: 'pilot' },
      client,
    );
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(
      result,
      { ...options, json: true, format: 'json', profile: 'pilot' },
      client,
      context,
    );

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
    expect(JSON.parse(stdout.join('\n'))).toEqual({
      structuredContent: {
        tool: 'spacemolt',
        action: 'buy',
      },
    });
  });

  test('server-help YAML output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, format: 'yaml' });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, format: 'yaml', profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, format: 'yaml', profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, format: 'yaml', profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help compact output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, compact: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, compact: true, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, compact: true, profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, compact: true, profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help structured output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, structured: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, structured: true, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, structured: true, profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, structured: true, profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help jq output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, jq: '.tool' });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, jq: '.tool', profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, jq: '.tool', profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, jq: '.tool', profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help field output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, field: 'tool' });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, field: 'tool', profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, field: 'tool', profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, field: 'tool', profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help fields output does not append human local command mapping', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt',
            action: 'buy',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, fields: ['tool', 'action'] });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], {
      ...options,
      fields: ['tool', 'action'],
      profile: 'pilot',
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(
      parsed.payload,
      { ...options, fields: ['tool', 'action'], profile: 'pilot' },
      client,
    );
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(
      result,
      { ...options, fields: ['tool', 'action'], profile: 'pilot' },
      client,
      context,
    );

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help suppresses mapping for ambiguous duplicate exact route matches', async () => {
    const registry = {
      commands: {
        alpha_deposit: {
          usage: '<amount>',
          route: { tool: 'spacemolt_storage', action: 'deposit' },
        },
        beta_deposit: {
          usage: '<amount>',
          route: { tool: 'spacemolt_storage', action: 'deposit' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt_storage',
            action: 'deposit',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'deposit'], options, registry);
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'deposit'], { ...options, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot' }, client, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('Tool: spacemolt_storage');
    expect(output).toContain('Action: deposit');
    expect(output).not.toContain('CLI command:');
  });

  test('server-help does not synthesize mapping from unrelated nested tool and action values', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            server: {
              tool: 'spacemolt',
            },
            example: {
              action: 'buy',
            },
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, plain: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, profile: 'pilot', plain: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help does not map arbitrary nested related target-looking values', async () => {
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            related: {
              tool: 'spacemolt',
              action: 'buy',
            },
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'buy'], { ...options, plain: true });
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'buy'], { ...options, profile: 'pilot', plain: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).not.toContain('CLI command:');
  });

  test('server-help maps registry snapshot command when it is the only exact route match', async () => {
    const registry = {
      commands: {
        dynamic_calibrate: {
          usage: '<target_id>',
          route: { tool: 'spacemolt_lab', action: 'calibrate' },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig() {
        return {
          structuredContent: {
            tool: 'spacemolt_lab',
            action: 'calibrate',
          },
        };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'calibrate'], { ...options, plain: true }, registry);
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'calibrate'], { ...options, profile: 'pilot', plain: true });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, { ...options, profile: 'pilot', plain: true }, client);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, { ...options, profile: 'pilot', plain: true }, client, context);

    expect(exitCode).toBe(0);
    const output = stdout.join('\n');
    expect(output).toContain('CLI command:');
    expect(output).toContain('spacemolt dynamic_calibrate <target_id>');
  });

  test('server-help joins topic words into one topic payload', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push(payload);
        return { result: 'Faction build help' };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['server-help', 'faction', 'build'], options);
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['server-help', 'faction', 'build'], { ...options, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);

    expect(calls).toEqual([{ topic: 'faction build' }]);
  });

  test('help --server normalizes to server-help topic lookup', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      config: { profile: 'pilot' },
      async executeCommandConfig(_command: string, _config: unknown, payload: Record<string, unknown>) {
        calls.push(payload);
        return { result: 'Repair help' };
      },
    } as unknown as SpaceMoltClient;
    const handler = resolveHandler(['help', '--server', 'repair'], options);
    expect(handler?.name).toBe('server-help');
    if (!handler) return;
    const parsed = handler.parse(['help', '--server', 'repair'], { ...options, profile: 'pilot' });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    await handler.run(parsed.payload, { ...options, profile: 'pilot' }, client);

    expect(calls).toEqual([{ topic: 'repair' }]);
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

  test('server-help is discoverable through local help and command search', async () => {
    const helpHandler = localHandler(['help', 'server-help']);
    const parsedHelp = helpHandler.parse(['help', 'server-help'], options);
    expect(parsedHelp.ok).toBe(true);
    if (!parsedHelp.ok) return;
    const helpResult = await helpHandler.run(parsedHelp.payload, options);
    const helpCapture = captureContext();
    const helpExitCode = await helpHandler.render(helpResult, options, undefined, helpCapture.context);

    expect(helpExitCode).toBe(0);
    expect(helpCapture.stdout.join('\n')).toContain('Fetch live gameserver help for an action, category, or keyword.');
    expect(helpCapture.stdout.join('\n')).toContain('spacemolt server-help [topic]');

    const commandsHandler = localHandler(['commands', 'server']);
    const parsedCommands = commandsHandler.parse(['commands', 'server'], options);
    expect(parsedCommands.ok).toBe(true);
    if (!parsedCommands.ok) return;
    const commandsResult = await commandsHandler.run(parsedCommands.payload, options);
    const commandsCapture = captureContext();
    const commandsExitCode = await commandsHandler.render(commandsResult, options, undefined, commandsCapture.context);

    expect(commandsExitCode).toBe(0);
    expect(commandsCapture.stdout.join('\n')).toContain('server-help [topic]');
  });
});
