import { emitShipCombatEffects } from './combat-effects.ts';
import {
  c,
  emitLine,
  emitStationFuelPricing,
  formatPlayer,
  formatter,
  isRecord,
  namedFormatter,
  printCompactTable,
} from './helpers.ts';

const NEARBY_TABLE_LIMIT = 10;

function formatNumber(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString() : String(value);
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

function formatSummaryLine(label: string, value: unknown): string {
  return `${label.padEnd(11)}${value === undefined || value === null || value === '' ? 'unknown' : String(value)}`;
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
  if (!isRecord(r.player) || !isRecord(r.ship)) return undefined;
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
  const shipClass =
    textFromRecord(ship, ['class_name', 'ship_class_name', 'class', 'ship_class', 'class_id', 'name']) ?? 'unknown';
  const skills = compactSkillEntries(r.skills ?? player.skills ?? player.stats);

  return [
    formatSummaryLine('Player:', playerName),
    formatSummaryLine('Credits:', typeof credits === 'number' ? formatNumber(credits) : credits),
    formatSummaryLine('System:', systemName),
    formatSummaryLine('Docked:', docked),
    formatSummaryLine('Ship:', shipClass),
    formatSummaryLine('Skills:', skills.length ? skills.join(' | ') : 'None'),
  ];
}

function rowsHaveValue(rows: Array<Record<string, unknown>>, keys: string[]): boolean {
  return rows.some((row) => keys.some((key) => row[key] !== undefined && row[key] !== null && row[key] !== ''));
}

function formatMissionObjectText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isRecord(value)) return String(value);

  const name = value.name ?? value.title ?? value.id ?? value.content ?? value.text ?? value.message;
  if (name !== undefined && name !== null && name !== '') return String(name);

  const json = JSON.stringify(value);
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

function formatStandingValue(value: unknown): string | undefined {
  if (isRecord(value)) {
    const reputation = value.reputation;
    if (reputation === undefined || reputation === null || reputation === '') return undefined;
    return String(reputation);
  }
  return String(value);
}

function formatCitizenshipId(value: unknown, key?: string): string | undefined {
  if (isRecord(value)) {
    const id = value.empire_id ?? value.id ?? value.name ?? key;
    return id === undefined || id === null || id === '' ? undefined : String(id);
  }
  if (typeof value === 'string') return value;
  if (value === true && key) return key;
  return undefined;
}

function formatCitizenships(value: unknown): string | undefined {
  const citizenships = Array.isArray(value)
    ? value.map((entry) => formatCitizenshipId(entry))
    : isRecord(value)
      ? Object.entries(value).map(([key, entry]) => {
          if (entry === undefined || entry === null || entry === false) return undefined;
          return formatCitizenshipId(entry, key);
        })
      : [];

  const unique = [...new Set(citizenships.filter((citizenship): citizenship is string => Boolean(citizenship)))];
  return unique.length ? unique.join(', ') : undefined;
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
  if (targetBase !== undefined) details.push(`base ${targetBase}`);
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
  if (rewards.pirate_rep !== undefined) parts.push(`pirate rep ${formatSignedNumber(rewards.pirate_rep)}`);
  if (isRecord(rewards.skill_xp)) {
    parts.push(
      Object.entries(rewards.skill_xp)
        .map(([skill, xp]) => `${skill} +${xp} XP`)
        .join(', '),
    );
  }
  return parts.filter(Boolean).join('; ');
}

