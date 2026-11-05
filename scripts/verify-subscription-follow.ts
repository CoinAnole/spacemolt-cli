#!/usr/bin/env bun
/**
 * Clause 2 of the subscription-follow promise:
 *
 * Inside one get_notifications response, deduplicatedNotifications keeps a
 * notification with a string id once across structuredContent, result, and
 * notifications, and does not drop a notification that has no string id.
 *
 * Run: bun run verify:subscription-follow
 *
 * Nothing model-checks TypeScript. This is not a model of the function.
 * Every case calls the real deduplicatedNotifications.
 */
import { deduplicatedNotifications } from '../src/subscription-follow.ts';
import type { APIResponse } from '../src/types.ts';

const KINDS = ['a', 'b', 'empty', 'none', 'zero'] as const;
type Kind = (typeof KINDS)[number];
type Encoding = 'record' | 'json';
type Note = Record<string, unknown>;

function listsOf(kinds: readonly Kind[]): Kind[][] {
  const lists: Kind[][] = [[]];
  for (const kind of kinds) lists.push([kind]);
  for (const left of kinds) {
    for (const right of kinds) lists.push([left, right]);
  }
  return lists;
}

const LISTS = listsOf(KINDS);

function notesFor(kinds: Kind[], source: string): Note[] {
  return kinds.map((kind, index) => {
    const note: Note = { type: 'market', mark: `${source}${index}${kind}` };
    if (kind === 'a' || kind === 'b') note.id = kind;
    if (kind === 'empty') note.id = '';
    if (kind === 'zero') note.id = 0;
    return note;
  });
}

