import { execute } from './api.ts';
import { getArgNames } from './args.ts';
import type { CliRuntimeContext, CliWriter } from './cli-context.ts';
import { commandGroup, groupedCommandParts, type CommandGroupEntryConfig } from './command-groups.ts';
import { BUNDLED_COMMAND_REGISTRY, type CommandRegistrySnapshot } from './command-registry.ts';
import { type CommandConfig, type LocalCommandConfig, routeToPath } from './commands.ts';
import { getErrorSuggestion, isAuthError, isRetryableError } from './errors.ts';
import { printCachedIdSuggestions } from './id-cache.ts';
import { colorsForPlain } from './output-style.ts';
import { getStructuredResult, isRecord } from './response.ts';
import { VERSION } from './runtime.ts';
import { loadSession } from './session.ts';
import type { APIResponse, CommandGroup, CommandSearchMatch, GlobalOptions, Session } from './types.ts';

const COMMAND_GROUPS: CommandGroup[] = [
  { key: 'auth', label: 'Authentication', aliases: ['authentication', 'login'], categories: ['Authentication'] },
  { key: 'nav', label: 'Navigation', aliases: ['navigation', 'travel', 'map'], categories: ['Navigation'] },
  {
    key: 'market',
    label: 'Market / Exchange',
    aliases: ['exchange', 'trade', 'trading'],
    categories: ['Trading', 'Exchange'],
  },
  { key: 'storage', label: 'Storage', aliases: ['cargo', 'station'], categories: ['Cargo', 'Station storage'] },
  { key: 'combat', label: 'Combat / Battle', aliases: ['battle'], categories: ['Combat', 'Battle'] },
  {
    key: 'ship',
    label: 'Ships',
    aliases: ['ships', 'shipyard'],
    categories: ['Ship management', 'Shipyard', 'Ship Exchange'],
  },
  {
    key: 'faction',
    label: 'Faction',
    aliases: ['factions'],
    categories: ['Factions', 'Faction rooms', 'Faction missions & intel'],
  },
  { key: 'fleet', label: 'Fleet', aliases: ['fleets'], categories: ['Fleet'] },
  { key: 'facility', label: 'Facilities', aliases: ['facilities'], categories: ['Facilities'] },
  {
    key: 'social',
    label: 'Social',
    aliases: ['chat', 'forum'],
    categories: [
      'Chat - rest captures remaining args as content',
      "Captain's log",
      'Forum',
      'Notes',
      'Player settings',
    ],
  },
  {
    key: 'info',
    label: 'Information',
    aliases: ['query', 'queries', 'reference'],
    categories: ['Query commands', 'Reference & Help', 'V2 state commands'],
  },
  {
    key: 'misc',
    label: 'Other',
    aliases: ['other'],
    categories: [
      'Mining',
      'Wrecks',
      'Insurance',
      'Crafting',
      'Missions',
      'Drones',
      'Salvage & Tow',
      'Citizenship',
      'Agent logging',
      'Petition (empire messages)',
      'P2P Trading',
    ],
  },
];

const COMMAND_GROUP_INCLUDES: Record<string, string[]> = {
  storage: ['jettison', 'loot_wreck', 'salvage_wreck'],
  faction: [
    'faction_build',
    'faction_facility_build',
    'faction_facility_list',
    'faction_facility_owned',
    'faction_facility_upgrade',
  ],
};

export function printJsonResponse(response: APIResponse, compact = false, writer?: CliWriter): void {
  const out = writer?.out.bind(writer) ?? console.log;
  out(JSON.stringify(response, null, compact ? 0 : 2));
}

export function printJsonError(code: string, message: string, writer?: CliWriter): void {
  printJsonResponse({ error: { code, message } }, false, writer);
}

function out(writer?: CliWriter): (message?: string) => void {
  return writer?.out.bind(writer) ?? console.log;
}

function err(writer?: CliWriter): (message?: string) => void {
  return writer?.err.bind(writer) ?? console.error;
}

type CommandHelpConfig = CommandConfig | LocalCommandConfig | CommandGroupEntryConfig;
type CommandHelpMap = Record<string, CommandHelpConfig>;
type CommandHelpSource = CommandHelpMap | Partial<Pick<CommandRegistrySnapshot, 'allCommands' | 'commandGroups'>>;

function isRegistryHelpSource(source: CommandHelpSource | undefined): source is Partial<
  Pick<CommandRegistrySnapshot, 'allCommands' | 'commandGroups'>
> {
  return Boolean(source && ('allCommands' in source || 'commandGroups' in source));
}

function commandHelpGroups(source?: CommandHelpSource): CommandRegistrySnapshot['commandGroups'] | undefined {
  if (!source) return BUNDLED_COMMAND_REGISTRY.commandGroups;
  return isRegistryHelpSource(source) ? source.commandGroups : undefined;
}

function groupedCommandDisplayNames(
  commandGroups: CommandRegistrySnapshot['commandGroups'] | undefined,
): Record<string, string> {
  const displayNames: Record<string, string> = {};
  for (const group of Object.values(commandGroups ?? {})) {
    for (const action of Object.values(group?.actions ?? {})) {
      displayNames[action.command] = action.displayName;
    }
  }
  return displayNames;
}

function translateGroupedCommand(command: string, displayNames: Record<string, string>): string {
  const direct = displayNames[command];
  if (direct) return direct;
  const parts = groupedCommandParts(command);
  if (!parts) return command;
  return displayNames[`${parts.group}_${parts.action}`] ?? command;
}

function translateGroupedExample(example: string | undefined, displayNames: Record<string, string>): string | undefined {
  if (!example) return undefined;
  let translated = example;
  for (const [flatCommand, displayName] of Object.entries(displayNames)) {
    translated = translated.replaceAll(`spacemolt ${flatCommand}`, `spacemolt ${displayName}`);
  }
  return translated;
}

function displayGroupedActionConfig(
  config: CommandConfig,
  displayNames: Record<string, string>,
): CommandConfig {
  return {
    ...config,
    example: translateGroupedExample(config.example, displayNames),
    discoverWith: config.discoverWith?.map((command) => translateGroupedCommand(command, displayNames)),
    seeAlso: config.seeAlso?.map((command) => translateGroupedCommand(command, displayNames)),
  };
}

function commandHelpMap(source?: CommandHelpSource): CommandHelpMap {
  const commandGroups = commandHelpGroups(source);
  const baseCommands = !source
    ? BUNDLED_COMMAND_REGISTRY.allCommands
    : isRegistryHelpSource(source)
      ? source.allCommands ?? {}
      : source;
  const commands: CommandHelpMap = { ...baseCommands };
  const groupedDisplayNames = groupedCommandDisplayNames(commandGroups);
  for (const group of Object.values(commandGroups ?? {})) {
    for (const action of Object.values(group?.actions ?? {})) {
      commands[action.displayName] = displayGroupedActionConfig(action.config, groupedDisplayNames);
    }
  }
  return commands;
}

