import { type CommandGroupEntryConfig, type CommandGroups, splitGroupedCommands } from './command-groups.ts';
import {
  buildCuratedCommands,
  COMMAND_OVERRIDES,
  type CommandConfig,
  LOCAL_COMMANDS,
  type LocalCommandConfig,
  routeSignature,
  type V2Route,
} from './commands.ts';
import { buildDynamicCommands } from './dynamic-commands.ts';
import { GENERATED_API_ROUTES } from './generated/api-commands.ts';
import type { GeneratedApiRoute } from './openapi-metadata.ts';

export interface CommandRegistrySnapshot {
  commands: Record<string, CommandConfig>;
  commandGroups: CommandGroups;
  localCommands: Record<string, LocalCommandConfig>;
  allCommands: Record<string, CommandConfig | LocalCommandConfig | CommandGroupEntryConfig>;
  apiRoutes: Record<string, V2Route>;
  generatedRoutes: Record<string, GeneratedApiRoute>;
}

export function commandRegistryApiCommands(
  snapshot: Pick<CommandRegistrySnapshot, 'commands' | 'commandGroups'>,
): CommandConfig[] {
  return [
    ...Object.values(snapshot.commands),
    ...Object.values(snapshot.commandGroups).flatMap((group) =>
      Object.values(group?.actions ?? {}).map((action) => action.config),
    ),
  ];
}

export function buildCommandRegistrySnapshot(options?: {
  generatedRoutes?: Record<string, GeneratedApiRoute>;
  dynamicGeneratedRoutes?: Record<string, GeneratedApiRoute>;
  includeDynamic?: boolean;
}): CommandRegistrySnapshot {
  const generatedRoutes = options?.generatedRoutes || (GENERATED_API_ROUTES as Record<string, GeneratedApiRoute>);
  const dynamicGeneratedRoutes = options?.dynamicGeneratedRoutes || generatedRoutes;
  const curated = buildCuratedCommands(COMMAND_OVERRIDES, generatedRoutes);
  const curatedCommandNames = new Set(Object.keys(curated));
  const curatedRouteSignatures = new Set(Object.values(curated).map((config) => routeSignature(config.route)));
  const dynamic =
    options?.includeDynamic === false
      ? {}
      : buildDynamicCommands(dynamicGeneratedRoutes, curatedCommandNames, curatedRouteSignatures);
  const flatCommands = {
    ...dynamic,
    ...curated,
  };
  const grouped = splitGroupedCommands(flatCommands);
  const commands = grouped.commands;
  const allCommands = {
    ...commands,
    ...grouped.allGroupEntries,
    ...LOCAL_COMMANDS,
  };
  const apiRoutes = Object.fromEntries(Object.entries(commands).map(([command, config]) => [command, config.route]));

  return {
    commands,
    commandGroups: grouped.commandGroups,
    localCommands: LOCAL_COMMANDS,
    allCommands,
    apiRoutes,
    generatedRoutes,
  };
}

export const BUNDLED_COMMAND_REGISTRY = buildCommandRegistrySnapshot({ includeDynamic: false });
