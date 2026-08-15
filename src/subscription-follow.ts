import type { SpaceMoltClient } from './api.ts';
import type { CliRuntimeContext } from './cli-context.ts';
import type { CommandError, CommandHandler } from './command-types.ts';
import { type Notification, presentNotifications } from './notification-summary.ts';
import { displayNotifications } from './notifications.ts';
import { colorsForPlain } from './output-style.ts';
import { isRecord } from './response.ts';
import { renderResponse } from './response-renderer.ts';
import type { APIResponse, GlobalOptions } from './types.ts';

export const FOLLOW_POLL_INTERVAL_SECONDS = 10;
const RETRY_DELAYS_SECONDS = [2, 4, 8, 16, 30] as const;
const FOLLOW_COMMANDS = new Set(['subscribe_market', 'subscribe_observation']);

export interface FollowInvocation {
  options: GlobalOptions;
  args: string[];
}

export interface SubscriptionFollowDependencies {
  onSigint(listener: () => void): () => void;
  onSigterm(listener: () => void): () => void;
  renderCommandError(error: CommandError): number;
  renderConnectionError(error: unknown): number;
}

export function validateSubscriptionFollow(invocation: FollowInvocation): CommandError | undefined {
  if (!invocation.options.follow) return undefined;

  const command = invocation.args[0];
  if (!command || !FOLLOW_COMMANDS.has(command)) {
    return {
      code: 'invalid_follow_mode',
      message: '--follow is only supported with subscribe_market and subscribe_observation.',
    };
  }

  const conflicts = [
    invocation.options.watch ? '--watch' : undefined,
    invocation.options.dryRun ? '--dry-run' : undefined,
    invocation.options.quiet ? '--quiet' : undefined,
  ].filter((value): value is string => Boolean(value));
  if (conflicts.length > 0) {
    return {
      code: 'invalid_follow_mode',
      message: `--follow cannot be combined with ${conflicts.join(', ')}.`,
    };
  }

  const hasMachineOutput =
    invocation.options.json ||
    invocation.options.format === 'json' ||
    invocation.options.format === 'yaml' ||
    invocation.options.structured ||
    invocation.options.field !== undefined ||
    invocation.options.fields !== undefined ||
    invocation.options.jq !== undefined ||
    invocation.options.keys !== undefined ||
    invocation.options.outputSearch !== undefined ||
    invocation.options.outputSearchKeys !== undefined ||
    invocation.options.outputSearchValues !== undefined ||
    invocation.options.outputSearchRegex !== undefined;
  if (hasMachineOutput) {
    return {
      code: 'invalid_follow_mode',
      message:
        '--follow supports human-readable output only; remove JSON, YAML, structured, projection, jq, keys, and search output options.',
    };
  }

  return undefined;
}

