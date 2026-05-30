import { c, emitLine, formatPlayer, formatter, isRecord, namedFormatter } from './helpers.ts';

const NEARBY_TABLE_LIMIT = 10;

function formatNumber(value: unknown): string {
  return typeof value === 'number' ? value.toLocaleString() : String(value);
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
        if (r.fuel_price !== undefined) emitLine(`  Fuel Price: ${r.fuel_price} credits`);
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

  // Skills (v2 format: player_skills array + skills metadata)
  formatter(
    (r) => {
      if (r.skills === undefined || r.player_skills === undefined) return false;
      const playerSkills = (r.player_skills as Array<Record<string, unknown>>) || [];
      emitLine(`\n${c.bright}=== Your Skills ===${c.reset}`);
      emitLine(`Total skills: ${r.player_skill_count || playerSkills.length}`);
      if (!playerSkills.length) {
        emitLine(`\n(No skills trained yet - perform activities to gain XP)`);
      } else {
        const byCategory: Record<string, Array<Record<string, unknown>>> = {};
        for (const skill of playerSkills) {
          const cat = (skill.category as string) || 'Other';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(skill);
        }
        for (const [category, skills] of Object.entries(byCategory)) {
          emitLine(`\n${c.cyan}${category}:${c.reset}`);
          for (const skill of skills) {
            const progress = skill.next_level_xp ? ` (${skill.current_xp}/${skill.next_level_xp} XP)` : ' (MAX)';
            emitLine(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
          }
        }
      }
      return true;
    },
    { commands: ['get_skills'], shapeFallback: true },
  ),

  // Skills (v1 format: skills as object map of skill_id -> skill data)
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
      for (const [skillId, skill] of skillEntries) {
        const cat = skill.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push([skillId, skill]);
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
      if (!r.location || typeof r.location !== 'object') return false;
      const loc = r.location as {
        system_id: string;
        system_name: string;
        empire: string;
        security_status: string;
        connections: string[];
        poi_id: string;
        poi_name: string;
        poi_type: string;
        docked_at?: string;
        nearby_players: Array<Record<string, unknown>>;
        nearby_player_count: number;
        nearby_pirates: Array<Record<string, unknown>>;
        nearby_pirate_count: number;
        nearby_empire_npcs?: Array<Record<string, unknown>>;
        nearby_empire_npc_count?: number;
      };
      emitLine(`\n${c.bright}=== Location ===${c.reset}`);
      emitLine(`${c.cyan}System:${c.reset} ${loc.system_name} (${loc.system_id})`);
      emitLine(`${c.cyan}Empire:${c.reset} ${loc.empire}`);
      emitLine(`${c.cyan}Security:${c.reset} ${loc.security_status}`);
      if (loc.connections.length > 0) {
        emitLine(`${c.cyan}Connections:${c.reset} ${loc.connections.join(', ')}`);
      }
      emitLine(`${c.cyan}POI:${c.reset} ${loc.poi_name} (${loc.poi_type})`);
      if (loc.docked_at) {
        emitLine(`${c.cyan}Docked at:${c.reset} ${loc.docked_at}`);
      }
      if (loc.nearby_player_count > 0) {
        emitLine(`\n${c.bright}Nearby Players (${loc.nearby_player_count}):${c.reset}`);
        for (const player of loc.nearby_players.slice(0, NEARBY_TABLE_LIMIT)) {
          emitLine(`  ${formatPlayer(player)}`);
        }
        if (loc.nearby_player_count > NEARBY_TABLE_LIMIT) {
          emitLine(`  ... and ${loc.nearby_player_count - NEARBY_TABLE_LIMIT} more`);
        }
      }
      if (loc.nearby_pirate_count > 0) {
        emitLine(`\n${c.red}Nearby Pirates: ${loc.nearby_pirate_count}${c.reset}`);
      }
      if (loc.nearby_empire_npc_count && loc.nearby_empire_npc_count > 0) {
        emitLine(`\n${c.dim}Nearby NPCs: ${loc.nearby_empire_npc_count}${c.reset}`);
      }
      return true;
    },
    { commands: ['get_location'], shapeFallback: true },
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