function structuredPayloadFields(command: string, config: CommandConfig | LocalCommandConfig): string[] {
  const fields =
    'schema' in config && config.schema
      ? Object.entries(config.schema)
          .filter(([, schema]) => schema.type === 'array' || schema.type === 'object')
          .map(([field]) => field)
      : [];
  if (command === 'storage' && !fields.includes('items')) fields.push('items');
  return fields;
}

function structuredPayloadExample(command: string, field: string): string {
  const value = field === 'items' ? '[{"item_id":"ore_iron","quantity":1}]' : field.endsWith('s') ? '[]' : '{}';
  return `spacemolt ${command} --payload-json '{"${field}":${value}}'`;
}

export function getUsageHint(command: string, commands?: CommandHelpSource): string {
  const config = commandHelpMap(commands)[command];
  if (config?.usage !== undefined) return config.usage;
  return hasNoArgs(config) ? '' : '<args...>';
}

export function getUsageLine(command: string, commands?: CommandHelpSource): string {
  return `spacemolt ${command} ${getUsageHint(command, commands)}`.trimEnd();
}

export function hasCommandHelpTarget(command: string, commands?: CommandHelpSource): boolean {
  return Boolean(commandHelpMap(commands)[command]);
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
    }
    for (let j = 0; j < previous.length; j++) previous[j] = current[j] ?? 0;
  }

  return previous[b.length] ?? 0;
}

export function suggestCommands(command: string, limit = 3, commands?: CommandHelpSource): string[] {
  if (!command) return [];
  const normalized = command.toLowerCase();
  const allCommands = commandHelpMap(commands);
  return Object.keys(allCommands)
    .map((candidate) => {
      const distance = levenshtein(normalized, candidate);
      const prefixScore = candidate.startsWith(normalized) || normalized.startsWith(candidate) ? -2 : 0;
      return { candidate, score: distance + prefixScore };
    })
    .filter(({ candidate, score }) => score <= Math.max(2, Math.floor(Math.max(command.length, candidate.length) / 3)))
    .sort((a, b) => a.score - b.score || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function normalizeHelpTopic(topic: string): string {
  return topic.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function commandMatchesCategories(command: string, categories: Set<string>, commands: CommandHelpMap): boolean {
  const category = commands[command]?.category;
  return Boolean(category && categories.has(category));
}

function commandMatchesGroup(command: string, group: CommandGroup, commands: CommandHelpMap): boolean {
  const categories = new Set(group.categories);
  return (
    commandMatchesCategories(command, categories, commands) ||
    (COMMAND_GROUP_INCLUDES[group.key] || []).includes(command)
  );
}

function hasNoArgs(config: CommandConfig | LocalCommandConfig | undefined): boolean {
  return Boolean(
    config && (!config.args || config.args.length === 0) && (!config.required || config.required.length === 0),
  );
}

export function findCommandGroup(topic: string): CommandGroup | undefined {
  const normalized = normalizeHelpTopic(topic);
  return COMMAND_GROUPS.find(
    (group) =>
      normalizeHelpTopic(group.key) === normalized ||
      normalizeHelpTopic(group.label) === normalized ||
      group.aliases.some((alias) => normalizeHelpTopic(alias) === normalized),
  );
}

export function hasCommandGroup(topic: string): boolean {
  return Boolean(findCommandGroup(topic));
}

function formatCommandSummary(command: string, commands: CommandHelpMap): string {
  const usage = getUsageHint(command, commands);
  const description = commands[command]?.description;
  const usageText = usage ? ` ${usage}` : '';
  return isWeakDescription(command, description) ? `${command}${usageText}` : `${command}${usageText} - ${description}`;
}

function isWeakDescription(command: string, description: string | undefined): boolean {
  if (!description) return true;
  return normalizeCommandSummaryText(description) === normalizeCommandSummaryText(command);
}

function executableGroupLabel(groupName: string): string {
  return findCommandGroup(groupName)?.label ?? groupName;
}

function normalizeCommandSummaryText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

type HelpOutputOptions = Partial<Pick<GlobalOptions, 'plain' | 'quiet'>>;

export function showCommandGroups(writer?: CliWriter, commands?: CommandHelpSource, options?: HelpOutputOptions): void {
  const allCommands = commandHelpMap(commands);
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));
  write(`\n${c.bright}Command Groups${c.reset}`);
  for (const group of COMMAND_GROUPS) {
    const count = Object.keys(allCommands).filter((command) => commandMatchesGroup(command, group, allCommands)).length;
    write(`  ${group.key.padEnd(10)} ${group.label} (${count})`);
  }
  write(`\nRun "spacemolt help <group>" to list commands in a group.`);
  write(`Run "spacemolt commands --search <query>" to search local command metadata.`);
}

export function showCommandGroup(
  topic: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): boolean {
  const executableGroup = commandGroup(commandHelpGroups(commands), topic);
  const allCommands = commandHelpMap(commands);
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));

  if (executableGroup) {
    const actions = Object.values(executableGroup.actions).sort((a, b) => a.action.localeCompare(b.action));
    write(`\n${c.bright}${executableGroupLabel(executableGroup.name)} Commands${c.reset}`);
    for (const action of actions) write(`  ${formatCommandSummary(action.displayName, allCommands)}`);
    write(`\nRun "spacemolt help ${executableGroup.name} <action>" for argument details.`);
    return true;
  }

  const group = findCommandGroup(topic);
  if (!group) return false;

  const matchingCommands = Object.keys(allCommands)
    .filter((command) => commandMatchesGroup(command, group, allCommands))
    .sort((a, b) => {
      const categoryCompare = (allCommands[a]?.category || '').localeCompare(allCommands[b]?.category || '');
      return categoryCompare || a.localeCompare(b);
    });

  write(`\n${c.bright}${group.label} Commands${c.reset}`);
  let lastCategory = '';
  for (const command of matchingCommands) {
    const includedInGroup = (COMMAND_GROUP_INCLUDES[group.key] || []).includes(command);
    const category =
      includedInGroup && group.key === 'faction' ? 'Faction facilities' : allCommands[command]?.category || 'Other';
    if (category !== lastCategory) {
      lastCategory = category;
      write(`\n${c.cyan}${category}:${c.reset}`);
    }
    write(`  ${formatCommandSummary(command, allCommands)}`);
  }
  write(`\nRun "spacemolt help <command>" for argument details and related commands.`);
  return true;
}

