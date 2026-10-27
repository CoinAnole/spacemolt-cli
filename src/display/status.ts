import { stringifyApiJson } from '../json-number.ts';
import { formatOfflineCollapsedText, formatShipCountsLine } from '../notification-format-shared.ts';
import { arenaStatLines, formatArenaPoiLine, formatArenaWonLine, formatArenaXpLine } from './arena.ts';
import { formatBerthSummary } from './berths.ts';
import { emitCitizenshipsLine } from './citizenship.ts';
import { emitShipCombatEffects } from './combat-effects.ts';
import { formatCreatureLine } from './creatures.ts';
import { isFlattenedDetailsView } from './dock-state.ts';
import { emitFixerAccount, selectFixerDebt } from './fixer.ts';
import { emitActiveMissionsTable } from './generic.ts';
import {
  c,
  commandNameEquals,
  emitCreditBalance,
  emitLine,
  emitLines,
  emitResourceInfoLines,
  emitStationContrabandPolicy,
  emitStationDefences,
  emitStationFuelPricing,
  emitStationIds,
  formatDeepCoreLine,
  formatDeepCoreMark,
  formatIntegerText,
  formatLiveryName,
  formatPlayer,
  formatReputationChangesSummary,
  formatResourceWorkabilitySuffix,
  formatter,
  isRecord,
  namedFormatter,
  overCapacitySuffix,
  pirateCrewLabel,
  printCompactTable,
} from './helpers.ts';
import { emitLeviathanContacts } from './leviathans.ts';
import { emitShipPersonnel, formatCrewRatio } from './personnel.ts';
import { emitNearbyPrizes, emitPrizeRecoveries } from './prizes.ts';
import {
  emitFactionScanContacts,
  emitFactionScanHeader,
  emitFactionScanNpcs,
  emitFactionScanPirates,
  emitSignatureDetectedLine,
  nativeRemotePoiId,
  nativeScanField,
} from './scan-contacts.ts';
import { emitCargoHold, emitDroneBay, emitInstalledModules } from './ship.ts';

const ZERO_TRADING_RESTRICTION = '0001-01-01T00:00:00Z';

function formatNumber(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString() : String(value);
}

/** OpenAPI integers only — do not coerce strings/empty so '' cannot become 0. */
function completionCreditAmount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function formatTimestampPreview(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

function formatSignedNumber(value: unknown): string {
  const text = formatNumber(value);
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) && number < 0 ? text : `+${text}`;
}

function formatDisplayValue(value: unknown): string {
  if (isRecord(value)) {
    const name = value.name ?? value.base_name ?? value.username;
    const id = value.id ?? value.base_id ?? value.player_id;
    if (name && id && name !== id) return `${name} (${id})`;
    if (name) return String(name);
    if (id) return String(id);
  }
  return String(value);
}

function locationTransitLines(loc: Record<string, unknown>): string[] {
  const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);
  const named = (name: unknown, id: unknown) => {
    const nameText = text(name);
    const idText = text(id);
    return nameText && idText && nameText !== idText ? `${nameText} (${idText})` : (nameText ?? idText);
  };
  const type = text(loc.transit_type);
  const poi = named(loc.transit_dest_poi_name, loc.transit_dest_poi_id);
  const system = named(loc.transit_dest_system_name, loc.transit_dest_system_id);
  const destination = type === 'travel' ? (poi ?? system) : (system ?? poi);
  const lines: string[] = [];
  if (type || destination) {
    lines.push(`${c.cyan}Transit:${c.reset} ${[type, destination].filter(Boolean).join(' → ')}`);
  } else if (loc.in_transit === true) {
    lines.push(`${c.cyan}Transit:${c.reset} in transit`);
  }
  if (typeof loc.transit_arrival_tick === 'number') {
    lines.push(`${c.cyan}Arrival tick:${c.reset} ${loc.transit_arrival_tick}`);
  }
  if (typeof loc.transit_bearing === 'number') lines.push(`${c.cyan}Bearing:${c.reset} ${loc.transit_bearing}°`);
  if (typeof loc.transit_x === 'number' && typeof loc.transit_y === 'number') {
    lines.push(`${c.cyan}Position:${c.reset} ${loc.transit_x}, ${loc.transit_y}`);
  }
  if (typeof loc.transit_ticks_elapsed === 'number') {
    lines.push(`${c.cyan}Ticks elapsed:${c.reset} ${loc.transit_ticks_elapsed}`);
  }
  const voidMessage = text(loc.void_message);
  if (voidMessage) lines.push(`${c.dim}${voidMessage}${c.reset}`);
  return lines;
}

function emitTradingRestriction(player: Record<string, unknown>): void {
  const value = player.trading_restricted_until;
  if (typeof value !== 'string' || value === '' || value === ZERO_TRADING_RESTRICTION) return;
  emitLine(`Trading restricted until: ${value}`);
}

function emitDetention(player: Record<string, unknown>): void {
  if (!isRecord(player.standings)) return;
  for (const [empire, value] of Object.entries(player.standings)) {
    if (!isRecord(value)) continue;
    const jailedUntil =
      typeof value.jailed_until === 'string' && value.jailed_until !== '' ? value.jailed_until : undefined;
    if (!jailedUntil) continue;

    const head = `Detained by: ${empire} until ${formatTimestampPreview(jailedUntil)}`;
    const bounty = value.outstanding_bounty;
    const owe =
      typeof bounty === 'number' && Number.isFinite(bounty) && bounty > 0
        ? `owe ${formatNumber(bounty)} cr`
        : undefined;
    emitLine(owe ? `${head} (${owe})` : head);
  }
}

function formatSummaryLine(label: string, value: unknown): string {
  return `${label.padEnd(11)}${value === undefined || value === null || value === '' ? 'unknown' : String(value)}`;
}

function hasUnknownSignature(...sources: unknown[]): boolean {
  return sources.some((source) => isRecord(source) && source.unknown_signature === true);
}

function emitUnknownSignatureHint(...sources: unknown[]): void {
  if (!hasUnknownSignature(...sources)) return;
  emitLine(`${c.yellow}Unknown cloaked signature (not identified).${c.reset}`);
}

function emitActiveScanLine(result: Record<string, unknown>, command: string | undefined): void {
  if (!commandNameEquals(command, 'subscribe_observation')) return;
  if (typeof result.active_scan !== 'boolean') return;
  emitLine(`Active scan: ${result.active_scan}`);
}

function emitLocationResources(resources: unknown, options: { indent?: string; leadingNewline?: boolean } = {}): void {
  const rows = Array.isArray(resources) ? resources.filter(isRecord) : [];
  if (!rows.length) return;
  const indent = options.indent ?? '';
  const heading = `${indent}${c.bright}Resources:${c.reset}`;
  emitLine(options.leadingNewline === false ? heading : `\n${heading}`);
  for (const res of rows) {
    const name = res.item_name || res.item_id || res.name || res.resource_id;
    const remaining = res.remaining === -1 ? 'unlimited' : res.remaining === 0 ? 'depleted' : String(res.remaining);
    emitLine(`${indent}  - ${name}: richness ${res.richness}, ${remaining}${formatResourceWorkabilitySuffix(res)}`);
  }
}

function textFromRecord(record: Record<string, unknown> | undefined, keys: string[]): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (value === undefined || value === null || value === '') continue;
    if (isRecord(value)) {
      const nested = textFromRecord(value, ['name', 'display_name', 'class_name', 'id']);
      if (nested) return nested;
      continue;
    }
    return String(value);
  }
  return undefined;
}

function titleFromId(value: string): string {
  return value
    .replace(/_level$/, '')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function compactSkillEntries(source: unknown): string[] {
  if (!isRecord(source)) return [];
  const entries: string[] = [];
  const seen = new Set<string>();

  for (const [id, value] of Object.entries(source)) {
    if (isRecord(value)) {
      const level = value.level ?? value.current_level;
      if (level === undefined || level === null || level === '') continue;
      const name = textFromRecord(value, ['name', 'display_name', 'title']) ?? titleFromId(id);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push(`${name} ${level}`);
      continue;
    }

    if (!id.endsWith('_level') || value === undefined || value === null || value === '') continue;
    const name = titleFromId(id);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(`${name} ${value}`);
  }

  return entries.sort((left, right) => left.localeCompare(right));
}

function formatStatusSummary(r: Record<string, unknown>): string[] | undefined {
  if (!isRecord(r.player)) return undefined;
  const player = r.player;
  const ship = r.ship;
  const system = isRecord(r.system) ? r.system : undefined;
  const station = isRecord(r.station) ? r.station : isRecord(r.base) ? r.base : undefined;
  const location = isRecord(r.location) ? r.location : undefined;

  const playerName = textFromRecord(player, ['username', 'name', 'player_name']);
  const credits = player.credits ?? r.credits;
  const systemName =
    textFromRecord(system, ['name', 'system_name', 'id', 'system_id']) ??
    textFromRecord(location, ['system_name', 'system_id']) ??
    textFromRecord(player, ['current_system_name', 'current_system']);
  const docked =
    textFromRecord(station, ['name', 'station_name', 'base_name', 'id', 'station_id', 'base_id']) ??
    textFromRecord(location, ['docked_station_name', 'station_name', 'base_name', 'docked_at_name', 'docked_at']) ??
    textFromRecord(player, [
      'docked_station_name',
      'station_name',
      'base_name',
      'docked_at_base_name',
      'docked_at_base',
    ]) ??
    'in space';
  const isRiding = isRecord(r.riding);
  const ridingCarrier = isRiding ? textFromRecord(r.riding as Record<string, unknown>, ['carrier']) : undefined;
  const shipClass =
    (isRiding
      ? `passenger on ${ridingCarrier || 'carrier'}`
      : textFromRecord(isRecord(ship) ? ship : undefined, [
          'class_name',
          'ship_class_name',
          'class',
          'ship_class',
          'class_id',
          'name',
        ])) ?? 'unknown';
  const skills = compactSkillEntries(r.skills ?? player.skills ?? player.stats);

  const lines = [
    formatSummaryLine('Player:', playerName),
    formatSummaryLine('Credits:', typeof credits === 'number' ? formatNumber(credits) : credits),
    formatSummaryLine('System:', systemName),
    formatSummaryLine('Docked:', docked),
    formatSummaryLine('Ship:', shipClass),
  ];
  if (!isRiding && isRecord(ship)) {
    const crew = formatCrewRatio(ship);
    if (crew) lines.push(formatSummaryLine('Crew:', crew));
  }
  lines.push(formatSummaryLine('Skills:', skills.length ? skills.join(' | ') : 'None'));
  return lines;
}

function rowsHaveValue(rows: Array<Record<string, unknown>>, keys: string[]): boolean {
  return rows.some((row) => keys.some((key) => row[key] !== undefined && row[key] !== null && row[key] !== ''));
}

function formatMissionObjectText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isRecord(value)) return String(value);

  const name = value.name ?? value.title ?? value.id ?? value.content ?? value.text ?? value.message;
  if (name !== undefined && name !== null && name !== '') return String(name);

  const json = stringifyApiJson(value);
  return json === undefined || json === '{}' ? undefined : json;
}

