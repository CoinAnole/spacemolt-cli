import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CliRuntimeContext, CliWriter } from './cli-context';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry';
import type { PlayerState } from './help';
import {
  displayError,
  displayUnknownCommand,
  parseCommandSearchQuery,
  renderProgressiveHelp,
  showCommandExplanation,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showFullHelp,
  showHelp,
  showProgressiveHelp,
  suggestCommands,
} from './help';
import { runInvocation } from './main';
import { colorsForPlain } from './output-style';
import { setDefaultProfile } from './session';

function captureWriter(): { stdout: string[]; stderr: string[]; writer: CliWriter } {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
    },
  };
}

const missingMaterialsDetails = {
  missing: [
    {
      item_id: 'optical_fiber_bundle',
      item_name: 'Optical Fiber Bundle',
      need: 300,
      have: 0,
    },
    {
      item_id: 'circuit_board',
      item_name: 'Circuit Board',
      need: 20,
      have: 5,
    },
  ],
};

function missingMaterialsError(overrides: Record<string, unknown> = {}) {
  return {
    code: 'missing_materials',
    message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
    details: missingMaterialsDetails,
    ...overrides,
  };
}

function missingMaterialsContext(
  writer: CliWriter,
  output: { quiet?: boolean; plain?: boolean } = { quiet: false, plain: true },
): CliRuntimeContext {
  return {
    env: {},
    writer,
    clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
    sleep: () => Promise.resolve(),
    output: { quiet: output.quiet ?? false, plain: output.plain ?? true },
  };
}

function fakeContext(stdout: string[], stderr: string[], env: Record<string, string>): CliRuntimeContext {
  return {
    env,
    writer: {
      out(message = '') {
        stdout.push(message);
      },
      err(message = '') {
        stderr.push(message);
      },
      writeOut(chunk) {
        stdout.push(chunk);
      },
    },
    clock: {
      now() {
        return new Date('2026-01-01T00:00:00.000Z');
      },
    },
    sleep() {
      return Promise.resolve();
    },
  };
}

async function withConfigHome<T>(configHome: string, fn: () => Promise<T>): Promise<T> {
  const originalConfigHome = process.env.XDG_CONFIG_HOME;
  process.env.XDG_CONFIG_HOME = configHome;
  try {
    return await fn();
  } finally {
    if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalConfigHome;
  }
}