export async function runSubscriptionFollow(
  invocation: FollowInvocation,
  handler: CommandHandler,
  client: SpaceMoltClient,
  context: CliRuntimeContext,
  dependencies: SubscriptionFollowDependencies,
): Promise<number> {
  const parsed = handler.parse(invocation.args, invocation.options, context);
  if (!parsed.ok) return dependencies.renderCommandError(parsed.error);

  try {
    const subscriptionResult = await handler.run(parsed.payload, invocation.options, client, context);
    const subscriptionExitCode = await handler.render(subscriptionResult, invocation.options, client, context);
    if (subscriptionExitCode !== 0) return subscriptionExitCode;
  } catch (error) {
    return dependencies.renderConnectionError(error);
  }

  const command = invocation.args[0] as 'subscribe_market' | 'subscribe_observation';
  const unsubscribeCommand = command === 'subscribe_market' ? 'unsubscribe_market' : 'unsubscribe_observation';
  let running = true;
  let wake: (() => void) | undefined;
  let cleanupAttempted = false;
  const stop = () => {
    if (!running) return;
    running = false;
    wake?.();
  };
  const removeSigintListener = dependencies.onSigint(stop);
  const removeSigtermListener = dependencies.onSigterm(stop);

  const colors = colorsForPlain(Boolean(invocation.options.plain));
  context.writer.out(
    `${colors.dim}[following ${command === 'subscribe_market' ? 'market' : 'observation'} notifications every ${FOLLOW_POLL_INTERVAL_SECONDS}s — Ctrl+C to stop]${colors.reset}`,
  );
  if (command === 'subscribe_observation') {
    context.writer.err(
      `${colors.yellow}Warning:${colors.reset} observation notifications cannot yet be filtered; --follow drains the shared notification queue and displays all events.`,
    );
  }

  let retryIndex = 0;
  let delaySeconds = FOLLOW_POLL_INTERVAL_SECONDS;
  let exitCode = 0;

  try {
    while (running) {
      const completedDelay = await interruptibleSleep(
        context,
        delaySeconds * 1000,
        () => running,
        (fn) => {
          wake = fn;
        },
      );
      wake = undefined;
      if (!completedDelay || !running) break;

      let response: APIResponse;
      try {
        response = await client.execute('get_notifications', pollPayload(command));
      } catch (error) {
        if (!running) break;
        delaySeconds = RETRY_DELAYS_SECONDS[Math.min(retryIndex, RETRY_DELAYS_SECONDS.length - 1)] ?? 30;
        retryIndex += 1;
        const message = error instanceof Error ? error.message : String(error);
        context.writer.err(
          `${colors.yellow}Warning:${colors.reset} notification poll failed: ${message}. Retrying in ${delaySeconds}s.`,
        );
        continue;
      }

      if (!running) break;
      retryIndex = 0;
      if (response.error) {
        exitCode = await renderResponse(
          { command: 'get_notifications', displayCommand: 'get_notifications', response },
          invocation.options,
          client,
          context,
        );
        if (exitCode === 0) exitCode = 1;
        break;
      }

      const notifications = deduplicatedNotifications(response);
      const displayed = invocation.options.rawNotifications
        ? notifications
        : presentNotifications(notifications).notifications;
      displayNotifications(displayed, context.writer, false, {
        plain: invocation.options.plain,
        verbose: invocation.options.verboseNotifications,
        noTimestamp: invocation.options.noTimestamp,
      });

      delaySeconds = throttledRetryAfter(response) ?? FOLLOW_POLL_INTERVAL_SECONDS;
    }
  } catch (error) {
    exitCode = dependencies.renderConnectionError(error);
  } finally {
    if (!cleanupAttempted) {
      cleanupAttempted = true;
      await bestEffortUnsubscribe(unsubscribeCommand, client, context, colors);
    }
    removeSigintListener();
    removeSigtermListener();
  }

  return exitCode;
}

function pollPayload(command: 'subscribe_market' | 'subscribe_observation'): Record<string, unknown> {
  return command === 'subscribe_market' ? { clear: true, limit: 100, types: ['market'] } : { clear: true, limit: 100 };
}

async function interruptibleSleep(
  context: CliRuntimeContext,
  milliseconds: number,
  isRunning: () => boolean,
  setWake: (wake: () => void) => void,
): Promise<boolean> {
  if (!isRunning()) return false;
  let interrupted = false;
  const controller = new AbortController();
  setWake(() => {
    interrupted = true;
    controller.abort();
  });
  try {
    await context.sleep(milliseconds, controller.signal);
  } catch (error) {
    if (!interrupted) throw error;
  }
  return !interrupted;
}

function envelopeRecord(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function notificationsFromEnvelope(value: unknown): Notification[] {
  const record = envelopeRecord(value);
  if (!record || !Array.isArray(record.notifications)) return [];
  return record.notifications.filter(
    (notification): notification is Notification => isRecord(notification) && typeof notification.type === 'string',
  );
}

export function deduplicatedNotifications(response: APIResponse, seenIds = new Set<string>()): Notification[] {
  const candidates = [
    ...notificationsFromEnvelope(response.structuredContent),
    ...notificationsFromEnvelope(response.result),
    ...(Array.isArray(response.notifications) ? response.notifications : []),
  ];
  const deduplicated: Notification[] = [];
  for (const notification of candidates) {
    const notificationRecord = notification as unknown as Record<string, unknown>;
    const id = typeof notificationRecord.id === 'string' ? notificationRecord.id : undefined;
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);
    deduplicated.push(notification);
  }
  return deduplicated;
}

function throttledRetryAfter(response: APIResponse): number | undefined {
  const envelopes = [response.structuredContent, response.result, response];
  for (const value of envelopes) {
    const record = envelopeRecord(value);
    if (!record || record.throttled !== true) continue;
    const retryAfter = record.retry_after;
    if (typeof retryAfter === 'number' && Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter;
  }
  return undefined;
}

async function bestEffortUnsubscribe(
  command: 'unsubscribe_market' | 'unsubscribe_observation',
  client: SpaceMoltClient,
  context: CliRuntimeContext,
  colors: ReturnType<typeof colorsForPlain>,
): Promise<void> {
  let failure: string | undefined;
  try {
    const response = await client.execute(command, {});
    if (response.error) failure = response.error.message || response.error.code;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  if (!failure) return;
  context.writer.err(
    `${colors.yellow}Warning:${colors.reset} automatic cleanup failed: ${failure}. Run "spacemolt ${command}" manually.`,
  );
}
