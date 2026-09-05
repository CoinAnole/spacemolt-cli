import type { ResultFormatter } from './helpers.ts';
import {
  c,
  commandNameEquals,
  emitLine,
  finiteNumber,
  isRecord,
  namedFormatter,
  printCompactTable,
} from './helpers.ts';

type ArenaChallengeInfo = {
  challenge_id: string;
  opponent_id: string;
  opponent_name: string;
  poi_id: string;
  max_side_size: number;
  expires_tick: number;
};

export type ArenaParticipant = {
  player_id: string;
  username: string;
  side_id: number;
};

export type ArenaEnemyLine = {
  name: string;
  ship_class: string;
  ship_class_name: string;
  count: number;
  is_boss: boolean;
};

export type ArenaRuleset = {
  max_side_size: number;
  allowed_cargo?: string[];
  allowed_damage_types?: string[];
  allowed_hull_classes?: string[];
  allowed_modules?: string[];
  allowed_ship_categories?: string[];
  allowed_ship_classes?: string[];
  banned_cargo?: string[];
  banned_effect_types?: string[];
  banned_hull_classes?: string[];
  banned_modules?: string[];
  banned_ship_categories?: string[];
  banned_ship_classes?: string[];
  max_crew?: number;
  max_marines?: number;
  max_ship_scale?: number;
  max_ship_tier?: number;
  min_ship_tier?: number;
  min_side_size?: number;
  no_ammo_weapons?: boolean;
  no_boarding?: boolean;
  no_cloak?: boolean;
  no_consumables?: boolean;
  no_drones?: boolean;
  no_tackle?: boolean;
  require_empty_cargo?: boolean;
};

export type ArenaTrial = {
  challenge_id: string;
  name: string;
  description: string;
  series: string;
  stage: number;
  poi_id: string;
  poi_name: string;
  at_this_arena: boolean;
  requires: string[];
  locked: boolean;
  rules: ArenaRuleset;
  enemies: ArenaEnemyLine[];
  wins: number;
};

export type TrialCatalog = {
  action: 'challenges';
  trials: ArenaTrial[];
};

export type TrialStart = {
  action: 'fight';
  challenge_id: string;
  name: string;
  battle_id: string;
  your_side: number;
  enemy_side: number;
  participants: ArenaParticipant[];
  enemies: ArenaEnemyLine[];
  message: string;
};

export type TrialReadiness =
  | { kind: 'ready' }
  | { kind: 'travel'; poi_name: string; poi_id: string }
  | { kind: 'locked'; needs: string[] };

export type SeriesSection = {
  series: string;
  poi_name: string;
  poi_id: string;
  here: boolean;
  trials: ArenaTrial[];
};

export type TrialLedger = {
  readyHere: number;
  travel: number;
  locked: number;
};

export type OtherSideLabel = 'opponent' | 'enemy';

type OptionalRuleKey = Exclude<keyof ArenaRuleset, 'max_side_size'>;
type NumericRuleKey =
  | 'min_side_size'
  | 'min_ship_tier'
  | 'max_ship_tier'
  | 'max_ship_scale'
  | 'max_crew'
  | 'max_marines';
type BooleanRuleKey =
  | 'no_ammo_weapons'
  | 'no_boarding'
  | 'no_cloak'
  | 'no_consumables'
  | 'no_drones'
  | 'no_tackle'
  | 'require_empty_cargo';
type StringListRuleKey = Exclude<OptionalRuleKey, NumericRuleKey | BooleanRuleKey>;

type HullAllowRuleKey = 'allowed_ship_categories' | 'allowed_hull_classes' | 'allowed_ship_classes';
type SpecialCasedRuleKey = 'allowed_damage_types' | 'min_ship_tier' | 'max_ship_tier' | 'max_ship_scale';
type RemainingNumericRuleKey = Exclude<NumericRuleKey, 'min_ship_tier' | 'max_ship_tier' | 'max_ship_scale'>;
type RemainingListRuleKey = Exclude<StringListRuleKey, HullAllowRuleKey | 'allowed_damage_types'>;

