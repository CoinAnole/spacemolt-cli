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

const internalCommandRegistry = { commands: COMMANDS } satisfies Pick<CommandRegistrySnapshot, 'commands'>;
const internalParseOptions = { registry: internalCommandRegistry } satisfies NonNullable<
  Parameters<typeof parseArgs>[1]
>;

function parseOk(
  args: string[],
  options?: Parameters<typeof parseArgs>[1],
): Extract<ReturnType<typeof parseArgs>, { ok: true }> {
  const result = parseArgs(args, options);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.errors.map((error) => error.message).join('; '));
  return result;
}

function parseInternalOk(args: string[]): Extract<ReturnType<typeof parseArgs>, { ok: true }> {
  return parseOk(args, internalParseOptions);
}

function parseInternalArgs(args: string[]): ReturnType<typeof parseArgs> {
  return parseArgs(args, internalParseOptions);
}

function normalizeInternalPayload(command: string, payload: Record<string, unknown>): Record<string, unknown> {
  return normalizeParsedPayload(command, payload, internalCommandRegistry);
}

function convertInternalPayloadTypes(payload: Record<string, unknown>, command: string): Record<string, unknown> {
  return convertPayloadTypes(payload, command, internalCommandRegistry);
}

function validateInternalRequiredArgs(command: string, payload: Record<string, unknown>): string | null {
  return validateRequiredArgs(command, payload, internalCommandRegistry);
}

