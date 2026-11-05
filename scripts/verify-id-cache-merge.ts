#!/usr/bin/env bun
/**
 * Clause 1 of the id-cache merge promise.
 *
 * For one (kind, id, sourceCommand), the stored name and context come from
 * the sighting with the latest seenAt. An empty name does not wipe a name
 * the other sighting had. A context key only on the older sighting is kept.
 * A context key on both comes from the newer sighting.
 *
 * Nothing model-checks TypeScript. mergeHints is not exported. This script
 * does not copy it. It writes one stored sighting, then calls the real
 * cacheIdsFromResponse, which loads that file and calls mergeHints.
 *
 * Clause 2, two completed saves of different keys, is the TLA+ model in
 * verification/id-cache-merge/. This script does not check it.
 *
 * Run: bun run verify:id-cache-merge
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { cacheIdsFromResponse, extractIdHints, getIdCachePath, loadIdCacheSync, type IdHint } from '../src/id-cache.ts';

const NAMES = ['Manny', 'Rock Skipper', ''] as const;
const STORED_LOCATIONS = ['sol', 'earth_station', undefined] as const;
const RESPONSE_LOCATIONS = ['earth_station', 'sol', undefined] as const;
const ACTIVE = [true, false, undefined] as const;
const OLDER = '2026-05-18T00:00:00.000Z';
const NEWER = '2026-05-18T00:01:00.000Z';
const COMMAND = 'list_ships';
const SHIP_ID = 'ship-1';

type Order = 'response-newer' | 'stored-newer';

function nonempty(name: string | undefined): name is string {
  return name !== undefined && name !== '';
}

function expectedName(newer: IdHint, older: IdHint): string {
  if (nonempty(newer.name)) return newer.name;
  if (nonempty(older.name)) return older.name;
  return '';
}

function expectedContext(newer: IdHint, older: IdHint): Record<string, string | number | boolean> {
  return { ...(older.context ?? {}), ...(newer.context ?? {}) };
}

function sameContext(
  actual: Record<string, string | number | boolean> | undefined,
  expected: Record<string, string | number | boolean>,
): boolean {
  const left = actual ?? {};
  const keys = new Set([...Object.keys(left), ...Object.keys(expected)]);
  for (const key of keys) {
    if (left[key] !== expected[key]) return false;
  }
  return true;
}

function contextText(context: Record<string, string | number | boolean> | undefined): string {
  const entries = Object.entries(context ?? {}).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return 'no context';
  return entries.map(([key, value]) => `${key}=${String(value)}`).join(' ');
}

function nameText(name: string | undefined): string {
  return nonempty(name) ? name : 'empty';
}

function shipRecord(name: string, location: string | undefined, active: boolean | undefined): Record<string, unknown> {
  const ship: Record<string, unknown> = { id: SHIP_ID };
  if (name !== '') ship.name = name;
  if (location !== undefined) ship.location = location;
  if (active !== undefined) ship.is_active = active;
  return ship;
}

function storedHint(name: string, location: string | undefined, active: boolean | undefined, seenAt: string): IdHint {
  const hint: IdHint = { kind: 'ship', id: SHIP_ID, sourceCommand: COMMAND, seenAt };
  if (name !== '') hint.name = name;
  const context: Record<string, string | number | boolean> = {};
  if (location !== undefined) context.location = location;
  if (active !== undefined) context.is_active = active;
  if (Object.keys(context).length > 0) hint.context = context;
  return hint;
}

function intendedContext(location: string | undefined, active: boolean | undefined): Record<string, string | number | boolean> {
  const context: Record<string, string | number | boolean> = {};
  if (location !== undefined) context.location = location;
  if (active !== undefined) context.is_active = active;
  return context;
}

function shapeDrift(incoming: IdHint[], name: string, location: string | undefined, active: boolean | undefined, seenAt: string): string | undefined {
  const hint = incoming.length === 1 ? incoming[0] : undefined;
  if (!hint) {
    return `list_ships extracted ${incoming.length} hints, not the one ship. The checker built a bad response.`;
  }
  const wanted = intendedContext(location, active);
  if (
    hint.kind !== 'ship' ||
    hint.id !== SHIP_ID ||
    hint.sourceCommand !== COMMAND ||
    hint.seenAt !== seenAt ||
    (hint.name ?? '') !== name ||
    !sameContext(hint.context, wanted)
  ) {
    return [
      'The list_ships response did not extract the sighting the bound asked for.',
      `expected ship ${SHIP_ID} name=${nameText(name)} ${contextText(wanted)} seenAt=${seenAt}`,
      `actual ${hint.kind} ${hint.id} from ${hint.sourceCommand} name=${nameText(hint.name)} ${contextText(hint.context)} seenAt=${hint.seenAt}`,
    ].join('\n');
  }
  return undefined;
}

function failureText(
  order: Order,
  stored: IdHint,
  response: IdHint,
  actual: IdHint | undefined,
  expectedNameValue: string,
  expectedContextValue: Record<string, string | number | boolean>,
): string {
  const newerSeen = stored.seenAt.localeCompare(response.seenAt) > 0 ? stored.seenAt : response.seenAt;
  const mismatches: string[] = [];
  if (!actual) mismatches.push('The save dropped the ship key.');
  else {
    if ((actual.name ?? '') !== expectedNameValue) {
      mismatches.push(
        `The stored name is ${nameText(actual.name)}. The name from seenAt ${newerSeen}, keeping a name the other sighting had when that one is empty, is ${nameText(expectedNameValue)}.`,
      );
    }
    if (!sameContext(actual.context, expectedContextValue)) {
      mismatches.push(
        `The stored context is ${contextText(actual.context)}. The context from seenAt ${newerSeen}, keeping keys only the older sighting had, is ${contextText(expectedContextValue)}.`,
      );
    }
  }
  const actualLine = actual
    ? `actual name=${nameText(actual.name)} ${contextText(actual.context)} seenAt=${actual.seenAt}`
    : 'actual: the ship key is not in the file';
  return [
    order,
    `stored list_ships ship ${SHIP_ID} name=${nameText(stored.name)} ${contextText(stored.context)} seenAt=${stored.seenAt}`,
    `response name=${nameText(response.name)} ${contextText(response.context)} seenAt=${response.seenAt}`,
    `expected name=${nameText(expectedNameValue)} ${contextText(expectedContextValue)} from seenAt=${newerSeen}`,
    actualLine,
    ...mismatches,
  ].join('\n');
}

interface Example {
  order: Order;
  text: string;
}

function remember(examples: Map<Order, Example>, order: Order, text: string): void {
  if (!examples.has(order)) examples.set(order, { order, text });
}

async function main(): Promise<void> {
  const started = performance.now();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-cache-merge-'));
  const sessionPath = path.join(dir, 'pilot.json');
  const cachePath = getIdCachePath(sessionPath);
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  const examples = new Map<Order, Example>();
  const counts: Record<Order, number> = { 'response-newer': 0, 'stored-newer': 0 };
  let checks = 0;
  try {
    for (const order of ['response-newer', 'stored-newer'] as const) {
      const storedSeen = order === 'stored-newer' ? NEWER : OLDER;
      const responseSeen = order === 'stored-newer' ? OLDER : NEWER;
      for (const storedName of NAMES) {
        for (const responseName of NAMES) {
          for (const storedLocation of STORED_LOCATIONS) {
            for (const responseLocation of RESPONSE_LOCATIONS) {
              for (const storedActive of ACTIVE) {
                for (const responseActive of ACTIVE) {
                  checks += 1;
                  const stored = storedHint(storedName, storedLocation, storedActive, storedSeen);
                  const result = { ships: [shipRecord(responseName, responseLocation, responseActive)] };
                  fs.writeFileSync(cachePath, `${JSON.stringify({ version: 1, hints: [stored] }, null, 2)}\n`);
                  const loaded = loadIdCacheSync(sessionPath);
                  const loadedHint = loaded.length === 1 ? loaded[0] : undefined;
                  if (!loadedHint) {
                    remember(examples, order, `loadIdCacheSync did not return the one stored ship. It returned ${loaded.length} hints.`);
                    counts[order] += 1;
                    continue;
                  }
                  const incoming = extractIdHints(COMMAND, result, responseSeen);
                  const drift = shapeDrift(incoming, responseName, responseLocation, responseActive, responseSeen);
                  if (drift) {
                    console.log(`verify-id-cache-merge: fail\nclause: 1\n${drift}`);
                    process.exitCode = 1;
                    return;
                  }
                  const responseHint = incoming[0];
                  if (!responseHint) {
                    console.log(
                      'verify-id-cache-merge: fail\nclause: 1\nextractIdHints returned no hint after the shape check.',
                    );
                    process.exitCode = 1;
                    return;
                  }
                  await cacheIdsFromResponse(COMMAND, { structuredContent: result }, sessionPath, {
                    now: () => new Date(responseSeen),
                  });
                  const after = loadIdCacheSync(sessionPath);
                  const actual = after.find((hint) => hint.kind === 'ship' && hint.id === SHIP_ID && hint.sourceCommand === COMMAND);
                  const storedIsNewer = loadedHint.seenAt.localeCompare(responseHint.seenAt) > 0;
                  const newer = storedIsNewer ? loadedHint : responseHint;
                  const older = newer === loadedHint ? responseHint : loadedHint;
                  const name = expectedName(newer, older);
                  const context = expectedContext(newer, older);
                  if (actual && (actual.name ?? '') === name && sameContext(actual.context, context)) continue;
                  counts[order] += 1;
                  remember(examples, order, failureText(order, loadedHint, responseHint, actual, name, context));
                }
              }
            }
          }
        }
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  const elapsed = Math.round(performance.now() - started);
  const responseNewer = counts['response-newer'];
  const storedNewer = counts['stored-newer'];
  if (responseNewer === 0 && storedNewer === 0) {
    console.log(
      [
        'verify-id-cache-merge: pass',
        'clause: 1',
        'property: for one (kind, id, sourceCommand), the stored name and context come from the sighting with the latest seenAt. An empty name does not wipe a name the other sighting had. A context key only on the older sighting is kept. A context key on both comes from the newer sighting.',
        `checks: ${checks}`,
        'bound: one list_ships ship ship-1. Names {Manny, Rock Skipper, empty}. location {sol, earth_station, absent}. is_active {true, false, absent}. The response is newer, or the stored sighting is newer. seenAt is 2026-05-18T00:00:00.000Z or one minute later.',
        `elapsed_ms: ${elapsed}`,
      ].join('\n'),
    );
    return;
  }

  const first = examples.get('response-newer') ?? examples.get('stored-newer');
  console.log(
    [
      'verify-id-cache-merge: fail',
      'clause: 1',
      `response-newer failures: ${responseNewer}`,
      `stored-newer failures: ${storedNewer}`,
      `checks: ${checks}`,
      `elapsed_ms: ${elapsed}`,
      'first failure:',
      first?.text ?? '',
    ].join('\n'),
  );
  process.exitCode = 1;
}

await main();