const HULL_ALLOW_RULES = [
  'allowed_ship_categories',
  'allowed_hull_classes',
  'allowed_ship_classes',
] as const satisfies readonly HullAllowRuleKey[];

const BOOLEAN_RULES = {
  no_drones: 'no drones',
  no_cloak: 'no cloak',
  no_boarding: 'no boarding',
  no_tackle: 'no tackle',
  no_consumables: 'no consumables',
  no_ammo_weapons: 'no ammo weapons',
  require_empty_cargo: 'empty cargo',
} as const satisfies Record<BooleanRuleKey, string>;

const REMAINING_NUMERIC_RULES = {
  max_crew: 'max crew',
  max_marines: 'max marines',
  min_side_size: 'min side',
} as const satisfies Record<RemainingNumericRuleKey, string>;

const REMAINING_LIST_RULES = {
  allowed_modules: 'only',
  allowed_cargo: 'only',
  banned_ship_categories: 'no',
  banned_hull_classes: 'no',
  banned_ship_classes: 'no',
  banned_effect_types: 'no',
  banned_modules: 'no',
  banned_cargo: 'no',
} as const satisfies Record<RemainingListRuleKey, 'only' | 'no'>;

type CoveredOptionalRuleKey =
  | (typeof HULL_ALLOW_RULES)[number]
  | SpecialCasedRuleKey
  | keyof typeof BOOLEAN_RULES
  | keyof typeof REMAINING_NUMERIC_RULES
  | keyof typeof REMAINING_LIST_RULES;
type _MissingOptionalRuleKey = Exclude<OptionalRuleKey, CoveredOptionalRuleKey>;
type _AssertOptionalRulesCovered = [_MissingOptionalRuleKey] extends [never] ? true : _MissingOptionalRuleKey;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isChallengeInfo(value: unknown): value is ArenaChallengeInfo {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.challenge_id) &&
    isNonEmptyString(value.opponent_id) &&
    isNonEmptyString(value.opponent_name) &&
    isNonEmptyString(value.poi_id) &&
    finiteNumber(value.max_side_size) !== undefined &&
    finiteNumber(value.expires_tick) !== undefined
  );
}

function isParticipant(value: unknown): value is ArenaParticipant {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.player_id) && isNonEmptyString(value.username) && finiteNumber(value.side_id) !== undefined
  );
}

export function isArenaEnemy(value: unknown): value is ArenaEnemyLine {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.ship_class) &&
    isNonEmptyString(value.ship_class_name) &&
    finiteNumber(value.count) !== undefined &&
    typeof value.is_boss === 'boolean'
  );
}

export function isArenaRules(value: unknown): value is ArenaRuleset {
  if (!isRecord(value)) return false;
  return finiteNumber(value.max_side_size) !== undefined;
}

export function isArenaTrial(value: unknown): value is ArenaTrial {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.challenge_id) &&
    isNonEmptyString(value.name) &&
    typeof value.description === 'string' &&
    isNonEmptyString(value.series) &&
    finiteNumber(value.stage) !== undefined &&
    isNonEmptyString(value.poi_id) &&
    isNonEmptyString(value.poi_name) &&
    typeof value.at_this_arena === 'boolean' &&
    Array.isArray(value.requires) &&
    value.requires.every((id) => typeof id === 'string') &&
    typeof value.locked === 'boolean' &&
    isArenaRules(value.rules) &&
    Array.isArray(value.enemies) &&
    value.enemies.every(isArenaEnemy) &&
    finiteNumber(value.wins) !== undefined
  );
}

export function asTrialCatalog(value: unknown): TrialCatalog | undefined {
  if (!isRecord(value) || value.action !== 'challenges') return undefined;
  if (!Array.isArray(value.challenges) || !value.challenges.every(isArenaTrial)) return undefined;
  return { action: 'challenges', trials: value.challenges };
}

