import { c, formatPlayer } from '../runtime.ts';
import { formatter, namedFormatter } from './helpers.ts';

export const statusFormatters = [
  // Player status
  formatter(
    (r) => {
      if (!r.player || !r.ship) return false;
      const p = r.player as Record<string, unknown>;
      const s = r.ship as Record<string, unknown>;
      const sys = r.system as Record<string, unknown> | undefined;
      const poi = r.poi as Record<string, unknown> | undefined;

      console.log(`\n${c.bright}=== Player Status ===${c.reset}`);
      console.log(`Username: ${c.bright}${p.username}${c.reset}`);
      console.log(`Empire: ${p.empire}`);
      console.log(`Credits: ${p.credits}`);
      console.log(`Faction: ${p.faction_id ? `${p.faction_id} (${p.faction_rank})` : 'None'}`);

      console.log(`\n${c.bright}Location:${c.reset}`);
      console.log(`  System: ${sys?.name || p.current_system}`);
      console.log(`  POI: ${poi?.name || p.current_poi}`);
      console.log(`  Docked: ${p.docked_at_base ? `Yes (${p.docked_at_base})` : 'No'}`);
      if (p.is_cloaked) console.log(`  ${c.cyan}[CLOAKED]${c.reset}`);

      console.log(`\n${c.bright}Ship: ${s.name}${c.reset} (${s.class_id})`);
      console.log(`  Hull: ${s.hull}/${s.max_hull}`);
      console.log(`  Shield: ${s.shield}/${s.max_shield} (+${s.shield_recharge}/tick)`);
      console.log(`  Armor: ${s.armor || 0}`);
      console.log(`  Fuel: ${s.fuel}/${s.max_fuel}`);
      console.log(`  Cargo: ${s.cargo_used}/${s.cargo_capacity}`);
      console.log(`  CPU: ${s.cpu_used}/${s.cpu_capacity}`);
      console.log(`  Power: ${s.power_used}/${s.power_capacity}`);

      if (s.class_id === 'escape_pod') {
        console.log(`\n${c.yellow}WARNING: You are in an Escape Pod!${c.reset}`);
        console.log(`  - No cargo capacity, no weapons, no defenses`);
        console.log(`  - Infinite fuel - travel anywhere`);
        console.log(`  - Get to a station and commission or buy a ship with 'commission_ship' or 'browse_ships'`);
      }

      if (r.travel_progress !== undefined) {
        const progress = Math.round((r.travel_progress as number) * 100);
        console.log(
          `\n${c.cyan}[TRAVELING]${c.reset} ${progress}% to ${r.travel_destination || 'unknown'} (arrival tick: ${r.travel_arrival_tick || '?'})`,
        );
      }

      const nearby = r.nearby as Array<Record<string, unknown>> | undefined;
      if (nearby?.length) {
        console.log(`\n${c.bright}Nearby Players:${c.reset} ${nearby.length}`);
        for (const player of nearby.slice(0, 5)) {
          console.log(`  - ${formatPlayer(player)}`);
        }
        if (nearby.length > 5) console.log(`  ... and ${nearby.length - 5} more`);
      }
      return true;
    },
    { commands: ['get_status'], shapeFallback: true },
  ),

  // Registration
  formatter(
    (r) => {
      if (!r.password || !r.player_id) return false;
      console.log(`\n${c.green}${c.bright}=== Registration Successful ===${c.reset}`);
      console.log(`Player ID: ${r.player_id}`);
      console.log(`\n${c.yellow}${c.bright}PASSWORD: ${r.password}${c.reset}`);
      console.log(`\n${c.red}${c.bright}CRITICAL: Save this password immediately!${c.reset}`);
      console.log(`If lost, the account owner can reset it at https://spacemolt.com/dashboard`);
      console.log(`\nYou are now logged in. Try these commands:`);
      console.log(`  get_status    - See your ship and location`);
      console.log(`  undock        - Leave the station`);
      console.log(`  mine          - Mine resources (at asteroid belts)`);
      console.log(`  help          - Get full command list from server`);
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
      console.log(`\n${c.bright}=== System: ${sys.name} ===${c.reset}`);
      console.log(`ID: ${sys.id}`);
      console.log(`Empire: ${sys.empire || 'None'}`);
      console.log(
        `Police Level: ${sys.police_level} (${r.security_status || sys.security_status || 'unknown security'})`,
      );
      if (sys.description) console.log(`Description: ${sys.description}`);

      const pois = sys.pois as Array<Record<string, unknown> | string>;
      console.log(`\n${c.bright}Points of Interest:${c.reset}`);
      for (const poi of pois) {
        if (typeof poi === 'string') {
          console.log(`  - ${poi}`);
          continue;
        }
        const online = (poi.online as number) > 0 ? ` ${c.cyan}(${poi.online} online)${c.reset}` : '';
        const base = poi.has_base ? ` ${c.green}[base]${c.reset}` : '';
        console.log(`  - ${poi.name} (${poi.type})${base}${online}  ${c.dim}${poi.id}${c.reset}`);
      }

      const connections = sys.connections as Array<Record<string, unknown> | string>;
      console.log(`\n${c.bright}Connected Systems:${c.reset}`);
      for (const conn of connections) {
        if (typeof conn === 'string') {
          console.log(`  - ${conn}`);
          continue;
        }
        const distance = conn.distance ? ` ${c.dim}(${conn.distance} ly)${c.reset}` : '';
        console.log(`  - ${conn.name}${distance}  ${c.dim}${conn.system_id}${c.reset}`);
      }

      const currentPoi = r.poi as Record<string, unknown> | undefined;
      if (currentPoi) {
        console.log(
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
      console.log(`\n${c.bright}=== POI: ${poi.name} ===${c.reset}`);
      console.log(`ID: ${poi.id}`);
      console.log(`Type: ${poi.type}`);
      console.log(`System: ${poi.system_id}`);
      if (poi.description) console.log(`Description: ${poi.description}`);
      if (poi.class) console.log(`Class: ${poi.class}`);

      const resources = (r.resources || poi.resources) as Array<Record<string, unknown>> | undefined;
      if (resources?.length) {
        console.log(`\n${c.bright}Resources:${c.reset}`);
        for (const res of resources) {
          const display = res.remaining_display || `${res.remaining} remaining`;
          if (display === 'depleted' || res.remaining === 0) {
            console.log(
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
          console.log(`  - ${res.name || res.resource_id}: richness ${res.richness}, ${remaining}${depletion}`);
        }
      }

      if (poi.base_id) console.log(`\nBase: ${poi.base_id} (use 'dock' to enter)`);

      const base = r.base as Record<string, unknown> | undefined;
      if (base) {
        console.log(`\n${c.bright}Base: ${base.name}${c.reset}`);
        if (base.description) console.log(`  ${base.description}`);
        console.log(`  Empire: ${base.empire || 'None'}`);
        console.log(`  Defense: ${base.defense_level}`);
      }

      const services = r.services as string[] | undefined;
      if (services?.length) console.log(`\n${c.bright}Services:${c.reset} ${services.join(', ')}`);
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

      console.log(`\n${c.bright}=== Nearby ===${c.reset}`);
      console.log(`\n${c.bright}Players (${(r.count as number) || players.length}):${c.reset}`);
      if (!players.length) {
        console.log(`  (No other players at this location)`);
      } else {
        for (const p of players) console.log(`  ${formatPlayer(p)}`);
      }

      if ((r.pirate_count as number) > 0) {
        console.log(`\n${c.red}Pirates (${r.pirate_count}):${c.reset}`);
        for (const p of pirates) {
          const name = p.name || p.pirate_id || 'Unknown';
          const ship = p.ship_class ? ` (${p.ship_class})` : '';
          const status = p.status ? ` - ${p.status}` : '';
          console.log(`  ${name}${ship}${status}`);
        }
      }

      if ((r.empire_npc_count as number) > 0) {
        console.log(`\n${c.dim}Empire NPCs (${r.empire_npc_count}):${c.reset}`);
        for (const n of npcs) {
          const name = n.name || n.npc_id || 'Unknown';
          const ship = n.ship_class ? ` (${n.ship_class})` : '';
          console.log(`  ${name}${ship}`);
        }
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
      console.log(`\n${c.bright}=== Your Skills ===${c.reset}`);
      console.log(`Total skills: ${r.player_skill_count || playerSkills.length}`);
      if (!playerSkills.length) {
        console.log(`\n(No skills trained yet - perform activities to gain XP)`);
      } else {
        const byCategory: Record<string, Array<Record<string, unknown>>> = {};
        for (const skill of playerSkills) {
          const cat = (skill.category as string) || 'Other';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(skill);
        }
        for (const [category, skills] of Object.entries(byCategory)) {
          console.log(`\n${c.cyan}${category}:${c.reset}`);
          for (const skill of skills) {
            const progress = skill.next_level_xp ? ` (${skill.current_xp}/${skill.next_level_xp} XP)` : ' (MAX)';
            console.log(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
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
      console.log(`\n${c.bright}=== Your Skills ===${c.reset}`);
      const byCategory: Record<string, typeof skillEntries> = {};
      for (const [skillId, skill] of skillEntries) {
        const cat = skill.category || 'Other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push([skillId, skill]);
      }
      for (const [category, entries] of Object.entries(byCategory)) {
        console.log(`\n${c.cyan}${category}:${c.reset}`);
        for (const [, skill] of entries) {
          const progress = skill.next_level_xp
            ? ` (${skill.xp}/${skill.next_level_xp} XP to level ${skill.level + 1})`
            : skill.level >= skill.max_level
              ? ' (MAX)'
              : ` (${skill.xp} XP)`;
          console.log(`  ${skill.name}: Level ${skill.level}/${skill.max_level}${progress}`);
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
      console.log(`\n${c.bright}=== Location ===${c.reset}`);
      console.log(`${c.cyan}System:${c.reset} ${loc.system_name} (${loc.system_id})`);
      console.log(`${c.cyan}Empire:${c.reset} ${loc.empire}`);
      console.log(`${c.cyan}Security:${c.reset} ${loc.security_status}`);
      if (loc.connections.length > 0) {
        console.log(`${c.cyan}Connections:${c.reset} ${loc.connections.join(', ')}`);
      }
      console.log(`${c.cyan}POI:${c.reset} ${loc.poi_name} (${loc.poi_type})`);
      if (loc.docked_at) {
        console.log(`${c.cyan}Docked at:${c.reset} ${loc.docked_at}`);
      }
      if (loc.nearby_player_count > 0) {
        console.log(`\n${c.bright}Nearby Players (${loc.nearby_player_count}):${c.reset}`);
        for (const player of loc.nearby_players.slice(0, 10)) {
          console.log(`  ${formatPlayer(player)}`);
        }
        if (loc.nearby_player_count > 10) {
          console.log(`  ... and ${loc.nearby_player_count - 10} more`);
        }
      }
      if (loc.nearby_pirate_count > 0) {
        console.log(`\n${c.red}Nearby Pirates: ${loc.nearby_pirate_count}${c.reset}`);
      }
      if (loc.nearby_empire_npc_count && loc.nearby_empire_npc_count > 0) {
        console.log(`\n${c.dim}Nearby NPCs: ${loc.nearby_empire_npc_count}${c.reset}`);
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
      console.log(`\n${c.green}Arrived at ${c.bright}${r.poi || r.poi_id}${c.reset}`);
      const players = r.online_players as Array<Record<string, unknown>>;
      const count = (r.online_players_count as number) || players.length;
      if (count > 0) {
        console.log(`\n${c.bright}Players here (${count}):${c.reset}`);
        for (const p of players) console.log(`  ${formatPlayer(p)}`);
        if (r.online_players_truncated) console.log(`  ... and more`);
      } else {
        console.log(`\n(No other players here)`);
      }
      return true;
    },
    { commands: ['travel', 'jump'], shapeFallback: true },
  ),
];
