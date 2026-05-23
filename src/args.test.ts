import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyPayloadTransforms,
  convertPayloadTypes,
  normalizeParsedPayload,
  parseArgs,
  parseGlobalOptions,
  validateRequiredArgs,
} from './client';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry';
import { COMMANDS } from './commands';
import { createDryRunResponse, getServerPreviewCommand } from './preview';

function parseOk(
  args: string[],
  options?: Parameters<typeof parseArgs>[1],
): Extract<ReturnType<typeof parseArgs>, { ok: true }> {
  const result = parseArgs(args, options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result;
}

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

  test('credits is numeric (trade_offer) after alias normalization', () => {
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

  test('payload transforms do not mutate the original payload', () => {
    const original = { types: 'chat, combat', limit: 10, clear: false };
    const result = applyPayloadTransforms('get_notifications', original);

    expect(result).toEqual({
      types: ['chat', 'combat'],
      limit: 10,
      clear: false,
    });
    expect(original).toEqual({ types: 'chat, combat', limit: 10, clear: false });
    expect(result).not.toBe(original);
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

describe('command metadata', () => {
  test('get_cargo display-only fields are stripped before API calls', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.get_cargo;
    if (!config) {
      throw new Error('get_cargo command metadata is missing');
    }

    expect(config.clientOnlyFields).toEqual(expect.arrayContaining(['top', 'show_empty']));
    expect(config.aliases).toMatchObject({ limit: 'top' });
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
    expect(normalizeParsedPayload('faction_set_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeParsedPayload('faction_accept_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeParsedPayload('faction_remove_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeParsedPayload('faction_accept_invite', { faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeParsedPayload('faction_withdraw_invite', { player_id: 'PlayerName' })).toEqual({
      id: 'PlayerName',
    });
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
  test('parses positional args for a command supplied by a registry snapshot', () => {
    const command = 'dynamic_parser_snapshot_test';
    expect(COMMANDS[command]).toBeUndefined();
    const registry = {
      commands: {
        [command]: {
          args: ['target_id', 'quantity'],
          required: ['target_id', 'quantity'],
          route: { tool: 'dynamic_parser', action: 'snapshot_test' },
          schema: {
            target_id: { type: 'string', positionalIndex: 0 },
            quantity: { type: 'integer', positionalIndex: 1 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;

    const { payload } = parseOk([command, 'ship_123', '7'], { registry });

    expect(payload).toEqual({ target_id: 'ship_123', quantity: '7' });
  });

  test('no-arg command', () => {
    const { command, payload } = parseOk(['mine']);
    expect(command).toBe('mine');
    expect(payload).toEqual({});
  });

  test('single positional arg', () => {
    const { command, payload } = parseOk(['travel', 'sol_asteroid_belt']);
    expect(command).toBe('travel');
    expect(payload.target_poi).toBe('sol_asteroid_belt');
  });

  test('key=value arg', () => {
    const { command, payload } = parseOk(['travel', 'target_poi=sol_earth']);
    expect(command).toBe('travel');
    expect(payload.target_poi).toBe('sol_earth');
  });

  test('multiple positional args', () => {
    const { command, payload } = parseOk(['sell', 'ore_iron', '50']);
    expect(command).toBe('sell');
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('mixed positional and key=value args', () => {
    const { payload } = parseOk(['sell', 'ore_iron', '50', 'auto_list=true']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
    expect(payload.auto_list).toBe('true');
  });

  test('extra key=value not in arg list is parsed when present in command schema', () => {
    const { payload } = parseOk(['buy', 'ore_iron', 'deliver_to=cargo']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.deliver_to).toBe('cargo');
  });

  test('--flag value args use command field names', () => {
    const { payload } = parseOk(['sell', '--item-id', 'ore_iron', '--quantity', '50']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('--flag=value args normalize dashes to underscores', () => {
    const { payload } = parseOk(['travel', '--target-poi=sol_earth']);
    expect(payload.target_poi).toBe('sol_earth');
  });

  test('boolean CLI flags default to true without consuming the next positional arg', () => {
    const { payload } = parseOk(['sell', '--auto-list', 'ore_iron', '50']);
    expect(payload.auto_list).toBe('true');
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe('50');
  });

  test('unknown CLI flags are structured parser errors with suggestions', () => {
    const result = parseArgs(['sell', '--quanity', '50']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'quanity',
          message:
            'Unknown field "quanity" for "sell". Did you mean "quantity"? Use --allow-unknown or --raw to pass it through.',
          code: 'unknown_field',
        },
      ],
    });
  });

  test('allowUnknown passes unknown CLI flags through', () => {
    const { payload } = parseOk(['buy', '--delivery-mode', 'fast'], { allowUnknown: true });
    expect(payload.delivery_mode).toBe('fast');
  });

  test('unknown fields are structured parser errors with suggestions', () => {
    const result = parseArgs(['sell', 'ore_iron', 'quanity=50']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'quanity',
          message:
            'Unknown field "quanity" for "sell". Did you mean "quantity"? Use --allow-unknown or --raw to pass it through.',
          code: 'unknown_field',
        },
      ],
    });
  });

  test('schema validation errors are structured parser errors', () => {
    const result = parseArgs(['cloak', 'flase']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'enable',
          message: 'Invalid boolean "flase" for "enable". Use true/false. Did you mean "false"?',
          code: 'invalid_boolean',
        },
      ],
    });
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
    const { command, payload } = parseOk(['chat', 'local', 'hello', 'world', 'how', 'are', 'you']);
    expect(command).toBe('chat');
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('hello world how are you');
  });

  test('rest arg with single word', () => {
    const { payload } = parseOk(['chat', 'faction', 'hello']);
    expect(payload.channel).toBe('faction');
    expect(payload.content).toBe('hello');
  });

  test('rest arg via all key=value', () => {
    const { payload } = parseOk(['chat', 'channel=system', 'content=this is a message']);
    expect(payload.channel).toBe('system');
    expect(payload.content).toBe('this is a message');
  });

  test('rest arg captures free text containing equals signs', () => {
    const { payload } = parseOk(['chat', 'local', 'test with key=value pair']);
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('test with key=value pair');
  });

  test('rest arg at first position captures free text containing equals signs', () => {
    const { payload } = parseOk(['captains_log_add', 'test with key=value in text']);
    expect(payload.entry).toBe('test with key=value in text');
  });

  test('rest arg after a positional captures free text containing equals signs', () => {
    const { payload } = parseOk(['create_note', 'test-title', 'body with key=value text']);
    expect(payload.title).toBe('test-title');
    expect(payload.content).toBe('body with key=value text');
  });

  test('petition message captures free text containing equals signs', () => {
    const { payload } = parseOk(['petition', 'solarian', 'message with key=value text']);
    expect(payload.empire_id).toBe('solarian');
    expect(payload.message).toBe('message with key=value text');
  });
});

describe('parseArgs - tightened semantics', () => {
  test('-- terminator stops flag parsing and treats remaining as positional', () => {
    const { command, payload } = parseOk(['chat', 'local', '--', '--flag-like-message', 'hello']);
    expect(command).toBe('chat');
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('--flag-like-message hello');
  });

  test('-- terminator handles empty after it', () => {
    const { command, payload } = parseOk(['mine', '--']);
    expect(command).toBe('mine');
    expect(payload).toEqual({});
  });

  test('repeated flags aggregate into arrays', () => {
    const { payload } = parseOk(['buy', '--item-id', 'ore_iron', '--item-id', 'ore_copper'], { allowUnknown: true });
    expect(payload.item_id).toEqual(['ore_iron', 'ore_copper']);
  });

  test('repeated flags with values and mixed formats', () => {
    const { payload } = parseOk(['buy', '--item-id=ore_iron', '--item-id=ore_copper'], { allowUnknown: true });
    expect(payload.item_id).toEqual(['ore_iron', 'ore_copper']);
  });

  test('@file resolves to file contents', () => {
    const tmpFile = path.join(os.tmpdir(), `spacemolt_test_${Date.now()}.txt`);
    fs.writeFileSync(tmpFile, 'hello from file payload', 'utf-8');
    try {
      const { payload } = parseOk(['chat', 'local', `@${tmpFile}`]);
      expect(payload.content).toBe('hello from file payload');
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  test('@file missing file returns validation error', () => {
    const missingFile = path.join(os.tmpdir(), `spacemolt_missing_${Date.now()}.txt`);
    const result = parseArgs(['chat', 'local', `@${missingFile}`]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors?.[0]?.code).toBe('file_read_error');
      expect(result.errors?.[0]?.message).toContain('Could not read file');
    }
  });

  test('parseArgs resolves @file values through an injected resolver', () => {
    const command = 'note_dynamic';
    const seenFiles: string[] = [];
    const registry = {
      commands: {
        [command]: {
          args: ['body'],
          required: ['body'],
          route: { tool: 'notes', action: 'create' },
          schema: {
            body: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;

    const { payload } = parseOk([command, '@note.txt'], {
      registry,
      resolveFile(filePath) {
        seenFiles.push(filePath);
        return { ok: true, value: 'from injected resolver' };
      },
    });

    expect(seenFiles).toEqual(['note.txt']);
    expect(payload.body).toBe('from injected resolver');
  });

  test('parseArgs reports injected file resolver failures as structured errors', () => {
    const command = 'note_dynamic';
    const registry = {
      commands: {
        [command]: {
          args: ['body'],
          required: ['body'],
          route: { tool: 'notes', action: 'create' },
          schema: {
            body: { type: 'string', positionalIndex: 0 },
          },
        },
      },
    } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
    const args = [command, '@note.txt'];

    const result = parseArgs(args, {
      registry,
      resolveFile() {
        return { ok: false, error: 'synthetic missing file' };
      },
    });

    expect(result).toEqual({
      ok: false,
      errors: [{ field: 'body', message: 'synthetic missing file', code: 'file_read_error' }],
    });
  });

  test('--payload-json parses and merges JSON object', () => {
    const { payload } = parseOk(['buy', '--payload-json', '{"item_id": "ore_iron", "quantity": 10}']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.quantity).toBe(10);
  });

  test('--payload-json over-writes other flags', () => {
    const { payload } = parseOk(['buy', '--item-id', 'ore_copper', '--payload-json', '{"item_id": "ore_iron"}']);
    expect(payload.item_id).toBe('ore_iron');
  });

  test('--payload-json parses JSON from @file', () => {
    const tmpFile = path.join(os.tmpdir(), `spacemolt_json_${Date.now()}.json`);
    fs.writeFileSync(tmpFile, '{"item_id": "ore_gold", "quantity": 100}', 'utf-8');
    try {
      const { payload } = parseOk(['buy', '--payload-json', `@${tmpFile}`]);
      expect(payload.item_id).toBe('ore_gold');
      expect(payload.quantity).toBe(100);
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  });

  test('--payload-json invalid JSON returns validation error', () => {
    const result = parseArgs(['buy', '--payload-json', '{invalid_json}']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors?.[0]?.field).toBe('payload_json');
      expect(result.errors?.[0]?.code).toBe('invalid_field_type');
      expect(result.errors?.[0]?.message).toContain('Failed to parse --payload-json');
    }
  });

  test('--payload-json non-object JSON returns validation error', () => {
    const result = parseArgs(['buy', '--payload-json', '"just a string"']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors?.[0]?.field).toBe('payload_json');
      expect(result.errors?.[0]?.code).toBe('invalid_field_type');
      expect(result.errors?.[0]?.message).toContain('value must be a JSON object');
    }
  });
});

describe('parseArgs - new and fixed commands (v0.8.0)', () => {
  test('trade_offer uses credits not offer_credits', () => {
    const { payload } = parseOk(['trade_offer', 'player123', '500']);
    expect(payload.target_id).toBe('player123');
    expect(payload.credits).toBe('500');
    expect(payload.offer_credits).toBeUndefined();
    expect(payload.request_credits).toBeUndefined();
  });

  test('craft uses quantity not count', () => {
    const { payload } = parseOk(['craft', 'refine_steel', '5']);
    expect(payload.recipe_id).toBe('refine_steel');
    expect(payload.quantity).toBe('5');
    expect(payload.count).toBeUndefined();
  });

  test('help uses category and command args', () => {
    const { payload } = parseOk(['help', 'combat', 'attack']);
    expect(payload.category).toBe('combat');
    expect(payload.command).toBe('attack');
    expect(payload.topic).toBeUndefined();
  });

  test('distress_signal - no args', () => {
    const { command, payload } = parseOk(['distress_signal']);
    expect(command).toBe('distress_signal');
    expect(payload).toEqual({});
  });

  test('get_cargo - no args', () => {
    const { command, payload } = parseOk(['get_cargo']);
    expect(command).toBe('get_cargo');
    expect(payload).toEqual({});
  });

  test('get_cargo accepts display-only top and show_empty flags', () => {
    const { command, payload } = parseOk(['get_cargo', '--top', '3', '--show-empty']);

    expect(command).toBe('get_cargo');
    expect(normalizeParsedPayload('get_cargo', payload)).toMatchObject({
      top: '3',
      show_empty: 'true',
    });
  });

  test('get_cargo accepts limit as an alias for top', () => {
    const { payload } = parseOk(['get_cargo', '--limit=5']);

    expect(normalizeParsedPayload('get_cargo', payload)).toMatchObject({ top: '5' });
  });

  test('completed_missions - no args', () => {
    const { command, payload } = parseOk(['completed_missions']);
    expect(command).toBe('completed_missions');
    expect(payload).toEqual({});
  });

  test('session - no args', () => {
    const { command, payload } = parseOk(['session']);
    expect(command).toBe('session');
    expect(payload).toEqual({});
  });

  test('repair_module - positional', () => {
    const { payload } = parseOk(['repair_module', 'mod_uuid_123']);
    expect(payload.module_id).toBe('mod_uuid_123');
  });

  test('supply_commission - three positional args', () => {
    const { payload } = parseOk(['supply_commission', 'comm_123', 'steel_plate', '10']);
    expect(payload.commission_id).toBe('comm_123');
    expect(payload.item_id).toBe('steel_plate');
    expect(payload.quantity).toBe('10');
  });

  test('view_completed_mission - positional', () => {
    const { payload } = parseOk(['view_completed_mission', 'tmpl_456']);
    expect(payload.template_id).toBe('tmpl_456');
  });

  test('get_action_log - all optional positional', () => {
    const { payload } = parseOk(['get_action_log', 'combat', 'faction_1', '2']);
    expect(payload.category).toBe('combat');
    expect(payload.faction_id).toBe('faction_1');
    expect(payload.page).toBe('2');
  });

  test('agentlogs - category and message required', () => {
    const { payload } = parseOk(['agentlogs', 'navigation', 'jumped to new system']);
    expect(payload.category).toBe('navigation');
    expect(payload.message).toBe('jumped to new system');
  });

  test('get_map with system_id', () => {
    const { payload } = parseOk(['get_map', 'sol']);
    expect(payload.system_id).toBe('sol');
  });

  test('view_market with category filter', () => {
    const { payload } = parseOk(['view_market', 'ore_iron', 'ore']);
    expect(payload.item_id).toBe('ore_iron');
    expect(payload.category).toBe('ore');
  });

  test('view_market accepts category as a named filter', () => {
    const { payload } = parseOk(['view_market', '--category', 'ore']);
    expect(payload.category).toBe('ore');
  });

  test('view_market accepts item and search filters as flags', () => {
    const item = parseOk(['view_market', '--item', 'iron_ore']);
    expect(normalizeParsedPayload('view_market', item.payload)).toMatchObject({ item_id: 'iron_ore' });

    const search = parseOk(['view_market', '--search', 'iron']);
    expect(search.payload.search).toBe('iron');
  });

  test('view_orders with station_id', () => {
    const { payload } = parseOk(['view_orders', 'sol_central']);
    expect(payload.station_id).toBe('sol_central');
  });

  test('view_orders accepts item and search filters', () => {
    const item = parseOk(['view_orders', '--item', 'iron_ore']);
    expect(normalizeParsedPayload('view_orders', item.payload)).toMatchObject({ item_id: 'iron_ore' });

    const search = parseOk(['view_orders', '--search', 'iron']);
    expect(search.payload.search).toBe('iron');
  });

  test('view_storage with station_id', () => {
    const { payload } = parseOk(['view_storage', 'nexus_base']);
    expect(payload.station_id).toBe('nexus_base');
  });

  test('view_storage accepts item and search filters', () => {
    const item = parseOk(['view_storage', '--item', 'iron_ore']);
    expect(normalizeParsedPayload('view_storage', item.payload)).toMatchObject({ item_id: 'iron_ore' });

    const search = parseOk(['view_storage', '--search', 'iron']);
    expect(search.payload.search).toBe('iron');
  });

  test('view_faction_storage accepts item and search filters', () => {
    const item = parseOk(['view_faction_storage', '--item', 'iron_ore']);
    expect(normalizeParsedPayload('view_faction_storage', item.payload)).toMatchObject({ item_id: 'iron_ore' });

    const search = parseOk(['view_faction_storage', '--search=iron']);
    expect(search.payload.search).toBe('iron');
  });

  test('send_gift with ship_id', () => {
    const { payload } = parseOk(['send_gift', 'PlayerName', 'ship_id=ship_456']);
    expect(payload.recipient).toBe('PlayerName');
    expect(payload.ship_id).toBe('ship_456');
  });

  test('faction_declare_war with reason', () => {
    const { payload } = parseOk(['faction_declare_war', 'faction_xyz', 'territorial dispute']);
    expect(payload.target_faction_id).toBe('faction_xyz');
    expect(payload.reason).toBe('territorial dispute');
  });

  test('faction_create_role with permissions', () => {
    const { payload } = parseOk(['faction_create_role', 'Officer', '2', 'recruit,kick']);
    expect(payload.name).toBe('Officer');
    expect(payload.priority).toBe('2');
    expect(payload.permissions).toBe('recruit,kick');
  });

  test('faction_query_intel with all filters', () => {
    const { payload } = parseOk(['faction_query_intel', 'sol', 'sys_123', 'asteroid', 'iron']);
    expect(payload.system_name).toBe('sol');
    expect(payload.system_id).toBe('sys_123');
    expect(payload.poi_type).toBe('asteroid');
    expect(payload.resource_type).toBe('iron');
  });

  test('captains_log_list with index', () => {
    const { payload } = parseOk(['captains_log_list', '5']);
    expect(payload.index).toBe('5');
  });

  test('faction_post_mission with required positional args', () => {
    const { payload } = parseOk(['faction_post_mission', 'Defend Our Home', 'defense', 'Protect the base']);
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
    expect(parseOk(['list_drones']).payload).toEqual({});
    expect(parseOk(['get_drone', 'drone_1']).payload.drone_id).toBe('drone_1');
    expect(parseOk(['upload_drone', 'drone_1', 'scan', 'asteroids']).payload).toEqual({
      drone_id: 'drone_1',
      script: 'scan asteroids',
    });
  });

  test('new explicit battle commands parse positional payloads', () => {
    expect(parseOk(['battle_stance', 'brace']).payload.stance).toBe('brace');
    expect(parseOk(['battle_target', 'player_1']).payload.target_id).toBe('player_1');
    expect(parseOk(['reload', 'weapon_1', 'ammo_light']).payload).toEqual({
      weapon_instance_id: 'weapon_1',
      ammo_item_id: 'ammo_light',
    });
  });

  test('new explicit fleet and facility commands parse positional payloads', () => {
    expect(parseOk(['fleet_status']).payload).toEqual({});
    expect(parseOk(['fleet_invite', 'PlayerName']).payload.player_id).toBe('PlayerName');
    expect(parseOk(['facility_build', 'ore_refinery']).payload.facility_type).toBe('ore_refinery');
    expect(parseOk(['facility_toggle', 'fac_1']).payload.facility_id).toBe('fac_1');
  });

  test('new coverage commands parse positional payloads', () => {
    expect(parseOk(['get_empire_info', 'solarian']).payload.empire_id).toBe('solarian');
    expect(parseOk(['get_tax_estimate']).payload).toEqual({});
    expect(parseOk(['get_notifications', 'clear=false', 'limit=10', 'types=chat,combat']).payload).toEqual({
      clear: 'false',
      limit: '10',
      types: 'chat,combat',
    });
    expect(parseOk(['scrap_ship', 'ship_1']).payload.ship_id).toBe('ship_1');
    expect(parseOk(['faction_set_ally', 'NOVA']).payload.target_faction_id).toBe('NOVA');
    expect(parseOk(['faction_accept_ally', 'NOVA']).payload.target_faction_id).toBe('NOVA');
    expect(parseOk(['faction_accept_invite', 'fac_1']).payload.faction_id).toBe('fac_1');
    expect(parseOk(['faction_withdraw_invite', 'PlayerName']).payload.player_id).toBe('PlayerName');
  });

  test('citizenship commands parse positional payloads', () => {
    expect(parseOk(['citizenship_list', 'solarian']).payload.empire_id).toBe('solarian');
    expect(parseOk(['citizenship_apply', 'solarian']).payload.empire).toBe('solarian');
    expect(parseOk(['citizenship_renounce', 'voidborn']).payload.empire).toBe('voidborn');
    expect(parseOk(['citizenship_withdraw', 'crimson']).payload.empire).toBe('crimson');
  });

  test('facility sale commands parse positional payloads', () => {
    expect(parseOk(['facility_list_for_sale', 'facility_1', '5000']).payload).toEqual({
      facility_id: 'facility_1',
      price: '5000',
    });
    expect(parseOk(['facility_browse_for_sale', 'ore_refinery', '10000', '2', '25']).payload).toEqual({
      facility_type: 'ore_refinery',
      max_price: '10000',
      page: '2',
      per_page: '25',
    });
    expect(parseOk(['facility_buy_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
    expect(parseOk(['facility_cancel_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
  });

  test('new note and captains log delete commands parse positional payloads', () => {
    expect(parseOk(['delete_note', 'note_1']).payload.note_id).toBe('note_1');
    expect(parseOk(['captains_log_delete', '3']).payload.index).toBe('3');
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

describe('parseArgs fixtures', () => {
  test('parseArgs fixtures use registered commands', () => {
    const registeredCommands = new Set(Object.keys(COMMANDS));

    const testPath = path.join(import.meta.dir, 'args.test.ts');
    const testSrc = fs.readFileSync(testPath, 'utf-8');
    const fixtureCommands = [...testSrc.matchAll(/parseArgs\(\[['"]([a-z][a-z0-9_]*)['"]/g)]
      .map((match) => match[1])
      .filter((command): command is string => Boolean(command));
    const unknownFixtures = [...new Set(fixtureCommands)].filter((command) => !registeredCommands.has(command));

    expect(unknownFixtures).toEqual([]);
  });
});

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
      '--field=ship.fuel',
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
        field: 'ship.fuel',
        profile: 'pilot',
        args: ['get_status'],
      });
    }
  });

  test('global option parser handles watch, format, jq, profile, and dry-run values', () => {
    const result = parseGlobalOptions([
      '--watch',
      '2.5',
      '--debug',
      '--format=yaml',
      '--jq=.items[].id',
      '--extract',
      'ship.fuel',
      '--profile=pilot',
      '--dry-run=false',
      'get_status',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.options.watch).toBe(2.5);
    expect(result.options.debug).toBe(true);
    expect(result.options.format).toBe('yaml');
    expect(result.options.jq).toBe('.items[].id');
    expect(result.options.field).toBe('ship.fuel');
    expect(result.options.profile).toBe('pilot');
    expect(result.options.dryRun).toBe(false);
    expect(result.options.args).toEqual(['get_status']);
  });

  test('global option parser handles equals shorthands and default watch interval', () => {
    const result = parseGlobalOptions(['--watch', '-fmt=text', '-f=id,name', '--preview=1', 'get_status']);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.options.watch).toBe(10);
    expect(result.options.format).toBe('text');
    expect(result.options.fields).toEqual(['id', 'name']);
    expect(result.options.dryRun).toBe(true);
    expect(result.options.args).toEqual(['get_status']);
  });

  test('global option parser rejects invalid option values', () => {
    expect(parseGlobalOptions(['--watch=0'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--watch',
        message: '--watch requires a positive number (seconds).',
      },
    });
    expect(parseGlobalOptions(['--format=xml'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--format',
        message: 'Invalid format "xml". Expected one of: table, json, yaml, text.',
      },
    });
    expect(parseGlobalOptions(['--jq'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--jq',
        message: '--jq requires a path expression.',
      },
    });
  });
});