function formatMissionGiver(value: unknown): string | undefined {
  if (!isRecord(value)) return formatMissionObjectText(value);

  const title =
    value.title === undefined || value.title === null || value.title === '' ? undefined : String(value.title);
  const name = value.name === undefined || value.name === null || value.name === '' ? undefined : String(value.name);
  const id = value.id === undefined || value.id === null || value.id === '' ? undefined : String(value.id);
  const label = [title, name].filter(Boolean).join(' ');
  if (label && id && label !== id) return `${label} (${id})`;
  if (label) return label;
  return id ?? formatMissionObjectText(value);
}

function formatMissionDialog(value: unknown): string | undefined {
  if (!isRecord(value)) return formatMissionObjectText(value);

  for (const key of ['complete', 'content', 'text', 'message', 'offer', 'accept', 'decline']) {
    const text = value[key];
    if (text !== undefined && text !== null && text !== '') return String(text);
  }

  return formatMissionObjectText(value);
}

function formatSkillSummary(stats: Record<string, unknown>, skillId: string, label: string): string | undefined {
  const skill = stats[skillId];
  const levelKey = `${skillId}_level`;
  const xpKey = `${skillId}_xp`;

  let level: unknown;
  let xp: unknown;
  if (isRecord(skill)) {
    level = skill.level ?? skill.current_level;
    xp = skill.xp ?? skill.current_xp;
  } else {
    level = stats[levelKey];
    xp = stats[xpKey];
  }

  if (level === undefined && xp === undefined) return undefined;
  if (level !== undefined && xp !== undefined) return `${label}: Level ${level} (${xp} XP)`;
  if (level !== undefined) return `${label}: Level ${level}`;
  return `${label}: ${xp} XP`;
}

function formatStandingValue(value: unknown, includeBaseline = false): string | undefined {
  if (isRecord(value)) {
    const reputation = value.reputation;
    if (reputation === undefined || reputation === null || reputation === '') return undefined;
    const parts: string[] = [];
    const bounty = value.outstanding_bounty;
    if (typeof bounty === 'number' && Number.isFinite(bounty) && bounty > 0) {
      parts.push(`bounty ${formatNumber(bounty)}`);
    }
    if (includeBaseline) {
      const baseline = value.baseline;
      if (typeof baseline === 'number' && Number.isFinite(baseline) && baseline !== 0) {
        parts.push(`baseline ${formatNumber(baseline)}`);
      }
    }
    const jailedUntil = value.jailed_until;
    if (typeof jailedUntil === 'string' && jailedUntil !== '') {
      parts.push(`jailed until ${formatTimestampPreview(jailedUntil)}`);
    }
    const annotation = parts.length ? ` (${parts.join(', ')})` : '';
    return `${reputation}${annotation}`;
  }
  return String(value);
}

export function emitStandings(player: Record<string, unknown>, options?: { baseline?: boolean }): void {
  if (!isRecord(player.standings)) return;
  const includeBaseline = options?.baseline === true;
  const standings = Object.entries(player.standings)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => {
      const standing = formatStandingValue(value, includeBaseline);
      return standing === undefined ? undefined : `${key}: ${standing}`;
    })
    .filter((standing): standing is string => Boolean(standing));
  if (!standings.length) return;
  emitLine(`\n${c.bright}Standings:${c.reset}`);
  emitLine(`  ${standings.join(', ')}`);
}

function formatNearbyPirateLine(p: Record<string, unknown>): string {
  const name = formatLiveryName(String(p.name || p.pirate_id || 'Unknown'), p);
  const boss = p.is_boss === true ? 'Boss ' : '';
  const ship = p.ship_class || p.tier ? ` (${p.ship_class || p.tier})` : '';
  const crewLabel = pirateCrewLabel(p);
  const crew = crewLabel ? ` - ${crewLabel}` : '';
  const status = p.status ? ` - ${p.status}` : '';
  return `${boss}${name}${ship}${crew}${status}`;
}

function formatNearbyArenaNpcLine(npc: Record<string, unknown>): string {
  const rawName = typeof npc.name === 'string' ? npc.name : '';
  const rawId = typeof npc.npc_id === 'string' ? npc.npc_id : '';
  const name = rawName || rawId || 'Unknown';
  const coloredName = formatLiveryName(name, npc);
  const boss = npc.is_boss === true ? 'Boss ' : '';
  const targetId = rawId && rawId !== name ? ` [${rawId}]` : '';
  const shipClass = npc.ship_class_name || npc.ship_class;
  const ship = shipClass ? ` (${shipClass})` : '';
  const flees = npc.flees === true ? ' - flees' : '';
  const hull =
    npc.hull !== undefined || npc.max_hull !== undefined ? ` - hull ${npc.hull ?? '?'}/${npc.max_hull ?? '?'}` : '';
  const shield =
    npc.shield !== undefined || npc.max_shield !== undefined
      ? ` - shield ${npc.shield ?? '?'}/${npc.max_shield ?? '?'}`
      : '';
  const battle = npc.battle_id ? ` - battle ${npc.battle_id}` : '';
  const status = npc.status ? ` - ${npc.status}` : '';
  return `${boss}${coloredName}${targetId}${ship}${flees}${hull}${shield}${battle}${status}`;
}

function summarizeObjectiveForDisplay(objective: unknown): string {
  if (!isRecord(objective)) return String(objective);
  const description = objective.description ?? objective.title ?? objective.type;
  const details: string[] = [];
  if (objective.quantity !== undefined) details.push(`quantity ${formatNumber(objective.quantity)}`);
  if (objective.item_id !== undefined) details.push(`item ${objective.item_id}`);
  const system = objective.system_name ?? objective.system_id;
  if (system !== undefined) details.push(`system ${system}`);
  const targetBase = objective.target_base_name ?? objective.target_base_id;
  if (targetBase !== undefined) details.push(`station ${targetBase}`);
  if (objective.target_player !== undefined) details.push(`target ${objective.target_player}`);
  if (objective.target_player_id !== undefined && objective.target_player_id !== objective.target_player) {
    details.push(`id ${objective.target_player_id}`);
  }
  if (Array.isArray(objective.participants) && objective.participants.length > 0) {
    details.push(`participants ${objective.participants.join(', ')}`);
  }
  if (Array.isArray(objective.eligible_players) && objective.eligible_players.length > 0) {
    details.push(`eligible ${objective.eligible_players.join(', ')}`);
  }
  const progress = objective.progress;
  if (isRecord(progress)) {
    const current = progress.current ?? progress.completed ?? progress.amount;
    const required = progress.required ?? progress.target ?? progress.total;
    if (current !== undefined && required !== undefined) details.push(`${current}/${required}`);
  }
  const detailText = details.length ? ` (${details.join(', ')})` : '';
  return `${description ?? objective.type ?? 'Objective'}${detailText}`;
}

function summarizeRewardForDisplay(rewards: unknown): string {
  if (!isRecord(rewards)) return '';
  const parts: string[] = [];
  if (rewards.credits !== undefined) parts.push(`${formatNumber(rewards.credits)} cr`);
  if (isRecord(rewards.items)) {
    const items = Object.entries(rewards.items)
      .filter(([, quantity]) => quantity !== undefined && quantity !== null && quantity !== '')
      .map(([item, quantity]) => `${formatNumber(quantity)} ${item}`);
    if (items.length) parts.push(items.join(', '));
  }
  if (rewards.reputation !== undefined) parts.push(`reputation ${formatSignedNumber(rewards.reputation)}`);
  if (rewards.pirate_rep !== undefined) {
    const faction =
      typeof rewards.pirate_faction === 'string' && rewards.pirate_faction.trim() !== ''
        ? rewards.pirate_faction.trim()
        : '';
    const suffix = faction ? ` (${faction})` : '';
    parts.push(`pirate rep ${formatSignedNumber(rewards.pirate_rep)}${suffix}`);
  }
  if (isRecord(rewards.skill_xp)) {
    parts.push(
      Object.entries(rewards.skill_xp)
        .map(([skill, xp]) => `${skill} +${xp} XP`)
        .join(', '),
    );
  }
  return parts.filter(Boolean).join('; ');
}

/**
 * Summarize CompleteMissionResponse reward/community fields for table output.
 * Do not call summarizeRewardForDisplay — different field names and community maps.
 */
function summarizeCompletionRewards(r: Record<string, unknown>): {
  creditsLine?: string;
  itemsLine?: string;
  reputationLine?: string;
  skillXpLine?: string;
  communityLine?: string;
} {
  const result: {
    creditsLine?: string;
    itemsLine?: string;
    reputationLine?: string;
    skillXpLine?: string;
    communityLine?: string;
  } = {};

  if (r.credits_earned !== undefined && r.credits_earned !== null && r.credits_earned !== '') {
    let creditsLine = `Credits earned: ${formatNumber(r.credits_earned)}`;
    const promised = completionCreditAmount(r.credits_promised);
    const shortfall = completionCreditAmount(r.credits_shortfall);
    if (promised !== undefined) creditsLine += ` of ${formatNumber(promised)} promised`;
    if (shortfall !== undefined) creditsLine += ` (shortfall ${formatNumber(shortfall)})`;
    result.creditsLine = creditsLine;
  }

  if (isRecord(r.items_received)) {
    const items = Object.entries(r.items_received)
      .filter(([, quantity]) => quantity !== undefined && quantity !== null && quantity !== '')
      .map(([item, quantity]) => `${item} x${formatNumber(quantity)}`);
    if (items.length) result.itemsLine = `Items received: ${items.join(', ')}`;
  }

  const reputation = formatReputationChangesSummary(r.reputation_changes);
  if (reputation) result.reputationLine = `Reputation changes: ${reputation}`;

  if (isRecord(r.skill_xp_gained)) {
    const skills = Object.entries(r.skill_xp_gained)
      .filter(([, xp]) => xp !== undefined && xp !== null && xp !== '')
      .map(([skill, xp]) => `${skill} ${formatSignedNumber(xp)}`);
    if (skills.length) result.skillXpLine = `Skill XP: ${skills.join(', ')}`;
  }

  if (r.community_percent !== undefined || isRecord(r.community_progress) || isRecord(r.community_contributed)) {
    const parts: string[] = [];
    if (r.community_percent !== undefined && r.community_percent !== null && r.community_percent !== '') {
      parts.push(`${formatNumber(r.community_percent)}%`);
    }
    const detailParts: string[] = [];
    if (isRecord(r.community_progress)) {
      const progress = Object.entries(r.community_progress)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => `${key}: ${value}`);
      if (progress.length) detailParts.push(progress.join(', '));
    }
    if (isRecord(r.community_contributed)) {
      const contributed = Object.entries(r.community_contributed)
        .filter(([, quantity]) => quantity !== undefined && quantity !== null && quantity !== '')
        .map(([item, quantity]) => `${item} x${formatNumber(quantity)}`);
      if (contributed.length) detailParts.push(`contributed ${contributed.join(', ')}`);
    }
    if (detailParts.length) {
      parts.push(`(${detailParts.join('; ')})`);
    }
    if (parts.length) result.communityLine = `Community: ${parts.join(' ')}`;
  }

  return result;
}

