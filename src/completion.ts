import { getArgNames } from './args.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import { GLOBAL_COMPLETION_OPTIONS, globalOptionWords, type CompletionOption } from './completion-metadata.ts';
import type { CommandConfig, LocalCommandConfig } from './commands.ts';

type CompletionRegistry = Pick<CommandRegistrySnapshot, 'allCommands'>;
type CompletionCommandMap = Record<string, CommandConfig | LocalCommandConfig>;

const HINT_VALUES: Record<string, Record<string, string>> = {
  set_colors: {
    primary_color: '<#hex>',
    secondary_color: '<#hex>',
  },
};

function allCommands(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): CompletionCommandMap {
  return registry.allCommands;
}

function commandsList(registry: CompletionRegistry = BUNDLED_COMMAND_REGISTRY): string[] {
  return Object.keys(registry.allCommands).sort();
}

function getCommandArgNames(command: string, registry: CompletionRegistry): string[] {
  const config = allCommands(registry)[command];
  if (!config) return [];
  return getArgNames(config);
}

function getFieldSchema(command: string, arg: string, registry: CompletionRegistry) {
  const config = allCommands(registry)[command];
  if (!config || !('schema' in config) || !config.schema) return undefined;
  const canonicalArg = config.aliases?.[arg] || arg;
  return config.schema[canonicalArg] || config.schema[arg];
}

function getEnumValues(command: string, arg: string, registry: CompletionRegistry): string[] | undefined {
  const schema = getFieldSchema(command, arg, registry);
  if (schema?.enum?.length) return schema.enum;
  if (schema?.type === 'boolean') return ['true', 'false'];
  return undefined;
}

function getHintValue(command: string, arg: string): string | undefined {
  return HINT_VALUES[command]?.[arg];
}

function getArgDescription(command: string, arg: string, registry: CompletionRegistry): string {
  return getFieldSchema(command, arg, registry)?.description || getHintValue(command, arg) || arg;
}

function escapeDoubleQuotedShell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

function escapeZshMessage(value: string): string {
  return escapeDoubleQuotedShell(value).replace(/:/g, '\\:');
}

function generateZshGlobalOption(option: CompletionOption): string {
  const words = [option.short, option.long].filter(Boolean) as string[];
  const escapedDescription = escapeZshMessage(option.description);
  const valueCompletion = option.takesValue && option.values?.length
    ? `:${option.long?.replace(/^--/, '') || 'value'}:(${option.values.join(' ')})`
    : option.takesValue
      ? `:${option.long?.replace(/^--/, '') || 'value'}:`
      : '';

  if (option.short && option.long) {
    return `    "(${words.join(' ')})"{${option.short},${option.long}}"[${escapedDescription}]${valueCompletion}" \\`;
  }

  const word = option.long || option.short;
  return `    "${word}[${escapedDescription}]${valueCompletion}" \\`;
}

function generateFishGlobalOption(option: CompletionOption): string {
  const parts = ['complete -c spacemolt -n "__fish_use_subcommand"'];
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
    parts.push(`-a "${option.values.map(escapeDoubleQuotedShell).join(' ')}"`);
  }
  parts.push(`-d "${escapeDoubleQuotedShell(option.description)}"`);
  return parts.join(' ');
}

