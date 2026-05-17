import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  compareVersions,
  convertPayloadTypes,
  normalizeCommandPayload,
  normalizeParsedPayload,
  parseArgs,
  validateRequiredArgs,
} from './client';

// =============================================================================
// compareVersions
// =============================================================================

describe('compareVersions', () => {
  test('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('0.6.5', '0.6.5')).toBe(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
  });

  test('returns 1 when latest is newer (major)', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(1);
    expect(compareVersions('0.6.5', '1.0.0')).toBe(1);
  });

  test('returns 1 when latest is newer (minor)', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(1);
    expect(compareVersions('0.6.5', '0.7.0')).toBe(1);
  });

  test('returns 1 when latest is newer (patch)', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(1);
    expect(compareVersions('0.6.5', '0.6.6')).toBe(1);
  });

  test('returns -1 when current is newer', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(-1);
  });

  test('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(1);
    expect(compareVersions('1.0.1', '1.0')).toBe(-1);
  });

  test('handles v prefix', () => {
    expect(compareVersions('v0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('0.6.5', 'v0.6.6')).toBe(1);
    expect(compareVersions('v0.6.5', '0.6.6')).toBe(1);
  });
});

// =============================================================================
// convertPayloadTypes
// =============================================================================

describe('convertPayloadTypes', () => {
  test('converts numeric fields to numbers', () => {
    const result = convertPayloadTypes({ quantity: '10', price: '500', page_size: '20', max_price: '10000' });
    expect(result.quantity).toBe(10);
    expect(result.price).toBe(500);
    expect(result.page_size).toBe(20);
    expect(result.max_price).toBe(10000);
  });

  test('leaves non-numeric fields as strings', () => {
    const result = convertPayloadTypes({ item_id: 'ore_iron', ship_class: 'prospector' });
    expect(result.item_id).toBe('ore_iron');
    expect(result.ship_class).toBe('prospector');
  });

  test('converts boolean strings', () => {
    const result = convertPayloadTypes({ provide_materials: 'true', auto_list: 'false' });
    expect(result.provide_materials).toBe(true);
    expect(result.auto_list).toBe(false);
  });

  test('handles mixed payload', () => {
    const result = convertPayloadTypes({ type: 'ships', page: '2', page_size: '10', search: 'mining' });
    expect(result.type).toBe('ships');
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
    expect(result.search).toBe('mining');
  });

  test('credits is numeric (trade_offer)', () => {
    const result = convertPayloadTypes({ target_id: 'abc123', credits: '500' });
    expect(result.target_id).toBe('abc123');
    expect(result.credits).toBe(500);
  });

  test('deprecated fields offer_credits and request_credits are NOT auto-converted', () => {
    // These were removed from NUMERIC_FIELDS in v0.8.0
    const result = convertPayloadTypes({ offer_credits: '100', request_credits: '200' });
    expect(result.offer_credits).toBe('100');
    expect(result.request_credits).toBe('200');
  });

  test('count is NOT auto-converted (use quantity instead)', () => {
    // count was removed from NUMERIC_FIELDS in v0.8.0; craft now uses quantity
    const result = convertPayloadTypes({ count: '5' });
    expect(result.count).toBe('5');
  });

  test('handles ticks and amount as numeric', () => {
    const result = convertPayloadTypes({ ticks: '100', amount: '2500' });
    expect(result.ticks).toBe(100);
    expect(result.amount).toBe(2500);
  });

  test('handles expiration_hours as numeric', () => {
    const result = convertPayloadTypes({ expiration_hours: '24' });
    expect(result.expiration_hours).toBe(24);
  });

  test('handles battle side_id as numeric', () => {
    const result = convertPayloadTypes({ side_id: '2' });
    expect(result.side_id).toBe(2);
  });

  test('leaves non-numeric string in numeric field as string', () => {
    const result = convertPayloadTypes({ quantity: 'abc' });
    expect(result.quantity).toBe('abc');
  });
});