function isMapSystemInfo(result: Record<string, unknown>): boolean {
  return (
    typeof result.system_id === 'string' &&
    result.system_id.length > 0 &&
    typeof result.name === 'string' &&
    !Array.isArray(result.systems)
  );
}

function chartDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text === '' ? undefined : text;
}

function formatSystemPoiName(poi: Record<string, unknown>): string {
  const poiClass = chartDescription(poi.class);
  const classMark = poiClass ? ` [${poiClass}]` : '';
  return `${poi.name} (${poi.type})${classMark}${formatDeepCoreMark(poi.deep_core)}`;
}

function formatShipCountSuffix(poi: Record<string, unknown>): string {
  const count = poi.ship_count;
  if (typeof count !== 'number' || !Number.isFinite(count)) return '';
  return ` ${c.cyan}(${count} ships)${c.reset}`;
}

function formatGalacticPosition(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  if (value.x === undefined || value.y === undefined) return undefined;
  return `(${value.x}, ${value.y})`;
}

function emitMapSystemInfo(result: Record<string, unknown>): void {
  emitLine(`\n${c.bright}=== System: ${result.name} ===${c.reset}`);
  emitLine(`ID: ${result.system_id}`);
  if (result.empire !== undefined) emitLine(`Empire: ${result.empire || 'None'}`);
  if (result.is_stronghold === true) emitLine('Stronghold: yes');
  if (result.online !== undefined) emitLine(`Online: ${result.online}`);
  if (result.poi_count !== undefined) emitLine(`POIs: ${result.poi_count}`);
  const position = formatGalacticPosition(result.position);
  if (position) emitLine(`Position: ${position}`);
  if (result.visited !== undefined) emitLine(`Visited: ${result.visited}`);
  if (typeof result.visited_at === 'string' && result.visited_at) {
    emitLine(`Visited at: ${result.visited_at}`);
  }
  const description = chartDescription(result.description);
  if (description) emitLine(`Description: ${description}`);

  const connections = Array.isArray(result.connections) ? result.connections : [];
  if (connections.length) {
    emitLine(`\n${c.bright}Connections:${c.reset}`);
    for (const connection of connections) emitLine(`  - ${connection}`);
  }
}

function emitRemoteScanTargetLine(result: Record<string, unknown>): void {
  const targetId = nativeScanField(result, 'target_id');
  const poiId = nativeRemotePoiId(result);
  if (typeof targetId !== 'string' || targetId === '' || targetId === poiId) return;
  emitLine(`Target: ${targetId}`);
}

function emitNonZeroFixerDebt(result: Record<string, unknown>, command: string | undefined): void {
  const debt = selectFixerDebt(result, command);
  if (debt === undefined || debt === 0 || debt === 0n) return;
  const text = formatIntegerText(debt);
  if (text === undefined) return;
  emitLine(`Fixer debt: ${text}`);
}

function emitScanRevealedInfo(result: Record<string, unknown>): void {
  if (Array.isArray(result.revealed_info)) {
    const revealed = result.revealed_info
      .filter((value) => value !== undefined && value !== null && !isRecord(value) && !Array.isArray(value))
      .map(String);
    if (revealed.length) {
      emitLine(`\n${c.bright}Revealed:${c.reset}`);
      for (const value of revealed) emitLine(`  ${value}`);
    }
  } else if (isRecord(result.revealed_info)) {
    emitLine(`\n${c.bright}Revealed:${c.reset}`);
    for (const [key, value] of Object.entries(result.revealed_info)) {
      if (value === undefined || value === null || isRecord(value) || Array.isArray(value)) continue;
      emitLine(`  ${key}: ${value}`);
    }
  }
}

function formatLifetimeNonNumber(value: unknown): string {
  if (Array.isArray(value)) return stringifyApiJson(value) ?? '';
  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, inner]) => {
        const rendered =
          Array.isArray(inner) || isRecord(inner)
            ? (stringifyApiJson(inner) ?? '')
            : typeof inner === 'number'
              ? formatNumber(inner)
              : String(inner);
        return `${key} ${rendered}`;
      })
      .join(', ');
  }
  return String(value);
}

export function emitLifetimeStats(stats: unknown): boolean {
  if (!isRecord(stats)) return false;
  const rows = Object.entries(stats)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => ({
      stat: key
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' '),
      value: typeof value === 'number' ? formatNumber(value) : formatLifetimeNonNumber(value),
    }));
  if (!rows.length) return false;
  printCompactTable('Lifetime Stats', rows, [
    ['Stat', ['stat']],
    ['Value', ['value']],
  ]);
  return true;
}

function emitPilotProfile(record: Record<string, unknown>, kind: 'web' | 'v2'): void {
  const header = kind === 'web' ? 'Public Player Profile' : 'Pilot Profile';
  emitLine(`\n${c.bright}=== ${header} ===${c.reset}`);

  if (kind === 'web') {
    emitLine(`Username: ${c.bright}${record.username}${c.reset}`);
  } else if (typeof record.username === 'string' && record.username.trim() !== '') {
    emitLine(`Username: ${c.bright}${record.username}${c.reset}`);
  }

  if (record.empire_name !== undefined || record.empire !== undefined) {
    const empire =
      record.empire_name && record.empire && record.empire_name !== record.empire
        ? `${record.empire_name} (${record.empire})`
        : (record.empire_name ?? record.empire);
    emitLine(`Empire: ${formatDisplayValue(empire)}`);
  }

  if (kind === 'web') {
    if (record.online !== undefined) {
      emitLine(`Online: ${record.online === true ? 'yes' : record.online === false ? 'no' : record.online}`);
    }
  } else if (typeof record.online === 'boolean') {
    emitLine(`Online: ${record.online ? 'yes' : 'no'}`);
  }

  if (kind === 'v2') {
    if (typeof record.clan_tag === 'string' && record.clan_tag.trim() !== '') {
      emitLine(`Clan tag: ${record.clan_tag}`);
    }
    if (typeof record.status_message === 'string') {
      const status = record.status_message.replaceAll(/[\r\n]+/g, ' ').trim();
      if (status) emitLine(`Status: ${status}`);
    }
  }

  if (kind === 'web') {
    if (record.primary_color !== undefined || record.secondary_color !== undefined) {
      emitLine(`Colors: ${record.primary_color ?? '—'} / ${record.secondary_color ?? '—'}`);
    }
  } else {
    const primary =
      typeof record.primary_color === 'string' && record.primary_color.trim() !== '' ? record.primary_color : undefined;
    const secondary =
      typeof record.secondary_color === 'string' && record.secondary_color.trim() !== ''
        ? record.secondary_color
        : undefined;
    if (primary !== undefined || secondary !== undefined) {
      emitLine(`Colors: ${primary ?? '—'} / ${secondary ?? '—'}`);
    }
  }

  if (record.created_at !== undefined) {
    emitLine(`Created: ${formatTimestampPreview(record.created_at) || record.created_at}`);
  }

  if (isRecord(record.faction)) {
    const faction = record.faction;
    const name = faction.name ?? 'Unknown';
    const tag = faction.tag ? ` [${faction.tag}]` : '';
    const role = faction.role ? ` (${faction.role})` : '';
    emitLine(`Faction: ${name}${tag}${role}`);
    if (kind === 'v2' && typeof faction.joined_at === 'string' && faction.joined_at !== '') {
      emitLine(`Joined: ${formatTimestampPreview(faction.joined_at) || faction.joined_at}`);
    }
  }

  if (kind === 'v2' && Array.isArray(record.titles)) {
    const titles = record.titles
      .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
      .map((item) => item.trim());
    if (titles.length) emitLine(`Titles: ${titles.join(', ')}`);
  }

  if (kind === 'web' && isRecord(record.location)) {
    const loc = record.location;
    const system = loc.system_name ?? loc.system_id;
    const station = loc.docked_station_name ?? loc.docked_station_id;
    if (system || station) {
      emitLine(`\n${c.bright}Location:${c.reset}`);
      if (system) emitLine(`  System: ${system}`);
      if (station) emitLine(`  Station: ${station}`);
    }
  }

  emitLifetimeStats(record.stats);

  if (kind === 'v2' && typeof record.ranks_generated_at === 'string' && record.ranks_generated_at !== '') {
    emitLine(
      `\nLeaderboard snapshot: ${formatTimestampPreview(record.ranks_generated_at) || record.ranks_generated_at}`,
    );
  }

  const ranks = Array.isArray(record.ranks) ? record.ranks.filter(isRecord) : [];
  if (ranks.length) {
    const rankRows = ranks.map((row) => ({
      ...row,
      value_display: typeof row.value === 'number' ? formatNumber(row.value) : row.value,
    }));
    printCompactTable('Leaderboard Ranks', rankRows, [
      ['Category', ['label', 'category']],
      ['Rank', ['rank']],
      ['Value', ['value_display', 'value']],
    ]);
  } else if (
    kind === 'web'
      ? record.ranks_top_n !== undefined
      : typeof record.ranks_top_n === 'number' && Number.isFinite(record.ranks_top_n)
  ) {
    emitLine(`\n${c.dim}No top-${record.ranks_top_n} leaderboard placements.${c.reset}`);
  }

  if (isRecord(record.achievements)) {
    const achievements = record.achievements;
    emitLine(`\n${c.bright}Achievements:${c.reset}`);
    if (achievements.earned !== undefined || achievements.total !== undefined) {
      emitLine(
        `  Earned: ${achievements.earned ?? '?'}${achievements.total !== undefined ? ` / ${achievements.total}` : ''}`,
      );
    }
    if (achievements.points !== undefined) emitLine(`  Points: ${formatNumber(achievements.points)}`);
  }
}

