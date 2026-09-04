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

type ArenaParticipant = {
  player_id: string;
  username: string;
  side_id: number;
};

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

export function formatArenaSideSize(maxSideSize: unknown): string {
  const size = finiteNumber(maxSideSize);
  if (size === undefined) return '';
  if (size === 0) return 'full fleet (every eligible member)';
  if (size === 1) return 'solo duel';
  return `up to ${size} ships per side`;
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
  if (finiteNumber(result.arena_wins) === undefined) return false;

  const wins = finiteNumber(result.arena_wins);
  const losses = finiteNumber(result.arena_losses);
  const knockouts = finiteNumber(result.arena_knockouts);

  emitLine(`\n${c.bright}=== Arena ===${c.reset}`);
  emitLine(`At arena POI: ${result.at_arena ? 'yes' : 'no'}`);
  emitLine(`Record: ${wins} wins / ${losses} loss${losses === 1 ? '' : 'es'} / ${knockouts} knockouts`);

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

  const yoursCount = result.participants.filter((row) => row.side_id === yourSide).length;
  const rows = [...result.participants]
    .sort((left, right) => left.side_id - right.side_id || left.username.localeCompare(right.username))
    .map((row) => ({
      side_id: row.side_id,
      team: row.side_id === yourSide ? 'yours' : 'opponent',
      username: yoursCount === 1 && row.side_id === yourSide ? `${row.username} (you)` : row.username,
      player_id: row.player_id,
    }));

  emitLine('');
  emitLine(`Arena match started — battle ${result.battle_id}`);
  emitLine(`Your side: ${yourSide}   Opponent side: ${opponentSide}`);
  printCompactTable('Participants', rows, [
    ['Side', ['side_id']],
    ['Team', ['team']],
    ['Pilot', ['username']],
    ['Player ID', ['player_id']],
  ]);
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
];