describe('convertPayloadTypes', () => {
  test('converts numeric fields using the command schema', () => {
    expect(convertPayloadTypes({ quantity: '10' }, 'sell').quantity).toBe(10);
    expect(convertPayloadTypes({ page_size: '20' }, 'catalog').page_size).toBe(20);
    expect(convertInternalPayloadTypes({ max_price: '10000' }, 'facility_browse_for_sale').max_price).toBe(10000);
    expect(convertInternalPayloadTypes({ price: '500' }, 'facility_list_for_sale').price).toBe(500);
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
    const normalized = normalizeInternalPayload('trade_offer', { target_id: 'abc123', credits: '500' });
    const result = convertInternalPayloadTypes(normalized, 'trade_offer');
    expect(result.target).toBe('abc123');
    expect(result.offer_credits).toBe(500);
  });

  test('unknown fields are not auto-converted globally', () => {
    const result = convertPayloadTypes({ offer_credits: '100', request_credits: '200' });
    expect(result.offer_credits).toBe('100');
    expect(result.request_credits).toBe('200');
  });

  test('craft count alias is converted using the command schema', () => {
    const result = convertPayloadTypes({ count: '5' }, 'craft');
    expect(result.count).toBe(5);
  });

  test('handles ticks and amount as numeric', () => {
    expect(convertPayloadTypes({ ticks: '100' }, 'buy_insurance').ticks).toBe(100);
    expect(convertInternalPayloadTypes({ quantity: '2500' }, 'faction_deposit_credits').quantity).toBe(2500);
  });

  test('handles expiration_hours as numeric', () => {
    const result = convertInternalPayloadTypes({ expiration_hours: '24' }, 'faction_post_mission');
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

  test('notification type validation accepts market subscriptions', () => {
    const { payload } = parseOk(['get_notifications', 'types=market']);
    const typed = convertPayloadTypes(payload, 'get_notifications');
    expect(applyPayloadTransforms('get_notifications', typed)).toEqual({ types: ['market'] });
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

describe('removed storage command names', () => {
  const removedStorageCommands = [
    'view_storage',
    'view_faction_storage',
    'deposit_items',
    'withdraw_items',
    'send_gift',
    'storage_loot',
    'storage_jettison',
  ];

  test('legacy storage command names are not bundled curated commands', () => {
    for (const command of removedStorageCommands) {
      expect(BUNDLED_COMMAND_REGISTRY.commands).not.toHaveProperty(command);
      expect(BUNDLED_COMMAND_REGISTRY.allCommands).not.toHaveProperty(command);
    }
  });
});

describe('command metadata', () => {
  test('get_cargo display-only fields are stripped before API calls', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.get_cargo;
    if (!config) {
      throw new Error('get_cargo command metadata is missing');
    }

    expect(config.clientOnlyFields).toEqual(expect.arrayContaining(['top', 'show_empty', 'items']));
    expect(config.aliases).toMatchObject({ limit: 'top' });
  });

  test('storage view filters are client-only metadata', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.storage;
    if (!config) {
      throw new Error('storage command metadata is missing');
    }

    expect(config.clientOnlyFields).toEqual(expect.arrayContaining(['search', 'items']));
    expect(config.aliases).toMatchObject({
      item: 'item_id',
      recipient: 'target',
      ship_id: 'item_id',
    });
    expect(config.schema?.action?.enum).toEqual(['view', 'deposit', 'withdraw', 'loot', 'jettison']);
  });

  test('view_market search filter is client-only metadata', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.view_market;
    if (!config) {
      throw new Error('view_market command metadata is missing');
    }

    expect(config.clientOnlyFields).toEqual(expect.arrayContaining(['search']));
  });

  test('removed alliance alias is not registered as a command', () => {
    expect(COMMANDS).not.toHaveProperty('faction_set_ally');
    expect(BUNDLED_COMMAND_REGISTRY.commands).not.toHaveProperty('faction_set_ally');
  });

  test('flat grouped command tokens parse raw but are absent from bundled command registry', () => {
    expect(parseArgs(['faction_info'])).toEqual({ ok: true, command: 'faction_info', payload: {} });
    expect(BUNDLED_COMMAND_REGISTRY.commands.faction_info).toBeUndefined();
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
    expect(normalizeParsedPayload('name_drone', { drone_id: 'drone_1', name: 'Scout One' })).toEqual({
      id: 'drone_1',
      text: 'Scout One',
    });
    expect(normalizeParsedPayload('upload_drone', { drone_id: 'drone_1', script: 'scan' })).toEqual({
      id: 'drone_1',
      text: 'scan',
    });
    expect(normalizeParsedPayload('battle_target', { target_id: 'player_1' })).toEqual({ id: 'player_1' });
    expect(normalizeInternalPayload('fleet_invite', { player_id: 'PlayerName' })).toEqual({ id: 'PlayerName' });
    expect(normalizeParsedPayload('delete_note', { note_id: 'note_1' })).toEqual({ target: 'note_1' });
    expect(normalizeInternalPayload('faction_propose_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeInternalPayload('faction_accept_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeInternalPayload('faction_remove_ally', { target_faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeInternalPayload('faction_accept_invite', { faction_id: 'fac_1' })).toEqual({ id: 'fac_1' });
    expect(normalizeInternalPayload('faction_withdraw_invite', { player_id: 'PlayerName' })).toEqual({
      id: 'PlayerName',
    });
    expect(normalizeParsedPayload('scrap_ship', { ship_id: 'ship_1' })).toEqual({ id: 'ship_1' });
    expect(normalizeParsedPayload('get_empire_info', { empire_id: 'solarian' })).toEqual({ id: 'solarian' });
  });

  test('citizenship command aliases normalize to API fields', () => {
    expect(normalizeInternalPayload('citizenship_apply', { empire: 'solarian' })).toEqual({
      target: 'solarian',
    });
    expect(normalizeInternalPayload('citizenship_renounce', { empire: 'voidborn' })).toEqual({
      target: 'voidborn',
    });
    expect(normalizeInternalPayload('citizenship_withdraw', { empire: 'crimson' })).toEqual({
      target: 'crimson',
    });
    expect(normalizeInternalPayload('citizenship_list', { empire_id: 'nebula' })).toEqual({
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
          message: 'Parameter "enable" must be a boolean, but received "flase". Did you mean "false"?',
          code: 'invalid_boolean',
        },
      ],
    });
  });

  test('schema validation integer errors name the parameter, expected type, and received value', () => {
    const result = parseArgs(['sell', 'ore_iron', 'quantity=lots']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'quantity',
          message: 'Parameter "quantity" must be an integer, but received "lots".',
          code: 'invalid_integer',
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

  test('faction_build previews the faction facility build endpoint', () => {
    const response = createDryRunResponse('faction_build', { facility_type: 'ore_refinery' });
    expect(response.structuredContent?.server_request_sent).toBe(false);
    expect(response.structuredContent?.url).toContain('/api/v2/spacemolt_facility/faction_build');
    expect(response.structuredContent?.payload).toEqual({ facility_type: 'ore_refinery' });
  });

  test('facility_build preview documents that build accepts faction facility types', () => {
    const response = createDryRunResponse('facility_build', { facility_type: 'faction_lockbox' });

    expect(response.structuredContent?.url).toContain('/api/v2/spacemolt_facility/build');
    expect(response.result).toContain('faction facility types are accepted');
    expect(response.result).not.toContain('player facility');
  });

  test('buy with quantity uses the server estimate endpoint as its preview', () => {
    expect(getServerPreviewCommand('buy', { item_id: 'ore_iron', quantity: 50 })).toBe('estimate_purchase');
    expect(getServerPreviewCommand('buy', { item_id: 'ore_iron' })).toBeNull();
  });

  test('refuel dry-run notes explain station top-off quantity semantics', () => {
    const response = createDryRunResponse('refuel', { quantity: 3 });

    expect(response.result).toContain('Station credit refueling ignores quantity and fills the tank to full.');
    expect(response.result).toContain('quantity applies only to fuel cells or ship-to-ship transfers.');
  });
});

describe('parseArgs - rest args', () => {
  test('rest arg captures all remaining tokens for non-chat commands', () => {
    const { command, payload } = parseOk(['captains_log_add', 'hello', 'world', 'how', 'are', 'you']);
    expect(command).toBe('captains_log_add');
    expect(payload.entry).toBe('hello world how are you');
  });

  test('chat rest arg with single word', () => {
    const { payload } = parseOk(['chat', 'faction', 'hello']);
    expect(payload.channel).toBe('faction');
    expect(payload.content).toBe('hello');
  });

  test('chat positional message accepts one quoted argument', () => {
    const { payload } = parseOk(['chat', 'local', 'hello world']);
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('hello world');
  });

  test('chat positional message rejects multiple unquoted arguments', () => {
    const result = parseArgs(['chat', 'local', 'hello', 'world']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'content',
          message: 'Chat message must be quoted or passed with --content.',
          code: 'ambiguous_chat_content',
        },
      ],
    });
  });

  test('chat --content rejects trailing unquoted message tokens', () => {
    const result = parseArgs(['chat', 'local', '--content', 'hello', 'world']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'content',
          message: 'Chat message must be quoted or passed with --content.',
          code: 'ambiguous_chat_content',
        },
      ],
    });
  });

  test('chat --content accepts one quoted argument', () => {
    const { payload } = parseOk(['chat', 'local', '--content', 'hello world']);
    expect(payload.channel).toBe('local');
    expect(payload.content).toBe('hello world');
  });

  test('private chat positional form treats target and content as separate arguments', () => {
    const { payload } = parseOk(['chat', 'private', 'Vex Nebulon', 'Hello, wanted to reach out about the intel pact.']);
    expect(payload.channel).toBe('private');
    expect(payload.target_id).toBe('Vex Nebulon');
    expect(payload.content).toBe('Hello, wanted to reach out about the intel pact.');
  });

  test('private chat positional form requires message content', () => {
    const result = parseArgs(['chat', 'private', 'Vex Nebulon']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'content',
          message:
            'Private chat requires both a target and message. Use: spacemolt chat private "Player Name" "Message"',
          code: 'missing_private_chat_content',
        },
      ],
    });
  });

  test('private chat rejects split --target-id values before --content', () => {
    const result = parseArgs(['chat', 'private', '--target-id', 'Vex', 'Nebulon', '--content', 'Hello']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'target_id',
          message:
            'Ambiguous private chat target "Vex Nebulon". Quote multi-word player names, or use: spacemolt chat private "Player Name" "Message"',
          code: 'ambiguous_private_chat_target',
        },
      ],
    });
  });

  test('private chat rejects unquoted positional message after a quoted target', () => {
    const result = parseArgs(['chat', 'private', 'Vex Nebulon', 'Hello', 'there']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'content',
          message: 'Chat message must be quoted or passed with --content.',
          code: 'ambiguous_chat_content',
        },
      ],
    });
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
  test('-- terminator stops flag parsing but chat still requires one message token', () => {
    const result = parseArgs(['chat', 'local', '--', '--flag-like-message', 'hello']);
    expect(result).toEqual({
      ok: false,
      errors: [
        {
          field: 'content',
          message: 'Chat message must be quoted or passed with --content.',
          code: 'ambiguous_chat_content',
        },
      ],
    });
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
    const { payload } = parseInternalOk(['trade_offer', 'player123', '500']);
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

  test('craft accepts queued production options and bulk jobs JSON', () => {
    const queue = parseOk(['craft', 'action=queue']);
    expect(queue.payload).toEqual({ action: 'queue' });

    expect(parseOk(['craft', 'job_id=job-1']).payload).toEqual({ job_id: 'job-1' });

    const cancelManyPayload = convertPayloadTypes(parseOk(['craft', 'job_ids=["job-1","job-2"]']).payload, 'craft');
    expect(cancelManyPayload).toEqual({ job_ids: ['job-1', 'job-2'] });

    const quoted = parseOk(['craft', 'basic_iron_smelting', '50', 'dry_run=true', 'preset=cheap']);
    const quotedPayload = convertPayloadTypes(normalizeParsedPayload('craft', quoted.payload), 'craft');
    expect(quotedPayload).toEqual({
      id: 'basic_iron_smelting',
      quantity: 50,
      dry_run: true,
      preset: 'cheap',
    });

    const bulk = parseOk([
      'craft',
      'jobs=[{"recipe_id":"basic_iron_smelting","quantity":100},{"recipe_id":"basic_copper_processing","quantity":50}]',
    ]);
    const bulkPayload = convertPayloadTypes(normalizeParsedPayload('craft', bulk.payload), 'craft');
    expect(bulkPayload).toEqual({
      jobs: [
        { recipe_id: 'basic_iron_smelting', quantity: 100 },
        { recipe_id: 'basic_copper_processing', quantity: 50 },
      ],
    });
  });

  test('craft accepts faction storage extension bucket destinations', () => {
    const parsed = parseOk(['craft', 'basic_iron_smelting', '50', 'deliver_to=faction:Workshop']);
    const payload = convertPayloadTypes(normalizeParsedPayload('craft', parsed.payload), 'craft');

    expect(payload).toEqual({
      id: 'basic_iron_smelting',
      quantity: 50,
      deliver_to: 'faction:Workshop',
    });
  });

  test('faction_build accepts bucket from changelog (faction storage extension source)', () => {
    const { payload } = parseInternalOk(['faction_build', 'deep_core_mine', 'bucket=BuildMat']);
    expect(payload).toEqual({ facility_type: 'deep_core_mine', bucket: 'BuildMat' });
  });

  test('faction_create_sell_order accepts bucket param (changelog feature)', () => {
    const { payload } = parseInternalOk(['faction_create_sell_order', 'steel_plate', '20', '12', 'bucket=Sales']);
    expect(payload.bucket).toBe('Sales');
    expect(payload.item_id).toBe('steel_plate');
  });

  test('craft accepts source param separate from deliver_to (changelog storage bucket split)', () => {
    const parsed = parseOk(['craft', 'refine_titanium', '5', 'source=storage', 'deliver_to=faction:Crafting']);
    const payload = normalizeParsedPayload('craft', parsed.payload);
    expect(payload.source).toBe('storage');
    expect(payload.deliver_to).toBe('faction:Crafting');
  });

  test('recycle accepts faction storage extension bucket destinations', () => {
    const parsed = parseOk(['recycle', 'basic_iron_smelting', '20', 'deliver_to=faction:Recycling']);
    const payload = convertPayloadTypes(normalizeParsedPayload('recycle', parsed.payload), 'recycle');
    expect(payload).toEqual({
      id: 'basic_iron_smelting',
      quantity: 20,
      deliver_to: 'faction:Recycling',
    });
  });

  test('recycle parses recipe positionals and bulk jobs JSON', () => {
    expect(parseOk(['recycle', 'job_id=job-1']).payload).toEqual({ job_id: 'job-1' });

    const cancelManyPayload = convertPayloadTypes(parseOk(['recycle', 'job_ids=["job-1","job-2"]']).payload, 'recycle');
    expect(cancelManyPayload).toEqual({ job_ids: ['job-1', 'job-2'] });

    const single = parseOk(['recycle', 'basic_iron_smelting', '20', 'dry_run=true']);
    const singlePayload = convertPayloadTypes(normalizeParsedPayload('recycle', single.payload), 'recycle');
    expect(singlePayload).toEqual({
      id: 'basic_iron_smelting',
      quantity: 20,
      dry_run: true,
    });

    const bulk = parseOk([
      'recycle',
      'jobs=[{"recipe_id":"basic_iron_smelting","quantity":20},{"recipe_id":"basic_copper_processing","quantity":10}]',
    ]);
    const bulkPayload = convertPayloadTypes(normalizeParsedPayload('recycle', bulk.payload), 'recycle');
    expect(bulkPayload).toEqual({
      jobs: [
        { recipe_id: 'basic_iron_smelting', quantity: 20 },
        { recipe_id: 'basic_copper_processing', quantity: 10 },
      ],
    });
  });

  test('facility production commands parse natural positionals', () => {
    const add = parseInternalOk([
      'facility_job_add',
      'facility-1',
      'refine_steel',
      '12',
      'reverse',
      'deliver_to=faction',
    ]);
    expect(convertInternalPayloadTypes(add.payload, 'facility_job_add')).toEqual({
      facility_id: 'facility-1',
      recipe_id: 'refine_steel',
      quantity: 12,
      direction: 'reverse',
      deliver_to: 'faction',
    });

    expect(parseInternalOk(['facility_job_list', 'facility-1']).payload).toEqual({
      facility_id: 'facility-1',
    });

    expect(parseInternalOk(['facility_job_cancel', 'job-1']).payload).toEqual({
      job_id: 'job-1',
    });
    expect(
      convertInternalPayloadTypes(
        parseInternalOk(['facility_job_cancel', 'job_ids=["job-1","job-2"]']).payload,
        'facility_job_cancel',
      ),
    ).toEqual({
      job_ids: ['job-1', 'job-2'],
    });

    const reorder = parseInternalOk(['facility_job_reorder', 'job-1', '3']);
    expect(convertInternalPayloadTypes(reorder.payload, 'facility_job_reorder')).toEqual({
      job_id: 'job-1',
      position: 3,
    });

    const price = parseInternalOk(['facility_set_output_price', 'facility-1', '25']);
    expect(convertInternalPayloadTypes(price.payload, 'facility_set_output_price')).toEqual({
      facility_id: 'facility-1',
      price: 25,
    });

    expect(parseInternalOk(['facility_set_access', 'facility-1', 'public']).payload).toEqual({
      facility_id: 'facility-1',
      access: 'public',
    });

    expect(parseInternalArgs(['facility_job_add', 'facility-1', 'refine_steel', '12', 'to_faction'])).toEqual({
      ok: false,
      errors: [
        {
          field: 'direction',
          message: 'Invalid value "to_faction" for "direction". Expected one of: forward, reverse',
          code: 'invalid_enum',
        },
      ],
    });
  });

  test('facility and station additions from v0.410 parse natural positionals', () => {
    const facilityName = parseInternalOk(['facility_set_name', 'facility-1', 'Frontier Smelter']);
    expect(facilityName.payload).toEqual({
      facility_id: 'facility-1',
      custom_name: 'Frontier Smelter',
    });

    const fractionalPrice = parseInternalOk(['facility_set_output_price', 'facility-1', '0.25']);
    expect(convertInternalPayloadTypes(fractionalPrice.payload, 'facility_set_output_price')).toEqual({
      facility_id: 'facility-1',
      price: 0.25,
    });

    expect(parseOk(['get_base_cost']).payload).toEqual({});
    expect(convertPayloadTypes(parseOk(['build_base', 'Aurora Freeport', 'true']).payload, 'build_base')).toEqual({
      name: 'Aurora Freeport',
      public_access: true,
    });
    expect(parseOk(['build_outpost', 'Aurora Cache']).payload).toEqual({
      name: 'Aurora Cache',
    });
    expect(parseOk(['buy_ship_license', 'solarian']).payload).toEqual({
      empire: 'solarian',
    });

    expect(parseInternalOk(['station_info']).payload).toEqual({});
    expect(parseInternalOk(['station_set_name', 'Aurora Freeport']).payload).toEqual({
      name: 'Aurora Freeport',
    });
    expect(parseInternalOk(['station_set_description', 'A lawless trade hub']).payload).toEqual({
      description: 'A lawless trade hub',
    });
    expect(
      convertInternalPayloadTypes(parseInternalOk(['station_set_public', 'true']).payload, 'station_set_public'),
    ).toEqual({
      public: true,
    });
    expect(
      convertInternalPayloadTypes(
        parseInternalOk(['station_set_build_policy', 'false']).payload,
        'station_set_build_policy',
      ),
    ).toEqual({
      allow_outsiders: false,
    });
    expect(parseInternalOk(['station_set_service_access', 'market', 'allies']).payload).toEqual({
      service: 'market',
      access: 'allies',
    });
    expect(
      convertInternalPayloadTypes(parseInternalOk(['station_set_market_fee', '7']).payload, 'station_set_market_fee'),
    ).toEqual({
      fee_percent: 7,
    });
    expect(
      convertInternalPayloadTypes(
        parseInternalOk(['station_set_refuel_price', '3']).payload,
        'station_set_refuel_price',
      ),
    ).toEqual({
      price: 3,
    });
    expect(
      convertInternalPayloadTypes(
        parseInternalOk(['station_set_repair_price', '4']).payload,
        'station_set_repair_price',
      ),
    ).toEqual({
      price: 4,
    });
    expect(parseInternalOk(['station_allow_player', 'pilot-1']).payload).toEqual({ player: 'pilot-1' });
    expect(parseInternalOk(['station_remove_player', 'pilot-1']).payload).toEqual({ player: 'pilot-1' });
    expect(parseInternalOk(['station_ban', 'pilot-1']).payload).toEqual({ player: 'pilot-1' });
    expect(parseInternalOk(['station_unban', 'pilot-1']).payload).toEqual({ player: 'pilot-1' });
    expect(parseInternalOk(['station_allow_faction', 'faction-1']).payload).toEqual({ faction: 'faction-1' });
    expect(parseInternalOk(['station_remove_faction', 'faction-1']).payload).toEqual({ faction: 'faction-1' });
  });

  test('tax and faction scan additions from v0.410 parse natural positionals', () => {
    const prepay = parseOk(['prepay_tax', '5000']);
    expect(normalizeParsedPayload('prepay_tax', prepay.payload)).toEqual({ quantity: '5000' });
    expect(convertPayloadTypes(normalizeParsedPayload('prepay_tax', prepay.payload), 'prepay_tax')).toEqual({
      quantity: 5000,
    });

    expect(
      convertInternalPayloadTypes(parseInternalOk(['faction_prepay_tax', '12000']).payload, 'faction_prepay_tax'),
    ).toEqual({
      amount: 12000,
    });
    expect(parseInternalOk(['get_faction_tax_estimate']).payload).toEqual({});
    expect(parseInternalOk(['faction_scan_poi', 'poi-1']).payload).toEqual({ poi_id: 'poi-1' });
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

  test('get_cargo accepts display-only items filter', () => {
    const { payload } = parseOk(['get_cargo', '--items', 'aluminum_ore,steel_plate,aluminum_sheet']);

    expect(normalizeParsedPayload('get_cargo', payload)).toMatchObject({
      items: 'aluminum_ore,steel_plate,aluminum_sheet',
    });
  });

  test('get_status accepts summary as a display-only boolean flag', () => {
    const { command, payload } = parseOk(['get_status', '--summary']);

    expect(command).toBe('get_status');
    expect(payload).toEqual({ summary: 'true' });
    expect(convertPayloadTypes(payload, 'get_status')).toEqual({ summary: true });
    expect(BUNDLED_COMMAND_REGISTRY.commands.get_status?.clientOnlyFields).toContain('summary');
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

  test('get_action_log accepts event_type filter', () => {
    const { payload } = parseOk(['get_action_log', 'event_type=faction.production_cycle', 'faction_id=faction_1']);
    expect(payload.event_type).toBe('faction.production_cycle');
    expect(payload.faction_id).toBe('faction_1');
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

  test('view_market accepts incremental market cursor', () => {
    const { payload } = parseOk(['view_market', '--since', '900683']);
    expect(convertPayloadTypes(payload, 'view_market')).toMatchObject({ since: 900683 });
  });

  test('achievement queries require no arguments', () => {
    expect(parseOk(['get_achievements']).payload).toEqual({});
    expect(parseOk(['get_faction_achievements']).payload).toEqual({});
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

  test('storage view parses action-specific station positional and filters', () => {
    const { command, payload } = parseOk(['storage', 'view', 'nexus_base', '--item', 'iron_ore', '--search', 'iron']);

    expect(command).toBe('storage');
    expect(normalizeParsedPayload('storage', payload)).toMatchObject({
      action: 'view',
      station_id: 'nexus_base',
      item_id: 'iron_ore',
      search: 'iron',
    });
  });

  test('storage view accepts faction target and items filter', () => {
    const { payload } = parseOk(['storage', 'view', 'nexus_base', 'target=faction', '--items', 'iron_ore,fuel_cell']);

    expect(normalizeParsedPayload('storage', payload)).toMatchObject({
      action: 'view',
      station_id: 'nexus_base',
      target: 'faction',
      items: 'iron_ore,fuel_cell',
    });
  });

  test('storage deposit parses item quantity target source and gift aliases', () => {
    const direct = parseOk(['storage', 'deposit', 'ore_iron', '50', 'target=faction', 'source=storage']);
    expect(normalizeParsedPayload('storage', direct.payload)).toMatchObject({
      action: 'deposit',
      item_id: 'ore_iron',
      quantity: '50',
      target: 'faction',
      source: 'storage',
    });

    const gift = parseOk(['storage', 'deposit', 'target=PlayerName', 'ship_id=ship_456', 'message=Enjoy']);
    expect(normalizeParsedPayload('storage', gift.payload)).toMatchObject({
      action: 'deposit',
      target: 'PlayerName',
      item_id: 'ship_456',
      message: 'Enjoy',
    });
  });

  test('storage deposit parses bulk items JSON and bucket destination', () => {
    const parsed = parseOk([
      'storage',
      'deposit',
      'target=faction',
      'bucket=Workshop',
      'items=[{"item_id":"iron_ore","quantity":5},{"item_id":"fuel_cell","quantity":2}]',
    ]);
    const payload = convertPayloadTypes(normalizeParsedPayload('storage', parsed.payload), 'storage');

    expect(payload).toEqual({
      action: 'deposit',
      target: 'faction',
      bucket: 'Workshop',
      items: [
        { item_id: 'iron_ore', quantity: 5 },
        { item_id: 'fuel_cell', quantity: 2 },
      ],
    });
  });

  test('storage withdraw parses item and quantity positionals', () => {
    const { payload } = parseOk(['storage', 'withdraw', 'ore_iron', '50', 'source=faction', 'target=self']);

    expect(normalizeParsedPayload('storage', payload)).toMatchObject({
      action: 'withdraw',
      item_id: 'ore_iron',
      quantity: '50',
      source: 'faction',
      target: 'self',
    });
  });

  test('storage loot and jettison parse action-specific positionals', () => {
    const loot = parseOk(['storage', 'loot', 'wreck_1', 'ore_iron', '2']);
    expect(normalizeParsedPayload('storage', loot.payload)).toMatchObject({
      action: 'loot',
      wreck_id: 'wreck_1',
      item_id: 'ore_iron',
      quantity: '2',
    });

    const jettison = parseOk(['storage', 'jettison', 'ore_iron', '2']);
    expect(normalizeParsedPayload('storage', jettison.payload)).toMatchObject({
      action: 'jettison',
      item_id: 'ore_iron',
      quantity: '2',
    });
  });

  test('storage action key-value form still works with following positionals', () => {
    const { payload } = parseOk(['storage', 'action=deposit', 'ore_iron', '50']);

    expect(normalizeParsedPayload('storage', payload)).toMatchObject({
      action: 'deposit',
      item_id: 'ore_iron',
      quantity: '50',
    });
  });

  test('storage positionals skip action-specific fields already set by key-value args', () => {
    const deposit = parseOk(['storage', 'deposit', 'item_id=ore_iron', '2']);
    expect(normalizeParsedPayload('storage', deposit.payload)).toMatchObject({
      action: 'deposit',
      item_id: 'ore_iron',
      quantity: '2',
    });

    const loot = parseOk(['storage', 'loot', 'wreck_id=wreck_1', 'ore_iron', '2']);
    expect(normalizeParsedPayload('storage', loot.payload)).toMatchObject({
      action: 'loot',
      wreck_id: 'wreck_1',
      item_id: 'ore_iron',
      quantity: '2',
    });
  });

  test('storage rejects duplicate action declarations', () => {
    expect(parseArgs(['storage', 'view', 'action=deposit'])).toEqual({
      ok: false,
      errors: [
        {
          field: 'action',
          message: 'Storage action can only be specified once.',
          code: 'invalid_field_type',
        },
      ],
    });
  });

  test('faction_declare_war with reason', () => {
    const { payload } = parseInternalOk(['faction_declare_war', 'faction_xyz', 'territorial dispute']);
    expect(payload.target_faction_id).toBe('faction_xyz');
    expect(payload.reason).toBe('territorial dispute');
  });

  test('faction_create_role with permissions', () => {
    const { payload } = parseInternalOk(['faction_create_role', 'Officer', '2', 'recruit,kick']);
    expect(payload.name).toBe('Officer');
    expect(payload.priority).toBe('2');
    expect(payload.permissions).toBe('recruit,kick');
  });

  test('faction_query_intel with all filters', () => {
    const { payload } = parseInternalOk(['faction_query_intel', 'sol', 'sys_123', 'asteroid', 'iron']);
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
    const { payload } = parseInternalOk(['faction_post_mission', 'Defend Our Home', 'defense', 'Protect the base']);
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
    expect(parseOk(['name_drone', 'drone_1', 'Scout One']).payload).toEqual({
      drone_id: 'drone_1',
      name: 'Scout One',
    });
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
    expect(parseInternalOk(['fleet_status']).payload).toEqual({});
    expect(parseInternalOk(['fleet_invite', 'PlayerName']).payload.player_id).toBe('PlayerName');
    expect(parseInternalOk(['facility_build', 'ore_refinery']).payload.facility_type).toBe('ore_refinery');
    expect(parseInternalOk(['facility_dismantle', 'facility-1']).payload.facility_id).toBe('facility-1');
    expect(parseInternalOk(['faction_build', 'ore_refinery']).payload.facility_type).toBe('ore_refinery');
    expect(parseInternalOk(['faction_dismantle', 'facility-1']).payload.facility_id).toBe('facility-1');
    expect(parseInternalOk(['facility_job_list', 'fac_1']).payload.facility_id).toBe('fac_1');
    expect(parseInternalArgs(['facility_transfer', 'facility-1', 'forward'])).toEqual({
      ok: false,
      errors: [
        {
          field: 'direction',
          message: 'Invalid value "forward" for "direction". Expected one of: to_faction, to_player',
          code: 'invalid_enum',
        },
      ],
    });
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
    expect(parseInternalOk(['faction_propose_ally', 'NOVA']).payload.target_faction_id).toBe('NOVA');
    expect(parseInternalOk(['faction_accept_ally', 'NOVA']).payload.target_faction_id).toBe('NOVA');
    expect(parseInternalOk(['faction_accept_invite', 'fac_1']).payload.faction_id).toBe('fac_1');
    expect(parseInternalOk(['faction_withdraw_invite', 'PlayerName']).payload.player_id).toBe('PlayerName');
  });

  test('passenger transport commands parse positional payloads and normalize API fields', () => {
    expect(parseOk(['list_passengers']).payload).toEqual({});
    expect(parseOk(['list_station_passengers', 'nova_central']).payload.station_id).toBe('nova_central');

    const load = parseOk(['load_passenger', 'sol_central']);
    expect(load.payload.destination).toBe('sol_central');
    expect(normalizeParsedPayload('load_passenger', load.payload)).toEqual({ id: 'sol_central' });

    const unload = parseOk(['unload_passenger', 'Lyra Vale']);
    expect(unload.payload.id).toBe('Lyra Vale');
    expect(normalizeParsedPayload('unload_passenger', unload.payload)).toEqual({ id: 'Lyra Vale' });
    expect(normalizeParsedPayload('unload_passenger', parseOk(['unload_passenger', 'all']).payload)).toEqual({
      id: 'all',
    });
    expect(parseArgs(['unload_passenger', 'name=Lyra Vale']).ok).toBe(false);
    expect(parseArgs(['unload_passenger', 'passenger=Lyra Vale']).ok).toBe(false);
  });

  test('citizenship commands parse positional payloads', () => {
    expect(parseInternalOk(['citizenship_list', 'solarian']).payload.empire_id).toBe('solarian');
    expect(parseInternalOk(['citizenship_apply', 'solarian']).payload.empire).toBe('solarian');
    expect(parseInternalOk(['citizenship_renounce', 'voidborn']).payload.empire).toBe('voidborn');
    expect(parseInternalOk(['citizenship_withdraw', 'crimson']).payload.empire).toBe('crimson');
  });

  test('facility sale commands parse positional payloads', () => {
    expect(parseInternalOk(['facility_list_for_sale', 'facility_1', '5000']).payload).toEqual({
      facility_id: 'facility_1',
      price: '5000',
    });
    expect(parseInternalOk(['facility_browse_for_sale', 'ore_refinery', '10000', '2', '25']).payload).toEqual({
      facility_type: 'ore_refinery',
      max_price: '10000',
      page: '2',
      per_page: '25',
    });
    expect(parseInternalOk(['facility_buy_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
    expect(parseInternalOk(['facility_cancel_listing', 'listing_1']).payload.listing_id).toBe('listing_1');
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

  test('scan accepts no target for an area sweep', () => {
    expect(validateRequiredArgs('scan', {})).toBeNull();
  });

  test('trade_offer requires target_id but not credits', () => {
    expect(validateInternalRequiredArgs('trade_offer', {})).toBe('target_id');
    expect(validateInternalRequiredArgs('trade_offer', { target_id: 'abc' })).toBeNull();
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
    expect(validateInternalRequiredArgs('faction_post_mission', {})).toBe('title');
    expect(validateInternalRequiredArgs('faction_post_mission', { title: 'T', type: 'defense' })).toBe('description');
    expect(
      validateInternalRequiredArgs('faction_post_mission', { title: 'T', type: 'defense', description: 'D' }),
    ).toBe('objectives');
    expect(
      validateInternalRequiredArgs('faction_post_mission', {
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

  test('global option parser handles watch, format, jq, profile, fuzzy, and dry-run values', () => {
    const result = parseGlobalOptions([
      '--watch',
      '2.5',
      '--debug',
      '--format=yaml',
      '--jq=.items[].id',
      '--fuzzy',
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
    expect(result.options.fuzzy).toBe(true);
    expect(result.options.field).toBe('ship.fuel');
    expect(result.options.profile).toBe('pilot');
    expect(result.options.dryRun).toBe(false);
    expect(result.options.args).toEqual(['get_status']);
  });

  test('global option parser handles output search flags', () => {
    const result = parseGlobalOptions([
      '--search',
      'fuel',
      '--search-keys=max_.*',
      '--search-values',
      '700',
      '--search-regex',
      'hull|armor',
      'get_status',
      'search=server_payload',
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.options.outputSearch).toBe('fuel');
    expect(result.options.outputSearchKeys).toBe('max_.*');
    expect(result.options.outputSearchValues).toBe('700');
    expect(result.options.outputSearchRegex).toBe('hull|armor');
    expect(result.options.args).toEqual(['get_status', 'search=server_payload']);
  });

  test('global option parser handles separated and equals output search flag values', () => {
    const cases = [
      { flag: '--search', property: 'outputSearch' as const, separated: 'fuel', equalsValue: '-fuel' },
      { flag: '--search-keys', property: 'outputSearchKeys' as const, separated: 'max_.*', equalsValue: '-max_.*' },
      { flag: '--search-values', property: 'outputSearchValues' as const, separated: '700', equalsValue: '-700' },
      {
        flag: '--search-regex',
        property: 'outputSearchRegex' as const,
        separated: 'hull|armor',
        equalsValue: '-hull|armor',
      },
    ];

    for (const { flag, property, separated, equalsValue } of cases) {
      const separatedResult = parseGlobalOptions([flag, separated, 'get_status']);
      expect(separatedResult.ok).toBe(true);
      if (!separatedResult.ok) throw new Error(separatedResult.error.message);
      expect(separatedResult.options[property]).toBe(separated);
      expect(separatedResult.options.args).toEqual(['get_status']);

      const equalsResult = parseGlobalOptions([`${flag}=${equalsValue}`, 'get_status']);
      expect(equalsResult.ok).toBe(true);
      if (!equalsResult.ok) throw new Error(equalsResult.error.message);
      expect(equalsResult.options[property]).toBe(equalsValue);
      expect(equalsResult.options.args).toEqual(['get_status']);
    }
  });

  test('global option parser rejects missing output search values', () => {
    expect(parseGlobalOptions(['--search'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search',
        message: '--search requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search='])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search',
        message: '--search requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-keys'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-keys',
        message: '--search-keys requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-values'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-values',
        message: '--search-values requires a pattern.',
      },
    });
    expect(parseGlobalOptions(['--search-regex'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--search-regex',
        message: '--search-regex requires a pattern.',
      },
    });
  });

  test('global option parser rejects output search values that are another option', () => {
    for (const flag of ['--search', '--search-keys', '--search-values', '--search-regex']) {
      expect(parseGlobalOptions([flag, '--json', 'get_status'])).toEqual({
        ok: false,
        error: {
          code: 'invalid_global_option',
          option: flag,
          message: `${flag} requires a pattern.`,
        },
      });
    }
  });

  test('global option parser handles keys with optional dotpaths', () => {
    const topLevel = parseGlobalOptions(['get_status', '--keys']);
    expect(topLevel.ok).toBe(true);
    if (!topLevel.ok) throw new Error(topLevel.error.message);
    expect(topLevel.options.keys).toBe('');
    expect(topLevel.options.args).toEqual(['get_status']);

    const nested = parseGlobalOptions(['get_status', '--keys', 'player']);
    expect(nested.ok).toBe(true);
    if (!nested.ok) throw new Error(nested.error.message);
    expect(nested.options.keys).toBe('player');
    expect(nested.options.args).toEqual(['get_status']);

    const equals = parseGlobalOptions(['--keys=structuredContent.ship', 'get_cargo']);
    expect(equals.ok).toBe(true);
    if (!equals.ok) throw new Error(equals.error.message);
    expect(equals.options.keys).toBe('structuredContent.ship');
    expect(equals.options.args).toEqual(['get_cargo']);
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
    expect(parseGlobalOptions(['get_status', '--keys', 'player', '--jq=.player'])).toEqual({
      ok: false,
      error: {
        code: 'invalid_global_option',
        option: '--keys',
        message: '--keys and --jq are mutually exclusive.',
      },
    });
  });
});
