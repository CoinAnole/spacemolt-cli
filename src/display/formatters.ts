import { c, firstArray, formatPlayer, printCompactTable, printItemTable } from '../runtime.ts';

export type ResultFormatter = ((result: Record<string, unknown>, command?: string) => boolean) & {
  formatterName?: string;
  hintKeys?: string[];
  commands?: readonly string[];
  shapeFallback?: boolean;
};

export interface ResultFormatterOptions {
  commands?: readonly string[];
  shapeFallback?: boolean;
}

function formatter(
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = format as ResultFormatter;
  resultFormatter.commands = options.commands;
  resultFormatter.shapeFallback = options.shapeFallback ?? false;
  return resultFormatter;
}

export function namedFormatter(
  formatterName: string,
  hintKeys: string[],
  format: (result: Record<string, unknown>, command?: string) => boolean,
  options: ResultFormatterOptions = {},
): ResultFormatter {
  const resultFormatter = formatter(format, options);
  resultFormatter.formatterName = formatterName;
  resultFormatter.hintKeys = hintKeys;
  return resultFormatter;
}

export function formatterMatchesCommand(formatter: ResultFormatter, command: string): boolean {
  const commands = formatter.commands;
  if (!commands?.length) return false;
  const normalizedCommand = command.startsWith('v2_') ? command.slice(3) : command;
  return commands.includes(command) || commands.includes(normalizedCommand);
}

export function commandScopedFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatterMatchesCommand(formatter, command));
}

export function shapeFallbackFormatters(formatters: readonly ResultFormatter[], command: string): ResultFormatter[] {
  return formatters.filter((formatter) => formatter.shapeFallback && !formatterMatchesCommand(formatter, command));
}

