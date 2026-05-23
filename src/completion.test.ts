import { describe, expect, test } from 'bun:test';
import { generateCompletion } from './completion';
import { completeWords, formatCompletionCandidates } from './completion-runtime';

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

  test('runtime completion returns no candidates after a command or value-taking global option', () => {
    expect(completeWords({ shell: 'fish', words: ['spacemolt', 'sell', ''], current: '' })).toEqual([]);
    expect(completeWords({ shell: 'fish', words: ['spacemolt', '--format', ''], current: '' })).toEqual([]);
    expect(
      completeWords({ shell: 'fish', words: ['spacemolt', '--plain', ''], current: '' }).map(
        (candidate) => candidate.value,
      ),
    ).toContain('sell');
  });

  test('runtime completion formats candidates as sanitized line protocol', () => {
    expect(formatCompletionCandidates([{ value: 'ore\tiron', description: 'Iron\nOre' }, { value: 'sell' }])).toBe(
      'ore iron\tIron Ore\nsell\t\n',
    );
    expect(formatCompletionCandidates([])).toBe('');
  });

  test('static completion scripts do not expose hidden __complete command', () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      expect(generateCompletion(shell)).not.toContain('__complete');
    }
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
      'complete -c spacemolt -n "__fish_seen_subcommand_from sell" -a auto_list= -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies)."',
    );
    expect(fishSellLines).not.toContain(
      'complete -c spacemolt -n "__fish_seen_subcommand_from sell" -a true -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies).: true"',
    );
    expect(fishSellLines).not.toContain(
      'complete -c spacemolt -n "__fish_seen_subcommand_from sell" -a false -d "If true, automatically create a sell order for unsold items at the average fill price (1% listing fee applies).: false"',
    );
  });

  test('enum fields still suggest their concrete values', () => {
    const bash = generateCompletion('bash');

    expect(bashCommandCaseBody(bash, 'buy')).toContain('cargo storage');
  });
});
