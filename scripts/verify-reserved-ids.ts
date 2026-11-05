#!/usr/bin/env bun
/**
 * Check one promise of preparePayload:
 *
 * Reserved storage targets, fuel, tank_fuel, credits on the credit commands,
 * and numeric jump bearings are never replaced by a cached id. claim_prize
 * and service_prize send a station field as the cached POI base id when the
 * hint has one.
 *
 * Run: bun run verify:reserved-ids
 *
 * Nothing model-checks TypeScript. This is not a model of preparePayload.
 * Every probe calls the real function. resolveCachedId is used only to prove
 * the cache would have changed the wire, so a removed bypass cannot pass quietly.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeParsedPayload } from '../src/args.ts';
import { COMMANDS } from '../src/commands.ts';
import {
  type IdHint,
  type IdKind,
  idKindForCommandField,
  resolveCachedId,
  STRICT_ID_RESOLUTION_POLICY,
  softIdResolutionPolicy,
} from '../src/id-cache.ts';
import { preparePayload } from '../src/payload.ts';
import type { GlobalOptions } from '../src/types.ts';

const PAYLOAD_PATH = fileURLToPath(new URL('../src/payload.ts', import.meta.url));
// Grouped commands (storage deposit, faction deposit_credits) are not flat entries
// in the default registry. The handler passes the flat action config, which is COMMANDS.
const FLAT_REGISTRY = { commands: COMMANDS };
const SEEN_AT = '2026-05-18T00:00:00.000Z';
const FUEL_WORDS = ['fuel', 'Fuel', 'FUEL', ' fuel ', 'tank_fuel', 'Tank_Fuel', 'TANK_FUEL', ' tank_fuel '] as const;
const CREDIT_WORDS = ['credits', 'Credits', 'CREDITS', ' credits '] as const;
const CREDIT_COMMANDS = [
  'storage_deposit',
  'storage_withdraw',
  'faction_deposit_credits',
  'faction_withdraw_credits',
] as const;
const JUMP_WORDS = [
  '0',
  '-0',
  '00',
  '90',
  '-1',
  '-90',
  '+90',
  '  +90  ',
  '90.0',
  '90.5',
  '.5',
  '5.',
  '1e2',
  '1E2',
  '1e-2',
  '1.5e1',
  '0x10',
  '0X10',
  '  90  ',
  '\t90\n',
  '9007199254740993',
] as const;
const STORAGE_TAILS = [
  '',
  'a',
  'smc',
  'voss',
  'earth_station',
  'Earth_Station',
  'Explorer',
  'grand_exchange_station',
] as const;
const STORAGE_NOTE = 'storage deposit target must stay the reserved text, not a cached player id.';
const JUMP_NOTE = 'jump must send the trimmed bearing, not a cached system id.';
const FUEL_NOTE = 'fuel and tank_fuel must be sent as fuel, not a cached item id.';
const CREDITS_NOTE = 'credits must stay credits on this command, not a cached item id.';
const PRIZE_NOTE = 'the prize station field must be the cached POI base id, not the POI id.';
const POLICIES = [false, true] as const;

interface ItemCommand {
  command: string;
  inputKey: string;
  extra?: Record<string, unknown>;
}

const ITEM_COMMANDS: ItemCommand[] = [
  { command: 'sell', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'buy', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'use_item', inputKey: 'item_id' },
  { command: 'jettison', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'storage_jettison', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'storage_deposit', inputKey: 'item_id', extra: { quantity: '1', target: 'self' } },
  { command: 'storage_withdraw', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'storage_loot', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'loot_wreck', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'create_sell_order', inputKey: 'item_id', extra: { quantity: '1', price_each: '1' } },
  { command: 'create_buy_order', inputKey: 'item_id', extra: { quantity: '1', price_each: '1' } },
  { command: 'faction_create_sell_order', inputKey: 'item_id', extra: { quantity: '1', price_each: '1' } },
  { command: 'faction_create_buy_order', inputKey: 'item_id', extra: { quantity: '1', price_each: '1' } },
  { command: 'load_drone', inputKey: 'drone_item_id' },
  { command: 'reload', inputKey: 'ammo_item_id', extra: { weapon_instance_id: 'weapon-1' } },
  { command: 'faction_deposit_credits', inputKey: 'item_id', extra: { quantity: '1' } },
  { command: 'faction_withdraw_credits', inputKey: 'item_id', extra: { quantity: '1' } },
];

type CatchMode = 'bypass' | 'base-id' | 'resolves' | 'ambiguous';

interface Catch {
  kind: IdKind;
  query: string;
  mode: CatchMode;
  wire?: unknown;
}

interface Probe {
  label: string;
  tag: string;
  command: string;
  payload: Record<string, unknown>;
  fuzzy: boolean;
  note: string;
  catches: Catch[];
  expect: 'wire' | 'exit';
  read?: (payload: Record<string, unknown>) => unknown;
  expected?: unknown;
  stderrIncludes?: string;
}

interface Phase {
  name: string;
  hints: IdHint[];
  probes: Probe[];
}

interface Suite {
  phases: Phase[];
  empireAliases: string[];
  storageWords: number;
  jumpWords: number;
  fuelWords: number;
  creditWords: number;
}

function options(fuzzyIds: boolean): GlobalOptions {
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

function show(value: unknown): string {
  if (value === undefined) return 'undefined';
  const text = JSON.stringify(value);
  return text === undefined ? 'undefined' : text;
}

function same(actual: unknown, expected: unknown): boolean {
  return show(actual) === show(expected);
}

function normalizeSearchText(value: string): string {
  // Same replacements as normalizeSearchText in src/id-cache.ts.
  // A stored hint name is normalized again, so the name has to be the typed
  // sample. A leading hyphen becomes a leading space ("-0" → " 0"), and
  // storing that space would trim back to "0" on the second pass.
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

interface KeySample {
  kind: IdKind;
  key: string;
  sample: string;
}

function samplesFor(words: readonly string[], kind: IdKind): KeySample[] {
  const byKey = new Map<string, KeySample>();
  for (const word of words) {
    const sample = word.trim();
    const key = normalizeSearchText(sample);
    if (!key) throw new Error(`empty lookup for ${show(word)}`);
    if (!byKey.has(key)) byKey.set(key, { kind, key, sample });
  }
  return [...byKey.values()];
}

function hint(kind: IdKind, id: string, name?: string, context?: Record<string, string>): IdHint {
  return {
    kind,
    id,
    ...(name ? { name } : {}),
    sourceCommand: 'probe',
    seenAt: SEEN_AT,
    ...(context ? { context } : {}),
  };
}

function policyFor(kind: IdKind, fuzzy: boolean) {
  return fuzzy ? softIdResolutionPolicy(kind) : STRICT_ID_RESOLUTION_POLICY;
}

function readEmpireAliases(source: string): string[] | string {
  const match = source.match(/const EMPIRE_RECIPIENT_ALIASES = new Set\(\[([\s\S]*?)\]\);/);
  if (!match?.[1]) return 'modeling error: EMPIRE_RECIPIENT_ALIASES was not found in src/payload.ts';
  const aliases = [...match[1].matchAll(/'([^']+)'/g)]
    .map((hit) => hit[1])
    .filter((alias): alias is string => Boolean(alias));
  if (aliases.length === 0) return 'modeling error: EMPIRE_RECIPIENT_ALIASES was empty';
  return aliases;
}

function sourceGuard(source: string): string | undefined {
  const required = [
    'function reservedIdValue(',
    'function isReservedStorageTarget(',
    'function isEmpireRecipientAlias(',
    'function isNumericJumpBearing(',
    'function resolvedStationBaseId(',
    'function resolveReloadWeaponsAmmo(',
    'function resolveCachedIdsForPayload(',
  ];
  const missing = required.filter((snippet) => !source.includes(snippet));
  if (missing.length === 0) return undefined;
  return `modeling error: src/payload.ts no longer contains ${missing.join(', ')}. Re-read the payload path before trusting this check.`;
}

function pinnedEmpireAlias(value: string, aliases: ReadonlySet<string>): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (normalized.startsWith('empire:')) return true;
  return aliases.has(normalized);
}

function pinnedStorageReserved(value: string, aliases: ReadonlySet<string>): boolean {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'self' ||
    normalized === 'faction' ||
    normalized === 'fixer:tab' ||
    normalized.startsWith('faction:') ||
    normalized.startsWith('station:') ||
    normalized.startsWith('pirate:')
  ) {
    return true;
  }
  return pinnedEmpireAlias(value, aliases);
}

function expectedStorageWire(value: string): string {
  if (value.trim().toLowerCase() === 'fixer:tab') return 'fixer:tab';
  return value.trim();
}

function pinnedNumericBearing(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return Number.isFinite(Number(trimmed));
}

function addDecorated(words: string[], value: string): void {
  words.push(value, value.toUpperCase(), ` ${value} `, `\t${value}\n`);
}

function unique(words: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const word of words) {
    if (seen.has(word)) continue;
    seen.add(word);
    result.push(word);
  }
  return result;
}

function storageWords(aliases: readonly string[]): string[] {
  const words: string[] = [];
  for (const base of ['self', 'faction', 'fixer:tab']) addDecorated(words, base);
  words.push('Fixer:TAB', ' Fixer:TAB ');
  for (const prefix of ['faction:', 'station:', 'pirate:']) {
    for (const tail of STORAGE_TAILS) addDecorated(words, `${prefix}${tail}`);
  }
  words.push('Station:Earth_Station', 'Station:Explorer', 'Pirate:Voss', 'Faction:SMC');
  for (const alias of aliases) {
    addDecorated(words, alias);
    if (alias.includes('_')) {
      const spaced = alias.replace(/_/g, ' ');
      const hyphened = alias.replace(/_/g, '-');
      addDecorated(words, spaced);
      addDecorated(words, hyphened);
      words.push(spaced.replace(/ /g, '  '));
      words.push(spaced.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()));
    }
    addDecorated(words, `empire:${alias}`);
  }
  words.push('empire:', 'Empire:Solarian', 'empire:not-in-the-set', 'empire:Outer Rim', 'Empire: Outer Rim');
  return unique(words);
}

function outputField(command: string, payload: Record<string, unknown>, inputKey: string): string {
  const normalized = normalizeParsedPayload(command, payload, FLAT_REGISTRY);
  const needle = payload[inputKey];
  if (Object.hasOwn(normalized, inputKey) && normalized[inputKey] === needle) return inputKey;
  for (const [key, value] of Object.entries(normalized)) {
    if (value === needle) return key;
  }
  throw new Error(`normalizeParsedPayload dropped ${command}.${inputKey}`);
}

function foreignId(kind: IdKind, key: string): string {
  if (kind === 'item' && key === 'credits') return 'credit_chit';
  if (kind === 'system') return `bearing:${key}`;
  if (kind === 'item') return `cached-item:${key}`;
  return `cached-player:${key}`;
}

function nameHints(groups: Array<{ kind: IdKind; words: readonly string[] }>): IdHint[] {
  const hints: IdHint[] = [];
  for (const group of groups) {
    for (const sample of samplesFor(group.words, group.kind)) {
      hints.push(hint(sample.kind, foreignId(sample.kind, sample.key), sample.sample));
    }
  }
  return hints;
}

function ambiguousHints(groups: Array<{ kind: IdKind; words: readonly string[] }>): IdHint[] {
  const hints: IdHint[] = [];
  for (const group of groups) {
    for (const sample of samplesFor(group.words, group.kind)) {
      hints.push(hint(sample.kind, foreignId(sample.kind, sample.key), sample.sample));
      hints.push(hint(sample.kind, sample.sample, `unrelated ${sample.sample}`));
    }
  }
  return hints;
}

function wireLabel(phase: string, command: string, inputKey: string, fuzzy: boolean, query: string): string {
  return `${phase} ${command} ${inputKey} ${fuzzy ? 'fuzzy' : 'strict'} ${show(query)}`;
}

function pushWire(
  probes: Probe[],
  args: {
    phase: string;
    tag: string;
    command: string;
    payload: Record<string, unknown>;
    inputKey: string;
    kind?: IdKind;
    skipKind?: boolean;
    fuzzy: boolean;
    expected: unknown;
    query: string;
    note: string;
    catchMode: CatchMode | 'none';
    catches?: Catch[];
    read?: (payload: Record<string, unknown>) => unknown;
  },
): string | undefined {
  let key: string;
  try {
    key = outputField(args.command, args.payload, args.inputKey);
  } catch (error) {
    return `modeling error: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (!args.skipKind) {
    if (!args.kind) return `modeling error: ${args.command}.${args.inputKey} has no expected id kind.`;
    const actualKind = idKindForCommandField(args.command, key);
    if (actualKind !== args.kind) {
      return `modeling error: ${args.command}.${args.inputKey} becomes ${key} (${actualKind ?? 'not an id field'}), not ${args.kind}. reservedIdValue would not see this string.`;
    }
  }
  const catches =
    args.catches ??
    (args.catchMode === 'none' || !args.kind
      ? []
      : [{ kind: args.kind, query: args.query, mode: args.catchMode, wire: args.expected }]);
  probes.push({
    label: wireLabel(args.phase, args.command, args.inputKey, args.fuzzy, args.query),
    tag: args.tag,
    command: args.command,
    payload: args.payload,
    fuzzy: args.fuzzy,
    note: args.note,
    catches,
    expect: 'wire',
    read: args.read ?? ((payload) => payload[key]),
    expected: args.expected,
  });
  return undefined;
}

function reservedGroups(words: readonly string[]): Array<{ kind: IdKind; words: readonly string[] }> {
  return [
    { kind: 'player', words },
    { kind: 'system', words: JUMP_WORDS },
    { kind: 'item', words: [...FUEL_WORDS, ...CREDIT_WORDS] },
  ];
}

function addReservedProbes(probes: Probe[], phase: string, storage: readonly string[]): string | undefined {
  for (const word of storage) {
    for (const fuzzy of POLICIES) {
      const failure = pushWire(probes, {
        phase,
        tag: 'storage',
        command: 'storage_deposit',
        payload: { target: word, credits: '1' },
        inputKey: 'target',
        kind: 'player',
        fuzzy,
        expected: expectedStorageWire(word),
        query: word,
        note: STORAGE_NOTE,
        catchMode: 'bypass',
      });
      if (failure) return failure;
    }
  }

  for (const word of [
    'self',
    'Fixer:TAB',
    'solarian',
    'outer rim',
    'station:earth_station',
    'empire:solarian',
    'pirate:voss',
  ]) {
    for (const fuzzy of POLICIES) {
      const failure = pushWire(probes, {
        phase,
        tag: 'storage',
        command: 'storage_deposit',
        payload: { recipient: word, credits: '1' },
        inputKey: 'recipient',
        kind: 'player',
        fuzzy,
        expected: expectedStorageWire(word),
        query: word,
        note: `${STORAGE_NOTE} recipient is an alias of target.`,
        catchMode: 'bypass',
      });
      if (failure) return failure;
    }
  }

  const targetArray = ['self', 'Solarian', 'fixer:tab', ' outer rim ', 'Fixer:TAB'];
  const targetExpected = targetArray.map((word) => expectedStorageWire(word));
  for (const fuzzy of POLICIES) {
    const failure = pushWire(probes, {
      phase,
      tag: 'storage',
      command: 'storage_deposit',
      payload: { target: targetArray, credits: '1' },
      inputKey: 'target',
      kind: 'player',
      fuzzy,
      expected: targetExpected,
      query: 'target array',
      note: `${STORAGE_NOTE} Each array element is reserved on its own.`,
      catchMode: 'none',
      catches: targetArray.map((word, index) => ({
        kind: 'player' as const,
        query: word,
        mode: 'bypass' as const,
        wire: targetExpected[index],
      })),
    });
    if (failure) return failure;
  }

  for (const word of JUMP_WORDS) {
    for (const inputKey of ['target_system', 'id'] as const) {
      for (const fuzzy of POLICIES) {
        const failure = pushWire(probes, {
          phase,
          tag: 'jump',
          command: 'jump',
          payload: { [inputKey]: word },
          inputKey,
          kind: 'system',
          fuzzy,
          expected: word.trim(),
          query: word,
          note: JUMP_NOTE,
          catchMode: 'bypass',
        });
        if (failure) return failure;
      }
    }
  }

  for (const spec of ITEM_COMMANDS) {
    for (const word of FUEL_WORDS) {
      for (const fuzzy of POLICIES) {
        const failure = pushWire(probes, {
          phase,
          tag: 'fuel',
          command: spec.command,
          payload: { ...spec.extra, [spec.inputKey]: word },
          inputKey: spec.inputKey,
          kind: 'item',
          fuzzy,
          expected: 'fuel',
          query: word,
          note: FUEL_NOTE,
          catchMode: 'bypass',
        });
        if (failure) return failure;
      }
    }
  }

  const fuelArray = ['fuel', 'tank_fuel', 'Fuel', ' tank_fuel '];
  for (const fuzzy of POLICIES) {
    const failure = pushWire(probes, {
      phase,
      tag: 'fuel',
      command: 'sell',
      payload: { item_id: fuelArray, quantity: '1' },
      inputKey: 'item_id',
      kind: 'item',
      fuzzy,
      expected: ['fuel', 'fuel', 'fuel', 'fuel'],
      query: 'item array',
      note: `${FUEL_NOTE} Each array element is reserved on its own.`,
      catchMode: 'none',
      catches: fuelArray.map((word) => ({ kind: 'item' as const, query: word, mode: 'bypass' as const, wire: 'fuel' })),
    });
    if (failure) return failure;
  }

  for (const command of CREDIT_COMMANDS) {
    const spec = ITEM_COMMANDS.find((item) => item.command === command);
    if (!spec) return `modeling error: ${command} is missing from the item command list`;
    for (const word of CREDIT_WORDS) {
      for (const fuzzy of POLICIES) {
        const failure = pushWire(probes, {
          phase,
          tag: spec.command === 'storage_deposit' ? 'credits' : 'credits',
          command: spec.command,
          payload: { ...spec.extra, [spec.inputKey]: word },
          inputKey: spec.inputKey,
          kind: 'item',
          fuzzy,
          expected: 'credits',
          query: word,
          note: CREDITS_NOTE,
          catchMode: 'bypass',
        });
        if (failure) return failure;
      }
    }
  }

  for (const fuzzy of POLICIES) {
    const failure = pushWire(probes, {
      phase,
      tag: 'reload',
      command: 'reload',
      payload: {
        weapons: [
          { weapon_instance_id: 'weapon-1', ammo_item_id: 'tank_fuel' },
          { weapon_instance_id: 'weapon-2', ammo_item_id: 'fuel' },
        ],
      },
      inputKey: 'weapons',
      skipKind: true,
      fuzzy,
      expected: ['fuel', 'fuel'],
      query: 'weapons ammo',
      note: `${FUEL_NOTE} reload weapons[].ammo_item_id uses the item rule.`,
      catchMode: 'none',
      catches: [
        { kind: 'item', query: 'tank_fuel', mode: 'bypass', wire: 'fuel' },
        { kind: 'item', query: 'fuel', mode: 'bypass', wire: 'fuel' },
      ],
      read: (payload) => ammoList(payload),
    });
    if (failure) return failure;
  }

  return undefined;
}

function ammoList(payload: Record<string, unknown>): unknown {
  const weapons = payload.weapons;
  if (!Array.isArray(weapons)) return undefined;
  return weapons.map((entry) => {
    if (typeof entry !== 'object' || entry === null) return entry;
    return (entry as Record<string, unknown>).ammo_item_id;
  });
}

function addNameOnlyProbes(probes: Probe[], phase: string): string | undefined {
  if (idKindForCommandField('reload', 'ammo_item_id') !== 'item') {
    return 'modeling error: reload.ammo_item_id is not an item field, so resolveReloadWeaponsAmmo is not on the reserved item path.';
  }

  for (const fuzzy of POLICIES) {
    const failure = pushWire(probes, {
      phase,
      tag: 'reload',
      command: 'reload',
      payload: {
        weapons: [
          { weapon_instance_id: 'weapon-1', ammo_item_id: 'tank_fuel' },
          { weapon_instance_id: 'weapon-2', ammo_item_id: 'Laser Cell' },
          { weapon_instance_id: 'weapon-3', ammo_item_id: ' fuel ' },
        ],
      },
      inputKey: 'weapons',
      skipKind: true,
      fuzzy,
      expected: ['fuel', 'laser_cell', 'fuel'],
      query: 'weapons ammo and laser',
      note: 'reload weapons[].ammo_item_id keeps fuel and still resolves a unique ammo name.',
      catchMode: 'none',
      catches: [
        { kind: 'item', query: 'tank_fuel', mode: 'bypass', wire: 'fuel' },
        { kind: 'item', query: 'Laser Cell', mode: 'resolves', wire: 'laser_cell' },
        { kind: 'item', query: ' fuel ', mode: 'bypass', wire: 'fuel' },
      ],
      read: (payload) => ammoList(payload),
    });
    if (failure) return failure;
  }

  const failure = pushWire(probes, {
    phase,
    tag: 'reload',
    command: 'reload',
    payload: {
      weapons:
        '[{"weapon_instance_id":"weapon-1","ammo_item_id":"Tank_Fuel"},{"weapon_instance_id":"weapon-2","ammo_item_id":" fuel "}]',
    },
    inputKey: 'weapons',
    skipKind: true,
    fuzzy: false,
    expected: ['fuel', 'fuel'],
    query: 'weapons json',
    note: 'A weapons JSON string is parsed, then each ammo_item_id still keeps fuel.',
    catchMode: 'none',
    catches: [
      { kind: 'item', query: 'Tank_Fuel', mode: 'bypass', wire: 'fuel' },
      { kind: 'item', query: ' fuel ', mode: 'bypass', wire: 'fuel' },
    ],
    read: (payload) => ammoList(payload),
  });
  if (failure) return failure;

  for (const fuzzy of POLICIES) {
    probes.push({
      label: wireLabel(phase, 'reload', 'weapons[0].ammo_item_id', fuzzy, 'iron'),
      tag: 'reload',
      command: 'reload',
      payload: {
        weapons: [
          { weapon_instance_id: 'weapon-1', ammo_item_id: 'iron' },
          { weapon_instance_id: 'weapon-2', ammo_item_id: 'Laser Cell' },
        ],
      },
      fuzzy,
      note: 'An ambiguous reload ammo item does not send either cached id.',
      catches: [{ kind: 'item', query: 'iron', mode: 'ambiguous' }],
      expect: 'exit',
      stderrIncludes: 'weapons[0].ammo_item_id',
    });
  }

  const prizeQueries = [
    { query: 'Earth', fuzzyOnly: false, catch: true },
    { query: 'earth', fuzzyOnly: false, catch: true },
    { query: 'EARTH', fuzzyOnly: false, catch: true },
    { query: 'sol_earth', fuzzyOnly: false, catch: true },
    { query: 'SOL_EARTH', fuzzyOnly: false, catch: true },
    { query: 'Earth_Station', fuzzyOnly: false, catch: true },
    // Trimmed exact base id is already what resolveCachedId returns, so this does not catch a missing rewrite.
    { query: ' earth_station ', fuzzyOnly: false, catch: false },
    { query: 'Ear', fuzzyOnly: true, catch: true },
    { query: 'ear', fuzzyOnly: true, catch: true },
    { query: 'sol', fuzzyOnly: true, catch: true },
    { query: 'sol_e', fuzzyOnly: true, catch: true },
  ];
  for (const command of ['claim_prize', 'service_prize'] as const) {
    for (const inputKey of ['destination_base_id', 'target'] as const) {
      for (const prize of prizeQueries) {
        for (const fuzzy of POLICIES) {
          if (prize.fuzzyOnly && !fuzzy) continue;
          const extra =
            command === 'service_prize'
              ? { prize_id: 'prize-1', action: 'redirect', [inputKey]: prize.query }
              : { prize_id: 'prize-1', [inputKey]: prize.query };
          const built = pushWire(probes, {
            phase,
            tag: 'prize',
            command,
            payload: extra,
            inputKey,
            kind: 'poi',
            fuzzy,
            expected: 'earth_station',
            query: prize.query,
            note: prize.catch
              ? PRIZE_NOTE
              : 'Trimmed exact base id is sent as that base id. This spelling does not catch a missing rewrite.',
            catchMode: prize.catch ? 'base-id' : 'none',
          });
          if (built) return built;
        }
      }
      for (const fuzzy of POLICIES) {
        const queries = ['Earth', 'sol_earth', 'Earth_Station'];
        const extra =
          command === 'service_prize'
            ? { prize_id: 'prize-1', action: 'redirect', [inputKey]: queries }
            : { prize_id: 'prize-1', [inputKey]: queries };
        const built = pushWire(probes, {
          phase,
          tag: 'prize',
          command,
          payload: extra,
          inputKey,
          kind: 'poi',
          fuzzy,
          expected: ['earth_station', 'earth_station', 'earth_station'],
          query: 'station array',
          note: `${PRIZE_NOTE} Each array element uses the hint base id.`,
          catchMode: 'none',
          catches: queries.map((query) => ({
            kind: 'poi' as const,
            query,
            mode: 'base-id' as const,
            wire: 'earth_station',
          })),
        });
        if (built) return built;
      }
    }
  }

  for (const fuzzy of POLICIES) {
    const nova = pushWire(probes, {
      phase,
      tag: 'prize',
      command: 'claim_prize',
      payload: { prize_id: 'prize-1', destination_base_id: 'Nova' },
      inputKey: 'destination_base_id',
      kind: 'poi',
      fuzzy,
      expected: 'nova',
      query: 'Nova',
      note: 'A prize POI with no base_id is sent as the POI id.',
      catchMode: 'resolves',
    });
    if (nova) return nova;
    const travel = pushWire(probes, {
      phase,
      tag: 'boundary',
      command: 'travel',
      payload: { target_poi: 'Earth' },
      inputKey: 'target_poi',
      kind: 'poi',
      fuzzy,
      expected: 'sol_earth',
      query: 'Earth',
      note: 'travel keeps the POI id. The prize base-id rewrite is only claim_prize and service_prize.',
      catchMode: 'resolves',
    });
    if (travel) return travel;
  }
  const travelPrefix = pushWire(probes, {
    phase,
    tag: 'boundary',
    command: 'travel',
    payload: { target_poi: 'Ear' },
    inputKey: 'target_poi',
    kind: 'poi',
    fuzzy: true,
    expected: 'sol_earth',
    query: 'Ear',
    note: 'A fuzzy travel prefix stays the POI id, not the station base id.',
    catchMode: 'resolves',
  });
  if (travelPrefix) return travelPrefix;

  const boundaries: Array<{
    command: string;
    inputKey: string;
    kind: IdKind;
    query: string;
    expected: string;
    extra?: Record<string, unknown>;
    note: string;
    tag: string;
  }> = [
    {
      command: 'storage_deposit',
      inputKey: 'target',
      kind: 'player',
      query: 'pirate',
      expected: 'player-pirate',
      extra: { credits: '1' },
      note: 'Bare pirate is not a reserved target. It resolves to the cached player.',
      tag: 'boundary',
    },
    {
      command: 'storage_deposit',
      inputKey: 'target',
      kind: 'player',
      query: 'fixer:tab:extra',
      expected: 'player-fixer-extra',
      extra: { credits: '1' },
      note: 'fixer:tab:extra is not the reserved fixer:tab token. It resolves to the cached player.',
      tag: 'boundary',
    },
    {
      command: 'jump',
      inputKey: 'target_system',
      kind: 'system',
      query: 'haven',
      expected: 'crosshaven',
      note: 'haven is not a numeric bearing. jump sends the cached system id.',
      tag: 'boundary',
    },
    {
      command: 'jump',
      inputKey: 'target_system',
      kind: 'system',
      query: '90a',
      expected: 'sys-90a',
      note: '90a is not a finite number. jump sends the cached system id.',
      tag: 'boundary',
    },
    {
      command: 'jump',
      inputKey: 'target_system',
      kind: 'system',
      query: 'Infinity',
      expected: 'sys-infinity',
      note: 'Infinity is not a finite bearing. jump sends the cached system id.',
      tag: 'boundary',
    },
    {
      command: 'sell',
      inputKey: 'item_id',
      kind: 'item',
      query: 'credits',
      expected: 'credit_chit',
      extra: { quantity: '1' },
      note: 'credits on sell is not reserved. It resolves to the cached item.',
      tag: 'boundary',
    },
    {
      command: 'buy',
      inputKey: 'item_id',
      kind: 'item',
      query: 'credits',
      expected: 'credit_chit',
      extra: { quantity: '1' },
      note: 'credits on buy is not reserved. It resolves to the cached item.',
      tag: 'boundary',
    },
  ];
  for (const boundary of boundaries) {
    for (const fuzzy of POLICIES) {
      const built = pushWire(probes, {
        phase,
        tag: boundary.tag,
        command: boundary.command,
        payload: { ...boundary.extra, [boundary.inputKey]: boundary.query },
        inputKey: boundary.inputKey,
        kind: boundary.kind,
        fuzzy,
        expected: boundary.expected,
        query: boundary.query,
        note: boundary.note,
        catchMode: 'resolves',
      });
      if (built) return built;
    }
  }
  return undefined;
}

function nameCacheExtras(): IdHint[] {
  return [
    hint('player', 'player-pirate', 'pirate'),
    hint('player', 'player-fixer-extra', 'fixer:tab:extra'),
    hint('system', 'crosshaven', 'Haven'),
    hint('system', 'sys-90a', '90a'),
    hint('system', 'sys-infinity', 'Infinity'),
    hint('poi', 'sol_earth', 'Earth', { base_id: 'earth_station' }),
    hint('poi', 'nova', 'Nova'),
    hint('item', 'ore_iron', 'Iron'),
    hint('item', 'iron_plate', 'Iron'),
    hint('item', 'laser_cell', 'Laser Cell'),
  ];
}

function addPrefixProbes(probes: Probe[], phase: string): string | undefined {
  const rows = ['station:e', 'station:earth', 'faction:s', 'pirate:vo', 'self', 'empire:sol'];
  for (const query of rows) {
    for (const fuzzy of POLICIES) {
      const failure = pushWire(probes, {
        phase,
        tag: 'prefix',
        command: 'storage_deposit',
        payload: { target: query, credits: '1' },
        inputKey: 'target',
        kind: 'player',
        fuzzy,
        expected: expectedStorageWire(query),
        query,
        note: fuzzy
          ? `${STORAGE_NOTE} The cached name only shares a prefix.`
          : 'Strict policy does not prefix-match, so this call does not catch a removed bypass. Fuzzy does.',
        catchMode: fuzzy ? 'bypass' : 'none',
      });
      if (failure) return failure;
    }
  }
  for (const fuzzy of POLICIES) {
    const failure = pushWire(probes, {
      phase,
      tag: 'prefix',
      command: 'jump',
      payload: { target_system: '90' },
      inputKey: 'target_system',
      kind: 'system',
      fuzzy,
      expected: '90',
      query: '90',
      note: fuzzy
        ? 'jump 90 must stay 90 when the only cached system is 90 Eridani.'
        : 'Strict policy does not prefix-match 90 Eridani, so this call does not catch a removed bypass.',
      catchMode: fuzzy ? 'bypass' : 'none',
    });
    if (failure) return failure;
  }
  return pushWire(probes, {
    phase,
    tag: 'boundary',
    command: 'storage_deposit',
    payload: { target: 'Marlowe', credits: '1' },
    inputKey: 'target',
    kind: 'player',
    fuzzy: false,
    expected: 'player-marlowe',
    query: 'Marlowe',
    note: 'The prefix cache is live: Marlowe still resolves.',
    catchMode: 'resolves',
  });
}

function prefixHints(): IdHint[] {
  return [
    hint('player', 'player-station-explorer', 'Station:Explorer'),
    hint('player', 'player-station-fan', 'station:earth_station_fan'),
    hint('player', 'player-faction-smc', 'faction:smc'),
    hint('player', 'player-pirate-vossren', 'pirate:vossren'),
    hint('player', 'player-selfish', 'selfish'),
    hint('player', 'player-empire-solarian', 'empire:solarian'),
    hint('player', 'player-marlowe', 'Marlowe'),
    hint('system', '90_eridani', '90 Eridani'),
  ];
}

function addCatalogProbes(probes: Probe[], phase: string): string | undefined {
  const commands: ItemCommand[] = [
    { command: 'sell', inputKey: 'item_id', extra: { quantity: '1' } },
    { command: 'buy', inputKey: 'item_id', extra: { quantity: '1' } },
    { command: 'storage_deposit', inputKey: 'item_id', extra: { quantity: '1', target: 'self' } },
    { command: 'reload', inputKey: 'ammo_item_id', extra: { weapon_instance_id: 'weapon-1' } },
  ];
  for (const spec of commands) {
    for (const fuzzy of POLICIES) {
      const fuel = pushWire(probes, {
        phase,
        tag: 'fuel',
        command: spec.command,
        payload: { ...spec.extra, [spec.inputKey]: 'fuel' },
        inputKey: spec.inputKey,
        kind: 'item',
        fuzzy,
        expected: 'fuel',
        query: 'fuel',
        note: fuzzy
          ? 'fuel must stay fuel when the cache has Fuel Cell, which soft item resolution would otherwise take as a substring.'
          : 'Strict policy does not substring-match Fuel Cell, so this call does not catch a removed bypass.',
        catchMode: fuzzy ? 'bypass' : 'none',
      });
      if (fuel) return fuel;
      const tank = pushWire(probes, {
        phase,
        tag: 'fuel',
        command: spec.command,
        payload: { ...spec.extra, [spec.inputKey]: 'tank_fuel' },
        inputKey: spec.inputKey,
        kind: 'item',
        fuzzy,
        expected: 'fuel',
        query: 'tank_fuel',
        note: 'tank_fuel must be sent as fuel even when Fuel Cell is the cached fuel item.',
        catchMode: 'bypass',
      });
      if (tank) return tank;
    }
  }
  const weapons = pushWire(probes, {
    phase,
    tag: 'reload',
    command: 'reload',
    payload: { weapons: [{ weapon_instance_id: 'weapon-1', ammo_item_id: 'fuel' }] },
    inputKey: 'weapons',
    skipKind: true,
    fuzzy: true,
    expected: ['fuel'],
    query: 'weapons fuel cell',
    note: 'reload weapons ammo fuel stays fuel when Fuel Cell is cached.',
    catchMode: 'none',
    catches: [{ kind: 'item', query: 'fuel', mode: 'bypass', wire: 'fuel' }],
    read: (payload) => ammoList(payload),
  });
  if (weapons) return weapons;
  return pushWire(probes, {
    phase,
    tag: 'boundary',
    command: 'sell',
    payload: { item_id: 'Fuel Cell', quantity: '1' },
    inputKey: 'item_id',
    kind: 'item',
    fuzzy: false,
    expected: 'fuel_cell',
    query: 'Fuel Cell',
    note: 'The Fuel Cell cache is live: that name still resolves.',
    catchMode: 'resolves',
  });
}

function catalogHints(): IdHint[] {
  return [hint('item', 'fuel_cell', 'Fuel Cell')];
}

function buildSuite(aliases: string[]): Suite | string {
  const storage = storageWords(aliases);
  const aliasSet = new Set(aliases);
  for (const word of storage) {
    if (!pinnedStorageReserved(word, aliasSet)) {
      return `modeling error: generated storage word ${show(word)} is not reserved by the pinned predicate.`;
    }
  }
  for (const word of JUMP_WORDS) {
    if (!pinnedNumericBearing(word)) return `modeling error: jump word ${show(word)} is not a finite Number().`;
  }
  if (samplesFor(storage, 'player').length === 0) return 'modeling error: storage words produced no cache keys.';

  const reservedWordGroups = reservedGroups(storage);
  const nameProbes: Probe[] = [];
  const idProbes: Probe[] = [];
  const prefixProbes: Probe[] = [];
  const catalogProbes: Probe[] = [];
  const nameFailure = addReservedProbes(nameProbes, 'name', storage) || addNameOnlyProbes(nameProbes, 'name');
  if (nameFailure) return nameFailure;
  const idFailure = addReservedProbes(idProbes, 'id', storage);
  if (idFailure) return idFailure;
  idProbes.push({
    label: 'id storage_deposit target strict "Marlowe"',
    tag: 'boundary',
    command: 'storage_deposit',
    payload: { target: 'Marlowe', credits: '1' },
    fuzzy: false,
    note: 'The id-collision cache is live: Marlowe still resolves.',
    catches: [{ kind: 'player', query: 'Marlowe', mode: 'resolves', wire: 'player-marlowe' }],
    expect: 'wire',
    read: (payload) => payload.target,
    expected: 'player-marlowe',
  });
  const prefixFailure = addPrefixProbes(prefixProbes, 'prefix');
  if (prefixFailure) return prefixFailure;
  const catalogFailure = addCatalogProbes(catalogProbes, 'catalog');
  if (catalogFailure) return catalogFailure;

  // Prize canaries sit in front of the name phase so a missing base_id rewrite fails on the first calls.
  const prizeFirst = nameProbes.filter(
    (probe) => probe.tag === 'prize' && probe.catches.some((item) => item.mode === 'base-id'),
  );
  const prizeRest = nameProbes.filter((probe) => !prizeFirst.includes(probe));
  const orderedName = [...prizeFirst.slice(0, 2), ...prizeRest, ...prizeFirst.slice(2)];

  return {
    empireAliases: aliases,
    storageWords: storage.length,
    jumpWords: JUMP_WORDS.length,
    fuelWords: FUEL_WORDS.length,
    creditWords: CREDIT_WORDS.length,
    phases: [
      { name: 'name', hints: [...nameHints(reservedWordGroups), ...nameCacheExtras()], probes: orderedName },
      {
        name: 'id',
        hints: [...ambiguousHints(reservedWordGroups), hint('player', 'player-marlowe', 'Marlowe')],
        probes: idProbes,
      },
      { name: 'prefix', hints: prefixHints(), probes: prefixProbes },
      { name: 'catalog', hints: catalogHints(), probes: catalogProbes },
    ],
  };
}

function describeResolved(hints: IdHint[], item: Catch, fuzzy: boolean): string {
  const resolved = resolveCachedId(item.kind, item.query, hints, policyFor(item.kind, fuzzy));
  if (resolved.type === 'resolved') {
    const base = resolved.hint.context?.base_id;
    const baseText = typeof base === 'string' && base ? ` base_id=${base}` : '';
    return `resolveCachedId ${show(resolved.value)} (${resolved.match}, hint ${resolved.hint.id}${baseText})`;
  }
  if (resolved.type === 'ambiguous') {
    return `resolveCachedId ambiguous ${resolved.matches
      .slice(0, 4)
      .map((match) => match.id)
      .join(', ')}`;
  }
  return `resolveCachedId unresolved ${show(resolved.value)}`;
}

function catchProblem(hints: IdHint[], item: Catch, fuzzy: boolean): string | undefined {
  const resolved = resolveCachedId(item.kind, item.query, hints, policyFor(item.kind, fuzzy));
  if (item.mode === 'ambiguous') {
    if (resolved.type === 'ambiguous') return undefined;
    return `modeling error: ${item.kind} ${show(item.query)} should be ambiguous and is ${describeResolved(hints, item, fuzzy)}.`;
  }
  if (item.mode === 'resolves') {
    if (resolved.type === 'resolved' && same(resolved.value, item.wire)) return undefined;
    return `modeling error: cache does not resolve ${item.kind} ${show(item.query)} to ${show(item.wire)}. ${describeResolved(hints, item, fuzzy)}.`;
  }
  if (item.mode === 'base-id') {
    if (resolved.type !== 'resolved') {
      return `modeling error: ${item.kind} ${show(item.query)} did not resolve, so the base-id rewrite cannot be seen. ${describeResolved(hints, item, fuzzy)}.`;
    }
    const base = resolved.hint.context?.base_id;
    if (base !== item.wire) {
      return `modeling error: matched ${resolved.hint.id} base_id=${show(base)}, not ${show(item.wire)}.`;
    }
    if (same(resolved.value, item.wire)) {
      return `modeling error: resolveCachedId already returns ${show(item.wire)} for ${show(item.query)}. Removing resolvedStationBaseId would not fail this probe.`;
    }
    return undefined;
  }
  const skipped =
    resolved.type === 'ambiguous' ? { exit: 1 } : resolved.type === 'resolved' ? resolved.value : item.query;
  if (same(skipped, item.wire)) {
    return `modeling error: without reservedIdValue, ${item.kind} ${show(item.query)} would already be ${show(item.wire)}. This probe cannot catch a removed bypass. ${describeResolved(hints, item, fuzzy)}.`;
  }
  return undefined;
}

function runProbe(sessionPath: string, hints: IdHint[], probe: Probe): string | undefined {
  for (const item of probe.catches) {
    const problem = catchProblem(hints, item, probe.fuzzy);
    if (problem) return `${probe.label}\n${problem}`;
  }
  const stderr: string[] = [];
  const writer = {
    out() {},
    err(message = '') {
      stderr.push(message);
    },
  };
  calls += 1;
  if (probe.catches.some((item) => item.mode === 'bypass' || item.mode === 'base-id')) catchingCalls += 1;
  const result = preparePayload(probe.command, probe.payload, options(probe.fuzzy), sessionPath, writer, FLAT_REGISTRY);
  if (probe.expect === 'exit') {
    if (result.type === 'exit' && result.exitCode === 1) {
      const err = stderr.join('\n');
      if (probe.stderrIncludes && !err.includes(probe.stderrIncludes)) {
        return `${probe.label}\nexpected stderr to mention ${probe.stderrIncludes}\nactual stderr: ${err || '(empty)'}\n${probe.note}`;
      }
      return undefined;
    }
    return `${probe.label}\nexpected exit 1\nactual ${result.type === 'exit' ? `exit ${result.exitCode}` : `payload ${show(result.payload)}`}\n${probe.note}`;
  }
  if (result.type !== 'payload' || !probe.read) {
    const detail = result.type === 'exit' ? `exit ${result.exitCode} ${stderr.join(' | ')}` : 'missing reader';
    const skipped = probe.catches.map((item) => describeResolved(hints, item, probe.fuzzy)).join('; ');
    return `${probe.label}\nexpected ${show(probe.expected)}\nactual ${detail}\n${skipped}\n${probe.note}`;
  }
  const actual = probe.read(result.payload);
  if (same(actual, probe.expected)) return undefined;
  const skipped = probe.catches.map((item) => describeResolved(hints, item, probe.fuzzy)).join('; ');
  return `${probe.label}\nexpected ${show(probe.expected)}\nactual ${show(actual)}\n${skipped}\n${probe.note}`;
}

function writeHints(sessionPath: string, hints: IdHint[]): void {
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  const cachePath = path.join(path.dirname(sessionPath), `${path.basename(sessionPath, '.json')}.ids.json`);
  fs.writeFileSync(cachePath, `${JSON.stringify({ version: 1, hints })}\n`);
}

let calls = 0;
let catchingCalls = 0;

function runSuite(suite: Suite): string | undefined {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-reserved-ids-'));
  const counts = new Map<string, number>();
  try {
    for (const phase of suite.phases) {
      const sessionPath = path.join(dir, `${phase.name}.json`);
      writeHints(sessionPath, phase.hints);
      for (const probe of phase.probes) {
        counts.set(probe.tag, (counts.get(probe.tag) ?? 0) + 1);
        const failure = runProbe(sessionPath, phase.hints, probe);
        if (failure) return failure;
      }
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  if (catchingCalls === 0) return 'modeling error: no probe can catch a removed bypass or a missing base-id rewrite.';
  passCounts = counts;
  return undefined;
}

let passCounts = new Map<string, number>();

function countLine(tag: string): string {
  return `${tag}: ${passCounts.get(tag) ?? 0}`;
}

async function main(): Promise<void> {
  const started = performance.now();
  const source = fs.readFileSync(PAYLOAD_PATH, 'utf8');
  const guard = sourceGuard(source);
  if (guard) {
    console.log(`verify-reserved-ids: fail\n${guard}`);
    process.exitCode = 1;
    return;
  }
  const aliases = readEmpireAliases(source);
  if (typeof aliases === 'string') {
    console.log(`verify-reserved-ids: fail\n${aliases}`);
    process.exitCode = 1;
    return;
  }
  const suite = buildSuite(aliases);
  if (typeof suite === 'string') {
    console.log(`verify-reserved-ids: fail\n${suite}`);
    process.exitCode = 1;
    return;
  }
  const failure = runSuite(suite);
  if (failure) {
    console.log(`verify-reserved-ids: fail\n${failure}`);
    process.exitCode = 1;
    return;
  }
  const elapsed = Math.round(performance.now() - started);
  console.log(
    [
      'verify-reserved-ids: pass',
      'property: reserved storage targets, fuel, tank_fuel, credits on the four credit commands, and numeric jump bearings are never replaced by a cached player, item, or system id. claim_prize and service_prize send a station field as the cached POI base id when the hint has one.',
      `preparePayload calls: ${calls}`,
      `catching calls: ${catchingCalls}`,
      `empire aliases: ${suite.empireAliases.length}`,
      `storage words: ${suite.storageWords}`,
      `jump words: ${suite.jumpWords}`,
      `fuel words: ${suite.fuelWords}`,
      `credit words: ${suite.creditWords}`,
      countLine('storage'),
      countLine('jump'),
      countLine('fuel'),
      countLine('credits'),
      countLine('prize'),
      countLine('reload'),
      countLine('prefix'),
      countLine('boundary'),
      `elapsed_ms: ${elapsed}`,
    ].join('\n'),
  );
}

await main();