describe('normalizeCommandPayload', () => {
  test('send_gift maps ship_id to item_id for the storage deposit endpoint', () => {
    const result = normalizeCommandPayload('send_gift', {
      recipient: 'PlayerName',
      ship_id: 'ship_456',
    });

    expect(result).toEqual({
      recipient: 'PlayerName',
      item_id: 'ship_456',
    });
  });

  test('send_gift keeps explicit item_id unchanged', () => {
    const result = normalizeCommandPayload('send_gift', {
      recipient: 'PlayerName',
      item_id: 'ore_iron',
      ship_id: 'ship_456',
      quantity: 10,
    });

    expect(result).toEqual({
      recipient: 'PlayerName',
      item_id: 'ore_iron',
      ship_id: 'ship_456',
      quantity: 10,
    });
  });

  test('send_gift credit gifts are unchanged', () => {
    const result = normalizeCommandPayload('send_gift', {
      recipient: 'PlayerName',
      credits: 1000,
    });

    expect(result).toEqual({
      recipient: 'PlayerName',
      credits: 1000,
    });
  });
});

describe('normalizeParsedPayload', () => {
  test('navigation aliases are sent as id/text', () => {
    expect(normalizeParsedPayload('travel', { target_poi: 'sol_asteroid_belt' })).toEqual({
      id: 'sol_asteroid_belt',
    });
    expect(normalizeParsedPayload('jump', { target_system: 'alpha' })).toEqual({ id: 'alpha' });
    expect(normalizeParsedPayload('search_systems', { query: 'sol' })).toEqual({ text: 'sol' });
  });

  test('chat keeps friendly channel but sends target', () => {
    expect(normalizeParsedPayload('chat', { channel: 'local', content: 'hello' })).toEqual({
      target: 'local',
      content: 'hello',
    });
  });

  test('reload uses canonical id and target fields', () => {
    expect(normalizeParsedPayload('reload', { weapon_instance_id: 'weapon_1', ammo_item_id: 'ammo_light' })).toEqual({
      id: 'weapon_1',
      target: 'ammo_light',
    });
  });

  test('new feature command aliases normalize to API fields', () => {
    expect(normalizeParsedPayload('upload_drone', { drone_id: 'drone_1', script: 'scan' })).toEqual({
      id: 'drone_1',
      text: 'scan',
    });
    expect(normalizeParsedPayload('battle_target', { target_id: 'player_1' })).toEqual({ id: 'player_1' });
    expect(normalizeParsedPayload('fleet_invite', { player_id: 'PlayerName' })).toEqual({ id: 'PlayerName' });
    expect(normalizeParsedPayload('delete_note', { note_id: 'note_1' })).toEqual({ target: 'note_1' });
    expect(normalizeParsedPayload('faction_remove_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
  });
});

// =============================================================================
// parseArgs
// =============================================================================

describe('parseArgs - basic', () => {
  test('no-arg command', () => {
    const { command, payload } = parseArgs(['mine']);
    expect(command).toBe('mine');
    expect(payload).toEqual({});
  });

  test('single positional arg', () => {
    const { command, payload } = parseArgs(['travel', 'sol_asteroid_belt']);
    expect(command).toBe('travel');
    expect(payload.target_poi).toBe('sol_asteroid_belt');
  });

  test('key=value arg', () => {
    const { command, payload } = parseArgs(['travel', 'target_poi=sol_earth']);
    expect(command).toBe('travel');
    expect(payload.target_poi).toBe('sol_earth');
  });

  test('multiple positional args', () => {
    const { command, payload } = parseArgs(['sell', 'ore_iron', '50']);
    expect(command).toBe('sell');
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('mixed positional and key=value args', () => {
    const { payload } = parseArgs(['sell', 'ore_iron', '50', 'auto_list=true']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
    expect(payload.auto_list).toBe('true');
  });

  test('extra key=value not in arg list is passed through', () => {
    const { payload } = parseArgs(['buy', 'ore_iron', 'deliver_to=my_base']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.deliver_to).toBe('my_base');
  });
});

describe('parseArgs - rest args', () => {
  test('rest arg captures all remaining tokens', () => {
    const { command, payload } = parseArgs(['chat', 'local', 'hello', 'world', 'how', 'are', 'you']);
    expect(command).toBe('chat');
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('hello world how are you');
  });

  test('rest arg with single word', () => {
    const { payload } = parseArgs(['chat', 'faction', 'hello']);
    expect(payload.channel).toBe('faction');
    expect(payload.content).toBe('hello');
  });

  test('rest arg via all key=value', () => {
    const { payload } = parseArgs(['chat', 'channel=system', 'content=this is a message']);
    expect(payload.channel).toBe('system');
    expect(payload.content).toBe('this is a message');
  });
});

describe('parseArgs - new and fixed commands (v0.8.0)', () => {
  test('trade_offer uses credits not offer_credits', () => {
    const { payload } = parseArgs(['trade_offer', 'player123', '500']);
    expect(payload.target_id).toBe('player123');
    expect(payload.credits).toBe('500');
    expect(payload.offer_credits).toBeUndefined();
    expect(payload.request_credits).toBeUndefined();
  });

  test('craft uses quantity not count', () => {
    const { payload } = parseArgs(['craft', 'refine_steel', '5']);
    expect(payload.recipe_id).toBe('refine_steel');
    expect(payload.quantity).toBe('5');
    expect(payload.count).toBeUndefined();
  });

  test('help uses category and command args', () => {
    const { payload } = parseArgs(['help', 'combat', 'attack']);
    expect(payload.category).toBe('combat');
    expect(payload.command).toBe('attack');
    expect(payload.topic).toBeUndefined();
  });

  test('distress_signal - no args', () => {
    const { command, payload } = parseArgs(['distress_signal']);
    expect(command).toBe('distress_signal');
    expect(payload).toEqual({});
  });

  test('inspect_cargo - no args', () => {
    const { command, payload } = parseArgs(['inspect_cargo']);
    expect(command).toBe('inspect_cargo');
    expect(payload).toEqual({});
  });

  test('completed_missions - no args', () => {
    const { command, payload } = parseArgs(['completed_missions']);
    expect(command).toBe('completed_missions');
    expect(payload).toEqual({});
  });

  test('session - no args', () => {
    const { command, payload } = parseArgs(['session']);
    expect(command).toBe('session');
    expect(payload).toEqual({});
  });

  test('repair_module - positional', () => {
    const { payload } = parseArgs(['repair_module', 'mod_uuid_123']);
    expect(payload.module_id).toBe('mod_uuid_123');
  });

  test('supply_commission - three positional args', () => {
    const { payload } = parseArgs(['supply_commission', 'comm_123', 'steel_plate', '10']);
    expect(payload.commission_id).toBe('comm_123');
    expect(payload.item_id).toBe('steel_plate');
    expect(payload.quantity).toBe('10');
  });

  test('view_completed_mission - positional', () => {
    const { payload } = parseArgs(['view_completed_mission', 'tmpl_456']);
    expect(payload.template_id).toBe('tmpl_456');
  });

  test('get_action_log - all optional positional', () => {
    const { payload } = parseArgs(['get_action_log', 'combat', 'faction_1', '2']);
    expect(payload.category).toBe('combat');
    expect(payload.faction_id).toBe('faction_1');
    expect(payload.page).toBe('2');
  });

  test('agentlogs - category and message required', () => {
    const { payload } = parseArgs(['agentlogs', 'navigation', 'jumped to new system']);
    expect(payload.category).toBe('navigation');
    expect(payload.message).toBe('jumped to new system');
  });

  test('get_map with system_id', () => {
    const { payload } = parseArgs(['get_map', 'sol']);
    expect(payload.system_id).toBe('sol');
  });

  test('view_market with category filter', () => {
    const { payload } = parseArgs(['view_market', 'ore_iron', 'ore']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.category).toBe('ore');
  });

  test('view_orders with station_id', () => {
    const { payload } = parseArgs(['view_orders', 'sol_central']);
    expect(payload.station_id).toBe('sol_central');
  });

  test('view_storage with station_id', () => {
    const { payload } = parseArgs(['view_storage', 'nexus_base']);
    expect(payload.station_id).toBe('nexus_base');
  });

  test('send_gift with ship_id', () => {
    const { payload } = parseArgs(['send_gift', 'PlayerName', 'ship_id=ship_456']);
    expect(payload.recipient).toBe('PlayerName');
    expect(payload.ship_id).toBe('ship_456');
  });

  test('faction_declare_war with reason', () => {
    const { payload } = parseArgs(['faction_declare_war', 'faction_xyz', 'territorial dispute']);
    expect(payload.target_faction_id).toBe('faction_xyz');
    expect(payload.reason).toBe('territorial dispute');
  });

  test('faction_create_role with permissions', () => {
    const { payload } = parseArgs(['faction_create_role', 'Officer', '2', 'recruit,kick']);
    expect(payload.name).toBe('Officer');
    expect(payload.priority).toBe('2');
    expect(payload.permissions).toBe('recruit,kick');
  });

  test('faction_query_intel with all filters', () => {
    const { payload } = parseArgs(['faction_query_intel', 'sol', 'sys_123', 'asteroid', 'iron']);
    expect(payload.system_name).toBe('sol');
    expect(payload.system_id).toBe('sys_123');
    expect(payload.poi_type).toBe('asteroid');
    expect(payload.resource_type).toBe('iron');
  });

  test('captains_log_list with index', () => {
    const { payload } = parseArgs(['captains_log_list', '5']);
    expect(payload.index).toBe('5');
  });

  test('faction_post_mission with required positional args', () => {
    const { payload } = parseArgs(['faction_post_mission', 'Defend Our Home', 'defense', 'Protect the base']);
    expect(payload.title).toBe('Defend Our Home');
    expect(payload.type).toBe('defense');
    expect(payload.description).toBe('Protect the base');
  });

  test('cancel_order without required (both order_id and order_ids are optional)', () => {
    // cancel_order has no required args - both order_id and order_ids are optional
    const missing = validateRequiredArgs('cancel_order', {});
    expect(missing).toBeNull();
  });

  test('new explicit drone commands parse positional payloads', () => {
    expect(parseArgs(['list_drones']).payload).toEqual({});
    expect(parseArgs(['get_drone', 'drone_1']).payload.drone_id).toBe('drone_1');
    expect(parseArgs(['upload_drone', 'drone_1', 'scan', 'asteroids']).payload).toEqual({
      drone_id: 'drone_1',
      script: 'scan asteroids',
    });
  });

  test('new explicit battle commands parse positional payloads', () => {
    expect(parseArgs(['battle_stance', 'brace']).payload.stance).toBe('brace');
    expect(parseArgs(['battle_target', 'player_1']).payload.target_id).toBe('player_1');
    expect(parseArgs(['reload', 'weapon_1', 'ammo_light']).payload).toEqual({
      weapon_instance_id: 'weapon_1',
      ammo_item_id: 'ammo_light',
    });
  });

  test('new explicit fleet and facility commands parse positional payloads', () => {
    expect(parseArgs(['fleet_status']).payload).toEqual({});
    expect(parseArgs(['fleet_invite', 'PlayerName']).payload.player_id).toBe('PlayerName');
    expect(parseArgs(['facility_build', 'ore_refinery']).payload.facility_type).toBe('ore_refinery');
    expect(parseArgs(['facility_toggle', 'fac_1']).payload.facility_id).toBe('fac_1');
  });

  test('new note and captains log delete commands parse positional payloads', () => {
    expect(parseArgs(['delete_note', 'note_1']).payload.note_id).toBe('note_1');
    expect(parseArgs(['captains_log_delete', '3']).payload.index).toBe('3');
  });
});

// =============================================================================
// validateRequiredArgs
// =============================================================================

describe('validateRequiredArgs', () => {
  test('returns null when all required args are present', () => {
    const payload = { target_poi: 'sol_asteroid_belt' };
    expect(validateRequiredArgs('travel', payload)).toBeNull();
  });

  test('returns missing arg name when required arg is absent', () => {
    expect(validateRequiredArgs('travel', {})).toBe('target_poi');
  });

  test('returns first missing arg when multiple are missing', () => {
    expect(validateRequiredArgs('sell', {})).toBe('item_id');
    expect(validateRequiredArgs('sell', { item_id: 'ore' })).toBe('quantity');
  });

  test('returns null for no-arg commands', () => {
    expect(validateRequiredArgs('mine', {})).toBeNull();
    expect(validateRequiredArgs('distress_signal', {})).toBeNull();
    expect(validateRequiredArgs('inspect_cargo', {})).toBeNull();
  });

  test('trade_offer requires target_id but not credits', () => {
    expect(validateRequiredArgs('trade_offer', {})).toBe('target_id');
    expect(validateRequiredArgs('trade_offer', { target_id: 'abc' })).toBeNull();
  });

  test('canonical API field satisfies friendly required arg after normalization', () => {
    expect(validateRequiredArgs('travel', { id: 'sol_earth' })).toBeNull();
    expect(validateRequiredArgs('battle_target', { id: 'player_1' })).toBeNull();
    expect(validateRequiredArgs('delete_note', { target: 'note_1' })).toBeNull();
  });

  test('supply_commission requires all three args', () => {
    expect(validateRequiredArgs('supply_commission', {})).toBe('commission_id');
    expect(validateRequiredArgs('supply_commission', { commission_id: 'c1' })).toBe('item_id');
    expect(validateRequiredArgs('supply_commission', { commission_id: 'c1', item_id: 'iron' })).toBe(
      'quantity',
    );
    expect(
      validateRequiredArgs('supply_commission', { commission_id: 'c1', item_id: 'iron', quantity: '10' }),
    ).toBeNull();
  });

  test('agentlogs requires category and message', () => {
    expect(validateRequiredArgs('agentlogs', {})).toBe('category');
    expect(validateRequiredArgs('agentlogs', { category: 'nav' })).toBe('message');
    expect(validateRequiredArgs('agentlogs', { category: 'nav', message: 'jumped' })).toBeNull();
  });

  test('faction_post_mission requires title, type, and description', () => {
    expect(validateRequiredArgs('faction_post_mission', {})).toBe('title');
    expect(validateRequiredArgs('faction_post_mission', { title: 'T', type: 'defense' })).toBe(
      'description',
    );
    expect(
      validateRequiredArgs('faction_post_mission', { title: 'T', type: 'defense', description: 'D' }),
    ).toBeNull();
  });
});

// =============================================================================
// version sync
// =============================================================================

describe('version sync', () => {
  test('package.json and client.ts VERSION match', () => {
    const pkgPath = path.join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const pkgVersion = pkg.version;

    const clientPath = path.join(import.meta.dir, 'client.ts');
    const clientSrc = fs.readFileSync(clientPath, 'utf-8');
    const match = clientSrc.match(/const VERSION = '([^']+)'/);
    expect(match).not.toBeNull();
    const clientVersion = match?.[1];

    expect(clientVersion).toBe(pkgVersion);
  });
});

// =============================================================================
// client.ts source checks
// =============================================================================

describe('client.ts source integrity', () => {
  let clientSrc: string;

  test('reads client source', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    clientSrc = fs.readFileSync(clientPath, 'utf-8');
    expect(clientSrc.length).toBeGreaterThan(0);
  });

  test('FETCH_TIMEOUT_MS is defined and >= 300000 (covers 270s+ travel)', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const match = src.match(/const FETCH_TIMEOUT_MS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const value = parseInt((match?.[1] ?? '0').replace(/_/g, ''), 10);
    expect(value).toBeGreaterThanOrEqual(300_000);
  });

  test('FETCH_TIMEOUT_MS is applied to the fetch call', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain('AbortSignal.timeout(FETCH_TIMEOUT_MS)');
  });

  test('TimeoutError is handled in execute()', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain('TimeoutError');
  });

  test('faction_gift is removed', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).not.toContain('faction_gift');
  });

  test('all new v0.8.0 commands are present', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const newCommands = [
      'agentlogs',
      'completed_missions',
      'distress_signal',
      'get_action_log',
      'repair_module',
      'session',
      'supply_commission',
      'view_completed_mission',
    ];
    for (const cmd of newCommands) {
      expect(src).toContain(`  ${cmd}:`);
    }
  });

  test('deprecated commands are removed', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const removedCommands = [
      // Friends system
      'inspect_cargo',
      'add_friend',
      'remove_friend',
      'get_friends',
      'get_friend_requests',
      'accept_friend_request',
      'decline_friend_request',
      // Base raiding system
      'build_base',
      'get_base_cost',
      'attack_base',
      'raid_status',
      'get_base_wrecks',
      'loot_base_wreck',
      'salvage_base_wreck',
      // Other deprecated commands
      'get_drones',
      'search_changelog',
      'buy_ship',
      'get_recipes',
      'shipyard_showroom',
      'set_anonymous',
    ];
    for (const cmd of removedCommands) {
      expect(src).not.toContain(`  ${cmd}:`);
    }
  });

  test('trade_offer uses credits not offer_credits/request_credits', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    // The trade_offer args should have 'credits' not the old param names
    const tradeOfferMatch = src.match(/trade_offer:\s*\{[^}]+\}/s);
    expect(tradeOfferMatch).not.toBeNull();
    const tradeOfferDef = tradeOfferMatch?.[0];
    expect(tradeOfferDef).toContain("'credits'");
    expect(tradeOfferDef).not.toContain("'offer_credits'");
    expect(tradeOfferDef).not.toContain("'request_credits'");
  });

  test('craft uses quantity not count', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const craftMatch = src.match(/craft:\s*\{[^}]+\}/s);
    expect(craftMatch).not.toBeNull();
    const craftDef = craftMatch?.[0];
    expect(craftDef).toContain("'quantity'");
    expect(craftDef).not.toContain("'count'");
  });

  test('help uses category and command, not topic', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const helpMatch = src.match(/^\s+help:\s*\{[^}]+\}/m);
    expect(helpMatch).not.toBeNull();
    const helpDef = helpMatch?.[0];
    expect(helpDef).toContain("'category'");
    expect(helpDef).toContain("'command'");
    expect(helpDef).not.toContain("'topic'");
  });

  test('NUMERIC_FIELDS does not contain deprecated fields', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const numericMatch = src.match(/const NUMERIC_FIELDS = new Set\(\[([^\]]+)\]\)/s);
    expect(numericMatch).not.toBeNull();
    const numericDef = numericMatch?.[1];
    expect(numericDef).not.toContain("'offer_credits'");
    expect(numericDef).not.toContain("'request_credits'");
    expect(numericDef).not.toContain("'count'");
  });

  test('COMMANDS block has no duplicate top-level command keys', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const start = src.indexOf('const COMMANDS:');
    const end = src.indexOf('\nconst COMMAND_GUIDANCE');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    const commands = [...block.matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*[{(]/gm)].map((match) => match[1]);
    const duplicates = commands.filter((command, index) => commands.indexOf(command) !== index);
    expect(duplicates).toEqual([]);
  });

  test('local AI usability helpers are present', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain('function suggestCommands');
    expect(src).toContain('function showCommandHelp');
    expect(src).toContain('function displayUnknownCommand');
    expect(src).toContain('function displayMissingArgument');
    expect(src).toContain('COMMAND_GUIDANCE');
  });
});

