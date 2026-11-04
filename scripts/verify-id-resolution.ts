#!/usr/bin/env bun
/**
 * Exhaustive check of one promise in resolveCachedId:
 *
 * A typed id is rewritten only when exactly one cached entity of that kind
 * matches, and two matches are ambiguous. The command is not given either id.
 *
 * Run: bun run verify:id-resolution
 *
 * No model checker runs on this TypeScript. The script calls the real
 * resolver on every hint list in the bound below.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type IdHint,
  type IdKind,
  type IdMatchKind,
  resolveCachedId,
  softIdResolutionPolicy,
  STRICT_ID_RESOLUTION_POLICY,
} from '../src/id-cache.ts';
import { preparePayload } from '../src/payload.ts';
import type { GlobalOptions } from '../src/types.ts';

const IDS = ['a', 'ab', 'b', 'a_b'] as const;
const NAMES = ['', 'a', 'a-b', 'x'] as const;
const POI_IDS = ['a', 'ab', 'a_b'] as const;
const POI_NAMES = ['', 'a', 'a-b'] as const;
const BASES = [undefined, 'a', 'a_b'] as const;
const QUERIES = [
  'a',
  'ab',
  'b',
  'a_b',
  'a-b',
  'a b',
  'A',
  ' a ',
  'A_B',
  'x',
  'abc',
  'haven',
  '',
  '   ',
  'package:a',
  ' package:a ',
  'package:',
  'package:package:a',
  'Package:a',
] as const;
const POI_QUERIES = ['a', 'ab', 'a_b', 'a-b', 'a b', 'A_B', 'haven', ' a '] as const;

interface Shape {
  id: string;
  name: string;
  baseId?: string;
}

type PolicyName = 'strict' | 'soft';

interface ExpectedResolved {
  type: 'resolved';
  value: string;
  match: IdMatchKind;
  hintId: string;
}

interface ExpectedAmbiguous {
  type: 'ambiguous';
  ids: string[];
}

interface ExpectedUnresolved {
  type: 'unresolved';
  value: string;
}

type Expected = ExpectedResolved | ExpectedAmbiguous | ExpectedUnresolved;

function norm(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function packageLookup(trimmed: string): string {
  if (!trimmed.startsWith('package:')) return trimmed;
  const rest = trimmed.slice('package:'.length);
  return rest || trimmed;
}

function pinnedPolicy(kind: IdKind, policy: PolicyName): { allowPrefix: boolean; allowSubstring: boolean } {
  if (policy === 'strict') return { allowPrefix: false, allowSubstring: false };
  if (kind === 'system' || kind === 'poi') return { allowPrefix: true, allowSubstring: false };
  return { allowPrefix: true, allowSubstring: true };
}

function policyDrift(): string | undefined {
  const problems: string[] = [];
  if (STRICT_ID_RESOLUTION_POLICY.allowPrefix || STRICT_ID_RESOLUTION_POLICY.allowSubstring) {
    problems.push('STRICT_ID_RESOLUTION_POLICY allows prefix or substring. The checked promise allows neither.');
  }
  for (const kind of ['system', 'poi'] as const) {
    const soft = softIdResolutionPolicy(kind);
    if (!soft.allowPrefix || soft.allowSubstring) {
      problems.push(`soft ${kind} policy is prefix=${soft.allowPrefix} substring=${soft.allowSubstring}.`);
    }
  }
  for (const kind of ['player', 'item', 'package'] as const) {
    const soft = softIdResolutionPolicy(kind);
    if (!soft.allowPrefix || !soft.allowSubstring) {
      problems.push(`soft ${kind} policy is prefix=${soft.allowPrefix} substring=${soft.allowSubstring}.`);
    }
  }
  if (problems.length === 0) return undefined;
  return `${problems.join(
    '\n',
  )}\nSoft system and poi resolution may use a unique prefix. They must not use a substring. haven must not become crosshaven. Other kinds may use a unique prefix or substring only when fuzzy ids are on.`;
}

interface Candidate {
  id: string;
  names: string[];
  baseId?: string;
  baseNorm: string;
}

function candidatesFor(kind: IdKind, hints: IdHint[]): Candidate[] {
  const groups = new Map<string, IdHint[]>();
  for (const hint of hints) {
    if (hint.kind !== kind || !hint.id) continue;
    const group = groups.get(hint.id);
    if (group) group.push(hint);
    else groups.set(hint.id, [hint]);
  }
  const candidates: Candidate[] = [];
  for (const [id, group] of groups) {
    const ordered = [...group].sort((left, right) => right.seenAt.localeCompare(left.seenAt) || left.id.localeCompare(right.id));
    const names = new Set<string>();
    const idNorm = norm(id);
    if (idNorm) names.add(idNorm);
    for (const hint of ordered) {
      if (!hint.name) continue;
      const nameNorm = norm(hint.name);
      if (nameNorm) names.add(nameNorm);
    }
    let baseId: string | undefined;
    for (const hint of [...ordered].reverse()) {
      const raw = hint.context?.base_id;
      if (typeof raw === 'string' && raw) baseId = raw;
      else if (typeof raw === 'number' || typeof raw === 'boolean') baseId = String(raw);
    }
    candidates.push({ id, names: [...names], baseId, baseNorm: baseId ? norm(baseId) : '' });
  }
  return candidates;
}

function namedHit(candidate: Candidate, queryNorm: string, match: IdMatchKind): boolean {
  return candidate.names.some((value) => {
    if (match === 'exact') return value === queryNorm;
    if (match === 'prefix') return value.startsWith(queryNorm);
    return value.includes(queryNorm);
  });
}

function baseHit(kind: IdKind, candidate: Candidate, queryNorm: string, match: IdMatchKind): boolean {
  if (kind !== 'poi' || !candidate.baseNorm || match === 'substring') return false;
  if (match === 'exact') return candidate.baseNorm === queryNorm;
  return candidate.baseNorm.startsWith(queryNorm);
}

function finish(matches: Candidate[], match: IdMatchKind, lookup: string): Expected {
  const only = matches.length === 1 ? matches[0] : undefined;
  if (!only) return { type: 'ambiguous', ids: matches.map((candidate) => candidate.id).sort() };
  const queryNorm = norm(lookup);
  if (namedHit(only, queryNorm, match)) return { type: 'resolved', value: only.id, match, hintId: only.id };
  if (match === 'exact') return { type: 'resolved', value: lookup, match, hintId: only.id };
  return { type: 'resolved', value: only.baseId || only.id, match, hintId: only.id };
}

function expectFromCandidates(kind: IdKind, query: string, candidates: Candidate[], policy: PolicyName): Expected {
  const trimmed = query.trim();
  if (!trimmed) return { type: 'unresolved', value: query };
  const lookup = kind === 'package' ? packageLookup(trimmed) : trimmed;
  const queryNorm = norm(lookup);
  if (!queryNorm) return { type: 'unresolved', value: kind === 'package' ? lookup : query };

  const rules = pinnedPolicy(kind, policy);
  const exactNamed = candidates.filter((candidate) => namedHit(candidate, queryNorm, 'exact'));
  if (exactNamed.length > 0) return finish(exactNamed, 'exact', lookup);
  if (kind === 'poi') {
    const exactBase = candidates.filter((candidate) => baseHit(kind, candidate, queryNorm, 'exact'));
    if (exactBase.length > 0) return finish(exactBase, 'exact', lookup);
  }
  if (rules.allowPrefix) {
    const prefix = candidates.filter(
      (candidate) => namedHit(candidate, queryNorm, 'prefix') || baseHit(kind, candidate, queryNorm, 'prefix'),
    );
    if (prefix.length > 0) return finish(prefix, 'prefix', lookup);
  }
  if (rules.allowSubstring) {
    const substring = candidates.filter((candidate) => namedHit(candidate, queryNorm, 'substring'));
    if (substring.length > 0) return finish(substring, 'substring', lookup);
  }
  return { type: 'unresolved', value: kind === 'package' ? lookup : query };
}

function sameExpected(expected: Expected, actual: ReturnType<typeof resolveCachedId>): boolean {
  if (expected.type === 'unresolved') return actual.type === 'unresolved' && actual.value === expected.value;
  if (expected.type === 'ambiguous') {
    if (actual.type !== 'ambiguous') return false;
    const ids = [...new Set(actual.matches.map((hint) => hint.id))].sort();
    return ids.length === expected.ids.length && ids.every((id, index) => id === expected.ids[index]);
  }
  return (
    actual.type === 'resolved' &&
    actual.value === expected.value &&
    actual.match === expected.match &&
    actual.hint.id === expected.hintId
  );
}

function describeHints(hints: IdHint[]): string {
  if (hints.length === 0) return '  (no hints)';
  return hints
    .map((hint) => {
      const base = hint.context?.base_id;
      const baseText = base === undefined ? '' : ` base_id=${String(base)}`;
      return `  ${hint.kind} ${hint.id}${hint.name ? ` name=${hint.name}` : ''}${baseText} seen=${hint.seenAt}`;
    })
    .join('\n');
}

function describeActual(actual: ReturnType<typeof resolveCachedId>): string {
  if (actual.type === 'resolved') return `resolved ${actual.value} (${actual.match}, hint ${actual.hint.id})`;
  if (actual.type === 'ambiguous') return `ambiguous ${actual.matches.map((hint) => hint.id).join(', ')}`;
  return `unresolved ${JSON.stringify(actual.value)}`;
}

function describeExpected(expected: Expected): string {
  if (expected.type === 'resolved') return `resolved ${expected.value} (${expected.match}, hint ${expected.hintId})`;
  if (expected.type === 'ambiguous') return `ambiguous ${expected.ids.join(', ')}`;
  return `unresolved ${JSON.stringify(expected.value)}`;
}

function checkOne(
  kind: IdKind,
  query: string,
  hints: IdHint[],
  policy: PolicyName,
  candidates = candidatesFor(kind, hints),
): string | undefined {
  checks += 1;
  const expected = expectFromCandidates(kind, query, candidates, policy);
  const actual = resolveCachedId(
    kind,
    query,
    hints,
    policy === 'strict' ? STRICT_ID_RESOLUTION_POLICY : softIdResolutionPolicy(kind),
  );
  if (sameExpected(expected, actual)) return undefined;
  return [
    `${kind} ${policy} query ${JSON.stringify(query)}`,
    describeHints(hints),
    `expected ${describeExpected(expected)}`,
    `actual ${describeActual(actual)}`,
    'Two cached entities of the same kind must not collapse into one target. attack, travel, and transfer would use that target.',
  ].join('\n');
}

function shapesFor(ids: readonly string[], names: readonly string[], bases: readonly (string | undefined)[] | undefined): Shape[] {
  const shapes: Shape[] = [];
  for (const id of ids) {
    for (const name of names) {
      if (!bases) {
        shapes.push({ id, name });
        continue;
      }
      for (const baseId of bases) shapes.push({ id, name, baseId });
    }
  }
  return shapes;
}

function materialize(kind: IdKind, shapes: Shape[], decoyKind: IdKind): IdHint[] {
  const hints: IdHint[] = shapes.map((shape, index) => {
    const hint: IdHint = {
      kind,
      id: shape.id,
      sourceCommand: `seen-${index}`,
      seenAt: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    };
    if (shape.name) hint.name = shape.name;
    if (shape.baseId !== undefined) hint.context = { base_id: shape.baseId };
    return hint;
  });
  hints.push({
    kind: decoyKind,
    id: 'a',
    name: 'a',
    sourceCommand: 'decoy',
    seenAt: '2026-02-01T00:00:00.000Z',
    context: decoyKind === 'poi' ? { base_id: 'ab' } : undefined,
  });
  return hints;
}

function eachList(shapes: Shape[], count: number, visit: (list: Shape[]) => string | undefined): string | undefined {
  const current: Shape[] = [];
  function walk(left: number): string | undefined {
    if (left === 0) return visit(current);
    for (const shape of shapes) {
      current.push(shape);
      const failure = walk(left - 1);
      current.pop();
      if (failure) return failure;
    }
    return undefined;
  }
  return walk(count);
}

function checkGrid(
  kind: IdKind,
  shapes: Shape[],
  queries: readonly string[],
  maxHints: number,
  decoyKind: IdKind,
): string | undefined {
  for (let count = 0; count <= maxHints; count += 1) {
    const failure = eachList(shapes, count, (list) => {
      const hints = materialize(kind, list, decoyKind);
      const candidates = candidatesFor(kind, hints);
      for (const query of queries) {
        const strict = checkOne(kind, query, hints, 'strict', candidates);
        if (strict) return strict;
        const soft = checkOne(kind, query, hints, 'soft', candidates);
        if (soft) return soft;
      }
      return undefined;
    });
    if (failure) return failure;
  }
  return undefined;
}

function hint(kind: IdKind, id: string, name: string, seenAt: string, baseId?: string): IdHint {
  return {
    kind,
    id,
    name,
    sourceCommand: 'probe',
    seenAt,
    ...(baseId ? { context: { base_id: baseId } } : {}),
  };
}

function fixedProbes(): string | undefined {
  const crosshaven = [hint('system', 'crosshaven', 'Crosshaven', '2026-05-18T00:00:00.000Z')];
  const checks: Array<[IdKind, string, IdHint[], PolicyName]> = [
    ['system', 'haven', crosshaven, 'strict'],
    ['system', 'haven', crosshaven, 'soft'],
    ['system', 'cro', crosshaven, 'strict'],
    ['system', 'cro', crosshaven, 'soft'],
    [
      'poi',
      'industrial',
      [hint('poi', 'node_beta_industrial_station', 'Node Beta Industrial Station', '2026-05-18T00:00:00.000Z')],
      'soft',
    ],
    [
      'poi',
      'Earth_Station',
      [hint('poi', 'sol_earth', 'Earth', '2026-05-18T00:00:00.000Z', 'earth_station')],
      'strict',
    ],
    [
      'item',
      'fuel',
      [hint('item', 'fuel_cell', 'Fuel Cell', '2026-05-18T00:00:00.000Z')],
      'strict',
    ],
    [
      'item',
      'fuel',
      [hint('item', 'fuel_cell', 'Fuel Cell', '2026-05-18T00:00:00.000Z')],
      'soft',
    ],
    [
      'item',
      'cell',
      [hint('item', 'fuel_cell', 'Fuel Cell', '2026-05-18T00:00:00.000Z')],
      'soft',
    ],
    [
      'item',
      'iron',
      [
        hint('item', 'ore_iron', 'Iron Ore', '2026-05-18T00:00:00.000Z'),
        hint('item', 'iron_plate', 'Iron Plate', '2026-05-18T00:01:00.000Z'),
      ],
      'strict',
    ],
    [
      'item',
      'iron',
      [
        hint('item', 'ore_iron', 'Iron Ore', '2026-05-18T00:00:00.000Z'),
        hint('item', 'iron_plate', 'Iron Plate', '2026-05-18T00:01:00.000Z'),
      ],
      'soft',
    ],
    [
      'poi',
      'earth',
      [
        hint('poi', 'sol_earth', 'Earth', '2026-05-18T00:00:00.000Z'),
        hint('poi', 'sol_earth', 'Terra', '2026-05-18T00:01:00.000Z'),
      ],
      'strict',
    ],
  ];
  for (const [kind, query, hints, policy] of checks) {
    const failure = checkOne(kind, query, hints, policy);
    if (failure) return failure;
  }
  return undefined;
}

function attackOptions(fuzzyIds: boolean): GlobalOptions {
  return {
    json: false,
    quiet: true,
    plain: true,
    allowUnknown: false,
    dryRun: false,
    noTimestamp: false,
    compact: false,
    args: [],
    fuzzyIds,
  };
}

function writeHints(sessionPath: string, hints: IdHint[]): void {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  const cachePath = path.join(path.dirname(sessionPath), `${path.basename(sessionPath, '.json')}.ids.json`);
  fs.writeFileSync(cachePath, `${JSON.stringify({ version: 1, hints })}\n`);
}

function payloadProbes(): string | undefined {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-id-resolution-'));
  const sessionPath = path.join(dir, 'pilot.json');
  try {
    writeHints(sessionPath, [
      hint('player', 'raider_1', 'Raider', '2026-05-18T00:00:00.000Z'),
      hint('player', 'raider_2', 'Raider', '2026-05-18T00:01:00.000Z'),
    ]);
    const silent = { out() {}, err() {} };
    const ambiguous = preparePayload('attack', { target_id: 'raider' }, attackOptions(false), sessionPath, silent);
    if (ambiguous.type !== 'exit' || ambiguous.exitCode !== 1) {
      return `attack raider with two cached Raiders returned ${JSON.stringify(ambiguous)}. The command must stop. It must not pick raider_1 or raider_2.`;
    }

    writeHints(sessionPath, [hint('player', 'raider_1', 'Raider', '2026-05-18T00:00:00.000Z')]);
    const strictPrefix = preparePayload('attack', { target_id: 'rai' }, attackOptions(false), sessionPath, silent);
    if (strictPrefix.type !== 'payload' || strictPrefix.payload.id !== 'rai') {
      return `strict attack rai rewrote the target to ${JSON.stringify(strictPrefix)}. Prefix matching is off unless fuzzy ids are on.`;
    }
    const softPrefix = preparePayload('attack', { target_id: 'rai' }, attackOptions(true), sessionPath, silent);
    if (softPrefix.type !== 'payload' || softPrefix.payload.id !== 'raider_1') {
      return `fuzzy attack rai should send raider_1, the only cached prefix. It returned ${JSON.stringify(softPrefix)}.`;
    }

    writeHints(sessionPath, [
      hint('player', 'raider_1', 'Raider One', '2026-05-18T00:00:00.000Z'),
      hint('player', 'raider_2', 'Raider Two', '2026-05-18T00:01:00.000Z'),
    ]);
    const softAmbiguous = preparePayload('attack', { target_id: 'rai' }, attackOptions(true), sessionPath, silent);
    if (softAmbiguous.type !== 'exit' || softAmbiguous.exitCode !== 1) {
      return `fuzzy attack rai matches raider_1 and raider_2. The command returned ${JSON.stringify(softAmbiguous)}. It must not pick one.`;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return undefined;
}

let checks = 0;

async function main(): Promise<void> {
  const started = performance.now();
  const drift = policyDrift();
  if (drift) {
    console.log(`verify-id-resolution: fail\n${drift}`);
    process.exitCode = 1;
    return;
  }
  const failure =
    fixedProbes() ||
    payloadProbes() ||
    checkGrid('player', shapesFor(IDS, NAMES, undefined), QUERIES, 3, 'poi') ||
    checkGrid('package', shapesFor(IDS, NAMES, undefined), QUERIES, 3, 'player') ||
    checkGrid('system', shapesFor(IDS, NAMES, undefined), QUERIES, 3, 'player') ||
    checkGrid('system', shapesFor(POI_IDS, POI_NAMES, BASES), POI_QUERIES, 2, 'player') ||
    checkGrid('poi', shapesFor(POI_IDS, POI_NAMES, BASES), POI_QUERIES, 3, 'player');
  if (failure) {
    console.log(`verify-id-resolution: fail\n${failure}`);
    process.exitCode = 1;
    return;
  }
  const elapsed = Math.round(performance.now() - started);
  console.log(
    [
      'verify-id-resolution: pass',
      'property: a typed id is rewritten only when exactly one cached entity of that kind matches. Two matches stay ambiguous, and the command is not given either id.',
      `checks: ${checks}`,
      'bound: 3 hints with ids {a, ab, b, a_b} and names {empty, a, a-b, x}; poi triples also use ids {a, ab, a_b}, names {empty, a, a-b}, base_id {none, a, a_b}; system base_id is every pair of those poi shapes',
      `elapsed_ms: ${elapsed}`,
    ].join('\n'),
  );
}

await main();
