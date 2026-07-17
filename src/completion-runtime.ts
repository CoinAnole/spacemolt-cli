import { commandGroup, commandGroupAction } from './command-groups.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandConfig, LocalCommandConfig } from './commands.ts';
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

type CompletionRegistrySnapshot = Pick<CommandRegistrySnapshot, 'allCommands'> &
  Partial<Pick<CommandRegistrySnapshot, 'commands' | 'commandGroups'>>;

type CompletionRuntimeOptions = {
  registrySnapshot?: CompletionRegistrySnapshot;
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

function commandCandidates(registrySnapshot: CompletionRegistrySnapshot): CompletionCandidate[] {
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
  commands.set('help', {
    value: 'help',
    description: allCommands.help?.description || 'Local command help and discovery',
  });

  return [...commands.values()];
}

function groupActionCandidates(
  group: string,
  registrySnapshot: CompletionRegistrySnapshot,
  prefix: string,
): CompletionCandidate[] {
  const actions = commandGroup(registrySnapshot.commandGroups, group)?.actions;
  if (!actions) return [];
  return Object.values(actions)
    .filter((action) => action.action.startsWith(prefix))
    .map((action) => ({ value: action.action, description: action.config.description }))
    .sort((left, right) => left.value.localeCompare(right.value));
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
  registrySnapshot: CompletionRegistrySnapshot,
): { command: string; field?: string } | undefined {
  const wordIndex = currentWordIndex(input);
  const firstArgIndex = input.words[0] === 'spacemolt' ? 1 : 0;
  const allCommands = registrySnapshot.allCommands;

  const nested = nestedCommandContext(input, registrySnapshot);
  if (nested?.command && nested.actionConfig) {
    const args = completionArgsForCommand(nested.command, nested.actionConfig);
    const currentWord = input.words[wordIndex] === input.current ? input.current : '';
    const wordsBeforeCurrent = input.words.slice(nested.argOffset, wordIndex);
    if (isCurrentGlobalOptionValue(wordsBeforeCurrent)) return undefined;
    const positionalIndex = countCommandPositionalsBeforeCurrent(wordsBeforeCurrent);
    const fallbackField = args[positionalIndex]?.name;
    const keyValueField = currentWord.includes('=') ? currentWord.split('=', 1)[0] : undefined;
    return {
      command: nested.command,
      field: keyValueField || fallbackField,
    };
  }

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
    const wordsBeforeCurrent = input.words.slice(i + 1, wordIndex);
    const positionalIndex = countCommandPositionalsBeforeCurrent(wordsBeforeCurrent);
    const fallbackField = args[positionalIndex]?.name;
    return {
      command: word,
      field: keyValueField || fallbackField,
    };
  }

  return undefined;
}

function nextNonGlobalWordIndex(input: CompletionRequest, startIndex: number, wordIndex: number): number | undefined {
  for (let i = startIndex; i < wordIndex; i += 1) {
    const word = input.words[i];
    if (!word) continue;

    if (VALUE_TAKING_GLOBAL_OPTIONS.has(word)) {
      i += 1;
      continue;
    }

    const optionName = word.split('=', 1)[0] || word;
    if (VALUE_TAKING_GLOBAL_OPTIONS.has(optionName)) continue;
    if (GLOBAL_OPTION_WORDS.has(word) || GLOBAL_OPTION_WORDS.has(optionName)) continue;

    return i;
  }

  return undefined;
}

function firstCommandWordIndex(input: CompletionRequest, wordIndex: number): number | undefined {
  const firstArgIndex = input.words[0] === 'spacemolt' ? 1 : 0;
  return nextNonGlobalWordIndex(input, firstArgIndex, wordIndex);
}

function nestedCommandContext(
  input: CompletionRequest,
  registrySnapshot: CompletionRegistrySnapshot,
):
  | {
      group: string;
      action?: string;
      command?: string;
      actionConfig?: CommandConfig | LocalCommandConfig;
      argOffset: number;
    }
  | undefined {
  const wordIndex = currentWordIndex(input);
  const groupIndex = firstCommandWordIndex(input, wordIndex);
  if (groupIndex === undefined) return undefined;
  const group = input.words[groupIndex];
  if (!group || !commandGroup(registrySnapshot.commandGroups, group)) return undefined;
  const actionIndex = nextNonGlobalWordIndex(input, groupIndex + 1, wordIndex);
  const action = actionIndex === undefined ? undefined : input.words[actionIndex];
  const groupedAction = commandGroupAction(registrySnapshot.commandGroups, group, action);
  return {
    group,
    action,
    command: groupedAction?.command,
    actionConfig: groupedAction?.config,
    argOffset: actionIndex === undefined ? groupIndex + 1 : actionIndex + 1,
  };
}

function normalizeCompletionField(field: string): string {
  return field.replace(/^-+/, '').replace(/-/g, '_');
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

function commandFieldValueCandidates(
  input: CompletionRequest,
  options: CompletionRuntimeOptions,
): CompletionCandidate[] {
  const registrySnapshot = options.registrySnapshot || BUNDLED_COMMAND_REGISTRY;
  const context = commandContext(input, registrySnapshot);
  if (!context?.field) return [];

  const commandConfig =
    registrySnapshot.allCommands[context.command] ??
    Object.values(registrySnapshot.commandGroups || {})
      .flatMap((group) => Object.values(group?.actions ?? {}))
      .find((action) => action.command === context.command)?.config;
  if (!commandConfig) return [];

  const normalizedField = normalizeCompletionField(context.field);
  const field = commandConfig.aliases?.[normalizedField] || normalizedField;
  const arg = completionArgsForCommand(context.command, commandConfig).find((candidate) => candidate.name === field);
  if (!arg?.values?.length) return [];

  const currentValue = input.current.includes('=')
    ? input.current.slice(input.current.indexOf('=') + 1)
    : input.current;
  return arg.values
    .filter((value) => value.startsWith(currentValue))
    .map((value) => ({ value, description: arg.description }));
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

  const nested = nestedCommandContext(input, registrySnapshot);
  if (nested && !nested.action) {
    const wordIndex = currentWordIndex(input);
    if (isCurrentGlobalOptionValue(input.words.slice(nested.argOffset, wordIndex))) return [];
    return groupActionCandidates(nested.group, registrySnapshot, input.current);
  }

  if (!canCompleteTopLevel(input)) {
    const fieldValues = commandFieldValueCandidates(input, { ...options, registrySnapshot });
    if (fieldValues.length > 0) return fieldValues;
    return cachedIdCandidates(input, { ...options, registrySnapshot });
  }

  const prefix = input.current;
  const candidates = [...commandCandidates(registrySnapshot), ...globalOptionCandidates()];

  return candidates
    .filter((candidate) => candidate.value.startsWith(prefix))
    .sort((left, right) => left.value.localeCompare(right.value));
}