export const statusFormatters = [
  // Queue state
  formatter(
    (r) => {
      if (!isRecord(r.queue) || r.queue.has_pending === undefined) return false;
      const hasPending = r.queue.has_pending === true;
      emitLine(`\n${c.bright}=== Queue ===${c.reset}`);
      emitLine(`Queue: ${hasPending ? '1 action pending' : 'empty'}`);
      return true;
    },
    { commands: ['get_queue'] },
  ),

  // Player profile
  formatter(
    (r) => {
      if (!isRecord(r.player)) return false;
      const player = r.player;

      emitLine(`\n${c.bright}=== Player ===${c.reset}`);
      if (player.username) emitLine(`Username: ${player.username}`);
      if (player.credits !== undefined) emitLine(`Credits: ${formatNumber(player.credits)}`);
      if (player.empire) emitLine(`Empire: ${formatDisplayValue(player.empire)}`);
      const citizenships = formatCitizenships(player.citizenships ?? player.held_citizenships ?? player.citizenship);
      if (citizenships) emitLine(`Citizenships: ${citizenships}`);
      if (player.faction_id || player.clan_tag || player.faction_rank) {
        const faction = player.faction_id || 'None';
        const clan = player.clan_tag ? ` [${player.clan_tag}]` : '';
        const rank = player.faction_rank ? ` (${player.faction_rank})` : '';
        emitLine(`Faction: ${faction}${clan}${rank}`);
      }
      if (player.home_base) emitLine(`Home Base: ${formatDisplayValue(player.home_base)}`);

      const stats = isRecord(player.stats) ? player.stats : undefined;
      if (stats) {
        const skillLines = [
          formatSkillSummary(stats, 'piloting', 'Piloting'),
          formatSkillSummary(stats, 'crafting', 'Crafting'),
        ].filter((line): line is string => Boolean(line));
        if (skillLines.length) {
          emitLine(`\n${c.bright}Stats:${c.reset}`);
          for (const line of skillLines) emitLine(`  ${line}`);
        }
      }

      if (isRecord(player.standings)) {
        const standings = Object.entries(player.standings)
          .filter(([, value]) => value !== undefined && value !== null && value !== '')
          .map(([key, value]) => {
            const standing = formatStandingValue(value);
            return standing === undefined ? undefined : `${key}: ${standing}`;
          })
          .filter((standing): standing is string => Boolean(standing));
        if (standings.length) {
          emitLine(`\n${c.bright}Standings:${c.reset}`);
          emitLine(`  ${standings.join(', ')}`);
        }
      }
      return true;
    },
    { commands: ['get_player'] },
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

  // Player status
  formatter(
    (r) => {
      if (!r.player || !r.ship) return false;
      const p = r.player as Record<string, unknown>;
      const s = r.ship as Record<string, unknown>;
      const sys = r.system as Record<string, unknown> | undefined;
      const poi = r.poi as Record<string, unknown> | undefined;

      emitLine(`\n${c.bright}=== Player Status ===${c.reset}`);
      emitLine(`Username: ${c.bright}${p.username}${c.reset}`);
      emitLine(`Empire: ${p.empire}`);
      const citizenships = formatCitizenships(p.citizenships ?? p.held_citizenships ?? p.citizenship);
      if (citizenships) emitLine(`Citizenships: ${citizenships}`);
      emitLine(`Credits: ${p.credits}`);
      emitLine(`Faction: ${p.faction_id ? `${p.faction_id} (${p.faction_rank})` : 'None'}`);

      emitLine(`\n${c.bright}Location:${c.reset}`);
      emitLine(`  System: ${sys?.name || p.current_system}`);
      emitLine(`  POI: ${poi?.name || p.current_poi}`);
      emitLine(`  Docked: ${p.docked_at_base ? `Yes (${p.docked_at_base})` : 'No'}`);
      if (p.is_cloaked) emitLine(`  ${c.cyan}[CLOAKED]${c.reset}`);

      emitLine(`\n${c.bright}Ship: ${s.name}${c.reset} (${s.class_id})`);
      emitLine(`  Hull: ${s.hull}/${s.max_hull}`);
      emitLine(`  Shield: ${s.shield}/${s.max_shield} (+${s.shield_recharge}/tick)`);
      emitLine(`  Armor: ${s.armor || 0}`);
      emitLine(`  Fuel: ${s.fuel}/${s.max_fuel}`);
      emitLine(`  Cargo: ${s.cargo_used}/${s.cargo_capacity}`);
      emitLine(`  CPU: ${s.cpu_used}/${s.cpu_capacity}`);
      emitLine(`  Power: ${s.power_used}/${s.power_capacity}`);
      emitShipCombatEffects(s);

      if (s.class_id === 'escape_pod') {
        emitLine(`\n${c.yellow}WARNING: You are in an Escape Pod!${c.reset}`);
        emitLine(`  - No cargo capacity, no weapons, no defenses`);
        emitLine(`  - Infinite fuel - travel anywhere`);
        emitLine(`  - Get to a station and commission or buy a ship with 'commission_ship' or 'browse_ships'`);
      }

      if (r.travel_progress !== undefined) {
        const progress = Math.round((r.travel_progress as number) * 100);
        emitLine(
          `\n${c.cyan}[TRAVELING]${c.reset} ${progress}% to ${r.travel_destination || 'unknown'} (arrival tick: ${r.travel_arrival_tick || '?'})`,
        );
      }

      const nearby = r.nearby as Array<Record<string, unknown>> | undefined;
      if (nearby?.length) {
        emitLine(`\n${c.bright}Nearby Players:${c.reset} ${nearby.length}`);
        for (const player of nearby.slice(0, NEARBY_TABLE_LIMIT)) {
          emitLine(`  - ${formatPlayer(player)}`);
        }
        if (nearby.length > NEARBY_TABLE_LIMIT) emitLine(`  ... and ${nearby.length - NEARBY_TABLE_LIMIT} more`);
      }
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
      if (!Array.isArray(r.systems)) return false;
      printCompactTable('Systems', r.systems.filter(isRecord), [
        ['Name', ['name']],
        ['System ID', ['system_id']],
      ]);
      if (r.total_count !== undefined) emitLine(`${c.dim}total ${r.total_count}${c.reset}`);
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
      if (rowsHaveValue(rows, ['offline'])) agentColumns.push(['Offline', ['offline']]);
      if (rowsHaveValue(rows, ['status_message'])) agentColumns.push(['Status', ['status_message']]);

      emitLine(`\n${c.bright}=== System Agents: ${r.system_id ?? 'current system'} ===${c.reset}`);
      printCompactTable('Agents', rows, agentColumns);
      if (r.count !== undefined) emitLine(`${c.dim}count ${r.count}${c.reset}`);
      if (r.offline_collapsed !== undefined) emitLine(`${c.dim}offline collapsed ${r.offline_collapsed}${c.reset}`);
      return true;
    },
    { commands: ['get_system_agents'] },
  ),

  formatter(
    (r) => {
      if (!Array.isArray(r.commands)) return false;
      const rows = r.commands.filter(isRecord);
      const commandColumns: Array<[string, string[]]> = [['Command', ['name']]];
      if (rowsHaveValue(rows, ['category'])) commandColumns.push(['Category', ['category']]);
      commandColumns.push(['Description', ['description']]);
      printCompactTable('Commands', rows, commandColumns, { maxCellWidth: 72 });
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
      if (sys.description) emitLine(`Description: ${sys.description}`);

      const pois = sys.pois as Array<Record<string, unknown> | string>;
      emitLine(`\n${c.bright}Points of Interest:${c.reset}`);
      for (const poi of pois) {
        if (typeof poi === 'string') {
          emitLine(`  - ${poi}`);
          continue;
        }
        const online = (poi.online as number) > 0 ? ` ${c.cyan}(${poi.online} online)${c.reset}` : '';
        const base = poi.has_base ? ` ${c.green}[base]${c.reset}` : '';
        emitLine(`  - ${poi.name} (${poi.type})${base}${online}  ${c.dim}${poi.id}${c.reset}`);
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

      const currentPoi = r.poi as Record<string, unknown> | undefined;
      if (currentPoi) {
        emitLine(
          `\n${c.bright}Current POI:${c.reset} ${currentPoi.name} (${currentPoi.type})  ${c.dim}${currentPoi.id}${c.reset}`,
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
      const factionFuelReserve = poi.faction_fuel_reserve ?? r.faction_fuel_reserve;
      const factionFuelCapacity = poi.faction_fuel_capacity ?? r.faction_fuel_capacity;
      if (factionFuelReserve !== undefined || factionFuelCapacity !== undefined) {
        const reserve = factionFuelReserve ?? '?';
        const capacity = factionFuelCapacity ?? '?';
        emitLine(`Faction Fuel: ${reserve}/${capacity}`);
      }

      const resources = (r.resources || poi.resources) as Array<Record<string, unknown>> | undefined;
      if (resources?.length) {
        emitLine(`\n${c.bright}Resources:${c.reset}`);
        for (const res of resources) {
          const display = res.remaining_display || `${res.remaining} remaining`;
          if (display === 'depleted' || res.remaining === 0) {
            emitLine(
              `  - \x1b[9m${c.dim}${res.name || res.resource_id}: richness ${res.richness}, depleted${c.reset}\x1b[29m`,
            );
            continue;
          }

          let depletion = '';
          if (res.depletion_percent !== undefined) {
            const pct = Number(res.depletion_percent);
            const color = pct > 25 ? c.green : pct >= 5 ? c.yellow : c.red;
            depletion = ` (${color}${pct.toFixed(2)}% remaining${c.reset})`;
          }
          const remaining = res.max_remaining ? `${res.remaining}/${res.max_remaining}` : display;
          emitLine(`  - ${res.name || res.resource_id}: richness ${res.richness}, ${remaining}${depletion}`);
        }
      }

      if (poi.base_id) emitLine(`\nBase: ${poi.base_id} (use 'dock' to enter)`);

      const base = r.base as Record<string, unknown> | undefined;
      if (base) {
        emitLine(`\n${c.bright}Base: ${base.name}${c.reset}`);
        if (base.description) emitLine(`  ${base.description}`);
        emitLine(`  Empire: ${base.empire || 'None'}`);
        emitLine(`  Defense: ${base.defense_level}`);
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

  // Nearby players, pirates, and empire NPCs
  namedFormatter(
    'nearby',
    ['nearby'],
    (r) => {
      if (r.location && typeof r.location === 'object') return false;
      const players = (Array.isArray(r.nearby) ? r.nearby : r.players) as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(players)) return false;
      const pirates = (r.pirates as Array<Record<string, unknown>>) || [];
      const npcs = (r.empire_npcs as Array<Record<string, unknown>>) || [];
      const playerCount =
        typeof r.nearby_player_count === 'number'
          ? r.nearby_player_count
          : typeof r.count === 'number'
            ? r.count
            : players.length;
      const empireNpcCount = typeof r.empire_npc_count === 'number' ? r.empire_npc_count : npcs.length;

      emitLine(`\n${c.bright}=== Nearby ===${c.reset}`);
      emitLine(`\n${c.bright}Players (${playerCount}):${c.reset}`);
      if (!players.length) {
        emitLine(`  (No other players at this location)`);
      } else {
        for (const p of players.slice(0, NEARBY_TABLE_LIMIT)) emitLine(`  ${formatPlayer(p)}`);
        if (playerCount > NEARBY_TABLE_LIMIT) emitLine(`  ... and ${playerCount - NEARBY_TABLE_LIMIT} more`);
      }

      if ((r.pirate_count as number) > 0) {
        emitLine(`\n${c.red}Pirates (${r.pirate_count}):${c.reset}`);
        for (const p of pirates) {
          const name = p.name || p.pirate_id || 'Unknown';
          const ship = p.ship_class ? ` (${p.ship_class})` : '';
          const status = p.status ? ` - ${p.status}` : '';
          emitLine(`  ${name}${ship}${status}`);
        }
      }

      if (empireNpcCount > 0) {
        emitLine(`\n${c.dim}Empire NPCs (${empireNpcCount}):${c.reset}`);
        for (const n of npcs.slice(0, NEARBY_TABLE_LIMIT)) {
          const name = n.name || n.npc_id || 'Unknown';
          const ship = n.ship_class ? ` (${n.ship_class})` : '';
          emitLine(`  ${name}${ship}`);
        }
        if (empireNpcCount > NEARBY_TABLE_LIMIT) emitLine(`  ... and ${empireNpcCount - NEARBY_TABLE_LIMIT} more`);
      }
      return true;
    },
    { commands: ['get_nearby'], shapeFallback: true },
  ),

  // Skills state: skills as object map of skill_id -> skill data
  formatter(
    (r) => {
      if (!r.skills || typeof r.skills !== 'object' || Array.isArray(r.skills)) return false;
      const skills = r.skills as Record<
        string,
        {
          name: string;
          category: string;
          level: number;
          max_level: number;
          xp: number;
          next_level_xp?: number;
        }
      >;
      const skillEntries = Object.entries(skills);
      if (skillEntries.length === 0) return false;
      const firstSkill = skillEntries[0]?.[1];
      // Verify this looks like a skills map (entries should have name/level)
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
    },
    { commands: ['get_skills'], shapeFallback: true },
  ),

  // Location info (get_location) — must come before simple message formatter since
  // the response has both r.location and r.message, which the simple formatter swallows
  formatter(
    (r) => {
      if (!isRecord(r.location)) return false;
      const loc = r.location;
      if (!loc.system_id && !loc.system_name && !loc.poi_id && !loc.poi_name) return false;
      const connections = Array.isArray(loc.connections) ? loc.connections : [];
      const nearbyPlayers = Array.isArray(loc.nearby_players) ? loc.nearby_players.filter(isRecord) : [];
      const nearbyPlayerCount = numberOrDefault(loc.nearby_player_count, nearbyPlayers.length);
      const nearbyPirateCount = numberOrDefault(loc.nearby_pirate_count, 0);
      const nearbyEmpireNpcCount = numberOrDefault(loc.nearby_empire_npc_count, 0);

      emitLine(`\n${c.bright}=== Location ===${c.reset}`);
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
      if (nearbyPlayerCount > 0) {
        emitLine(`\n${c.bright}Nearby Players (${nearbyPlayerCount}):${c.reset}`);
        for (const player of nearbyPlayers.slice(0, NEARBY_TABLE_LIMIT)) {
          emitLine(`  ${formatPlayer(player)}`);
        }
        if (nearbyPlayerCount > NEARBY_TABLE_LIMIT) {
          emitLine(`  ... and ${nearbyPlayerCount - NEARBY_TABLE_LIMIT} more`);
        }
      }
      if (nearbyPirateCount > 0) {
        emitLine(`\n${c.red}Nearby Pirates: ${nearbyPirateCount}${c.reset}`);
      }
      if (nearbyEmpireNpcCount > 0) {
        emitLine(`\n${c.dim}Nearby NPCs: ${nearbyEmpireNpcCount}${c.reset}`);
      }
      return true;
    },
    { commands: ['get_location'], shapeFallback: true },
  ),

  formatter(
    (r) => {
      if (r.target_id === undefined && r.username === undefined && r.ship_class === undefined) return false;
      emitLine(`\n${c.bright}=== Scan Result ===${c.reset}`);
      if (r.username) emitLine(`Target: ${r.username}${r.target_id ? ` (${r.target_id})` : ''}`);
      else if (r.target_id) emitLine(`Target: ${r.target_id}`);
      if (r.faction_id) emitLine(`Faction: ${r.faction_id}`);
      if (r.ship_class) emitLine(`Ship: ${r.ship_class}`);
      if (r.hull !== undefined) emitLine(`Hull: ${r.hull}`);
      if (r.shield !== undefined) emitLine(`Shield: ${r.shield}`);
      if (r.cloaked !== undefined) emitLine(`Cloaked: ${r.cloaked}`);
      if (Array.isArray(r.revealed_info)) {
        const revealed = r.revealed_info
          .filter((value) => value !== undefined && value !== null && !isRecord(value) && !Array.isArray(value))
          .map(String);
        if (revealed.length) {
          emitLine(`\n${c.bright}Revealed:${c.reset}`);
          for (const value of revealed) emitLine(`  ${value}`);
        }
      } else if (isRecord(r.revealed_info)) {
        emitLine(`\n${c.bright}Revealed:${c.reset}`);
        for (const [key, value] of Object.entries(r.revealed_info)) {
          if (value === undefined || value === null || isRecord(value) || Array.isArray(value)) continue;
          emitLine(`  ${key}: ${value}`);
        }
      }
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

  // Arrival (travel/jump)
  namedFormatter(
    'arrival',
    ['poi_id', 'online_players'],
    (r) => {
      if (!r.poi_id || !Array.isArray(r.online_players)) return false;
      emitLine(`\n${c.green}Arrived at ${c.bright}${r.poi || r.poi_id}${c.reset}`);
      const players = r.online_players as Array<Record<string, unknown>>;
      const count = (r.online_players_count as number) || players.length;
      if (count > 0) {
        emitLine(`\n${c.bright}Players here (${count}):${c.reset}`);
        for (const p of players) emitLine(`  ${formatPlayer(p)}`);
        if (r.online_players_truncated) emitLine(`  ... and more`);
      } else {
        emitLine(`\n(No other players here)`);
      }
      return true;
    },
    { commands: ['travel', 'jump'], shapeFallback: true },
  ),
];

function numberOrDefault(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}
