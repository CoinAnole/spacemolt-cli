import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getPayloadConversionSchema } from './client';
import { COMMANDS } from './commands';
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
  let clientSrc: string;

  test('reads client source', () => {
    const clientPath = path.join(import.meta.dir, 'client.ts');
    clientSrc = fs.readFileSync(clientPath, 'utf-8');
    expect(clientSrc.length).toBeGreaterThan(0);
  });

  test('FETCH_TIMEOUT_MS is long enough for extended travel actions', () => {
    expect(FETCH_TIMEOUT_MS).toBeGreaterThanOrEqual(300_000);
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
