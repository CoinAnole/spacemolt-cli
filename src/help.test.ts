import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { CliRuntimeContext, CliWriter } from './cli-context';
import type { CommandRegistrySnapshot } from './command-registry';
import type { PlayerState } from './help';
import {
  displayError,
  displayUnknownCommand,
  parseCommandSearchQuery,
  renderProgressiveHelp,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showFullHelp,
  showHelp,
} from './help';
import { runInvocation } from './main';

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
  test('showHelp emphasizes local help command discovery before server help', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt help <command>        Local usage, args, route');
    expect(output).toContain(
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
    expect(output).not.toContain('spacemolt explain <command>     Local usage, args, route');
  });

  test('showHelp includes top-level cache sections', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Cache:');
    expect(output).toContain('spacemolt sync-api              Refresh cached OpenAPI command metadata');
    expect(output).toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
  });

  test('showHelp documents automation output semantics', () => {
    const capture = captureWriter();
    showHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('--json, -j        Full API response as JSON');
    expect(output).toContain('--jq              Extract with path syntax');
    expect(output).toContain('.key[0].field');
    expect(output).toContain('Projections read from structuredContent when present.');
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
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
    expect(output).not.toContain('spacemolt explain <command>     Local usage, args, route');
  });

  test('renderProgressiveHelp includes top-level cache sections', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: true }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Cache:');
    expect(output).toContain('spacemolt sync-api              Refresh cached OpenAPI command metadata');
    expect(output).toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
  });

  test('renderProgressiveHelp writes docked, asteroid, escape pod, and space states', () => {
    const cases: Array<{ state: PlayerState; expected: string[] }> = [
      { state: { authenticated: true, docked: true }, expected: ['[DOCKED]', 'spacemolt view_market'] },
      { state: { authenticated: true, atAsteroidBelt: true }, expected: ['[ASTEROID BELT]', 'spacemolt mine'] },
      { state: { authenticated: true, escapePod: true }, expected: ['Escape Pod', '[IN SPACE]'] },
      { state: { authenticated: true }, expected: ['[IN SPACE]', 'spacemolt travel <poi_id>'] },
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

  test('faction group includes faction facility commands', () => {
    const capture = captureWriter();

    expect(showCommandGroup('faction', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Faction Commands');
    expect(output).toContain('Faction facilities:');
    expect(output).toContain('faction_build <facility_type> - Build a faction facility at the current base.');
    expect(output).toContain('faction_facility_list <args...> - List faction facilities at the current base.');
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
  });

  test('showCommandHelp documents view_market filters', () => {
    const capture = captureWriter();

    expect(showCommandHelp('view_market', capture.writer)).toBe(true);

    const output = capture.stdout.join('\n');
    expect(output).toContain('[--item item_id]');
    expect(output).toContain('[--search text]');
    expect(output).toContain('item -> item_id');
    expect(output).toContain('item_id');
    expect(output).toContain('category');
    expect(output).toContain('search');
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

  test('showCommandSearch ranks curated faction_build before legacy faction facility build', () => {
    const capture = captureWriter();

    showCommandSearch('faction facility build', capture.writer);

    const lines = capture.stdout.join('\n').split('\n');
    const factionBuildIndex = lines.findIndex((line) => line.includes('faction_build <facility_type>'));
    const legacyIndex = lines.findIndex((line) => line.includes('faction_facility_build <facility_type>'));

    expect(factionBuildIndex).toBeGreaterThan(-1);
    expect(legacyIndex).toBeGreaterThan(-1);
    expect(factionBuildIndex).toBeLessThan(legacyIndex);
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

  test('showCommandSearch uses local help metadata for help command', () => {
    const capture = captureWriter();

    showCommandSearch('help', capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Commands matching "help"');
    expect(output).toContain('help ');
    expect(output).toContain('Local command help');
    expect(output).not.toContain('Fetch server help');
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

  test('showFullHelp emphasizes local help command discovery before server help', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('spacemolt help <command>        Local usage, args, route');
    expect(output).toContain(
      'spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info',
    );
    expect(output).toContain('spacemolt commands --search fuel');
    expect(output).toContain('spacemolt help all              Full local command reference');
    expect(output).toContain('spacemolt help command=<name>   Local command help');
  });

  test('showFullHelp includes cache sections near command discovery', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('Dynamic API Cache:');
    expect(output).toContain('spacemolt sync-api              Refresh cached OpenAPI command metadata');
    expect(output).toContain('Cached v2 routes appear in help, command search, completion, and dispatch.');
    expect(output).not.toContain('spacemolt commands --search api');
    expect(output).not.toContain('spacemolt help <generated>');
    expect(output).toContain('ID Cache:');
    expect(output).toContain(
      'spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing IDs',
    );
    expect(output).toContain('spacemolt where-can-i <item>          Search cached item sightings');
  });

  test('showFullHelp documents automation output semantics', () => {
    const capture = captureWriter();

    showFullHelp(capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('--json, -j          Full API response as JSON');
    expect(output).toContain('--jq <expr>         Extract with path syntax');
    expect(output).toContain('.key[0].field');
    expect(output).toContain('--field/--fields output only the selected projection, even with --json/--format=json.');
    expect(output).toContain('SPACEMOLT_OUTPUT    Set to json for full API response JSON');
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

  test('displayUnknownCommand points group-like commands to group help', () => {
    const capture = captureWriter();

    displayUnknownCommand('faction', capture.writer);

    const output = capture.stderr.join('\n');
    expect(output).toContain('Unknown command "faction"');
    expect(output).toContain('"faction" is a help group.');
    expect(output).toContain('spacemolt help faction');
    expect(output).toContain('spacemolt commands --search faction');
  });
});
