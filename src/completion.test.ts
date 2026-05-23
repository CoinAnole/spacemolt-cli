import { afterEach, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateCompletion } from './completion';
import { completeWords, formatCompletionCandidates } from './completion-runtime';
import { type IdHint, saveIdCache } from './id-cache';
import { runInvocation } from './runner';
import { getSessionPath, setDefaultProfile } from './session';

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spacemolt-completion-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const cachedIdHints: IdHint[] = [
  {
    kind: 'item',
    id: 'ore_iron',
    name: 'Iron Ore',
    sourceCommand: 'get_cargo',
    seenAt: '2026-05-18T00:00:00.000Z',
  },
  {
    kind: 'poi',
    id: 'sol_earth',
    name: 'Earth',
    sourceCommand: 'get_system',
    seenAt: '2026-05-18T00:01:00.000Z',
  },
  {
    kind: 'system',
    id: 'alpha_centauri',
    name: 'Alpha Centauri',
    sourceCommand: 'get_system',
    seenAt: '2026-05-18T00:02:00.000Z',
  },
  {
    kind: 'player',
    id: 'player_marlow',
    name: 'Marlow',
    sourceCommand: 'get_nearby',
    seenAt: '2026-05-18T00:03:00.000Z',
  },
];

async function tempSessionWithCachedIds(): Promise<string> {
  const sessionPath = path.join(tempDir(), 'sessions', 'pilot.json');
  await saveIdCache(cachedIdHints, sessionPath);
  return sessionPath;
}