export function asTrialStart(value: unknown): TrialStart | undefined {
  if (!isRecord(value) || value.action !== 'fight') return undefined;
  if (!isNonEmptyString(value.challenge_id) || !isNonEmptyString(value.name)) return undefined;
  if (!isNonEmptyString(value.battle_id) || !isNonEmptyString(value.message)) return undefined;
  const yourSide = finiteNumber(value.your_side);
  const enemySide = finiteNumber(value.enemy_side);
  if (yourSide === undefined || enemySide === undefined) return undefined;
  if (!Array.isArray(value.participants) || !value.participants.every(isParticipant)) return undefined;
  if (!Array.isArray(value.enemies) || !value.enemies.every(isArenaEnemy)) return undefined;
  return {
    action: 'fight',
    challenge_id: value.challenge_id,
    name: value.name,
    battle_id: value.battle_id,
    your_side: yourSide,
    enemy_side: enemySide,
    participants: value.participants,
    enemies: value.enemies,
    message: value.message,
  };
}

export function trialReadiness(trial: ArenaTrial, namesById: ReadonlyMap<string, string>): TrialReadiness {
  if (trial.locked) {
    return {
      kind: 'locked',
      needs: trial.requires.map((id) => namesById.get(id) ?? id),
    };
  }
  if (trial.at_this_arena) return { kind: 'ready' };
  return { kind: 'travel', poi_name: trial.poi_name, poi_id: trial.poi_id };
}

export function trialNameIndex(trials: readonly ArenaTrial[]): Map<string, string> {
  return new Map(trials.map((trial) => [trial.challenge_id, trial.name]));
}

export function groupTrialsBySeries(trials: readonly ArenaTrial[]): SeriesSection[] {
  const sections: SeriesSection[] = [];
  for (const trial of trials) {
    const last = sections[sections.length - 1];
    if (last && last.series === trial.series) {
      last.trials.push(trial);
      if (trial.at_this_arena) last.here = true;
      continue;
    }
    sections.push({
      series: trial.series,
      poi_name: trial.poi_name,
      poi_id: trial.poi_id,
      here: trial.at_this_arena,
      trials: [trial],
    });
  }
  return sections;
}

export function countLedger(trials: readonly ArenaTrial[], namesById: ReadonlyMap<string, string>): TrialLedger {
  const ledger: TrialLedger = { readyHere: 0, travel: 0, locked: 0 };
  for (const trial of trials) {
    const readiness = trialReadiness(trial, namesById);
    if (readiness.kind === 'locked') ledger.locked += 1;
    else if (readiness.kind === 'travel') ledger.travel += 1;
    else if (trial.wins === 0) ledger.readyHere += 1;
  }
  return ledger;
}

export function suggestedFight(trials: readonly ArenaTrial[]): ArenaTrial | undefined {
  const unlocked = trials.filter((trial) => !trial.locked);
  return (
    unlocked.find((trial) => trial.at_this_arena && trial.wins === 0) ??
    unlocked.find((trial) => trial.wins === 0) ??
    unlocked.find((trial) => trial.at_this_arena) ??
    unlocked[0]
  );
}

export function formatEnemyDigest(enemies: readonly ArenaEnemyLine[]): string {
  return enemies
    .map((enemy) => {
      if (enemy.count === 1 && enemy.is_boss) return `${enemy.name} (boss, ${enemy.ship_class_name})`;
      return `${enemy.count}× ${enemy.name} (${enemy.ship_class_name})`;
    })
    .join(' · ');
}

function activeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.length === 0) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return items.length > 0 ? items : undefined;
}

function activeCap(value: unknown): number | undefined {
  const size = finiteNumber(value);
  if (size === undefined || size === 0) return undefined;
  return size;
}

