#!/usr/bin/env bun
/**
 * Exhaustive check of one promise in loadCatalogDump:
 *
 * A failed fetch returns the previous catalog and does not move fetchedAt
 * forward. A 304 with no cache file is an error. A 304 with a cache returns
 * that same catalog and may move fetchedAt forward. A fresh file does not
 * call the network unless refresh is set.
 *
 * The check calls the real loadCatalogDump. It does not copy the function.
 * Nothing model-checks TypeScript. Run: bun run verify:catalog-dump
 *
 * Each call is prepared with one response. loadCatalogDump returns after at
 * most one fetch; a second fetch in that call is a failure. The next call
 * reads catalog-dump.json. The search runs every one-call sequence, then
 * every two-call sequence. The prepared response is sent only when that
 * call fetches.
 *
 * writeCatalogDumpCache is awaited before either return, and loadCatalogDump
 * does not catch it. A failed write does not return the new body. This script
 * does not inject a write error.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { catalogDumpCachePath, loadCatalogDump } from '../src/catalog-dump-cache.ts';
import { isRecord } from '../src/response.ts';
import type { APIResponse } from '../src/types.ts';

const DUMP_URL = 'https://game.spacemolt.com/api/catalog.json';
const T0 = new Date('2026-09-07T12:00:00.000Z');
const T1 = new Date(T0.getTime() + 1000);
const MAX_AGE = 3600;
const MAX_AGE_304 = 120;
const ETAG_CACHED = '"cached"';
const ETAG_200 = '"from-200"';
const ETAG_304 = '"revalidated"';
const CACHE_CONTROL_200 = 'public, max-age=3600';
const CACHE_CONTROL_304 = 'max-age=120';
const CACHED_CATALOG: Record<string, unknown> = { version: 'cached-version', marker: 'cached' };
const BODY_200: Record<string, unknown> = { version: '200-version', marker: 'from-200' };
const BODY_429: Record<string, unknown> = { version: '429-version', marker: 'from-429' };
const BODY_500: Record<string, unknown> = { version: '500-version', marker: 'from-500' };
const BODY_304: Record<string, unknown> = { version: '304-version', marker: 'from-304' };
const NOT_OBJECT_BODY: unknown[] = [{ marker: 'from-200-array' }];
const RATE_LIMITED_MESSAGE = 'Rate limited — 1 request per minute per IP';
const THROW_MESSAGE = 'socket hang up';
const MAX_CALLS = 2;
const BAD_MARKERS = new Set(['from-429', 'from-500', 'from-304', 'from-200-array']);
const CACHE_KEYS = new Set(['fetchedAt', 'etag', 'maxAgeSeconds', 'version', 'catalog']);

const INITIALS = ['cache miss', 'fresh cache', 'stale cache'] as const;
const RESPONSES = ['200', '304', '429', '500', 'throw', '200-not-object'] as const;
const REFRESHES = [false, true] as const;

type Initial = (typeof INITIALS)[number];
type ResponseKind = (typeof RESPONSES)[number];

interface Step {
  refresh: boolean;
  response: ResponseKind;
}

interface Sequence {
  initial: Initial;
  steps: Step[];
}

interface CacheState {
  fetchedAt: string;
  etag?: string;
  maxAgeSeconds: number;
  version: string;
  catalog: Record<string, unknown>;
}

type Scripted =
  | { type: 'json'; status: number; body: unknown; headers?: Record<string, string> }
  | { type: 'text'; status: number; body: string }
  | { type: 'throw'; message: string };

interface Expectation {
  fetch: boolean;
  catalog?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
  next: CacheState | undefined;
  /** False means catalog-dump.json bytes must be unchanged. */
  rewrite: boolean;
  clause: string;
}

interface FetchSeen {
  url: string;
  method: string | undefined;
  ifNoneMatch: string | undefined;
}

interface CallOutcome {
  fetches: FetchSeen[];
  response?: APIResponse;
  thrown?: string;
  rawAfter: string | undefined;
}

interface Probe {
  name: string;
  initial: CacheState | undefined;
  refresh: boolean;
  now: Date;
  scripted: Scripted;
  expectation: Expectation;
}