describe('help output branches', () => {
  test('action-log union field is advertised as a structured array field', () => {
    const capture = captureWriter();
    expect(showCommandHelp('get_action_log', capture.writer)).toBe(true);
    const output = capture.stdout.join('\n');
    expect(output).toContain('Use --payload-json for array/object fields: event_type.');
    expect(output).toContain(`spacemolt get_action_log --payload-json '{"event_type":[]}'`);
  });

  test('showHelp Common Loop uses poi_or_station then a station hop', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('travel <poi_or_station>');
    expect(output).toContain('travel <station>');
    expect(output).not.toContain('travel <poi_id>');
    expect(output).not.toContain('travel <station_poi_id>');
  });

  test('showHelp emphasizes local help command discovery before server help', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt help <command>        Local usage, args, route');
    expect(output).toContain(
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info, misc',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
    expect(output).toContain('Live server help:');
    expect(output).toContain(
      'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
    );
    expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
    expect(output).not.toContain('spacemolt explain <command>     Local usage, args, route');
  });

  test('showHelp includes top-level cache sections', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Commands:');
    expect(output).toContain('Safe generated commands bundled with this CLI are available immediately.');
    expect(output).toContain('spacemolt sync-api              Discover API routes published after this CLI release');
    expect(output).toContain('Accepted cached routes replace the generated fallback catalog.');
    expect(output).not.toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing/package IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
    expect(output).toContain('Payload fields match exact id/name by default.');
    expect(output).toContain('system/poi use unique prefix only (never substring)');
    expect(output).toContain('Completion, ids, and where-can-i stay fuzzy always.');
  });

  test('showHelp documents automation output semantics', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('--json, -j        Full API response as JSON');
    expect(output).toContain('--raw-notifications');
    expect(output).toContain('Render raw notification streams');
    expect(output).toContain('--verbose-notifications');
    expect(output).toContain('omitted-field hints');
    expect(output).toContain('--follow');
    expect(output).toContain('10-second HTTP polling');
    expect(output).toContain('--jq              Extract with path syntax');
    expect(output).toContain(
      '--fuzzy           Auto-resolve simple --jq paths to similar keys (jq only; not ID soft match)',
    );
    expect(output).toContain(
      '--fuzzy-ids       Soft ID-cache payload match (prefix/substring; system/poi prefix-only); default is exact id/name only',
    );
    expect(output).toContain('--no-fuzzy-ids    Force exact-only ID resolution (override env/config)');
    expect(output).toContain('--keys [path]     List available keys at a JSON dotpath');
    expect(output).toContain('--search');
    expect(output).toContain('--search-keys');
    expect(output).toContain('--search-values');
    expect(output).toContain('--search-regex');
    expect(output).toContain('Extract with path syntax');
    expect(output).toContain('Projections read from structuredContent when present.');
    expect(output).toContain('Search projections print jq paths and values.');
    expect(output).toContain('--field/--fields output only the selected projection, even with --json/--format=json.');
  });

  test('renderProgressiveHelp writes unauthenticated start steps', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: false }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('SpaceMolt CLI');
    expect(output).toContain('spacemolt register <username> <empire> <registration_code>');
    expect(output).toContain('Once logged in, try:');
  });

  test('help renders unauthenticated guidance with no default profile', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-help-empty-test-'));
    const stdout: string[] = [];
    const stderr: string[] = [];

    let exitCode: number;
    try {
      exitCode = await withConfigHome(configHome, () =>
        runInvocation(['help'], undefined, fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome })),
      );
    } finally {
      fs.rmSync(configHome, { recursive: true, force: true });
    }

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('\n')).toContain('spacemolt login <username> <password>');
  });

  test('progressive help get_status probe does not retry HTTP 503', async () => {
    const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-help-503-probe-'));
    const env = { XDG_CONFIG_HOME: configHome };
    const sessionsDir = path.join(configHome, 'spacemolt-cli', 'sessions');
    fs.mkdirSync(sessionsDir, { recursive: true });
    setDefaultProfile('pilot', undefined, undefined, env);
    fs.writeFileSync(
      path.join(sessionsDir, 'pilot.json'),
      `${JSON.stringify({
        id: 'sess_help_probe',
        created_at: '2026-01-01T00:00:00.000Z',
        expires_at: '2099-01-01T00:00:00.000Z',
        player_id: 'player_help',
      })}\n`,
    );

    const capture = captureWriter();
    let statusCalls = 0;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes('/spacemolt/get_status')) statusCalls += 1;
      return new Response('unavailable', { status: 503, headers: { 'Retry-After': '30' } });
    }) as typeof fetch;

    try {
      await withConfigHome(configHome, () => showProgressiveHelp(capture.writer, { plain: true }));
      expect(statusCalls).toBe(1);
      expect(capture.stdout.join('\n')).toContain('SpaceMolt CLI');
    } finally {
      globalThis.fetch = originalFetch;
      fs.rmSync(configHome, { recursive: true, force: true });
    }
  });

  test('renderProgressiveHelp writes travel state without calling the API', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: true, traveling: true }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('[TRAVELING]');
    expect(output).toContain('spacemolt get_status');
    expect(output).toContain('Travel resolves');
  });

  test('renderProgressiveHelp emphasizes local help command discovery before server help', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: true }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt help <command>        Local usage, args, route');
    expect(output).toContain(
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info, misc',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
    expect(output).toContain('Live server help:');
    expect(output).toContain(
      'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
    );
    expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
    expect(output).not.toContain('spacemolt explain <command>     Local usage, args, route');
  });

  test('renderProgressiveHelp includes top-level cache sections', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: true }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Commands:');
    expect(output).toContain('Safe generated commands bundled with this CLI are available immediately.');
    expect(output).toContain('spacemolt sync-api              Discover API routes published after this CLI release');
    expect(output).toContain('Accepted cached routes replace the generated fallback catalog.');
    expect(output).not.toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing/package IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
    expect(output).toContain('Payload fields match exact id/name by default.');
    expect(output).toContain('--fuzzy-ids');
    expect(output).toContain('system/poi use unique prefix only (never substring)');
    expect(output).toContain('Completion, ids, and where-can-i stay fuzzy always.');
    // Global Flags block is duplicated with showHelp (not a shared helper); lock the flag lines here too.
    expect(output).toContain(
      '--fuzzy           Auto-resolve simple --jq paths to similar keys (jq only; not ID soft match)',
    );
    expect(output).toContain(
      '--fuzzy-ids       Soft ID-cache payload match (prefix/substring; system/poi prefix-only); default is exact id/name only',
    );
    expect(output).toContain('--no-fuzzy-ids    Force exact-only ID resolution (override env/config)');
  });

  test('renderProgressiveHelp writes docked, asteroid, escape pod, and space states', () => {
    const cases: Array<{ state: PlayerState; expected: string[] }> = [
      { state: { authenticated: true, docked: true }, expected: ['[DOCKED]', 'spacemolt view_market'] },
      {
        state: { authenticated: true, atAsteroidBelt: true },
        expected: ['[ASTEROID BELT]', 'spacemolt mine', 'spacemolt travel <station>'],
      },
      { state: { authenticated: true, escapePod: true }, expected: ['Escape Pod', '[IN SPACE]'] },
      {
        state: { authenticated: true },
        expected: ['[IN SPACE]', 'spacemolt travel <poi_or_station>', 'Move to a POI or station'],
      },
    ];

    for (const { state, expected } of cases) {
      const capture = captureWriter();
      renderProgressiveHelp(state, capture.writer);

      const output = capture.stdout.join('\n');
      for (const text of expected) expect(output).toContain(text);
    }
  });

  test('showCommandGroups and showCommandGroup render local grouped commands', () => {
    const registry: Pick<CommandRegistrySnapshot, 'allCommands'> = {
      allCommands: {
        travel: {
          description: 'Travel within the current system',
          usage: '<poi_id>',
          category: 'Navigation',
          args: ['poi_id'],
          required: ['poi_id'],
          route: { tool: 'spacemolt_travel', action: 'travel', method: 'POST' },
        },
        dock: {
          description: 'Dock at the current station',
          usage: '',
          category: 'Navigation',
          args: [],
          route: { tool: 'spacemolt_travel', action: 'dock', method: 'POST' },
        },
        login: {
          description: 'Start a session',
          usage: '<username> <password>',
          category: 'Authentication',
          args: ['username', 'password'],
          required: ['username', 'password'],
          route: { tool: 'spacemolt_auth', action: 'login', method: 'POST' },
        },
      },
    };

    const groups = captureWriter();
    showCommandGroups(groups.writer, registry);
    const groupOutput = groups.stdout.join('\n');
    expect(groupOutput).toContain('Command Groups');
    expect(groupOutput).toContain('nav        Navigation (2)');
    expect(groupOutput).toContain('auth       Authentication (1)');

    const nav = captureWriter();
    expect(showCommandGroup('navigation', nav.writer, registry)).toBe(true);
    const navOutput = nav.stdout.join('\n');
    expect(navOutput).toContain('Navigation Commands');
    expect(navOutput).toContain('Navigation:');
    expect(navOutput).toContain('travel <poi_id> - Travel within the current system');
    expect(navOutput).toContain('dock - Dock at the current station');
  });

  test('faction group includes nested faction facility actions', () => {
    const capture = captureWriter();

    expect(showCommandGroup('faction', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Faction Commands');
    expect(output).toContain(
      'faction build <facility_type> [bucket=name-or-id] [package_ids=id[,id...]] - Build a faction facility at the current station.',
    );
    expect(output).toContain(
      'faction facility_list - List faction facilities at the current station, including status (active, damaged, repairing, under construction, dismantling).',
    );
    expect(output).not.toContain('faction_build');
    expect(output).not.toContain('faction_facility_list');
  });

  test('command group help lists nested executable actions', () => {
    const capture = captureWriter();

    expect(showCommandGroup('faction', capture.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('faction create_buy_order');
    expect(output).toContain('faction info');
    expect(output).toContain('faction personnel');
    expect(output).not.toContain('faction_create_buy_order');
    expect(output).not.toContain('faction_info');
    expect(output).not.toContain('faction_personnel');
    expect(output).not.toContain('ship_faction_personnel');
  });

  test('full faction group help lists nested actions before semantic commands', () => {
    const capture = captureWriter();

    expect(showCommandGroup('faction', capture.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);

    const output = capture.stdout.join('\n');
    const nestedIndex = output.indexOf('faction create_buy_order');
    const createFactionIndex = output.indexOf('create_faction');
    const joinFactionIndex = output.indexOf('join_faction');
    const achievementsIndex = output.indexOf('get_faction_achievements');

    expect(nestedIndex).toBeGreaterThan(-1);
    expect(createFactionIndex).toBeGreaterThan(-1);
    expect(joinFactionIndex).toBeGreaterThan(-1);
    expect(achievementsIndex).toBeGreaterThan(-1);
    expect(nestedIndex).toBeLessThan(createFactionIndex);
  });

  test('showFullHelp Navigation documents travel to a POI or station', () => {
    const capture = captureWriter();
    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('travel <poi_or_station>');
    expect(output).not.toContain('travel <poi_id>');
  });

  test('full help facility section does not describe facility build as player-only', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('facility build <type>     Build a facility');
    expect(output).not.toContain('facility build <type>     Build a player facility');
  });

  test('full help distinguishes starting an attack from joining an existing battle', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('attack <target_id>        Start/join persistent system battle');
    expect(output).toContain('battle_engage [side_id]   Join an existing battle only (no tick)');
    expect(output).toContain('reload <weapon> <ammo>    Reload weapon with ammo (costs a tick)');
    expect(output).not.toContain('Join or start a battle');
  });

  test('full help names intact prizes on get_nearby and scan', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('get_nearby          Nearby players, NPCs, creatures, and intact prizes');
    expect(output).not.toContain('get_nearby          Other players at your POI');
    expect(output).toContain('scan [target_id]          Scan a nearby actor or sweep for cloaks');
    expect(output).not.toContain('scan <player_id>          Scan player for info');
    expect(output).toContain('attack <target_id>        Start/join persistent system battle');
    expect(output).toContain('facility repair <id>      Repair a damaged facility');
  });

  test('showFullHelp lists personnel after Combat, prizes under Salvage & Tow, and faction personnel', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });

    const output = capture.stdout.join('\n');
    const combatIndex = output.indexOf('Combat:');
    const personnelIndex = output.indexOf('Personnel:');
    const battleIndex = output.indexOf('Battle:');
    const salvageIndex = output.indexOf('Salvage & Tow:');
    const shipyardIndex = output.indexOf('Shipyard:');
    const factionIndex = output.indexOf('\n  Faction:');
    const factionIntelIndex = output.indexOf('Faction Intel & Trade:');
    const generatedIndex = output.indexOf('Generated API Commands');

    expect(combatIndex).toBeGreaterThan(-1);
    expect(personnelIndex).toBeGreaterThan(combatIndex);
    expect(battleIndex).toBeGreaterThan(personnelIndex);
    expect(salvageIndex).toBeGreaterThan(battleIndex);
    expect(shipyardIndex).toBeGreaterThan(salvageIndex);
    expect(factionIndex).toBeGreaterThan(-1);
    expect(factionIntelIndex).toBeGreaterThan(factionIndex);
    expect(generatedIndex).toBeGreaterThan(factionIntelIndex);

    expect(output).toContain('recruit_personnel [crew] [marines]   Hire from station pools');
    expect(output).toContain('treat_personnel [target]             Heal crew/marines (station/field/faction)');
    expect(output).toContain('transfer_personnel <ally>            Move personnel to an allied ship');
    expect(output).toContain('claim_prize <prize_id> <station>  Assign crew and recover an intact prize');
    expect(output).toContain('service_prize <prize_id> <action> Stop/resume/redirect/refuel/repair a prize');
    expect(output).toContain('faction personnel [status|recruit|deposit|withdraw]  Local crew/marine reserve');
    expect(output).toContain('arena status              Arena lobby: record, pending challenges, XP cap');
    expect(output).toContain('arena challenge <player>  Consequence-free duel at an arena POI');
    expect(output).toContain('arena accept | decline    Answer an incoming arena challenge');
    expect(output).toContain('arena cancel              Withdraw your outgoing challenge');
    expect(output).toContain('arena challenges          NPC trials by series: READY / TRAVEL / LOCKED');
    expect(output).toContain('arena fight <id>          Start an unlocked NPC trial at this arena');

    const combatSection = output.slice(combatIndex, personnelIndex);
    expect(combatSection).not.toContain('claim_prize');
    expect(combatSection).not.toContain('service_prize');
    expect(combatSection).not.toContain('recruit_personnel');

    const salvageSection = output.slice(salvageIndex, shipyardIndex);
    expect(salvageSection).toContain('claim_prize <prize_id> <station>');
    expect(salvageSection).toContain('service_prize <prize_id> <action>');

    const factionSection = output.slice(factionIndex, factionIntelIndex);
    expect(factionSection).toContain('faction personnel [status|recruit|deposit|withdraw]');
    expect(factionSection).not.toContain('faction_personnel');
    expect(factionSection).not.toContain('ship_faction_personnel');
  });

  test('full help advertises Company Store workflow on normal market commands', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('faction build company_store');
    expect(output).toContain('Company Store -> Company Outlet -> Company Exchange');
    expect(output).toContain('view_market [item_id] [category] [company_store=true]');
    expect(output).toContain("company_store=true narrows to only your faction's Company Store");
    expect(output).not.toContain('company_store shows private faction listings');
    expect(output).toContain('faction create_sell_order <item> <qty> <price> [private=true]');
    expect(output).toContain('faction create_buy_order <item> <qty> <price> [private=true]');
    expect(output).toContain('Members fill private orders with normal buy/create_buy_order/create_sell_order');
  });

  test('full help advertises nested command forms for grouped commands', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY);

    const output = capture.stdout.join('\n');
    expect(output).toContain('fleet invite <player>');
    expect(output).toContain('facility job_add <facility> <recipe> <qty>');
    expect(output).toContain('citizenship apply <empire>');
    expect(output).toContain('faction create_buy_order <item> <qty> <price>');
    expect(output).not.toContain('fleet_invite <player>');
    expect(output).not.toContain('facility_job_add <facility>');
    expect(output).not.toContain('citizenship_apply <empire>');
    expect(output).not.toContain('faction_create_buy_order <item>');
  });

  test('arena group lists curated actions and stays out of Generated API', () => {
    const capture = captureWriter();

    expect(showCommandGroup('arena', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('arena Commands');
    expect(output).toContain('arena status');
    expect(output).toContain('arena challenge');
    expect(output).toContain('arena accept');
    expect(output).toContain('arena decline');
    expect(output).toContain('arena cancel');
    expect(output).toContain('arena challenges');
    expect(output).toContain('arena fight');
    expect(output).toContain('NPC arena trial');
    expect(output).toContain('unlocked NPC trial');
    expect(output).toContain('max_side_size');
    expect(output).not.toContain('arena_status');
    expect(output).not.toContain('arena_challenge');
    expect(output).not.toContain('Consequence-free combat at an arena POI: challenge a pilot');
  });

  test('help combat lists arena actions under Battle', () => {
    const capture = captureWriter();

    expect(showCommandGroup('combat', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('arena status');
    expect(output).toContain('arena challenge <player>');
    expect(output).toContain('arena accept');
    expect(output).toContain('arena decline');
    expect(output).toContain('arena cancel');
    expect(output).toContain('arena challenges');
    expect(output).toContain('arena fight');
    expect(output).not.toContain('arena_challenge');
  });

  test('storage group includes nested actions and standalone storage workflows', () => {
    const capture = captureWriter();

    expect(showCommandGroup('storage', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Storage Commands');
    expect(output).toContain('storage view');
    expect(output).toContain('storage deposit');
    expect(output).toContain('storage withdraw');
    expect(output).toContain('storage loot');
    expect(output).toContain('storage jettison');
    expect(output).toContain('jettison [item_id] [quantity] [items=JSON]');
    expect(output).toContain('storage loot [wreck_id] [item_id] [quantity] [module_id=…]');
    expect(output).toContain('loot_wreck [wreck_id] [item_id] [quantity] [module_id=…]');
    expect(output).toContain('fit a module onto your ship');
    expect(output).toContain('omit wreck_id while towing');
    expect(output).not.toContain('salvage_wreck <wreck_id>');
  });

  test('full help storage section includes standalone storage workflows', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('storage view [station_id] [target=self|faction]');
    expect(output).toContain(
      'storage deposit [item_id] [qty] [items=JSON] [target=self|faction|player|station:…] [source=cargo|storage|faction]',
    );
    expect(output).toContain(
      'storage deposit source=faction target=faction [bucket=name-or-id] [dest_bucket=name-or-id] [items=JSON]',
    );
    expect(output).toContain('storage withdraw <item_id> <qty>  Personal storage -> cargo (omit source and target)');
    expect(output).toContain('jettison [item_id] [qty] [items=JSON]  Standalone cargo jettison');
    expect(output).toContain('storage loot [wreck_id] [item_id] [quantity] [module_id=…]');
    expect(output).toContain('loot_wreck [wreck_id] [item_id] [quantity] [module_id=…]');
    expect(output).not.toContain('salvage_wreck <wreck_id>');
  });

  test('showCommandHelp renders no-arg commands without args placeholder', () => {
    const capture = captureWriter();
    const registry: Pick<CommandRegistrySnapshot, 'allCommands'> = {
      allCommands: {
        dock: {
          description: 'Dock at the current station',
          usage: '',
          category: 'Navigation',
          args: [],
          required: [],
          route: { tool: 'spacemolt_travel', action: 'dock', method: 'POST' },
        },
      },
    };

    expect(showCommandHelp('dock', capture.writer, registry)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt dock');
    expect(output).not.toContain('spacemolt dock <args...>');
  });

  test('showCommandHelp documents view_orders filters', () => {
    const capture = captureWriter();

    expect(showCommandHelp('view_orders', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Show your market orders');
    expect(output).toContain('spacemolt view_orders --item iron_ore');
    expect(output).toContain('item -> item_id');
    expect(output).toContain('item_id');
    expect(output).toContain('order_type');
    expect(output).toContain('page_size');
    expect(output).toContain('sort_by');
    expect(output).toContain('scope');
    expect(output).toContain('search');
    expect(output).toContain('station base ID or station POI ID');
  });

  test('showCommandHelp documents action-log cursor polling', () => {
    const capture = captureWriter();
    expect(showCommandHelp('get_action_log', capture.writer)).toBe(true);
    const output = capture.stdout.join('\n');

    expect(output).toContain(
      'spacemolt get_action_log [category=...] [event_type=type[,type...]] [faction_id=...] [page=...] [page_size=...] [since_id=...]',
    );
    expect(output).toContain('event_type');
    expect(output).toContain('page_size');
    expect(output).toContain('since_id');
    expect(output).toContain('next_since_id');
    expect(output).toContain('Page-based queries return newest-first');
    expect(output).toContain('since_id requests newer entries oldest-first');
    expect(output).toContain('session.daily_balance');
    expect(output).toContain(
      'spacemolt get_action_log event_type=session.daily_balance,faction.production_cycle since_id=42 page_size=100',
    );
  });

  test('showCommandHelp documents view_market filters', () => {
    const capture = captureWriter();

    expect(showCommandHelp('view_market', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('[--item item_id]');
    expect(output).toContain('[--search text]');
    expect(output).toContain('[since=...]');
    expect(output).toContain('item -> item_id');
    expect(output).toContain('item_id');
    expect(output).toContain('category');
    expect(output).toContain('search');
    expect(output).toContain('since');
  });

  test('showCommandHelp documents payload-json for bulk storage item arrays', () => {
    const capture = captureWriter();

    expect(showCommandHelp('storage deposit', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Use --payload-json for array/object fields: items.');
    expect(output).toContain(
      'spacemolt storage deposit --payload-json \'{"items":[{"item_id":"ore_iron","quantity":1}]}\'',
    );
  });

  test('showCommandHelp documents storage credit gifts to players', () => {
    const capture = captureWriter();

    expect(showCommandHelp('storage deposit', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('credits - Credits to gift to another player. Not valid for station: targets.');
    expect(output).not.toContain('donate to an empire treasury');
  });

  test('register help documents station-id username collision', () => {
    const capture = captureWriter();
    expect(showCommandHelp('register', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    const output = capture.stdout.join('\n');
    const usernameField = output.split('\n').find((line) => /^\s*username - /.test(line));
    expect(usernameField).toBeDefined();
    expect(usernameField).toMatch(/username - Your unique username \(3-24 chars:.*cannot be the same as a station id/);
    expect(usernameField).toContain('ignores case');
    expect(usernameField).toContain('whole name only');
    expect(usernameField).toContain('contain a station word');
    expect(output).not.toContain('Create a player using a dashboard registration code. A new username');
  });

  test('showCommandHelp documents gifting via storage deposit with source', () => {
    const capture = captureWriter();

    expect(showCommandHelp('storage deposit', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('gift items/credits/ships to players');
    expect(output).toContain('target=self|faction|player|station:<base-or-POI-ID>');
    expect(output).toContain('send_gift');
    expect(output).toContain('already be docked');
    expect(output).toContain('source=storage');
    expect(output).toContain('No credits, ships, packages, or quest items');
    expect(output).toContain(
      'target - Target: self, faction, faction:TAG, empire alias, player name/ID, or station:<base-or-POI-ID>',
    );
    expect(output).toContain('spacemolt storage deposit ore_iron 50 target=PlayerName source=storage message="Enjoy"');
    expect(output).toContain('target=station:grand_exchange_station');
    expect(output).toContain(
      'spacemolt storage deposit ore_iron 50 target=PlayerName source=storage message="Enjoy"; tow own ship: storage deposit <ship_id> target=self; station gift: storage deposit steel_plate 20 target=station:grand_exchange_station',
    );
  });

  test('command search for prize finds attack, get_nearby, and scan', () => {
    const capture = captureWriter();
    showCommandSearch('prize', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });
    const output = capture.stdout.join('\n');
    expect(output).toMatch(/^ {2}attack /m);
    expect(output).toMatch(/^ {2}get_nearby -/m);
    expect(output).toMatch(/^ {2}scan /m);
    expect(output).toMatch(/^ {2}claim_prize /m);
    expect(output).toMatch(/^ {2}battle_target /m);
  });

  test('command search maps send_gift to storage deposit without a send_gift command', () => {
    const capture = captureWriter();
    showCommandSearch('send_gift', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });

    const output = capture.stdout.join('\n');
    expect(output).toMatch(/^\s*storage deposit /m);
    expect(output).not.toMatch(/^\s*send_gift\b/m);
    expect(suggestCommands('send_gift')).toEqual([]);
    expect(suggestCommands('send_gift')).not.toContain('storage deposit');
    expect(suggestCommands('send_gift')).not.toContain('storage_deposit');
    expect(suggestCommands('send_gift')).not.toContain('send_gift');
  });

  test('showCommandGroup omits duplicate command-name descriptions', () => {
    const capture = captureWriter();
    const registry: Pick<CommandRegistrySnapshot, 'allCommands'> = {
      allCommands: {
        dock: {
          description: 'dock',
          usage: '',
          category: 'Navigation',
          args: [],
          required: [],
          route: { tool: 'spacemolt_travel', action: 'dock', method: 'POST' },
        },
        'Dock Now': {
          description: 'dock now',
          usage: '',
          category: 'Navigation',
          args: [],
          required: [],
          route: { tool: 'spacemolt_travel', action: 'dock_now', method: 'POST' },
        },
      },
    };

    expect(showCommandGroup('navigation', capture.writer, registry)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('dock');
    expect(output).not.toContain('dock - dock');
    expect(output).toContain('Dock Now');
    expect(output).not.toContain('Dock Now - dock now');
  });

  test('showCommandSearch renders empty-state suggestions', () => {
    const capture = captureWriter();
    showCommandSearch('trvel', capture.writer, {
      travel: {
        description: 'Travel within the current system',
        usage: '<poi_id>',
        category: 'Navigation',
        args: ['poi_id'],
        required: ['poi_id'],
        route: { tool: 'spacemolt_travel', action: 'travel', method: 'POST' },
      },
    });

    const output = capture.stdout.join('\n');
    expect(output).toContain('Commands matching "trvel"');
    expect(output).toContain('(No local command matches)');
    expect(output).toContain('Did you mean: travel');
  });

  test('showCommandSearch ignores related commands absent from the active registry', () => {
    const capture = captureWriter();
    showCommandSearch('removed_dynamic', capture.writer, {
      active_command: {
        description: 'Active command',
        usage: '',
        category: 'General',
        args: [],
        required: [],
        seeAlso: ['removed_dynamic'],
        route: { tool: 'active', action: 'command', method: 'POST' },
      },
    });

    const output = capture.stdout.join('\n');
    expect(output).toContain('(No local command matches)');
    expect(output).not.toContain('active_command');
  });

  test('showCommandSearch finds nested faction build and hides removed dual name', () => {
    const capture = captureWriter();

    showCommandSearch('faction build', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('faction build <facility_type>');
    expect(output).not.toContain('faction facility_build');
    expect(output).not.toContain('faction_facility_build');
  });

  test('command search returns nested action display names and hides grouped flat names', () => {
    const capture = captureWriter();

    showCommandSearch('faction buy order', capture.writer, BUNDLED_COMMAND_REGISTRY);

    const output = capture.stdout.join('\n');
    expect(output).toContain('faction create_buy_order');
    expect(output).not.toContain('faction_create_buy_order');
  });

  test('command help and explanation support nested action display names', () => {
    const help = captureWriter();
    const explain = captureWriter();

    expect(showCommandHelp('faction create_buy_order', help.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);
    expect(
      showCommandExplanation('faction create_buy_order', explain.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);

    expect(help.stdout.join('\n')).toContain('spacemolt faction create_buy_order');
    expect(help.stdout.join('\n')).not.toContain('Server help:');
    expect(help.stdout.join('\n')).not.toContain('faction_create_buy_order');
    expect(explain.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_faction_commerce/create_buy_order');
  });

  test('top-level API command help keeps server-help pointer', () => {
    const capture = captureWriter();

    expect(showCommandHelp('travel', capture.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Server help:');
    expect(output).toContain('spacemolt server-help travel');
  });

  test('related metadata translates grouped flat command names to nested names', () => {
    const capture = captureWriter();

    expect(showCommandHelp('faction build', capture.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt faction build ore_refinery');
    expect(output).toContain('spacemolt faction facility_list');
    expect(output).toContain('facility types, faction facility_list');
    expect(output).not.toContain('spacemolt faction_build');
    expect(output).not.toContain('spacemolt faction_facility_list');
    expect(output).not.toContain('faction facility_build');
    expect(output).not.toContain('faction_facility_build');
  });

  test('top-level related metadata translates grouped flat command names to nested names', () => {
    const capture = captureWriter();

    expect(showCommandHelp('build_base', capture.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('station info');
    expect(output).toContain('faction build');
    expect(output).not.toContain('station_info');
    expect(output).not.toContain('faction_build');
  });

  test('related metadata example translation requires command-token boundary', () => {
    const capture = captureWriter();
    const registry: Pick<CommandRegistrySnapshot, 'allCommands' | 'commandGroups'> = {
      allCommands: {
        probe_examples: {
          description: 'Probe command examples',
          usage: '',
          category: 'Generated API',
          args: [],
          route: { tool: 'probe', action: 'examples', method: 'POST' },
          example: 'spacemolt station_info --ok && spacemolt station_info_backup --dry',
        },
      },
      commandGroups: {
        station: {
          name: 'station',
          actions: {
            info: {
              command: 'station_info',
              action: 'info',
              displayName: 'station info',
              config: {
                description: 'Station info',
                usage: '',
                category: 'Station',
                args: [],
                route: { tool: 'station', action: 'info', method: 'POST' },
              },
            },
          },
        },
      },
    };

    expect(showCommandHelp('probe_examples', capture.writer, registry)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt station info --ok');
    expect(output).toContain('spacemolt station_info_backup --dry');
    expect(output).not.toContain('spacemolt station info_backup');
  });

  test('showCommandSearch matches command category metadata', () => {
    const capture = captureWriter();
    showCommandSearch('navigation', capture.writer, {
      dock_now: {
        description: 'dock_now',
        usage: '',
        category: 'Navigation',
        args: [],
        required: [],
        route: { tool: 'spacemolt_travel', action: 'dock_now', method: 'POST' },
      },
      agentlogs: {
        description: 'Read recent agent log entries',
        usage: '',
        category: 'Logs',
        example: 'spacemolt agentlogs --tag navigation',
        args: [],
        required: [],
        route: { tool: 'spacemolt_agent', action: 'logs', method: 'POST' },
      },
    });

    const lines = capture.stdout.join('\n').split('\n');
    const categoryIndex = lines.findIndex((line) => line.includes('dock_now'));
    const exampleIndex = lines.findIndex((line) => line.includes('agentlogs'));

    expect(capture.stdout.join('\n')).toContain('Commands matching "navigation"');
    expect(categoryIndex).toBeGreaterThan(-1);
    expect(exampleIndex).toBeGreaterThan(-1);
    expect(categoryIndex).toBeLessThan(exampleIndex);
  });

  test('showCommandSearch matches command API route metadata', () => {
    const capture = captureWriter();

    showCommandSearch('commerce', capture.writer, {
      faction_create_buy_order: {
        description: 'Create a buy order on behalf of your faction.',
        usage: 'faction_create_buy_order <item_id> <quantity> <price_each>',
        category: 'Factions',
        args: ['item_id', 'quantity', 'price_each'],
        required: ['item_id', 'quantity', 'price_each'],
        route: { tool: 'spacemolt_faction_commerce', action: 'create_buy_order', method: 'POST' },
      },
    });

    const output = capture.stdout.join('\n');
    expect(output).toContain('Commands matching "commerce"');
    expect(output).toContain('faction_create_buy_order');
  });

  test('showCommandSearch uses local help metadata for help command', () => {
    const capture = captureWriter();

    showCommandSearch('help', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Commands matching "help"');
    expect(output).toContain('help ');
    expect(output).toContain('Local command help');
    expect(output).not.toContain('Fetch server help');
  });

  test('showCommandSearch uses station wording for ship buy order commands', () => {
    const capture = captureWriter();

    showCommandSearch('ship_buy_order', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain(
      'place_ship_buy_order <class_id> <price> - Place a standing buy order for a ship class at this station',
    );
    expect(output).toContain('view_ship_buy_orders - View your open ship buy orders across all stations');
    expect(output).not.toContain('at this base');
    expect(output).not.toContain('across all bases');
  });

  test('showCommandSearch suggests server-help for live server lookup', () => {
    const capture = captureWriter();
    showCommandSearch('repair modules', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Commands matching "repair modules"');
    expect(output).toContain("For live server help, run: spacemolt server-help 'repair modules'");
  });

  test('showCommandSearch suggests server-help even when there are no local matches', () => {
    const capture = captureWriter();
    showCommandSearch('definitely-not-a-local-topic', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('(No local command matches)');
    expect(output).toContain("For live server help, run: spacemolt server-help 'definitely-not-a-local-topic'");
  });

  test('showCommandSearch shell-quotes server-help topics with special characters', () => {
    const cases = [
      {
        query: 'repair $(touch /tmp/x)',
        expected: "For live server help, run: spacemolt server-help 'repair $(touch /tmp/x)'",
      },
      {
        query: 'repair `touch /tmp/x`',
        expected: "For live server help, run: spacemolt server-help 'repair `touch /tmp/x`'",
      },
      {
        query: 'repair "modules"',
        expected: 'For live server help, run: spacemolt server-help \'repair "modules"\'',
      },
      {
        query: "pilot's fuel",
        expected: "For live server help, run: spacemolt server-help 'pilot'\\''s fuel'",
      },
      {
        query: 'repair \\modules',
        expected: "For live server help, run: spacemolt server-help 'repair \\modules'",
      },
    ];

    for (const { query, expected } of cases) {
      const capture = captureWriter();
      showCommandSearch(query, capture.writer);

      expect(capture.stdout.join('\n')).toContain(expected);
    }
  });

  test('showCommandSearch does not suggest server-help for all commands output', () => {
    const capture = captureWriter();
    showCommandSearch('', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('All Commands');
    expect(output).not.toContain('For live server help');
  });

  test('parseCommandSearchQuery supports search forms', () => {
    expect(parseCommandSearchQuery(['--search', 'fuel', 'cell'])).toBe('fuel cell');
    expect(parseCommandSearchQuery(['--search=fuel'])).toBe('fuel');
    expect(parseCommandSearchQuery(['search=fuel'])).toBe('fuel');
    expect(parseCommandSearchQuery(['fuel', 'cell'])).toBe('fuel cell');
  });

  test('showFullHelp includes generated commands supplied by a registry snapshot', () => {
    const capture = captureWriter();
    const registry: Pick<CommandRegistrySnapshot, 'allCommands'> = {
      allCommands: {
        generated_only: {
          description: 'Generated command',
          usage: '<id>',
          category: 'Generated API',
          args: ['id'],
          required: ['id'],
          route: { tool: 'generated', action: 'only', method: 'POST' },
        },
      },
    };

    showFullHelp(capture.writer, registry);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Generated API Commands');
    expect(output).toContain('generated_only <id> - Generated command');
  });

  test('bundled generated commands appear in full help, local help, and search', () => {
    const full = captureWriter();
    const command = captureWriter();
    const explanation = captureWriter();
    const search = captureWriter();

    showFullHelp(full.writer, BUNDLED_COMMAND_REGISTRY);
    expect(showCommandHelp('shipping_quote', command.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);
    expect(
      showCommandExplanation('shipping_quote', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);
    showCommandSearch('shipping quote', search.writer, BUNDLED_COMMAND_REGISTRY);

    expect(full.stdout.join('\n')).toContain('Generated API Commands');
    expect(full.stdout.join('\n')).toContain('shipping_accept');
    expect(full.stdout.join('\n')).not.toContain('shipping_quote');
    expect(command.stdout.join('\n')).toContain('spacemolt shipping_quote');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/quote');
    expect(search.stdout.join('\n')).toContain('shipping_quote');
  });

  test('shipping_list help explains the docked current-station board and canonical filters', () => {
    const capture = captureWriter();
    const explanation = captureWriter();

    expect(showCommandHelp('shipping_list', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(showCommandExplanation('shipping_list', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(
      true,
    );

    const output = capture.stdout.join('\n');
    expect(output).toContain(
      'List freight contracts you can accept from the current station. You must be docked, and only contracts posted at that station are shown.',
    );
    expect(output).toContain(
      'spacemolt shipping_list [eligible_as=player|faction] [filter_destination=...] [filter_service_level=standard|priority] [filter_shipper=...] [sort=reward|distance|age] [page=...] [per_page=...]',
    );
    expect(output).toContain(
      'spacemolt shipping_list filter_destination=sirius_observatory_station filter_service_level=priority sort=distance',
    );
    expect(output).toContain('eligible_as (player|faction)');
    expect(output).toContain('filter_service_level (standard|priority)');
    expect(output).toContain('sort (reward|distance|age)');
    expect(output).toContain('Server help:');
    expect(output).toContain('spacemolt server-help shipping_list');
    expect(output).toContain('spacemolt get_status');
    expect(output).toContain('See also: shipping_active, shipping_quote, shipping_accept, shipping_profile');
    expect(output).toContain('shipping_active');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/list');
  });

  test('shipping_active help explains the recovery board for live freight contracts', () => {
    const capture = captureWriter();
    const explanation = captureWriter();

    expect(showCommandHelp('shipping_active', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(
      showCommandExplanation('shipping_active', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('live freight contract');
    expect(output).toContain('spacemolt shipping_active');
    expect(output).toContain('Server help:');
    expect(output).toContain('spacemolt server-help shipping_active');
    expect(output).toContain('spacemolt get_status');
    expect(output).toContain('spacemolt get_cargo');
    expect(output).toContain('See also:');
    expect(output).toContain('shipping_list');
    expect(output).toContain('shipping_deliver');
    expect(output).toContain('shipping_return');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/active');
  });

  test('shipping_post help documents package and station identifier forms', () => {
    const capture = captureWriter();
    const explanation = captureWriter();

    expect(showCommandHelp('shipping_post', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(showCommandExplanation('shipping_post', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(
      true,
    );

    const output = capture.stdout.join('\n');
    expect(output).toContain('package:<id>');
    expect(output).toContain('POI');
    expect(output).toContain('spacemolt shipping_post package:package-1');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/post');
  });

  test('shipping_quote help is curated Missions with package and station identifier forms', () => {
    const capture = captureWriter();
    const explanation = captureWriter();

    expect(showCommandHelp('shipping_quote', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(
      showCommandExplanation('shipping_quote', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('package:<id>');
    expect(output).toContain('POI');
    expect(output).toContain('spacemolt shipping_quote package:package-1');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/quote');

    const group = captureWriter();
    expect(showCommandGroup('misc', group.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(group.stdout.join('\n')).toContain('shipping_quote');
  });

  test('shipping_deliver help documents package_id dual identifier usage', () => {
    const capture = captureWriter();
    const explanation = captureWriter();

    expect(showCommandHelp('shipping_deliver', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(
      showCommandExplanation('shipping_deliver', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('package_id');
    expect(output).toContain('spacemolt shipping_deliver [package_id=...] [shipment_id=...]  (provide exactly one)');
    expect(output).toContain('spacemolt shipping_deliver package_id=package-relief-1');
    expect(output).toContain('Server help:');
    expect(output).toContain('spacemolt server-help shipping_deliver');
    expect(explanation.stdout.join('\n')).toContain('Category: Missions');
    expect(explanation.stdout.join('\n')).toContain('API route: POST /api/v2/spacemolt_shipping/deliver');
  });

  test('pay_bounty is curated Taxes help under misc, not Generated API or info', () => {
    const command = captureWriter();
    const explanation = captureWriter();
    expect(showCommandHelp('pay_bounty', command.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(showCommandExplanation('pay_bounty', explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(
      true,
    );

    const commandOutput = command.stdout.join('\n');
    expect(commandOutput).toContain('CLI aliases:');
    expect(commandOutput).toContain('empire -> id');
    expect(commandOutput).toContain('empire_id -> id');
    expect(commandOutput).toContain('spacemolt pay_bounty solarian faction');
    expect(explanation.stdout.join('\n')).toContain('Category: Taxes');

    const misc = captureWriter();
    expect(showCommandGroup('misc', misc.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    const miscOutput = misc.stdout.join('\n');
    expect(miscOutput).toContain('Taxes:');
    expect(miscOutput).toContain('pay_bounty');
    expect(miscOutput).toContain('prepay_tax');

    const info = captureWriter();
    const query = captureWriter();
    expect(showCommandGroup('info', info.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(showCommandGroup('query', query.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(info.stdout.join('\n')).not.toContain('pay_bounty');
    expect(info.stdout.join('\n')).not.toContain('prepay_tax');
    expect(query.stdout.join('\n')).not.toContain('pay_bounty');
    expect(query.stdout.join('\n')).not.toContain('prepay_tax');

    const full = captureWriter();
    showFullHelp(full.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });
    const fullOutput = full.stdout.join('\n');
    const actionIndex = fullOutput.indexOf('Action Commands (1 per tick');
    const infoIndex = fullOutput.indexOf('Information Commands (unlimited):');
    const generatedIndex = fullOutput.indexOf('Generated API Commands');
    expect(actionIndex).toBeGreaterThan(-1);
    expect(infoIndex).toBeGreaterThan(-1);
    expect(fullOutput.indexOf('pay_bounty [id]')).toBeGreaterThan(actionIndex);
    expect(fullOutput.slice(infoIndex, actionIndex)).not.toContain('pay_bounty');
    const generatedSection = generatedIndex === -1 ? '' : fullOutput.slice(generatedIndex);
    expect(generatedSection).not.toContain('pay_bounty');
  });

  test('generated ship_* personnel names do not resolve as curated personnel help', () => {
    for (const generatedName of ['ship_recruit_personnel', 'ship_treat_personnel', 'ship_transfer_personnel']) {
      const command = captureWriter();
      const explanation = captureWriter();
      expect(showCommandHelp(generatedName, command.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(false);
      expect(showCommandExplanation(generatedName, explanation.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(
        false,
      );
      expect(command.stdout.join('\n')).not.toContain('recruit_personnel');
      expect(command.stdout.join('\n')).not.toContain('treat_personnel');
      expect(command.stdout.join('\n')).not.toContain('transfer_personnel');
      expect(explanation.stdout.join('\n')).not.toContain('recruit_personnel');
      expect(explanation.stdout.join('\n')).not.toContain('treat_personnel');
      expect(explanation.stdout.join('\n')).not.toContain('transfer_personnel');
    }

    const curated = captureWriter();
    expect(showCommandHelp('recruit_personnel', curated.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);
    expect(curated.stdout.join('\n')).toContain('recruit_personnel');
  });

  test('generated ship_* personnel names dispatch as unknown commands', async () => {
    for (const generatedName of ['ship_recruit_personnel', 'ship_treat_personnel', 'ship_transfer_personnel']) {
      const configHome = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-help-unknown-personnel-'));
      const stdout: string[] = [];
      const stderr: string[] = [];
      let exitCode: number;
      try {
        exitCode = await withConfigHome(configHome, () =>
          runInvocation([generatedName], undefined, fakeContext(stdout, stderr, { XDG_CONFIG_HOME: configHome })),
        );
      } finally {
        fs.rmSync(configHome, { recursive: true, force: true });
      }

      expect(exitCode).toBe(1);
      expect(stderr.join('\n')).toContain(`Unknown command "${generatedName}"`);
      expect(stdout.join('\n')).not.toContain('Hire from station pools');
    }
  });

  test('help list_ships documents module types, locations, and get_ship', () => {
    const capture = captureWriter();

    expect(showCommandHelp('list_ships', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('module type');
    expect(output).toContain('locations');
    expect(output).toContain('get_ship');
    expect(output).not.toContain('--jq');
  });

  test('loot_wreck help documents named module_id= ship fit', () => {
    const capture = captureWriter();

    expect(showCommandHelp('loot_wreck', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('withdrawn');
    expect(output).toContain('[module_id=…]');
    expect(output).toContain('spacemolt loot_wreck wreck-1 module_id=module-1');
    expect(output).toContain('not cargo');
    expect(output).toContain('withdrawn types cannot be fitted');
  });

  test('storage loot help documents named module_id= ship fit', () => {
    const capture = captureWriter();

    expect(showCommandHelp('storage loot', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('fit a module onto your ship');
    expect(output).not.toContain('from a wreck into cargo via');
    expect(output).toContain('spacemolt storage loot wreck-1 module_id=module-1');
    expect(output).toContain('withdrawn');
  });

  test('help misc documents loot_wreck module_id fit', () => {
    const capture = captureWriter();

    expect(showCommandGroup('misc', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('[module_id=…]');
    expect(output).toContain('withdrawn types cannot be fitted');
  });

  test('help and explain salvage_claim_prize do not resolve as claim_prize', () => {
    const help = captureWriter();
    const explain = captureWriter();
    expect(showCommandHelp('salvage_claim_prize', help.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(false);
    expect(
      showCommandExplanation('salvage_claim_prize', explain.writer, BUNDLED_COMMAND_REGISTRY, { plain: true }),
    ).toBe(false);
    expect(help.stdout.join('\n')).not.toContain('prize_id');
    expect(explain.stdout.join('\n')).not.toContain('prize_id');
    expect(suggestCommands('salvage_claim_prize')).not.toContain('claim_prize');
    expect(suggestCommands('salvage_service_prize')).not.toContain('service_prize');

    const unknown = captureWriter();
    displayUnknownCommand('salvage_claim_prize', unknown.writer, { plain: true });
    expect(unknown.stderr.join('\n')).not.toContain('Did you mean: claim_prize');
  });

  test('help claim_prize documents prize_id -> id field alias', () => {
    const capture = captureWriter();
    expect(showCommandHelp('claim_prize', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Fields:');
    expect(output).toContain('prize_id -> id');
    expect(output).toContain('destination_base_id -> target');
    expect(output).toContain('Assign prize crew and begin recovery of an intact captured ship');
  });

  test('help service_prize documents action alias, enum, and a single service_action argument', () => {
    const capture = captureWriter();
    expect(showCommandHelp('service_prize', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toMatch(/Arguments:\n {2}prize_id, service_action\n/);
    expect(output).not.toMatch(/Arguments:\n {2}prize_id, service_action, action\n/);
    expect(output).toContain('action -> service_action');
    expect(output).toContain('prize_id -> id');
    expect(output).toContain('destination_base_id -> target');
    expect(output).toContain('service_action (stop|resume|redirect|refuel|repair)');
    expect(output).toContain('Stop, resume, redirect, refuel, or repair a claimed intact prize');
  });

  test('scrap_wreck help documents faction-station salvage unlocks', () => {
    const capture = captureWriter();

    expect(showCommandHelp('scrap_wreck', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('A Lucrative Sideline');
    expect(output).toContain('Cut It Apart Yourself');
    expect(output).toContain("faction's own player station");
    expect(output).toContain('Salvaging 2+');
  });

  test('help misc documents scrap_wreck faction-station salvage unlocks', () => {
    const capture = captureWriter();

    expect(showCommandGroup('misc', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('A Lucrative Sideline');
    expect(output).toContain('Cut It Apart Yourself');
    expect(output).toContain("faction's own player station");
    expect(output).toContain('Salvaging 2+');
  });

  test('full help scrap_wreck line names salvage yard or faction station', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });

    const output = capture.stdout.join('\n');
    expect(output).toContain('Scrap towed wreck at salvage yard or faction station');
  });

  test('full help get_ship line names current or remote owned/faction-garage ship fit', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });

    const output = capture.stdout.join('\n');
    expect(output).toContain('Current or remote owned/faction-garage ship fit');
  });

  test('help get_map documents optional system_id with a copy-safe sol example', () => {
    const capture = captureWriter();

    expect(showCommandHelp('get_map', capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true })).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt get_map [system_id]');
    expect(output).toContain('omit for all systems');
    expect(output).not.toContain('<args...>');
    expect(output).toContain('spacemolt get_map sol');
    expect(output).not.toContain('`');
  });

  test('full help get_map line names all systems or one system', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY, { plain: true });

    const output = capture.stdout.join('\n');
    expect(output).toContain('Galaxy map (all systems, or one system)');
  });

  test('Generated API Commands excludes bundled nested command actions', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer, BUNDLED_COMMAND_REGISTRY);

    const output = capture.stdout.join('\n');
    const generatedIndex = output.indexOf('Generated API Commands');
    const generatedSection = generatedIndex === -1 ? '' : output.slice(generatedIndex);
    expect(generatedSection).not.toContain('shipping_quote');
    expect(generatedSection).not.toContain('arena_status');
    expect(generatedSection).not.toContain('arena_challenge');
    expect(generatedSection).not.toContain('arena status');
    expect(generatedSection).toContain('shipping_accept');
    expect(generatedSection).toContain('battle_self_destruct');
    expect(generatedSection).not.toContain('ship_recruit_personnel');
    expect(generatedSection).not.toContain('ship_treat_personnel');
    expect(generatedSection).not.toContain('ship_transfer_personnel');
    expect(generatedSection).not.toContain('ship_faction_personnel');
    expect(generatedSection).not.toContain('salvage_claim_prize');
    expect(generatedSection).not.toContain('salvage_service_prize');
    expect(generatedSection).not.toContain('faction personnel');
    expect(generatedSection).not.toContain('faction create_buy_order');
    expect(generatedSection).not.toContain('facility upgrade');
    expect(generatedSection).not.toContain('station info');
  });

  test('showFullHelp emphasizes local help command discovery before server help', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt help <command>        Local usage, args, route');
    expect(output).toContain(
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info, misc',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
    expect(output).toContain('Live server help:');
    expect(output).toContain(
      'spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword',
    );
    expect(output.indexOf('Command Discovery:')).toBeLessThan(output.indexOf('Live server help:'));
  });

  test('showFullHelp documents market subscription commands', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('subscribe_market');
    expect(output).toContain('unsubscribe_market');
    expect(output).toContain('market_update');
    expect(output).toContain('public liquidity');
  });

  test('full help Ship Exchange lists buy-order commands', () => {
    const capture = captureWriter();
    showFullHelp(capture.writer);
    const output = capture.stdout.join('\n');

    expect(output).toContain('place_ship_buy_order <class_id> <price>');
    expect(output).toContain('view_ship_buy_orders');
    expect(output).toContain('sell_ship_to_order <order_id> <ship_id>');
    expect(output).toContain('cancel_ship_buy_order <order_id>');
    // Existing listing commands still present
    expect(output).toContain('list_ship_for_sale');
    expect(output).toContain('browse_ships');
    expect(output).toContain('buy_listed_ship <id>');
    expect(output).toContain('cancel_ship_listing <id>');
  });

  test('showFullHelp includes cache sections near command discovery', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Commands:');
    expect(output).toContain('Safe generated commands bundled with this CLI are available immediately.');
    expect(output).toContain('spacemolt sync-api              Discover API routes published after this CLI release');
    expect(output).toContain('Accepted cached routes replace the generated fallback catalog.');
    expect(output).not.toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing/package IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
    expect(output).toContain('Payload fields match exact id/name by default.');
    expect(output).toContain('system/poi use unique prefix only (never substring)');
    expect(output).toContain('Completion, ids, and where-can-i stay fuzzy always.');
  });

  test('showFullHelp documents automation output semantics', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('--json, -j          Full API response as JSON');
    expect(output).toContain('--raw-notifications');
    expect(output).toContain('Render raw notification streams');
    expect(output).toContain('--verbose-notifications');
    expect(output).toContain('omitted-field hints');
    expect(output).toContain('--follow');
    expect(output).toContain('10-second HTTP polling');
    expect(output).toContain('--jq <expr>         Extract with path syntax');
    expect(output).toContain(
      '--fuzzy             Auto-resolve simple --jq paths to similar keys (jq only; not ID soft match)',
    );
    expect(output).toContain(
      '--fuzzy-ids         Soft ID-cache payload match (prefix/substring; system/poi prefix-only); default is exact id/name only',
    );
    expect(output).toContain('--no-fuzzy-ids      Force exact-only ID resolution (override env/config)');
    expect(output).toContain('--keys [path]       List available keys at a JSON dotpath');
    expect(output).toContain('--search');
    expect(output).toContain('--search-keys');
    expect(output).toContain('--search-values');
    expect(output).toContain('--search-regex');
    expect(output).toContain('Extract with path syntax');
    expect(output).toContain('Search projections print jq paths and values.');
    expect(output).toContain('--field/--fields output only the selected projection, even with --json/--format=json.');
    expect(output).toContain('SPACEMOLT_OUTPUT    Set to json for full API response JSON');
    expect(output).toContain('SPACEMOLT_FUZZY_IDS Soft ID-cache payload match when true/1');
    expect(output).toContain(
      'System/POI IDs: exact id/name by default; --fuzzy-ids allows unique prefix only (never substring)',
    );
  });

  test('showFullHelp documents named profile environment without session path override', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain("Use 'SPACEMOLT_PROFILE=<name>' when scripts share one named session");
    expect(output).toContain("Use 'profile default <name>' to save the default named session");
    expect(output).toContain('SPACEMOLT_PROFILE   Named session profile (overridden by --profile)');
    expect(output).not.toContain('SPACEMOLT_SESSION');
    expect(output).not.toContain('session.json');
  });

  test('displayError renders retry, auth, and quiet branches', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError('travel', { code: 'rate_limited', message: 'Slow down', retry_after: 2 }, { context });
    expect(capture.stdout.join('\n')).toContain('2026-05-20T00:00:00.000Z');
    expect(capture.stderr.join('\n')).toContain('Wait 2.0 seconds before retrying.');
    expect(capture.stderr.join('\n')).toContain('Suggestion:');
    expect(`${capture.stdout.join('\n')}\n${capture.stderr.join('\n')}`).not.toContain('\x1b[');

    const retryable = captureWriter();
    displayError(
      'travel',
      { code: 'no_fuel', message: 'No fuel' },
      { context: { ...context, writer: retryable.writer } },
    );
    expect(retryable.stderr.join('\n')).toContain('This error may be retryable.');

    const auth = captureWriter();
    displayError(
      'travel',
      { code: 'not_authenticated', message: 'Login required' },
      { context: { ...context, writer: auth.writer } },
    );
    expect(auth.stderr.join('\n')).toContain('This is an authentication error.');

    const quiet = captureWriter();
    displayError(
      'travel',
      { code: 'not_authenticated', message: 'Login required' },
      {
        context: { ...context, writer: quiet.writer, output: { quiet: true, plain: true } },
      },
    );
    expect(quiet.stdout).toEqual([]);
    expect(quiet.stderr.join('\n')).toContain('Login required');
    expect(quiet.stderr.join('\n')).not.toContain('Suggestion:');
    expect(quiet.stderr.join('\n')).not.toContain('This is an authentication error.');
    expect(quiet.stderr.join('\n')).not.toContain('\x1b[');
  });

  test('displayError treats service_unavailable as retryable, not an authentication error', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError(
      'travel',
      {
        code: 'service_unavailable',
        message: 'The authentication provider is temporarily unreachable.',
        retry_after: 8,
      },
      { context },
    );

    const output = capture.stderr.join('\n');
    expect(output).toContain('Error [service_unavailable]');
    expect(output).toContain('Wait 8.0 seconds before retrying.');
    expect(output).toContain('Suggestion:');
    expect(output).toContain('Do not change your password');
    expect(output).not.toContain('This is an authentication error.');
    expect(output).not.toContain('Run "spacemolt login"');
    expect(output.toLowerCase()).not.toContain('authentication error');
  });

  test('displayError gives invalid_payload a parameter spelling suggestion', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError(
      'facility_upgrade',
      { code: 'invalid_payload', message: 'Unknown parameter "facilty_id". Valid parameters: facility_id.' },
      { context },
    );

    const output = capture.stderr.join('\n');
    expect(output).toContain('Error [invalid_payload]');
    expect(output).toContain('Suggestion:');
    expect(output).toContain('Check parameter names and spelling');
    expect(output).not.toContain('This error may be retryable.');
  });

  test('displayError renders malformed API errors without undefined placeholders', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError('get_status', { detail: 'temporarily unavailable' }, { context });

    const output = capture.stderr.join('\n');
    expect(output).toContain('Error [api_error]: temporarily unavailable');
    expect(output).not.toContain('undefined');
    expect(output).not.toContain('This error may be retryable.');
  });

  test('displayError gives transit and fleet movement errors actionable suggestions', () => {
    const baseContext: CliRuntimeContext = {
      env: {},
      writer: captureWriter().writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    const transit = captureWriter();
    displayError(
      'mine',
      { code: 'in_transit', message: 'Ship is in transit', retry_after: 12 },
      { context: { ...baseContext, writer: transit.writer } },
    );

    expect(transit.stderr.join('\n')).toContain('Wait 12.0 seconds before retrying.');
    expect(transit.stderr.join('\n')).toContain('Wait for arrival, then rerun the command.');
    expect(transit.stderr.join('\n')).toContain('spacemolt get_status');

    const fleetMoved = captureWriter();
    displayError(
      'mine',
      { code: 'fleet_moved', message: 'Fleet moved before this command completed' },
      { context: { ...baseContext, writer: fleetMoved.writer } },
    );

    expect(fleetMoved.stderr.join('\n')).toContain('Your fleet moved while the command was pending.');
    expect(fleetMoved.stderr.join('\n')).toContain('spacemolt get_status');
  });

  test('displayError gives in_fleet auto-dock errors a fleet-leader suggestion', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError(
      'mine',
      { code: 'in_fleet', message: 'Only the fleet leader can change dock state while in a fleet.' },
      { context },
    );

    const output = capture.stderr.join('\n');
    expect(output).toContain('Error [in_fleet]');
    expect(output).toContain('Suggestion:');
    expect(output).toContain('fleet leader');
    expect(output).toContain('spacemolt fleet leave');
  });

  test('displayError tells users to verify state before retrying persistence errors', () => {
    const baseContext: CliRuntimeContext = {
      env: {},
      writer: captureWriter().writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    for (const code of ['persist_failed', 'persist_timeout']) {
      const capture = captureWriter();
      displayError(
        'buy',
        { code, message: 'Could not confirm transaction persistence' },
        { context: { ...baseContext, writer: capture.writer } },
      );

      const output = capture.stderr.join('\n');
      expect(output).toContain(`Error [${code}]`);
      expect(output).toContain('Verify your state');
      expect(output).toContain('spacemolt get_status');
      expect(output).toContain('This error may be retryable.');
    }
  });

  test('displayError preserves ambiguous bucket guidance instead of target not found suggestion', () => {
    const capture = captureWriter();
    const context: CliRuntimeContext = {
      env: {},
      writer: capture.writer,
      clock: { now: () => new Date('2026-05-20T00:00:00.000Z') },
      sleep: () => Promise.resolve(),
      output: { quiet: false, plain: true },
    };

    displayError(
      'storage',
      {
        code: 'invalid_target',
        message: 'Storage Extension bucket name "Reserve" is ambiguous; pass the bucket id instead.',
      },
      { context },
    );

    const output = capture.stderr.join('\n');
    expect(output).toContain('Storage Extension bucket name "Reserve" is ambiguous');
    expect(output).toContain('pass the bucket id');
    expect(output).not.toContain('Target not found');
  });

  test('displayError prints a missing-materials table on stderr for facility upgrade', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError('facility upgrade', missingMaterialsError(), { context });

    expect(capture.stdout).toEqual(['[2026-05-20T00:00:00.000Z]']);
    expect(capture.stdout.join('\n')).not.toContain('=== Missing materials ===');
    expect(capture.stderr[0]).toBe(
      'Error [missing_materials]: need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
    );
    expect(capture.stderr.join('\n')).toContain('=== Missing materials ===');
    expect(capture.stderr.join('\n')).toContain('Optical Fiber Bundle');
    expect(capture.stderr.join('\n')).toContain('optical_fiber_bundle');
    expect(capture.stderr.join('\n')).toContain('This error may be retryable.');
    expect(capture.stderr.join('\n')).not.toContain('Next:');
  });

  test('displayError prints the same table for missing_faction_materials without Next', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError('facility upgrade', missingMaterialsError({ code: 'missing_faction_materials' }), { context });

    expect(capture.stdout).toEqual(['[2026-05-20T00:00:00.000Z]']);
    expect(capture.stderr[0]).toBe(
      'Error [missing_faction_materials]: need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
    );
    expect(capture.stderr.join('\n')).toContain('=== Missing materials ===');
    expect(capture.stderr.join('\n')).toContain('Circuit Board');
    expect(capture.stderr.join('\n')).not.toContain('Next:');
  });

  test('displayError still prints the missing-materials table in quiet mode', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer, { quiet: true, plain: true });

    displayError('facility upgrade', missingMaterialsError(), { context });

    expect(capture.stdout).toEqual([]);
    expect(capture.stderr[0]).toBe(
      'Error [missing_materials]: need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
    );
    expect(capture.stderr.join('\n')).toContain('=== Missing materials ===');
    expect(capture.stderr.join('\n')).toContain('Optical Fiber Bundle');
    expect(capture.stderr.join('\n')).not.toContain('Suggestion:');
    expect(capture.stderr.join('\n')).not.toContain('This error may be retryable.');
    expect(capture.stderr.join('\n')).not.toContain('Next:');
  });

  test('displayError prints Wait then the missing-materials table and skips retryable', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError('facility upgrade', missingMaterialsError({ retry_after: 2 }), { context });

    expect(capture.stdout).toEqual(['[2026-05-20T00:00:00.000Z]']);
    expect(capture.stderr[0]).toBe(
      'Error [missing_materials]: need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
    );
    expect(capture.stderr[1]).toBe('Wait 2.0 seconds before retrying.');
    expect(capture.stderr[2]).toBe('');
    expect(capture.stderr[3]).toBe('=== Missing materials ===');
    expect(capture.stderr.join('\n')).toContain('Optical Fiber Bundle');
    expect(capture.stderr.join('\n')).not.toContain('This error may be retryable.');
    expect(capture.stderr.join('\n')).not.toContain('Next:');
  });

  test('displayError wraps only the missing-materials title when not plain', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer, { quiet: false, plain: false });
    const colors = colorsForPlain(false);

    displayError('facility upgrade', missingMaterialsError(), { context });

    const titleLine = capture.stderr.find((line) => line.includes('=== Missing materials ==='));
    expect(titleLine).toBe(`${colors.bright}=== Missing materials ===${colors.reset}`);
    const dataRows = capture.stderr.filter(
      (line) => line.includes('Optical Fiber Bundle') || line.includes('Circuit Board'),
    );
    expect(dataRows.length).toBe(2);
    for (const row of dataRows) expect(row).not.toContain('\x1b[');
  });

  test('displayError leaves a blank line between the last shortage row and retryable', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError('facility upgrade', missingMaterialsError(), { context });

    const retryableIndex = capture.stderr.indexOf('This error may be retryable.');
    expect(retryableIndex).toBeGreaterThan(1);
    expect(capture.stderr[retryableIndex - 1]).toBe('');
    expect(capture.stderr[retryableIndex - 2]).toContain('Circuit Board');
  });

  test('displayError still uses detail as the message fallback and does not parse it as details', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError('get_status', { detail: 'temporarily unavailable' }, { context });

    expect(capture.stderr.join('\n')).toContain('Error [api_error]: temporarily unavailable');
    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError tables from details without using the detail message fallback', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);
    const message = 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo';

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message,
        details: missingMaterialsDetails,
      },
      { context },
    );

    expect(capture.stderr[0]).toBe(`Error [missing_materials]: ${message}`);
    expect(capture.stderr.join('\n')).toContain('=== Missing materials ===');
    expect(capture.stderr.join('\n')).toContain('Optical Fiber Bundle');
  });

  test('displayError omits the table when details is absent', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
      },
      { context },
    );

    expect(capture.stderr.join('\n')).toContain('Error [missing_materials]:');
    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError omits the table for a legacy details array', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
        details: missingMaterialsDetails.missing,
      },
      { context },
    );

    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError omits the table when missing is an object', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
        details: { missing: { item_id: 'optical_fiber_bundle', need: 300, have: 0 } },
      },
      { context },
    );

    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError omits the table when missing is empty even with extra keys', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message: 'need 300 x optical_fiber_bundle, have 0 in faction storage + 0 in cargo',
        details: { missing: [], extra: 1 },
      },
      { context },
    );

    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError ignores details.missing on unrelated error codes', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer);

    displayError(
      'facility upgrade',
      {
        code: 'no_credits',
        message: 'not enough credits',
        details: missingMaterialsDetails,
      },
      { context },
    );

    expect(capture.stderr.join('\n')).toContain('Error [no_credits]: not enough credits');
    expect(capture.stderr.join('\n')).not.toContain('=== Missing materials ===');
  });

  test('displayError prints only the Error line when shortage rows are malformed', () => {
    const capture = captureWriter();
    const context = missingMaterialsContext(capture.writer, { quiet: true, plain: true });

    displayError(
      'facility upgrade',
      {
        code: 'missing_materials',
        message: 'need materials',
        details: {
          missing: [
            { item_name: { nested: true }, need: 1, have: 0 },
            { item_id: 'bad_need', need: [], have: 0 },
            { item_id: 'optical_fiber_bundle', need: Number.NaN, have: 0 },
          ],
        },
      },
      { context },
    );

    expect(capture.stderr).toEqual(['Error [missing_materials]: need materials']);
    const joined = capture.stderr.join('\n');
    expect(joined).not.toContain('=== Missing materials ===');
    expect(joined).not.toContain('undefined');
    expect(joined).not.toContain('NaN');
    expect(joined).not.toContain('[object Object]');
  });

  test('generated ship_faction_personnel is not a dispatchable command after faction personnel curation', () => {
    const help = captureWriter();
    const unknown = captureWriter();

    expect(showCommandHelp('ship_faction_personnel', help.writer, BUNDLED_COMMAND_REGISTRY)).toBe(false);
    expect(showCommandHelp('faction_personnel', help.writer, BUNDLED_COMMAND_REGISTRY)).toBe(false);
    expect(showCommandHelp('faction personnel', help.writer, BUNDLED_COMMAND_REGISTRY)).toBe(true);
    expect(help.stdout.join('\n')).toContain('spacemolt faction personnel');
    expect(help.stdout.join('\n')).not.toContain('spacemolt ship_faction_personnel');

    displayUnknownCommand('ship_faction_personnel', unknown.writer);
    expect(unknown.stderr.join('\n')).toContain('Unknown command "ship_faction_personnel"');
  });

  test('displayUnknownCommand points executable command groups to group help', () => {
    const capture = captureWriter();

    displayUnknownCommand('faction', capture.writer);

    const output = capture.stderr.join('\n');
    expect(output).toContain('Unknown command "faction"');
    expect(output).toContain('"faction" is a command group.');
    expect(output).toContain('spacemolt help faction');
    expect(output).toContain('spacemolt commands --search faction');
  });

  test('displayUnknownCommand uses supplied command groups instead of bundled groups', () => {
    const capture = captureWriter();

    displayUnknownCommand('faction', capture.writer, { plain: true }, { allCommands: {}, commandGroups: {} });

    const output = capture.stderr.join('\n');
    expect(output).toContain('"faction" is a help group.');
    expect(output).not.toContain('"faction" is a command group.');
  });
});
