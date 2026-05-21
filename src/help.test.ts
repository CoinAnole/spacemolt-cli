import { describe, expect, test } from 'bun:test';
import type { CliRuntimeContext, CliWriter } from './cli-context';
import type { CommandRegistrySnapshot } from './command-registry';
import type { PlayerState } from './help';
import {
  displayError,
  parseCommandSearchQuery,
  renderProgressiveHelp,
  showCommandGroup,
  showCommandGroups,
  showCommandHelp,
  showCommandSearch,
  showFullHelp,
  showHelp,
} from './help';

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
    expect(output).toContain('spacemolt help command=<name>   Server-provided command help');
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
    expect(output).toContain('spacemolt ids <kind>            Show cached poi/system/item/player IDs');
    expect(output).toContain('spacemolt where-can-i <item>    Search cached item sightings');
  });

  test('renderProgressiveHelp writes unauthenticated start steps', () => {
    const capture = captureWriter();
    renderProgressiveHelp({ authenticated: false }, capture.writer);

    const output = capture.stdout.join('\n');
    expect(output).toContain('SpaceMolt CLI');
    expect(output).toContain('spacemolt register <username> <empire> <registration_code>');
    expect(output).toContain('Once logged in, try:');
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
    expect(output).toContain('spacemolt help command=<name>   Server-provided command help');
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
    expect(output).toContain('spacemolt ids <kind>            Show cached poi/system/item/player IDs');
    expect(output).toContain('spacemolt where-can-i <item>    Search cached item sightings');
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
    expect(output).toContain('spacemolt help command=<name>   Server-provided command help');
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
    expect(output).toContain('spacemolt ids <kind>            Show cached poi/system/item/player IDs');
    expect(output).toContain('spacemolt where-can-i <item>    Search cached item sightings');
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
});