function searchLocalCommands(query: string, limit = 30, commands?: CommandHelpSource): string[] {
  const allCommands = commandHelpMap(commands);
  const normalized = query.trim().toLowerCase();
  if (!normalized) return Object.keys(allCommands).sort();

  const terms = normalized.split(/\s+/).filter(Boolean);
  const matches: CommandSearchMatch[] = [];
  for (const command of Object.keys(allCommands)) {
    const config = allCommands[command];
    const commandText = command.toLowerCase();
    const categoryText = (config?.category || '').toLowerCase();
    const descriptionText = (config?.description || '').toLowerCase();
    const usageText = (config?.usage || '').toLowerCase();
    const exampleText = (config?.example || '').toLowerCase();
    const relatedText = [...(config?.discoverWith || []), ...(config?.seeAlso || [])].join(' ').toLowerCase();
    const routeText =
      config && 'route' in config
        ? [config.route.tool, config.route.action, config.route.method].filter(Boolean).join(' ').toLowerCase()
        : '';
    const argText = config ? getArgNames(config).join(' ').toLowerCase() : '';
    let score = 0;
    for (const term of terms) {
      if (commandText === term) score += 120;
      else if (commandText.startsWith(term)) score += 70;
      else if (commandText.split('_').includes(term)) score += 55;
      else if (commandText.includes(term)) score += 35;

      if (descriptionText.includes(term)) score += 35;
      if (categoryText.includes(term)) score += 50;
      if (exampleText.includes(term)) score += 30;
      if (usageText.includes(term)) score += 20;
      if (argText.includes(term)) score += 15;
      if (routeText.includes(term)) score += 15;
      if (relatedText.includes(term)) score += 10;
    }
    if (terms.length > 1 && terms.every((term) => descriptionText.includes(term))) score += 100;
    if (score > 0 && config?.description && !isWeakDescription(command, config.description)) score += 8;
    if (score > 0 && config?.example) score += 6;
    if (score > 0) matches.push({ command, score });
  }

  return matches
    .sort((a, b) => b.score - a.score || a.command.localeCompare(b.command))
    .slice(0, limit)
    .map(({ command }) => command);
}

export function parseCommandSearchQuery(args: string[]): string {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] || '';
    if (arg === '--search' || arg === '-s')
      return args
        .slice(i + 1)
        .join(' ')
        .trim();
    if (arg.startsWith('--search=')) return arg.slice('--search='.length).trim();
    if (arg.startsWith('search=')) return arg.slice('search='.length).trim();
  }
  return args.join(' ').trim();
}

function formatServerHelpTopicCommand(query: string): string {
  const trimmed = query.trim();
  return trimmed ? `spacemolt server-help '${trimmed.replace(/'/g, "'\\''")}'` : 'spacemolt server-help';
}

export function showCommandSearch(
  query: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): void {
  const allCommands = commandHelpMap(commands);
  const results = searchLocalCommands(query, 30, allCommands);
  const title = query ? `Commands matching "${query}"` : 'All Commands';
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));
  write(`\n${c.bright}${title}${c.reset}`);
  if (!results.length) {
    write('  (No local command matches)');
    const suggestions = suggestCommands(query, 5, allCommands);
    if (suggestions.length > 0) write(`\nDid you mean: ${suggestions.join(', ')}`);
    if (query.trim()) write(`\nFor live server help, run: ${formatServerHelpTopicCommand(query)}`);
    return;
  }
  for (const command of results) write(`  ${formatCommandSummary(command, allCommands)}`);
  if (results.length === 30) write(`\nShowing first 30 matches. Use a narrower search term for fewer results.`);
  if (query.trim()) write(`\nFor live server help, run: ${formatServerHelpTopicCommand(query)}`);
}

export function showCommandExplanation(
  command: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): boolean {
  const allCommands = commandHelpMap(commands);
  const config = allCommands[command];
  if (!config) return false;
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));

  showCommandHelp(command, writer, allCommands, options);
  write(`\n${c.bright}Category:${c.reset} ${config.category || 'Uncategorized'}`);
  if ('route' in config) {
    const routePath = routeToPath(config.route, { includeApiPrefix: true });
    write(`${c.bright}API route: ${config.route.method || 'POST'} ${routePath}${c.reset}`);
  } else {
    write(`${c.bright}Type:${c.reset} local helper command`);
  }
  if (config.aliases && Object.keys(config.aliases).length > 0) {
    write(`${c.bright}CLI aliases:${c.reset}`);
    for (const [from, to] of Object.entries(config.aliases)) write(`  ${from} -> ${to}`);
  }
  if ('route' in config && config.route.defaults && Object.keys(config.route.defaults).length > 0) {
    write(`${c.bright}Default payload fields:${c.reset}`);
    for (const [key, value] of Object.entries(config.route.defaults)) write(`  ${key}=${value}`);
  }
  return true;
}

export function showCommandHelp(
  command: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): boolean {
  const allCommands = commandHelpMap(commands);
  const config = allCommands[command];
  if (!config) return false;
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));

  write(`\n${c.bright}${command}${c.reset}`);
  if (config.description) write(config.description);
  write(`\n${c.bright}Usage:${c.reset}`);
  write(`  ${getUsageLine(command, allCommands)}`);

  const argNames = getArgNames(config);
  if (argNames.length > 0) {
    write(`\n${c.bright}Arguments:${c.reset}`);
    write(`  ${argNames.join(', ')}`);
    write(`\n${c.bright}Accepted forms:${c.reset}`);
    write(`  ${getUsageLine(command, allCommands)}`);
    write(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
    write(`  spacemolt ${command} ${argNames.map((arg) => `--${arg.replace(/_/g, '-')} ...`).join(' ')}`);
  }

  if (config.aliases && Object.keys(config.aliases).length > 0) {
    write(`\n${c.bright}CLI aliases:${c.reset}`);
    for (const [from, to] of Object.entries(config.aliases)) write(`  ${from} -> ${to}`);
  }
  if ('schema' in config && config.schema && Object.keys(config.schema).length > 0) {
    write(`\n${c.bright}Fields:${c.reset}`);
    for (const [field, schema] of Object.entries(config.schema)) {
      const values = schema.enum?.length ? ` (${schema.enum.join('|')})` : '';
      const description = schema.description ? ` - ${schema.description}` : '';
      write(`  ${field}${values}${description}`);
    }
    const structuredFields = structuredPayloadFields(command, config);
    if (structuredFields.length > 0) {
      write(`\n${c.bright}Structured payloads:${c.reset}`);
      write(`  Use --payload-json for array/object fields: ${structuredFields.join(', ')}.`);
      write(`  ${structuredPayloadExample(command, structuredFields[0] as string)}`);
    }
  }

  if ('route' in config && config.route.defaults && Object.keys(config.route.defaults).length > 0) {
    write(`\n${c.bright}Default payload fields:${c.reset}`);
    for (const [key, value] of Object.entries(config.route.defaults)) write(`  ${key}=${value}`);
  }

  if ('route' in config) {
    write(`\n${c.bright}Server help:${c.reset}`);
    write(`  spacemolt server-help ${command}`);
  }

  if (config.example) {
    write(`\n${c.bright}Example:${c.reset}`);
    write(`  ${config.example}`);
  }
  if (config.discoverWith?.length) {
    write(`\n${c.bright}Discover valid IDs/state with:${c.reset}`);
    for (const related of config.discoverWith) write(`  spacemolt ${related}`);
  }
  if (config.seeAlso?.length) {
    write(`\n${c.bright}See also:${c.reset} ${config.seeAlso.join(', ')}`);
  }
  return true;
}

