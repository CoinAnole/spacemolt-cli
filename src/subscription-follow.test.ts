import { describe, expect, test } from 'bun:test';
import type { SpaceMoltClient } from './api.ts';
import type { CliEnv, CliRuntimeContext } from './cli-context.ts';
import { type RunnerDependencies, runInvocation } from './runner.ts';
import type { APIResponse } from './types.ts';

type FollowCommand = 'subscribe_market' | 'subscribe_observation';
type SignalName = 'SIGINT' | 'SIGTERM';

interface FollowHarnessOptions {
  command?: FollowCommand;
  argv?: string[];
  baseline?: APIResponse;
  poll?: (pollIndex: number) => APIResponse | Promise<APIResponse>;
  cleanup?: APIResponse | Error;
  stopOnSleep?: number;
  signal?: SignalName;
  env?: CliEnv;
  holdStoppedSleepUntilAbort?: boolean;
}

async function runFollowHarness(options: FollowHarnessOptions = {}) {
  const command = options.command ?? 'subscribe_market';
  const stdout: string[] = [];
  const stderr: string[] = [];
  const calls: Array<{ command: string; payload: Record<string, unknown> }> = [];
  const sleeps: number[] = [];
  const registered = { SIGINT: [] as Array<() => void>, SIGTERM: [] as Array<() => void> };
  const removed = { SIGINT: [] as Array<() => void>, SIGTERM: [] as Array<() => void> };
  let pollIndex = 0;
  let abortedSleeps = 0;

  const client = {
    config: { profile: 'pilot' },
    async executeCommandConfig(name: string, _config: unknown, payload: Record<string, unknown>) {
      calls.push({ command: name, payload });
      return structuredClone(
        options.baseline ?? {
          structuredContent: {
            action: command,
            message: command === 'subscribe_market' ? 'Subscribed baseline market.' : 'Observation baseline ready.',
          },
        },
      );
    },
    async execute(name: string, payload: Record<string, unknown>) {
      calls.push({ command: name, payload });
      if (name === 'get_notifications') {
        const index = pollIndex++;
        return (
          (await options.poll?.(index)) ?? {
            structuredContent: { notifications: [], count: 0, remaining: 0 },
          }
        );
      }
      if (name === 'unsubscribe_market' || name === 'unsubscribe_observation') {
        if (options.cleanup instanceof Error) throw options.cleanup;
        return options.cleanup ?? { structuredContent: { ok: true } };
      }
      throw new Error(`unexpected command ${name}`);
    },
  } as unknown as SpaceMoltClient;

  const signal = options.signal ?? 'SIGINT';
  const context: CliRuntimeContext = {
    env: { SPACEMOLT_PROFILE: 'pilot', SPACEMOLT_UPDATE_CHECK: 'false', ...options.env },
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
    clock: { now: () => new Date('2026-08-15T12:00:00.000Z') },
    async sleep(milliseconds, abortSignal) {
      sleeps.push(milliseconds);
      if (sleeps.length !== (options.stopOnSleep ?? 2)) return;
      if (!options.holdStoppedSleepUntilAbort) {
        registered[signal][0]?.();
        return;
      }
      await new Promise<void>((resolve) => {
        abortSignal?.addEventListener(
          'abort',
          () => {
            abortedSleeps += 1;
            resolve();
          },
          { once: true },
        );
        registered[signal][0]?.();
      });
    },
  };
  const dependencies: RunnerDependencies = {
    async checkForUpdates() {
      throw new Error('follow mode must skip update checks');
    },
    onSigint(listener) {
      registered.SIGINT.push(listener);
      return () => removed.SIGINT.push(listener);
    },
    onSigterm(listener) {
      registered.SIGTERM.push(listener);
      return () => removed.SIGTERM.push(listener);
    },
  };

  const exitCode = await runInvocation(
    options.argv ?? ['--plain', '--no-timestamp', command, '--follow'],
    client,
    context,
    dependencies,
  );
  return { exitCode, stdout, stderr, calls, sleeps, registered, removed, polls: pollIndex, abortedSleeps };
}

function notification(id: string, type: string, msgType: string, message: string) {
  return {
    id,
    type,
    msg_type: msgType,
    timestamp: '2026-08-15T12:00:10.000Z',
    data: { message },
  };
}

