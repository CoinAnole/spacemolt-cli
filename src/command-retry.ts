#!/usr/bin/env bun
/**
 * Exhaustive check of one promise in SpaceMoltClient.executeRoute:
 *
 * A player command is sent again only after an in-budget HTTP 503, an in-budget
 * rate_limited wait of at most 60 seconds, or one session recovery that logs in.
 *
 * The command under test is undock. Every v2 command that goes through
 * executeRoute shares this loop. Run: bun test src/command-retry.test.ts
 *
 * No model checker runs on this TypeScript. The script drives the real client
 * through every sequence in the response alphabet below, and through the
 * classification probes. It does not sample.
 */
import { SpaceMoltClient, type SpaceMoltClientOptions } from './api.ts';
import { buildRequestUrl, V2_TOOL_MAP } from './commands.ts';
import { ERROR_REGISTRY } from './errors.ts';
import { MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS } from './rate-limit.ts';
import {
  DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS,
  MAX_RATE_LIMIT_RETRIES,
  MAX_SERVICE_UNAVAILABLE_RETRIES,
  MAX_SESSION_RECOVERY_ATTEMPTS,
} from './runtime.ts';
import type { APIResponse, JsonRequestOptions, Session } from './types.ts';

const API_BASE = 'https://game.test/api/v2';
const NOW_MS = Date.UTC(2026, 0, 1, 0, 0, 0);
const CREATED = '2026-01-01T00:00:00.000Z';
const EXPIRES = '2099-01-01T00:00:00.000Z';
const PILOT = 'pilot';
const PASSWORD = 'fleet-secret-value';
const ORIGINAL_SESSION_ID = 'sess_old';
const RECOVERED_SESSION_ID = 'sess_new';

/** Promise budgets. These are not read back from the constants under test. */
const RATE_RETRIES = 3;
const UNAVAILABLE_RETRIES = 3;
const SESSION_RECOVERIES = 1;
const RATE_WAIT_CAP_SECONDS = 60;
const UNAVAILABLE_HEADER_WAIT_MS = 1_000;
/**
 * One initial attempt, plus 3 rate-limit retries, plus 1 session recovery,
 * and each of those 5 attempts may itself send 1 + 3 HTTP 503 retries.
 */
const MAX_COMMAND_SENDS = (1 + RATE_RETRIES + SESSION_RECOVERIES) * (1 + UNAVAILABLE_RETRIES);

const SESSION_CODES = new Set(['not_authenticated', 'session_expired', 'session_invalid', 'invalid_session']);

type ResponseSpec =
  | { kind: 'ok' }
  | { kind: 'terminal'; code: string }
  | { kind: 'rate'; retryAfter: number }
  | { kind: 'session'; code: string }
  | { kind: 'unavailable' };

interface Frame {
  status: number;
  data: APIResponse;
  retryAfterHeader?: string;
  label: string;
}

type StoreMode = 'saved-pilot' | 'no-credentials';

interface DriveOptions {
  store: StoreMode;
  login: 'ok' | Frame[];
}

interface EventUndock {
  type: 'undock';
  sessionId: string;
  payload: unknown;
}

interface EventLogin {
  type: 'login';
  payload: unknown;
}

interface EventSleep {
  type: 'sleep';
  ms: number;
}

type TraceEvent = EventUndock | EventLogin | EventSleep;

interface DriveResult {
  commandSends: number;
  loginSends: number;
  sleeps: number[];
  stopped: boolean;
  result?: APIResponse;
  events: TraceEvent[];
  error?: string;
}

class ScriptEnded extends Error {
  constructor() {
    super('scripted command responses exhausted');
    this.name = 'ScriptEnded';
  }
}

const undockRoute = V2_TOOL_MAP.undock;
const loginRoute = V2_TOOL_MAP.login;
if (!undockRoute || !loginRoute) {
  throw new Error('undock or login is missing from V2_TOOL_MAP.');
}
const UNDOCK_URL = buildRequestUrl(API_BASE, undockRoute);
const LOGIN_URL = buildRequestUrl(API_BASE, loginRoute);

const ALPHABET: ResponseSpec[] = [
  { kind: 'rate', retryAfter: 1 },
  { kind: 'unavailable' },
  { kind: 'session', code: 'session_expired' },
  { kind: 'rate', retryAfter: 61 },
  { kind: 'terminal', code: 'trade_in_progress' },
  { kind: 'ok' },
];