function printNextSteps(command: string, missingArg?: string, writer?: CliWriter, options?: HelpOutputOptions): void {
  const config = BUNDLED_COMMAND_REGISTRY.allCommands[command];
  const colors = colorsForPlain(Boolean(options?.plain));
  const steps: string[] = [];
  for (const related of config?.discoverWith || []) steps.push(`spacemolt ${related}`);
  if (!steps.includes('spacemolt get_status')) steps.push('spacemolt get_status');
  if (command !== 'get_commands' && !steps.includes('spacemolt get_commands')) steps.push('spacemolt get_commands');

  const reason = missingArg && config?.discoverWith?.length ? ` to find a valid ${missingArg}` : '';
  err(writer)(
    `\n${colors.cyan}Next:${colors.reset} run ${steps
      .slice(0, 3)
      .map((step) => `"${step}"`)
      .join(' or ')}${reason}.`,
  );
}

export function displayUnknownCommand(command: string, writer?: CliWriter, options?: { plain?: boolean }): void {
  const writeErr = err(writer);
  const colors = colorsForPlain(Boolean(options?.plain));
  writeErr(`${colors.red}Error:${colors.reset} Unknown command "${command}"`);

  const group = findCommandGroup(command);
  if (group) {
    writeErr(`"${command}" is a help group. Try: spacemolt help ${group.key}`);
    writeErr(`Search commands: spacemolt commands --search ${command}`);
    return;
  }

  const suggestions = suggestCommands(command);
  if (suggestions.length > 0) writeErr(`Did you mean: ${suggestions.join(', ')}`);
  writeErr(`\nRun "spacemolt --help" for the local command overview.`);
  writeErr(`Run "spacemolt commands --search ${command}" to search local command metadata.`);
  writeErr(`Run "spacemolt get_commands" for the server command list once connected.`);
}

export function displayMissingArgument(
  command: string,
  missingArg: string,
  writer?: CliWriter,
  commands?: CommandHelpSource,
  options?: HelpOutputOptions,
): void {
  const allCommands = commandHelpMap(commands);
  const writeErr = err(writer);
  const colors = colorsForPlain(Boolean(options?.plain));
  writeErr(
    `${colors.red}Error:${colors.reset} Missing required argument: ${colors.yellow}${missingArg}${colors.reset}`,
  );
  writeErr(`\n${colors.bright}Usage:${colors.reset}`);
  writeErr(`  ${getUsageLine(command, allCommands)}`);

  const config = allCommands[command];
  const argNames = config ? getArgNames(config) : [];
  if (argNames.length > 0) {
    writeErr(`\n${colors.bright}Accepted forms:${colors.reset}`);
    writeErr(`  ${getUsageLine(command, allCommands)}`);
    writeErr(`  spacemolt ${command} ${argNames.map((arg) => `${arg}=...`).join(' ')}`);
    writeErr(`  spacemolt ${command} ${argNames.map((arg) => `--${arg.replace(/_/g, '-')} ...`).join(' ')}`);
  }

  const example = config?.example;
  if (example) writeErr(`\n${colors.bright}Example:${colors.reset}\n  ${example}`);
  printCachedIdSuggestions(command, missingArg, undefined, writer, options);
  printNextSteps(command, missingArg, writer, options);
}

// =============================================================================
// Progressive Help
// =============================================================================

export interface PlayerState {
  authenticated: boolean;
  docked?: boolean;
  traveling?: boolean;
  atAsteroidBelt?: boolean;
  escapePod?: boolean;
}

async function getPlayerState(): Promise<PlayerState> {
  let session: Session | null;
  try {
    session = await loadSession();
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('No default profile set.')) {
      return { authenticated: false };
    }
    throw err;
  }
  if (!session?.player_id) return { authenticated: false };

  try {
    const response = await execute('get_status');
    const structured = getStructuredResult(response);
    const data =
      structured && isRecord(structured) ? structured : isRecord(response.result) ? response.result : undefined;
    if (!data) return { authenticated: true };

    const player = isRecord(data.player) ? data.player : undefined;
    const ship = isRecord(data.ship) ? data.ship : undefined;
    const poi = isRecord(data.poi) ? data.poi : undefined;
    const location = isRecord(data.location) ? data.location : undefined;

    const docked = Boolean(player?.docked_at_base) || Boolean(location?.docked_at);
    const traveling = data.travel_progress !== undefined;
    const poiType = String(poi?.type || location?.poi_type || '').toLowerCase();
    const poiName = String(poi?.name || location?.poi_name || '').toLowerCase();
    const atAsteroidBelt = poiType.includes('asteroid') || poiName.includes('asteroid') || poiName.includes('belt');
    const escapePod = (ship?.class_id as string) === 'escape_pod';

    return { authenticated: true, docked, traveling, atAsteroidBelt, escapePod };
  } catch {
    return { authenticated: true };
  }
}