export function emitQueue(queue: unknown, options?: { always?: boolean }): boolean {
  const always = options?.always === true;
  const record = isRecord(queue) ? queue : undefined;
  if (!always && (record === undefined || record.has_pending === undefined)) return false;
  const hasPending = record?.has_pending === true;
  emitLine(`\n${c.bright}=== Queue ===${c.reset}`);
  emitLine(`Queue: ${hasPending ? '1 action pending' : 'empty'}`);
  return true;
}

type SkillMapEntry = {
  name: string;
  category: string;
  level: number;
  max_level: number;
  xp: number;
  next_level_xp?: number;
};

export function emitSkillMap(skills: unknown): boolean {
  if (!skills || typeof skills !== 'object' || Array.isArray(skills)) return false;
  const skillMap = skills as Record<string, SkillMapEntry>;
  const skillEntries = Object.entries(skillMap);
  if (skillEntries.length === 0) return false;
  const firstSkill = skillEntries[0]?.[1];
  if (!firstSkill?.name || firstSkill.level === undefined) return false;
  emitLine(`\n${c.bright}=== Your Skills ===${c.reset}`);
  const byCategory: Record<string, typeof skillEntries> = {};
  for (const entry of skillEntries) {
    const [, skill] = entry;
    const cat = skill.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(entry);
  }
  for (const [category, entries] of Object.entries(byCategory)) {
    emitLine(`\n${c.cyan}${category}:${c.reset}`);
    for (const [, skill] of entries) {
      const progress = skill.next_level_xp
        ? ` (${skill.xp}/${skill.next_level_xp} XP to level ${skill.level + 1})`
        : skill.level >= skill.max_level
          ? ' (MAX)'
          : ` (${skill.xp} XP)`;
      emitLine(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
    }
  }
  return true;
}

function usableLabel(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function shortStatusPlaceLabel(
  location: Record<string, unknown> | undefined,
  locationNameKey: string,
  locationIdKey: string,
  namedRecord: unknown,
  playerValue: unknown,
): string | undefined {
  if (location) {
    const locatedName = usableLabel(location[locationNameKey]);
    if (locatedName !== undefined) return locatedName;
    const locatedId = usableLabel(location[locationIdKey]);
    if (locatedId !== undefined) return locatedId;
  }
  if (isRecord(namedRecord)) {
    const recordName = usableLabel(namedRecord.name);
    if (recordName !== undefined) return recordName;
  }
  return usableLabel(playerValue);
}

function shortStatusDockedLine(
  location: Record<string, unknown> | undefined,
  player: Record<string, unknown> | undefined,
): string {
  if (location) {
    const dockedAt = usableLabel(location.docked_at);
    return dockedAt !== undefined ? `  Docked: Yes (${dockedAt})` : '  Docked: No';
  }
  const dockedBase = player?.docked_at_base;
  return dockedBase ? `  Docked: Yes (${dockedBase})` : '  Docked: No';
}

function shortStatusNearby(
  location: Record<string, unknown> | undefined,
  nearby: unknown,
): { heading: string; rows: Array<Record<string, unknown>> } | undefined {
  const listed = location !== undefined && Object.hasOwn(location, 'nearby_players') ? location.nearby_players : nearby;
  const rows = Array.isArray(listed) ? listed.filter(isRecord) : [];
  const count = location?.nearby_player_count;
  const total = typeof count === 'number' && Number.isFinite(count) ? count : rows.length;
  if (rows.length === 0 && !(total > 0)) return undefined;
  return { heading: String(total), rows };
}

export function resolveShortStatusLocation(result: Record<string, unknown>): {
  system: string | undefined;
  poi: string | undefined;
  docked: string;
  nearby: { heading: string; rows: Array<Record<string, unknown>> } | undefined;
} {
  const location = isRecord(result.location) ? result.location : undefined;
  const player = isRecord(result.player) ? result.player : undefined;
  return {
    system: shortStatusPlaceLabel(location, 'system_name', 'system_id', result.system, player?.current_system),
    poi: shortStatusPlaceLabel(location, 'poi_name', 'poi_id', result.poi, player?.current_poi),
    docked: shortStatusDockedLine(location, player),
    nearby: shortStatusNearby(location, result.nearby),
  };
}

function locationHasIdentity(loc: Record<string, unknown>): boolean {
  return Boolean(loc.system_id || loc.system_name || loc.poi_id || loc.poi_name);
}

export function emitLocationSnapshot(
  result: Record<string, unknown>,
  options?: { empireNpcs?: 'count' | 'rows'; credits?: boolean; combatEffects?: boolean },
): boolean {
  if (!isRecord(result.location)) return false;
  const loc = result.location;
  const showCredits = options?.credits !== false;
  const showCombatEffects = options?.combatEffects !== false;
  const empireNpcRows = options?.empireNpcs === 'rows';
  const connections = Array.isArray(loc.connections) ? loc.connections : [];
  const nearbyPlayers = Array.isArray(loc.nearby_players) ? loc.nearby_players.filter(isRecord) : [];
  const nearbyPlayerCount = numberOrDefault(loc.nearby_player_count, nearbyPlayers.length);
  const nearbyPirates = Array.isArray(loc.nearby_pirates) ? loc.nearby_pirates.filter(isRecord) : [];
  const nearbyPirateCount = numberOrDefault(loc.nearby_pirate_count, nearbyPirates.length);
  const transitLines = locationTransitLines(loc);

  emitLine(`\n${c.bright}=== Location ===${c.reset}`);
  if (showCredits) emitCreditBalance(result);
  if (loc.system_id || loc.system_name) {
    const idText = loc.system_id && loc.system_name ? ` (${loc.system_id})` : '';
    emitLine(`${c.cyan}System:${c.reset} ${loc.system_name ?? loc.system_id}${idText}`);
  }
  if (loc.empire) emitLine(`${c.cyan}Empire:${c.reset} ${loc.empire}`);
  if (loc.security_status) emitLine(`${c.cyan}Security:${c.reset} ${loc.security_status}`);
  if (connections.length > 0) {
    emitLine(`${c.cyan}Connections:${c.reset} ${connections.join(', ')}`);
  }
  if (loc.poi_id || loc.poi_name || loc.poi_type) {
    const typeText = loc.poi_type ? ` (${loc.poi_type})` : loc.poi_id && loc.poi_name ? ` (${loc.poi_id})` : '';
    emitLine(`${c.cyan}POI:${c.reset} ${loc.poi_name ?? loc.poi_id}${typeText}`);
  }
  if (loc.docked_at) {
    emitLine(`${c.cyan}Docked at:${c.reset} ${loc.docked_at}`);
  }
  emitLines(transitLines);
  emitUnknownSignatureHint(loc);
  if (showCombatEffects && isRecord(result.ship)) emitShipCombatEffects(result.ship);
  emitLocationResources(loc.resources);
  if (nearbyPlayerCount > 0) {
    emitLine(`\n${c.bright}Nearby Players (${nearbyPlayerCount}):${c.reset}`);
    for (const player of nearbyPlayers) {
      emitLine(`  ${formatPlayer(player)}`);
    }
    if (nearbyPlayerCount > nearbyPlayers.length) {
      emitLine(`  ... and ${nearbyPlayerCount - nearbyPlayers.length} more`);
    }
  }
  const offlineCollapsed = formatOfflineCollapsedText(loc.offline_collapsed);
  if (offlineCollapsed !== undefined) emitLine(`${c.dim}${offlineCollapsed}${c.reset}`);
  emitNearbyPrizes({
    prizes: loc.nearby_prizes,
    prizeCount: loc.nearby_prize_count,
    title: 'Nearby Prizes',
  });
  if (nearbyPirateCount > 0) {
    emitLine(`\n${c.red}Nearby Pirates (${nearbyPirateCount}):${c.reset}`);
    for (const pirate of nearbyPirates) {
      emitLine(`  ${formatNearbyPirateLine(pirate)}`);
    }
    if (nearbyPirateCount > nearbyPirates.length) {
      emitLine(`  ... and ${nearbyPirateCount - nearbyPirates.length} more`);
    }
  }
  emitLeviathanContacts(loc.nearby_leviathans, 'Nearby Leviathans');
  if (empireNpcRows) {
    const npcRows = Array.isArray(loc.nearby_empire_npcs) ? loc.nearby_empire_npcs.filter(isRecord) : [];
    const rawCount = loc.nearby_empire_npc_count;
    const npcCount = typeof rawCount === 'number' && Number.isFinite(rawCount) ? rawCount : npcRows.length;
    if (npcCount !== 0 || npcRows.length !== 0) {
      const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);
      emitLine(`\n${c.dim}Nearby Empire NPCs (${npcCount}):${c.reset}`);
      for (const npc of npcRows) {
        const idText = text(npc.npc_id);
        const name = text(npc.name) ?? idText ?? 'Unknown';
        const shipName = text(npc.ship_name);
        const shipClass = text(npc.ship_class);
        const ship =
          shipName && shipClass && shipName !== shipClass ? `${shipName} / ${shipClass}` : (shipName ?? shipClass);
        const role = text(npc.role);
        const empire = text(npc.empire);
        emitLine(
          `  ${name}${idText ? ` [${idText}]` : ''}${ship ? ` (${ship})` : ''}${role ? ` - ${role}` : ''}${empire ? ` - ${empire}` : ''}${npc.in_combat === true ? ' - in combat' : ''}`,
        );
      }
      if (npcCount > npcRows.length) emitLine(`  ... and ${npcCount - npcRows.length} more`);
    }
  } else {
    const nearbyEmpireNpcCount = numberOrDefault(loc.nearby_empire_npc_count, 0);
    if (nearbyEmpireNpcCount > 0) {
      emitLine(`\n${c.dim}Nearby NPCs: ${nearbyEmpireNpcCount}${c.reset}`);
    }
  }
  return true;
}

function formatGetState(result: Record<string, unknown>, command: string | undefined): boolean {
  if (!commandNameEquals(command, 'get_state')) return false;
  if (isFlattenedDetailsView(result)) return false;
  const finiteShipNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

  const player = isRecord(result.player) ? result.player : undefined;
  const stateCredits =
    Object.hasOwn(result, 'credits') && !(player && player.credits === result.credits)
      ? formatIntegerText(result.credits)
      : undefined;

  if (player) {
    emitLine(`\n${c.bright}=== Player Status ===${c.reset}`);
    emitLine(`Username: ${c.bright}${player.username}${c.reset}`);
    if (usableLabel(player.id)) emitLine(`ID: ${player.id}`);
    if (player.empire !== undefined && player.empire !== '') emitLine(`Empire: ${player.empire}`);
    emitCitizenshipsLine(player, true);
    if (player.credits !== undefined && !isRecord(player.credits) && !Array.isArray(player.credits)) {
      emitLine(`Credits: ${player.credits}`);
    }
    if (stateCredits !== undefined) emitLine(`State credits: ${stateCredits}`);
    if (player.faction_id || player.clan_tag || player.faction_rank) {
      const faction = player.faction_id || 'None';
      const clan = player.clan_tag ? ` [${player.clan_tag}]` : '';
      const rank = player.faction_rank ? ` (${player.faction_rank})` : '';
      emitLine(`Faction: ${faction}${clan}${rank}`);
    }
    const primary =
      typeof player.primary_color === 'string' && player.primary_color.trim() !== '' ? player.primary_color : undefined;
    const secondary =
      typeof player.secondary_color === 'string' && player.secondary_color.trim() !== ''
        ? player.secondary_color
        : undefined;
    if (primary !== undefined || secondary !== undefined) {
      emitLine(`Colors: ${primary ?? '—'} / ${secondary ?? '—'}`);
    }
    if (typeof player.status_message === 'string') {
      const status = player.status_message.replaceAll(/[\r\n]+/g, ' ').trim();
      if (status) emitLine(`Status: ${status}`);
    }
    if (player.home_base) emitLine(`Home Station: ${formatDisplayValue(player.home_base)}`);
    if (usableLabel(player.home_poi)) emitLine(`Home POI: ${player.home_poi}`);
    if (typeof player.home_system === 'string' && player.home_system !== '') {
      emitLine(`Home System: ${player.home_system}`);
    }
    emitTradingRestriction(player);
    emitDetention(player);
    if (player.is_cloaked) emitLine(`${c.cyan}[CLOAKED]${c.reset}`);
    if (player.towing_wreck_id) {
      emitLine(`\n${c.bright}Towing wreck:${c.reset} ${player.towing_wreck_id}`);
      emitLine(`  (release with release_tow)`);
    } else if (player.towing_ship_id) {
      emitLine(`\n${c.bright}Towing ship:${c.reset} ${player.towing_ship_id}`);
      emitLine(`  (release when docked: storage withdraw ${player.towing_ship_id})`);
    }

    emitLifetimeStats(player.stats);
    const arenaWon = formatArenaWonLine(player.arena_won);
    if (arenaWon) emitLine(arenaWon);
    const arenaXp = formatArenaXpLine(player.arena_xp);
    if (arenaXp) emitLine(arenaXp);
    emitStandings(player, { baseline: true });
  } else if (stateCredits !== undefined) {
    emitLine(`State credits: ${stateCredits}`);
  }

  const riding = isRecord(result.riding) ? result.riding : undefined;
  const ship = isRecord(result.ship) ? result.ship : undefined;
  if (riding) {
    emitLine(
      `\n${c.bright}Riding aboard: ${riding.carrier || '?'}'s ship ${riding.ship_id ? `(${riding.ship_id})` : ''}${c.reset}`,
    );
    emitLine(`  (passenger; use 'fleet disembark' or switch_ship at station to exit)`);
  }
  if (ship) {
    emitLine(`\n${c.bright}=== Ship: ${ship.name || ship.custom_name || ship.class_name || ship.id} ===${c.reset}`);
    const shipId =
      typeof ship.id === 'string' && ship.id !== ''
        ? ship.id
        : typeof ship.ship_id === 'string' && ship.ship_id !== ''
          ? ship.ship_id
          : undefined;
    if (shipId) emitLine(`ID: ${shipId}`);
    if (ship.class_name || ship.class_id) emitLine(`Class: ${ship.class_name || ship.class_id}`);
    if (ship.custom_name) emitLine(`Custom Name: ${ship.custom_name}`);
    if (typeof ship.location === 'string' && ship.location !== '') emitLine(`Ship location: ${ship.location}`);
    emitLine(`Hull: ${ship.hull}/${ship.max_hull}`);
    emitLine(`Shield: ${ship.shield}/${ship.max_shield} (+${ship.shield_recharge}/tick)`);
    emitLine(`Armor: ${ship.armor || 0}`);
    emitLine(`Fuel: ${ship.fuel}/${ship.max_fuel}`);
    emitLine(
      `Cargo: ${ship.cargo_used}/${ship.cargo_capacity}${overCapacitySuffix(ship.cargo_used, ship.cargo_capacity)}`,
    );
    emitLine(`CPU: ${ship.cpu_used}/${ship.cpu_capacity}${overCapacitySuffix(ship.cpu_used, ship.cpu_capacity)}`);
    emitLine(
      `Power: ${ship.power_used}/${ship.power_capacity}${overCapacitySuffix(ship.power_used, ship.power_capacity)}`,
    );
    if (
      Object.hasOwn(ship, 'weapon_slots') ||
      Object.hasOwn(ship, 'defense_slots') ||
      Object.hasOwn(ship, 'utility_slots')
    ) {
      emitLine(
        `Slots: ${ship.weapon_slots ?? 0} weapon, ${ship.defense_slots ?? 0} defense, ${ship.utility_slots ?? 0} utility`,
      );
    }
    const berths = formatBerthSummary(ship.berths);
    if (berths) emitLine(`Berths: ${berths}`);
    for (const [key, label] of [
      ['ore_cargo_efficiency', 'Ore cargo'],
      ['gas_cargo_efficiency', 'Gas cargo'],
      ['ice_cargo_efficiency', 'Ice cargo'],
    ] as const) {
      const value = ship[key];
      if (finiteShipNumber(value)) {
        emitLine(`${label}: ${String(value)}% (100 size-1 units fill ${String(value)} cargo; lower is better)`);
      }
    }
    if (finiteShipNumber(ship.speed)) emitLine(`Speed: ${ship.speed}`);
    if (finiteShipNumber(ship.damage_penalty)) emitLine(`Damage penalty: ${ship.damage_penalty}`);
    if (finiteShipNumber(ship.speed_penalty)) emitLine(`Speed penalty: ${ship.speed_penalty}`);
    emitShipPersonnel(ship);
    emitShipCombatEffects(ship);
    if (ship.class_id === 'escape_pod') {
      emitLine(`\n${c.yellow}WARNING: You are in an Escape Pod!${c.reset}`);
      emitLine(`  - No cargo capacity, no weapons, no defenses`);
      emitLine(`  - Infinite fuel - travel anywhere`);
      emitLine(`  - Get to a station and commission or buy a ship with 'commission_ship' or 'browse_ships'`);
    }
  } else if (!riding) {
    emitLine(`\n${c.bright}Ship:${c.reset} (none)`);
  }

  if (Object.hasOwn(result, 'modules')) {
    emitInstalledModules(result.modules, { stats: true, empty: 'none' });
  }
  if (Object.hasOwn(result, 'drone_bay')) emitDroneBay(result.drone_bay);
  if (
    Object.hasOwn(result, 'cargo') ||
    Object.hasOwn(result, 'bay_used') ||
    Object.hasOwn(result, 'bay_capacity') ||
    Object.hasOwn(result, 'carried_ships')
  ) {
    emitCargoHold(result, { credits: false, usage: false, emptyItems: 'none' });
  }
  if (isRecord(result.location)) {
    emitLocationSnapshot(result, { empireNpcs: 'rows', credits: false, combatEffects: false });
  }

  if (Object.hasOwn(result, 'skills') && isRecord(result.skills) && !emitSkillMap(result.skills)) {
    emitLine(`\n${c.bright}=== Your Skills ===${c.reset}`);
    emitLine('none');
  }

  emitQueue(result.queue, { always: true });

  if (Object.hasOwn(result, 'missions')) {
    const missions = result.missions;
    const missionRows = Array.isArray(missions)
      ? missions.filter(isRecord)
      : isRecord(missions) && Array.isArray(missions.active)
        ? missions.active.filter(isRecord)
        : [];
    if (missionRows.length > 0) {
      emitActiveMissionsTable(result);
    } else {
      emitLine(`\n${c.bright}=== Active Missions ===${c.reset}`);
      emitLine('none');
      const maxMissions = isRecord(missions) ? missions.max_missions : undefined;
      if (typeof maxMissions === 'number' && Number.isFinite(maxMissions)) {
        emitLine(`${c.dim}missions 0/${maxMissions}${c.reset}`);
      }
    }
    if (isRecord(missions)) emitFixerAccount(missions.fixer);
  }

  emitPrizeRecoveries(result.prize_recoveries);

  if (Array.isArray(result.hints)) {
    const hints = result.hints.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
    if (hints.length > 0) {
      emitLine(`\n${c.bright}=== Hints ===${c.reset}`);
      for (const hint of hints) emitLine(`  - ${hint.trim()}`);
    }
  }
  if (typeof result.message === 'string' && result.message !== '') emitLine(`${c.dim}${result.message}${c.reset}`);
  if (typeof result.version === 'string' && result.version !== '') emitLine(`Version: ${result.version}`);

  if (isRecord(result.details) && Object.keys(result.details).length > 0) {
    emitLine(`\n${c.bright}=== Details ===${c.reset}`);
    emitLine(stringifyApiJson(result.details, 2));
  }

  return true;
}

const LOGIN_UNREAD_CHAT_COMMANDS = ['login', 'login_token', 'login_link_poll', 'auth_login_link_poll'] as const;
const LOGIN_UNREAD_CHAT_CHANNELS = ['system', 'local', 'faction', 'private'] as const;

function formatLoginUnreadCount(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  // Gameserver 0.651.1 stops each login channel at 200. 200 means 200 or more.
  if (value === 200) return '200 or more';
  return String(value);
}

function emitLoginUnreadChat(result: Record<string, unknown>, command: string | undefined): void {
  if (!LOGIN_UNREAD_CHAT_COMMANDS.some((name) => commandNameEquals(command, name))) return;
  if (!isRecord(result.unread_chat)) return;
  const unread = result.unread_chat;
  const lines = LOGIN_UNREAD_CHAT_CHANNELS.flatMap((channel) => {
    const text = formatLoginUnreadCount(unread[channel]);
    return text === undefined ? [] : [`  ${channel}: ${text}`];
  });
  if (!lines.length) return;
  emitLine(`\n${c.bright}Unread chat:${c.reset}`);
  for (const line of lines) emitLine(line);
}

export const statusFormatters = [
  // Queue state
  formatter((r) => emitQueue(r.queue), { commands: ['get_queue'] }),

  formatter(
    (r) => {
      if (typeof r.empire !== 'string' || r.empire === '') return false;
      if (typeof r.amount_paid !== 'number' || !Number.isFinite(r.amount_paid)) return false;
      if (!Array.isArray(r.outstanding_bounties)) return false;

      emitLine(`\n${c.bright}=== Bounty Paid ===${c.reset}`);
      emitLine(`Empire: ${r.empire}`);
      emitLine(`Amount paid: ${formatNumber(r.amount_paid)} cr`);
      if (r.paid_from !== undefined && r.paid_from !== null && r.paid_from !== '') {
        emitLine(`Paid from: ${r.paid_from}`);
      }
      if (r.credits !== undefined) emitLine(`Credits: ${formatNumber(r.credits)}`);
      if (r.faction_credits !== undefined) emitLine(`Faction credits: ${formatNumber(r.faction_credits)}`);
      if (r.reputation_after !== undefined) emitLine(`Reputation after: ${r.reputation_after}`);
      if (typeof r.released_from_detention === 'boolean') {
        emitLine(`Released from detention: ${r.released_from_detention ? 'yes' : 'no'}`);
      }
      const rows = r.outstanding_bounties.filter(isRecord);
      if (rows.length) {
        emitLine(`Outstanding bounties:`);
        for (const row of rows) {
          const empire = row.empire ?? 'unknown';
          const bounty =
            typeof row.bounty === 'number' && Number.isFinite(row.bounty)
              ? `${formatNumber(row.bounty)} cr`
              : String(row.bounty ?? 'unknown');
          emitLine(`  ${empire}: ${bounty}`);
        }
      } else {
        emitLine('Outstanding bounties: none');
      }
      if (typeof r.message === 'string' && r.message) emitLine(r.message);
      return true;
    },
    { commands: ['pay_bounty'] },
  ),

  // Player profile
  formatter(
    (r, command) => {
      if (!isRecord(r.player)) return false;
      const player = r.player;

      emitLine(`\n${c.bright}=== Player ===${c.reset}`);
      if (player.username) emitLine(`Username: ${player.username}`);
      if (player.credits !== undefined) emitLine(`Credits: ${formatNumber(player.credits)}`);
      emitNonZeroFixerDebt(r, command);
      if (player.empire) emitLine(`Empire: ${formatDisplayValue(player.empire)}`);
      emitCitizenshipsLine(player, true);
      if (player.faction_id || player.clan_tag || player.faction_rank) {
        const faction = player.faction_id || 'None';
        const clan = player.clan_tag ? ` [${player.clan_tag}]` : '';
        const rank = player.faction_rank ? ` (${player.faction_rank})` : '';
        emitLine(`Faction: ${faction}${clan}${rank}`);
      }
      if (player.home_base) emitLine(`Home Station: ${formatDisplayValue(player.home_base)}`);
      emitTradingRestriction(player);
      emitDetention(player);

      const stats = isRecord(player.stats) ? player.stats : undefined;
      if (stats) {
        const skillLines = [
          formatSkillSummary(stats, 'piloting', 'Piloting'),
          formatSkillSummary(stats, 'crafting', 'Crafting'),
          ...arenaStatLines(stats, player.arena_xp, player.arena_won),
        ].filter((line): line is string => Boolean(line));
        if (skillLines.length) {
          emitLine(`\n${c.bright}Stats:${c.reset}`);
          for (const line of skillLines) emitLine(`  ${line}`);
        }
      }

      emitStandings(player);
      return true;
    },
    { commands: ['get_player'] },
  ),

  // Public pilot profile (GET /api/players/{name})
  formatter(
    (r, command) => {
      if (!commandNameEquals(command, 'player_profile')) return false;
      if (typeof r.username !== 'string' || !r.username) return false;
      emitPilotProfile(r, 'web');
      return true;
    },
    { commands: ['player_profile'] },
  ),

  formatter(
    (r) => {
      emitPilotProfile(r, 'v2');
      return true;
    },
    { commands: ['get_player_profile'] },
  ),

  // Compact player status summary
  formatter(
    (r) => {
      const lines = formatStatusSummary(r);
      if (!lines) return false;
      for (const line of lines) emitLine(line);
      return true;
    },
    { commands: ['get_status_summary'] },
  ),

  formatter(formatGetState, { commands: ['get_state'] }),

  // Player status
  formatter(
    (r, command) => {
      if (!r.player) return false;
      const p = r.player as Record<string, unknown>;
      const s = isRecord(r.ship) ? r.ship : undefined;
      const poi = r.poi as Record<string, unknown> | undefined;

      emitLine(`\n${c.bright}=== Player Status ===${c.reset}`);
      emitLine(`Username: ${c.bright}${p.username}${c.reset}`);
      emitLine(`Empire: ${p.empire}`);
      if (isRecord(p)) {
        emitCitizenshipsLine(p, commandNameEquals(command, 'get_status') || commandNameEquals(command, 'get_state'));
      }
      emitLine(`Credits: ${p.credits}`);
      emitNonZeroFixerDebt(r, command);
      emitLine(`Faction: ${p.faction_id ? `${p.faction_id} (${p.faction_rank})` : 'None'}`);
      emitTradingRestriction(p);
      emitDetention(p);
      emitStandings(p);

      emitLine(`\n${c.bright}Location:${c.reset}`);
      const shortLocation = resolveShortStatusLocation(r);
      if (shortLocation.system !== undefined) emitLine(`  System: ${shortLocation.system}`);
      if (shortLocation.poi !== undefined) emitLine(`  POI: ${shortLocation.poi}`);
      emitLine(shortLocation.docked);
      if (p.is_cloaked) emitLine(`  ${c.cyan}[CLOAKED]${c.reset}`);
      const location = isRecord(r.location) ? r.location : undefined;
      emitLocationResources(location?.resources, { indent: '  ', leadingNewline: false });
      emitUnknownSignatureHint(r, location, poi);

      if (p.towing_wreck_id) {
        emitLine(`\n${c.bright}Towing wreck:${c.reset} ${p.towing_wreck_id}`);
        emitLine(`  (release with release_tow)`);
      } else if (p.towing_ship_id) {
        emitLine(`\n${c.bright}Towing ship:${c.reset} ${p.towing_ship_id}`);
        emitLine(`  (release when docked: storage withdraw ${p.towing_ship_id})`);
      }

      if (isRecord(r.riding)) {
        const ride = r.riding as Record<string, unknown>;
        emitLine(
          `\n${c.bright}Riding aboard: ${ride.carrier || '?'}'s ship ${ride.ship_id ? `(${ride.ship_id})` : ''}${c.reset}`,
        );
        emitLine(`  (passenger; use 'fleet disembark' or switch_ship at station to exit)`);
      } else if (s) {
        emitLine(`\n${c.bright}Ship: ${s.name}${c.reset} (${s.class_id})`);
        emitLine(`  Hull: ${s.hull}/${s.max_hull}`);
        emitLine(`  Shield: ${s.shield}/${s.max_shield} (+${s.shield_recharge}/tick)`);
        emitLine(`  Armor: ${s.armor || 0}`);
        emitLine(`  Fuel: ${s.fuel}/${s.max_fuel}`);
        emitLine(`  Cargo: ${s.cargo_used}/${s.cargo_capacity}${overCapacitySuffix(s.cargo_used, s.cargo_capacity)}`);
        emitLine(`  CPU: ${s.cpu_used}/${s.cpu_capacity}${overCapacitySuffix(s.cpu_used, s.cpu_capacity)}`);
        emitLine(`  Power: ${s.power_used}/${s.power_capacity}${overCapacitySuffix(s.power_used, s.power_capacity)}`);
        emitShipPersonnel(s, { indent: '  ' });
        emitShipCombatEffects(s);

        if (s.class_id === 'escape_pod') {
          emitLine(`\n${c.yellow}WARNING: You are in an Escape Pod!${c.reset}`);
          emitLine(`  - No cargo capacity, no weapons, no defenses`);
          emitLine(`  - Infinite fuel - travel anywhere`);
          emitLine(`  - Get to a station and commission or buy a ship with 'commission_ship' or 'browse_ships'`);
        }
      } else {
        emitLine(`\n${c.bright}Ship:${c.reset} (none)`);
      }

      if (r.travel_progress !== undefined) {
        const progress = Math.round((r.travel_progress as number) * 100);
        emitLine(
          `\n${c.cyan}[TRAVELING]${c.reset} ${progress}% to ${r.travel_destination || 'unknown'} (arrival tick: ${r.travel_arrival_tick || '?'})`,
        );
      }

      if (shortLocation.nearby) {
        emitLine(`\n${c.bright}Nearby Players:${c.reset} ${shortLocation.nearby.heading}`);
        for (const row of shortLocation.nearby.rows) {
          emitLine(`  - ${formatPlayer(row)}`);
        }
      }
      const offlineCollapsed = formatOfflineCollapsedText(location?.offline_collapsed);
      if (offlineCollapsed !== undefined) emitLine(`${c.dim}${offlineCollapsed}${c.reset}`);
      emitNearbyPrizes({
        prizes: location?.nearby_prizes ?? r.nearby_prizes,
        prizeCount: location?.nearby_prize_count ?? r.nearby_prize_count,
        title: 'Nearby Prizes',
      });
      emitLeviathanContacts(location?.nearby_leviathans, 'Nearby Leviathans');
      emitPrizeRecoveries(r.prize_recoveries);
      emitLoginUnreadChat(r, command);
      return true;
    },
    { commands: ['get_status'], shapeFallback: true },
  ),

  // Registration
  formatter(
    (r) => {
      if (!r.password || !r.player_id) return false;
      emitLine(`\n${c.green}${c.bright}=== Registration Successful ===${c.reset}`);
      emitLine(`Player ID: ${r.player_id}`);
      emitLine(`\n${c.yellow}${c.bright}PASSWORD: ${r.password}${c.reset}`);
      emitLine(`\n${c.red}${c.bright}CRITICAL: Save this password immediately!${c.reset}`);
      emitLine(`If lost, the account owner can reset it at https://spacemolt.com/dashboard`);
      emitLine(`\nYou are now logged in. Try these commands:`);
      emitLine(`  get_status    - See your ship and location`);
      emitLine(`  undock        - Leave the station`);
      emitLine(`  mine          - Mine resources (at asteroid belts)`);
      emitLine(`  help          - Show local command help and discovery`);
      return true;
    },
    { commands: ['register'] },
  ),

  formatter(
    (r) => {
      if (Array.isArray(r.systems)) {
        const rows = r.systems.filter(isRecord);
        printCompactTable('Systems', rows, [
          ['Name', ['name']],
          ['System ID', ['system_id']],
        ]);
        if (r.total_count !== undefined) emitLine(`${c.dim}total ${r.total_count}${c.reset}`);
        const chartRows = rows.flatMap((row) => {
          const description = chartDescription(row.description);
          return description ? [{ ...row, description }] : [];
        });
        if (chartRows.length) {
          printCompactTable(
            'Chart descriptions',
            chartRows,
            [
              ['Name', ['name']],
              ['System ID', ['system_id']],
              ['Description', ['description']],
            ],
            { maxCellWidth: 72 },
          );
        }
        return true;
      }
      if (!isMapSystemInfo(r)) return false;
      emitMapSystemInfo(r);
      return true;
    },
    { commands: ['get_map'] },
  ),

  formatter(
    (r) => {
      if (!Array.isArray(r.agents)) return false;
      const rows = r.agents.filter(isRecord);
      const agentColumns: Array<[string, string[]]> = [
        ['Name', ['username', 'name']],
        ['ID', ['player_id', 'id']],
      ];
      if (rowsHaveValue(rows, ['ship_name', 'ship_class'])) agentColumns.push(['Ship', ['ship_name', 'ship_class']]);
      if (rowsHaveValue(rows, ['faction_tag', 'clan_tag', 'faction_id'])) {
        agentColumns.push(['Faction', ['faction_tag', 'clan_tag', 'faction_id']]);
      }
      agentColumns.push(['Combat', ['in_combat']]);
      if (rowsHaveValue(rows, ['docked'])) agentColumns.push(['Docked', ['docked']]);
      if (rowsHaveValue(rows, ['offline'])) agentColumns.push(['Offline', ['offline']]);
      if (rowsHaveValue(rows, ['status_message'])) agentColumns.push(['Status', ['status_message']]);

      emitLine(`\n${c.bright}=== System Agents: ${r.system_id ?? 'current system'} ===${c.reset}`);
      if (typeof r.warning === 'string' && r.warning.trim() !== '') {
        emitLine(`${c.yellow}Warning:${c.reset} ${r.warning}`);
      }
      printCompactTable('Agents', rows, agentColumns);
      if (r.count !== undefined) emitLine(`${c.dim}count ${r.count}${c.reset}`);
      const offlineCollapsed = formatOfflineCollapsedText(r.offline_collapsed);
      if (offlineCollapsed !== undefined) emitLine(`${c.dim}${offlineCollapsed}${c.reset}`);
      return true;
    },
    { commands: ['get_system_agents'] },
  ),

  formatter(
    (r) => {
      const isV2Actions = Array.isArray(r.actions);
      const rowSource = isV2Actions ? r.actions : r.commands;
      if (!Array.isArray(rowSource)) return false;
      const rows = rowSource.filter(isRecord);
      const commandColumns: Array<[string, string[]]> = isV2Actions
        ? [['Action', ['action']]]
        : [['Command', ['name']]];
      if (isV2Actions && rowsHaveValue(rows, ['tool'])) commandColumns.push(['Tool', ['tool']]);
      if (!isV2Actions && rowsHaveValue(rows, ['category'])) commandColumns.push(['Category', ['category']]);
      if (isV2Actions && rowsHaveValue(rows, ['endpoint'])) commandColumns.push(['Endpoint', ['endpoint']]);
      commandColumns.push(['Description', ['description']]);
      printCompactTable(isV2Actions ? 'Actions' : 'Commands', rows, commandColumns, { maxCellWidth: 72 });
      return true;
    },
    { commands: ['get_commands'] },
  ),

  // System info
  namedFormatter(
    'system_info',
    ['system', 'security_status'],
    (r) => {
      const sys = (r.system || r) as Record<string, unknown>;
      if (!sys.id || !Array.isArray(sys.pois) || !Array.isArray(sys.connections)) return false;
      emitLine(`\n${c.bright}=== System: ${sys.name} ===${c.reset}`);
      emitLine(`ID: ${sys.id}`);
      emitLine(`Empire: ${sys.empire || 'None'}`);
      emitLine(`Police Level: ${sys.police_level} (${r.security_status || sys.security_status || 'unknown security'})`);
      if (sys.is_stronghold === true) emitLine('Stronghold: yes');
      if (sys.description) emitLine(`Description: ${sys.description}`);

      const pois = sys.pois as Array<Record<string, unknown> | string>;
      emitLine(`\n${c.bright}Points of Interest:${c.reset}`);
      for (const poi of pois) {
        if (typeof poi === 'string') {
          emitLine(`  - ${poi}`);
          continue;
        }
        const base = poi.has_base ? ` ${c.green}[station]${c.reset}` : '';
        emitLine(`  - ${formatSystemPoiName(poi)}${base}${formatShipCountSuffix(poi)}  ${c.dim}${poi.id}${c.reset}`);
      }

      const connections = sys.connections as Array<Record<string, unknown> | string>;
      emitLine(`\n${c.bright}Connected Systems:${c.reset}`);
      for (const conn of connections) {
        if (typeof conn === 'string') {
          emitLine(`  - ${conn}`);
          continue;
        }
        const distance = conn.distance ? ` ${c.dim}(${conn.distance} ly)${c.reset}` : '';
        emitLine(`  - ${conn.name}${distance}  ${c.dim}${conn.system_id}${c.reset}`);
      }

      const currentPoi = isRecord(r.poi) ? r.poi : undefined;
      if (currentPoi) {
        emitLine(
          `\n${c.bright}Current POI:${c.reset} ${formatSystemPoiName(currentPoi)}${formatShipCountSuffix(currentPoi)}  ${c.dim}${currentPoi.id}${c.reset}`,
        );
      }
      return true;
    },
    { commands: ['get_system'], shapeFallback: true },
  ),

  // POI info
  namedFormatter(
    'poi_info',
    ['poi'],
    (r) => {
      const poi = (r.poi || r) as Record<string, unknown>;
      if (!poi.id || !poi.type || !poi.system_id) return false;
      emitLine(`\n${c.bright}=== POI: ${poi.name} ===${c.reset}`);
      emitLine(`ID: ${poi.id}`);
      emitLine(`Type: ${poi.type}`);
      emitLine(`System: ${poi.system_id}`);
      if (poi.description) emitLine(`Description: ${poi.description}`);
      if (poi.class) emitLine(`Class: ${poi.class}`);
      const arenaLine = formatArenaPoiLine(poi.arena);
      if (arenaLine) emitLine(arenaLine);
      const deepCoreLine = formatDeepCoreLine(poi.deep_core);
      if (deepCoreLine) emitLine(deepCoreLine);
      const factionFuelReserve = poi.faction_fuel_reserve ?? r.faction_fuel_reserve;
      const factionFuelCapacity = poi.faction_fuel_capacity ?? r.faction_fuel_capacity;
      if (factionFuelReserve !== undefined || factionFuelCapacity !== undefined) {
        const reserve = factionFuelReserve ?? '?';
        const capacity = factionFuelCapacity ?? '?';
        emitLine(`Faction Fuel: ${reserve}/${capacity}`);
      }

      emitResourceInfoLines(r.resources || poi.resources);

      const base = r.base as Record<string, unknown> | undefined;
      if (poi.base_id && !base) emitLine(`\nStation Base ID: ${poi.base_id} (use 'dock' to enter)`);

      if (base) {
        emitLine(`\n${c.bright}Station: ${base.name}${c.reset}`);
        emitStationIds(base, '  ');
        if (typeof base.type === 'string' && base.type) emitLine(`  Type: ${base.type}`);
        if (base.description) emitLine(`  ${base.description}`);
        emitLine(`  Empire: ${base.empire || 'None'}`);
        if (base.faction_id) emitLine(`  Faction: ${base.faction_id}`);
        emitStationContrabandPolicy(base, '  ');
        emitStationDefences(base, '  ');
        if (base.fuel !== undefined || base.max_fuel !== undefined)
          emitLine(`  Fuel: ${base.fuel ?? '?'}/${base.max_fuel ?? '?'}`);
        emitStationFuelPricing(r, '  ');
      }

      const services = r.services as string[] | undefined;
      if (services?.length) emitLine(`\n${c.bright}Services:${c.reset} ${services.join(', ')}`);
      return true;
    },
    { commands: ['get_poi'], shapeFallback: true },
  ),

  namedFormatter(
    'nearby',
    ['nearby', 'prizes'],
    (r, command) => {
      if (r.location && typeof r.location === 'object') return false;
      const playerSource = Array.isArray(r.nearby) ? r.nearby : r.players;
      if (!Array.isArray(playerSource)) return false;
      const players = playerSource.filter(isRecord);
      const pirates = Array.isArray(r.pirates) ? r.pirates.filter(isRecord) : [];
      const arenaNpcs = Array.isArray(r.arena_npcs) ? r.arena_npcs.filter(isRecord) : [];
      const npcs = Array.isArray(r.empire_npcs) ? r.empire_npcs.filter(isRecord) : [];
      const creatures = Array.isArray(r.creatures) ? r.creatures.filter(isRecord) : [];
      const prizes = Array.isArray(r.prizes) ? r.prizes.filter(isRecord) : [];
      const playerCount =
        typeof r.nearby_player_count === 'number'
          ? r.nearby_player_count
          : typeof r.count === 'number'
            ? r.count
            : players.length;
      const pirateCount =
        typeof r.pirate_count === 'number' && Number.isFinite(r.pirate_count) ? r.pirate_count : pirates.length;
      const arenaNpcCount =
        typeof r.arena_npc_count === 'number' && Number.isFinite(r.arena_npc_count)
          ? r.arena_npc_count
          : arenaNpcs.length;
      const empireNpcCount = typeof r.empire_npc_count === 'number' ? r.empire_npc_count : npcs.length;

      emitLine(`\n${c.bright}=== Nearby ===${c.reset}`);
      emitActiveScanLine(r, command);
      emitUnknownSignatureHint(r);
      emitLine(`\n${c.bright}Players (${playerCount}):${c.reset}`);
      if (!players.length) {
        emitLine(`  (No other players at this location)`);
      } else {
        for (const p of players) emitLine(`  ${formatPlayer(p)}`);
      }
      if (playerCount > players.length) emitLine(`  ... and ${playerCount - players.length} more`);
      const offlineCollapsed = formatOfflineCollapsedText(r.offline_collapsed);
      if (offlineCollapsed !== undefined) emitLine(`${c.dim}${offlineCollapsed}${c.reset}`);

      if (pirateCount > 0) {
        emitLine(`\n${c.red}Pirates (${pirateCount}):${c.reset}`);
        for (const p of pirates) {
          emitLine(`  ${formatNearbyPirateLine(p)}`);
        }
        if (pirateCount > pirates.length) emitLine(`  ... and ${pirateCount - pirates.length} more`);
      }

      if (arenaNpcCount > 0) {
        emitLine(`\n${c.magenta}Arena NPCs (${arenaNpcCount}):${c.reset}`);
        emitLine('  (in-match only; cannot be attacked from outside — see: arena status)');
        for (const npc of arenaNpcs) {
          emitLine(`  ${formatNearbyArenaNpcLine(npc)}`);
        }
        if (arenaNpcCount > arenaNpcs.length) emitLine(`  ... and ${arenaNpcCount - arenaNpcs.length} more`);
      }

      if (empireNpcCount > 0) {
        emitLine(`\n${c.dim}Empire NPCs (${empireNpcCount}):${c.reset}`);
        for (const n of npcs) {
          const name = n.name || n.npc_id || 'Unknown';
          const ship = n.ship_class ? ` (${n.ship_class})` : '';
          emitLine(`  ${name}${ship}`);
        }
        if (empireNpcCount > npcs.length) emitLine(`  ... and ${empireNpcCount - npcs.length} more`);
      }

      const printed = creatures.length;
      const finiteCount =
        typeof r.creature_count === 'number' && Number.isFinite(r.creature_count) ? r.creature_count : undefined;
      const headerCount = finiteCount !== undefined && finiteCount >= printed ? finiteCount : printed;
      const showSection = printed > 0 || (finiteCount !== undefined && finiteCount > 0);
      if (showSection) {
        emitLine(`\n${c.green}Creatures (${headerCount}):${c.reset}`);
        for (const creature of creatures) {
          emitLine(`  ${formatCreatureLine(creature)}`);
        }
        if (finiteCount !== undefined && finiteCount > printed) {
          emitLine(`  ... and ${finiteCount - printed} more`);
        }
      }
      emitNearbyPrizes({
        prizes,
        prizeCount: typeof r.prize_count === 'number' ? r.prize_count : prizes.length,
      });
      if (commandNameEquals(command, 'subscribe_observation')) {
        const shipCounts = formatShipCountsLine(r.ship_counts);
        if (shipCounts !== undefined) emitLine(shipCounts);
      }
      return true;
    },
    { commands: ['get_nearby', 'subscribe_observation'], shapeFallback: true },
  ),

  // Skills state: skills as object map of skill_id -> skill data
  formatter((r) => emitSkillMap(r.skills), { commands: ['get_skills'], shapeFallback: true }),

  // Location info (get_location) — must come before simple message formatter since
  // the response has both r.location and r.message, which the simple formatter swallows
  formatter(
    (r) => {
      if (!isRecord(r.location)) return false;
      const loc = r.location;
      const transitLines = locationTransitLines(loc);
      if (!locationHasIdentity(loc) && transitLines.length === 0) return false;
      emitLocationSnapshot(r);
      return true;
    },
    { commands: ['get_location'], shapeFallback: true },
  ),

  formatter(
    (r) => {
      if (nativeRemotePoiId(r) !== undefined) {
        emitLine(`\n${c.bright}=== Scan Result ===${c.reset}`);
        emitFactionScanHeader(r);
        emitRemoteScanTargetLine(r);
        emitFactionScanContacts(r);
        emitFactionScanNpcs(r);
        emitFactionScanPirates(r);
        emitLeviathanContacts(nativeScanField(r, 'leviathans'), 'Leviathans');
        emitScanRevealedInfo(r);
        if (r.success === false) emitLine('Success: false');
        return true;
      }
      if (r.target_id === undefined && r.username === undefined && r.ship_class === undefined) {
        if (nativeScanField(r, 'signature_detected') === true) {
          emitSignatureDetectedLine();
          return true;
        }
        return false;
      }
      emitLine(`\n${c.bright}=== Scan Result ===${c.reset}`);
      if (nativeScanField(r, 'signature_detected') === true) emitSignatureDetectedLine();
      if (r.username) emitLine(`Target: ${r.username}${r.target_id ? ` (${r.target_id})` : ''}`);
      else if (r.target_id) emitLine(`Target: ${r.target_id}`);
      if (r.faction_id) emitLine(`Faction: ${r.faction_id}`);
      if (r.ship_class) emitLine(`Ship: ${r.ship_class}`);
      if (r.hull !== undefined) emitLine(`Hull: ${r.hull}`);
      if (r.shield !== undefined) emitLine(`Shield: ${r.shield}`);
      if (r.cloaked !== undefined) emitLine(`Cloaked: ${r.cloaked}`);
      const description = typeof r.description === 'string' && r.description ? r.description : undefined;
      const descriptionAlreadyRevealed = description
        ? Array.isArray(r.revealed_info)
          ? r.revealed_info.some((value) => value === description)
          : isRecord(r.revealed_info)
            ? Object.values(r.revealed_info).some((value) => value === description)
            : false
        : false;
      if (description && !descriptionAlreadyRevealed) emitLine(`Description: ${description}`);
      if (r.branded === true) emitLine('Branded: yes');
      if (typeof r.brand_faction === 'string' && r.brand_faction.trim() !== '') {
        emitLine(`Brand: ${r.brand_faction}`);
      }
      if (typeof r.brand_ranch === 'string' && r.brand_ranch.trim() !== '') {
        emitLine(`Ranch: ${r.brand_ranch}`);
      }
      emitScanRevealedInfo(r);
      return true;
    },
    { commands: ['scan'] },
  ),

  formatter(
    (r) => {
      if (!r.template_id && !r.title && !r.description) return false;
      emitLine(`\n${c.bright}=== Completed Mission: ${r.title ?? r.template_id ?? 'Mission'} ===${c.reset}`);
      if (r.template_id) emitLine(`ID: ${r.template_id}`);
      if (r.type) emitLine(`Type: ${r.type}`);
      if (r.difficulty !== undefined) emitLine(`Difficulty: ${r.difficulty}`);
      const giver = formatMissionGiver(r.giver);
      if (giver) emitLine(`Giver: ${giver}`);
      if (r.completion_time) emitLine(`Completed: ${r.completion_time}`);
      if (r.repeatable !== undefined) emitLine(`Repeatable: ${r.repeatable}`);
      if (r.description) emitLine(`\n${r.description}`);
      const objectives = Array.isArray(r.objectives) ? r.objectives.map(summarizeObjectiveForDisplay) : [];
      if (objectives.length) {
        emitLine(`\n${c.bright}Objectives:${c.reset}`);
        for (const objective of objectives) emitLine(`  - ${objective}`);
      }
      const rewards = summarizeRewardForDisplay(r.rewards);
      if (rewards) emitLine(`Rewards: ${rewards}`);
      const dialog = formatMissionDialog(r.dialog);
      if (dialog) emitLine(`Dialog: ${dialog}`);
      if (r.chain_next) emitLine(`Next: ${r.chain_next}`);
      return true;
    },
    { commands: ['view_completed_mission'] },
  ),

  // complete_mission: rewards-first CompleteMissionResponse (not active-missions re-list)
  formatter(
    (r) => {
      const hasCredits = r.credits_earned !== undefined && r.credits_earned !== null && r.credits_earned !== '';
      const hasIdentity = Boolean(r.mission_id && r.message);
      if (!hasCredits && !hasIdentity) return false;

      emitLine(`\n${c.bright}=== Mission Complete: ${r.title ?? r.mission_id ?? 'Mission'} ===${c.reset}`);
      if (r.mission_id) emitLine(`ID: ${r.mission_id}`);

      const rewards = summarizeCompletionRewards(r);
      if (rewards.creditsLine) emitLine(rewards.creditsLine);
      const debtRepaid = formatIntegerText(r.debt_repaid);
      if (debtRepaid !== undefined && r.debt_repaid !== 0 && r.debt_repaid !== 0n) {
        emitLine(`Debt repaid: ${debtRepaid}`);
      }
      if (rewards.itemsLine) emitLine(rewards.itemsLine);
      if (rewards.reputationLine) emitLine(rewards.reputationLine);
      if (rewards.skillXpLine) emitLine(rewards.skillXpLine);
      if (rewards.communityLine) emitLine(rewards.communityLine);
      if (r.chain_next) emitLine(`Next: ${r.chain_next}`);
      if (r.message) emitLine(String(r.message));
      emitFixerAccount(r.fixer);
      return true;
    },
    { commands: ['complete_mission'] },
  ),

  // Completed mission history list (flat CompletedMissionsResponse)
  formatter(
    (r) => {
      if (!Array.isArray(r.missions)) return false;
      const rows = r.missions.filter(isRecord).map((mission) => ({
        ...mission,
        giver_display: formatMissionGiver(mission.giver) ?? '',
      }));
      printCompactTable(
        'Completed Missions',
        rows,
        [
          ['Title', ['title', 'name']],
          ['ID', ['template_id', 'mission_id', 'id']],
          ['Type', ['type']],
          ['Diff', ['difficulty']],
          ['Completed', ['completion_time']],
          ['Giver', ['giver_display']],
        ],
        { maxCellWidth: 48 },
      );
      if (r.total_count !== undefined) emitLine(`${c.dim}total ${r.total_count}${c.reset}`);
      return true;
    },
    { commands: ['completed_missions'] },
  ),

  // Decline mission dialog (flat DeclineMissionResponse)
  formatter(
    (r) => {
      if (r.template_id === undefined && r.title === undefined) return false;
      if (typeof r.message !== 'string' || !r.message) return false;
      emitLine(`\n${c.bright}=== Mission Declined: ${r.title ?? r.template_id ?? 'Mission'} ===${c.reset}`);
      if (r.template_id) emitLine(`ID: ${r.template_id}`);
      const giver = formatMissionGiver(r.giver);
      if (giver) emitLine(`Giver: ${giver}`);
      emitLine(`"${r.message}"`);
      return true;
    },
    { commands: ['decline_mission'] },
  ),

  // Arrival (travel/jump)
  namedFormatter(
    'arrival',
    ['poi_id', 'online_players'],
    (r) => {
      if (!r.poi_id || !Array.isArray(r.online_players)) return false;
      emitLine(`\n${c.green}Arrived at ${c.bright}${r.poi || r.poi_id}${c.reset}`);
      emitUnknownSignatureHint(r);
      const players = r.online_players as Array<Record<string, unknown>>;
      const count = (r.online_players_count as number) || players.length;
      if (count > 0) {
        emitLine(`\n${c.bright}Players here (${count}):${c.reset}`);
        for (const p of players) emitLine(`  ${formatPlayer(p)}`);
        if (r.online_players_truncated) emitLine(`  ... and more`);
      } else {
        emitLine(`\n(No other players here)`);
      }
      const offlineCollapsed = formatOfflineCollapsedText(r.offline_collapsed);
      if (offlineCollapsed !== undefined) emitLine(`${c.dim}${offlineCollapsed}${c.reset}`);
      return true;
    },
    { commands: ['travel', 'jump'], shapeFallback: true },
  ),
];

function numberOrDefault(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
