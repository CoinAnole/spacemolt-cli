import type { CliWriter } from './cli-context.ts';
import {
  formatCountMap,
  formatNotificationPreview,
  tryTypedNotificationPreview,
  type NotificationPreview,
} from './notification-format-shared.ts';
import { colorsForPlain } from './output-style.ts';
import { formatShipCommissionReceipt } from './ship-commission-receipt.ts';
import type { APIResponse } from './types.ts';

type NotificationData = Record<string, unknown>;
type Notification = NonNullable<APIResponse['notifications']>[number];
type NotificationColors = ReturnType<typeof colorsForPlain>;
type NotificationHandler = (data: NotificationData, time: string, writeLine: (message?: string) => void) => void;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return '"unserializable"';
  }
}

function hasDiagnosticToken(lines: string[]): boolean {
  return lines.some(
    (line) =>
      line.includes('NaN') ||
      line.includes('Infinity') ||
      line.includes('[object Object]') ||
      line.includes('undefined'),
  );
}

function normalizedNotification(notification: unknown): {
  type: string;
  msgType: string;
  timestamp: unknown;
  data: NotificationData;
} {
  const record = asRecord(notification);
  if (!record) {
    return {
      type: 'notification',
      msgType: 'notification',
      timestamp: undefined,
      data: { value: notification },
    };
  }

  const type = typeof record.type === 'string' && record.type.trim() ? record.type : 'notification';
  const msgType = typeof record.msg_type === 'string' && record.msg_type.trim() ? record.msg_type : type;
  return {
    type,
    msgType,
    timestamp: record.timestamp,
    data: asRecord(record.data) ?? (record.data === undefined ? {} : { value: record.data }),
  };
}

function formatTime(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) return 'unknown time';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString() : 'unknown time';
}

function orderLevels(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(asRecord).filter((record): record is Record<string, unknown> => Boolean(record))
    : [];
}

function formatOrderLevels(label: string, value: unknown): string | undefined {
  const levels = orderLevels(value);
  if (!levels.length) return undefined;
  const preview = levels
    .slice(0, 3)
    .map((level) => {
      const source = level.source ? ` (${level.source})` : '';
      return `${level.quantity ?? '?'} @ ${level.price_each ?? '?'}${source}`;
    })
    .join(', ');
  const suffix = levels.length > 3 ? `, +${levels.length - 3} more` : '';
  return `${label} ${preview}${suffix}`;
}

function marketItemLabel(item: Record<string, unknown>): string {
  const name = item.item_name ?? item.item_id ?? 'unknown item';
  return item.item_name && item.item_id ? `${name} (${item.item_id})` : String(name);
}

function marketUpdateSummary(data: NotificationData): string {
  const station = data.base_name ?? data.base_id ?? 'current station';
  const items = Array.isArray(data.items) ? data.items.filter(asRecord) : [];
  const count = items.length;
  const plural = count === 1 ? '' : 's';
  const tick = data.tick === undefined || data.tick === null ? '' : ` (tick ${data.tick})`;
  return `${station} market update${tick}: ${count} item update${plural}`;
}