function printStateSection(state: PlayerState, writer?: CliWriter, options?: HelpOutputOptions): void {
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));
  if (!state.authenticated) {
    write(`${c.bright}Start:${c.reset}`);
    write(`  1. Get a registration code from https://spacemolt.com/dashboard`);
    write(`  2. spacemolt register <username> <empire> <registration_code>`);
    write(`  3. spacemolt login <username> <password>`);
    return;
  }

  if (state.escapePod) {
    write(`${c.yellow}You are in an Escape Pod.${c.reset} Get to a station and acquire a ship.`);
  }

  write(`${c.bright}Suggested Next Steps:${c.reset}`);

  if (state.traveling) {
    write(`  ${c.cyan}[TRAVELING]${c.reset}`);
    write(`    spacemolt get_status          # Check travel progress`);
    write(`    — Travel resolves on the next tick (~10s per tick)`);
    write(`    — Long routes can take many ticks; get_status shows % complete`);
    return;
  }

  if (state.docked) {
    write(`  ${c.cyan}[DOCKED]${c.reset}`);
    write(`    spacemolt view_market         # Check market prices`);
    write(`    spacemolt refuel              # Refuel ship`);
    write(`    spacemolt repair              # Repair hull damage`);
    write(`    spacemolt storage view        # Access station storage`);
    write(`    spacemolt sale_ship           # Buy ships`);
    write(`    spacemolt facility_list       # Check base facilities`);
    write(`    spacemolt undock              # Leave station when ready`);
    return;
  }

  if (state.atAsteroidBelt) {
    write(`  ${c.cyan}[ASTEROID BELT]${c.reset}`);
    write(`    spacemolt mine                # Mine resources`);
    write(`    spacemolt get_poi             # See belt resources remaining`);
    write(`    spacemolt get_cargo           # Check what you've mined`);
    write(`    spacemolt travel <station>    # Return to station to sell`);
    return;
  }

  write(`  ${c.cyan}[IN SPACE]${c.reset}`);
  write(`    spacemolt get_system          # See POIs and connections`);
  write(`    spacemolt travel <poi_id>     # Move to a POI`);
  write(`    spacemolt get_status          # Check ship and location`);
}

export async function showProgressiveHelp(writer?: CliWriter, options?: HelpOutputOptions): Promise<void> {
  renderProgressiveHelp(await getPlayerState(), writer, options);
}

export function renderProgressiveHelp(state: PlayerState, writer?: CliWriter, options?: HelpOutputOptions): void {
  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));

  write(`
${c.bright}SpaceMolt CLI v${VERSION}${c.reset}
HTTP client for the SpaceMolt MMO.`);

  printStateSection(state, writer, options);

  if (state.authenticated) {
    write(`
${c.bright}Useful Commands:${c.reset}`);
  } else {
    write(`
${c.bright}Once logged in, try:${c.reset}`);
  }
  write(`  get_status       Ship, player, location`);
  write(`  get_system       POIs and connected systems`);
  write(`  get_cargo        Cargo contents`);
  write(`  view_market      Market/order book`);
  write(`  facility_list    Facilities at current base`);
  write(`  catalog <type>   Browse ships/items/skills/recipes`);

  write(`
${c.bright}Command Discovery:${c.reset}
  spacemolt help <command>        Local usage, args, route
  spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info
  spacemolt commands --search fuel
  spacemolt help all              Full local command reference
  spacemolt help command=<name>   Local command help
${cacheHelpSections(options)}

${c.bright}Arguments:${c.reset}
  Positional:       spacemolt travel sol_asteroid_belt
  key=value:        spacemolt travel target_poi=sol_asteroid_belt
  CLI flags:        spacemolt travel --target-poi sol_asteroid_belt
                    spacemolt sell --item-id ore_iron --quantity=50

${c.bright}Global Flags:${c.reset}
  --json, -j        Full API response as JSON; same as --format=json for successful output
  --quiet, -q       Suppress extra messages
  --plain, -p       No ANSI colors
  --field           Extract one response field, or comma-separated fields
  --fields, -f      Extract response fields
  --format, -fmt    Output format: table (default), json, yaml, text (alias for table)
  --compact         Compact JSON output (JSON only)
  --structured      Output structuredContent only (for automation)
  --no-timestamp    Suppress timestamps on output
  --watch, -w       Re-run command on interval (seconds, default 10)
  --jq              Extract with path syntax (.key, .key[], .key[0].field)
  --fuzzy           Auto-resolve simple --jq paths to similar keys
  --keys [path]     List available keys at a JSON dotpath
  --search          Search structured output keys and values
  --search-keys     Search structured output keys only
  --search-values   Search structured output scalar values only
  --search-regex    Regex search structured output keys and values
  --profile <name>  Use named session
  --dry-run         Preview supported mutations without executing them
  --debug           Print verbose diagnostics for this command

${c.bright}Output Precedence:${c.reset}
  --keys and --jq are mutually exclusive; projections run before --json/--format; --compact and --plain apply last.
  Projections read from structuredContent when present.
  Search projections print jq paths and values.
  --field/--fields output only the selected projection, even with --json/--format=json.
`);
}

// =============================================================================
// Help
// =============================================================================

function cacheHelpSections(options?: HelpOutputOptions): string {
  const c = colorsForPlain(Boolean(options?.plain));
  return `
${c.bright}Live server help:${c.reset}
  spacemolt server-help [topic]    Live gameserver help for an action, category, or keyword

${c.bright}Dynamic API Cache:${c.reset}
  spacemolt sync-api              Refresh cached OpenAPI command metadata
  Cached v2 routes appear in help, command search, completion, and dispatch.

${c.bright}ID Cache:${c.reset}
  Discovery commands like get_system, get_cargo, view_market, get_nearby, and list_ships save useful IDs.
  spacemolt ids <kind> [--search text]  Show or filter cached poi/system/item/player/ship/faction/drone/wreck/facility/listing IDs
  spacemolt where-can-i <item>          Search cached item sightings`;
}

