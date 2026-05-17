import { getArgNames } from './args.ts';
import { COMMANDS } from './commands.ts';

const COMMANDS_LIST = Object.keys(COMMANDS).sort();

const HINT_VALUES: Record<string, Record<string, string>> = {
  set_colors: {
    primary_color: '<#hex>',
    secondary_color: '<#hex>',
  },
};

function getCommandArgNames(command: string): string[] {
  const config = COMMANDS[command];
  if (!config) return [];
  return getArgNames(config);
}

function getFieldSchema(command: string, arg: string) {
  const config = COMMANDS[command];
  if (!config?.schema) return undefined;
  const canonicalArg = config.aliases?.[arg] || arg;
  return config.schema[canonicalArg] || config.schema[arg];
}

function getEnumValues(command: string, arg: string): string[] | undefined {
  const schema = getFieldSchema(command, arg);
  if (schema?.enum?.length) return schema.enum;
  if (schema?.type === 'boolean') return ['true', 'false'];
  return undefined;
}

function getHintValue(command: string, arg: string): string | undefined {
  return HINT_VALUES[command]?.[arg];
}

function getArgDescription(command: string, arg: string): string {
  return getFieldSchema(command, arg)?.description || getHintValue(command, arg) || arg;
}

function escapeDoubleQuotedShell(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/`/g, '\\`');
}

function escapeZshMessage(value: string): string {
  return escapeDoubleQuotedShell(value).replace(/:/g, '\\:');
}

function generateBashCompletion(): string {
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
  lines.push('  local global_flags="--json -j --quiet -q --plain -p --fields -f --help -h --version -v"');
  lines.push('');
  lines.push('  # Top-level special commands');
  lines.push(`  local commands="${COMMANDS_LIST.join(' ')} commands explain help completion"`);
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

  for (const cmd of COMMANDS_LIST) {
    const args = getCommandArgNames(cmd);
    if (args.length === 0) continue;

    lines.push(`    ${cmd})`);
    const argParts: string[] = [];
    for (const arg of args) {
      const enums = getEnumValues(cmd, arg);
      if (enums && enums.length > 0) {
        argParts.push(`\${${arg}_values}`);
      } else {
        argParts.push(arg);
      }
    }
    // biome-ignore lint/suspicious/noTemplateCurlyInString: bash variable in generated script
    const allParts = [...argParts, '${global_flags}'];

    for (const arg of args) {
      const enums = getEnumValues(cmd, arg);
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
  lines.push(`      COMPREPLY=( $(compgen -W "${COMMANDS_LIST.join(' ')}" -- "$cur") )`);
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

function generateZshCompletion(): string {
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
  lines.push('    "(-j --json)"{-j,--json}"[Raw JSON response]" \\');
  lines.push('    "(-q --quiet)"{-q,--quiet}"[Suppress notifications]" \\');
  lines.push('    "(-p --plain)"{-p,--plain}"[No ANSI colors]" \\');
  lines.push(
    '    "(-f --fields)"{-f,--fields}"[Extract response fields]:fields:_values -s , fields key1 key2 key3" \\',
  );
  lines.push('    "(-h --help)"{-h,--help}"[Show help]" \\');
  lines.push('    "(-v --version)"{-v,--version}"[Show version]" \\');
  lines.push('    "1:command:_spacemolt_commands" \\');
  lines.push('    "*::arg:->args"');
  lines.push('');
  lines.push('  case $state in');
  lines.push('    args)');
  lines.push('      case $line[1] in');

  for (const cmd of COMMANDS_LIST) {
    const args = getCommandArgNames(cmd);
    lines.push(`        ${cmd})`);
    if (args.length > 0) {
      lines.push('          _arguments \\');
      for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (!arg) continue;
        const enums = getEnumValues(cmd, arg);
        const hint = getHintValue(cmd, arg);
        const description = escapeZshMessage(getArgDescription(cmd, arg));
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
  lines.push(`  commands=(${COMMANDS_LIST.map((c) => `${c}[${COMMANDS[c]?.description || c}]`).join(' ')})`);
  lines.push('  _describe -t commands "spacemolt commands" commands');
  lines.push('}');
  lines.push('');
  lines.push('_spacemolt');

  return `${lines.join('\n')}\n`;
}

function generateFishCompletion(): string {
  const lines: string[] = [];
  lines.push('# Fish completion for spacemolt');
  lines.push('# Install: spacemolt completion fish > ~/.config/fish/completions/spacemolt.fish');
  lines.push('');
  lines.push('# Global flags');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s j -l json -d "Raw JSON response"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s q -l quiet -d "Suppress notifications"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s p -l plain -d "No ANSI colors"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s f -l fields -d "Extract response fields"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s h -l help -d "Show help"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -s v -l version -d "Show version"');
  lines.push('');
  lines.push('# Commands');
  for (const cmd of COMMANDS_LIST) {
    const desc = escapeDoubleQuotedShell(COMMANDS[cmd]?.description || cmd);
    lines.push(`complete -c spacemolt -n "__fish_use_subcommand" -a ${cmd} -d "${desc}"`);
  }
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a commands -d "Search local commands"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a explain -d "Explain a command"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a help -d "Show help for a group"');
  lines.push('complete -c spacemolt -n "__fish_use_subcommand" -a completion -d "Generate shell completion"');
  lines.push('');
  lines.push('# Per-command arguments');
  for (const cmd of COMMANDS_LIST) {
    const args = getCommandArgNames(cmd);
    if (args.length === 0) continue;

    lines.push(`# ${cmd}`);
    for (const arg of args) {
      const enums = getEnumValues(cmd, arg);
      const description = getArgDescription(cmd, arg);
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
    `complete -c spacemolt -n "__fish_seen_subcommand_from explain" -a "${COMMANDS_LIST.join(' ')}" -d "command"`,
  );
  lines.push('');
  lines.push('# completion shell');
  lines.push('complete -c spacemolt -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "shell"');

  return `${lines.join('\n')}\n`;
}

export function generateCompletion(shell: string): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'fish':
      return generateFishCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}. Use bash, zsh, or fish.`);
  }
}
