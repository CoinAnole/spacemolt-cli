import type { CommandGroupEntryConfig, CommandGroups } from './command-groups.ts';
import { commandGroup } from './command-groups.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import type { CommandConfig, LocalCommandConfig } from './commands.ts';
import {
  type CompletionOption,
  completionArgsForCommand,
  GLOBAL_COMPLETION_OPTIONS,
  globalOptionWords,
  HINT_VALUES,
  LOCAL_COMPLETION_COMMANDS,
  SPECIAL_COMPLETIONS,
} from './completion-metadata.ts';

type CompletionRegistry = Pick<CommandRegistrySnapshot, 'allCommands'> &
  Partial<Pick<CommandRegistrySnapshot, 'commands' | 'commandGroups'>>;
type CompletionCommandMap = Record<string, CommandConfig | LocalCommandConfig | CommandGroupEntryConfig>;

function allCommands(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): CompletionCommandMap {
  return registry.allCommands;
}

function commandsList(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): string[] {
  return Object.keys(registry.allCommands).sort();
}

function commandGroups(registry: CompletionRegistry): CommandGroups {
  return registry.commandGroups || {};
}

function groupedActions(registry: CompletionRegistry, group: string) {
  return Object.values(commandGroup(commandGroups(registry), group)?.actions || {}).sort((left, right) =>
    left.action.localeCompare(right.action),
  );
}

function registryCommandNames(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): string[] {
  if (registry.commands) return Object.keys(registry.commands).sort();
  return Object.entries(registry.allCommands)
    .filter(([, config]) => 'route' in config)
    .map(([command]) => command)
    .sort();
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function topLevelCommandNames(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): string[] {
  return uniqueSorted([
    ...commandsList(registry),
    ...Object.keys(LOCAL_COMPLETION_COMMANDS),
    ...Object.keys(SPECIAL_COMPLETIONS),
    'commands',
    'explain',
    'help',
  ]);
}

function commandDescription(command: string, registry: CompletionRegistry): string {
  return (
    allCommands(registry)[command]?.description ||
    LOCAL_COMPLETION_COMMANDS[command]?.description ||
    SPECIAL_COMPLETIONS[command]?.description ||
    (command === 'commands'
      ? 'Search local commands'
      : command === 'explain'
        ? 'Explain a command'
        : command === 'help'
          ? 'Local command help and discovery'
          : command)
  );
}

function getCommandArgNames(
  command: string,
  registry: CompletionRegistry,
  config: CommandConfig | LocalCommandConfig | undefined = allCommands(registry)[command],
): string[] {
  return completionArgsForCommand(command, config).map((arg) => arg.name);
}

function getFieldSchema(
  command: string,
  arg: string,
  registry: CompletionRegistry,
  config: CommandConfig | LocalCommandConfig | undefined = allCommands(registry)[command],
) {
  if (!config || !('schema' in config) || !config.schema) return undefined;
  const canonicalArg = config.aliases?.[arg] || arg;
  return config.schema[canonicalArg] || config.schema[arg];
}

function getEnumValues(
  command: string,
  arg: string,
  registry: CompletionRegistry,
  config?: CommandConfig | LocalCommandConfig,
): string[] | undefined {
  const schema = getFieldSchema(command, arg, registry, config);
  if (schema?.enum?.length) return schema.enum;
  if (schema?.type === 'boolean') return ['true', 'false'];
  return undefined;
}

function getHintValue(command: string, arg: string): string | undefined {
  return HINT_VALUES[command]?.[arg];
}

function getArgDescription(
  command: string,
  arg: string,
  registry: CompletionRegistry,
  config?: CommandConfig | LocalCommandConfig,
): string {
  return getFieldSchema(command, arg, registry, config)?.description || getHintValue(command, arg) || arg;
}

function escapeSingleQuotedShell(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function escapeDoubleQuotedShell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

function escapeBashWord(value: string): string {
  if (/^[A-Za-z0-9_./=:@%+-]+$/.test(value)) return value;
  return escapeSingleQuotedShell(value);
}

function escapeBashWordList(values: string[]): string {
  return escapeDoubleQuotedShell(values.map(escapeBashWord).join(' '));
}

function escapeZshCompletionText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/:/g, '\\:');
}