// =============================================================================
// CLI local usability behavior
// =============================================================================

function runClient(args: string[]): { stdout: string; stderr: string; exitCode: number | null } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', 'src/client.ts', ...args],
    cwd: path.join(import.meta.dir, '..'),
    env: { ...process.env, SPACEMOLT_NO_UPDATE_CHECK: 'true' },
    stdout: 'pipe',
    stderr: 'pipe',
  });

  return {
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
    exitCode: result.exitCode,
  };
}

describe('CLI local usability behavior', () => {
  test('unknown command fails locally with a suggestion', () => {
    const result = runClient(['trvel', 'sol_earth']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command "trvel"');
    expect(result.stderr).toContain('Did you mean: travel');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('missing required argument shows usage and next discovery command', () => {
    const result = runClient(['travel']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Missing required argument');
    expect(result.stderr).toContain('Usage:');
    expect(result.stderr).toContain('spacemolt travel <poi_id>');
    expect(result.stderr).toContain('spacemolt get_system');
  });

  test('--help command renders local command help without network', () => {
    const result = runClient(['--help', 'travel']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('travel');
    expect(result.stdout).toContain('Usage:');
    expect(result.stdout).toContain('spacemolt travel sol_asteroid_belt');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('--json unknown command keeps compatible error shape', () => {
    const result = runClient(['--json', 'trvel']);
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({ error: { code: 'unknown_command', message: 'Unknown command: trvel' } });
  });
});