export function formatRuleDigest(rules: ArenaRuleset): string {
  const tokens: string[] = [];
  const sideSize = formatArenaSideSize(rules.max_side_size);
  if (sideSize) tokens.push(sideSize);

  for (const key of HULL_ALLOW_RULES) {
    const list = activeStringList(rules[key]);
    if (list) tokens.push(list.join(', '));
  }

  const damage = activeStringList(rules.allowed_damage_types);
  if (damage) tokens.push(damage.length === 1 ? `${damage[0]} only` : `only ${damage.join(', ')}`);

  const minTier = activeCap(rules.min_ship_tier);
  const maxTier = activeCap(rules.max_ship_tier);
  if (minTier !== undefined && maxTier !== undefined) tokens.push(`tier ${minTier}–${maxTier}`);
  else if (maxTier !== undefined) tokens.push(`max tier ${maxTier}`);
  else if (minTier !== undefined) tokens.push(`min tier ${minTier}`);

  const maxScale = activeCap(rules.max_ship_scale);
  if (maxScale !== undefined) tokens.push(`max scale ${maxScale}`);

  for (const key of Object.keys(BOOLEAN_RULES) as BooleanRuleKey[]) {
    if (rules[key] === true) tokens.push(BOOLEAN_RULES[key]);
  }

  for (const key of Object.keys(REMAINING_NUMERIC_RULES) as RemainingNumericRuleKey[]) {
    const cap = activeCap(rules[key]);
    if (cap !== undefined) tokens.push(`${REMAINING_NUMERIC_RULES[key]} ${cap}`);
  }

  for (const key of Object.keys(REMAINING_LIST_RULES) as RemainingListRuleKey[]) {
    const list = activeStringList(rules[key]);
    if (!list) continue;
    const kind = REMAINING_LIST_RULES[key];
    tokens.push(kind === 'only' ? `only ${list.join(', ')}` : `no ${list.join(', ')}`);
  }

  return tokens.join(' · ');
}

export function formatStatusLabel(readiness: TrialReadiness): 'READY' | 'TRAVEL' | 'LOCKED' {
  if (readiness.kind === 'ready') return 'READY';
  if (readiness.kind === 'travel') return 'TRAVEL';
  return 'LOCKED';
}

function trialRowBadge(trial: ArenaTrial, readiness: TrialReadiness): string {
  if (readiness.kind === 'locked') {
    return readiness.needs.length > 0 ? `needs ${readiness.needs.join(', ')}` : '';
  }
  if (trial.wins === 1) return '1 win';
  if (trial.wins > 1) return `${trial.wins} wins`;
  return '';
}

export function emitArenaParticipants(
  participants: readonly ArenaParticipant[],
  yourSide: number,
  otherLabel: OtherSideLabel,
): void {
  const yoursCount = participants.filter((row) => row.side_id === yourSide).length;
  const rows = [...participants]
    .sort((left, right) => left.side_id - right.side_id || left.username.localeCompare(right.username))
    .map((row) => ({
      side_id: row.side_id,
      team: row.side_id === yourSide ? 'yours' : otherLabel,
      username: yoursCount === 1 && row.side_id === yourSide ? `${row.username} (you)` : row.username,
      player_id: row.player_id,
    }));

  printCompactTable('Participants', rows, [
    ['Side', ['side_id']],
    ['Team', ['team']],
    ['Pilot', ['username']],
    ['Player ID', ['player_id']],
  ]);
}

export function emitTrialStart(start: TrialStart): void {
  const heading = `Trial started: ${start.name}`;
  emitLine('');
  emitLine(`${c.bright}=== ${heading} ===${c.reset}`);
  emitLine(`Battle: ${start.battle_id}   Challenge: ${start.challenge_id}`);
  emitLine(`Your side: ${start.your_side}   Enemy side: ${start.enemy_side}`);
  const enemies = formatEnemyDigest(start.enemies);
  if (enemies) emitLine(`Enemies: ${enemies}`);
  if (start.message && start.message !== heading && start.message !== `=== ${heading} ===`) {
    emitLine(start.message);
  }
}

