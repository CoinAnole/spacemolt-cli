import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import { GLOBAL_COMPLETION_OPTIONS, LOCAL_COMPLETION_COMMANDS, SPECIAL_COMPLETIONS } from './completion-metadata.ts';

export interface CompletionRequest {
  shell: 'bash' | 'zsh' | 'fish';
  words: string[];
  current: string;
}

export interface CompletionCandidate {
  value: string;
  description?: string;
}

type CompletionRuntimeOptions = {
  registrySnapshot?: Pick<CommandRegistrySnapshot, 'allCommands'> & Partial<Pick<CommandRegistrySnapshot, 'commands'>>;
};

const GLOBAL_OPTION_WORDS = new Set(
  GLOBAL_COMPLETION_OPTIONS.flatMap((option) => [option.long, option.short].filter(Boolean) as string[]),
);
const VALUE_TAKING_GLOBAL_OPTIONS = new Set(
  GLOBAL_COMPLETION_OPTIONS.filter((option) => option.takesValue).flatMap(
    (option) => [option.long, option.short].filter(Boolean) as string[],
  ),
);

function sanitize(value: string): string {
  return value.replace(/[\t\r\n]+/g, ' ');
}

export function formatCompletionCandidates(candidates: CompletionCandidate[]): string {
  if (candidates.length === 0) return '';
  return `${candidates
    .map((candidate) => `${sanitize(candidate.value)}\t${sanitize(candidate.description || '')}`)
    .join('\n')}\n`;
}

function commandCandidates(
  registrySnapshot: Pick<CommandRegistrySnapshot, 'allCommands'> & Partial<Pick<CommandRegistrySnapshot, 'commands'>>,
): CompletionCandidate[] {
  const allCommands = registrySnapshot.allCommands;
  const commands = new Map<string, CompletionCandidate>();

  for (const [name, config] of Object.entries(allCommands)) {
    commands.set(name, { value: name, description: config.description });
  }

  for (const [name, config] of Object.entries(LOCAL_COMPLETION_COMMANDS)) {
    commands.set(name, { value: name, description: config.description });
  }

  for (const [name, config] of Object.entries(SPECIAL_COMPLETIONS)) {
    commands.set(name, { value: name, description: config.description });
  }

  commands.set('commands', { value: 'commands', description: 'Search local commands' });
  commands.set('explain', { value: 'explain', description: 'Explain a command' });
  commands.set('help', { value: 'help', description: 'Show help for a group' });

  return [...commands.values()];
}

function globalOptionCandidates(): CompletionCandidate[] {
  return GLOBAL_COMPLETION_OPTIONS.flatMap((option) => {
    const candidates: CompletionCandidate[] = [];
    if (option.long) candidates.push({ value: option.long, description: option.description });
    if (option.short) candidates.push({ value: option.short, description: option.description });
    return candidates;
  });
}

function currentWordIndex(input: CompletionRequest): number {
  const lastIndex = input.words.length - 1;
  if (lastIndex < 0) return 0;
  const lastWord = input.words[lastIndex] || '';
  return lastWord === input.current ? lastIndex : input.words.length;
}

function canCompleteTopLevel(input: CompletionRequest): boolean {
  const wordIndex = currentWordIndex(input);
  const firstArgIndex = input.words[0] === 'spacemolt' ? 1 : 0;
  if (wordIndex <= firstArgIndex) return true;

  for (let i = firstArgIndex; i < wordIndex; i += 1) {
    const word = input.words[i];
    if (!word) continue;

    if (VALUE_TAKING_GLOBAL_OPTIONS.has(word)) {
      if (i + 1 >= wordIndex) return false;
      i += 1;
      continue;
    }

    const optionName = word.split('=', 1)[0] || word;
    if (VALUE_TAKING_GLOBAL_OPTIONS.has(optionName)) continue;
    if (GLOBAL_OPTION_WORDS.has(word) || GLOBAL_OPTION_WORDS.has(optionName)) continue;

    return false;
  }

  return true;
}

export function completeWords(input: CompletionRequest, options: CompletionRuntimeOptions = {}): CompletionCandidate[] {
  if (!canCompleteTopLevel(input)) return [];

  const registrySnapshot = options.registrySnapshot || BUNDLED_COMMAND_REGISTRY;
  const prefix = input.current;
  const candidates = [...commandCandidates(registrySnapshot), ...globalOptionCandidates()];

  return candidates
    .filter((candidate) => candidate.value.startsWith(prefix))
    .sort((left, right) => left.value.localeCompare(right.value));
}
