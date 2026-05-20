import { describe, expect, test } from 'bun:test';
import { ApiCommandHandler } from './api-command-handler';
import type { CliRuntimeContext } from './cli-context';
import type { CommandRegistrySnapshot } from './command-registry';
import type { CommandHandler } from './command-types';
import { resolveHandler } from './local-command-handlers';
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

function localHandler(args: string[]): CommandHandler {
  const handler = resolveHandler(args, options);
  expect(handler).toBeDefined();
  return handler as CommandHandler;
}

function captureContext(): { context: CliRuntimeContext; stdout: string[]; stderr: string[] } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    context: {
      env: { HOME: '/tmp/spacemolt-test-home' },
      writer: {
        out(message = '') {
          stdout.push(message);
        },
        err(message = '') {
          stderr.push(message);
        },
      },
      clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
      sleep: async () => {},
    },
  };
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
    const parsed = handler.parse([command, 'ship_123'], options);
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
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('complete -c spacemolt');
  });

  test('version renders through CliRuntimeContext writer', async () => {
    const handler = localHandler(['version']);
    expect(handler.name).toBe('version');
    const parsed = handler.parse(['version'], options);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = await handler.run(parsed.payload, options);
    const { context, stdout } = captureContext();

    const exitCode = await handler.render(result, options, undefined, context);

    expect(exitCode).toBe(0);
    expect(stdout[0]).toMatch(/^SpaceMolt Client v/);
    expect(stdout[1]).toMatch(/^API: /);
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

    const parsed = handler.parse([command, '--help'], options, context);

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe('exit');
    expect(parsed.error.exitCode).toBe(0);
    expect(stdout.join('\n')).toContain('Dynamic command for inline help tests');
  });
});