let calls = 0;

function responseLabel(kind: ResponseKind): string {
  switch (kind) {
    case '200':
      return 'HTTP 200 JSON object';
    case '304':
      return 'HTTP 304';
    case '429':
      return 'HTTP 429';
    case '500':
      return 'HTTP 500';
    case 'throw':
      return 'thrown fetch';
    case '200-not-object':
      return 'HTTP 200 not a JSON object';
  }
}

function stepLabel(step: Step): string {
  return `refresh ${step.refresh ? 'true' : 'false'}, ${responseLabel(step.response)}`;
}

function sequenceLabel(sequence: Sequence, through: number): string {
  const steps = sequence.steps.slice(0, through).map(stepLabel);
  return [sequence.initial, ...steps].join(' → ');
}

function cacheIsFresh(cache: CacheState, now: Date): boolean {
  const fetched = Date.parse(cache.fetchedAt);
  if (!Number.isFinite(fetched)) return false;
  return now.getTime() - fetched < cache.maxAgeSeconds * 1000;
}

function versionOf(catalog: Record<string, unknown>): string {
  return typeof catalog.version === 'string' ? catalog.version : '';
}

function markerOf(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  return typeof value.marker === 'string' ? value.marker : undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function storedText(cache: CacheState | undefined): string {
  if (!cache) return 'no catalog-dump.json';
  const etag = cache.etag === undefined ? 'no etag' : `etag=${cache.etag}`;
  return `fetchedAt=${cache.fetchedAt} ${etag} maxAgeSeconds=${cache.maxAgeSeconds} version=${cache.version} catalog=${JSON.stringify(cache.catalog)}`;
}

function headerValue(init: RequestInit | undefined, name: string): string | undefined {
  const headers = init?.headers;
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) {
    for (const entry of headers) {
      const headerName = entry[0];
      if (headerName?.toLowerCase() === name.toLowerCase()) return entry[1];
    }
    return undefined;
  }
  const record = headers;
  const key = Object.keys(record).find((entry) => entry.toLowerCase() === name.toLowerCase());
  if (!key) return undefined;
  const value = record[key];
  if (typeof value === 'string') return value;
  return Array.isArray(value) ? value[0] : undefined;
}

function scriptedFor(kind: ResponseKind): Scripted {
  switch (kind) {
    case '200':
      return {
        type: 'json',
        status: 200,
        body: BODY_200,
        headers: { etag: ETAG_200, 'cache-control': CACHE_CONTROL_200 },
      };
    case '304':
      return {
        type: 'json',
        status: 304,
        body: BODY_304,
        headers: { etag: ETAG_304, 'cache-control': CACHE_CONTROL_304 },
      };
    case '429':
      return { type: 'json', status: 429, body: BODY_429 };
    case '500':
      return { type: 'json', status: 500, body: BODY_500 };
    case 'throw':
      return { type: 'throw', message: THROW_MESSAGE };
    case '200-not-object':
      return { type: 'json', status: 200, body: NOT_OBJECT_BODY };
  }
}

function initialCache(initial: Initial): CacheState | undefined {
  if (initial === 'cache miss') return undefined;
  const fetchedAt =
    initial === 'fresh cache' ? new Date(T0.getTime() - 1800 * 1000) : new Date(T0.getTime() - 7200 * 1000);
  return {
    fetchedAt: fetchedAt.toISOString(),
    etag: ETAG_CACHED,
    maxAgeSeconds: MAX_AGE,
    version: 'cached-version',
    catalog: { ...CACHED_CATALOG },
  };
}