export function emitTrialCatalog(trials: readonly ArenaTrial[]): void {
  emitLine(`\n${c.bright}=== NPC Trials ===${c.reset}`);
  if (trials.length === 0) {
    emitLine('No NPC trials defined.');
    return;
  }

  const namesById = trialNameIndex(trials);
  const ledger = countLedger(trials, namesById);
  emitLine(`Ready here: ${ledger.readyHere}   Travel: ${ledger.travel}   Locked: ${ledger.locked}`);

  const nameWidth = Math.max(...trials.map((trial) => trial.name.length));
  const idWidth = Math.max(...trials.map((trial) => trial.challenge_id.length));
  const briefingPad = ' '.repeat(13);

  for (const section of groupTrialsBySeries(trials)) {
    emitLine('');
    emitLine(`${section.series}  @ ${section.poi_name}  — ${section.here ? 'you are here' : 'travel here'}`);
    for (const trial of section.trials) {
      const readiness = trialReadiness(trial, namesById);
      const badge = trialRowBadge(trial, readiness);
      const poiNote = trial.poi_name !== section.poi_name ? `@ ${trial.poi_name}` : '';
      const extras = [badge, poiNote].filter(Boolean).join('  ');
      const id = extras ? trial.challenge_id.padEnd(idWidth) : trial.challenge_id;
      emitLine(
        `  ${formatStatusLabel(readiness).padEnd(6)} ${String(trial.stage).padStart(2)}  ${trial.name.padEnd(nameWidth)}  ${id}${extras ? `  ${extras}` : ''}`,
      );
      if (readiness.kind === 'locked') continue;
      const briefing = [formatEnemyDigest(trial.enemies), formatRuleDigest(trial.rules)].filter(Boolean).join(' · ');
      if (briefing) emitLine(`${briefingPad}${briefing}`);
    }
  }

  emitLine('');
  const next = suggestedFight(trials);
  if (!next) {
    emitLine('Next: win a required trial to unlock the next stage');
    return;
  }
  if (next.at_this_arena) {
    emitLine(`Next: arena fight ${next.challenge_id}`);
    return;
  }
  emitLine(`Next: travel to ${next.poi_name} (${next.poi_id}), then arena fight ${next.challenge_id}`);
}

export function formatArenaSideSize(maxSideSize: unknown): string {
  const size = finiteNumber(maxSideSize);
  if (size === undefined) return '';
  if (size === 0) return 'full fleet (every eligible member)';
  if (size === 1) return 'solo duel';
  return `up to ${size} ships per side`;
}

export type BattleRuleset = 'standard' | 'arena';

export type BattleLabels = {
  note?: string;
  shipsDestroyed: string;
  destroyedNames: string;
  killsColumn: string;
};

export type ArenaRecord = { wins: number; losses: number; knockouts: number };

const BATTLE_LABELS: Record<BattleRuleset, BattleLabels> = {
  standard: {
    shipsDestroyed: 'Ships Destroyed',
    destroyedNames: 'Destroyed',
    killsColumn: 'Kills',
  },
  arena: {
    note: 'Arena match: knockouts restore ships, drones, and personnel on the spot; no kill, loss, capture or casualty stats. Ammo, fuel, and consumables stay spent.',
    shipsDestroyed: 'Ships Knocked Out',
    destroyedNames: 'Knocked out',
    killsColumn: 'KOs',
  },
};

export function formatArenaPoiLine(arena: unknown): string | undefined {
  if (arena !== true) return undefined;
  return 'Arena: yes (consequence-free matches; see: arena status)';
}

export function readArenaRecord(source: Record<string, unknown>): ArenaRecord | undefined {
  const wins = finiteNumber(source.arena_wins);
  const losses = finiteNumber(source.arena_losses);
  const knockouts = finiteNumber(source.arena_knockouts);
  if (wins === undefined || losses === undefined || knockouts === undefined) return undefined;
  return { wins, losses, knockouts };
}

export function formatArenaRecord(record: ArenaRecord): string {
  return `${record.wins} wins / ${record.losses} loss${record.losses === 1 ? '' : 'es'} / ${record.knockouts} knockouts`;
}

function formatArenaXpLine(arenaXp: unknown): string | undefined {
  if (!isRecord(arenaXp) || !isRecord(arenaXp.by_skill)) return undefined;
  const usedToday = arenaXp.by_skill;
  const skills = Object.keys(usedToday)
    .filter((skill) => finiteNumber(usedToday[skill]) !== undefined)
    .sort((left, right) => left.localeCompare(right));
  if (skills.length === 0) return undefined;
  const parts = skills.map((skill) => `${skill} ${finiteNumber(usedToday[skill])}`);
  const day = typeof arenaXp.day === 'string' && arenaXp.day ? arenaXp.day : undefined;
  return day ? `Arena XP today (${day}): ${parts.join(', ')}` : `Arena XP today: ${parts.join(', ')}`;
}

