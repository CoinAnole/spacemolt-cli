import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import {
  completionArgsForCommand,
  GLOBAL_COMPLETION_OPTIONS,
  LOCAL_COMPLETION_COMMANDS,
  SPECIAL_COMPLETIONS,
} from './completion-metadata.ts';
import { hintsForKind, type IdHint, idKindForCommandField, loadIdCacheSync } from './id-cache.ts';

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
  sessionPath?: string;
  idHints?: IdHint[];
  profileNames?: string[];
};

const GLOBAL_OPTION_WORDS = new Set(
  GLOBAL_COMPLETION_OPTIONS.flatMap((option) => [option.long, option.short].filter(Boolean) as string[]),
);
const GLOBAL_OPTIONS_BY_WORD = new Map(
  GLOBAL_COMPLETION_OPTIONS.flatMap((option) =>
    ([option.long, option.short].filter(Boolean) as string[]).map((word) => [word, option] as const),
  ),
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

function globalOptionValueCandidates(
  input: CompletionRequest,
  options: CompletionRuntimeOptions,
): CompletionCandidate[] {
  const wordIndex = currentWordIndex(input);
  const currentWord = input.words[wordIndex] === input.current ? input.current : input.current || '';
  const equalsIndex = currentWord.indexOf('=');
  const optionWord = equalsIndex >= 0 ? currentWord.slice(0, equalsIndex) : input.words[wordIndex - 1];
  if (!optionWord) return [];

  const option = GLOBAL_OPTIONS_BY_WORD.get(optionWord);
  if (!option) return [];
  if (equalsIndex < 0 && !option.takesValue) return [];

  const values = option.long === '--profile' ? options.profileNames || [] : option.values || [];
  if (values.length === 0) return [];

  const valuePrefix = equalsIndex >= 0 ? currentWord.slice(equalsIndex + 1) : input.current;
  return values.filter((value) => value.startsWith(valuePrefix)).map((value) => ({ value }));
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

function commandContext(
  input: CompletionRequest,
  registrySnapshot: Pick<CommandRegistrySnapshot, 'allCommands'> & Partial<Pick<CommandRegistrySnapshot, 'commands'>>,
): { command: string; field?: string } | undefined {
  const wordIndex = currentWordIndex(input);
  const firstArgIndex = input.words[0] === 'spacemolt' ? 1 : 0;
  const allCommands = registrySnapshot.allCommands;

  for (let i = firstArgIndex; i < wordIndex; i += 1) {
    const word = input.words[i];
    if (!word) continue;

    if (VALUE_TAKING_GLOBAL_OPTIONS.has(word)) {
      i += 1;
      continue;
    }

    const optionName = word.split('=', 1)[0] || word;
    if (VALUE_TAKING_GLOBAL_OPTIONS.has(optionName)) continue;
    if (GLOBAL_OPTION_WORDS.has(word) || GLOBAL_OPTION_WORDS.has(optionName)) continue;
    if (!allCommands[word]) return undefined;

    const commandConfig = allCommands[word];
    const args = completionArgsForCommand(word, commandConfig);
    const currentWord = input.words[wordIndex] === input.current ? input.current : '';
    if (isCurrentGlobalOptionValue(input.words.slice(i + 1, wordIndex))) return undefined;
    const keyValueField = currentWord.includes('=') ? currentWord.split('=', 1)[0] : undefined;
    const positionalIndex = countCommandPositionalsBeforeCurrent(input.words.slice(i + 1, wordIndex));
    return { command: word, field: keyValueField || args[positionalIndex]?.name };
  }

  return undefined;
}

function isProfileDefaultValue(input: CompletionRequest): boolean {
  const wordIndex = currentWordIndex(input);
  const firstArgIndex = input.words[0] === 'spacemolt' ? 1 : 0;
  const completedArgs: string[] = [];

  for (let i = firstArgIndex; i < wordIndex; i += 1) {
    const word = input.words[i];
    if (!word) continue;

    if (VALUE_TAKING_GLOBAL_OPTIONS.has(word)) {
      i += 1;
      continue;
    }

    const optionName = word.split('=', 1)[0] || word;
    if (VALUE_TAKING_GLOBAL_OPTIONS.has(optionName)) continue;
    if (GLOBAL_OPTION_WORDS.has(word) || GLOBAL_OPTION_WORDS.has(optionName)) continue;

    completedArgs.push(word);
  }

  return completedArgs[0] === 'profile' && completedArgs[1] === 'default';
}

function isCurrentGlobalOptionValue(wordsBeforeCurrent: string[]): boolean {
  const previousWord = wordsBeforeCurrent.at(-1);
  return Boolean(previousWord && VALUE_TAKING_GLOBAL_OPTIONS.has(previousWord));
}

function countCommandPositionalsBeforeCurrent(words: string[]): number {
  let count = 0;
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    if (!word) continue;

    if (VALUE_TAKING_GLOBAL_OPTIONS.has(word)) {
      i += 1;
      continue;
    }

    const optionName = word.split('=', 1)[0] || word;
    if (VALUE_TAKING_GLOBAL_OPTIONS.has(optionName)) continue;
    if (GLOBAL_OPTION_WORDS.has(word) || GLOBAL_OPTION_WORDS.has(optionName)) continue;
    if (word.includes('=')) continue;

    count += 1;
  }
  return count;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

function cachedIdCandidates(input: CompletionRequest, options: CompletionRuntimeOptions): CompletionCandidate[] {
  const registrySnapshot = options.registrySnapshot || BUNDLED_COMMAND_REGISTRY;
  const context = commandContext(input, registrySnapshot);
  if (!context) return [];

  const kind = idKindForCommandField(context.command, context.field);
  if (!kind) return [];

  const currentValue = input.current.includes('=')
    ? input.current.slice(input.current.indexOf('=') + 1)
    : input.current;
  const normalizedPrefix = normalizeSearchText(currentValue);
  if (!normalizedPrefix) return [];

  const hints = hintsForKind(
    kind,
    options.idHints ?? (options.sessionPath ? loadIdCacheSync(options.sessionPath) : []),
  );
  const matches = hints.filter((hint) => {
    const values = [hint.id, hint.name || ''].map(normalizeSearchText).filter(Boolean);
    return values.some((value) => value.startsWith(normalizedPrefix) || value.includes(normalizedPrefix));
  });

  const seen = new Set<string>();
  const candidates: CompletionCandidate[] = [];
  for (const hint of matches) {
    if (seen.has(hint.id)) continue;
    seen.add(hint.id);
    candidates.push({ value: hint.id, description: hint.name });
  }
  return candidates;
}

export function completeWords(input: CompletionRequest, options: CompletionRuntimeOptions = {}): CompletionCandidate[] {
  const registrySnapshot = options.registrySnapshot || BUNDLED_COMMAND_REGISTRY;
  const optionValues = globalOptionValueCandidates(input, options);
  if (optionValues.length > 0) return optionValues;

  if (isProfileDefaultValue(input)) {
    const prefix = input.current;
    return (options.profileNames || [])
      .filter((profileName) => profileName.startsWith(prefix))
      .map((profileName) => ({ value: profileName }));
  }

  if (!canCompleteTopLevel(input)) return cachedIdCandidates(input, { ...options, registrySnapshot });

  const prefix = input.current;
  const candidates = [...commandCandidates(registrySnapshot), ...globalOptionCandidates()];

  return candidates
    .filter((candidate) => candidate.value.startsWith(prefix))
    .sort((left, right) => left.value.localeCompare(right.value));
}