function escapeZshWord(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\s/g, '\\$&').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function escapeZshCaseLabel(value: string): string {
  return escapeZshWord(value).replace(/\$/g, '\\$').replace(/`/g, '\\`').replace(/"/g, '\\"').replace(/'/g, "\\'");
}

function escapeZshDescription(value: string): string {
  return escapeDoubleQuotedShell(escapeZshCompletionText(value));
}

function escapeZshDescribedWord(value: string, description: string): string {
  const describedWord = `${escapeZshWord(value)}[${escapeZshCompletionText(description)}]`;
  return escapeSingleQuotedShell(describedWord);
}

function escapeZshAlternative(value: string): string {
  return `${escapeZshWord(value)}[${escapeZshCompletionText(value)}]`;
}

function escapeFishCompletionToken(value: string): string {
  return value.replace(/([\\\s$"'`[\]():;{}*?<>|&])/g, '\\$1');
}

function escapeFishConditionWord(value: string): string {
  return escapeDoubleQuotedShell(escapeFishCompletionToken(value));
}

function quoteFishSourceString(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function escapeFishArgument(value: string): string {
  const payload = escapeFishCompletionToken(value);
  if (payload === value && /^[A-Za-z0-9_./=-]+$/.test(value)) return value;
  return quoteFishSourceString(payload);
}

function escapeFishArgumentList(values: string[]): string {
  return quoteFishSourceString(values.map(escapeFishCompletionToken).join(' '));
}

function escapeFishArguments(values: string[]): string {
  return values.map(escapeFishArgument).join(' ');
}

function fishCompletionOptionWords(option: CompletionOption): string[] {
  return [option.long, option.short].filter(Boolean) as string[];
}

function fishGlobalOptionWords(): string[] {
  return GLOBAL_COMPLETION_OPTIONS.flatMap(fishCompletionOptionWords);
}

function fishValueGlobalOptionWords(): string[] {
  return GLOBAL_COMPLETION_OPTIONS.filter((option) => option.takesValue).flatMap(fishCompletionOptionWords);
}

function generateZshGlobalOption(option: CompletionOption): string {
  const words = [option.short, option.long].filter(Boolean) as string[];
  const escapedDescription = escapeZshDescription(option.description);
  const valueCompletion =
    option.takesValue && option.values?.length
      ? `:${option.long?.replace(/^--/, '') || 'value'}:(${option.values.map(escapeZshWord).join(' ')})`
      : option.takesValue
        ? `:${option.long?.replace(/^--/, '') || 'value'}:`
        : '';

  if (option.short && option.long) {
    return `    "(${words.join(' ')})"{${option.short},${option.long}}"[${escapedDescription}]${valueCompletion}" \\`;
  }

  const word = option.long || option.short;
  return `    "${word}[${escapedDescription}]${valueCompletion}" \\`;
}

function pushZshCommandArguments(
  lines: string[],
  command: string,
  registry: CompletionRegistry,
  startPosition: number,
  indent: string,
  config?: CommandConfig | LocalCommandConfig,
): void {
  const args = getCommandArgNames(command, registry, config);
  if (args.length === 0) {
    lines.push(`${indent}_message "no arguments"`);
    return;
  }

  lines.push(`${indent}_arguments \\`);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    const enums = getEnumValues(command, arg, registry, config);
    const hint = getHintValue(command, arg);
    const description = escapeZshCompletionText(getArgDescription(command, arg, registry, config));
    const isLast = i === args.length - 1;
    const terminator = isLast ? '' : ' \\';
    const position = startPosition + i;

    if (enums && enums.length > 0) {
      const valuesStr = enums.map(escapeZshAlternative).join(' ');
      lines.push(`${indent}  ${escapeSingleQuotedShell(`${position}:${description}:(${valuesStr})`)}${terminator}`);
    } else if (hint) {
      lines.push(
        `${indent}  ${escapeSingleQuotedShell(`${position}:${description}:${escapeZshWord(hint)}`)}${terminator}`,
      );
    } else {
      lines.push(
        `${indent}  ${escapeSingleQuotedShell(`${position}:${description}:${escapeZshWord(arg)}`)}${terminator}`,
      );
    }
  }
}

function fishStaticFallbackCondition(condition: string): string {
  return `__spacemolt_no_dynamic_complete; and ${condition}`;
}

function generateFishGlobalOption(option: CompletionOption, condition = '__fish_use_subcommand'): string {
  const parts = [`complete -c spacemolt -n "${fishStaticFallbackCondition(condition)}"`];
  if (option.short) {
    if (option.short.length === 2) {
      parts.push(`-s ${option.short.slice(1)}`);
    } else {
      parts.push(`-o ${option.short.slice(1)}`);
    }
  }
  if (option.long) parts.push(`-l ${option.long.slice(2)}`);
  if (option.takesValue) parts.push('-r');
  if (option.takesValue && option.values?.length) {
    parts.push(`-a ${escapeFishArgumentList(option.values)}`);
  }
  parts.push(`-d "${escapeDoubleQuotedShell(option.description)}"`);
  return parts.join(' ');
}

function generateBashCompletion(registry: CompletionRegistry): string {
  const commandNames = commandsList(registry);
  const explainCommandNames = registryCommandNames(registry);
  const topCommands = topLevelCommandNames(registry);
  const groups = commandGroups(registry);
  const groupNames = Object.keys(groups).sort();
  const groupNameSet = new Set(groupNames);
  const lines: string[] = [];
  lines.push('# Bash completion for spacemolt');
  lines.push('# Install: spacemolt completion bash > /etc/bash_completion.d/spacemolt');
  lines.push('# Or:      spacemolt completion bash >> ~/.bashrc');
  lines.push('');
  lines.push('_spacemolt() {');
  lines.push('  local cur prev words cword');
  lines.push('  _init_completion || return');
  lines.push('');
  lines.push('  local dynamic_completions dynamic_value');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('  dynamic_completions="$(spacemolt __complete bash -- "${words[@]}" 2>/dev/null)"');
  lines.push('  if [ -n "$dynamic_completions" ]; then');
  lines.push('    COMPREPLY=()');
  lines.push("    while IFS=$'\\t' read -r dynamic_value _; do");
  lines.push('      [ -n "$dynamic_value" ] && COMPREPLY+=("$dynamic_value")');
  lines.push('    done <<< "$dynamic_completions"');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('    if [ ${#COMPREPLY[@]} -gt 0 ]; then');
  lines.push('      return');
  lines.push('    fi');
  lines.push('  fi');
  lines.push('');
  lines.push('  # Global flags');
  lines.push(`  local global_flags="${escapeBashWordList(globalOptionWords())}"`);
  lines.push('');
  lines.push('  # Top-level special commands');
  lines.push(`  local commands="${escapeBashWordList(topCommands)}"`);
  lines.push('');
  lines.push('  if [ $cword -eq 1 ]; then');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('    COMPREPLY=( $(compgen -W "${commands} ${global_flags}" -- "$cur") )');
  lines.push('    return');
  lines.push('  fi');
  lines.push('');
  lines.push('  # Per-command completions');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('  local cmd="${words[1]}"');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('  local action="${words[2]}"');
  lines.push('  case "$cmd" in');

  for (const group of groupNames) {
    const actions = groupedActions(registry, group).map((action) => action.action);
    lines.push(`    ${escapeBashWord(group)})`);
    lines.push('      if [ $cword -eq 2 ]; then');
    lines.push(`        COMPREPLY=( $(compgen -W "${escapeBashWordList(actions)}" -- "$cur") )`);
    lines.push('        return');
    lines.push('      fi');
    lines.push('      case "$action" in');
    for (const action of groupedActions(registry, group)) {
      const args = completionArgsForCommand(action.command, action.config);
      const argParts = args.flatMap((arg) => (arg.kind === 'enum' && arg.values?.length ? arg.values : [arg.insert]));
      lines.push(`        ${escapeBashWord(action.action)})`);
      lines.push(
        `          COMPREPLY=( $(compgen -W "${escapeBashWordList([...argParts, ...globalOptionWords()])}" -- "$cur") )`,
      );
      lines.push('          ;;');
    }
    lines.push('      esac');
    lines.push('      ;;');
  }

  for (const cmd of commandNames.filter((command) => !SPECIAL_COMPLETIONS[command] && !groupNameSet.has(command))) {
    const args = completionArgsForCommand(cmd, allCommands(registry)[cmd]);
    if (args.length === 0) continue;

    lines.push(`    ${escapeBashWord(cmd)})`);
    const argParts: string[] = [];
    for (const arg of args) {
      if (arg.kind === 'enum' && arg.values?.length) {
        argParts.push(...arg.values);
      } else {
        argParts.push(arg.insert);
      }
    }
    const allParts = `${escapeBashWordList(argParts)} \${global_flags}`;
    lines.push(`      COMPREPLY=( $(compgen -W "${allParts}" -- "$cur") )`);
    lines.push('      ;;');
  }

  for (const [cmd, completion] of Object.entries(SPECIAL_COMPLETIONS)) {
    lines.push(`    ${escapeBashWord(cmd)})`);
    lines.push(`      COMPREPLY=( $(compgen -W "${escapeBashWordList(completion.values)}" -- "$cur") )`);
    lines.push('      ;;');
  }

  lines.push('    commands)');
  lines.push('      ;;');
  lines.push('    explain)');
  lines.push(`      COMPREPLY=( $(compgen -W "${escapeBashWordList(explainCommandNames)}" -- "$cur") )`);
  lines.push('      ;;');
  lines.push('    help)');
  lines.push('      ;;');
  lines.push('    *)');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
  lines.push('      COMPREPLY=( $(compgen -W "${global_flags}" -- "$cur") )');
  lines.push('      ;;');
  lines.push('  esac');
  lines.push('}');
  lines.push('');
  lines.push('complete -F _spacemolt spacemolt');

  return `${lines.join('\n')}\n`;
}

function generateZshCompletion(registry: CompletionRegistry): string {
  const commandNames = commandsList(registry);
  const explainCommandNames = registryCommandNames(registry);
  const topCommands = topLevelCommandNames(registry);
  const groups = commandGroups(registry);
  const groupNames = Object.keys(groups).sort();
  const groupNameSet = new Set(groupNames);
  const lines: string[] = [];
  lines.push('#compdef spacemolt');
  lines.push('#');
  lines.push('# Zsh completion for spacemolt');
  lines.push('# Install: spacemolt completion zsh > /usr/local/share/zsh/site-functions/_spacemolt');
  lines.push('# Or:      spacemolt completion zsh > ~/.zsh/completions/_spacemolt');
  lines.push('#          (ensure fpath contains ~/.zsh/completions)');
  lines.push('');
  lines.push('_spacemolt() {');
  lines.push('  local curcontext="$curcontext" state line');
  lines.push('  local dynamic_completions dynamic_value');
  lines.push('  local -a dynamic_values');
  lines.push('  typeset -A opt_args');
  lines.push('');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh variable in generated script
  lines.push('  dynamic_completions="$(spacemolt __complete zsh -- "${words[@]}" 2>/dev/null)"');
  lines.push('  if [[ -n "$dynamic_completions" ]]; then');
  lines.push('    dynamic_values=()');
  lines.push("    while IFS=$'\\t' read -r dynamic_value _; do");
  lines.push('      [[ -n "$dynamic_value" ]] && dynamic_values+=("$dynamic_value")');
  lines.push('    done <<< "$dynamic_completions"');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh variable in generated script
  lines.push('    if (( ${#dynamic_values[@]} > 0 )); then');
  // biome-ignore lint/suspicious/noTemplateCurlyInString: zsh variable in generated script
  lines.push('      compadd -- "${dynamic_values[@]}"');
  lines.push('      return');
  lines.push('    fi');
  lines.push('  fi');
  lines.push('');
  lines.push('  _arguments -C \\');
  for (const option of GLOBAL_COMPLETION_OPTIONS) {
    lines.push(generateZshGlobalOption(option));
  }
  lines.push('    "1:command:_spacemolt_commands" \\');
  lines.push('    "*::arg:->args"');
  lines.push('');
  lines.push('  case $state in');
  lines.push('    args)');
  lines.push('      case $line[1] in');

  for (const group of groupNames) {
    const groupActions = groupedActions(registry, group);
    const actions = groupActions.map((action) => escapeZshAlternative(action.action)).join(' ');
    lines.push(`        ${escapeZshCaseLabel(group)})`);
    lines.push('          case $line[2] in');
    for (const action of groupActions) {
      lines.push(`            ${escapeZshCaseLabel(action.action)})`);
      pushZshCommandArguments(lines, action.command, registry, 3, '              ', action.config);
      lines.push('              ;;');
    }
    lines.push('            *)');
    lines.push(`              _arguments ${escapeSingleQuotedShell(`2:${group} action:(${actions})`)}`);
    lines.push('              ;;');
    lines.push('          esac');
    lines.push('          ;;');
  }

  for (const cmd of commandNames.filter((command) => !SPECIAL_COMPLETIONS[command] && !groupNameSet.has(command))) {
    lines.push(`        ${escapeZshCaseLabel(cmd)})`);
    pushZshCommandArguments(lines, cmd, registry, 2, '          ');
    lines.push('          ;;');
  }

  for (const [cmd, completion] of Object.entries(SPECIAL_COMPLETIONS)) {
    lines.push(`        ${escapeZshCaseLabel(cmd)})`);
    lines.push(
      `          _arguments "1:${escapeZshDescription(completion.description)}:(${completion.values.map(escapeZshWord).join(' ')})"`,
    );
    lines.push('          ;;');
  }

  lines.push('        explain)');
  lines.push('          _arguments "1:command:_spacemolt_explain_commands"');
  lines.push('          ;;');
  lines.push('        help)');
  lines.push('          _message "help topic"');
  lines.push('          ;;');
  lines.push('        commands)');
  lines.push('          _message "search query"');
  lines.push('          ;;');
  lines.push('        *)');
  lines.push('          _message "unknown command"');
  lines.push('          ;;');
  lines.push('      esac');
  lines.push('      ;;');
  lines.push('  esac');
  lines.push('}');
  lines.push('');
  lines.push('_spacemolt_commands() {');
  lines.push('  local commands');
  lines.push(
    `  commands=(${topCommands.map((c) => escapeZshDescribedWord(c, commandDescription(c, registry))).join(' ')})`,
  );
  lines.push('  _describe -t commands "spacemolt commands" commands');
  lines.push('}');
  lines.push('');
  lines.push('_spacemolt_explain_commands() {');
  lines.push('  local commands');
  lines.push(
    `  commands=(${explainCommandNames
      .map((c) => escapeZshDescribedWord(c, commandDescription(c, registry)))
      .join(' ')})`,
  );
  lines.push('  _describe -t commands "spacemolt commands" commands');
  lines.push('}');
  lines.push('');
  lines.push('_spacemolt');

  return `${lines.join('\n')}\n`;
}

function generateFishCompletion(registry: CompletionRegistry): string {
  const commandNames = commandsList(registry);
  const explainCommandNames = registryCommandNames(registry);
  const topCommands = topLevelCommandNames(registry);
  const groups = commandGroups(registry);
  const groupNames = Object.keys(groups).sort();
  const groupNameSet = new Set(groupNames);
  const lines: string[] = [];
  lines.push('# Fish completion for spacemolt');
  lines.push('# Install: spacemolt completion fish > ~/.config/fish/completions/spacemolt.fish');
  lines.push('');
  lines.push('function __spacemolt_dynamic_complete');
  lines.push('  set -l words (commandline -opc)');
  lines.push('  set -l current (commandline -ct)');
  lines.push("  if string match -qr '\\s$' -- (commandline)");
  lines.push('    set words $words ""');
  lines.push('  else if test -n "$current"');
  lines.push('    set words $words $current');
  lines.push('  end');
  lines.push('  spacemolt __complete fish -- $words 2>/dev/null');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_has_dynamic_complete');
  lines.push('  set -l dynamic_completions (__spacemolt_dynamic_complete)');
  lines.push('  test (count $dynamic_completions) -gt 0');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_no_dynamic_complete');
  lines.push('  not __spacemolt_has_dynamic_complete');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_static_command_words');
  lines.push('  set -l tokens (commandline -opc)');
  lines.push('  set -l current (commandline -ct)');
  lines.push(`  set -l value_options ${escapeFishArguments(fishValueGlobalOptionWords())}`);
  lines.push(`  set -l global_options ${escapeFishArguments(fishGlobalOptionWords())}`);
  lines.push('  set -l result');
  lines.push('  set -l skip_next 0');
  lines.push('  set -l last_index (count $tokens)');
  lines.push('  if test -n "$current"; and test $last_index -gt 0; and test "$tokens[$last_index]" = "$current"');
  lines.push('    set -e tokens[$last_index]');
  lines.push('  end');
  lines.push('  for token in $tokens');
  lines.push('    if test "$token" = "spacemolt"');
  lines.push('      continue');
  lines.push('    end');
  lines.push('    if test $skip_next -eq 1');
  lines.push('      set skip_next 0');
  lines.push('      continue');
  lines.push('    end');
  lines.push('    set -l option_name (string replace -r -- "=.*$" "" "$token")');
  lines.push('    if contains -- "$option_name" $value_options');
  lines.push('      if not string match -q -- "*=*" "$token"');
  lines.push('        set skip_next 1');
  lines.push('      end');
  lines.push('      continue');
  lines.push('    end');
  lines.push('    if contains -- "$option_name" $global_options');
  lines.push('      continue');
  lines.push('    end');
  lines.push('    if string match -q -- "-*" "$token"');
  lines.push('      continue');
  lines.push('    end');
  lines.push('    set -a result "$token"');
  lines.push('  end');
  lines.push('  printf "%s\\n" $result');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_completing_global_option_value');
  lines.push('  set -l tokens (commandline -opc)');
  lines.push('  set -l current (commandline -ct)');
  lines.push(`  set -l value_options ${escapeFishArguments(fishValueGlobalOptionWords())}`);
  lines.push('  set -l last_index (count $tokens)');
  lines.push('  if test -n "$current"; and string match -q -- "*=*" "$current"');
  lines.push('    set -l current_option_name (string replace -r -- "=.*$" "" "$current")');
  lines.push('    if contains -- "$current_option_name" $value_options');
  lines.push('      return 0');
  lines.push('    end');
  lines.push('  end');
  lines.push('  if test -n "$current"; and test $last_index -gt 0; and test "$tokens[$last_index]" = "$current"');
  lines.push('    set -e tokens[$last_index]');
  lines.push('  end');
  lines.push('  set -l previous_index (count $tokens)');
  lines.push('  if test $previous_index -lt 1');
  lines.push('    return 1');
  lines.push('  end');
  lines.push('  set -l previous "$tokens[$previous_index]"');
  lines.push('  set -l option_name (string replace -r -- "=.*$" "" "$previous")');
  lines.push('  contains -- "$option_name" $value_options; and not string match -q -- "*=*" "$previous"');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_seen_group_without_action');
  lines.push('  if __spacemolt_completing_global_option_value');
  lines.push('    return 1');
  lines.push('  end');
  lines.push('  set -l group $argv[1]');
  lines.push('  set -l words (__spacemolt_static_command_words)');
  lines.push('  test (count $words) -eq 1; and test "$words[1]" = "$group"');
  lines.push('end');
  lines.push('');
  lines.push('function __spacemolt_seen_nested_command');
  lines.push('  if __spacemolt_completing_global_option_value');
  lines.push('    return 1');
  lines.push('  end');
  lines.push('  set -l group $argv[1]');
  lines.push('  set -l action $argv[2]');
  lines.push('  set -l words (__spacemolt_static_command_words)');
  lines.push('  test (count $words) -ge 2; and test "$words[1]" = "$group"; and test "$words[2]" = "$action"');
  lines.push('end');
  lines.push('');
  lines.push('complete -c spacemolt -f -n "__spacemolt_has_dynamic_complete" -a "(__spacemolt_dynamic_complete)"');
  lines.push('');
  lines.push('# Global flags');
  for (const option of GLOBAL_COMPLETION_OPTIONS) {
    lines.push(generateFishGlobalOption(option));
  }
  lines.push('');
  lines.push('# Commands');
  for (const cmd of topCommands) {
    const desc = escapeDoubleQuotedShell(commandDescription(cmd, registry));
    lines.push(
      `complete -c spacemolt -n "${fishStaticFallbackCondition('__fish_use_subcommand')}" -a ${escapeFishArgument(cmd)} -d "${desc}"`,
    );
  }
  lines.push('');
  lines.push('# Command group actions');
  for (const group of groupNames) {
    for (const action of groupedActions(registry, group)) {
      const desc = escapeDoubleQuotedShell(action.config.description || action.action);
      lines.push(
        `complete -c spacemolt -n "${fishStaticFallbackCondition(`__spacemolt_seen_group_without_action ${escapeFishConditionWord(group)}`)}" -a ${escapeFishArgument(action.action)} -d "${desc}"`,
      );
    }
  }
  lines.push('');
  lines.push('# Command group action arguments');
  for (const group of groupNames) {
    for (const action of groupedActions(registry, group)) {
      const args = completionArgsForCommand(action.command, action.config);
      if (args.length === 0) continue;

      lines.push(`# ${group} ${action.action}`);
      for (const arg of args) {
        const desc =
          arg.kind === 'enum' && arg.values?.length ? `${arg.description} (${arg.values.join('|')})` : arg.description;

        if (arg.kind === 'enum' && arg.values?.length) {
          for (const val of arg.values) {
            const valueDesc = escapeDoubleQuotedShell(`${arg.description}: ${val}`);
            lines.push(
              `complete -c spacemolt -n "${fishStaticFallbackCondition(`__spacemolt_seen_nested_command ${escapeFishConditionWord(group)} ${escapeFishConditionWord(action.action)}`)}" -a ${escapeFishArgument(val)} -d "${valueDesc}"`,
            );
          }
        } else {
          lines.push(
            `complete -c spacemolt -n "${fishStaticFallbackCondition(`__spacemolt_seen_nested_command ${escapeFishConditionWord(group)} ${escapeFishConditionWord(action.action)}`)}" -a ${escapeFishArgument(arg.insert)} -d "${escapeDoubleQuotedShell(desc)}"`,
          );
        }
      }
      lines.push('');
    }
  }
  lines.push('# Per-command arguments');
  for (const cmd of commandNames.filter((command) => !SPECIAL_COMPLETIONS[command] && !groupNameSet.has(command))) {
    const args = completionArgsForCommand(cmd, allCommands(registry)[cmd]);
    if (args.length === 0) continue;

    lines.push(`# ${cmd}`);
    for (const arg of args) {
      const desc =
        arg.kind === 'enum' && arg.values?.length ? `${arg.description} (${arg.values.join('|')})` : arg.description;

      if (arg.kind === 'enum' && arg.values?.length) {
        for (const val of arg.values) {
          const valueDesc = escapeDoubleQuotedShell(`${arg.description}: ${val}`);
          lines.push(
            `complete -c spacemolt -n "${fishStaticFallbackCondition(`__fish_seen_subcommand_from ${escapeFishConditionWord(cmd)}`)}" -a ${escapeFishArgument(val)} -d "${valueDesc}"`,
          );
        }
      } else {
        lines.push(
          `complete -c spacemolt -n "${fishStaticFallbackCondition(`__fish_seen_subcommand_from ${escapeFishConditionWord(cmd)}`)}" -a ${escapeFishArgument(arg.insert)} -d "${escapeDoubleQuotedShell(desc)}"`,
        );
      }
    }
    lines.push('');
  }

  lines.push('# explain command');
  lines.push(
    `complete -c spacemolt -n "${fishStaticFallbackCondition('__fish_seen_subcommand_from explain')}" -a ${escapeFishArgumentList(explainCommandNames)} -d "command"`,
  );
  lines.push('');
  lines.push('# completion shell');
  for (const [cmd, completion] of Object.entries(SPECIAL_COMPLETIONS)) {
    lines.push(`# ${cmd}`);
    for (const value of completion.values) {
      lines.push(
        `complete -c spacemolt -n "${fishStaticFallbackCondition(`__fish_seen_subcommand_from ${escapeFishConditionWord(cmd)}`)}" -a ${escapeFishArgument(value)} -d "${escapeDoubleQuotedShell(`${completion.description}: ${value}`)}"`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function generateCompletion(shell: string, registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion(registry);
    case 'zsh':
      return generateZshCompletion(registry);
    case 'fish':
      return generateFishCompletion(registry);
    default:
      throw new Error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
  }
}