function plural(value: number, singular: string, pluralText = `${singular}s`): string {
  return value === 1 ? singular : pluralText;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function safeScalar(value: unknown): string | number | boolean | undefined {
  if (typeof value === 'string') return value.trim() ? value : undefined;
  if (typeof value === 'boolean') return value;
  return finiteNumber(value);
}

function formatActionResultDetails(details: Record<string, unknown>): string | undefined {
  const message = safeScalar(details.message);
  if (message !== undefined) return String(message);

  const bits: string[] = [];
  const action = safeScalar(details.action);
  if (action !== undefined) bits.push(String(action));
  const system = safeScalar(details.system) ?? safeScalar(details.system_id);
  if (system !== undefined) bits.push(`→ ${system}`);
  const poi = safeScalar(details.poi) ?? safeScalar(details.poi_name);
  if (poi !== undefined) bits.push(`@ ${poi}`);
  const item = safeScalar(details.item_name) ?? safeScalar(details.item_id);
  if (item !== undefined) {
    const quantity = finiteNumber(details.quantity);
    bits.push(quantity !== undefined ? `${quantity}× ${item}` : String(item));
  }
  for (const key of ['module_id', 'wear_status', 'storage_total', 'cargo_remaining'] as const) {
    const value = safeScalar(details[key]);
    if (value !== undefined) bits.push(`${key}=${value}`);
  }
  return bits.length ? bits.join(' ') : undefined;
}

/**
 * Map known pure-preview tags to the colors previously used by writeLine handlers.
 * Interim until K14 severity→color is wired; unknown tags stay magenta.
 */
function previewTagColor(tag: string, c: NotificationColors): string {
  switch (tag) {
    case 'MARKET':
    case 'CRAFTING':
    case 'ACTION RESULTS':
      return c.green;
    case 'SHIP READY':
      return `${c.green}${c.bright}`;
    case 'SYSTEM':
      return c.magenta;
    default:
      return c.magenta;
  }
}

/**
 * Render a pure NotificationPreview as colored multi-line output.
 * Used for Policy 5 generic fallback (and later for typed preview handlers).
 * Does not show omittedHint by default (verbose-only, PR 8).
 */
function renderPreviewInline(
  preview: NotificationPreview,
  time: string,
  c: NotificationColors,
  writeLine: (message?: string) => void,
): void {
  const tagColor = previewTagColor(preview.tag, c);
  writeLine(
    `${c.dim}[${time}]${c.reset} ${tagColor}[${preview.tag}]${c.reset} ${preview.headline}`,
  );
  for (const detail of preview.details) {
    writeLine(`  ${detail}`);
  }
}

/**
 * Generic fallback: Policy 5 ladder via shared pure preview.
 * Never dumps nested JSON of ship/location/nearby payloads.
 */
function formatGenericNotification(
  notification: ReturnType<typeof normalizedNotification>,
  time: string,
  c: NotificationColors,
  writeLine: (message?: string) => void,
): void {
  const preview = formatNotificationPreview({
    type: notification.type,
    msg_type: notification.msgType,
    timestamp: notification.timestamp,
    data: notification.data,
  });
  renderPreviewInline(preview, time, c, writeLine);
}

function createNotificationHandlers(c: NotificationColors): Record<string, NotificationHandler> {
  return {
    chat_message: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[CHAT:${d.channel || 'local'}]${c.reset} ${c.bright}${d.sender || 'Unknown'}${c.reset}: ${d.content || ''}`,
      );
    },

    combat_update: (d, t, writeLine) => {
      const destroyed = d.destroyed ? ' - DESTROYED!' : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[COMBAT]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} ${d.damage_type || 'unknown'} damage (shield: ${d.shield_hit || 0}, hull: ${d.hull_hit || 0})${destroyed}`,
      );
    },

    player_died: (d, t, writeLine) => {
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

    mining_yield: (d, t, writeLine) => {
      const remainingMsg = d.remaining !== undefined ? ` (${d.remaining} remaining at POI)` : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[MINED]${c.reset} +${d.quantity || 0}x ${d.resource_id || 'ore'}${remainingMsg}`,
      );
    },

    market_update: (d, t, writeLine) => {
      const items = Array.isArray(d.items) ? d.items.filter(asRecord) : [];
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[MARKET]${c.reset} ${marketUpdateSummary(d)}`);
      for (const item of items.slice(0, 5)) {
        const sell = formatOrderLevels('sell', item.sell_orders);
        const buy = formatOrderLevels('buy', item.buy_orders);
        const depth = [sell, buy].filter(Boolean).join('; ') || 'book emptied';
        writeLine(`  ${marketItemLabel(item)}: ${depth}`);
      }
      if (items.length > 5) writeLine(`  +${items.length - 5} more item update${items.length === 6 ? '' : 's'}`);
    },

    crafting_summary: (d, t, writeLine) => {
      const count = finiteNumber(d.count) ?? 0;
      const parts = [`${count} crafting progress ${plural(count, 'update')} summarized`];
      const latestTick = safeScalar(d.latest_tick);
      const jobs = finiteNumber(d.jobs);
      const rentalJobs = finiteNumber(d.rental_jobs);
      const escrowedCredits = finiteNumber(d.escrowed_credits);
      const latestMessage = safeScalar(d.latest_message);
      if (latestTick !== undefined) parts.push(`latest tick ${latestTick}`);
      if (jobs !== undefined) parts.push(`${jobs} active ${plural(jobs, 'job')}`);
      if (rentalJobs !== undefined) {
        parts.push(`${rentalJobs} on rented ${plural(rentalJobs, 'facility')}`);
      }
      if (escrowedCredits !== undefined) {
        parts.push(`${escrowedCredits.toLocaleString()}cr still escrowed`);
      }
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[CRAFTING]${c.reset} ${parts.join('; ')}`);
      if (latestMessage !== undefined) writeLine(`  Latest: ${latestMessage}`);
    },

    action_result_summary: (d, t, writeLine) => {
      const count = finiteNumber(d.count) ?? 0;
      const parts = [`${count} action ${plural(count, 'result')} summarized`];
      const commandPreview = formatCountMap(d.commands);
      if (commandPreview) parts.push(commandPreview);
      const latestTick = safeScalar(d.latest_tick);
      if (latestTick !== undefined) parts.push(`latest tick ${latestTick}`);
      const latestCommand = safeScalar(d.latest_command);
      if (latestCommand !== undefined) parts.push(`latest ${latestCommand}`);
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[ACTION RESULTS]${c.reset} ${parts.join('; ')}`);
      const latestMessage = safeScalar(d.latest_message);
      if (latestMessage !== undefined) writeLine(`  Latest: ${latestMessage}`);
    },

    system_progress_summary: (d, t, writeLine) => {
      const count = finiteNumber(d.count) ?? 0;
      const parts = [`${count} travel progress ${plural(count, 'update')} summarized`];
      const actionPreview = formatCountMap(d.actions);
      if (actionPreview) parts.push(actionPreview);
      const latestAction = safeScalar(d.latest_action);
      const latestDestination = safeScalar(d.latest_destination);
      if (latestAction !== undefined && latestDestination !== undefined) {
        parts.push(`latest ${latestAction} → ${latestDestination}`);
      } else if (latestAction !== undefined) {
        parts.push(`latest ${latestAction}`);
      } else if (latestDestination !== undefined) {
        parts.push(`latest → ${latestDestination}`);
      }
      const latestArrival = safeScalar(d.latest_arrival_tick);
      if (latestArrival !== undefined) parts.push(`arrival tick ${latestArrival}`);
      writeLine(`${c.dim}[${t}]${c.reset} ${c.magenta}[SYSTEM]${c.reset} ${parts.join('; ')}`);
    },

    crafting_update: (d, t, writeLine) => {
      const jobs = Array.isArray(d.jobs) ? d.jobs.filter(asRecord) : [];
      if (jobs.length) {
        writeLine(
          `${c.dim}[${t}]${c.reset} ${c.green}[CRAFTING]${c.reset} ${jobs.length} job${jobs.length === 1 ? '' : 's'} update${d.tick === undefined || d.tick === null ? '' : ` (tick ${d.tick})`}`,
        );
        for (const job of jobs.slice(0, 5)) {
          const recipe = job.recipe ?? job.job_id ?? job.id ?? 'job';
          const bits = [String(recipe)];
          if (job.external === true) bits.push('rental');
          if (typeof job.escrowed_credits === 'number' && Number.isFinite(job.escrowed_credits)) {
            bits.push(`${job.escrowed_credits.toLocaleString()}cr escrowed`);
          }
          if (typeof job.runs_remaining === 'number' && Number.isFinite(job.runs_remaining)) {
            bits.push(`${job.runs_remaining.toLocaleString()} run${job.runs_remaining === 1 ? '' : 's'} left`);
          }
          if (job.completed === true) bits.push('completed');
          writeLine(`  ${bits.join(', ')}`);
        }
        if (jobs.length > 5) writeLine(`  +${jobs.length - 5} more job${jobs.length === 6 ? '' : 's'}`);
        return;
      }
      const parts: string[] = [];
      if (typeof d.message === 'string' && d.message) parts.push(d.message);
      if (d.external === true) parts.push('rental facility');
      if (typeof d.escrowed_credits === 'number' && Number.isFinite(d.escrowed_credits)) {
        parts.push(`${d.escrowed_credits.toLocaleString()}cr still escrowed`);
      }
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[CRAFTING]${c.reset} ${parts.join('; ') || 'Crafting update'}`);
    },

    ship_commission_complete: (data, time, writeLine) => {
      const receipt = formatShipCommissionReceipt(data);
      if (!receipt) return;
      writeLine(`${c.dim}[${time}]${c.reset} ${c.green}${c.bright}[SHIP READY]${c.reset} ${receipt}`);
    },

    trade_offer_received: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Offer from ${d.from_name || 'Someone'} (ID: ${d.trade_id || ''})`,
      );
      if ((d.offer_credits as number) > 0) writeLine(`  Offering: ${d.offer_credits} credits`);
      if ((d.request_credits as number) > 0) writeLine(`  Requesting: ${d.request_credits} credits`);
      writeLine(`  Use: trade accept trade_id=${d.trade_id} or trade decline trade_id=${d.trade_id}`);
    },

    scan_result: (d, t, writeLine) => {
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

    scan_detected: (d, t, writeLine) => {
      const revealed = (d.revealed_info as string[]) || [];
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[SCANNED]${c.reset} You were scanned by ${d.scanner_username || 'Unknown'} (${d.scanner_ship_class || 'unknown'})`,
      );
      writeLine(`  They learned: ${revealed.join(', ')}`);
    },

    police_warning: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.message}`);
      writeLine(`  Security level: ${d.police_level || 0}, Response in: ${d.response_ticks || 0} tick(s)`);
    },

    police_spawn: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[POLICE]${c.reset} ${d.num_drones || 0} police drone(s) arrived!`,
      );
    },

    police_combat: (d, t, writeLine) => {
      const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[POLICE]${c.reset} Police drone dealt ${d.damage || 0} damage${destroyed}`,
      );
    },

    skill_level_up: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[LEVEL UP]${c.reset} ${d.skill_id || 'unknown'} is now level ${d.new_level || 0}! (+${d.xp_gained || 0} XP)`,
      );
    },

    drone_update: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.blue}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone dealt ${d.damage || 0} damage to ${d.target_id || 'target'}`,
      );
    },

    drone_destroyed: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[DRONE]${c.reset} Your ${d.drone_type || 'drone'} drone was destroyed! (ID: ${d.drone_id || ''})`,
      );
    },

    pilotless_ship: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[PILOTLESS]${c.reset} ${d.player_username || 'unknown'}'s ${d.ship_class || 'ship'} is now pilotless!`,
      );
      writeLine(`  Vulnerable for ${d.ticks_remaining || 0} ticks - can be attacked without resistance`);
    },

    reconnected: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[RECONNECTED]${c.reset} ${d.message}`);
      if (d.was_pilotless) writeLine(`  Ship was pilotless - recovered with ${d.ticks_remaining || 0} ticks to spare`);
    },

    faction_invite: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.magenta}[FACTION]${c.reset} You've been invited to join ${d.faction_name || 'a faction'}`,
      );
      writeLine(
        `  Use: join_faction faction_id=${d.faction_id || ''} or faction decline_invite faction_id=${d.faction_id || ''}`,
      );
    },

    faction_war_declared: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[WAR]${c.reset} ${d.attacker_name || 'a faction'} has declared war on your faction!`,
      );
      writeLine(`  Reason: ${d.reason || 'no reason given'}`);
    },

    faction_peace_proposed: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[PEACE]${c.reset} ${d.proposer_name || 'a faction'} has proposed peace!`,
      );
      writeLine(`  Terms: ${d.terms || 'unconditional'}`);
      writeLine(`  Use: faction accept_peace target_faction_id=${d.faction_id || ''}`);
    },

    base_raid_update: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[RAID]${c.reset} ${d.base_name || 'base'}: ${d.current_health || 0}/${d.max_health || 0} HP (-${d.damage_per_tick || 0}/tick)`,
      );
    },

    base_destroyed: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BASE DESTROYED]${c.reset} ${d.base_name || 'base'} has been destroyed!`,
      );
      if (d.wreck_id) writeLine(`  Wreck ID for looting: ${d.wreck_id}`);
    },

    player_kill: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}${c.bright}[KILL]${c.reset} You destroyed ${d.victim_name || d.target_name || 'unknown'}!`,
      );
      if (d.bounty) writeLine(`  Bounty: ${d.bounty} credits`);
      if (d.wreck_id) writeLine(`  Wreck: ${d.wreck_id}`);
    },

    pirate_warning: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.message || 'Pirates detected nearby!'}`);
    },

    pirate_spawn: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} ${d.num_pirates || 1} pirate(s) appeared!`);
    },

    pirate_combat: (d, t, writeLine) => {
      const destroyed = d.destroyed ? ' - YOU WERE DESTROYED!' : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[PIRATES]${c.reset} Pirate dealt ${d.damage || 0} damage${destroyed}`,
      );
    },

    pirate_destroyed: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[PIRATES]${c.reset} Pirate destroyed!`);
      if (d.loot) writeLine(`  Loot: ${JSON.stringify(d.loot)}`);
    },

    battle_started: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}${c.bright}[BATTLE]${c.reset} Battle started! ID: ${d.battle_id || 'unknown'}`,
      );
    },

    battle_update: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} Battle tick ${d.tick || '?'} - ${d.message || 'combat continues'}`,
      );
    },

    battle_damage: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[BATTLE]${c.reset} ${d.attacker || 'unknown'} hit ${d.target || 'unknown'} for ${d.damage || 0} damage`,
      );
    },

    battle_joined: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} joined the battle`);
    },

    battle_left: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[BATTLE]${c.reset} ${d.username || 'Someone'} left the battle`);
    },

    battle_ended: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[BATTLE]${c.reset} Battle ended! ${d.message || ''}`);
    },

    skill_xp_gain: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[XP]${c.reset} +${d.xp_gained || d.xp || 0} XP in ${d.skill_id || 'unknown'} (${d.current_xp || '?'}/${d.next_level_xp || '?'})`,
      );
    },

    trade_complete: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[TRADE]${c.reset} Trade completed with ${d.partner_name || d.with || 'someone'}!`,
      );
    },

    trade_declined: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade declined by ${d.from_name || 'someone'}`);
    },

    trade_cancelled: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[TRADE]${c.reset} Trade cancelled (ID: ${d.trade_id || 'unknown'})`,
      );
    },

    friend_request_accepted: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} accepted your friend request!`,
      );
    },

    friend_removed: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[FRIEND]${c.reset} ${d.from_name || d.username || 'Someone'} removed you as a friend`,
      );
    },

    friend_online: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.green}[FRIEND]${c.reset} ${d.username || 'A friend'} is now online`);
    },

    friend_offline: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.dim}[FRIEND]${c.reset} ${d.username || 'A friend'} went offline`);
    },

    version_info: (d, t, writeLine) => {
      writeLine(`${c.dim}[${t}]${c.reset} ${c.cyan}[VERSION]${c.reset} Server version: ${d.version || 'unknown'}`);
    },

    queue_cleared: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[QUEUE]${c.reset} Action queue cleared${d.reason ? `: ${d.reason}` : ''}`,
      );
    },

    friend_request: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.cyan}[FRIEND]${c.reset} ${d.from_name || 'Someone'} sent you a friend request`,
      );
    },

    system: (d, t, writeLine) => {
      // Handle different system notification types
      if (d.type === 'gameplay_tip') {
        writeLine(`${c.dim}[${t}]${c.reset} ${c.yellow}[TIP]${c.reset} ${safeScalar(d.message) ?? safeJson(d)}`);
        return;
      }

      const action = safeScalar(d.action);
      if (action !== undefined) {
        const destination = safeScalar(d.destination);
        const arrival = safeScalar(d.arrival_tick);
        const bits = [String(action)];
        if (destination !== undefined) bits.push(`→ ${destination}`);
        if (arrival !== undefined) bits.push(`(arrival tick ${arrival})`);
        if (d.is_wormhole === true) bits.push('wormhole');
        writeLine(`${c.dim}[${t}]${c.reset} ${c.magenta}[SYSTEM]${c.reset} ${bits.join(' ')}`);
        return;
      }

      // Generic system message — prefer scalar message over full JSON dumps.
      writeLine(`${c.dim}[${t}]${c.reset} ${c.magenta}[SYSTEM]${c.reset} ${safeScalar(d.message) ?? safeJson(d)}`);
    },

    action_result: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[ACTION RESULT]${c.reset} ${c.bright}${d.command}${c.reset} completed (tick ${d.tick || '?'})`,
      );
      const result = asRecord(d.result);
      if (!result) return;
      if (safeScalar(result.message) !== undefined) {
        writeLine(`  ${safeScalar(result.message)}`);
        return;
      }
      const details = asRecord(result.details);
      if (details) {
        const summary = formatActionResultDetails(details);
        if (summary) writeLine(`  ${summary}`);
        return;
      }
      // Avoid dumping bulky ship/location/nearby_players payloads.
    },

    action_error: (d, t, writeLine) => {
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.red}[ACTION FAILED]${c.reset} ${c.bright}${d.command}${c.reset} failed (tick ${d.tick || '?'}): ${d.message || d.code || 'unknown error'}`,
      );
    },

    poi_arrival: (d, t, writeLine) => {
      const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.green}[ARRIVAL]${c.reset} ${tag}${d.username || 'Someone'} has arrived at ${d.poi_name || 'this POI'}`,
      );
    },

    poi_departure: (d, t, writeLine) => {
      const tag = d.clan_tag ? `[${d.clan_tag}] ` : '';
      writeLine(
        `${c.dim}[${t}]${c.reset} ${c.yellow}[DEPARTURE]${c.reset} ${tag}${d.username || 'Someone'} has departed from ${d.poi_name || 'this POI'}`,
      );
    },
  };
}