function expectOf(cache: CacheState | undefined, step: Step, now: Date): Expectation {
  if (cache && !step.refresh && cacheIsFresh(cache, now)) {
    return {
      fetch: false,
      catalog: cache.catalog,
      next: cache,
      rewrite: false,
      clause: 'A fresh file does not call the network unless refresh is set.',
    };
  }

  const failed = 'A failed fetch returns the previous catalog and does not move fetchedAt forward.';
  switch (step.response) {
    case '200':
      return {
        fetch: true,
        catalog: BODY_200,
        rewrite: true,
        clause: "HTTP 200 with a JSON object writes that catalog and sets fetchedAt to this load's now.",
        next: {
          fetchedAt: now.toISOString(),
          etag: ETAG_200,
          maxAgeSeconds: MAX_AGE,
          version: versionOf(BODY_200),
          catalog: BODY_200,
        },
      };
    case '304':
      if (!cache) {
        return {
          fetch: true,
          errorCode: 'invalid_response',
          errorMessage: 'Catalog dump returned 304 without a local cache.',
          next: undefined,
          rewrite: false,
          clause: 'A 304 with no cache file is invalid_response.',
        };
      }
      return {
        fetch: true,
        catalog: cache.catalog,
        rewrite: true,
        clause: "A 304 with a cache returns that cached catalog and rewrites fetchedAt to this load's now.",
        next: {
          fetchedAt: now.toISOString(),
          etag: ETAG_304,
          maxAgeSeconds: MAX_AGE_304,
          version: cache.version,
          catalog: cache.catalog,
        },
      };
    case '429':
      if (!cache) {
        return {
          fetch: true,
          errorCode: 'rate_limited',
          errorMessage: RATE_LIMITED_MESSAGE,
          next: undefined,
          rewrite: false,
          clause: 'HTTP 429 with no cache file is rate_limited.',
        };
      }
      return { fetch: true, catalog: cache.catalog, next: cache, rewrite: false, clause: failed };
    case '500':
      if (!cache) {
        return {
          fetch: true,
          errorCode: 'http_error',
          errorMessage: 'Catalog dump failed: HTTP 500',
          next: undefined,
          rewrite: false,
          clause: 'HTTP 500 with no cache file is http_error.',
        };
      }
      return { fetch: true, catalog: cache.catalog, next: cache, rewrite: false, clause: failed };
    case 'throw':
      if (!cache) {
        return {
          fetch: true,
          errorCode: 'network_error',
          errorMessage: `Catalog dump request failed: ${THROW_MESSAGE}`,
          next: undefined,
          rewrite: false,
          clause: 'A thrown fetch with no cache file is network_error.',
        };
      }
      return { fetch: true, catalog: cache.catalog, next: cache, rewrite: false, clause: failed };
    case '200-not-object':
      return {
        fetch: true,
        errorCode: 'invalid_response',
        errorMessage: 'Catalog dump response was not a JSON object.',
        next: cache,
        rewrite: false,
        clause: 'A 200 whose body is not a JSON object is not stored as the catalog and does not move fetchedAt.',
      };
  }
}

function readRaw(dir: string): string | undefined {
  const cachePath = catalogDumpCachePath(dir);
  if (!fs.existsSync(cachePath)) return undefined;
  return fs.readFileSync(cachePath, 'utf-8');
}

function emptyDir(dir: string): void {
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
  }
}

function parseStored(raw: string): CacheState | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  for (const key of Object.keys(parsed)) {
    if (!CACHE_KEYS.has(key)) return undefined;
  }
  if (typeof parsed.fetchedAt !== 'string' || parsed.fetchedAt.trim() === '') return undefined;
  if (typeof parsed.version !== 'string') return undefined;
  if (typeof parsed.maxAgeSeconds !== 'number' || !Number.isFinite(parsed.maxAgeSeconds)) return undefined;
  if (!isRecord(parsed.catalog)) return undefined;
  if (parsed.etag !== undefined && (typeof parsed.etag !== 'string' || parsed.etag === '')) return undefined;
  const cache: CacheState = {
    fetchedAt: parsed.fetchedAt,
    maxAgeSeconds: parsed.maxAgeSeconds,
    version: parsed.version,
    catalog: parsed.catalog,
  };
  if (typeof parsed.etag === 'string') cache.etag = parsed.etag;
  return cache;
}

function sameStored(actual: CacheState | undefined, expected: CacheState | undefined): boolean {
  if (actual === undefined || expected === undefined) return actual === expected;
  return (
    actual.fetchedAt === expected.fetchedAt &&
    actual.etag === expected.etag &&
    actual.maxAgeSeconds === expected.maxAgeSeconds &&
    actual.version === expected.version &&
    sameJson(actual.catalog, expected.catalog)
  );
}

