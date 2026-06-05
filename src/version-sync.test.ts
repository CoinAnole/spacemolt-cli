import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPayloadConversionSchema } from './client';
import { COMMAND_OVERRIDES, COMMANDS, LOCAL_COMMANDS } from './commands';
import {
  displayMissingArgument,
  displayUnknownCommand,
  hasCommandGroup,
  showCommandHelp,
  suggestCommands,
} from './help';
import { FETCH_TIMEOUT_MS, VERSION } from './runtime';

describe('version sync', () => {
  test('package.json and client.ts VERSION match', () => {
    const pkgPath = path.join(import.meta.dir, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    expect(VERSION).toBe(pkg.version);
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

describe('client.ts source integrity', () => {
  test('FETCH_TIMEOUT_MS is long enough for extended travel actions', () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
  });

  test('faction_gift is removed', () => {
    expect(COMMANDS.faction_gift).toBeUndefined();
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
      'inspect_cargo',
      'add_friend',
      'remove_friend',
      'get_friends',
      'get_friend_requests',
      'accept_friend_request',
      'decline_friend_request',
      'build_base',
      'get_base_cost',
      'attack_base',
      'raid_status',
      'get_base_wrecks',
      'loot_base_wreck',
      'salvage_base_wreck',
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

  test('help uses topic, not category and command', () => {
    const args = COMMANDS.help?.args;
    expect(args).toContain('topic');
    expect(args).not.toContain('category');
    expect(args).not.toContain('command');
  });

  test('payload conversion uses command schemas instead of a global numeric field set', () => {
    expect(getPayloadConversionSchema('travel').id?.type).toBe('string');
    expect(getPayloadConversionSchema('sell').quantity?.type).toBe('integer');
    expect(getPayloadConversionSchema('trade_offer').offer_credits?.type).toBe('integer');
  });

  test('command override metadata has unique top-level command keys', () => {
    const commands = Object.keys(COMMAND_OVERRIDES);
    expect(new Set(commands).size).toBe(commands.length);
  });

  test('generated OpenAPI metadata is merged into command configs', () => {
    expect(COMMANDS.travel?.schema?.id?.type).toBe('string');
    expect(COMMANDS.travel?.required).toContain('target_poi');
    expect(COMMANDS.catalog?.schema?.type?.enum).toContain('items');
  });

  test('configure_recycler maps the v2 facility route with recipe id', () => {
    expect(COMMANDS.configure_recycler?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'configure_recycler',
      method: 'POST',
    });
    expect(COMMANDS.configure_recycler?.args).toEqual(['facility_id', 'recipe_id']);
    expect(COMMANDS.configure_recycler?.schema?.recipe_id?.type).toBe('string');
  });

  test('local AI usability helpers are present', () => {
    expect(suggestCommands('trvel')).toContain('travel');
    expect(showCommandHelp('travel', { out() {}, err() {} })).toBe(true);
    expect(hasCommandGroup('combat')).toBe(true);
    expect(typeof displayUnknownCommand).toBe('function');
    expect(typeof displayMissingArgument).toBe('function');
    const idsCommand = LOCAL_COMMANDS.ids;
    const travelCommand = COMMANDS.travel;
    expect(idsCommand).toBeDefined();
    expect(travelCommand).toBeDefined();
    if (!idsCommand || !travelCommand) throw new Error('expected local ids and travel command metadata');
    expect(idsCommand.description).toBeTruthy();
    expect(travelCommand.description).toBeTruthy();
    expect(travelCommand.example).toBeTruthy();
    expect(travelCommand.seeAlso).toContain('get_system');
  });
});