function budgetDrift(): string | undefined {
  const problems: string[] = [];
  if (MAX_RATE_LIMIT_RETRIES !== RATE_RETRIES) {
    problems.push(`MAX_RATE_LIMIT_RETRIES is ${MAX_RATE_LIMIT_RETRIES}; the checked promise is ${RATE_RETRIES}.`);
  }
  if (MAX_SERVICE_UNAVAILABLE_RETRIES !== UNAVAILABLE_RETRIES) {
    problems.push(
      `MAX_SERVICE_UNAVAILABLE_RETRIES is ${MAX_SERVICE_UNAVAILABLE_RETRIES}; the checked promise is ${UNAVAILABLE_RETRIES}.`,
    );
  }
  if (MAX_SESSION_RECOVERY_ATTEMPTS !== SESSION_RECOVERIES) {
    problems.push(
      `MAX_SESSION_RECOVERY_ATTEMPTS is ${MAX_SESSION_RECOVERY_ATTEMPTS}; the checked promise is ${SESSION_RECOVERIES}.`,
    );
  }
  if (MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS !== RATE_WAIT_CAP_SECONDS) {
    problems.push(
      `MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS is ${MAX_RATE_LIMIT_AUTO_RETRY_WAIT_SECONDS}; the checked promise is ${RATE_WAIT_CAP_SECONDS}.`,
    );
  }
  if (DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS !== 5) {
    problems.push(
      `DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS is ${DEFAULT_SERVICE_UNAVAILABLE_WAIT_SECONDS}; the checked promise is 5.`,
    );
  }
  if (problems.length === 0) return undefined;
  return `${problems.join(
    '\n',
  )}\nThese budgets are the promise. Do not change them just to match a new constant. Confirm the new budget is intended, then update this file and src/command-retry.test.ts together.`;
}

function describeSpec(spec: ResponseSpec): string {
  switch (spec.kind) {
    case 'ok':
      return 'HTTP 200 structuredContent';
    case 'terminal':
      return `HTTP 400 ${spec.code} retry_after=1`;
    case 'rate':
      return `HTTP 429 rate_limited retry_after=${spec.retryAfter}`;
    case 'session':
      return `HTTP 401 ${spec.code} retry_after=1`;
    case 'unavailable':
      return 'HTTP 503 service_unavailable Retry-After=1';
  }
}

function specToFrame(spec: ResponseSpec): Frame {
  switch (spec.kind) {
    case 'ok':
      return { status: 200, label: describeSpec(spec), data: { structuredContent: { ok: true } } };
    case 'terminal':
      return {
        status: 400,
        label: describeSpec(spec),
        data: { error: { code: spec.code, message: spec.code, retry_after: 1 } },
      };
    case 'rate':
      return {
        status: 429,
        label: describeSpec(spec),
        data: { error: { code: 'rate_limited', message: 'slow down', retry_after: spec.retryAfter } },
      };
    case 'session':
      return {
        status: 401,
        label: describeSpec(spec),
        data: { error: { code: spec.code, message: spec.code, retry_after: 1 } },
      };
    case 'unavailable':
      return {
        status: 503,
        label: describeSpec(spec),
        retryAfterHeader: '1',
        data: { error: { code: 'service_unavailable', message: 'Authentication provider unreachable' } },
      };
  }
}

function objectError(status: number, code: string, fields: Record<string, unknown>, label: string): Frame {
  return {
    status,
    label,
    data: { error: { code, message: code, ...fields } },
  };
}

function repeat(frame: Frame, count: number): Frame[] {
  return Array.from({ length: count }, () => frame);
}

function mayResend(script: ResponseSpec[]): boolean {
  if (script.length === 0 || script.length >= MAX_COMMAND_SENDS) return false;
  const last = script[script.length - 1];
  if (!last) return false;
  if (last.kind === 'ok' || last.kind === 'terminal') return false;
  if (last.kind === 'rate') {
    if (last.retryAfter < 0 || last.retryAfter > RATE_WAIT_CAP_SECONDS) return false;
    const used = script.filter(
      (spec) => spec.kind === 'rate' && spec.retryAfter >= 0 && spec.retryAfter <= RATE_WAIT_CAP_SECONDS,
    ).length;
    return used <= RATE_RETRIES;
  }
  if (last.kind === 'session') {
    const used = script.filter((spec) => spec.kind === 'session').length;
    return used <= SESSION_RECOVERIES;
  }
  let streak = 0;
  for (let index = script.length - 1; index >= 0; index -= 1) {
    if (script[index]?.kind !== 'unavailable') break;
    streak += 1;
  }
  return streak <= UNAVAILABLE_RETRIES;
}

