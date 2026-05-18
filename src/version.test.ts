import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyPayloadTransforms,
  compareVersions,
  convertPayloadTypes,
  getPayloadConversionSchema,
  normalizeParsedPayload,
  parseArgs,
  parseGlobalOptions,
  validateKnownPayloadFields,
  validateRequiredArgs,
} from './client';
import { COMMANDS } from './commands';
import { createDryRunResponse, getServerPreviewCommand } from './preview';

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
  test('converts numeric fields using the command schema', () => {
    expect(convertPayloadTypes({ quantity: '10' }, 'sell').quantity).toBe(10);
    expect(convertPayloadTypes({ page_size: '20' }, 'catalog').page_size).toBe(20);
    expect(convertPayloadTypes({ max_price: '10000' }, 'facility_browse_for_sale').max_price).toBe(10000);
    expect(convertPayloadTypes({ price: '500' }, 'facility_list_for_sale').price).toBe(500);
  });

  test('leaves non-numeric fields as strings', () => {
    const result = convertPayloadTypes({ item_id: 'ore_iron', ship_class: 'prospector' });
    expect(result.item_id).toBe('ore_iron');
    expect(result.ship_class).toBe('prospector');
  });

  test('does not convert numeric-looking fields without a command schema', () => {
    const result = convertPayloadTypes({ quantity: '10', page_size: '20', credits: '500' });
    expect(result.quantity).toBe('10');
    expect(result.page_size).toBe('20');
    expect(result.credits).toBe('500');
  });

  test('converts boolean strings', () => {
    const result = convertPayloadTypes({ auto_list: 'false' }, 'sell');
    expect(result.auto_list).toBe(false);
  });

  test('handles mixed payload', () => {
    const result = convertPayloadTypes({ type: 'ships', page: '2', page_size: '10', search: 'mining' }, 'catalog');
    expect(result.type).toBe('ships');
    expect(result.page).toBe(2);
    expect(result.page_size).toBe(10);
    expect(result.search).toBe('mining');
  });

  test('credits is numeric (trade_offer) after field rename', () => {
    const normalized = normalizeParsedPayload('trade_offer', { target_id: 'abc123', credits: '500' });
    const result = convertPayloadTypes(normalized, 'trade_offer');
    expect(result.target).toBe('abc123');
    expect(result.offer_credits).toBe(500);
  });

  test('unknown fields are not auto-converted globally', () => {
    const result = convertPayloadTypes({ offer_credits: '100', request_credits: '200' });
    expect(result.offer_credits).toBe('100');
    expect(result.request_credits).toBe('200');
  });

  test('count is NOT auto-converted (use quantity instead)', () => {
    const result = convertPayloadTypes({ count: '5' }, 'craft');
    expect(result.count).toBe('5');
  });

  test('handles ticks and amount as numeric', () => {
    expect(convertPayloadTypes({ ticks: '100' }, 'buy_insurance').ticks).toBe(100);
    expect(convertPayloadTypes({ quantity: '2500' }, 'faction_deposit_credits').quantity).toBe(2500);
  });

  test('handles expiration_hours as numeric', () => {
    const result = convertPayloadTypes({ expiration_hours: '24' }, 'faction_post_mission');
    expect(result.expiration_hours).toBe(24);
  });

  test('handles battle side_id as numeric', () => {
    const result = convertPayloadTypes({ side_id: '2' }, 'battle_engage');
    expect(result.side_id).toBe(2);
  });

  test('leaves id-like fields as strings when the command schema says string', () => {
    const result = convertPayloadTypes({ id: '123' }, 'travel');
    expect(result.id).toBe('123');
  });

  test('notification types are split after type conversion', () => {
    const typed = convertPayloadTypes({ types: 'chat, combat', limit: '10', clear: 'false' }, 'get_notifications');
    const result = applyPayloadTransforms('get_notifications', typed);
    expect(result).toEqual({
      types: ['chat', 'combat'],
      limit: 10,
      clear: false,
    });
  });

  test('leaves non-numeric string in numeric field as string', () => {
    const result = convertPayloadTypes({ quantity: 'abc' }, 'sell');
    expect(result.quantity).toBe('abc');
  });

  test('uses generated command schema for command-specific numeric fields', () => {
    const result = convertPayloadTypes({ tier: '3', page_size: '10' }, 'catalog');
    expect(result.tier).toBe(3);
    expect(result.page_size).toBe(10);
  });
});