export function showHelp(writer?: CliWriter, options?: HelpOutputOptions): void {
  const c = colorsForPlain(Boolean(options?.plain));
  out(writer)(`
${c.bright}SpaceMolt CLI v${VERSION}${c.reset}
HTTP client for the SpaceMolt MMO.

${c.bright}Start:${c.reset}
  spacemolt register <username> <empire> <registration_code>
  spacemolt login <username> <password>
  spacemolt get_status

${c.bright}Common Loop:${c.reset}
  spacemolt undock
  spacemolt get_system
  spacemolt travel <poi_id>
  spacemolt mine
  spacemolt get_cargo
  spacemolt travel <station_poi_id>
  spacemolt dock
  spacemolt sell <item_id> <quantity>

${c.bright}Useful Commands:${c.reset}
  get_status       Ship, player, location
  get_system       POIs and connected systems
  get_cargo        Cargo contents
  view_market      Market/order book
  facility_list    Facilities at current base
  catalog <type>   Browse ships/items/skills/recipes

${c.bright}Command Discovery:${c.reset}
  spacemolt help <command>        Local usage, args, route
  spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info
  spacemolt commands --search fuel
  spacemolt help all              Full local command reference
  spacemolt help command=<name>   Local command help
${cacheHelpSections(options)}

${c.bright}Arguments:${c.reset}
  Positional:       spacemolt travel sol_asteroid_belt
  key=value:        spacemolt travel target_poi=sol_asteroid_belt
  CLI flags:        spacemolt travel --target-poi sol_asteroid_belt
                    spacemolt sell --item-id ore_iron --quantity=50

${c.bright}Global Flags:${c.reset}
  --json, -j        Full API response as JSON; same as --format=json for successful output
  --quiet, -q       Suppress extra messages
  --plain, -p       No ANSI colors
  --field           Extract one response field, or comma-separated fields
  --fields, -f      Extract response fields
  --format, -fmt    Output format: table (default), json, yaml, text (alias for table)
  --compact         Compact JSON output (JSON only)
  --structured      Output structuredContent only (for automation)
  --no-timestamp    Suppress timestamps on output
  --watch, -w       Re-run command on interval (seconds, default 10)
  --jq              Extract with path syntax (.key, .key[], .key[0].field)
  --fuzzy           Auto-resolve simple --jq paths to similar keys
  --keys [path]     List available keys at a JSON dotpath
  --search          Search structured output keys and values
  --search-keys     Search structured output keys only
  --search-values   Search structured output scalar values only
  --search-regex    Regex search structured output keys and values
  --profile <name>  Use named session
  --dry-run         Preview supported mutations without executing them
  --debug           Print verbose diagnostics for this command

${c.bright}Output Precedence:${c.reset}
  --keys and --jq are mutually exclusive; projections run before --json/--format; --compact and --plain apply last.
  Projections read from structuredContent when present.
  Search projections print jq paths and values.
  --field/--fields output only the selected projection, even with --json/--format=json.
`);
}

function showGeneratedCommandReference(
  commands: CommandHelpMap,
  writer?: CliWriter,
  options?: HelpOutputOptions,
): void {
  const bundledCommands = BUNDLED_COMMAND_REGISTRY.allCommands;
  const generatedCommands = Object.entries(commands)
    .filter(([command]) => !bundledCommands[command])
    .sort(([a], [b]) => a.localeCompare(b));
  if (generatedCommands.length === 0) return;

  const write = out(writer);
  const c = colorsForPlain(Boolean(options?.plain));
  write(`\n${c.bright}Generated API Commands:${c.reset}`);
  for (const [command] of generatedCommands) write(`  ${formatCommandSummary(command, commands)}`);
}