function generateBashCompletion(registry: CompletionRegistry): string {
  const commandNames = commandsList(registry);
  const globalFlags = globalOptionWords().join(' ');
  const lines: string[] = [];
  lines.push('# Bash completion for spacemolt');
  lines.push('# Install: spacemolt completion bash > /etc/bash_completion.d/spacemolt');
  lines.push('# Or:      spacemolt completion bash >> ~/.bashrc');
  lines.push('');
  lines.push('_spacemolt() {');
  lines.push('  local cur prev words cword');
  lines.push('  _init_completion || return');
  lines.push('');
  lines.push('  # Global flags');
  lines.push(`  local global_flags="${globalFlags}"`);
  lines.push('');
  lines.push('  # Top-level special commands');
  lines.push(`  local commands="${commandNames.join(' ')} commands explain help completion"`);
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
  lines.push('  case "$cmd" in');

  for (const cmd of commandNames) {
    const args = getCommandArgNames(cmd, registry);
    if (args.length === 0) continue;

    lines.push(`    ${cmd})`);
    const argParts: string[] = [];
    for (const arg of args) {
      const enums = getEnumValues(cmd, arg, registry);
      if (enums && enums.length > 0) {
        argParts.push(`\${${arg}_values}`);
      } else {
        argParts.push(arg);
      }
    }
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
    const allParts = [...argParts, '${global_flags}'];

    for (const arg of args) {
      const enums = getEnumValues(cmd, arg, registry);
      if (enums && enums.length > 0) {
        lines.push(`      local ${arg}_values="${enums.join(' ')}"`);
      }
    }
    lines.push(`      COMPREPLY=( $(compgen -W "${allParts.join(' ')}" -- "$cur") )`);
    lines.push('      ;;');
  }

  lines.push('    commands)');
  lines.push('      ;;');
  lines.push('    explain)');
  lines.push(`      COMPREPLY=( $(compgen -W "${commandNames.join(' ')}" -- "$cur") )`);
  lines.push('      ;;');
  lines.push('    help)');
  lines.push('      ;;');
  lines.push('    completion)');
  lines.push('      COMPREPLY=( $(compgen -W "bash zsh fish" -- "$cur") )');
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
  const commands = allCommands(registry);
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
  lines.push('  typeset -A opt_args');
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

  for (const cmd of commandNames) {
    const args = getCommandArgNames(cmd, registry);
    lines.push(`        ${cmd})`);
    if (args.length > 0) {
      lines.push('          _arguments \\');
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        const enums = getEnumValues(cmd, arg, registry);
        const hint = getHintValue(cmd, arg);
        const description = escapeZshMessage(getArgDescription(cmd, arg, registry));
        const isLast = i === args.length - 1;
        const terminator = isLast ? '' : ' \\';

        if (enums && enums.length > 0) {
          const valuesStr = enums.map((v) => `${v}[${v}]`).join(' ');
          lines.push(`            "${i + 2}:${description}:(${valuesStr})"${terminator}`);
        } else if (hint) {
          lines.push(`            "${i + 2}:${description}:${hint}"${terminator}`);
        } else {
          lines.push(`            "${i + 2}:${description}:${arg}"${terminator}`);
        }
      }
    } else {
      lines.push('          _message "no arguments"');
    }
    lines.push('          ;;');
  }

  lines.push('        explain)');
  lines.push('          _arguments "1:command:_spacemolt_commands"');
  lines.push('          ;;');
  lines.push('        completion)');
  lines.push('          _arguments "1:shell:(bash zsh fish)"');
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
  lines.push(`  commands=(${commandNames.map((c) => `${c}[${commands[c]?.description || c}]`).join(' ')})`);
  lines.push('  _describe -t commands "spacemolt commands" commands');
  lines.push('}');
  lines.push('');
  lines.push('_spacemolt');

  return `${lines.join('\n')}\n`;
}

function generateFishCompletion(registry: CompletionRegistry): string {
  const commandNames = commandsList(registry);
  const commands = allCommands(registry);
  const lines: string[] = [];
  lines.push('# Fish completion for spacemolt');
  lines.push('# Install: spacemolt completion fish > ~/.config/fish/completions/spacemolt.fish');
  lines.push('');
  lines.push('# Global flags');
  for (const option of GLOBAL_COMPLETION_OPTIONS) {
    lines.push(generateFishGlobalOption(option));
  }
  lines.push('');
  lines.push('# Commands');
  for (const cmd of commandNames) {
    const desc = escapeDoubleQuotedShell(commands[cmd]?.description || cmd);
    lines.push(`complete -c spacemolt -n "__fish_use_subcommand" -a ${cmd} -d "${desc}"`);
  }
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a commands -d "Search local commands"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a explain -d "Explain a command"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a help -d "Show help for a group"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a completion -d "Generate shell completion"');
  lines.push('');
  lines.push('# Per-command arguments');
  for (const cmd of commandNames) {
    const args = getCommandArgNames(cmd, registry);
    if (args.length === 0) continue;

    lines.push(`# ${cmd}`);
    for (const arg of args) {
      const enums = getEnumValues(cmd, arg, registry);
      const description = getArgDescription(cmd, arg, registry);
      const desc = enums && enums.length > 0 ? `${description} (${enums.join('|')})` : description;

      if (enums && enums.length > 0) {
        for (const val of enums) {
          const valueDesc = escapeDoubleQuotedShell(`${description}: ${val}`);
          lines.push(`complete -c spacemolt -n "__fish_seen_subcommand_from ${cmd}" -a ${val} -d "${valueDesc}"`);
        }
      } else {
        lines.push(
          `complete -c spacemolt -n "__fish_seen_subcommand_from ${cmd}" -a ${arg} -d "${escapeDoubleQuotedShell(desc)}"`,
        );
      }
    }
    lines.push('');
  }

  lines.push('# explain command');
  lines.push(
    `complete -c spacemolt -n "__fish_seen_subcommand_from explain" -a "${commandNames.join(' ')}" -d "command"`,
  );
  lines.push('');
  lines.push('# completion shell');
  lines.push('complete -c spacemolt -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "shell"');

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
