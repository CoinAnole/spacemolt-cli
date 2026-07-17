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
      'sell_ship',
      // v1 dual name for salvage/policies; v2 single curated command is view_insurance
      'claim_insurance',
      // dual name removed; single curated command is faction_build
      'faction_facility_build',
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

  test('payload conversion uses command schemas instead of a global numeric field set', () => {
    expect(getPayloadConversionSchema('travel').id?.type).toBe('string');
    expect(getPayloadConversionSchema('sell').quantity?.type).toBe('integer');
    expect(getPayloadConversionSchema('trade_offer', { commands: COMMANDS }).offer_credits?.type).toBe('integer');
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

  test('crafting production commands map the v2 routes', () => {
    // COMMANDS remains the curated route metadata source; dispatch visibility is tested through BUNDLED_COMMAND_REGISTRY.
    expect(COMMANDS.recycle?.route).toEqual({
      tool: 'spacemolt',
      action: 'recycle',
      method: 'POST',
    });
    expect(COMMANDS.build_base?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'found_station',
      method: 'POST',
    });
    expect(COMMANDS.get_base_cost?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'base_cost',
      method: 'POST',
    });
    expect(COMMANDS.facility_job_add?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'job_add',
      method: 'POST',
    });
    expect(COMMANDS.facility_job_list?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'job_list',
      method: 'POST',
    });
    expect(COMMANDS.facility_set_access?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'set_access',
      method: 'POST',
    });
    expect(COMMANDS.configure_recycler).toBeUndefined();
    expect(COMMANDS.facility_toggle).toBeUndefined();
    expect(COMMANDS.faction_facility_toggle).toBeUndefined();
  });

  test('facility ownership commands map the v2 facility routes', () => {
    expect(COMMANDS.facility_owned?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'owned',
      method: 'POST',
    });
    expect(COMMANDS.faction_facility_owned?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'faction_owned',
      method: 'POST',
    });
    expect(COMMANDS.facility_owned?.args).toEqual([]);
    expect(COMMANDS.faction_facility_owned?.args).toEqual([]);
  });

  test('battle summary/log and facility repair map the v2 routes', () => {
    expect(COMMANDS.get_battle_summary?.route).toEqual({
      tool: 'spacemolt_battle',
      action: 'summary',
      method: 'POST',
    });
    expect(COMMANDS.get_battle_log?.route).toEqual({
      tool: 'spacemolt_battle',
      action: 'log',
      method: 'POST',
    });
    expect(COMMANDS.facility_repair?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'repair',
      method: 'POST',
    });
    expect(COMMANDS.facility_disassemble?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'disassemble',
      method: 'POST',
    });
    expect(COMMANDS.faction_disassemble?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'faction_disassemble',
      method: 'POST',
    });
    expect(COMMANDS.get_battle_summary?.args).toEqual(['battle_id']);
    expect(COMMANDS.facility_repair?.args).toEqual(['facility_id']);
    expect(COMMANDS.facility_disassemble?.args).toEqual(['facility_id']);
    expect(COMMANDS.faction_disassemble?.args).toEqual(['facility_id']);
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
