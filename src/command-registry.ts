import { buildDynamicCommands } from './dynamic-commands.ts';
import { GENERATED_API_ROUTES } from './generated/api-commands.ts';
import type { GeneratedApiRoute } from './openapi-metadata.ts';
import {
  COMMAND_OVERRIDES,
  LOCAL_COMMANDS,
  buildCuratedCommands,
  routeSignature,
  type CommandConfig,
  type LocalCommandConfig,
  type V2Route,
} from './commands.ts';

export interface CommandRegistrySnapshot {
  commands: Record<string, CommandConfig>;
  localCommands: Record<string, LocalCommandConfig>;
  allCommands: Record<string, CommandConfig | LocalCommandConfig>;
  apiRoutes: Record<string, V2Route>;
  generatedRoutes: Record<string, GeneratedApiRoute>;
}

export function buildCommandRegistrySnapshot(options?: {
  generatedRoutes?: Record<string, GeneratedApiRoute>;
  includeDynamic?: boolean;
}): CommandRegistrySnapshot {
  const generatedRoutes = options?.generatedRoutes || (GENERATED_API_ROUTES as Record<string, GeneratedApiRoute>);
  const curated = buildCuratedCommands(COMMAND_OVERRIDES, generatedRoutes);
  const curatedCommandNames = new Set(Object.keys(curated));
  const curatedRouteSignatures = new Set(Object.values(curated).map((config) => routeSignature(config.route)));
  const dynamic =
    options?.includeDynamic === false
      ? {}
      : buildDynamicCommands(generatedRoutes, curatedCommandNames, curatedRouteSignatures);
  const commands = {
    ...dynamic,
    ...curated,
  };
  const allCommands = {
    ...commands,
    ...LOCAL_COMMANDS,
  };
  const apiRoutes = Object.fromEntries(Object.entries(commands).map(([command, config]) => [command, config.route]));

  return {
    commands,
    localCommands: LOCAL_COMMANDS,
    allCommands,
    apiRoutes,
    generatedRoutes,
  };
}

export const BUNDLED_COMMAND_REGISTRY = buildCommandRegistrySnapshot({ includeDynamic: false });