function waitMs(spec: ResponseSpec): number | undefined {
  if (spec.kind === 'rate' && spec.retryAfter >= 0 && spec.retryAfter <= RATE_WAIT_CAP_SECONDS) {
    return Math.ceil(spec.retryAfter) * 1000;
  }
  if (spec.kind === 'unavailable') return UNAVAILABLE_HEADER_WAIT_MS;
  return undefined;
}

function surfacedCode(spec: ResponseSpec): string | undefined {
  switch (spec.kind) {
    case 'ok':
      return undefined;
    case 'terminal':
      return spec.code;
    case 'rate':
      return 'rate_limited';
    case 'session':
      return spec.code;
    case 'unavailable':
      return 'service_unavailable';
  }
}

function errorCode(data: APIResponse | undefined): string | undefined {
  const error = data?.error;
  if (!error) return undefined;
  if (typeof error === 'string') return error;
  return typeof error.code === 'string' ? error.code : undefined;
}

function payloadLeaksPassword(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if ('password' in payload) return true;
  return JSON.stringify(payload).includes(PASSWORD);
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function createStore(mode: StoreMode): NonNullable<SpaceMoltClientOptions['sessionStore']> {
  const saved: Session =
    mode === 'saved-pilot'
      ? {
          id: ORIGINAL_SESSION_ID,
          created_at: CREATED,
          expires_at: EXPIRES,
          username: PILOT,
          password: PASSWORD,
          player_id: 'player_1',
        }
      : { id: ORIGINAL_SESSION_ID, created_at: CREATED, expires_at: EXPIRES };
  return {
    async getSession() {
      return { ...saved };
    },
    async loadSession() {
      return { ...saved };
    },
    async saveSession() {},
    async createSession() {
      return { id: RECOVERED_SESSION_ID, created_at: CREATED, expires_at: EXPIRES };
    },
    async authenticateProfileSession(session: Session) {
      // Same early return as SessionManager.authenticateProfileSession. A session
      // that still needs a login POST is SessionManager's own request, not this loop.
      if (!session.username || !session.password || session.player_id) return null;
      throw new Error(
        'SessionManager.authenticateProfileSession would POST login before undock. This check does not cover that method.',
      );
    },
  };
}

function loginOkFrame(): Frame {
  return {
    status: 200,
    label: 'login success',
    data: {
      session: { id: 'sess_login_body', player_id: 'player_1', created_at: CREATED, expires_at: EXPIRES },
      structuredContent: { player: { id: 'player_1' } },
    },
  };
}

async function drive(frames: Frame[], options: DriveOptions): Promise<DriveResult> {
  const events: TraceEvent[] = [];
  const loginFrames = options.login === 'ok' ? undefined : [...options.login];
  let commandSends = 0;
  let loginSends = 0;
  let stopped = true;
  let result: APIResponse | undefined;
  let error: string | undefined;

  const client = new SpaceMoltClient({
    config: {
      apiBase: API_BASE,
      jsonOutput: true,
      debug: false,
      plain: true,
      quiet: true,
      format: 'json',
      compact: false,
    },
    clock: { now: () => NOW_MS },
    sleep: async (ms) => {
      events.push({ type: 'sleep', ms });
    },
    logger: { debug() {}, error() {}, warn() {} },
    sessionStore: createStore(options.store),
    transport: {
      async requestJson<T>(url: string, request?: JsonRequestOptions) {
        if (url === UNDOCK_URL) {
          commandSends += 1;
          events.push({
            type: 'undock',
            sessionId: request?.sessionId ?? '',
            payload: request?.payload,
          });
          if (request?.method !== 'POST') {
            throw new Error(`undock method ${request?.method ?? '(none)'}`);
          }
          const frame = frames[commandSends - 1];
          if (!frame) throw new ScriptEnded();
          const status = frame.status;
          return {
            status,
            ok: status >= 200 && status < 400,
            data: frame.data as T,
            retryAfterHeader: frame.retryAfterHeader,
          };
        }
        if (url === LOGIN_URL) {
          loginSends += 1;
          events.push({ type: 'login', payload: request?.payload });
          if (request?.method !== 'POST') throw new Error(`login method ${request?.method ?? '(none)'}`);
          const frame = loginFrames ? loginFrames.shift() : loginOkFrame();
          if (!frame) throw new Error('login retry continued after the scripted login responses');
          const status = frame.status;
          return {
            status,
            ok: status >= 200 && status < 400,
            data: frame.data as T,
            retryAfterHeader: frame.retryAfterHeader,
          };
        }
        throw new Error(`unexpected URL ${url}`);
      },
    },
  });

  try {
    result = await client.execute('undock', {});
  } catch (caught) {
    if (caught instanceof ScriptEnded) {
      stopped = false;
    } else {
      error = caught instanceof Error ? caught.message : String(caught);
      stopped = true;
    }
  }

  return {
    commandSends,
    loginSends,
    sleeps: events.filter((event): event is EventSleep => event.type === 'sleep').map((event) => event.ms),
    stopped,
    result,
    events,
    error,
  };
}

function evaluate(script: ResponseSpec[], driven: DriveResult): string | undefined {
  if (driven.error)
    return `The client or the harness threw: ${driven.error}\nSequence: ${script.map(describeSpec).join(' → ')}`;
  const undocks = driven.events.filter((event): event is EventUndock => event.type === 'undock');
  if (driven.stopped) {
    if (undocks.length !== script.length) {
      return `The client stopped after ${undocks.length} undock send(s), but ${script.length} scripted response(s) were prepared.\nSequence: ${script.map(describeSpec).join(' → ')}`;
    }
  } else if (undocks.length !== script.length + 1) {
    return `The client attempted ${undocks.length} undock send(s) for ${script.length} scripted response(s).\nSequence: ${script.map(describeSpec).join(' → ')}`;
  }

  if (!driven.stopped && script.length >= MAX_COMMAND_SENDS) {
    return `Undock was sent a ${script.length + 1}th time. The promise allows at most ${MAX_COMMAND_SENDS} sends of one command.\nSequence: ${script.map(describeSpec).join(' → ')}`;
  }

  const followed = undocks.length - 1;
  for (let index = 0; index < followed; index += 1) {
    const prefix = script.slice(0, index + 1);
    if (!mayResend(prefix)) {
      return `Undock was sent again after ${prefix.map(describeSpec).join(' → ')}.\nThat last response is not an in-budget reason to send the command again. Another undock is another mutation.`;
    }
  }
  if (driven.stopped && script.length > 0 && mayResend(script)) {
    return `Undock was not sent again after ${script.map(describeSpec).join(' → ')}.\nThat response is an in-budget retry reason, so the command stops before it has been accepted.`;
  }

  const firstPayload = undocks[0]?.payload;
  for (const undock of undocks) {
    if (payloadLeaksPassword(undock.payload)) {
      return 'An undock request carried the saved password.';
    }
    if (!sameJson(undock.payload, firstPayload)) {
      return `A resent undock changed the payload from ${JSON.stringify(firstPayload)} to ${JSON.stringify(undock.payload)}.`;
    }
  }

  let eventIndex = 0;
  for (let index = 0; index < followed; index += 1) {
    const spec = script[index];
    if (!spec) return 'missing scripted response';
    const start = eventIndex;
    const opener = driven.events[start];
    if (opener?.type !== 'undock') return 'trace did not start a pair with undock';
    let cursor = start + 1;
    while (cursor < driven.events.length && driven.events[cursor]?.type !== 'undock') cursor += 1;
    const between = driven.events.slice(start + 1, cursor);
    const next = driven.events[cursor];
    if (next?.type !== 'undock') return 'trace ended before the resent undock';
    const expectedWait = waitMs(spec);
    const sleeps = between.filter((event): event is EventSleep => event.type === 'sleep');
    const logins = between.filter((event): event is EventLogin => event.type === 'login');
    if (spec.kind === 'session') {
      if (sleeps.length !== 0) {
        return `Session recovery for ${spec.code} waited ${sleeps.map((sleep) => sleep.ms).join(', ')} ms before the next undock. Recovery logs in and sends again without a rate-limit sleep.`;
      }
      if (logins.length !== 1) {
        return `Session recovery for ${spec.code} sent ${logins.length} login request(s). It must log in once as the saved pilot and then send undock again.`;
      }
      const loginPayload = logins[0]?.payload;
      if (!sameJson(loginPayload, { username: PILOT, password: PASSWORD })) {
        return `Session recovery logged in with ${JSON.stringify(loginPayload)} instead of the saved pilot.`;
      }
      if (next.sessionId !== RECOVERED_SESSION_ID) {
        return `The undock after ${spec.code} used session ${next.sessionId || '(none)'} instead of the recovered session.`;
      }
    } else if (expectedWait !== undefined) {
      if (logins.length !== 0) {
        return `${describeSpec(spec)} also logged in before resending undock.`;
      }
      if (sleeps.length !== 1 || sleeps[0]?.ms !== expectedWait) {
        return `${describeSpec(spec)} should wait ${expectedWait} ms before the next undock. The client waited ${sleeps.map((sleep) => sleep.ms).join(', ') || 'not at all'}.`;
      }
      if (next.sessionId !== opener.sessionId) {
        return `The session id changed from ${opener.sessionId} to ${next.sessionId} after ${describeSpec(spec)}. It may change only after session recovery.`;
      }
    }
    if (spec.kind !== 'session' && opener.sessionId === '' && index === 0) {
      return 'The first undock was sent with no session id.';
    }
    eventIndex = cursor;
  }

  const sawSession = script.slice(0, followed).some((spec) => spec.kind === 'session');
  for (let index = 0; index < undocks.length; index += 1) {
    const prior = script.slice(0, index);
    const expectedId = prior.some((spec) => spec.kind === 'session') ? RECOVERED_SESSION_ID : ORIGINAL_SESSION_ID;
    if (undocks[index]?.sessionId !== expectedId) {
      return `Undock send ${index + 1} used session ${undocks[index]?.sessionId || '(none)'}. It should use ${expectedId}.`;
    }
  }
  if (!sawSession && undocks.some((undock) => undock.sessionId !== ORIGINAL_SESSION_ID)) {
    return 'Undock used a new session without a session-auth failure.';
  }

  if (driven.stopped) {
    const last = script[script.length - 1];
    if (last && errorCode(driven.result) !== surfacedCode(last)) {
      return `After ${script.map(describeSpec).join(' → ')}, the client returned ${errorCode(driven.result) ?? 'no error'} instead of ${surfacedCode(last) ?? 'no error'}.`;
    }
  }
  return undefined;
}

interface Probe {
  name: string;
  frames: Frame[];
  commands: number;
  stopped: boolean;
  sleeps?: number[];
  logins?: number;
  store?: StoreMode;
  login?: 'ok' | Frame[];
  harm: string;
}

function probeFailure(probe: Probe, driven: DriveResult): string | undefined {
  if (driven.error) return `${probe.name}\n${driven.error}\n${probe.harm}`;
  if (driven.stopped !== probe.stopped || driven.commandSends !== probe.commands) {
    const did = driven.stopped
      ? `stopped after ${driven.commandSends} undock send(s)`
      : `sent undock ${driven.commandSends} time(s) and was about to send it again`;
    return `${probe.name}\nExpected ${probe.commands} undock send(s) and ${probe.stopped ? 'then stop' : 'another send'}. The client ${did}.\nResponses: ${probe.frames.map((frame) => frame.label).join(' → ')}\n${probe.harm}`;
  }
  if (probe.sleeps && !sameJson(driven.sleeps, probe.sleeps)) {
    return `${probe.name}\nExpected waits ${probe.sleeps.join(', ') || '(none)'} ms. The client waited ${driven.sleeps.join(', ') || 'not at all'}.\n${probe.harm}`;
  }
  if (probe.logins !== undefined && driven.loginSends !== probe.logins) {
    return `${probe.name}\nExpected ${probe.logins} login send(s). The client sent ${driven.loginSends}.\n${probe.harm}`;
  }
  for (const event of driven.events) {
    if (event.type === 'undock' && payloadLeaksPassword(event.payload)) {
      return `${probe.name}\nAn undock request carried the saved password.\n${probe.harm}`;
    }
  }
  return undefined;
}

function boundaryProbes(): Probe[] {
  const probes: Probe[] = [];
  const noResend = new Set<string>([
    ...Object.keys(ERROR_REGISTRY).filter((code) => code !== 'rate_limited' && !SESSION_CODES.has(code)),
    'trade_in_progress',
    'transaction_uncertain',
    'accounting_pending',
    'wreck_not_here',
    'already_towing',
    'trade_not_found',
    'not_a_real_error_code',
  ]);
  for (const code of noResend) {
    probes.push({
      name: `${code} with retry_after 1 is not sent again`,
      frames: [objectError(400, code, { retry_after: 1 }, `HTTP 400 ${code} retry_after=1`)],
      commands: 1,
      stopped: true,
      harm: 'That error is not one of the three automatic retry reasons. Another undock is another mutation. Help text that calls an error retryable is for the pilot, not this loop.',
    });
  }
  probes.push({
    name: 'HTTP 429 action_pending is not sent again',
    frames: [objectError(429, 'action_pending', { retry_after: 1 }, 'HTTP 429 action_pending retry_after=1')],
    commands: 1,
    stopped: true,
    harm: 'action_pending means a mutation is already queued. Sending undock again queues a second one. HTTP 429 does not by itself mean rate_limited.',
  });
  probes.push({
    name: 'ip_timed_out whose message names 30 seconds is not sent again',
    frames: [
      objectError(400, 'ip_timed_out', { message: 'try again in 30 seconds' }, 'HTTP 400 ip_timed_out message wait'),
    ],
    commands: 1,
    stopped: true,
    harm: 'An IP timeout is not a session rate-limit retry. Another undock keeps the client inside the timeout.',
  });

  const rate = (
    retryAfter: number,
    extra: Record<string, unknown> = {},
    label = `rate_limited retry_after=${retryAfter}`,
  ) => objectError(429, 'rate_limited', { retry_after: retryAfter, ...extra }, label);

  const inBudget = (name: string, frame: Frame, sleepMs: number) => {
    probes.push({
      name: `${name} sends four times and then stops`,
      frames: repeat(frame, 4),
      commands: 4,
      stopped: true,
      sleeps: [sleepMs, sleepMs, sleepMs],
      harm: 'The fourth rate_limited response has spent the 3 retries. A fifth undock is another mutation.',
    });
  };

  inBudget('retry_after 1', rate(1), 1_000);
  inBudget('retry_after 0', rate(0), 0);
  inBudget('retry_after 60', rate(60), 60_000);
  inBudget('retry_after 1.5', rate(1.5), 2_000);
  inBudget(
    'legacy wait_seconds 1',
    objectError(429, 'rate_limited', { message: 'slow down', wait_seconds: 1 }, 'rate_limited wait_seconds=1'),
    1_000,
  );
  inBudget(
    'details.retry_after 1',
    objectError(
      429,
      'rate_limited',
      { message: 'slow down', details: { retry_after: 1 } },
      'rate_limited details.retry_after=1',
    ),
    1_000,
  );

  probes.push({
    name: 'retry_after 61 stops',
    frames: [rate(61)],
    commands: 1,
    stopped: true,
    harm: 'A wait above 60 seconds is shown to the pilot. The client must not sleep through it and send undock again by itself.',
  });
  probes.push({
    name: 'retry_after 61 wins over details.retry_after 1',
    frames: [
      objectError(
        429,
        'rate_limited',
        { retry_after: 61, details: { retry_after: 1 } },
        'rate_limited retry_after=61 details.retry_after=1',
      ),
    ],
    commands: 1,
    stopped: true,
    harm: 'The top-level wait is 61 seconds, so this is not an automatic retry. Another undock is another mutation.',
  });
  probes.push({
    name: 'rate_limited with no wait stops',
    frames: [objectError(429, 'rate_limited', { message: 'slow down' }, 'rate_limited no wait')],
    commands: 1,
    stopped: true,
    harm: 'Without a wait of 0 to 60 seconds there is nothing to count down. The client must not invent a retry.',
  });

  const headerOnly = (header: string, label: string) =>
    ({
      status: 429,
      label,
      retryAfterHeader: header,
      data: { error: { code: 'rate_limited', message: 'slow down' } },
    }) as Frame;

  inBudget('Retry-After 1 and no body wait', headerOnly('1', 'rate_limited Retry-After=1'), 1_000);
  probes.push({
    name: 'Retry-After 61 and no body wait stops',
    frames: [headerOnly('61', 'rate_limited Retry-After=61')],
    commands: 1,
    stopped: true,
    harm: 'A Retry-After above 60 seconds is not an automatic rate-limit retry.',
  });
  probes.push({
    name: 'a Retry-After date one second ahead sends again',
    frames: [headerOnly(new Date(NOW_MS + 1_000).toUTCString(), 'rate_limited Retry-After date +1s')],
    commands: 2,
    stopped: false,
    harm: 'A Retry-After date one second ahead is a one-second rate-limit wait. The client should send undock once more after that wait.',
  });
  probes.push({
    name: 'a Retry-After date two minutes ahead stops',
    frames: [headerOnly(new Date(NOW_MS + 120_000).toUTCString(), 'rate_limited Retry-After date +120s')],
    commands: 1,
    stopped: true,
    harm: 'A Retry-After date two minutes ahead is over the 60 second automatic-retry cap.',
  });
  probes.push({
    name: 'a Retry-After date in the past sends again',
    frames: [headerOnly(new Date(NOW_MS - 5_000).toUTCString(), 'rate_limited Retry-After date in the past')],
    commands: 2,
    stopped: false,
    sleeps: [0],
    harm: 'A Retry-After date already in the past is a wait of 0. The client may send once more, and that send still spends one rate-limit retry.',
  });
  probes.push({
    name: 'an unparseable Retry-After stops',
    frames: [headerOnly('soon', 'rate_limited Retry-After=soon')],
    commands: 1,
    stopped: true,
    harm: 'An unparseable Retry-After is not a wait. The client must not send undock again.',
  });

  const flat = (status: number, code: string, retryAfter: number | undefined, header?: string): Frame => ({
    status,
    label: `HTTP ${status} flat ${code}${retryAfter === undefined ? '' : ` retry_after=${retryAfter}`}${header ? ` Retry-After=${header}` : ''}`,
    retryAfterHeader: header,
    data: {
      error: code,
      message: 'slow down',
      ...(retryAfter === undefined ? {} : { retry_after: retryAfter }),
    } as unknown as APIResponse,
  });
  inBudget('flat HTTP 429 rate_limited retry_after 1', flat(429, 'rate_limited', 1), 1_000);
  probes.push({
    name: 'flat HTTP 429 rate_limited retry_after 61 stops',
    frames: [flat(429, 'rate_limited', 61)],
    commands: 1,
    stopped: true,
    harm: 'A flat 429 is still rate_limited. A 61 second wait is not an automatic retry.',
  });
  probes.push({
    name: 'flat HTTP 429 action_pending stops',
    frames: [flat(429, 'action_pending', 1)],
    commands: 1,
    stopped: true,
    harm: 'Rewriting a flat 429 must keep the error code. action_pending must not become an automatic undock retry.',
  });
  probes.push({
    name: 'flat HTTP 200 rate_limited is not rewritten into a retry',
    frames: [flat(200, 'rate_limited', 1)],
    commands: 1,
    stopped: true,
    harm: 'Only an HTTP 429 flat error is rewritten. A 200 body whose error string is rate_limited must not send undock again.',
  });
  inBudget(
    'HTTP 200 object rate_limited retry_after 1',
    objectError(200, 'rate_limited', { retry_after: 1 }, 'HTTP 200 rate_limited retry_after=1'),
    1_000,
  );

  for (const code of SESSION_CODES) {
    const frame = objectError(401, code, { retry_after: 1 }, `HTTP 401 ${code} retry_after=1`);
    probes.push({
      name: `${code} logs in once and sends undock again`,
      frames: [frame],
      commands: 2,
      stopped: false,
      sleeps: [],
      logins: 1,
      harm: `A saved session that returns ${code} is logged in again once, and undock is sent on the new session. The retry_after on that error is not a rate-limit sleep.`,
    });
    probes.push({
      name: `${code} twice does not recover again`,
      frames: [frame, frame],
      commands: 2,
      stopped: true,
      logins: 1,
      harm: `The second ${code} is past the one recovery. Another undock would be another mutation on a session the server has already rejected.`,
    });
  }

  const unavailable = (header?: string): Frame => ({
    status: 503,
    label: header ? `HTTP 503 Retry-After=${header}` : 'HTTP 503 no Retry-After',
    retryAfterHeader: header,
    data: { error: { code: 'service_unavailable', message: 'Authentication provider unreachable' } },
  });
  probes.push({
    name: 'four object 503s stop',
    frames: repeat(unavailable('1'), 4),
    commands: 4,
    stopped: true,
    sleeps: [1_000, 1_000, 1_000],
    harm: 'The fourth HTTP 503 ends the unavailable attempt. Another undock is another mutation.',
  });
  probes.push({
    name: 'a 503 with no Retry-After waits the default 5 seconds',
    frames: [unavailable()],
    commands: 2,
    stopped: false,
    sleeps: [5_000],
    harm: 'A 503 without Retry-After still means the authentication provider was unreachable. The client waits 5 seconds and sends undock once more.',
  });
  probes.push({
    name: 'a 503 with Retry-After 0 waits 0',
    frames: [unavailable('0')],
    commands: 2,
    stopped: false,
    sleeps: [0],
    harm: 'An explicit Retry-After of 0 is a zero wait, not the 5 second default.',
  });

  const flat503: Frame = {
    status: 503,
    label: 'HTTP 503 flat rate_limited Retry-After=1',
    retryAfterHeader: '1',
    data: { error: 'rate_limited', message: 'slow down', retry_after: 1 } as unknown as APIResponse,
  };
  probes.push({
    name: 'a flat 503 rate_limited still has an outer rate-limit retry after four 503s',
    frames: repeat(flat503, 4),
    commands: 5,
    stopped: false,
    harm: 'Four HTTP 503s end the unavailable attempt. The exhausted flat error code is rate_limited with a 1 second wait, so one rate-limit retry may send undock again.',
  });
  probes.push({
    name: 'repeated flat 503 rate_limited stops after both budgets',
    frames: repeat(flat503, 16),
    commands: 16,
    stopped: true,
    harm: 'Each exhausted flat 503 spends one of the 3 rate-limit retries. After those retries a further undock is another mutation.',
  });

  const login503 = (header = '1'): Frame => ({
    status: 503,
    label: 'login HTTP 503',
    retryAfterHeader: header,
    data: { error: { code: 'service_unavailable', message: 'Authentication provider unreachable' } },
  });
  probes.push({
    name: 'a failed recovery login does not send undock again',
    frames: [objectError(401, 'session_expired', { retry_after: 1 }, 'HTTP 401 session_expired')],
    commands: 1,
    stopped: true,
    logins: 1,
    login: [objectError(400, 'invalid_credentials', {}, 'login invalid_credentials')],
    harm: 'The saved password was rejected. Sending undock again would repeat the command on a session that is not logged in.',
  });
  probes.push({
    name: 'four 503s on the recovery login do not send undock again',
    frames: [objectError(401, 'session_expired', {}, 'HTTP 401 session_expired')],
    commands: 1,
    stopped: true,
    logins: 4,
    login: repeat(login503(), 4),
    harm: 'The recovery login never got through. Undock must not be sent on the new session.',
  });
  probes.push({
    name: 'session_expired without saved credentials does not send undock again',
    frames: [objectError(401, 'session_expired', {}, 'HTTP 401 session_expired')],
    commands: 1,
    stopped: true,
    logins: 0,
    store: 'no-credentials',
    harm: 'There is no saved password to log in with. Another undock would repeat the command without a new login.',
  });

  return probes;
}

async function runProbes(): Promise<string[]> {
  const failures: string[] = [];
  for (const probe of boundaryProbes()) {
    const driven = await drive(probe.frames, {
      store: probe.store ?? 'saved-pilot',
      login: probe.login ?? 'ok',
    });
    const failure = probeFailure(probe, driven);
    if (failure) failures.push(failure);
  }
  return failures;
}

async function explore(script: ResponseSpec[]): Promise<string | undefined> {
  sequenceCount += 1;
  const driven = await drive(script.map(specToFrame), { store: 'saved-pilot', login: 'ok' });
  const failure = evaluate(script, driven);
  if (failure) return failure;
  if (driven.stopped) return undefined;
  for (const next of ALPHABET) {
    const nested = await explore([...script, next]);
    if (nested) return nested;
  }
  return undefined;
}

let sequenceCount = 0;

export async function verifyCommandRetry(): Promise<string | undefined> {
  sequenceCount = 0;
  const drift = budgetDrift();
  if (drift) return drift;

  const probeFailures = await runProbes();
  if (probeFailures.length > 0) {
    const shown = probeFailures.slice(0, 3);
    const more =
      probeFailures.length > shown.length ? `\n\n${probeFailures.length - shown.length} more probe(s) failed.` : '';
    return `${shown.join('\n\n')}${more}`;
  }

  const explorationFailure = await explore([]);
  if (explorationFailure) return explorationFailure;
  return undefined;
}

async function main(): Promise<void> {
  const started = performance.now();
  const failure = await verifyCommandRetry();
  if (failure) {
    console.log(`verify-command-retry: fail\n${failure}`);
    process.exitCode = 1;
    return;
  }

  const probeCount = boundaryProbes().length;
  const elapsed = Math.round(performance.now() - started);
  console.log(
    [
      'verify-command-retry: pass',
      'property: a player command is sent again only after an in-budget HTTP 503, an in-budget rate_limited wait of at most 60 seconds, or one session recovery that logs in.',
      `command: undock ${UNDOCK_URL}`,
      `sequences: ${sequenceCount}`,
      `probes: ${probeCount}`,
      `max sends in one sequence: ${MAX_COMMAND_SENDS}`,
      `elapsed_ms: ${elapsed}`,
    ].join('\n'),
  );
}

if (import.meta.main) {
  await main();
}