export const NOTIFICATION_TYPES = Object.keys(createNotificationHandlers(colorsForPlain(false))).sort();

/**
 * Interim dual-registry dispatch (PR2):
 *   1. PREVIEW_HANDLERS via tryTypedNotificationPreview → renderPreviewInline
 *   2. legacy writeLine handler by msgType (try/catch + hasDiagnosticToken guard)
 *   3. Policy 5 generic via formatNotificationPreview
 *
 * Do not scrape writeLine/ANSI for table Message.
 */
export function formatNotification(notification: Notification, options?: { plain?: boolean }): string[] {
  const lines: string[] = [];
  const writeLine = (message = '') => lines.push(message);
  const normalized = normalizedNotification(notification);
  const data = normalized.data;
  const time = formatTime(normalized.timestamp);
  const type = normalized.msgType;
  const c = colorsForPlain(Boolean(options?.plain));

  // 1. Pure typed preview (table-parity handlers from PR2+)
  const typedPreview = tryTypedNotificationPreview({
    type: normalized.type,
    msg_type: normalized.msgType,
    timestamp: normalized.timestamp,
    data: normalized.data,
  });
  if (typedPreview) {
    const previewLines: string[] = [];
    const previewWriteLine = (message = '') => previewLines.push(message);
    try {
      renderPreviewInline(typedPreview, time, c, previewWriteLine);
      if (previewLines.length > 0 && !hasDiagnosticToken(previewLines)) return previewLines;
    } catch {
      // Malformed pure preview should not make rendering fail.
    }
  }

  // 2. Legacy writeLine handlers
  const notificationHandlers = createNotificationHandlers(c);
  const handler = notificationHandlers[type];
  if (handler) {
    const handledLines: string[] = [];
    const handledWriteLine = (message = '') => handledLines.push(message);
    try {
      handler(data, time, handledWriteLine);
      if (handledLines.length > 0 && !hasDiagnosticToken(handledLines)) return handledLines;
    } catch {
      // Malformed server notifications should not make rendering fail.
    }
  }

  // 3. Policy 5 generic
  formatGenericNotification(normalized, time, c, writeLine);
  return lines;
}

export function displayNotifications(
  notifications?: APIResponse['notifications'],
  writer?: CliWriter,
  quiet = false,
  options?: { plain?: boolean },
): void {
  if (!Array.isArray(notifications) || !notifications.length) return;
  if (quiet) return;

  const out = writer?.out.bind(writer) ?? console.log;
  for (const notification of notifications) {
    for (const line of formatNotification(notification, options)) {
      out(line);
    }
  }
}