describe('subscription follow runner integration', () => {
  test('subscribes and renders once, polls market only, emits nothing for an empty poll, and unsubscribes', async () => {
    const result = await runFollowHarness();

    expect(result.exitCode).toBe(0);
    expect(result.calls).toEqual([
      { command: 'subscribe_market', payload: {} },
      { command: 'get_notifications', payload: { clear: true, limit: 100, types: ['market'] } },
      { command: 'unsubscribe_market', payload: {} },
    ]);
    expect(result.stdout.filter((line) => line.includes('Subscribed baseline market.'))).toHaveLength(1);
    expect(result.stdout.join('\n')).not.toContain('No new notifications');
    expect(result.sleeps).toEqual([10_000, 10_000]);
  });

  test('observation polling is unfiltered and displays unrelated shared-queue events', async () => {
    const result = await runFollowHarness({
      command: 'subscribe_observation',
      poll: () => ({
        structuredContent: {
          notifications: [notification('chat-1', 'misc', 'unrelated_shared_event', 'Docking soon')],
        },
      }),
    });

    expect(result.calls[1]).toEqual({
      command: 'get_notifications',
      payload: { clear: true, limit: 100 },
    });
    expect(result.stdout.join('\n')).toContain('Docking soon');
    expect(result.stderr.join('\n')).toContain('drains the shared notification queue');
  });

  test('deduplicates overlapping structured, result, and top-level notification envelopes by id', async () => {
    const one = notification('n-1', 'system', 'unique_event', 'First unique');
    const two = notification('n-2', 'system', 'unique_event', 'Second unique');
    const three = notification('n-3', 'system', 'unique_event', 'Third unique');
    const result = await runFollowHarness({
      poll: () =>
        ({
          structuredContent: { notifications: [one] },
          result: { notifications: [one, two] },
          notifications: [two, three],
        }) as APIResponse,
    });
    const output = result.stdout.join('\n');

    for (const text of ['First unique', 'Second unique', 'Third unique']) {
      expect(output.split(text)).toHaveLength(2);
    }
  });

  test('bounds deduplication to one poll while suppressing envelope overlap in every poll', async () => {
    const repeated = notification('n-repeated', 'system', 'repeated_event', 'Repeated update');
    const result = await runFollowHarness({
      stopOnSleep: 3,
      poll: () =>
        ({
          structuredContent: { notifications: [repeated] },
          result: { notifications: [repeated] },
        }) as APIResponse,
    });

    expect(result.polls).toBe(2);
    expect(result.stdout.join('\n').split('Repeated update')).toHaveLength(3);
  });

  test('honors successful throttling retry_after delays', async () => {
    const result = await runFollowHarness({
      poll: () => ({ structuredContent: { throttled: true, retry_after: 7, notifications: [] } }),
    });

    expect(result.sleeps).toEqual([10_000, 7_000]);
  });

  test('uses capped transient retry delays continuously', async () => {
    const result = await runFollowHarness({
      stopOnSleep: 7,
      poll() {
        throw new Error('temporary network failure');
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.sleeps).toEqual([10_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
    expect(result.stderr.join('\n')).toContain('Retrying in 30s');
  });

  test('resets transient retry backoff after a successful poll', async () => {
    const result = await runFollowHarness({
      stopOnSleep: 4,
      poll(index) {
        if (index === 0 || index === 2) throw new Error('temporary network failure');
        return { structuredContent: { notifications: [] } };
      },
    });

    expect(result.sleeps).toEqual([10_000, 2_000, 10_000, 2_000]);
  });

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    test(`${signal} interrupts sleep, unsubscribes once, and removes both signal listeners`, async () => {
      const result = await runFollowHarness({ signal, stopOnSleep: 1 });

      expect(result.exitCode).toBe(0);
      expect(result.polls).toBe(0);
      expect(result.calls.filter((call) => call.command === 'unsubscribe_market')).toHaveLength(1);
      expect(result.removed.SIGINT).toEqual(result.registered.SIGINT);
      expect(result.removed.SIGTERM).toEqual(result.registered.SIGTERM);
    });
  }

  test('signal aborts the pending delay instead of leaving its timer alive', async () => {
    const result = await runFollowHarness({
      stopOnSleep: 1,
      holdStoppedSleepUntilAbort: true,
    });

    expect(result.exitCode).toBe(0);
    expect(result.abortedSleeps).toBe(1);
    expect(result.polls).toBe(0);
  });

  test('a failed initial subscription exits nonzero without polling or cleanup', async () => {
    const result = await runFollowHarness({
      baseline: { error: { code: 'not_authenticated', message: 'Login required' } },
    });

    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual([{ command: 'subscribe_market', payload: {} }]);
    expect(result.stderr.join('\n')).toContain('Login required');
  });

  test('fatal poll API errors exit nonzero after one cleanup request', async () => {
    const result = await runFollowHarness({
      poll: () => ({ error: { code: 'not_authenticated', message: 'Session expired' } }),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr.join('\n')).toContain('Session expired');
    expect(result.calls.filter((call) => call.command === 'unsubscribe_market')).toHaveLength(1);
  });

  test('failed signal cleanup still exits successfully and prints the manual command', async () => {
    const result = await runFollowHarness({
      stopOnSleep: 1,
      cleanup: new Error('connection closed'),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.join('\n')).toContain('automatic cleanup failed: connection closed');
    expect(result.stderr.join('\n')).toContain('spacemolt unsubscribe_market');
  });

  test('raw and timestamp controls are honored for followed notifications', async () => {
    const result = await runFollowHarness({
      argv: ['--plain', '--no-timestamp', '--raw-notifications', 'subscribe_market', '--follow'],
      poll: () => ({
        structuredContent: {
          notifications: [notification('market-1', 'market', 'market_follow_event', 'Ore prices changed')],
        },
      }),
    });
    const update = result.stdout.find((line) => line.includes('Ore prices changed')) ?? '';

    expect(update).not.toContain('[12:00:10');
    expect(update).toContain('Ore prices changed');
  });
});

describe('subscription follow validation', () => {
  const rejectedArgv = [
    ['--follow', 'get_status'],
    ['--follow', '--watch=10', 'subscribe_market'],
    ['--follow', '--dry-run', 'subscribe_market'],
    ['--follow', '--quiet', 'subscribe_market'],
    ['--follow', '--json', 'subscribe_market'],
    ['--follow', '--format=yaml', 'subscribe_market'],
    ['--follow', '--structured', 'subscribe_market'],
    ['--follow', '--field=message', 'subscribe_market'],
    ['--follow', '--fields=message', 'subscribe_market'],
    ['--follow', '--jq=.message', 'subscribe_market'],
    ['--follow', '--keys', 'subscribe_market'],
    ['--follow', '--search=message', 'subscribe_market'],
    ['--follow', '--search-keys=message', 'subscribe_market'],
    ['--follow', '--search-values=message', 'subscribe_market'],
    ['--follow', '--search-regex=message', 'subscribe_market'],
  ];

  for (const argv of rejectedArgv) {
    test(`rejects ${argv.join(' ')} before client creation`, async () => {
      let clientCreations = 0;
      let updateChecks = 0;
      const stdout: string[] = [];
      const stderr: string[] = [];
      const exitCode = await runInvocation(
        ['--plain', ...argv],
        undefined,
        {
          env: { SPACEMOLT_PROFILE: 'pilot', SPACEMOLT_UPDATE_CHECK: 'true' },
          writer: { out: (message = '') => stdout.push(message), err: (message = '') => stderr.push(message) },
          clock: { now: () => new Date('2026-08-15T12:00:00.000Z') },
          sleep: async () => {},
        },
        {
          createClient() {
            clientCreations += 1;
            throw new Error('must not create a client');
          },
          async checkForUpdates() {
            updateChecks += 1;
          },
        },
      );

      expect(exitCode).toBe(1);
      expect(clientCreations).toBe(0);
      expect(updateChecks).toBe(0);
      expect(stderr.join('\n')).toContain('--follow');
    });
  }

  test('rejects SPACEMOLT_OUTPUT=json before network access', async () => {
    const result = await runFollowHarness({
      env: { SPACEMOLT_OUTPUT: 'json' },
      argv: ['--plain', 'subscribe_market', '--follow'],
    });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toEqual([]);
    expect(JSON.parse(result.stderr.join('\n')).error.code).toBe('invalid_follow_mode');
  });
});