function bashCommandCaseBody(completion: string, command: string): string {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    completion.match(new RegExp(`^\\s*${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'))?.groups?.body || ''
  );
}

function fishCommandLines(completion: string, command: string): string[] {
  return completion.split('\n').filter((line) => line.includes(`__fish_seen_subcommand_from ${command}`));
}

describe('shell completion generation', () => {
  test('runtime completion suggests top-level commands and global options by prefix', () => {
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'rep'], current: 'rep' }).map((candidate) => candidate.value),
    ).toContain('repair');
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--pl'], current: '--pl' }).map(
        (candidate) => candidate.value,
      ),
    ).toContain('--plain');
  });

  test('runtime completion returns no command candidates after a command or non-enum value-taking global option', () => {
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'sell', ''], current: '' })).toEqual([]);
    expect(completeWords({ shell: 'fish', words: ['spacemolt', '--jq', ''], current: '' })).toEqual([]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--plain', ''], current: '' }).map(
        (candidate) => candidate.value,
      ),
    ).toContain('sell');
  });

  test('runtime completion suggests cached IDs for command fields by typed prefix', async () => {
    const sessionPath = await tempSessionWithCachedIds();

    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'sell', 'ir'], current: 'ir' }, { sessionPath }),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'travel', 'ea'], current: 'ea' }, { sessionPath }),
    ).toEqual([{ value: 'sol_earth', description: 'Earth' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'jump', 'al'], current: 'al' }, { sessionPath }),
    ).toEqual([{ value: 'alpha_centauri', description: 'Alpha Centauri' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'attack', 'mar'], current: 'mar' }, { sessionPath }),
    ).toEqual([{ value: 'player_marlow', description: 'Marlow' }]);
    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'sell', 'quantity=1', 'ir'], current: 'ir' },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'sell', '--plain', 'ir'], current: 'ir' }, { sessionPath }),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'sell', '--profile', 'ir'], current: 'ir' }, { sessionPath }),
    ).toEqual([]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'sell', '--format', 'ir'], current: 'ir' }, { sessionPath }),
    ).toEqual([]);
  });

  test('runtime completion suggests global option values from metadata', () => {
    const formatValues = ['table', 'json', 'yaml', 'text'];
    const booleanValues = ['true', 'false'];

    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--format', ''], current: '' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(formatValues);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--format='], current: '--format=' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(formatValues);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '-fmt='], current: '-fmt=' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(formatValues);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--dry-run='], current: '--dry-run=' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(booleanValues);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--preview='], current: '--preview=' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(booleanValues);
  });

  test('runtime completion suggests saved profile names for profile option values and profile default', () => {
    const options = { profileNames: ['marlowe', 'pilot'] };

    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--profile', ''], current: '' }, options).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(['marlowe', 'pilot']);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--profile=p'], current: '--profile=p' }, options).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(['pilot']);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'profile', 'default', ''], current: '' }, options).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(['marlowe', 'pilot']);
    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', '--plain', 'profile', 'default', ''], current: '' },
        options,
      ).map((candidate) => candidate.value),
    ).toEqual(['marlowe', 'pilot']);
  });

  test('hidden __complete reads cached ID candidates from the active profile session path', async () => {
    const home = tempDir();
    const env = {
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      SPACEMOLT_PROFILE: 'pilot',
      SPACEMOLT_UPDATE_CHECK: 'false',
    };
    const sessionPath = getSessionPath({ profile: 'pilot' }, env);
    await saveIdCache(cachedIdHints, sessionPath);
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', 'sell', 'ir'], undefined, {
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
      clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
      sleep: async () => {},
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toBe('ore_iron\tIron Ore\n');
  });

  test('hidden __complete does not fall back to an unrelated default cache when no session path is active', async () => {
    const defaultHome = tempDir();
    const defaultEnv = {
      HOME: defaultHome,
      XDG_CONFIG_HOME: path.join(defaultHome, '.config'),
      SPACEMOLT_UPDATE_CHECK: 'false',
    };
    setDefaultProfile('realdev', undefined, undefined, defaultEnv);
    await saveIdCache(cachedIdHints, getSessionPath({ profile: 'realdev' }, defaultEnv));

    const isolatedHome = tempDir();
    const env = {
      HOME: isolatedHome,
      XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
      SPACEMOLT_UPDATE_CHECK: 'false',
    };
    const stdout: string[] = [];

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', 'sell', 'ir'], undefined, {
      env,
      writer: {
        out(message = '') {
          stdout.push(message);
        },
        err() {},
        writeOut(chunk) {
          stdout.push(chunk);
        },
      },
      clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
      sleep: async () => {},
    });

    expect(exitCode).toBe(0);
    expect(stdout.join('')).toBe('');
  });

  test('hidden __complete uses the profile typed in completion words before the command', async () => {
    const home = tempDir();
    const env = {
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      SPACEMOLT_UPDATE_CHECK: 'false',
    };
    await saveIdCache(cachedIdHints, getSessionPath({ profile: 'pilot' }, env));

    for (const words of [
      ['spacemolt', '--profile', 'pilot', 'sell', 'ir'],
      ['spacemolt', '--profile=pilot', 'sell', 'ir'],
      ['spacemolt', 'sell', '--profile', 'pilot', 'ir'],
      ['spacemolt', 'sell', '--profile=pilot', 'ir'],
    ]) {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const exitCode = await runInvocation(['__complete', 'fish', '--', ...words], undefined, {
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
        clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
        sleep: async () => {},
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout.join('')).toBe('ore_iron\tIron Ore\n');
    }
  });

  test('hidden __complete completes saved profiles for profile option values and profile default', async () => {
    const home = tempDir();
    const env = {
      HOME: home,
      XDG_CONFIG_HOME: path.join(home, '.config'),
      SPACEMOLT_UPDATE_CHECK: 'false',
    };
    for (const profile of ['marlowe', 'pilot']) {
      const sessionPath = getSessionPath({ profile }, env);
      fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
      fs.writeFileSync(sessionPath, JSON.stringify({ id: `sess_${profile}` }));
    }

    for (const words of [
      ['spacemolt', '--profile', ''],
      ['spacemolt', '--profile='],
      ['spacemolt', 'profile', 'default', ''],
    ]) {
      const stdout: string[] = [];
      const stderr: string[] = [];

      const exitCode = await runInvocation(['__complete', 'fish', '--', ...words], undefined, {
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
        clock: { now: () => new Date('2026-05-18T12:00:00.000Z') },
        sleep: async () => {},
      });

      expect(exitCode).toBe(0);
      expect(stderr).toEqual([]);
      expect(stdout.join('')).toBe('marlowe\t\npilot\t\n');
    }
  });

  test('runtime completion formats candidates as sanitized line protocol', () => {
    expect(formatCompletionCandidates([{ value: 'ore\tiron', description: 'Iron\nOre' }, { value: 'sell' }])).toBe(
      'ore iron\tIron Ore\nsell\t\n',
    );
    expect(formatCompletionCandidates([])).toBe('');
  });

  test('generated completion scripts call hidden dynamic completion adapters', () => {
    const bash = generateCompletion('bash');
    const zsh = generateCompletion('zsh');
    const fish = generateCompletion('fish');

    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
    expect(bash).toContain('spacemolt __complete bash -- "${words[@]}"');
    // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh variable in generated script
    expect(zsh).toContain('spacemolt __complete zsh -- "${words[@]}"');
    expect(fish).toContain('spacemolt __complete fish -- $words');
    expect(fish).toContain("if string match -qr '\\s$' -- (commandline)");
    expect(fish).toContain('set words $words ""');
  });

  test('generated completion scripts keep static fallback command lists', () => {
    const bash = generateCompletion('bash');
    const zsh = generateCompletion('zsh');
    const fish = generateCompletion('fish');

    expect(bash).toContain('local commands=');
    expect(bash).toContain('repair');
    expect(zsh).toContain('_spacemolt_commands()');
    expect(zsh).toContain('repair[');
    expect(fish).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a repair',
    );
  });

  test('fish static completions are gated behind dynamic fallback checks', () => {
    const fish = generateCompletion('fish');

    expect(fish).toContain('complete -c spacemolt -f -n "__spacemolt_has_dynamic_complete"');
    expect(fish).toContain('function __spacemolt_no_dynamic_complete');
    expect(fish).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a repair',
    );
    expect(fish).not.toContain('complete -c spacemolt -f -a "(__spacemolt_dynamic_complete)"');
  });

  test('bash and fish suggest key-value field inserts instead of bare placeholders', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');

    expect(fish).toContain('item_id=');
    expect(fish).not.toContain('-a item_id -d "ID of the item to sell');
    expect(bashCommandCaseBody(bash, 'sell')).toContain('item_id=');
  });

  test('bash and fish suggest optional non-enum fields as key-value inserts', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');

    expect(fish).toContain('__fish_seen_subcommand_from catalog" -a page=');
    expect(fish).toContain('__fish_seen_subcommand_from view_market" -a category=');
    expect(bashCommandCaseBody(bash, 'catalog')).toContain('page=');
    expect(bashCommandCaseBody(bash, 'view_market')).toContain('category=');
  });

  test('bash and fish suggest schema-backed rest fields as key-value inserts', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');

    expect(fish).toContain('__fish_seen_subcommand_from chat" -a content=');
    expect(fish).toContain('__fish_seen_subcommand_from create_note" -a content=');
    expect(bashCommandCaseBody(bash, 'chat')).toContain('content=');
    expect(bashCommandCaseBody(bash, 'create_note')).toContain('content=');
  });

  test('bash and fish suggest schema-less declared fields as key-value inserts', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');

    expect(fish).toContain('__fish_seen_subcommand_from analyze_market" -a page=');
    expect(fish).toContain('__fish_seen_subcommand_from send_gift" -a credits=');
    expect(bashCommandCaseBody(bash, 'analyze_market')).toContain('page=');
    expect(bashCommandCaseBody(bash, 'send_gift')).toContain('credits=');
  });

  test('bash and fish suggest boolean fields as key-value inserts instead of bare values', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');
    const bashSellBody = bashCommandCaseBody(bash, 'sell');
    const fishSellLines = fishCommandLines(fish, 'sell');

    expect(bashSellBody).toContain('auto_list=');
    expect(bashSellBody).not.toContain('true false');
    expect(fishSellLines).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from sell" -a auto_list= -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies)."',
    );
    expect(fishSellLines).not.toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from sell" -a true -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies).: true"',
    );
    expect(fishSellLines).not.toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from sell" -a false -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies).: false"',
    );
  });

  test('enum fields still suggest their concrete values', () => {
    const bash = generateCompletion('bash');

    expect(bashCommandCaseBody(bash, 'buy')).toContain('cargo storage');
  });
});