export function arenaStatLines(stats: Record<string, unknown>, arenaXp: unknown): string[] {
  const lines: string[] = [];
  const record = readArenaRecord(stats);
  if (record && (record.wins > 0 || record.losses > 0 || record.knockouts > 0)) {
    lines.push(`Arena: ${formatArenaRecord(record)}`);
  }
  const xpLine = formatArenaXpLine(arenaXp);
  if (xpLine) lines.push(xpLine);
  return lines;
}

export function battleRulesetFromCategory(category: unknown): BattleRuleset {
  return typeof category === 'string' && category.trim().toLowerCase() === 'arena' ? 'arena' : 'standard';
}

export function battleRulesetFromLogEntries(entries: Array<Record<string, unknown>>): BattleRuleset {
  return entries.some((entry) => entry.arena === true) ? 'arena' : 'standard';
}

export function battleLabels(ruleset: BattleRuleset): BattleLabels {
  return BATTLE_LABELS[ruleset];
}

function emitChallengeBlock(
  heading: string,
  info: { poi_id: unknown; max_side_size: unknown; expires_tick: unknown; challenge_id: unknown },
  nextSteps: string,
): void {
  const sideSize = formatArenaSideSize(info.max_side_size);
  const expires = finiteNumber(info.expires_tick);
  emitLine(heading);
  emitLine(`  Arena: ${info.poi_id}   Side size: ${sideSize}   Expires: tick ${expires !== undefined ? expires : ''}`);
  emitLine(`  Challenge ID: ${info.challenge_id}`);
  emitLine(`  ${nextSteps}`);
}

function emitXpTable(result: Record<string, unknown>): void {
  const cap = finiteNumber(result.xp_cap_per_skill);
  const usedToday = isRecord(result.xp_used_today) ? result.xp_used_today : {};
  const skills = Object.keys(usedToday).sort((left, right) => left.localeCompare(right));
  const heading = cap !== undefined ? `Arena XP today (cap ${cap} per skill)` : 'Arena XP today';
  if (skills.length === 0) {
    emitLine('');
    emitLine(heading);
    emitLine('  none today');
    return;
  }

  printCompactTable(
    heading,
    skills.map((skill) => {
      const used = finiteNumber(usedToday[skill]);
      const remaining = cap !== undefined && used !== undefined ? Math.max(0, cap - used) : undefined;
      return { skill, used, remaining };
    }),
    [
      ['Skill', ['skill']],
      ['Used', ['used']],
      ['Remaining', ['remaining']],
    ],
  );
}

function renderArenaStatus(result: Record<string, unknown>, command?: string): boolean {
  if (!commandNameEquals(command, 'arena_status')) return false;
  if (typeof result.at_arena !== 'boolean') return false;
  const record = readArenaRecord(result);
  if (!record) return false;

  emitLine(`\n${c.bright}=== Arena ===${c.reset}`);
  emitLine(`At arena POI: ${result.at_arena ? 'yes' : 'no'}`);
  emitLine(`Record: ${formatArenaRecord(record)}`);

  if (isNonEmptyString(result.battle_id)) {
    emitLine('');
    emitLine(`In battle: ${result.battle_id}`);
    emitLine('  Next: get_battle_status');
  }

  if (isChallengeInfo(result.incoming)) {
    emitLine('');
    emitChallengeBlock(
      `Incoming challenge from ${result.incoming.opponent_name} (${result.incoming.opponent_id})`,
      result.incoming,
      'Answer with: arena accept | arena decline',
    );
  }

  if (isChallengeInfo(result.outgoing)) {
    emitLine('');
    emitChallengeBlock(
      `Outgoing challenge to ${result.outgoing.opponent_name} (${result.outgoing.opponent_id})`,
      result.outgoing,
      'Withdraw with: arena cancel',
    );
  }

  emitXpTable(result);
  return true;
}