export function showFullHelp(writer?: CliWriter, commands?: CommandHelpSource, options?: HelpOutputOptions): void {
  const allCommands = commandHelpMap(commands);
  const c = colorsForPlain(Boolean(options?.plain));
  out(writer)(`
${c.bright}SpaceMolt CLI Client v${VERSION}${c.reset}
A command-line client for the SpaceMolt MMO.

${c.bright}Quick Start:${c.reset}
  ${c.cyan}# New player - get registration code from spacemolt.com/dashboard, then:${c.reset}
  spacemolt register myname solarian YOUR_REGISTRATION_CODE

  ${c.cyan}# Login (session persists, only needed once per 30 min):${c.reset}
  spacemolt login myname <password>

  ${c.cyan}# Basic gameplay loop:${c.reset}
  spacemolt get_status                  # See your ship/location
  spacemolt undock                      # Leave station
  spacemolt get_system                  # See POIs to travel to
  spacemolt travel sol_asteroid_belt    # Go to asteroid belt
  spacemolt mine                        # Mine resources
  spacemolt get_cargo                   # Check what you mined
  spacemolt travel sol_earth            # Return to station
  spacemolt dock                        # Enter station
  spacemolt sell ore_iron 50            # Sell 50 iron ore

${c.bright}Usage:${c.reset}
   spacemolt <command> [args...]
   spacemolt --json <command> [args...]
   spacemolt --quiet <command> [args...]
   spacemolt --plain <command> [args...]
   spacemolt --field key1.key2[,key3] <command> [args...]
   spacemolt --fields key1,key2.key3 <command> [args...]
   spacemolt --profile <name> <command> [args...]

   Arguments can be positional, key=value, --flag value, or --flag=value:
     spacemolt travel sol_asteroid_belt
     spacemolt travel target_poi=sol_asteroid_belt
     spacemolt travel --target-poi sol_asteroid_belt

    Output modes:
      --json, -j          Full API response as JSON; same as --format=json for successful output
      --quiet, -q         Suppress notifications and info messages
      --plain, -p         No ANSI colors
      --raw               Allow unknown command fields to pass through
      --field             Extract one response field, or comma-separated fields
      --fields, -f        Extract specific fields from response
      --format, -fmt <f>  Output format: table (default), json, yaml, text (alias for table)
      --compact           Compact JSON output (JSON only)
      --structured        Output structuredContent only (for automation)
      --no-timestamp      Suppress timestamps on output
      --watch, -w <secs>  Re-run command on interval (default 10s)
      --jq <expr>         Extract with path syntax (.key, .key[], .key[0].field)
      --fuzzy             Auto-resolve simple --jq paths to similar keys
      --keys [path]       List available keys at a JSON dotpath
      --search <text>      Search structured output keys and values
      --search-keys <text> Search structured output keys only
      --search-values <t>  Search structured output scalar values only
      --search-regex <rx>  Regex search structured output keys and values
      --profile           Use named session profile
      --dry-run           Preview supported mutations without executing them
      --allow-unknown     Allow unknown command fields to pass through
      --debug             Print verbose diagnostics for this command

    Output precedence:
      --keys and --jq are mutually exclusive; projections run before --json/--format; --compact and --plain apply last.
      Projections read from structuredContent when present.
      Search projections print jq paths and values.
      --field/--fields output only the selected projection, even with --json/--format=json.
      JSON errors remain full response envelopes for compatibility.

    Local command discovery:
     spacemolt help <command>        Local usage, args, route
     spacemolt help <group>          Groups: nav, market, storage, combat, ship, facility, faction, info
     spacemolt commands --search fuel
     spacemolt help all              Full local command reference
     spacemolt help command=<name>   Local command help
${cacheHelpSections(options)}

${c.bright}Information Commands (unlimited):${c.reset}
  get_status          Your player, ship, location
  get_system          Current system's POIs and connections
  get_poi             Current POI details and resources
  get_base            Base info (when docked)
  get_ship            Detailed ship info with modules
  get_cargo           Cargo contents
  get_nearby          Other players at your POI
  get_skills          Your skill levels and XP
  get_wrecks          Wrecks at POI (for looting)
  get_map             Galaxy map (all systems)
  get_empire_info     Empire policy snapshots
  get_tax_estimate    Preview taxes owed
  get_notifications   Poll queued game events
  get_battle_status   Current battle state
  list_drones         Drones in your ship bay and deployed nearby
  fleet_status        Current fleet membership and members
  facility_list       Facilities at your current base
  catalog <type>      Browse ships/items/skills/recipes
  get_guide [guide]   Game guide and onboarding info
  help                Local command help and discovery
  get_commands        Structured command list (for automation)

${c.bright}Action Commands (1 per tick, ~10 seconds):${c.reset}
  Actions execute on the next tick (~10 seconds). The response
  blocks until the result is ready and returns it directly.

  ${c.cyan}Navigation:${c.reset}
    travel <poi_id>           Travel within system
    jump <system|bearing>     Jump lane or Pathfinder bearing
    dock                      Enter station
    undock                    Leave station

  ${c.cyan}Mining & Trading:${c.reset}
    mine                      Mine at asteroid belt
    sell <item_id> <qty>      Sell to NPC market
    buy <item_id> [qty]       Buy from market
    refuel [fuel_cell_id]     Refuel at station to full or use fuel cells
    repair                    Repair at station

  ${c.cyan}Combat:${c.reset}
    attack <player_id>        Attack player at POI
    scan <player_id>          Scan player for info
    cloak true/false          Toggle cloaking

  ${c.cyan}Battle:${c.reset}
    battle_engage             Join or start a battle
    battle_advance            Advance battle range
    battle_retreat            Retreat from battle
    battle_stance <stance>    Set stance (fire/evade/brace/flee)
    battle_target <target>    Focus a battle target
    reload <weapon> <ammo>    Reload weapon with ammo

  ${c.cyan}Drones:${c.reset}
    load_drone <item_id>      Load a drone from cargo
    deploy_drone <drone_id>   Deploy a loaded drone
    recall_drone [drone_id]   Recall one drone, or all=true
    upload_drone <id> <code>  Upload DroneLang script

  ${c.cyan}Salvage & Tow:${c.reset}
    tow_wreck <wreck_id>      Tow a wreck
    release_tow               Release towed wreck
    scrap_wreck               Scrap towed wreck for materials
    sell_wreck                Sell towed wreck at station

  ${c.cyan}Shipyard:${c.reset}
    commission_ship <class>   Order a custom ship build
    commission_quote <class>  Get build quote
    commission_status         Check build progress
    cancel_commission <id>    Cancel active commission
    scrap_ship <ship_id>      Permanently destroy a stored ship

  ${c.cyan}Ship Exchange:${c.reset}
    list_ship_for_sale        List a stored ship for sale
    browse_ships              Browse ships for sale at station
    buy_listed_ship <id>      Buy a player-listed ship
    cancel_ship_listing <id>  Cancel your ship listing

  ${c.cyan}Insurance:${c.reset}
    buy_insurance <ticks>     Purchase ship insurance
    get_insurance_quote       Get insurance pricing
    claim_insurance           File insurance claim
    view_insurance            View active policies

  ${c.cyan}Fleet & Facilities:${c.reset}
    create_fleet              Create a fleet
    fleet_invite <player>     Invite a player
    fleet_accept              Accept a fleet invite
    fleet_leave               Leave your fleet
    fleet_disband             Disband your fleet
    facility_list             List all facilities at current base
    facility_owned            List your facilities across all stations
    facility_types [category]  Browse facility types (use category=faction, infrastructure, etc.)
    facility_build <type>     Build a facility
    facility_upgrade <type>   Upgrade a player facility
    facility_job_add <facility> <recipe> <qty>  Queue production work
    facility_job_list <facility>               List facility production jobs
    facility_job_cancel <job|job_ids=JSON>     Cancel queued production
    facility_job_reorder <job> <pos>           Reorder queued production
    facility_set_access <facility> <public|private>  Open or close rental access
    facility_set_output_price <facility> <item> <price>  Set renter output pricing
    facility_list_for_sale <id> <price>  List a facility for sale
    facility_browse_for_sale             Browse facility listings
    facility_buy_listing <id>            Buy a listed facility
    facility_cancel_listing <id>         Cancel a facility listing
    faction_facility_list     List faction facilities at current base
    faction_facility_owned    List faction facilities across all stations
    faction_build <type>      Build a faction facility
    faction_facility_build <type>  Build a faction facility
    faction_facility_upgrade <type>  Upgrade a faction facility

  ${c.cyan}Citizenship:${c.reset}
    citizenship_list [empire]       View citizenship applications
    citizenship_apply <empire>      Apply for citizenship
    citizenship_renounce <empire>   Renounce citizenship
    citizenship_withdraw <empire>   Withdraw application

  ${c.cyan}Storage:${c.reset}
    storage view [station_id] [target=self|faction] [--items item_id,item_id] [--search text]
    storage deposit <item_id> <qty> [target=self|faction|player] [source=cargo|storage|faction]
    storage withdraw <item_id> <qty> [source=storage|faction] [target=self]
    storage loot [wreck_id] [item_id] [quantity]
    storage jettison <item_id> <qty>
    jettison <item_id> <qty>     Standalone cargo jettison
    loot_wreck <wreck_id> <item_id> [quantity]  Standalone wreck loot
    salvage_wreck <wreck_id>     Standalone wreck salvage
    faction_deposit_credits <amount>  Wallet -> faction treasury
    faction_withdraw_credits <amount> Faction treasury -> wallet (requires manage_treasury)

  ${c.cyan}Market / Exchange:${c.reset}
    view_market [item_id] [category]  Order book (use item_id for depth, category for filter)
    subscribe_market                  Snapshot order book, then receive market_update notifications
    unsubscribe_market                Stop live market updates
    view_orders [station_id]          Your orders at station
    create_sell_order <item> <qty> <price>  List items for sale
    create_buy_order <item> <qty> <price>   Place a buy offer
    cancel_order <order_id|all>       Cancel order (or 'all')
    modify_order <order_id> <price>   Update order price
    estimate_purchase <item> <qty>     Preview buy cost without executing
    analyze_market                     Trading insights at current station
    faction_create_sell_order <item> <qty> <price>  Faction sell (from faction storage)
    faction_create_buy_order <item> <qty> <price>   Faction buy (to faction storage)

  ${c.cyan}Faction:${c.reset}
    faction_info [faction_id]         Your faction (or specific faction)
    faction_list                      All factions
    create_faction <name> <tag>       Start a faction
    join_faction <faction_id>         Join via invite
    leave_faction                     Leave your faction
    faction_edit [description=.. charter=.. primary_color=.. secondary_color=..]
    faction_invite <player>           Invite player (requires invite permission)
    faction_kick <player>             Kick member (requires kick permission)
    faction_promote <player> <role>   Promote/demote (recruit/member/officer/leader)
    faction_propose_ally <faction_id>  Propose alliance
    faction_accept_ally <faction_id>  Accept alliance proposal
    faction_set_enemy <faction_id>     Mark as enemy
    faction_remove_ally <faction_id>  Remove ally
    faction_remove_enemy <faction_id>  Remove enemy
    faction_declare_war <faction_id> [reason=..]  Declare war
    faction_propose_peace <faction_id> [terms=..]  Offer peace
    faction_accept_peace <faction_id>  Accept peace
    faction_create_role <name> <priority> [permissions=..]  Custom role
    faction_edit_role <role_id> [name=.. permissions=..]  Edit role
    faction_delete_role <role_id>      Delete custom role
    faction_rooms                      List common space rooms
    faction_visit_room <room_id>      Visit a room
    faction_write_room <room_id>       Create/edit room
    faction_delete_room <room_id>      Delete room
    faction_get_invites                Pending invites
    faction_decline_invite <faction_id>  Decline invite
    faction_post_mission <title> <description> <type> <objectives> <rewards>
    faction_cancel_mission <template_id>  Cancel faction mission
    faction_list_missions              Faction missions at current station

  ${c.cyan}Faction Intel & Trade:${c.reset}
    faction_submit_intel <systems>     Submit system data (JSON array)
    faction_query_intel [system_name=.. system_id=.. poi_type=.. resource_type=..]
    faction_intel_status               Intel coverage stats
    faction_submit_trade_intel <stations>  Report market prices
    faction_query_trade_intel [base_id=.. item_id=.. station_name=..]
    faction_trade_intel_status         Trade intel coverage stats

  ${c.cyan}Social:${c.reset}
    chat <channel> <message>  Send chat (local/system/faction)
    petition <empire_id> <message>  Send message to empire leadership (1/hr rate limit)
    captains_log_list               View journal entries
    captains_log_add <entry>        Add journal entry
    captains_log_get <index>        Read entry (0=newest)
    captains_log_delete <index>     Delete entry

${c.bright}Empires:${c.reset} solarian, voidborn, crimson, nebula, outerrim

${c.bright}Tips for LLM Agents:${c.reset}
   - Always run 'get_status' first to understand your situation
   - Use 'get_system' to see where you can travel
   - Check 'get_cargo' before selling
    - Use 'help <command>' for local CLI usage, args, and route details
    - Use 'help <group>' or 'commands --search <query>' for local command discovery
   - Use 'spacemolt completion bash' (or zsh/fish) to set up tab completion
   - Use '--profile <name>' to isolate named player sessions
   - Use 'SPACEMOLT_PROFILE=<name>' when scripts share one named session
   - Use 'profile default <name>' to save the default named session
   - Use 'help command=<command>' for local command details
   - Actions return results directly — no polling needed
   - Auto-dock/undock handles dock state automatically
   - Your session auto-renews; credentials are saved in sessions/<profile>.json
   - Speak English in all chat and forum messages
    - Use '--keys [path]' to inspect available structured response keys before writing projections
    - Use '--field key.path' for one value, '--field key1,key2', or '--jq .array[0].field' / '.array[].field' for extraction
    - Use '--fields key1,key2' to extract specific values from structured responses
    - Choose '--format json|yaml|text' after selecting fields or jq projections
    - Use '--watch 10' for live-refresh status monitoring

${c.bright}Environment Variables:${c.reset}
   SPACEMOLT_URL       API URL (default: https://game.spacemolt.com/api/v2)
   SPACEMOLT_PROFILE   Named session profile (overridden by --profile)
   SPACEMOLT_OUTPUT    Set to json for full API response JSON
   DEBUG=true          Show verbose request/response logging

${c.bright}API Routing:${c.reset}
  - The client uses v2 exclusively
  - Commands route to /api/v2/{tool}/{action}
  - get_guide routes through v2 spacemolt endpoints; help is local

${c.bright}Documentation:${c.reset}
  API Reference: https://game.spacemolt.com/api/v2/openapi.json
  Game Website:  https://www.spacemolt.com
`);
  showGeneratedCommandReference(allCommands, writer, options);
}