function expectKeep(groups: Note[][]): Note[] {
  const seen = new Set<string>();
  const kept: Note[] = [];
  for (const group of groups) {
    for (const note of group) {
      const id = note.id;
      if (typeof id === 'string') {
        if (seen.has(id)) continue;
        seen.add(id);
      }
      kept.push(note);
    }
  }
  return kept;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => canonical(entry)).join(',')}]`;
  if (typeof value === 'bigint') return `${value}n`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function envelope(notes: Note[], encoding: Encoding): unknown {
  const record = { notifications: notes };
  return encoding === 'json' ? JSON.stringify(record) : record;
}

function isEmptyIdOnly(expected: Note[], actual: Note[]): boolean {
  const rest = (notes: Note[]) => notes.filter((note) => note.id !== '');
  if (canonical(rest(expected)) !== canonical(rest(actual))) return false;
  const empty = (notes: Note[]) => notes.filter((note) => note.id === '').length;
  return empty(expected) !== empty(actual);
}

function show(notes: Note[]): string {
  return JSON.stringify(notes);
}

interface Failure {
  kind: 'empty-id' | 'other';
  detail: string;
}

function describe(
  label: string,
  structured: Note[],
  result: Note[],
  top: Note[],
  structuredEncoding: Encoding,
  resultEncoding: Encoding,
  expected: Note[],
  actual: Note[],
): string {
  return [
    label,
    `structuredContent (${structuredEncoding}): ${show(structured)}`,
    `result (${resultEncoding}): ${show(result)}`,
    `notifications: ${show(top)}`,
    `expected: ${show(expected)}`,
    `actual: ${show(actual)}`,
  ].join('\n');
}

function checkCall(
  structured: Note[],
  result: Note[],
  top: Note[],
  structuredEncoding: Encoding,
  resultEncoding: Encoding,
): Failure | undefined {
  const expected = expectKeep([structured, result, top]);
  let actual: Note[];
  try {
    actual = deduplicatedNotifications({
      structuredContent: envelope(structured, structuredEncoding),
      result: envelope(result, resultEncoding),
      notifications: top,
    } as APIResponse);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      kind: 'other',
      detail: describe(
        `deduplicatedNotifications threw: ${message}`,
        structured,
        result,
        top,
        structuredEncoding,
        resultEncoding,
        expected,
        [],
      ),
    };
  }
  if (canonical(actual) === canonical(expected)) return undefined;
  return {
    kind: isEmptyIdOnly(expected, actual) ? 'empty-id' : 'other',
    detail: describe(
      'kept notifications do not match the promise',
      structured,
      result,
      top,
      structuredEncoding,
      resultEncoding,
      expected,
      actual,
    ),
  };
}

function checkProbe(detail: string, response: APIResponse, expected: Note[]): Failure | undefined {
  let actual: Note[];
  try {
    actual = deduplicatedNotifications(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { kind: 'other', detail: `${detail}\ndeduplicatedNotifications threw: ${message}` };
  }
  if (canonical(actual) === canonical(expected)) return undefined;
  return {
    kind: isEmptyIdOnly(expected, actual) ? 'empty-id' : 'other',
    detail: `${detail}\nexpected: ${show(expected)}\nactual: ${show(actual)}`,
  };
}

function probes(): void {
  const once = { type: 'market', id: 'a', mark: 'once' };
  const again = deduplicatedNotifications({ notifications: [once] } as unknown as APIResponse);
  const twice = deduplicatedNotifications({ notifications: [once] } as unknown as APIResponse);
  record(
    again.length === 1 && twice.length === 1
      ? undefined
      : {
          kind: 'other',
          detail: `a second call on a new get_notifications response dropped id a.\nfirst: ${show(again)}\nsecond: ${show(twice)}`,
        },
  );

  const shared = { type: 'market', id: 'a', mark: 'shared' };
  record(
    checkProbe(
      'the same object is in structuredContent and result',
      { structuredContent: { notifications: [shared] }, result: { notifications: [shared] } } as APIResponse,
      [shared],
    ),
  );

  const falsy = { type: 'market', id: false, mark: 'bool' };
  const falsyLater = { type: 'market', id: false, mark: 'bool2' };
  record(
    checkProbe(
      'two notifications with id false',
      { notifications: [falsy, falsyLater] } as unknown as APIResponse,
      [falsy, falsyLater],
    ),
  );

  const missing = { type: 'market', id: null, mark: 'null' };
  const zero = { type: 'market', id: 0, mark: 'zero' };
  const textZero = { type: 'market', id: '0', mark: 'text-zero' };
  record(
    checkProbe(
      'null, 0, and "0" are different ids',
      { notifications: [missing, zero, textZero, { ...textZero, mark: 'text-zero-2' }] } as unknown as APIResponse,
      [missing, zero, textZero],
    ),
  );

  const spaced = { type: 'market', id: ' a ', mark: 'spaced' };
  const plain = { type: 'market', id: 'a', mark: 'plain' };
  const spaceFailure = checkProbe(
    '" a " and "a" are different string ids',
    { notifications: [spaced, plain, { ...spaced, mark: 'spaced-2' }] } as unknown as APIResponse,
    [spaced, plain],
  );
  record(spaceFailure);

  const bare = { id: 'a', mark: 'bare' };
  const bareLater = { id: 'a', mark: 'bare-2' };
  const bareMissing = { mark: 'bare-none' };
  record(
    checkProbe(
      'top-level notifications are deduped even when type is absent',
      { notifications: [bare, bareLater, bareMissing] } as unknown as APIResponse,
      [bare, bareMissing],
    ),
  );

  record(
    checkProbe(
      'a malformed envelope contributes no notifications',
      { structuredContent: '{', result: '[]', notifications: { not: 'an-array' } } as unknown as APIResponse,
      [],
    ),
  );

  record(checkProbe('an empty response keeps nothing', {} as APIResponse, []));
}

const started = performance.now();
let checks = 0;
let emptyIdFailures = 0;
let otherFailures = 0;
let firstEmpty: string | undefined;
let firstOther: string | undefined;

function record(failure: Failure | undefined): void {
  checks += 1;
  if (!failure) return;
  if (failure.kind === 'empty-id') {
    emptyIdFailures += 1;
    firstEmpty ??= failure.detail;
    return;
  }
  otherFailures += 1;
  firstOther ??= failure.detail;
}

const encodings: Encoding[] = ['record', 'json'];
for (const structuredKinds of LISTS) {
  for (const resultKinds of LISTS) {
    for (const topKinds of LISTS) {
      const structured = notesFor(structuredKinds, 's');
      const result = notesFor(resultKinds, 'r');
      const top = notesFor(topKinds, 'n');
      for (const structuredEncoding of encodings) {
        for (const resultEncoding of encodings) {
          record(checkCall(structured, result, top, structuredEncoding, resultEncoding));
        }
      }
    }
  }
}

probes();

const elapsed = Math.round(performance.now() - started);
if (otherFailures > 0 || emptyIdFailures > 0) {
  const lines = [
    'verify-subscription-follow: fail',
    `checks: ${checks}`,
    `empty-string id failures: ${emptyIdFailures}`,
    `other failures: ${otherFailures}`,
    `elapsed_ms: ${elapsed}`,
    '',
    firstOther ?? firstEmpty ?? '',
  ];
  console.log(lines.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    [
      'verify-subscription-follow: pass',
      'property: a string id is kept once across structuredContent, result, and notifications. A notification with no string id is not dropped.',
      `checks: ${checks}`,
      'bound: each of the three sources is a list of 0 to 2 notes with id a, b, empty, absent, or 0; structuredContent and result are records or JSON strings',
      `elapsed_ms: ${elapsed}`,
    ].join('\n'),
  );
}