export const resultFormatters: ResultFormatter[] = [
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

  // Cargo
  namedFormatter(
    'cargo',
    ['cargo'],
    (r, command) => {
      if (r.cargo === undefined) return false;
      if (command !== 'get_cargo' && command !== 'v2_get_cargo' && r.used === undefined && r.cargo_used === undefined) {
        return false;
      }
      const cargo = (r.cargo as Array<Record<string, unknown>>) || [];
      console.log(`\n${c.bright}=== Cargo ===${c.reset}`);
      const used = r.used ?? r.cargo_used ?? (r.ship as Record<string, unknown> | undefined)?.cargo_used;
      const capacity =
        r.capacity ?? r.cargo_capacity ?? (r.ship as Record<string, unknown> | undefined)?.cargo_capacity;
      const available = r.available ?? r.cargo_available;
      if (used !== undefined || capacity !== undefined) {
        const suffix = available !== undefined ? ` (${available} available)` : '';
        console.log(`Used: ${used ?? '?'}/${capacity ?? '?'}${suffix}\n`);
      }
      printItemTable(cargo);
      return true;
    },
    { commands: ['get_cargo'], shapeFallback: true },
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

  // Wrecks
  formatter(
    (r) => {
      if (!Array.isArray(r.wrecks)) return false;
      const wrecks = r.wrecks as Array<Record<string, unknown>>;
      console.log(`\n${c.bright}=== Wrecks at POI ===${c.reset}`);
      if (!wrecks.length) {
        console.log(`(No wrecks at this location)`);
      } else {
        for (const w of wrecks) {
          console.log(`\n${c.yellow}Wreck: ${w.wreck_id}${c.reset}`);
          console.log(`  Ship: ${w.ship_class}`);
          console.log(`  Expires in: ${w.ticks_remaining} ticks`);
          const items = (w.items as Array<Record<string, unknown>>) || [];
          if (items.length) {
            console.log(`  Contents:`);
            for (const item of items) console.log(`    - ${item.quantity}x ${item.item_id}`);
          }
        }
      }
      return true;
    },
    { commands: ['get_wrecks'], shapeFallback: true },
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

  // Ship listings (browse_ships) — must come before market listings since both use r.listings
  formatter(
    (r) => {
      if (!Array.isArray(r.listings)) return false;
      const listings = r.listings as Array<Record<string, unknown>>;
      const firstListing = listings[0];
      if (!firstListing?.ship_id) return false;
      console.log(`\n${c.bright}=== Ships for Sale @ ${r.base_name || 'Station'} ===${c.reset}`);
      for (const listing of listings) {
        const shipClass = listing.class_id || 'Unknown';
        const shipName = listing.ship_name || shipClass;
        const price = listing.price as number;
        const formattedPrice = price.toLocaleString();
        const scale = listing.scale ? `(Scale ${listing.scale})` : '';
        const tier = listing.tier ? `T${listing.tier}` : '';
        const category = listing.category ? `${listing.category}` : '';
        const categoryTier = [category, tier].filter(Boolean).join(' - ');
        const hull = listing.hull ? `Hull: ${listing.hull}/${listing.max_hull}` : '';
        const shield = listing.shield ? `Shield: ${listing.shield}` : '';
        const stats = [hull, shield].filter(Boolean).join(', ');
        const seller = listing.seller || listing.seller_name || listing.seller_id || 'Unknown';
        console.log(`\n${c.cyan}${shipName}${c.reset} (${shipClass}) ${scale}`);
        if (categoryTier) console.log(`  ${categoryTier}`);
        console.log(`  Price: ${c.yellow}${formattedPrice} credits${c.reset}`);
        if (stats) console.log(`  ${stats}`);
        console.log(`  Seller: ${seller}`);
        console.log(`  Listing ID: ${listing.listing_id}`);
      }
      return true;
    },
    { commands: ['browse_ships'], shapeFallback: true },
  ),

  // Market listings
  formatter(
    (r) => {
      if (!Array.isArray(r.listings)) return false;
      const listings = r.listings as Array<Record<string, unknown>>;
      console.log(`\n${c.bright}=== Market Listings ===${c.reset}`);
      if (r.buy_price_modifier) {
        console.log(`Buy price modifier: ${r.buy_price_modifier}x`);
        console.log(`Sell price modifier: ${r.sell_price_modifier}x`);
      }
      if (!listings.length) {
        console.log(`\n(No listings at this market)`);
      } else {
        for (const listing of listings) {
          const seller = listing.seller_name || listing.seller || listing.seller_id || 'NPC';
          console.log(`\n  ${listing.item_id}: ${listing.quantity} @ ${listing.price_each} each`);
          console.log(`    Listing ID: ${listing.listing_id}`);
          console.log(`    Seller: ${seller}`);
        }
      }
      return true;
    },
    { commands: ['get_trades'], shapeFallback: true },
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

  // Market order book
  namedFormatter(
    'view_market',
    ['items'],
    (r) => {
      if (r.action !== 'view_market' || !r.base_id) return false;
      const items = r.items as Array<Record<string, unknown>>;
      if (!items || items.length === 0) {
        console.log(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n  (empty)`);
        return true;
      }
      console.log(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n`);
      for (const item of items) {
        const name = String(item.item_name || item.item_id || 'unknown');
        const buyOrders = item.buy_orders as Array<Record<string, unknown>> | undefined;
        const sellOrders = item.sell_orders as Array<Record<string, unknown>> | undefined;
        console.log(`${c.bright}${name}${c.reset}`);
        if (buyOrders && buyOrders.length > 0) {
          console.log(`  Buy orders (${buyOrders.length}):`);
          for (const o of buyOrders) {
            const price = Number(o.price_each).toLocaleString();
            const qty = Number(o.quantity).toLocaleString();
            const src = o.source && o.source !== 'station' && o.source !== 'player' ? ` [${o.source}]` : '';
            console.log(`    ${c.green}${price} cr${c.reset} x ${qty}${src}`);
          }
        }
        if (sellOrders && sellOrders.length > 0) {
          console.log(`  Sell orders (${sellOrders.length}):`);
          for (const o of sellOrders) {
            const price = Number(o.price_each).toLocaleString();
            const qty = Number(o.quantity).toLocaleString();
            console.log(`    ${c.red}${price} cr${c.reset} x ${qty}`);
          }
        }
        if (!buyOrders?.length && !sellOrders?.length) {
          console.log('  (no orders)');
        }
        console.log('');
      }
      return true;
    },
    { commands: ['view_market'], shapeFallback: true },
  ),

  // Station storage
  namedFormatter(
    'storage',
    ['base_id', 'items'],
    (r) => {
      if (!r.base_id || !Array.isArray(r.items)) return false;
      const items = r.items as Array<Record<string, unknown>>;
      const ships = (r.ships as Array<Record<string, unknown>>) || [];
      console.log(`\n${c.bright}=== Storage at ${r.base_id} ===${c.reset}\n`);
      printItemTable(items);
      if (ships.length) {
        const nameW = Math.max(9, ...ships.map((s) => String(s.class_name || s.class_id || '').length));
        const classW = Math.max(5, ...ships.map((s) => String(s.class_id || '').length));
        const idW = Math.max(2, ...ships.map((s) => String(s.ship_id || '').length));
        const modsW = Math.max(4, ...ships.map((s) => String(s.modules ?? '').length));
        const cargoW = Math.max(5, ...ships.map((s) => String(s.cargo_used ?? '').length));
        console.log(`\n${c.bright}Ships (${ships.length}):${c.reset}\n`);
        console.log(
          `  ${'Ship Name'.padEnd(nameW)} | ${'Class'.padEnd(classW)} | ${'Mods'.padStart(modsW)} | ${'Cargo'.padStart(cargoW)} | ${'ID'.padEnd(idW)}`,
        );
        console.log(
          `  ${'-'.repeat(nameW)}-+-${'-'.repeat(classW)}-+-${'-'.repeat(modsW)}-+-${'-'.repeat(cargoW)}-+-${'-'.repeat(idW)}`,
        );
        for (const s of ships) {
          const name = String(s.class_name || s.class_id || '').padEnd(nameW);
          const cls = String(s.class_id || '').padEnd(classW);
          const mods = String(s.modules ?? '').padStart(modsW);
          const cargo = String(s.cargo_used ?? '').padStart(cargoW);
          const id = String(s.ship_id || '').padEnd(idW);
          console.log(`  ${name} | ${cls} | ${mods} | ${cargo} | ${id}`);
        }
      }
      return true;
    },
    { commands: ['storage', 'view_storage'], shapeFallback: true },
  ),

  // Chat confirmation
  namedFormatter(
    'chat_sent',
    ['content'],
    (r) => {
      const channel = r.channel || r.target;
      if (!channel || (r.action && r.action !== 'chat')) return false;
      if (!r.action && !r.message && !r.content && !r.sent_at && !r.timestamp) return false;
      if (r.message || r.content) {
        const timestamp = r.sent_at || r.timestamp;
        const time = timestamp ? `${c.dim}${new Date(timestamp as string).toLocaleTimeString()}${c.reset} ` : '';
        console.log(`${c.green}[${channel}]${c.reset} ${time}${r.message || r.content}`);
      } else {
        console.log(`${c.green}Chat sent:${c.reset} ${channel}`);
      }
      if (r.warning) console.log(`${c.yellow}Warning:${c.reset} ${r.warning}`);
      return true;
    },
    { commands: ['chat'], shapeFallback: true },
  ),

  namedFormatter(
    'drones',
    ['drones'],
    (r) => {
      const drones = firstArray(r, ['drones']);
      if (!drones) return false;
      printCompactTable('Drones', drones, [
        ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
        ['ID', ['drone_id', 'id']],
        ['Status', ['status', 'state']],
        ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
        ['Cargo', ['cargo_used', 'cargo']],
      ]);
      return true;
    },
    { commands: ['list_drones'], shapeFallback: true },
  ),

  namedFormatter(
    'drone',
    ['drone'],
    (r) => {
      const drone = r.drone as Record<string, unknown> | undefined;
      if (!drone) return false;
      printCompactTable(
        'Drone',
        [drone],
        [
          ['Name', ['name', 'type_name', 'drone_type', 'item_id']],
          ['ID', ['drone_id', 'id']],
          ['Status', ['status', 'state']],
          ['Location', ['poi_name', 'poi_id', 'location', 'base_id']],
        ],
      );
      if (drone.script || r.script) console.log(`\n${c.bright}Script:${c.reset}\n${drone.script || r.script}`);
      return true;
    },
    { commands: ['get_drone'], shapeFallback: true },
  ),

  namedFormatter(
    'facilities',
    ['facilities'],
    (r) => {
      const facilities = firstArray(r, ['facilities', 'facility_types', 'upgrades']);
      if (!facilities) return false;
      printCompactTable('Facilities', facilities, [
        ['Name', ['name', 'type_name', 'facility_type']],
        ['ID', ['facility_id', 'id', 'type_id']],
        ['Level', ['level', 'tier']],
        ['Status', ['status', 'enabled', 'active']],
        ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
      ]);
      return true;
    },
    { commands: ['facility_list'], shapeFallback: true },
  ),

  namedFormatter(
    'facility',
    ['facility'],
    (r) => {
      const facility = r.facility as Record<string, unknown> | undefined;
      if (!facility) return false;
      printCompactTable(
        'Facility',
        [facility],
        [
          ['Name', ['name', 'type_name', 'facility_type']],
          ['ID', ['facility_id', 'id']],
          ['Level', ['level', 'tier']],
          ['Status', ['status', 'enabled', 'active']],
          ['Owner', ['owner_name', 'owner_id', 'faction_tag', 'faction_id']],
        ],
      );
      return true;
    },
    { commands: ['facility_get'], shapeFallback: true },
  ),

  namedFormatter(
    'fleet',
    ['fleet'],
    (r) => {
      const fleet = r.fleet as Record<string, unknown> | undefined;
      if (!fleet) return false;
      console.log(`\n${c.bright}=== Fleet ===${c.reset}`);
      console.log(`ID: ${fleet.fleet_id || fleet.id || 'unknown'}`);
      if (fleet.leader_name || fleet.leader_id) console.log(`Leader: ${fleet.leader_name || fleet.leader_id}`);
      const members = (fleet.members || r.members) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(members)) {
        printCompactTable('Fleet Members', members, [
          ['Name', ['username', 'name', 'player_name']],
          ['ID', ['player_id', 'id']],
          ['Ship', ['ship_class', 'ship_name']],
          ['Location', ['system_name', 'current_system', 'poi_name', 'current_poi']],
          ['Status', ['status', 'state']],
        ]);
      }
      return true;
    },
    { commands: ['fleet_status'], shapeFallback: true },
  ),

  namedFormatter(
    'battle_status',
    ['battle'],
    (r) => {
      const battle = r.battle as Record<string, unknown> | undefined;
      if (!battle) return false;
      console.log(`\n${c.bright}=== Battle ===${c.reset}`);
      console.log(`ID: ${battle.battle_id || battle.id || 'unknown'}`);
      if (battle.status || battle.phase) console.log(`Status: ${battle.status || battle.phase}`);
      if (battle.range_band || battle.range) console.log(`Range: ${battle.range_band || battle.range}`);
      const participants = (battle.participants || r.participants) as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(participants)) {
        printCompactTable('Participants', participants, [
          ['Name', ['username', 'name', 'player_name']],
          ['ID', ['player_id', 'id']],
          ['Side', ['side_id', 'side']],
          ['Stance', ['stance']],
          ['Target', ['target_name', 'target_id']],
        ]);
      }
      return true;
    },
    { commands: ['get_battle_status'], shapeFallback: true },
  ),

  namedFormatter(
    'market_orders',
    ['orders'],
    (r) => {
      const orders = firstArray(r, ['orders']);
      if (!orders) return false;
      printCompactTable('Market Orders', orders, [
        ['Item', ['item_id', 'item_name']],
        ['ID', ['order_id', 'listing_id', 'id']],
        ['Side', ['side', 'type']],
        ['Qty', ['quantity', 'remaining']],
        ['Price', ['price_each', 'price']],
      ]);
      return true;
    },
    { commands: ['view_orders'], shapeFallback: true },
  ),

  namedFormatter(
    'intel',
    ['intel'],
    (r) => {
      const intel = firstArray(r, ['intel', 'results', 'trade_intel']);
      if (!intel) return false;
      printCompactTable('Intel', intel, [
        ['System', ['system_name', 'system_id']],
        ['POI/Base', ['poi_name', 'poi_id', 'base_name', 'base_id']],
        ['Type', ['poi_type', 'resource_type', 'item_id']],
        ['Value', ['quantity', 'price_each', 'confidence']],
        ['Updated', ['updated_at', 'created_at']],
      ]);
      return true;
    },
    { commands: ['faction_query_trade_intel', 'faction_trade_intel'], shapeFallback: true },
  ),

  // Simple message
  formatter(
    (r) => {
      if (!r.message || Object.keys(r).length > 2) return false;
      console.log(`${c.green}OK:${c.reset} ${r.message}`);
      return true;
    },
    { shapeFallback: true },
  ),
];
