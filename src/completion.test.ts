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
  {
    kind: 'wreck',
    id: 'wreck_iron',
    name: 'Iron Wreck',
    sourceCommand: 'get_wrecks',
    seenAt: '2026-05-18T00:04:00.000Z',
  },
];

async function tempSessionWithCachedIds(): Promise<string> {
  const sessionPath = path.join(tempDir(), 'sessions', 'pilot.json');
  await saveIdCache(cachedIdHints, sessionPath);
  return sessionPath;
}

function bashCommandCaseBody(completion: string, command: string): string {
  const escapedCommand = command.replace(/'/g, `'\\''`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    completion.match(new RegExp(`^\\s*'?${escapedCommand}'?\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'))?.groups?.body || ''
  );
}

function fishCommandLines(completion: string, command: string): string[] {
  return completion.split('\n').filter((line) => line.includes(`__fish_seen_subcommand_from ${command}`));
}

describe('shell completion generation', () => {
  test('shell completion recognizes nullable boolean command fields', () => {
    const config = {
      description: 'Probe a nullable boolean.',
      args: ['enabled'],
      route: { tool: 'probe', action: 'union', method: 'POST' as const },
      schema: {
        enabled: { type: ['boolean', 'null'] },
      },
    };
    const registry = {
      commands: { union_probe: config },
      allCommands: { union_probe: config },
    };

    const zsh = generateCompletion('zsh', registry);
    expect(zsh).toContain("'2:enabled:(true[true] false[false])'");
  });

  test('generated completion scripts escape shell-special command metadata in static fallbacks', () => {
    const registry = {
      commands: {
        'scan zone[1]': {
          description: 'Find "rich": ore $vein `now` [safe]',
          args: ['target'],
          route: { tool: 'scan', action: 'zone' },
          schema: {
            target: {
              enum: ['alpha zone', 'quote"zone', "quote'zone", 'bracket[zone]', 'colon:zone', 'cash$zone', 'tick`zone'],
              description: 'Target "zone": $sector `now` [pick]',
            },
          },
        },
        'cash$scan`now`': {
          description: 'Cash scan command',
          args: ['target'],
          route: { tool: 'scan', action: 'cash' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
        'quote"cash$scan`now` [x]:': {
          description: 'Quoted cash scan command',
          args: ['mode'],
          route: { tool: 'scan', action: 'quoted_cash' },
          schema: {
            mode: {
              enum: ['alpha zone'],
              description: 'Mode',
            },
          },
        },
        "quote'cmd": {
          description: 'Single quoted command',
          args: ['target'],
          route: { tool: 'scan', action: 'single_quote' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
        plain_scan: {
          description: 'Plain scan command',
          args: ['target'],
          route: { tool: 'scan', action: 'plain' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
      },
      allCommands: {
        'scan zone[1]': {
          description: 'Find "rich": ore $vein `now` [safe]',
          args: ['target'],
          route: { tool: 'scan', action: 'zone' },
          schema: {
            target: {
              enum: ['alpha zone', 'quote"zone', "quote'zone", 'bracket[zone]', 'colon:zone', 'cash$zone', 'tick`zone'],
              description: 'Target "zone": $sector `now` [pick]',
            },
          },
        },
        'cash$scan`now`': {
          description: 'Cash scan command',
          args: ['target'],
          route: { tool: 'scan', action: 'cash' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
        'quote"cash$scan`now` [x]:': {
          description: 'Quoted cash scan command',
          args: ['mode'],
          route: { tool: 'scan', action: 'quoted_cash' },
          schema: {
            mode: {
              enum: ['alpha zone'],
              description: 'Mode',
            },
          },
        },
        "quote'cmd": {
          description: 'Single quoted command',
          args: ['target'],
          route: { tool: 'scan', action: 'single_quote' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
        plain_scan: {
          description: 'Plain scan command',
          args: ['target'],
          route: { tool: 'scan', action: 'plain' },
          schema: {
            target: {
              type: 'string',
              description: 'Target ID',
            },
          },
        },
      },
    };

    const bash = generateCompletion('bash', registry);
    const zsh = generateCompletion('zsh', registry);
    const fish = generateCompletion('fish', registry);

    expect(bash).toContain(`'cash\\$scan\\\`now\\\`'`);
    expect(bash).toContain(`'scan zone[1]'`);
    expect(bash).toContain(
      `COMPREPLY=( $(compgen -W "'alpha zone' 'quote\\"zone' 'quote'\\\\''zone' 'bracket[zone]' colon:zone 'cash\\$zone' 'tick\\\`zone' \${global_flags}" -- "$cur") )`,
    );
    expect(bash).not.toContain('local target_values="alpha zone');

    expect(zsh).toContain(`'scan\\ zone\\[1\\][Find "rich"\\: ore $vein \`now\` \\[safe\\]]'`);
    expect(zsh).toContain(`alpha\\ zone[alpha zone]`);
    expect(zsh).toContain(`quote"zone[quote"zone]`);
    expect(zsh).toContain(`colon:zone[colon\\:zone]`);
    expect(zsh).toContain('        cash\\$scan\\`now\\`)');
    expect(zsh).not.toContain('        cash$scan`now`)');
    expect(zsh).toContain('        quote\\"cash\\$scan\\`now\\`\\ \\[x\\]:)');
    expect(zsh).not.toContain('        quote"cash\\$scan\\`now\\`\\ \\[x\\]\\:)');
    expect(zsh).toContain("        quote\\'cmd)");
    expect(zsh).not.toContain("        quote'cmd)");
    expect(zsh).toContain(`'cash$scan\`now\`[Cash scan command]'`);
    expect(zsh).not.toContain(` cash$scan\`now\`[Cash scan command] `);
    expect(zsh).toContain(`'plain_scan[Plain scan command]'`);
    expect(zsh).not.toContain(` plain_scan[Plain scan command] `);

    expect(fish).toContain(
      `complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a 'scan\\\\ zone\\\\[1\\\\]' -d "Find \\"rich\\": ore \\$vein \\\`now\\\` [safe]"`,
    );
    expect(fish).toContain(
      `complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from scan\\\\ zone\\\\[1\\\\]" -a 'alpha\\\\ zone' -d "Target \\"zone\\": \\$sector \\\`now\\\` [pick]: alpha zone"`,
    );
    expect(fish).toContain(
      `complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from quote\\\\\\"cash\\\\\\$scan\\\\\\\`now\\\\\\\`\\\\ \\\\[x\\\\]\\\\:" -a 'alpha\\\\ zone' -d "Mode: alpha zone"`,
    );
    expect(fish).toContain(
      `complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from cash\\\\\\$scan\\\\\\\`now\\\\\\\`" -a target= -d "Target ID"`,
    );
    expect(fish).toContain('  set -l dynamic_completions (__spacemolt_dynamic_complete)');
    expect(fish).toContain('  test (count $dynamic_completions) -gt 0');
    expect(fish).not.toContain('test -n "(__spacemolt_dynamic_complete)"');
    expect(fish).toContain(`-a 'quote\\\\\\'cmd'`);
    expect(fish).toContain(`-a 'quote\\\\\\'zone'`);
    expect(fish).not.toContain(`-a 'quote\\'\\''cmd'`);
    expect(fish).not.toContain(`-a 'quote\\'\\''zone'`);
    expect(fish).not.toContain(`__fish_seen_subcommand_from 'cash$scan\`now\`'`);
    expect(fish).not.toContain(`__fish_seen_subcommand_from 'quote"cash$scan\`now\` [x]:'`);
    expect(fish).toContain(`-a 'quote\\\\"zone'`);
    expect(fish).toContain(`-a 'bracket\\\\[zone\\\\]'`);
    expect(fish).toContain(`-a 'colon\\\\:zone'`);
    expect(fish).toContain(`-a 'cash\\\\$zone'`);
    expect(fish).toContain(`-a 'tick\\\\\`zone'`);
    expect(fish).not.toContain(`-a 'alpha zone'`);
    expect(fish).not.toContain(`-a 'cash$zone'`);
  });

  test('runtime completion line protocol preserves shell-special values and descriptions without interpolation', () => {
    const output = formatCompletionCandidates([
      {
        value: 'alpha zone "one" [x]:$cash`tick`',
        description: 'Desc "quoted" [x]: $cash `tick`',
      },
    ]);

    expect(output).toBe('alpha zone "one" [x]:$cash`tick`\tDesc "quoted" [x]: $cash `tick`\n');
  });

  test('runtime completion suggests top-level commands and global options by prefix', () => {
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'rep'], current: 'rep' }).map((candidate) => candidate.value),
    ).toContain('repair');
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--pl'], current: '--pl' }).map(
        (candidate) => candidate.value,
      ),
    ).toContain('--plain');
    const fuzzyPrefix = completeWords({ shell: 'fish', words: ['spacemolt', '--fu'], current: '--fu' }).map(
      (candidate) => candidate.value,
    );
    expect(fuzzyPrefix).toContain('--fuzzy');
    expect(fuzzyPrefix).toContain('--fuzzy-ids');
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--no-fu'], current: '--no-fu' }).map(
        (candidate) => candidate.value,
      ),
    ).toContain('--no-fuzzy-ids');
  });

  test('static completion scripts include --fuzzy-ids and keep --fuzzy as jq-only', () => {
    const bash = generateCompletion('bash');
    const fish = generateCompletion('fish');
    const zsh = generateCompletion('zsh');

    for (const script of [bash, fish, zsh]) {
      expect(script).toContain('--fuzzy');
      expect(script).toContain('--fuzzy-ids');
      expect(script).toContain('--no-fuzzy-ids');
    }

    // Bash static fallback lists flag names only; fish/zsh embed descriptions.
    for (const script of [fish, zsh]) {
      expect(script).toContain('jq only');
      expect(script).toContain('exact id/name only');
      expect(script).toContain('not ID soft match');
    }

    const runtimeFuzzy = completeWords({
      shell: 'fish',
      words: ['spacemolt', '--fuzzy'],
      current: '--fuzzy',
    });
    expect(runtimeFuzzy.map((c) => c.value)).toEqual(expect.arrayContaining(['--fuzzy', '--fuzzy-ids']));
    expect(runtimeFuzzy.find((c) => c.value === '--fuzzy')?.description).toContain('jq only');
    expect(runtimeFuzzy.find((c) => c.value === '--fuzzy-ids')?.description).toContain('exact id/name only');
  });

  test('bundled generated commands appear in runtime and static completion', () => {
    const values = completeWords({ shell: 'fish', words: ['spacemolt', 'shipping_q'], current: 'shipping_q' }).map(
      (candidate) => candidate.value,
    );
    const bash = generateCompletion('bash');
    const fish = generateCompletion('fish');

    expect(values).toContain('shipping_quote');
    expect(bash).toContain('shipping_quote');
    expect(fish).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a shipping_quote',
    );
  });

  test('curated shipping_list remains available in runtime and static completion', () => {
    const values = completeWords({ shell: 'fish', words: ['spacemolt', 'shipping_l'], current: 'shipping_l' }).map(
      (candidate) => candidate.value,
    );
    const bash = generateCompletion('bash');
    const fish = generateCompletion('fish');

    expect(values).toContain('shipping_list');
    expect(bash).toContain('shipping_list');
    expect(fish).toContain(
      'complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand" -a shipping_list',
    );
  });

  test('runtime completion suggests raw notification override', () => {
    const labels = completeWords({ shell: 'fish', words: ['spacemolt', '--raw-n'], current: '--raw-n' }).map(
      (entry) => entry.value,
    );

    expect(labels).toContain('--raw-notifications');
  });

  test('runtime completion exposes groups and hides grouped flat command names', () => {
    const values = completeWords({ shell: 'fish', words: ['spacemolt', 'fa'], current: 'fa' }).map(
      (candidate) => candidate.value,
    );

    expect(values).toContain('faction');
    expect(values).toContain('facility');
    expect(values).not.toContain('faction_info');
    expect(values).not.toContain('facility_job_add');
  });

  test('runtime completion suggests grouped actions after a group', () => {
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'faction', 'cr'], current: 'cr' })).toEqual([
      { value: 'create_buy_order', description: expect.stringContaining('buy order') },
      { value: 'create_role', description: expect.any(String) },
      { value: 'create_sell_order', description: expect.stringContaining('sell order') },
    ]);
  });

  test('runtime completion suggests nested action enum values and cached IDs', async () => {
    const sessionPath = await tempSessionWithCachedIds();

    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'faction', 'create_buy_order', 'ir'], current: 'ir' },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);

    expect(
      completeWords({
        shell: 'fish',
        words: ['spacemolt', 'facility', 'job_add', 'facility-1', 'recipe-1', '2', 'r'],
        current: 'r',
      }),
    ).toEqual([{ value: 'reverse', description: expect.any(String) }]);
  });

  test('runtime completion uses nested action fields for player IDs', async () => {
    const sessionPath = await tempSessionWithCachedIds();

    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'fleet', 'invite', 'mar'], current: 'mar' }, { sessionPath }),
    ).toEqual([{ value: 'player_marlow', description: 'Marlow' }]);
  });

  test('runtime completion handles global options before nested grouped commands', async () => {
    const sessionPath = await tempSessionWithCachedIds();
    const expectedFactionCreateActions = [
      { value: 'create_buy_order', description: expect.stringContaining('buy order') },
      { value: 'create_role', description: expect.any(String) },
      { value: 'create_sell_order', description: expect.stringContaining('sell order') },
    ];

    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--profile', 'pilot', 'faction', 'cr'], current: 'cr' }),
    ).toEqual(expectedFactionCreateActions);
    expect(completeWords({ shell: 'fish', words: ['spacemolt', '--plain', 'faction', 'cr'], current: 'cr' })).toEqual(
      expectedFactionCreateActions,
    );
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'faction', '--plain', 'cr'], current: 'cr' })).toEqual(
      expectedFactionCreateActions,
    );
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'faction', '--profile', 'pilot', 'cr'], current: 'cr' }),
    ).toEqual(expectedFactionCreateActions);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'faction', '--profile=pilot', 'cr'], current: 'cr' }),
    ).toEqual(expectedFactionCreateActions);
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'faction', '--profile', ''], current: '' })).toEqual([]);
    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'faction', '--profile', ''], current: '' },
        { profileNames: ['pilot'] },
      ),
    ).toEqual([{ value: 'pilot' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'faction', '--format', ''], current: '' }).map(
        (candidate) => candidate.value,
      ),
    ).toEqual(['table', 'json', 'yaml', 'text']);
    expect(
      completeWords(
        {
          shell: 'fish',
          words: ['spacemolt', '--profile', 'pilot', 'faction', 'create_buy_order', 'ir'],
          current: 'ir',
        },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    expect(
      completeWords(
        {
          shell: 'fish',
          words: ['spacemolt', 'faction', '--plain', 'create_buy_order', 'ir'],
          current: 'ir',
        },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
  });

  test('runtime completion describes help using local help metadata', () => {
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'hel'], current: 'hel' })).toContainEqual({
      value: 'help',
      description: 'Local command help, usage details, command groups, and command search.',
    });
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

  test('runtime completion suggests storage group actions by typed prefix', () => {
    const values = completeWords({ shell: 'fish', words: ['spacemolt', 'storage', 'vi'], current: 'vi' }).map(
      (candidate) => candidate.value,
    );
    expect(values).toContain('view');
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

  test('runtime completion uses storage group nested positional fields', async () => {
    const sessionPath = await tempSessionWithCachedIds();

    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'storage', 'deposit', 'ir'], current: 'ir' },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'storage', 'view', 'ea'], current: 'ea' }, { sessionPath }),
    ).toEqual([{ value: 'sol_earth', description: 'Earth' }]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', 'storage', 'loot', 'ir'], current: 'ir' }, { sessionPath }),
    ).toEqual([{ value: 'wreck_iron', description: 'Iron Wreck' }]);
    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'storage', 'loot', 'wreck_iron', 'ir'], current: 'ir' },
        { sessionPath },
      ),
    ).toEqual([{ value: 'ore_iron', description: 'Iron Ore' }]);
    // Named key=value args do not advance ordinary positionals; second bare token still maps to wreck_id.
    expect(
      completeWords(
        { shell: 'fish', words: ['spacemolt', 'storage', 'loot', 'wreck_id=wreck_1', 'ir'], current: 'ir' },
        { sessionPath },
      ),
    ).toEqual([{ value: 'wreck_iron', description: 'Iron Wreck' }]);
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

  test('hidden __complete exposes bundled generated commands without a cache', async () => {
    const home = tempDir();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runInvocation(['__complete', 'fish', '--', 'spacemolt', 'shipping_q'], undefined, {
      env: {
        HOME: home,
        XDG_CONFIG_HOME: path.join(home, '.config'),
        SPACEMOLT_NO_UPDATE_CHECK: 'true',
      },
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
      clock: { now: () => new Date('2026-07-17T00:00:00.000Z') },
      sleep: async () => {},
    });

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(stdout.join('')).toContain('shipping_quote\t');
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

  test('bash and fish suggest nested action argument inserts', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');
    const zsh = generateCompletion('zsh');

    expect(bash).toContain('case "$action" in');
    expect(bash).toContain('create_buy_order)');
    expect(bash).toContain('item_id=');
    expect(zsh).toContain("_arguments '2:faction action:(");
    expect(zsh).not.toContain("_arguments '1:faction action:(");
    expect(zsh).toContain('case $line[2] in');
    expect(zsh).toContain('          create_buy_order)');
    expect(zsh).toContain("'3:ID of the item to buy for faction storage. Required for single mode.:item_id'");
    expect(zsh).toContain("'4:Number of items to buy. Required for single mode.:quantity'");
    expect(zsh).toContain("'5:Maximum price per unit in credits. Required for single mode.:price_each'");
    expect(fish).toContain('function __spacemolt_static_command_words');
    expect(fish).toContain('set -l value_options');
    expect(fish).toContain('--profile');
    expect(fish).toContain('--format');
    expect(fish).toContain('set -l option_name (string replace -r -- "=.*$" "" "$token")');
    expect(fish).toContain('function __spacemolt_completing_global_option_value');
    expect(fish).toContain(`if test -n "$current"; and string match -q -- "*=*" "$current"
    set -l current_option_name (string replace -r -- "=.*$" "" "$current")
    if contains -- "$current_option_name" $value_options
      return 0
    end
  end`);
    const currentEqualsGuardIndex = fish.indexOf('set -l current_option_name');
    const valueGuardTokenRemovalIndex = fish.indexOf('set -e tokens[$last_index]', currentEqualsGuardIndex);
    expect(currentEqualsGuardIndex).toBeGreaterThan(-1);
    expect(currentEqualsGuardIndex).toBeLessThan(valueGuardTokenRemovalIndex);
    expect(fish).toContain('set -l previous_index (count $tokens)');
    expect(fish).toContain(`function __spacemolt_seen_group_without_action
  if __spacemolt_completing_global_option_value
    return 1
  end`);
    expect(fish).toContain(`function __spacemolt_seen_nested_command
  if __spacemolt_completing_global_option_value
    return 1
  end`);
    expect(fish).toContain('function __spacemolt_seen_group_without_action');
    expect(fish).toContain('__spacemolt_seen_group_without_action faction');
    expect(fish).not.toContain(
      '__spacemolt_no_dynamic_complete; and __fish_seen_subcommand_from faction" -a create_buy_order',
    );
    expect(fish).toContain('__spacemolt_seen_nested_command faction create_buy_order');
    expect(fish).toContain('-a item_id=');
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
    expect(bashCommandCaseBody(bash, 'analyze_market')).toContain('page=');
    // storage is a grouped command; nested deposit fields and action names come from group machinery
    const storageBody = bashCommandCaseBody(bash, 'storage');
    expect(storageBody.length).toBeGreaterThan(0);
    expect(storageBody).toMatch(/view|deposit|withdraw|loot|jettison/);
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

  test('shipping_list completion keeps generated filter fields and sort values', () => {
    const fish = generateCompletion('fish');
    const bash = generateCompletion('bash');
    const bashBody = bashCommandCaseBody(bash, 'shipping_list');
    const fishLines = fishCommandLines(fish, 'shipping_list').join('\n');

    expect(bashBody).toContain('filter_destination=');
    expect(bashBody).toContain('filter_shipper=');
    expect(bashBody).toContain('reward distance age');
    expect(fishLines).toContain('filter_destination=');
    expect(fishLines).toContain('filter_shipper=');
    expect(fishLines).toContain('-a reward');
    expect(fishLines).toContain('-a distance');
    expect(fishLines).toContain('-a age');
  });
});