function inputUrl(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

async function runCall(dir: string, scripted: Scripted, refresh: boolean, now: Date): Promise<CallOutcome> {
  const fetches: FetchSeen[] = [];
  let response: APIResponse | undefined;
  let thrown: string | undefined;
  calls += 1;
  try {
    response = await loadCatalogDump({
      url: DUMP_URL,
      refresh,
      cacheDir: dir,
      now,
      // The fake fetch returns before this fires. The alphabet does not include a timeout.
      timeoutMs: 1,
      fetch: async (input, init) => {
        fetches.push({
          url: inputUrl(input),
          method: init?.method,
          ifNoneMatch: headerValue(init, 'If-None-Match'),
        });
        if (scripted.type === 'throw') throw new Error(scripted.message);
        if (scripted.type === 'text') {
          return new Response(scripted.body, {
            status: scripted.status,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response(JSON.stringify(scripted.body), {
          status: scripted.status,
          headers: { 'content-type': 'application/json', ...scripted.headers },
        });
      },
    });
  } catch (error) {
    thrown = error instanceof Error ? error.message : String(error);
  }
  return { fetches, response, thrown, rawAfter: readRaw(dir) };
}

function explain(
  cacheBefore: CacheState | undefined,
  rawBefore: string | undefined,
  expectation: Expectation,
  outcome: CallOutcome,
): string | undefined {
  if (outcome.thrown) return `loadCatalogDump threw: ${outcome.thrown}\n${expectation.clause}`;
  const response = outcome.response;
  if (!response) return `loadCatalogDump returned nothing.\n${expectation.clause}`;

  const lines: string[] = [];
  const wantedFetches = expectation.fetch ? 1 : 0;
  if (outcome.fetches.length !== wantedFetches) {
    if (!expectation.fetch) {
      lines.push(
        `fetch was called ${outcome.fetches.length} time(s). A fresh file does not call the network unless refresh is set.`,
      );
    } else if (outcome.fetches.length === 0) {
      lines.push(
        'fetch was not called. The file was missing or stale, or refresh was set, so this load calls the network.',
      );
    } else {
      lines.push(`fetch was called ${outcome.fetches.length} times. loadCatalogDump returns after one fetch.`);
    }
    lines.push(expectation.clause);
    return lines.join('\n');
  }

  const seen = outcome.fetches[0];
  if (expectation.fetch && seen) {
    if (seen.url !== DUMP_URL) lines.push(`fetch URL was ${seen.url}. Expected ${DUMP_URL}.`);
    if (seen.method !== 'GET') lines.push(`fetch method was ${seen.method ?? '(none)'}. Expected GET.`);
    const wantedEtag = cacheBefore?.etag;
    if (seen.ifNoneMatch !== wantedEtag) {
      lines.push(`If-None-Match was ${seen.ifNoneMatch ?? '(absent)'}. The cache etag was ${wantedEtag ?? '(none)'}.`);
    }
  }

  if (expectation.errorCode) {
    if (response.structuredContent !== undefined) {
      lines.push(
        `returned catalog ${JSON.stringify(response.structuredContent)}. Expected ${expectation.errorCode} and no catalog.`,
      );
      const actualMarker = markerOf(response.structuredContent);
      if (actualMarker && BAD_MARKERS.has(actualMarker)) lines.push('The response body was used as the catalog.');
    } else if (response.error?.code !== expectation.errorCode || response.error.message !== expectation.errorMessage) {
      const got = response.error ? `${response.error.code}: ${response.error.message}` : 'no error';
      lines.push(`returned ${got}. Expected ${expectation.errorCode}: ${expectation.errorMessage}.`);
    }
  } else if (response.error) {
    lines.push(
      `returned ${response.error.code}: ${response.error.message}. Expected catalog ${JSON.stringify(expectation.catalog)}.`,
    );
  } else if (!sameJson(response.structuredContent, expectation.catalog)) {
    lines.push(
      `returned ${JSON.stringify(response.structuredContent)}. Expected catalog ${JSON.stringify(expectation.catalog)}.`,
    );
    const actualMarker = markerOf(response.structuredContent);
    if (actualMarker && BAD_MARKERS.has(actualMarker) && actualMarker !== markerOf(expectation.catalog)) {
      lines.push('The response body was used as the catalog.');
    }
  }

  if (!expectation.rewrite) {
    if (rawBefore !== outcome.rawAfter) {
      const before = rawBefore === undefined ? undefined : parseStored(rawBefore);
      const after = outcome.rawAfter === undefined ? undefined : parseStored(outcome.rawAfter);
      if (before?.fetchedAt && after?.fetchedAt && before.fetchedAt !== after.fetchedAt) {
        lines.push(`fetchedAt moved from ${before.fetchedAt} to ${after.fetchedAt}. catalog-dump.json was rewritten.`);
      } else {
        lines.push(
          `catalog-dump.json was rewritten.\nBefore: ${rawBefore ?? '(no file)'}\nAfter: ${outcome.rawAfter ?? '(no file)'}`,
        );
      }
      if (before && after && !sameJson(before.catalog, after.catalog)) {
        lines.push(
          `The stored catalog changed from ${JSON.stringify(before.catalog)} to ${JSON.stringify(after.catalog)}.`,
        );
      }
      const afterMarker = markerOf(after?.catalog);
      if (afterMarker && BAD_MARKERS.has(afterMarker))
        lines.push('The response body was written into catalog-dump.json.');
    }
  } else {
    const actual = outcome.rawAfter === undefined ? undefined : parseStored(outcome.rawAfter);
    if (outcome.rawAfter !== undefined && !actual) {
      lines.push(`catalog-dump.json is not a catalog cache: ${outcome.rawAfter}`);
    } else if (!sameStored(actual, expectation.next)) {
      lines.push(`catalog-dump.json is ${storedText(actual)}. Expected ${storedText(expectation.next)}.`);
    }
  }

  if (lines.length === 0) return undefined;
  lines.push(expectation.clause);
  return lines.join('\n');
}

function writeInitial(dir: string, cache: CacheState | undefined): string | undefined {
  emptyDir(dir);
  if (!cache) return undefined;
  fs.writeFileSync(catalogDumpCachePath(dir), JSON.stringify(cache));
  return readRaw(dir);
}

async function drive(dir: string, sequence: Sequence): Promise<string | undefined> {
  let expected = initialCache(sequence.initial);
  let raw = writeInitial(dir, expected);
  for (let index = 0; index < sequence.steps.length; index += 1) {
    const step = sequence.steps[index];
    if (!step) return `${sequenceLabel(sequence, index)} is missing a call.`;
    const now = index === 0 ? T0 : T1;
    const outcome = await runCall(dir, scriptedFor(step.response), step.refresh, now);
    const expectation = expectOf(expected, step, now);
    const problem = explain(expected, raw, expectation, outcome);
    if (problem) return `${sequenceLabel(sequence, index + 1)}\nOn load ${index + 1}:\n${problem}`;
    expected = expectation.next;
    raw = readRaw(dir);
  }
  return undefined;
}

function oneSteps(): Step[] {
  const steps: Step[] = [];
  for (const refresh of REFRESHES) {
    for (const response of RESPONSES) {
      steps.push({ refresh, response });
    }
  }
  return steps;
}

function buildSequences(): Sequence[] {
  const singles = oneSteps();
  const sequences: Sequence[] = [];
  for (const length of [1, MAX_CALLS]) {
    for (const initial of INITIALS) {
      if (length === 1) {
        for (const step of singles) sequences.push({ initial, steps: [step] });
        continue;
      }
      for (const first of singles) {
        for (const second of singles) sequences.push({ initial, steps: [first, second] });
      }
    }
  }
  return sequences;
}

function assertSearch(sequences: Sequence[]): void {
  const labels = RESPONSES.map((kind) => responseLabel(kind));
  const expectedLabels = [
    'HTTP 200 JSON object',
    'HTTP 304',
    'HTTP 429',
    'HTTP 500',
    'thrown fetch',
    'HTTP 200 not a JSON object',
  ];
  if (labels.join('\n') !== expectedLabels.join('\n')) {
    throw new Error(`Response alphabet is ${labels.join(', ')}. Do not drop a response to make a run pass.`);
  }
  if (INITIALS.join('\n') !== ['cache miss', 'fresh cache', 'stale cache'].join('\n')) {
    throw new Error(`Cache alphabet is ${INITIALS.join(', ')}. Do not drop a cache state to make a run pass.`);
  }
  const stepChoices = REFRESHES.length * RESPONSES.length;
  const expectedCount = INITIALS.length * (stepChoices + stepChoices * stepChoices);
  if (sequences.length !== expectedCount) {
    throw new Error(`Built ${sequences.length} sequences. The product of this alphabet is ${expectedCount}.`);
  }
  const required: Sequence[] = [
    {
      initial: 'cache miss',
      steps: [
        { refresh: false, response: '200' },
        { refresh: true, response: '429' },
      ],
    },
    {
      initial: 'cache miss',
      steps: [
        { refresh: false, response: '200' },
        { refresh: true, response: '304' },
      ],
    },
    {
      initial: 'fresh cache',
      steps: [
        { refresh: false, response: '200' },
        { refresh: false, response: '429' },
      ],
    },
    {
      initial: 'stale cache',
      steps: [{ refresh: false, response: '500' }],
    },
  ];
  for (const sequence of required) {
    const found = sequences.some(
      (candidate) =>
        candidate.initial === sequence.initial &&
        candidate.steps.length === sequence.steps.length &&
        candidate.steps.every(
          (step, index) =>
            step.refresh === sequence.steps[index]?.refresh && step.response === sequence.steps[index]?.response,
        ),
    );
    if (!found) throw new Error(`Named sequence missing: ${sequenceLabel(sequence, sequence.steps.length)}`);
  }
}

function staleCache(): CacheState {
  return {
    fetchedAt: new Date(T0.getTime() - 7200 * 1000).toISOString(),
    etag: ETAG_CACHED,
    maxAgeSeconds: MAX_AGE,
    version: 'cached-version',
    catalog: { ...CACHED_CATALOG },
  };
}

function errorExpectation(code: string, message: string, clause: string, next: CacheState | undefined): Expectation {
  return {
    fetch: true,
    errorCode: code,
    errorMessage: message,
    next,
    rewrite: false,
    clause,
  };
}

function boundaryProbes(): Probe[] {
  const probes: Probe[] = [];
  const exact: CacheState = {
    fetchedAt: new Date(T0.getTime() - MAX_AGE * 1000).toISOString(),
    etag: ETAG_CACHED,
    maxAgeSeconds: MAX_AGE,
    version: 'cached-version',
    catalog: { ...CACHED_CATALOG },
  };
  const inside: CacheState = {
    fetchedAt: new Date(T0.getTime() - MAX_AGE * 1000 + 1).toISOString(),
    etag: ETAG_CACHED,
    maxAgeSeconds: MAX_AGE,
    version: 'cached-version',
    catalog: { ...CACHED_CATALOG },
  };
  probes.push({
    name: 'fetchedAt exactly maxAgeSeconds ago is stale',
    initial: exact,
    refresh: false,
    now: T0,
    scripted: { type: 'throw', message: THROW_MESSAGE },
    expectation: {
      fetch: true,
      catalog: exact.catalog,
      next: exact,
      rewrite: false,
      clause: 'Age equal to maxAgeSeconds is not fresh. isCacheFresh uses a strict less-than.',
    },
  });
  probes.push({
    name: 'fetchedAt 1ms inside maxAgeSeconds is fresh',
    initial: inside,
    refresh: false,
    now: T0,
    scripted: scriptedFor('200'),
    expectation: {
      fetch: false,
      catalog: inside.catalog,
      next: inside,
      rewrite: false,
      clause: 'A file younger than maxAgeSeconds does not call the network when refresh is false.',
    },
  });
  probes.push({
    name: 'HTTP 200 with no etag and no Cache-Control stores max-age 3600 and no etag',
    initial: undefined,
    refresh: false,
    now: T0,
    scripted: { type: 'json', status: 200, body: BODY_200 },
    expectation: {
      fetch: true,
      catalog: BODY_200,
      rewrite: true,
      clause: 'With no Cache-Control max-age, the stored maxAgeSeconds is 3600. With no etag, the file has no etag.',
      next: {
        fetchedAt: T0.toISOString(),
        maxAgeSeconds: 3600,
        version: versionOf(BODY_200),
        catalog: BODY_200,
      },
    },
  });

  const notObjectClause =
    'A 200 whose body is not a JSON object is invalid_response. It is not stored, and a cache file is left as it was.';
  const notObjectMessage = 'Catalog dump response was not a JSON object.';
  const bodies: Array<{ name: string; body: unknown }> = [
    { name: 'null', body: null },
    { name: 'a number', body: 1 },
    { name: 'a string', body: 'catalog' },
    { name: 'a boolean', body: true },
  ];
  for (const body of bodies) {
    const stale = staleCache();
    probes.push({
      name: `HTTP 200 ${body.name} with a stale cache`,
      initial: stale,
      refresh: false,
      now: T0,
      scripted: { type: 'json', status: 200, body: body.body },
      expectation: errorExpectation('invalid_response', notObjectMessage, notObjectClause, stale),
    });
    probes.push({
      name: `HTTP 200 ${body.name} with no cache file`,
      initial: undefined,
      refresh: false,
      now: T0,
      scripted: { type: 'json', status: 200, body: body.body },
      expectation: errorExpectation('invalid_response', notObjectMessage, notObjectClause, undefined),
    });
  }

  const invalidJson = 'Catalog dump response was not valid JSON.';
  const invalidClause =
    'A 200 whose body is not valid JSON is invalid_response. It is not stored, and a cache file is left as it was.';
  const stale = staleCache();
  probes.push({
    name: 'HTTP 200 invalid JSON with a stale cache',
    initial: stale,
    refresh: false,
    now: T0,
    scripted: { type: 'text', status: 200, body: '{not-json' },
    expectation: errorExpectation('invalid_response', invalidJson, invalidClause, stale),
  });
  probes.push({
    name: 'HTTP 200 invalid JSON with no cache file',
    initial: undefined,
    refresh: false,
    now: T0,
    scripted: { type: 'text', status: 200, body: '{not-json' },
    expectation: errorExpectation('invalid_response', invalidJson, invalidClause, undefined),
  });
  return probes;
}

async function runProbe(dir: string, probe: Probe): Promise<string | undefined> {
  const raw = writeInitial(dir, probe.initial);
  const outcome = await runCall(dir, probe.scripted, probe.refresh, probe.now);
  const problem = explain(probe.initial, raw, probe.expectation, outcome);
  if (!problem) return undefined;
  return `${probe.name}\n${problem}`;
}

async function main(): Promise<void> {
  const started = performance.now();
  const sequences = buildSequences();
  assertSearch(sequences);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-verify-catalog-dump-'));
  try {
    for (const sequence of sequences) {
      const failure = await drive(dir, sequence);
      if (failure) {
        console.log(`verify-catalog-dump: fail\n${failure}`);
        process.exitCode = 1;
        return;
      }
    }
    const probes = boundaryProbes();
    for (const probe of probes) {
      const failure = await runProbe(dir, probe);
      if (failure) {
        console.log(`verify-catalog-dump: fail\n${failure}`);
        process.exitCode = 1;
        return;
      }
    }
    const elapsed = Math.round(performance.now() - started);
    console.log(
      [
        'verify-catalog-dump: pass',
        'property: a failed fetch returns the previous catalog and does not move fetchedAt forward; a 304 with no cache file is an error; a 304 with a cache returns that same catalog and may move fetchedAt forward; a fresh file does not call the network unless refresh is set.',
        `sequences: ${sequences.length}`,
        `probes: ${probes.length}`,
        `loadCatalogDump calls: ${calls}`,
        `elapsed_ms: ${elapsed}`,
      ].join('\n'),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

await main();
