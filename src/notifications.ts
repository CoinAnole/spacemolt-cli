import type { CliWriter } from './cli-context.ts';
import { c, QUIET } from './runtime.ts';
import type { APIResponse } from './types.ts';

type NotificationData = Record<string, unknown>;
type NotificationHandler = (data: NotificationData, time: string) => void;

let writeLine = (message?: string) => console.log(message);

const notificationHandlers: Record<string, NotificationHandler> = {
  chat_message: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[CHAT:${d.channel || 'local'}]${c.reset} ${c.bright}${d.sender || 'Unknown'}${c.reset}: ${d.content || ''}`,
    );
  },

  combat_update: (d, t) => {
    const destroyed = d.destroyed ? ' - DESTROYED!' : '';
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[COMBAT]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} ${d.damage_type || 'unknown'} damage (shield: ${d.shield_hit || 0}, hull: ${d.hull_hit || 0})${destroyed}`,
    );
  },

  player_died: (d, t) => {
    const cause = d.cause || 'combat';
    if (cause === 'self_destruct') {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Self-destructed!`);
    } else if (cause === 'police') {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Destroyed by system police!`);
    } else {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[DEATH]${c.reset} Destroyed by ${d.killer_name || 'unknown'}!`,
      );
    }
    if (d.combat_log) {
      const log = d.combat_log as Record<string, unknown>;
      if (log.message) writeLine(`  ${log.message}`);
      if (log.attacker_ship) writeLine(`  Attacker ship: ${log.attacker_ship}`);
      if (log.weapons_used && Object.keys(log.weapons_used).length > 0) {
        const weapons = Object.entries(log.weapons_used)
          .map(([w, n]) => `${w} (x${n})`)
          .join(', ');
        writeLine(`  Weapons: ${weapons}`);
      }
      if ((log.total_damage as number) > 0) {
        writeLine(
          `  Damage taken: ${log.total_damage} total (${log.shield_damage || 0} shield, ${log.hull_damage || 0} hull) over ${log.combat_rounds || 0} round${log.combat_rounds !== 1 ? 's' : ''}`,
        );
      }
      if (log.death_location) writeLine(`  Location: ${log.death_location} in ${log.death_system || 'unknown'}`);
    }
    if (d.ship_lost) writeLine(`  Ship lost: ${d.ship_lost}`);
    if ((d.clone_cost as number) > 0) writeLine(`  Clone cost: ${d.clone_cost} credits`);
    if ((d.insurance_payout as number) > 0) writeLine(`  Insurance payout: ${d.insurance_payout} credits`);
    writeLine(`  Respawned at: ${d.respawn_base || 'home'} with ship fully repaired`);
  },

  mining_yield: (d, t) => {
    const remainingMsg = d.remaining !== undefined ? ` (${d.remaining} remaining at POI)` : '';
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[MINED]${c.reset} +${d.quantity || 0}x ${d.resource_id || 'ore'}${remainingMsg}`,
    );
  },

  trade_offer_received: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Offer from ${d.from_name || 'Someone'} (ID: ${d.trade_id || ''})`,
    );
    if ((d.offer_credits as number) > 0) writeLine(`  Offering: ${d.offer_credits} credits`);
    if ((d.request_credits as number) > 0) writeLine(`  Requesting: ${d.request_credits} credits`);
    writeLine(`  Use: trade_accept trade_id=${d.trade_id} or trade_decline trade_id=${d.trade_id}`);
  },

  scan_result: (d, t) => {
    const target = d.username || d.target_id || 'unknown';
    if (d.success) {
      const revealed = (d.revealed_info as string[]) || [];
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[SCAN]${c.reset} Scan of ${target} revealed: ${revealed.join(', ')}`,
      );
      if (d.ship_class) writeLine(`  Ship: ${d.ship_class}`);
      if (d.hull !== undefined) writeLine(`  Hull: ${d.hull}`);
      if (d.shield !== undefined) writeLine(`  Shield: ${d.shield}`);
      if (d.cloaked !== undefined) writeLine(`  Cloaked: ${d.cloaked}`);
    } else {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[SCAN]${c.reset} Scan of ${target} failed - insufficient scan power`,
      );
    }
  },

  scan_detected: (d, t) => {
    const revealed = (d.revealed_info as string[]) || [];
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[SCANNED]${c.reset} You were scanned by ${d.scanner_username || 'Unknown'} (${d.scanner_ship_class || 'unknown'})`,
    );
    writeLine(`  They learned: ${revealed.join(', ')}`);
  },

  police_warning: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.message}`);
    writeLine(`  Security level: ${d.police_level || 0}, Response in: ${d.response_ticks || 0} tick(s)`);
  },

  police_spawn: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.num_drones || 0} police drone(s) arrived!`,
    );
  },

  police_combat: (d, t) => {
    const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[POLICE]${c.reset} Police drone dealt ${d.damage || 0} damage${destroyed}`,
    );
  },

  skill_level_up: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[LEVEL UP]${c.reset} ${d.skill_id || 'unknown'} is now level ${d.new_level || 0}! (+${d.xp_gained || 0} XP)`,
    );
  },

  drone_update: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.blue}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone dealt ${d.damage || 0} damage to ${d.target_id || 'target'}`,
    );
  },

  drone_destroyed: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone was destroyed! (ID: ${d.drone_id || ''})`,
    );
  },

  pilotless_ship: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[PILOTLESS]${c.reset} ${d.player_username || 'unknown'}'s ${d.ship_class || 'ship'} is now pilotless!`,
    );
    writeLine(`  Vulnerable for ${d.ticks_remaining || 0} ticks - can be attacked without resistance`);
  },

  reconnected: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[RECONNECTED]${c.reset} ${d.message}`);
    if (d.was_pilotless) writeLine(`  Ship was pilotless - recovered with ${d.ticks_remaining || 0} ticks to spare`);
  },

  faction_invite: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.magenta}[FACTION]${c.reset} You've been invited to join ${d.faction_name || 'a faction'}`,
    );
    writeLine(
      `  Use: join_faction faction_id=${d.faction_id || ''} or faction_decline_invite faction_id=${d.faction_id || ''}`,
    );
  },

  faction_war_declared: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[WAR]${c.reset} ${d.attacker_name || 'a faction'} has declared war on your faction!`,
    );
    writeLine(`  Reason: ${d.reason || 'no reason given'}`);
  },

  faction_peace_proposed: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[PEACE]${c.reset} ${d.proposer_name || 'a faction'} has proposed peace!`,
    );
    writeLine(`  Terms: ${d.terms || 'unconditional'}`);
    writeLine(`  Use: faction_accept_peace target_faction_id=${d.faction_id || ''}`);
  },

  base_raid_update: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[RAID]${c.reset} ${d.base_name || 'base'}: ${d.current_health || 0}/${d.max_health || 0} HP (-${d.damage_per_tick || 0}/tick)`,
    );
  },

  base_destroyed: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BASE DESTROYED]${c.reset} ${d.base_name || 'base'} has been destroyed!`,
    );
    if (d.wreck_id) writeLine(`  Wreck ID for looting: ${d.wreck_id}`);
  },

  player_kill: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[KILL]${c.reset} You destroyed ${d.victim_name || d.target_name || 'unknown'}!`,
    );
    if (d.bounty) writeLine(`  Bounty: ${d.bounty} credits`);
    if (d.wreck_id) writeLine(`  Wreck: ${d.wreck_id}`);
  },

  pirate_warning: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.message || 'Pirates detected nearby!'}`);
  },

  pirate_spawn: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.num_pirates || 1} pirate(s) appeared!`);
  },

  pirate_combat: (d, t) => {
    const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
    writeLine(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} Pirate dealt ${d.damage || 0} damage${destroyed}`);
  },

  pirate_destroyed: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[PIRATES]${c.reset} Pirate destroyed!`);
    if (d.loot) writeLine(`  Loot: ${JSON.stringify(d.loot)}`);
  },

  battle_started: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BATTLE]${c.reset} Battle started! ID: ${d.battle_id || 'unknown'}`,
    );
  },

  battle_update: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} Battle tick ${d.tick || '?'} - ${d.message || 'combat continues'}`,
    );
  },

  battle_damage: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} damage`,
    );
  },

  battle_joined: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} joined the battle`);
  },

  battle_left: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} left the battle`);
  },

  battle_ended: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[BATTLE]${c.reset} Battle ended! ${d.message || ''}`);
  },

  skill_xp_gain: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[XP]${c.reset} +${d.xp_gained || d.xp || 0} XP in ${d.skill_id || 'unknown'} (${d.current_xp || '?'}/${d.next_level_xp || '?'})`,
    );
  },

  trade_complete: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[TRADE]${c.reset} Trade completed with ${d.partner_name || d.with || 'someone'}!`,
    );
  },

  trade_declined: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade declined by ${d.from_name || 'someone'}`);
  },

  trade_cancelled: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade cancelled (ID: ${d.trade_id || 'unknown'})`);
  },

  friend_request_accepted: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} accepted your friend request!`,
    );
  },

  friend_removed: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} removed you as a friend`,
    );
  },

  friend_online: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.username || 'A friend'} is now online`);
  },

  friend_offline: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.dim}[FRIEND]${c.reset} ${d.username || 'A friend'} went offline`);
  },

  version_info: (d, t) => {
    writeLine(`${c.dim}[${t}]${c.reset} ${c.cyan}[VERSION]${c.reset} Server version: ${d.version || 'unknown'}`);
  },

  queue_cleared: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[QUEUE]${c.reset} Action queue cleared${d.reason ? `: ${d.reason}` : ''}`,
    );
  },

  friend_request: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.cyan}[FRIEND]${c.reset} ${d.from_name || 'Someone'} sent you a friend request`,
    );
  },

  system: (d, t) => {
    // Handle different system notification types
    if (d.type === 'gameplay_tip') {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[TIP]${c.reset} ${d.message}`);
    } else {
      // Generic system message
      writeLine(`${c.dim}[${t}]${c.reset} ${c.magenta}[SYSTEM]${c.reset} ${d.message || JSON.stringify(d)}`);
    }
  },

  action_result: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[ACTION RESULT]${c.reset} ${c.bright}${d.command}${c.reset} completed (tick ${d.tick || '?'})`,
    );
    if (d.result && typeof d.result === 'object') {
      const result = d.result as Record<string, unknown>;
      if (result.message) {
        writeLine(`  ${result.message}`);
      } else {
        for (const [key, value] of Object.entries(result)) {
          writeLine(`  ${key}: ${JSON.stringify(value)}`);
        }
      }
    }
  },

  action_error: (d, t) => {
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.red}[ACTION FAILED]${c.reset} ${c.bright}${d.command}${c.reset} failed (tick ${d.tick || '?'}): ${d.message || d.code || 'unknown error'}`,
    );
  },

  poi_arrival: (d, t) => {
    const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.green}[ARRIVAL]${c.reset} ${tag}${d.username || 'Someone'} has arrived at ${d.poi_name || 'this POI'}`,
    );
  },

  poi_departure: (d, t) => {
    const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
    writeLine(
      `${c.dim}[${t}]${c.reset} ${c.yellow}[DEPARTURE]${c.reset} ${tag}${d.username || 'Someone'} has departed from ${d.poi_name || 'this POI'}`,
    );
  },
};

export function displayNotifications(
  notifications?: APIResponse['notifications'],
  writer?: CliWriter,
  quiet = QUIET,
): void {
  if (!notifications?.length) return;
  if (quiet) return;

  const previousWriteLine = writeLine;
  writeLine = writer?.out.bind(writer) ?? previousWriteLine;

  try {
    for (const n of notifications) {
      const data = n.data as NotificationData;
      const time = new Date(n.timestamp).toLocaleTimeString();
      const handler = notificationHandlers[n.msg_type || n.type];

      if (handler) {
        handler(data, time);
      } else {
        // Default handler for unknown types
        const message = data.message;
        if (message) {
          writeLine(`${c.dim}[${time}]${c.reset} ${c.magenta}[${n.type.toUpperCase()}]${c.reset} ${message}`);
        } else {
          writeLine(`${c.dim}[${time}]${c.reset} ${c.magenta}[${n.type.toUpperCase()}]${c.reset}`);
          for (const [key, value] of Object.entries(data)) {
            writeLine(`  ${key}: ${JSON.stringify(value)}`);
          }
        }
      }
    }
  } finally {
    writeLine = previousWriteLine;
  }
}