function renderArenaChallenge(result: Record<string, unknown>): boolean {
  if (result.action !== 'challenge' || !isNonEmptyString(result.challenge_id)) return false;
  if (!isNonEmptyString(result.target_name) || !isNonEmptyString(result.target_id)) return false;

  emitLine('');
  emitChallengeBlock(
    `Challenge sent to ${result.target_name} (${result.target_id})`,
    {
      poi_id: result.poi_id,
      max_side_size: result.max_side_size,
      expires_tick: result.expires_tick,
      challenge_id: result.challenge_id,
    },
    'Next: arena status (wait for an answer) · arena cancel (withdraw)',
  );
  if (isNonEmptyString(result.message)) emitLine(`  ${result.message}`);
  return true;
}

function renderArenaAccept(result: Record<string, unknown>): boolean {
  if (result.action !== 'accept' || !isNonEmptyString(result.battle_id)) return false;
  const yourSide = finiteNumber(result.your_side);
  const opponentSide = finiteNumber(result.opponent_side);
  if (yourSide === undefined || opponentSide === undefined) return false;
  if (!Array.isArray(result.participants) || !result.participants.every(isParticipant)) return false;

  emitLine('');
  emitLine(`Arena match started — battle ${result.battle_id}`);
  emitLine(`Your side: ${yourSide}   Opponent side: ${opponentSide}`);
  emitArenaParticipants(result.participants, yourSide, 'opponent');
  emitLine('');
  emitLine('Next: get_battle_status · battle_target <pilot> · battle_stance <stance>');
  return true;
}

export function renderArenaChallenges(result: Record<string, unknown>, command?: string): boolean {
  if (!commandNameEquals(command, 'arena_challenges')) return false;
  const catalog = asTrialCatalog(result);
  if (!catalog) return false;
  emitTrialCatalog(catalog.trials);
  return true;
}

export function renderArenaFight(result: Record<string, unknown>): boolean {
  const start = asTrialStart(result);
  if (!start) return false;
  emitTrialStart(start);
  emitArenaParticipants(start.participants, start.your_side, 'enemy');
  emitLine('');
  emitLine('Next: get_battle_status · battle_target <pilot> · battle_stance <stance>');
  return true;
}

function renderArenaAction(result: Record<string, unknown>): boolean {
  if (result.action !== 'decline' && result.action !== 'cancel') return false;
  if (!isNonEmptyString(result.challenge_id)) return false;

  const verb = result.action === 'decline' ? 'declined' : 'cancelled';
  const summary = `Challenge ${result.challenge_id} ${verb}.`;
  emitLine('');
  emitLine(summary);
  if (isNonEmptyString(result.message) && result.message !== summary) emitLine(result.message);
  return true;
}

const scoped = { suppressShapeFallbackOnDecline: true };

export const arenaFormatters: ResultFormatter[] = [
  namedFormatter('arena_status', ['at_arena', 'arena_wins', 'xp_used_today'], renderArenaStatus, {
    commands: ['arena_status'],
    ...scoped,
  }),
  namedFormatter('arena_challenge', ['action', 'challenge_id', 'target_name'], renderArenaChallenge, {
    commands: ['arena_challenge'],
    ...scoped,
  }),
  namedFormatter('arena_accept', ['action', 'battle_id', 'participants', 'your_side'], renderArenaAccept, {
    commands: ['arena_accept'],
    ...scoped,
  }),
  namedFormatter('arena_action', ['action', 'challenge_id', 'message'], renderArenaAction, {
    commands: ['arena_decline', 'arena_cancel'],
    ...scoped,
  }),
  namedFormatter('arena_challenges', ['action', 'challenges'], renderArenaChallenges, {
    commands: ['arena_challenges'],
    ...scoped,
  }),
  namedFormatter('arena_fight', ['action', 'battle_id', 'enemies', 'participants'], renderArenaFight, {
    commands: ['arena_fight'],
    ...scoped,
  }),
];
