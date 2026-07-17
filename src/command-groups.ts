import type { CommandConfig, LocalCommandConfig } from './commands.ts';

export const GROUPED_COMMANDS = [
  'citizenship',
  'facility',
  'faction',
  'fleet',
  'forum',
  'station',
  'storage',
  'trade',
] as const;

export type GroupedCommandName = (typeof GROUPED_COMMANDS)[number];

export interface CommandGroupAction {
  command: string;
  action: string;
  displayName: string;
  config: CommandConfig;
}

export interface NestedCommandGroup {
  name: GroupedCommandName;
  actions: Record<string, CommandGroupAction>;
}

export interface CommandGroupEntryConfig extends LocalCommandConfig {
  commandGroup: GroupedCommandName;
}

export type CommandGroups = Partial<Record<GroupedCommandName, NestedCommandGroup>>;

const GROUP_DESCRIPTIONS: Record<GroupedCommandName, string> = {
  citizenship: 'Run citizenship actions.',
  facility: 'Run facility actions.',
  faction: 'Run faction actions.',
  fleet: 'Run fleet actions.',
  forum: 'Run forum actions.',
  station: 'Run station administration actions.',
  storage: 'Run station and faction storage actions.',
  trade: 'Run player trade actions.',
};

export function groupedCommandParts(command: string): { group: GroupedCommandName; action: string } | undefined {
  for (const group of GROUPED_COMMANDS) {
    const prefix = `${group}_`;
    if (!command.startsWith(prefix)) continue;
    const action = command.slice(prefix.length);
    if (!action) return undefined;
    return { group, action };
  }
  return undefined;
}

export function groupActionCommandName(group: string, action: string): string {
  return `${group}_${action}`;
}

export function groupActionDisplayName(group: string, action: string): string {
  return `${group} ${action}`;
}

export function groupEntryConfig(group: GroupedCommandName): CommandGroupEntryConfig {
  return {
    commandGroup: group,
    usage: '<action> [args...]',
    description: GROUP_DESCRIPTIONS[group],
    category: 'Command groups',
    args: ['action'],
    required: ['action'],
  };
}

export function splitGroupedCommands(commands: Record<string, CommandConfig>): {
  commands: Record<string, CommandConfig>;
  commandGroups: CommandGroups;
  allGroupEntries: Record<GroupedCommandName, CommandGroupEntryConfig>;
} {
  const acceptedCommands: Record<string, CommandConfig> = {};
  const commandGroups: CommandGroups = {};
  const allGroupEntries = Object.fromEntries(
    GROUPED_COMMANDS.map((group) => [group, groupEntryConfig(group)]),
  ) as Record<GroupedCommandName, CommandGroupEntryConfig>;

  for (const [command, config] of Object.entries(commands)) {
    const parts = groupedCommandParts(command);
    if (!parts) {
      acceptedCommands[command] = config;
      continue;
    }
    const group = commandGroups[parts.group] ?? { name: parts.group, actions: {} };
    group.actions[parts.action] = {
      command,
      action: parts.action,
      displayName: groupActionDisplayName(parts.group, parts.action),
      config,
    };
    commandGroups[parts.group] = group;
  }

  return { commands: acceptedCommands, commandGroups, allGroupEntries };
}

export function commandGroupAction(
  commandGroups: CommandGroups | undefined,
  group: string | undefined,
  action: string | undefined,
): CommandGroupAction | undefined {
  if (!group || !action) return undefined;
  return commandGroups?.[group as GroupedCommandName]?.actions[action];
}

export function commandGroup(
  commandGroups: CommandGroups | undefined,
  group: string | undefined,
): NestedCommandGroup | undefined {
  if (!group) return undefined;
  return commandGroups?.[group as GroupedCommandName];
}