// =============================================================================
// Error Display
// =============================================================================

export function displayError(
  command: string,
  error: {
    code?: unknown;
    message?: unknown;
    detail?: unknown;
    error?: unknown;
    wait_seconds?: unknown;
    retry_after?: unknown;
  },
  options?: { noTimestamp?: boolean; context?: CliRuntimeContext },
): void {
  const writer = options?.context?.writer;
  const out = writer?.out.bind(writer) ?? console.log;
  const err = writer?.err.bind(writer) ?? console.error;
  const quiet = options?.context?.output?.quiet ?? options?.context?.config?.quiet ?? false;
  const plain = options?.context?.output?.plain ?? options?.context?.config?.plain ?? false;
  const colors = colorsForPlain(Boolean(plain));
  if (!quiet && !options?.noTimestamp) {
    out(`${colors.dim}[${(options?.context?.clock.now() ?? new Date()).toISOString()}]${colors.reset}`);
  }
  const code = typeof error.code === 'string' && error.code.trim() ? error.code : 'api_error';
  const message =
    typeof error.message === 'string' && error.message.trim()
      ? error.message
      : typeof error.detail === 'string' && error.detail.trim()
        ? error.detail
        : typeof error.error === 'string' && error.error.trim()
          ? error.error
          : 'The API returned an error without details.';
  const retryAfter =
    typeof error.retry_after === 'number' && Number.isFinite(error.retry_after)
      ? error.retry_after
      : typeof error.wait_seconds === 'number' && Number.isFinite(error.wait_seconds)
        ? error.wait_seconds
        : undefined;
  const hasServerCode = typeof error.code === 'string' && error.code.trim() !== '';

  err(`${colors.red}Error [${code}]:${colors.reset} ${message}`);
  if (retryAfter !== undefined) {
    err(`${colors.yellow}Wait ${retryAfter.toFixed(1)} seconds before retrying.${colors.reset}`);
  }
  if (!quiet) {
    const help = hasServerCode ? getErrorSuggestion(code) : undefined;
    if (help) err(`\n${colors.cyan}Suggestion:${colors.reset} ${help}`);
    if (hasServerCode && isRetryableError(code) && retryAfter === undefined) {
      err(`${colors.dim}This error may be retryable.${colors.reset}`);
    }
    if (hasServerCode && isAuthError(code)) {
      err(`${colors.yellow}This is an authentication error. Run "spacemolt login" if retries fail.${colors.reset}`);
    }
    if (BUNDLED_COMMAND_REGISTRY.allCommands[command]) {
      printNextSteps(command, undefined, writer, { plain });
    }
  }
}