describe('send_gift alias normalization', () => {
  test('send_gift maps ship_id to item_id via aliases when item_id is absent', () => {
    const normalized = normalizeParsedPayload('send_gift', {
      recipient: 'PlayerName',
      ship_id: 'ship_456',
    });
    expect(normalized).toEqual({
      target: 'PlayerName',
      item_id: 'ship_456',
    });
  });

  test('send_gift keeps explicit item_id unchanged when both item_id and ship_id present', () => {
    const normalized = normalizeParsedPayload('send_gift', {
      recipient: 'PlayerName',
      item_id: 'ore_iron',
      ship_id: 'ship_456',
      quantity: '10',
    });
    expect(normalized).toEqual({
      target: 'PlayerName',
      item_id: 'ore_iron',
      quantity: '10',
    });
  });

  test('send_gift maps recipient to target', () => {
    const normalized = normalizeParsedPayload('send_gift', {
      recipient: 'PlayerName',
      credits: '1000',
    });
    expect(normalized).toEqual({
      target: 'PlayerName',
      credits: '1000',
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
    expect(normalizeParsedPayload('scrap_ship', { ship_id: 'ship_1' })).toEqual({ id: 'ship_1' });
    expect(normalizeParsedPayload('get_empire_info', { empire_id: 'solarian' })).toEqual({ id: 'solarian' });
  });

  test('citizenship command aliases normalize to API fields', () => {
    expect(normalizeParsedPayload('citizenship_apply', { empire: 'solarian' })).toEqual({
      target: 'solarian',
    });
    expect(normalizeParsedPayload('citizenship_renounce', { empire: 'voidborn' })).toEqual({
      target: 'voidborn',
    });
    expect(normalizeParsedPayload('citizenship_withdraw', { empire: 'crimson' })).toEqual({
      target: 'crimson',
    });
    expect(normalizeParsedPayload('citizenship_list', { empire_id: 'nebula' })).toEqual({
      empire_id: 'nebula',
    });
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

  test('extra key=value not in arg list is parsed for raw-mode pass-through', () => {
    const { payload } = parseArgs(['buy', 'ore_iron', 'deliver_to=my_base']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.deliver_to).toBe('my_base');
  });

  test('--flag value args use command field names', () => {
    const { payload, warnings } = parseArgs(['sell', '--item-id', 'ore_iron', '--quantity', '50']);
    expect(warnings).toEqual([]);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('--flag=value args normalize dashes to underscores', () => {
    const { payload, warnings } = parseArgs(['travel', '--target-poi=sol_earth']);
    expect(warnings).toEqual([]);
    expect(payload.target_poi).toBe('sol_earth');
  });

  test('boolean CLI flags default to true without consuming the next positional arg', () => {
    const { payload } = parseArgs(['sell', '--auto-list', 'ore_iron', '50']);
    expect(payload.auto_list).toBe('true');
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('unknown CLI flags parse as payload with a warning before validation', () => {
    const { payload, warnings } = parseArgs(['buy', '--delivery-mode', 'fast']);
    expect(payload.delivery_mode).toBe('fast');
    expect(warnings[0]).toContain('Unknown flag');
  });

  test('unknown fields are validation errors with suggestions', () => {
    const { payload } = parseArgs(['sell', 'ore_iron', 'quanity=50']);
    const errors = validateKnownPayloadFields('sell', payload);
    expect(errors).toEqual([
      {
        field: 'quanity',
        message:
          'Unknown field "quanity" for "sell". Did you mean "quantity"? Use --allow-unknown or --raw to pass it through.',
        code: 'unknown_field',
      },
    ]);
  });
});

describe('dry-run previews', () => {
  test('local preview normalizes route and payload without sending a request', () => {
    const response = createDryRunResponse('scrap_ship', { id: 'ship_1' });
    expect(response.structuredContent?.server_request_sent).toBe(false);
    expect(response.structuredContent?.url).toContain('/api/v2/spacemolt_ship/scrap_ship');
    expect(response.structuredContent?.payload).toEqual({ id: 'ship_1' });
  });

  test('buy with quantity uses the server estimate endpoint as its preview', () => {
    expect(getServerPreviewCommand('buy', { item_id: 'ore_iron', quantity: 50 })).toBe('estimate_purchase');
    expect(getServerPreviewCommand('buy', { item_id: 'ore_iron' })).toBeNull();
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

  test('get_cargo - no args', () => {
    const { command, payload } = parseArgs(['get_cargo']);
    expect(command).toBe('get_cargo');
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

  test('new coverage commands parse positional payloads', () => {
    expect(parseArgs(['get_empire_info', 'solarian']).payload.empire_id).toBe('solarian');
    expect(parseArgs(['get_tax_estimate']).payload).toEqual({});
    expect(parseArgs(['get_notifications', 'clear=false', 'limit=10', 'types=chat,combat']).payload).toEqual({
      clear: 'false',
      limit: '10',
      types: 'chat,combat',
    });
    expect(parseArgs(['scrap_ship', 'ship_1']).payload.ship_id).toBe('ship_1');
  });

  test('citizenship commands parse positional payloads', () => {
    expect(parseArgs(['citizenship_list', 'solarian']).payload.empire_id).toBe('solarian');
    expect(parseArgs(['citizenship_apply', 'solarian']).payload.empire).toBe('solarian');
    expect(parseArgs(['citizenship_renounce', 'voidborn']).payload.empire).toBe('voidborn');
    expect(parseArgs(['citizenship_withdraw', 'crimson']).payload.empire).toBe('crimson');
  });

  test('facility sale commands parse positional payloads', () => {
    expect(parseArgs(['facility_list_for_sale', 'facility_1', '5000']).payload).toEqual({
      facility_id: 'facility_1',
      price: '5000',
    });
    expect(parseArgs(['facility_browse_for_sale', 'ore_refinery', '10000', '2', '25']).payload).toEqual({
      facility_type: 'ore_refinery',
      max_price: '10000',
      page: '2',
      per_page: '25',
    });
    expect(parseArgs(['facility_buy_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
    expect(parseArgs(['facility_cancel_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
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
    expect(validateRequiredArgs('get_cargo', {})).toBeNull();
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
    expect(validateRequiredArgs('supply_commission', { commission_id: 'c1', item_id: 'iron' })).toBe('quantity');
    expect(
      validateRequiredArgs('supply_commission', { commission_id: 'c1', item_id: 'iron', quantity: '10' }),
    ).toBeNull();
  });

  test('agentlogs requires generated required fields in positional order', () => {
    expect(validateRequiredArgs('agentlogs', {})).toBe('category');
    expect(validateRequiredArgs('agentlogs', { category: 'nav' })).toBe('message');
    expect(validateRequiredArgs('agentlogs', { category: 'nav', message: 'jumped' })).toBe('severity');
    expect(validateRequiredArgs('agentlogs', { category: 'nav', message: 'jumped', severity: 'info' })).toBeNull();
  });

  test('faction_post_mission uses generated required fields', () => {
    expect(validateRequiredArgs('faction_post_mission', {})).toBe('title');
    expect(validateRequiredArgs('faction_post_mission', { title: 'T', type: 'defense' })).toBe('description');
    expect(validateRequiredArgs('faction_post_mission', { title: 'T', type: 'defense', description: 'D' })).toBe(
      'objectives',
    );
    expect(
      validateRequiredArgs('faction_post_mission', {
        title: 'T',
        type: 'defense',
        description: 'D',
        objectives: '[]',
        rewards: '[]',
      }),
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

    const clientPath = path.join(import.meta.dir, 'runtime.ts');
    const clientSrc = fs.readFileSync(clientPath, 'utf-8');
    const match = clientSrc.match(/const VERSION = '([^']+)'/);
    expect(match).not.toBeNull();
    const clientVersion = match?.[1];

    expect(clientVersion).toBe(pkgVersion);
  });

  test('README current client version matches package.json', () => {
    const pkgPath = path.join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    const readmePath = path.join(import.meta.dir, '..', 'README.md');
    const readme = fs.readFileSync(readmePath, 'utf-8');
    const match = readme.match(/Current client version: `([^`]+)`\./);
    expect(match).not.toBeNull();

    expect(match?.[1]).toBe(pkg.version);
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
    const clientPath = path.join(import.meta.dir, 'runtime.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const match = src.match(/const FETCH_TIMEOUT_MS\s*=\s*([\d_]+)/);
    expect(match).not.toBeNull();
    const value = parseInt((match?.[1] ?? '0').replace(/_/g, ''), 10);
    expect(value).toBeGreaterThanOrEqual(300_000);
  });

  test('FETCH_TIMEOUT_MS is applied to the fetch call', () => {
    const clientPath = path.join(import.meta.dir, 'transport.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain('const timeoutMs = options.timeoutMs ?? FETCH_TIMEOUT_MS');
    expect(src).toContain('AbortSignal.timeout(timeoutMs)');
  });

  test('session writes are atomic and owner-only where possible', () => {
    const clientPath = path.join(import.meta.dir, 'session.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain("path.join(os.homedir(), '.hermes', 'spacemolt')");
    expect(src).toContain("path.join(SPACEMOLT_HOME, 'spacemolt_credentials.yaml')");
    expect(src).toContain("path.join(os.homedir(), '.hermes', 'spacemolt_credentials.yaml')");
    expect(src).toContain('SESSION_FILE_MODE = 0o600');
    expect(src).toContain("fs.promises.open(tmpPath, 'wx', SESSION_FILE_MODE)");
    expect(src).toContain('fs.promises.rename(tmpPath, sessionPath)');
    expect(src).toContain('hardenPermissions(sessionPath, SESSION_FILE_MODE)');
  });

  test('TimeoutError is handled in execute()', () => {
    const clientPath = path.join(import.meta.dir, 'transport.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).toContain('TimeoutError');
  });

  test('client HTTP requests go through the shared JSON request helper', () => {
    const clientPath = path.join(import.meta.dir, 'transport.ts');
    const apiPath = path.join(import.meta.dir, 'api.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const apiSrc = fs.readFileSync(apiPath, 'utf-8');
    expect(src).toContain('async function requestJson');
    expect(src.match(/fetch\(/g)?.length).toBe(1);
    expect(apiSrc).toContain('requestJson<APIResponse>');
    expect(src).toContain('Server returned non-JSON response');
    expect(src).toContain('Server returned invalid JSON response');
  });

  test('faction_gift is removed', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    expect(src).not.toContain('faction_gift');
  });

  test('all new v0.8.0 commands are present', () => {
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
      expect(COMMANDS[cmd]).toBeDefined();
    }
  });

  test('deprecated commands are removed', () => {
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
      expect(COMMANDS[cmd]).toBeUndefined();
    }
  });

  test('parseArgs fixtures use registered commands', () => {
    const registeredCommands = new Set(Object.keys(COMMANDS));

    const testPath = path.join(import.meta.dir, 'version.test.ts');
    const testSrc = fs.readFileSync(testPath, 'utf-8');
    const fixtureCommands = [...testSrc.matchAll(/parseArgs\(\[['"]([a-z][a-z0-9_]*)['"]/g)]
      .map((match) => match[1])
      .filter((command): command is string => Boolean(command));
    const unknownFixtures = [...new Set(fixtureCommands)].filter((command) => !registeredCommands.has(command));

    expect(unknownFixtures).toEqual([]);
  });

  test('trade_offer uses credits not offer_credits/request_credits', () => {
    const args = COMMANDS.trade_offer?.args;
    expect(args).toContain('credits');
    expect(args).not.toContain('offer_credits');
    expect(args).not.toContain('request_credits');
  });

  test('craft uses quantity not count', () => {
    const args = COMMANDS.craft?.args;
    expect(args).toContain('quantity');
    expect(args).not.toContain('count');
  });

  test('help uses category and command, not topic', () => {
    const args = COMMANDS.help?.args;
    expect(args).toContain('category');
    expect(args).toContain('command');
    expect(args).not.toContain('topic');
  });

  test('payload conversion uses command schemas instead of a global numeric field set', () => {
    const argsPath = path.join(import.meta.dir, 'args.ts');
    const src = fs.readFileSync(argsPath, 'utf-8');
    expect(src).not.toContain('NUMERIC_FIELDS');
    expect(getPayloadConversionSchema('travel').id?.type).toBe('string');
    expect(getPayloadConversionSchema('sell').quantity?.type).toBe('integer');
    expect(getPayloadConversionSchema('trade_offer').offer_credits?.type).toBe('integer');
  });

  test('COMMANDS block has no duplicate top-level command keys', () => {
    const commandsPath = path.join(import.meta.dir, 'commands.ts');
    const src = fs.readFileSync(commandsPath, 'utf-8');
    const start = src.indexOf('const COMMAND_OVERRIDES:');
    const end = src.indexOf('\n\nexport function routeToPath');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    const commands = [...block.matchAll(/^\s{2}([a-z][a-z0-9_]+):\s*[{(]/gm)].map((match) => match[1]);
    const duplicates = commands.filter((command, index) => commands.indexOf(command) !== index);
    expect(duplicates).toEqual([]);
  });

  test('generated OpenAPI metadata is merged into command configs', () => {
    expect(COMMANDS.travel?.schema?.id?.type).toBe('string');
    expect(COMMANDS.travel?.required).toContain('target_poi');
    expect(COMMANDS.catalog?.schema?.type?.enum).toContain('items');
  });

  test('local AI usability helpers are present', () => {
    const clientPath = path.join(import.meta.dir, 'help.ts');
    const src = fs.readFileSync(clientPath, 'utf-8');
    const commandsPath = path.join(import.meta.dir, 'commands.ts');
    const commandsSrc = fs.readFileSync(commandsPath, 'utf-8');
    expect(src).toContain('function suggestCommands');
    expect(src).toContain('function showCommandHelp');
    expect(src).toContain('function displayUnknownCommand');
    expect(src).toContain('function displayMissingArgument');
    expect(commandsSrc).toContain('description:');
    expect(commandsSrc).toContain('example:');
    expect(commandsSrc).toContain('seeAlso:');
  });
});

// =============================================================================
// CLI local usability behavior
// =============================================================================

function runClient(
  args: string[],
  env: Record<string, string> = {},
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = Bun.spawnSync({
    cmd: [process.execPath, 'run', 'src/client.ts', ...args],
    cwd: path.join(import.meta.dir, '..'),
    env: { ...process.env, ...env, SPACEMOLT_NO_UPDATE_CHECK: 'true' },
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

  test('unknown command fields fail locally with a suggestion', () => {
    const result = runClient(['sell', 'ore_iron', 'quanity=50']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown field "quanity" for "sell"');
    expect(result.stderr).toContain('Did you mean "quantity"?');
    expect(result.stderr).toContain('--allow-unknown');
    expect(result.stderr).not.toContain('Connection Error');
  });

  test('--raw allows unknown command fields through', () => {
    const result = runClient(['--raw', '--dry-run', 'sell', 'ore_iron', '50', 'experimental_mode=true']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"experimental_mode": true');
  });

  test('profile list reads local credential profile names without secrets', () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-profile-test-'));
    const hermesDir = path.join(home, '.hermes', 'spacemolt');
    fs.mkdirSync(hermesDir, { recursive: true });
    fs.writeFileSync(
      path.join(hermesDir, 'spacemolt_credentials.yaml'),
      [
        'credentials:',
        '  marlowe:',
        '    username: "Marlowe"',
        '    password: "REDACTED"',
        '  rescue:',
        '    username: "FuelRescue"',
        '    password: "secret"',
        '',
      ].join('\n'),
    );
    const result = runClient(['profile', 'list'], { HOME: home });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('marlowe');
    expect(result.stdout).toContain('FuelRescue');
    expect(result.stdout).not.toContain('REDACTED');
  });

  test('--profile validates path-safe profile names before network work', () => {
    const result = runClient(['--profile', '../bad', 'get_status']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Profile names may only contain');
  });
});

// =============================================================================
// Output modes (CLI behavior tests)
// =============================================================================

describe('CLI output modes', () => {
  test('global option parser returns structured errors without exiting', () => {
    const result = parseGlobalOptions(['--watch=0', 'get_status']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: 'invalid_global_option',
        option: '--watch',
        message: '--watch requires a positive number (seconds).',
      });
    }
  });

  test('global option parser returns structured options', () => {
    const result = parseGlobalOptions([
      '--json',
      '--fields=player.name, ship.fuel',
      '--profile=pilot',
      '--allow-unknown',
      'get_status',
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.options).toMatchObject({
        json: true,
        allowUnknown: true,
        fields: ['player.name', 'ship.fuel'],
        profile: 'pilot',
        args: ['get_status'],
      });
    }
  });

  test('--quiet suppresses notification-like output in help', () => {
    const normal = runClient(['--help', 'travel']);
    const quiet = runClient(['--quiet', '--help', 'travel']);
    expect(normal.exitCode).toBe(0);
    expect(quiet.exitCode).toBe(0);
    // Both should show help content
    expect(normal.stdout).toContain('travel');
    expect(quiet.stdout).toContain('travel');
  });

  test('--plain removes ANSI codes from error output', () => {
    const resultPlain = runClient(['--plain', 'travel']);
    const resultColor = runClient(['travel']);
    // Both should have same exit code for missing arg
    expect(resultPlain.exitCode).toBe(1);
    expect(resultColor.exitCode).toBe(1);
    // Plain should not contain ANSI escape sequences for colors
    // ESC character (code 27) followed by [ and numbers
    const hasAnsi = resultPlain.stderr.split('').some((char, i, arr) => {
      return char.charCodeAt(0) === 27 && arr[i + 1] === '[';
    });
    expect(hasAnsi).toBe(false);
  });

  test('--plain removes ANSI codes from --quiet error output', () => {
    const result = runClient(['--quiet', '--plain', 'travel']);
    expect(result.exitCode).toBe(1);
    // Should not contain ANSI codes
    const hasAnsi = result.stderr.split('').some((char, i, arr) => {
      return char.charCodeAt(0) === 27 && arr[i + 1] === '[';
    });
    expect(hasAnsi).toBe(false);
  });

  test('--fields requires a value', () => {
    const result = runClient(['--fields']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--fields requires a value');
  });

  test('--fields=value syntax works', () => {
    const result = runClient(['--fields=player.name', '--help', 'travel']);
    // Help should still display (fields only affects API command output)
    expect(result.exitCode).toBe(0);
  });

  test('-f=value shorthand works', () => {
    const result = runClient(['-f=ship.fuel', '--help', 'travel']);
    expect(result.exitCode).toBe(0);
  });
});
