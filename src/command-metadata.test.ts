import { describe, expect, test } from 'bun:test';
import {
  convertPayloadTypes,
  getArgNames,
  normalizeParsedPayload,
  parseArgs,
  validatePayloadAgainstSchema,
} from './args';
import type { GroupedCommandName } from './command-groups';
import { BATTLE_SHIPYARD_COMMAND_OVERRIDES } from './command-overrides-battle-shipyard';
import { COMMERCE_FACILITY_COMMAND_OVERRIDES } from './command-overrides-commerce-facility';
import { CORE_COMMAND_OVERRIDES } from './command-overrides-core';
import { FACTION_SOCIAL_COMMAND_OVERRIDES } from './command-overrides-faction-social';
import { QUERY_REFERENCE_COMMAND_OVERRIDES } from './command-overrides-query-reference';
import {
  BUNDLED_COMMAND_REGISTRY,
  buildCommandRegistrySnapshot,
  CURATED_COMMAND_REGISTRY,
  commandRegistryApiCommands,
} from './command-registry';
import {
  ALLOWED_COMMAND_OVERRIDE_FIELDS,
  COMMAND_OVERRIDES,
  COMMANDS,
  type CommandArg,
  type CommandConfig,
  LOCAL_COMMANDS,
} from './commands';
import { generateCompletion } from './completion';
import { completionArgsForCommand } from './completion-metadata';
import { GENERATED_API_ROUTES, type GeneratedApiRoute } from './generated/api-commands';
import { showCommandHelp, showFullHelp } from './help';
import { schemaRequiredScalarType } from './openapi-metadata';
import { createCommandConfigDryRunResponse } from './preview';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const POSITIONAL_SCHEMA_GAP_EXEMPTIONS = new Set([
  'trade_offer.credits',
  'analyze_market.item_id',
  'analyze_market.page',
]);

const DEFAULT_SCHEMA_GAP_EXEMPTIONS = new Set(['faction_withdraw_credits.source']);
const internalCommandRegistry = { commands: COMMANDS };

function captureHelp(
  command: string,
  registry: Parameters<typeof showCommandHelp>[2] = BUNDLED_COMMAND_REGISTRY,
): string {
  const stdout: string[] = [];

  expect(
    showCommandHelp(
      command,
      {
        out(message = '') {
          stdout.push(message);
        },
        err() {},
      },
      registry,
    ),
  ).toBe(true);

  return stdout.join('\n').replace(ANSI_PATTERN, '');
}

function visibleBundledCommandName(command: string): string {
  if (BUNDLED_COMMAND_REGISTRY.commands[command]) return command;

  for (const group of Object.values(BUNDLED_COMMAND_REGISTRY.commandGroups)) {
    for (const action of Object.values(group?.actions ?? {})) {
      if (action.command === command) return action.displayName;
    }
  }

  return command;
}

function captureFullHelp(): string {
  const stdout: string[] = [];

  showFullHelp(
    {
      out(message = '') {
        stdout.push(message);
      },
      err() {},
    },
    undefined,
    { plain: true },
  );

  return stdout.join('\n').replace(ANSI_PATTERN, '');
}

function appendCompletionEnumCases(
  cases: Array<{ command: string; arg: string; values: string[] }>,
  command: string,
  config: Pick<CommandConfig, 'args' | 'required' | 'aliases' | 'schema'>,
): void {
  for (const arg of getArgNames(config)) {
    const canonicalArg = config.aliases?.[arg] || arg;
    const values = config.schema?.[canonicalArg]?.enum;
    if (values?.length) cases.push({ command, arg, values });
  }
}

function getCompletionEnumCases(options: { includeGrouped?: boolean } = {}): Array<{
  command: string;
  arg: string;
  values: string[];
}> {
  const cases: Array<{ command: string; arg: string; values: string[] }> = [];

  for (const [command, config] of Object.entries(BUNDLED_COMMAND_REGISTRY.commands)) {
    appendCompletionEnumCases(cases, command, config);
  }

  if (options.includeGrouped) {
    for (const group of Object.values(BUNDLED_COMMAND_REGISTRY.commandGroups)) {
      for (const action of Object.values(group?.actions ?? {})) {
        appendCompletionEnumCases(cases, action.command, action.config);
      }
    }
  }

  return cases;
}

function commandArgName(arg: CommandArg): string {
  return typeof arg === 'string' ? arg : arg.rest;
}

function generatedArgNames(generated?: GeneratedApiRoute): string[] {
  if (!generated?.schema) return [];
  const positional = Object.entries(generated.schema)
    .filter(([, schema]) => schema.positionalIndex !== undefined)
    .sort((a, b) => (a[1].positionalIndex ?? 0) - (b[1].positionalIndex ?? 0))
    .map(([field]) => field);
  return positional.length > 0 ? positional : Object.keys(generated.schema);
}

function sampleValueForField(command: string, field: string): string {
  const config = COMMANDS[command];
  if (!config) return `${field}_sample`;
  const canonical = config.aliases?.[field] || field;
  const schema = config.schema?.[canonical];
  if (schema?.enum?.[0]) return String(schema.enum[0]);
  const requiredScalarType = schemaRequiredScalarType(schema?.type);
  if (requiredScalarType === 'integer' || requiredScalarType === 'number') return '1';
  if (requiredScalarType === 'boolean') return 'true';
  if (field.includes('quantity') || field.includes('amount') || field.includes('credits')) return '1';
  if (field.includes('system')) return 'system_sample';
  if (field.includes('poi') || field === 'id') return 'poi_sample';
  if (field.includes('player') || field.includes('target')) return 'player_sample';
  if (field.includes('item')) return 'item_sample';
  return `${field}_sample`;
}

function bashGlobalOptionWords(completion: string): string[] {
  const match = completion.match(/^\s*local global_flags="([^"]*)"/m);
  return match?.[1]?.split(/\s+/).filter(Boolean) || [];
}

function zshGlobalOptionWords(completion: string): string[] {
  const block = completion.match(/_arguments -C \\\n(?<body>[\s\S]*?)\n\s*"1:command:_spacemolt_commands"/)?.groups
    ?.body;
  if (!block) return [];

  const words: string[] = [];
  for (const line of block.split('\n')) {
    const spec = line.split('[')[0] || '';
    const group = spec.match(/\{([^}]*)\}/)?.[1];
    if (group) {
      words.push(...group.split(',').filter((word) => /^-{1,2}[A-Za-z][A-Za-z0-9-]*$/.test(word)));
      continue;
    }

    const word = spec.replace(/\([^)]*\)/g, '').match(/"(-{1,2}[A-Za-z][A-Za-z0-9-]*)/)?.[1];
    if (word) words.push(word);
  }
  return words;
}

function fishGlobalOptionWords(completion: string): string[] {
  const words: string[] = [];
  for (const line of completion.split('\n')) {
    if (!line.startsWith('complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand"')) {
      continue;
    }
    const short = line.match(/(?:^|\s)-s\s+(\S+)/)?.[1];
    const oldStyle = line.match(/(?:^|\s)-o\s+(\S+)/)?.[1];
    const long = line.match(/(?:^|\s)-l\s+(\S+)/)?.[1];
    if (short) words.push(`-${short}`);
    if (oldStyle) words.push(`-${oldStyle}`);
    if (long) words.push(`--${long}`);
  }
  return words;
}

function fishGlobalOptionLine(completion: string, longOption: string): string | undefined {
  return completion
    .split('\n')
    .find(
      (line) =>
        line.startsWith('complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand"') &&
        line.includes(longOption),
    );
}

function bashTopLevelCommandWords(completion: string): string[] {
  const match = completion.match(/^\s*local commands="([^"]*)"/m);
  return match?.[1]?.split(/\s+/).filter(Boolean) || [];
}

function zshTopLevelCommandWords(completion: string): string[] {
  return zshFunctionCommandWords(completion, '_spacemolt_commands');
}

function zshFunctionCommandWords(completion: string, functionName: string): string[] {
  const escapedFunctionName = functionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = completion.match(new RegExp(`${escapedFunctionName}\\(\\) \\{[\\s\\S]*?^\\s*commands=\\(`, 'm'));
  if (!match || match.index === undefined) return [];

  const bodyStart = match.index + match[0].length;
  const bodyEnd = findZshArrayEnd(completion, bodyStart);
  if (bodyEnd === -1) return [];

  return parseZshDescribedWords(completion.slice(bodyStart, bodyEnd));
}

function findZshArrayEnd(source: string, start: number): number {
  let inSingleQuote = false;

  for (let index = start; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];
    if (!inSingleQuote && char === '\\' && next === "'") {
      index++;
      continue;
    }
    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }
    if (!inSingleQuote && char === ')') return index;
  }

  return -1;
}

function parseZshDescribedWords(body: string): string[] {
  const words: string[] = [];
  let current = '';
  let inSingleQuote = false;

  const finishWord = () => {
    if (!current) return;
    const word = zshDescribedWordName(current);
    if (word) words.push(word);
    current = '';
  };

  for (let index = 0; index < body.length; index++) {
    const char = body.charAt(index);
    const next = body.charAt(index + 1);

    if (!inSingleQuote && /\s/.test(char)) {
      finishWord();
      continue;
    }

    if (char === "'") {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && char === '\\' && next === "'") {
      current += "'";
      index++;
      continue;
    }

    current += char;
  }

  finishWord();
  return words;
}

function zshDescribedWordName(describedWord: string): string {
  let name = '';

  for (let index = 0; index < describedWord.length; index++) {
    const char = describedWord.charAt(index);
    const next = describedWord.charAt(index + 1);
    if (char === '\\' && next) {
      name += next;
      index++;
      continue;
    }
    if (char === '[') return name;
    name += char;
  }

  return name;
}

function fishTopLevelCommandWords(completion: string): string[] {
  const words: string[] = [];
  for (const line of completion.split('\n')) {
    if (!line.startsWith('complete -c spacemolt -n "__spacemolt_no_dynamic_complete; and __fish_use_subcommand"')) {
      continue;
    }
    if (/(?:^|\s)-(?:s|o|l)\s+/.test(line)) continue;
    const word = line.match(/(?:^|\s)-a\s+('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|\S+)/)?.[1];
    if (word) words.push(word.replace(/^['"]|['"]$/g, ''));
  }
  return words;
}

function bashCommandCompletionWords(completion: string, command: string): string[] {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Prefer the outermost (least-indented) case arm. Nested group actions can reuse
  // top-level names (e.g. faction `profile` vs local `profile`).
  const matches = [
    ...completion.matchAll(new RegExp(`^(?<indent>[ \\t]*)${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'gm')),
  ];
  if (!matches.length) return [];
  matches.sort((a, b) => (a.groups?.indent?.length ?? 0) - (b.groups?.indent?.length ?? 0));
  const body = matches[0]?.groups?.body;
  const words = body?.match(/compgen -W "([^"]*)"/)?.[1];
  return words?.split(/\s+/).filter((word) => word && !word.includes('$')) || [];
}

function zshCommandCompletionWords(completion: string, command: string): string[] {
  const body = zshCommandCaseBody(completion, command);
  const actionWords = body?.match(/_arguments '(?:\d+):(?:'\\''|[^'])* action:\(([^)]*)\)'/)?.[1];
  const words =
    actionWords ||
    body?.match(/_arguments "\d+:[^"]*:\(([^)]*)\)"/)?.[1] ||
    body?.match(/_arguments '\d+:(?:'\\''|[^'])*:\(([^)]*)\)'/)?.[1];
  return words ? parseZshDescribedWords(words) : [];
}

function zshCommandCompletionPosition(completion: string, command: string): string | undefined {
  const body = zshCommandCaseBody(completion, command);
  return (
    body?.match(/_arguments '(?<position>\d+):(?:'\\''|[^'])* action:\([^)]*\)'/)?.groups?.position ||
    body?.match(/_arguments "(?<position>\d+):[^"]*:\([^)]*\)"/)?.groups?.position ||
    body?.match(/_arguments '(?<position>\d+):(?:'\\''|[^'])*:\([^)]*\)'/)?.groups?.position
  );
}

function zshCommandCaseBody(completion: string, command: string): string | undefined {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = completion.match(new RegExp(`^        ${escapedCommand}\\)\\n`, 'm'));
  if (match?.index === undefined) return undefined;
  const bodyStart = match.index + match[0].length;
  const rest = completion.slice(bodyStart);
  const nextCase = rest.match(/^ {8}\S.*\)\n/m);
  return nextCase?.index === undefined ? rest : rest.slice(0, nextCase.index);
}

function fishCommandCompletionWords(completion: string, command: string): string[] {
  const words: string[] = [];
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const commandMatcher = new RegExp(
    `(?:__fish_seen_subcommand_from|__spacemolt_seen_group_without_action) ${escapedCommand}(?:"|\\s|$)`,
  );
  for (const line of completion.split('\n')) {
    if (!commandMatcher.test(line)) continue;
    const word = line.match(/(?:^|\s)-a\s+(\S+)/)?.[1];
    if (word) words.push(word.replace(/^"|"$/g, ''));
  }
  return words;
}

function commandCompletionWords(shell: string, completion: string, command: string): string[] {
  if (shell === 'bash') return bashCommandCompletionWords(completion, command);
  if (shell === 'zsh') return zshCommandCompletionWords(completion, command);
  return fishCommandCompletionWords(completion, command);
}

describe('command metadata', () => {
  test('grouped flat commands are not user-visible command metadata', () => {
    for (const command of [
      'citizenship_apply',
      'facility_job_add',
      'faction_info',
      'fleet_invite',
      'forum_get_thread',
      'station_set_name',
      'trade_offer',
    ]) {
      expect(BUNDLED_COMMAND_REGISTRY.commands[command], command).toBeUndefined();
      expect(BUNDLED_COMMAND_REGISTRY.allCommands[command], command).toBeUndefined();
    }
  });

  test('top-level command metadata has human descriptions', () => {
    const priorityCommands = [
      'register',
      'login',
      'logout',
      'dock',
      'undock',
      'travel',
      'jump',
      'get_status',
      'get_system',
      'get_cargo',
      'view_market',
      'buy',
      'sell',
      'refuel',
      'repair',
      'catalog',
      'chat',
      'get_chat_history',
      'profile',
      'ids',
      'where-can-i',
    ];

    for (const command of priorityCommands) {
      const config = BUNDLED_COMMAND_REGISTRY.allCommands[command];
      expect(config, `${command} should exist`).toBeDefined();
      if (!config) continue;
      expect(config.description, `${command} should have a description`).toBeTruthy();
      expect(config.description, `${command} description should not repeat command name`).not.toBe(command);
    }
  });

  test('top-level mutating commands include examples', () => {
    const commandsWithExamples = ['register', 'login', 'travel', 'jump', 'buy', 'sell', 'refuel', 'repair', 'chat'];

    for (const command of commandsWithExamples) {
      const config = BUNDLED_COMMAND_REGISTRY.allCommands[command];
      expect(config?.example, `${command} should have an example`).toMatch(/^spacemolt /);
    }
  });

  test('authentication examples show direct named profile creation', () => {
    expect(BUNDLED_COMMAND_REGISTRY.commands.register?.example).toBe(
      'spacemolt register myname solarian YOUR_REGISTRATION_CODE --profile myname',
    );
    expect(BUNDLED_COMMAND_REGISTRY.commands.login?.example).toBe('spacemolt login myname <password> --profile myname');
  });

  test('repair help does not advertise unsupported target positional syntax', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.repair;
    expect(config?.description).toBe('Repair hull damage using station services, repair kits, or repair equipment.');
    expect(config?.example).toBe('spacemolt repair');
    expect(config?.usage).not.toContain('target=');

    const help = captureHelp('repair');
    expect(help).not.toContain('[target=ship|modules]');
    expect(help).not.toContain('spacemolt repair modules');
  });

  test('refuel help documents station top-off and limited quantity semantics', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.refuel;
    expect(config?.description).toContain('station credit refuel fills to full');
    expect(config?.usage).toContain('fuel_cell_id');
    expect(config?.usage).toContain('quantity=units');

    const help = captureHelp('refuel');
    expect(help).toContain('station credit refuel fills to full');
    expect(help).toContain('quantity applies only to fuel cells and transfers');
  });

  test('scan help documents optional area sweeps', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.scan;
    expect(config?.required ?? []).toEqual([]);
    expect(config?.usage).toContain('[target_id]');
    expect(config?.description).toContain('Omit the target to run an area sensor sweep');
    expect(config?.description).toContain('creature');

    const help = captureHelp('scan');
    expect(help).toContain('spacemolt scan');
    expect(help).toContain('[target_id]');
    expect(help).toContain('area sensor sweep');
    expect(help).toContain('creature');
  });

  test('wildlife hunt command is bundled with creature-focused help', () => {
    const hunt = BUNDLED_COMMAND_REGISTRY.allCommands.hunt;
    expect(hunt?.required).toEqual(['creature_id']);
    expect(hunt?.usage).toContain('<creature_id>');
    expect(hunt?.description).toContain('wildlife creature');
    expect(hunt?.example).toBe('spacemolt hunt <creature_id>');
    expect(hunt?.seeAlso).toEqual(expect.arrayContaining(['get_nearby', 'scan', 'get_battle_status']));

    const nearby = BUNDLED_COMMAND_REGISTRY.allCommands.get_nearby;
    expect(nearby?.description).toContain('creatures');

    const survey = BUNDLED_COMMAND_REGISTRY.allCommands.survey_system;
    expect(survey?.description).toContain('wildlife');

    const help = captureHelp('hunt');
    expect(help).toContain('spacemolt hunt <creature_id>');
    expect(help).toContain('wildlife creature');
    expect(help).toContain('get_nearby');
  });

  test('unload_passenger help documents all-passenger bulk unload', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.unload_passenger;
    expect(config?.usage).toContain('all');
    expect(config?.usage).toContain('target=lounge');
    expect(config?.description).toContain('Pass "all" to put every passenger off at once');
    expect(config?.description).toContain('target=lounge');
    expect(config?.schema?.target?.type).toBe('string');

    const help = captureHelp('unload_passenger');
    expect(help).toContain('Pass "all" to put every passenger off at once');
    expect(help).toContain('or "all" to put every passenger off at once');
    expect(help).toContain('target');
    expect(help).toContain('Transit Lounge');
  });

  test('buy_ship_license and commission_ship document per-design licensing and faction funding', () => {
    const license = BUNDLED_COMMAND_REGISTRY.commands.buy_ship_license;
    expect(license?.usage).toContain('ship_class');
    expect(license?.description).toContain('specific ship design');
    expect(license?.required).toEqual(['ship_class']);
    expect(license?.schema?.ship_class?.type).toBe('string');
    expect(license?.schema?.empire).toBeUndefined();

    const commission = BUNDLED_COMMAND_REGISTRY.commands.commission_ship;
    expect(commission?.usage).toContain('fund_from_faction');
    expect(commission?.description).toContain('fund_from_faction');
    expect(commission?.schema?.fund_from_faction?.type).toBe('boolean');

    const licenseHelp = captureHelp('buy_ship_license');
    expect(licenseHelp).toContain('ship_class');
    expect(licenseHelp).toContain('specific ship design');

    const commissionHelp = captureHelp('commission_ship');
    expect(commissionHelp).toContain('fund_from_faction');
  });

  test('craft help documents queued station-storage production and packages', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.craft;
    expect(config?.args).toEqual(['recipe_id', 'quantity']);
    expect(config?.aliases).toMatchObject({ recipe_id: 'id' });
    expect(config?.usage).toContain('source=storage|faction|faction:<bucket>|cargo');
    expect(config?.usage).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('items=JSON');
    expect(config?.usage).toContain('package_id');
    expect(config?.usage).toContain('label');
    expect(config?.usage).toContain('target=');
    expect(config?.description).toContain('faction:<bucket>');
    expect(config?.description).toContain('pack_package');
    expect(config?.description).toContain('unpack_package');
    expect(config?.schema?.deliver_to?.enum).toBeUndefined();
    expect(config?.schema?.deliver_to?.description).toContain('faction:<bucket name or id>');
    expect(config?.schema?.deliver_to?.description).toContain('alias for target');
    expect(config?.schema?.source?.type).toBe('string');
    expect(config?.schema?.source?.description).toContain('cargo');
    expect(config?.schema?.items?.type).toBe('array');
    expect(config?.schema?.label?.type).toBe('string');
    expect(config?.schema?.package_id?.type).toBe('string');
    expect(config?.schema?.target?.type).toBe('string');
    expect(config?.schema?.action?.enum).toEqual(['queue']);
    expect(config?.schema?.job_id?.type).toBe('string');
    expect(config?.schema?.quantity?.description).toContain('Number of output items');
    expect(config?.schema?.quantity?.description).not.toContain('server-capped by crafting skill level');
    expect(config?.schema?.preset?.enum).toEqual(['fast', 'cheap', 'prefer_own', 'workshop']);
    const craftPresetHelp = config?.schema?.preset?.description ?? '';
    expect(craftPresetHelp).toContain("'fast'");
    expect(craftPresetHelp).toContain('soonest');
    expect(craftPresetHelp).toContain("'cheap'");
    expect(craftPresetHelp).toContain('lowest fee you would actually pay');
    expect(craftPresetHelp).toContain('free');
    expect(craftPresetHelp).toContain('ally-granted');
    expect(craftPresetHelp).toContain('public rental');
    expect(craftPresetHelp).toContain("'workshop'");
    expect(craftPresetHelp).not.toContain("'fast' or 'cheap' selects the globally fastest or cheapest");
    expect(config?.schema?.preset?.description).toContain('prefer_own');
    expect(config?.schema?.preset?.description).toContain('public rental');
    expect(config?.usage).toContain('prefer_own');
    expect(config?.seeAlso).toContain('inspect');

    const help = captureHelp('craft');
    expect(help).toContain('Queue crafting work');
    expect(help).toContain('source=storage|faction|faction:<bucket>|cargo');
    expect(help).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(help).toContain('escrow');
    expect(help).toContain('dry_run');
    expect(help).toContain('jobs');
    expect(help).toContain('action=queue');
    expect(help).toContain('job_id');
    expect(help).toContain('prefer_own');
    expect(help).toContain('own facility');
    expect(help).toContain('faction');
    expect(help).toContain('ally-granted');
    expect(help).toContain('public rental');
    expect(help).toContain('lowest fee you would actually pay');
    expect(help).toContain('workshop');
    expect(help).not.toContain('globally fastest or cheapest');
    expect(help).toContain('pack_package');
    expect(help).toContain('package_id');
    expect(help).toContain('items');
    expect(help).toContain('label');
    expect(help).toContain('target');
    expect(help).toContain('cargo');
    expect(help).not.toContain('Crafting never delivers to cargo');
    expect(help).not.toContain('server-capped by crafting skill level');
    expect(help).not.toContain('1-10');
    expect(help).not.toContain('If cargo is full');
  });

  test('recycle help documents queued lossy reverse production', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.recycle;
    expect(config?.route).toEqual({
      tool: 'spacemolt',
      action: 'recycle',
      method: 'POST',
    });
    expect(config?.args).toEqual(['recipe_id', 'quantity']);
    expect(config?.aliases).toMatchObject({ recipe_id: 'id' });
    expect(config?.usage).toContain('source=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('preset=fast|cheap|prefer_own');
    expect(config?.schema?.deliver_to?.enum).toBeUndefined();
    expect(config?.schema?.deliver_to?.description).toContain('faction:<bucket name or id>');
    expect(config?.schema?.source?.type).toBe('string');
    expect(config?.schema?.job_id?.type).toBe('string');
    expect(config?.schema?.preset?.enum).toEqual(['fast', 'cheap', 'prefer_own']);
    const recyclePresetHelp = config?.schema?.preset?.description ?? '';
    expect(recyclePresetHelp).toContain("'fast'");
    expect(recyclePresetHelp).toContain('soonest');
    expect(recyclePresetHelp).toContain("'cheap'");
    expect(recyclePresetHelp).toContain('lowest fee you would actually pay');
    expect(recyclePresetHelp).toContain('free');
    expect(recyclePresetHelp).toContain('ally-granted');
    expect(recyclePresetHelp).toContain('public rental');
    expect(recyclePresetHelp).toContain("'workshop' doesn't apply");
    expect(config?.schema?.jobs?.description).toContain('preset');

    const help = captureHelp('recycle');
    expect(help).toContain('ally-granted');
    expect(help).toContain('lowest fee you would actually pay');
    expect(help).toContain('real recycler');
    expect(help).toContain('workshop does not apply');
    expect(help).not.toContain('globally fastest or cheapest');
    expect(help).toContain('Queue a recycling job');
    expect(help).toContain('source=storage|faction|faction:<bucket>');
    expect(help).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(help).toContain('feedstock');
    expect(help).toContain('dry_run');
    expect(help).toContain('jobs');
    expect(help).toContain('job_id');
    expect(help).toContain('preset');
    expect(help).toContain('prefer_own');
  });

  test('inspect is curated with route and package-aware docs', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.inspect;
    expect(config?.route).toEqual({ tool: 'spacemolt', action: 'inspect', method: 'POST' });
    expect(config?.category).toBe('Query commands');
    expect(config?.required).toContain('id');
    expect(config?.args).toContain('id');
    expect(config?.usage).toContain('package:');
    expect(config?.description).toMatch(/package/i);
    expect(config?.description).toContain('package:');
    expect(config?.seeAlso).toContain('craft');
    expect(captureHelp('inspect')).toContain('package:');
  });

  test('storage help documents bucket transfers for faction storage extensions', () => {
    const deposit = BUNDLED_COMMAND_REGISTRY.commandGroups.storage?.actions.deposit?.config;
    const withdraw = BUNDLED_COMMAND_REGISTRY.commandGroups.storage?.actions.withdraw?.config;
    expect(deposit?.args).toContain('bucket');
    expect(deposit?.usage).toContain('[bucket=…]');
    expect(deposit?.usage).toContain('[dest_bucket=…]');
    expect(deposit?.description).toContain('gift items/credits/ships to players');
    expect(deposit?.example).toContain('target=PlayerName source=storage');
    expect(deposit?.schema?.source?.description).toContain('source=faction target=faction');
    expect(deposit?.schema?.source?.description).toContain('move items between faction compartments');
    expect(deposit?.schema?.bucket?.description).toContain('Storage Extension bucket');
    expect(deposit?.schema?.bucket?.description).toContain('SOURCE compartment');
    expect(deposit?.schema?.dest_bucket?.description).toContain('main↔bucket and bucket↔bucket');
    expect(withdraw?.schema?.bucket?.description).toContain('Storage Extension bucket');

    const help = captureHelp('storage deposit');
    expect(help).toContain('[bucket=…]');
    expect(help).toContain('[dest_bucket=…]');
    expect(help).toContain('Storage Extension bucket');
    expect(help).toContain('source=faction target=faction');
  });

  test('market and jettison help advertises v0.441 request options', () => {
    const viewMarket = BUNDLED_COMMAND_REGISTRY.commands.view_market;
    expect(viewMarket?.args).toEqual(['item_id', 'category', 'company_store', 'since']);
    expect(viewMarket?.usage).toContain('[company_store=true]');
    expect(viewMarket?.schema?.company_store?.type).toBe('boolean');

    const viewMarketHelp = captureHelp('view_market');
    expect(viewMarketHelp).toContain('[company_store=true]');
    expect(viewMarketHelp).toContain('Company Store');

    const jettison = BUNDLED_COMMAND_REGISTRY.commands.jettison;
    expect(jettison?.args).toEqual(['item_id', 'quantity', 'items']);
    expect(jettison?.usage).toContain('[item_id]');
    expect(jettison?.usage).toContain('[quantity]');
    expect(jettison?.usage).toContain('[items=JSON]');
    expect(jettison?.aliases).toMatchObject({ item_id: 'id' });
    expect(jettison?.schema?.items?.type).toBe('array');

    const jettisonHelp = captureHelp('jettison');
    expect(jettisonHelp).toContain('[items=JSON]');
    expect(jettisonHelp).toContain('Bulk mode');
  });

  test('faction order help advertises private Company Store listings', () => {
    const buy = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.create_buy_order?.config;
    expect(buy?.args).toEqual(['item_id', 'quantity', 'price_each', 'bucket', 'private']);
    expect(buy?.usage).toContain('[bucket=name-or-id]');
    expect(buy?.usage).toContain('[private=true]');
    expect(buy?.usage).not.toContain('deliver_to');
    expect(buy?.schema?.private?.type).toBe('boolean');

    const buyHelp = captureHelp('faction create_buy_order');
    expect(buyHelp).toContain('[private=true]');
    expect(buyHelp).toContain('Company Store');
    expect(buyHelp).not.toContain('deliver_to');

    const sell = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.create_sell_order?.config;
    expect(sell?.args).toEqual(['item_id', 'quantity', 'price_each', 'bucket', 'private']);
    expect(sell?.usage).toContain('[bucket=name-or-id]');
    expect(sell?.usage).toContain('[private=true]');
    expect(sell?.schema?.private?.type).toBe('boolean');

    const sellHelp = captureHelp('faction create_sell_order');
    expect(sellHelp).toContain('[private=true]');
    expect(sellHelp).toContain('Company Store');
  });

  test('faction_build help documents bucket material sourcing', () => {
    const action = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.build;
    const config = action?.config;
    expect(config?.args).toEqual(['facility_type', 'bucket']);
    expect(config?.usage).toContain('[bucket=name-or-id]');
    expect(config?.schema?.bucket?.description).toContain('Storage Extension bucket');

    const help = captureHelp(action?.displayName || 'faction build');
    expect(help).toContain('[bucket=name-or-id]');
    expect(help).toContain('Storage Extension bucket');
  });

  test('facility_build help documents that build accepts faction facility types', () => {
    const action = BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions.build;
    const config = action?.config;
    expect(config?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'build',
      method: 'POST',
    });
    expect(config?.description).toContain('faction facility types are accepted');

    const help = captureHelp(action?.displayName || 'facility build');
    expect(help).toContain('faction facility types are accepted');
    expect(help).not.toContain('Build a player facility at the current base.');
  });

  test('facility_set_description is curated on the facility group', () => {
    const action = BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions.set_description;
    const config = action?.config;
    expect(action?.displayName).toBe('facility set_description');
    expect(config?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'facility_set_description',
      method: 'POST',
    });
    expect(config?.required).toEqual(['facility_id']);
    expect(config?.description).toContain('custom description');

    const help = captureHelp(action?.displayName || 'facility set_description');
    expect(help).toContain('facility_id');
    expect(help).toContain('4000');
  });

  test('faction_espionage is curated on the faction group', () => {
    const action = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.espionage;
    const config = action?.config;
    expect(action?.displayName).toBe('faction espionage');
    expect(config?.route).toEqual({
      tool: 'spacemolt_intel',
      action: 'espionage',
      method: 'POST',
    });
    expect(config?.description).toContain('Espionage HQ');

    const help = captureHelp(action?.displayName || 'faction espionage');
    expect(help).toContain('Espionage HQ');
    expect(help).toContain('docked');
  });

  test('facility production commands have curated routes and help', () => {
    const expected: Record<
      string,
      { group: GroupedCommandName; actionName: string; action: string; args: string[]; help: string }
    > = {
      job_add: {
        group: 'facility',
        actionName: 'job_add',
        action: 'job_add',
        args: ['facility_id', 'recipe_id', 'quantity', 'direction', 'deliver_to', 'source'],
        help: 'Queue production work',
      },
      job_list: {
        group: 'facility',
        actionName: 'job_list',
        action: 'job_list',
        args: ['facility_id'],
        help: 'List queued production jobs',
      },
      job_cancel: {
        group: 'facility',
        actionName: 'job_cancel',
        action: 'job_cancel',
        args: ['job_id'],
        help: 'Cancel queued facility jobs',
      },
      dismantle: {
        group: 'facility',
        actionName: 'dismantle',
        action: 'dismantle',
        args: ['facility_id'],
        help: 'Dismantle a facility',
      },
      faction_dismantle: {
        group: 'faction',
        actionName: 'dismantle',
        action: 'faction_dismantle',
        args: ['facility_id'],
        help: 'Dismantle a faction facility',
      },
      job_reorder: {
        group: 'facility',
        actionName: 'job_reorder',
        action: 'job_reorder',
        args: ['facility_id', 'job_id', 'position'],
        help: 'Move a queued facility job',
      },
      set_output_price: {
        group: 'facility',
        actionName: 'set_output_price',
        action: 'set_output_price',
        args: ['facility_id', 'price'],
        help: 'Set the rental price renters pay',
      },
      set_access: {
        group: 'facility',
        actionName: 'set_access',
        action: 'set_access',
        args: ['facility_id', 'access'],
        help: 'Open or close a facility',
      },
    };

    for (const expectation of Object.values(expected)) {
      const action = BUNDLED_COMMAND_REGISTRY.commandGroups[expectation.group]?.actions[expectation.actionName];
      const config = action?.config;
      expect(config?.category).toBe('Facilities');
      expect(config?.route).toEqual({
        tool: 'spacemolt_facility',
        action: expectation.action,
        method: 'POST',
      });
      expect(config?.args).toEqual(expectation.args);
      expect(captureHelp(action?.displayName || `${expectation.group} ${expectation.actionName}`)).toContain(
        expectation.help,
      );
    }

    const facilityActions = BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions;
    expect(facilityActions?.job_add?.config.usage).toContain('faction:<bucket>');
    expect(facilityActions?.job_add?.config.usage).toContain('items=JSON');
    expect(facilityActions?.job_add?.config.usage).toContain('package_id');
    expect(facilityActions?.job_add?.config.usage).toContain('label');
    expect(facilityActions?.job_add?.config.usage).toContain('target=');
    expect(facilityActions?.job_add?.config.description).toContain('pack_package');
    expect(facilityActions?.job_add?.config.schema?.deliver_to?.description).toContain('faction:<bucket');
    expect(facilityActions?.job_add?.config.schema?.source?.description).toContain('deliver_to');
    expect(facilityActions?.job_add?.config.schema?.source?.description).toContain('cargo');
    expect(facilityActions?.job_add?.config.schema?.items?.type).toBe('array');
    expect(facilityActions?.job_add?.config.schema?.package_id?.type).toBe('string');
    expect(facilityActions?.job_add?.config.schema?.target?.type).toBe('string');
    expect(facilityActions?.job_add?.config.seeAlso).toContain('craft');
    expect(facilityActions?.job_add?.config.seeAlso).toContain('inspect');
    const jobAddHelp = captureHelp(facilityActions?.job_add?.displayName || 'facility job_add');
    expect(jobAddHelp).toContain('faction:<bucket>');
    expect(jobAddHelp).toContain('deliver_to');
    expect(jobAddHelp).toContain('source');
    expect(jobAddHelp).toContain('pack_package');
    expect(jobAddHelp).toContain('package_id');
    expect(jobAddHelp).toContain('items');
    expect(jobAddHelp).toContain('target');
    expect(facilityActions?.job_add?.config.schema?.direction?.enum).toEqual(['forward', 'reverse']);
    expect(facilityActions?.job_cancel?.config.schema?.job_ids?.type).toBe('array');
    expect(captureHelp(facilityActions?.job_cancel?.displayName || 'facility job_cancel')).toContain('job_ids');
    expect(facilityActions?.transfer?.config.schema?.direction?.enum).toEqual(['to_faction', 'to_player']);

    const setOutputPrice = facilityActions?.set_output_price?.config;
    expect(setOutputPrice?.description).toMatch(/package/i);
    expect(setOutputPrice?.description).toMatch(/Logistics|once-per-package/i);
    expect(captureHelp(facilityActions?.set_output_price?.displayName || 'facility set_output_price')).toMatch(
      /package/i,
    );
  });

  test('stale commands removed from the v2 API are not advertised', () => {
    for (const command of ['facility_toggle', 'faction_facility_toggle', 'configure_recycler', 'get_ships']) {
      expect(COMMANDS[command]).toBeUndefined();
      expect(BUNDLED_COMMAND_REGISTRY.allCommands[command]).toBeUndefined();
    }

    const help = captureFullHelp();
    expect(help).not.toContain('facility_toggle');
    expect(help).not.toContain('faction_facility_toggle');
    expect(help).not.toContain('configure_recycler');
    expect(help).not.toContain('get_ships');
  });

  test('chat help advertises quoted messages and explicit content', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.chat;
    expect(config?.usage).toContain('"message"');
    expect(config?.usage).toContain('--content');
    expect(config?.description).toContain('Quote messages with spaces');

    const help = captureHelp('chat');
    expect(help).toContain('"message"');
    expect(help).toContain('--content');
    expect(help).toContain('Quote messages with spaces');
  });

  test('buy help advertises storage delivery as the default and cargo as an override', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.buy;
    expect(config?.route.defaults).toMatchObject({ deliver_to: 'storage' });
    expect(config?.usage).toContain('[delivery=cargo|storage]');
    expect(config?.aliases).toMatchObject({ delivery: 'deliver_to' });
    expect(config?.schema?.deliver_to?.description).toContain('CLI default is storage');

    const help = captureHelp('buy');
    expect(help).toContain('delivery -> deliver_to');
    expect(help).toContain('deliver_to (cargo|storage)');
    expect(help).toContain('CLI default is storage');
    expect(help).toContain('deliver_to=storage');
    expect(help).toContain('storage');
    expect(help).not.toContain('view_storage');
  });

  test('deploy_drone help advertises bulk deploy mode', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.deploy_drone;
    expect(config?.usage).toContain('[all=true]');
    expect(config?.schema?.all?.description).toContain('deploy every in-bay drone');

    const help = captureHelp('deploy_drone');
    expect(help).toContain('[all=true]');
    expect(help).toContain('deploy every in-bay drone');
  });

  test('profile help advertises local action forms without key-value action fields', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.profile;
    expect(config).toBeDefined();
    if (!config) return;
    expect(config?.usage).toBe('[list|default [name]]');
    expect(getArgNames(config)).toEqual([]);

    const help = captureHelp('profile');
    expect(help).toContain('spacemolt profile [list|default [name]]');
    expect(help).not.toContain('action=...');
    expect(help).not.toContain('--action');
  });

  test('command registry preserves curated commands and local commands', () => {
    const snapshot = buildCommandRegistrySnapshot();
    expect(snapshot.commands.travel).toBeDefined();
    expect(snapshot.localCommands.ids).toBe(LOCAL_COMMANDS.ids);
    expect(snapshot.allCommands.ids).toBeDefined();
    expect(snapshot.apiRoutes).toEqual(
      Object.fromEntries(Object.entries(snapshot.commands).map(([command, config]) => [command, config.route])),
    );
  });

  test('command registry does not expose duplicate v2-prefixed state commands', () => {
    const snapshot = buildCommandRegistrySnapshot();
    const removedCommands = [
      'claim_commission',
      'salvage_wreck',
      'v2_get_cargo',
      'v2_get_missions',
      'v2_get_player',
      'v2_get_queue',
      'v2_get_ship',
      'v2_get_skills',
    ];

    for (const command of removedCommands) {
      expect(snapshot.commands[command]).toBeUndefined();
      expect(snapshot.allCommands[command]).toBeUndefined();
      expect(snapshot.apiRoutes[command]).toBeUndefined();
    }

    for (const command of ['get_cargo', 'get_missions', 'get_player', 'get_queue', 'get_ship', 'get_skills']) {
      expect(snapshot.commands[command]).toBeDefined();
    }
  });

  test('command registry does not expose get_leaderboard when OpenAPI omits it', () => {
    const snapshot = buildCommandRegistrySnapshot();
    const hasGeneratedLeaderboardRoute = Object.keys(GENERATED_API_ROUTES).some((route) =>
      route.toLowerCase().includes('leaderboard'),
    );

    expect(hasGeneratedLeaderboardRoute).toBe(false);
    expect(snapshot.commands.get_leaderboard).toBeUndefined();
    expect(snapshot.allCommands.get_leaderboard).toBeUndefined();
    expect(snapshot.apiRoutes.get_leaderboard).toBeUndefined();
    expect(captureFullHelp()).not.toContain('get_leaderboard');
  });

  test('full help does not advertise removed commands', () => {
    const help = captureFullHelp();

    for (const command of [
      'claim_commission',
      'view_storage',
      'view_faction_storage',
      'deposit_items',
      'withdraw_items',
      'send_gift',
      'salvage_wreck',
      'storage_loot',
      'storage_jettison',
    ]) {
      expect(help).not.toContain(command);
    }
  });

  test('notifications and shipping_list stay curated while other safe shipping commands are bundled generated fallbacks', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.notifications;

    expect(config).toBeDefined();
    if (!config) throw new Error('notifications command is missing from the bundled registry');
    expect(config).toMatchObject({
      category: 'Query commands',
      route: { tool: 'notifications', action: 'notifications', method: 'GET' },
      arrayFields: ['types'],
      schema: {
        limit: { type: 'integer' },
        clear: { type: 'boolean' },
        types: {
          type: 'array',
          enum: ['chat', 'combat', 'trade', 'faction', 'friend', 'forum', 'market', 'crafting', 'system'],
        },
      },
    });
    expect(config.description).toContain('get_notifications');
    expect(config.example).toContain('limit=10');

    expect(
      Object.entries(BUNDLED_COMMAND_REGISTRY.commands)
        .filter(([, commandConfig]) => commandConfig.category === 'Generated API')
        .map(([command]) => command)
        .sort(),
    ).toEqual([
      'shipping_accept',
      'shipping_cancel',
      'shipping_deliver',
      'shipping_get',
      'shipping_pay_debt',
      'shipping_profile',
      'shipping_quote',
      'shipping_return',
      'shipping_track',
    ]);
    const shippingList = BUNDLED_COMMAND_REGISTRY.commands.shipping_list;
    if (!shippingList) throw new Error('shipping_list command missing');
    expect(shippingList).toMatchObject({
      args: ['eligible_as', 'filter_destination', 'filter_service_level', 'filter_shipper', 'page', 'per_page', 'sort'],
      description:
        'List freight contracts you can accept from the current station. You must be docked, and only contracts posted at that station are shown.',
      usage:
        '[eligible_as=player|faction] [filter_destination=...] [filter_service_level=standard|priority] [filter_shipper=...] [sort=reward|distance|age] [page=...] [per_page=...]',
      example:
        'spacemolt shipping_list filter_destination=sirius_observatory_station filter_service_level=priority sort=distance',
      category: 'Missions',
      discoverWith: ['get_status'],
      seeAlso: ['shipping_quote', 'shipping_accept', 'shipping_profile'],
      route: { tool: 'spacemolt_shipping', action: 'list', method: 'POST' },
      schema: {
        eligible_as: { enum: ['player', 'faction'] },
        filter_destination: { type: 'string' },
        filter_service_level: { enum: ['standard', 'priority'] },
        filter_shipper: { type: 'string' },
        page: { type: 'integer' },
        per_page: { type: 'integer' },
        sort: { enum: ['reward', 'distance', 'age'] },
      },
    });
    expect(Object.keys(shippingList.aliases ?? {})).toHaveLength(0);
    expect(shippingList.route.defaults).toBeUndefined();
    expect(
      Object.values(BUNDLED_COMMAND_REGISTRY.commands).filter(
        (commandConfig) =>
          commandConfig.route.method === 'POST' &&
          commandConfig.route.tool === 'spacemolt_shipping' &&
          commandConfig.route.action === 'list',
      ),
    ).toHaveLength(1);
    const shippingQuote = BUNDLED_COMMAND_REGISTRY.commands.shipping_quote;
    if (!shippingQuote) throw new Error('shipping_quote command missing');
    expect(shippingQuote).toMatchObject({
      required: ['package_id', 'destination_base_id'],
      category: 'Generated API',
      route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
    });
    expect(BUNDLED_COMMAND_REGISTRY.commands.shipping_post).toMatchObject({
      args: ['package_id', 'destination_base_id', 'base_reward'],
      required: ['package_id', 'destination_base_id', 'base_reward'],
      usage: '<package_id> <destination_base_id> <base_reward> [speed_bonus=...]',
      category: 'Missions',
      route: { tool: 'spacemolt_shipping', action: 'post', method: 'POST' },
      schema: {
        base_reward: { type: 'integer', minimum: 1 },
      },
    });
    expect(shippingQuote.schema?.base_reward).toMatchObject({
      type: 'integer',
    });
    expect(shippingQuote.schema?.base_reward).not.toHaveProperty('minimum');
  });

  test('bundled generated fallbacks retain route safety suppressions', () => {
    const curatedRoutes = new Set(
      commandRegistryApiCommands(CURATED_COMMAND_REGISTRY).map(
        (config) => `${config.route.method || 'POST'}:${config.route.tool}:${config.route.action}`,
      ),
    );
    const routes = commandRegistryApiCommands(BUNDLED_COMMAND_REGISTRY)
      .filter(
        (config) => !curatedRoutes.has(`${config.route.method || 'POST'}:${config.route.tool}:${config.route.action}`),
      )
      .map((config) => config.route);

    expect(routes.some((route) => route.tool === 'session')).toBe(false);
    expect(
      routes.some((route) => route.tool === 'spacemolt_storage' && ['jettison', 'loot', 'view'].includes(route.action)),
    ).toBe(false);
    expect(BUNDLED_COMMAND_REGISTRY.commands.shipping_help).toBeUndefined();
  });

  test('command registry can limit fallback commands to dynamic generated routes', () => {
    const bundledOnlyRoute: GeneratedApiRoute = {
      summary: 'Bundled only route',
      route: { tool: 'spacemolt_bundled_only', action: 'probe', method: 'POST' },
    };
    const cachedRoute: GeneratedApiRoute = {
      summary: 'Cached route',
      route: { tool: 'spacemolt_cached_only', action: 'probe', method: 'POST' },
    };

    const snapshot = buildCommandRegistrySnapshot({
      generatedRoutes: {
        ...GENERATED_API_ROUTES,
        'POST /api/v2/spacemolt_bundled_only/probe': bundledOnlyRoute,
        'POST /api/v2/spacemolt_cached_only/probe': cachedRoute,
      },
      dynamicGeneratedRoutes: {
        'POST /api/v2/spacemolt_cached_only/probe': cachedRoute,
      },
      includeDynamic: true,
    });

    expect(snapshot.commands.cached_only_probe).toBeDefined();
    expect(snapshot.commands.bundled_only_probe).toBeUndefined();
  });

  test('command overrides are assembled from domain modules without losing entries', () => {
    const modules = [
      CORE_COMMAND_OVERRIDES,
      FACTION_SOCIAL_COMMAND_OVERRIDES,
      COMMERCE_FACILITY_COMMAND_OVERRIDES,
      BATTLE_SHIPYARD_COMMAND_OVERRIDES,
      QUERY_REFERENCE_COMMAND_OVERRIDES,
    ];
    const moduleKeys = modules.flatMap((module) => Object.keys(module));

    expect(new Set(moduleKeys).size, 'domain command override modules must not define duplicate commands').toBe(
      moduleKeys.length,
    );
    expect(moduleKeys).toEqual(Object.keys(COMMAND_OVERRIDES));
  });

  test('command overrides only contain curated UX fields and reference generated API routes', () => {
    const allowed = new Set<string>(ALLOWED_COMMAND_OVERRIDE_FIELDS);
    const failures: string[] = [];

    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
      if (override.apiRoute && !GENERATED_API_ROUTES[override.apiRoute]) {
        failures.push(`${command}: unknown generated API route ${override.apiRoute}`);
      }

      for (const field of Object.keys(override)) {
        if (!allowed.has(field)) failures.push(`${command}: override field "${field}" is not allowed`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('all command schema minima are finite and belong to numeric fields', () => {
    const failures: string[] = [];

    for (const [command, config] of Object.entries(BUNDLED_COMMAND_REGISTRY.commands)) {
      for (const [field, schema] of Object.entries(config.schema ?? {})) {
        if (schema.minimum === undefined) continue;
        if (!Number.isFinite(schema.minimum)) failures.push(`${command}.${field}: minimum must be finite`);
        const requiredScalarType = schemaRequiredScalarType(schema.type);
        if (requiredScalarType !== 'integer' && requiredScalarType !== 'number') {
          failures.push(`${command}.${field}: minimum requires integer or number type`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('all curated commands can parse minimal args and build dry-run route previews', () => {
    const failures: string[] = [];

    for (const [command, config] of Object.entries(COMMANDS)) {
      const args = [command];
      const required = new Set(config.required || []);

      for (const arg of config.args || []) {
        const field = commandArgName(arg);
        if (typeof arg !== 'string' || required.has(field)) {
          args.push(sampleValueForField(command, field));
        }
      }

      const parsed = parseArgs(args, { registry: internalCommandRegistry });
      if (!parsed.ok) {
        failures.push(`${command}: parse failed: ${parsed.errors.map((error) => error.message).join('; ')}`);
        continue;
      }

      const normalized = normalizeParsedPayload(command, parsed.payload, internalCommandRegistry);
      const converted = convertPayloadTypes(normalized, command, internalCommandRegistry);
      const dryRun = createCommandConfigDryRunResponse(command, config, converted);

      if (!dryRun.structuredContent) failures.push(`${command}: dry run missing structuredContent`);
      if (dryRun.error) failures.push(`${command}: dry run error: ${dryRun.error.message}`);
    }

    expect(failures).toEqual([]);
  });

  test('dry-run previews include OpenAPI state sections when metadata is available', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.hunt;
    expect(config).toBeDefined();
    if (!config) throw new Error('hunt command is missing from the bundled registry');
    const stateSections = (config as { stateSections?: string[] }).stateSections;
    expect(stateSections).toEqual(['player', 'ship', 'cargo', 'location', 'queue', 'skills']);

    const dryRun = createCommandConfigDryRunResponse('hunt', config, { creature_id: 'creature_pilot_whale_1' });
    expect(dryRun.structuredContent?.state_sections).toEqual(stateSections);
    expect(dryRun.result).toContain('State sections: player, ship, cargo, location, queue, skills');
  });

  test('command override positionals and aliases map to generated schema fields', () => {
    const failures: string[] = [];

    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
      if (!override.apiRoute) continue; // standalone public endpoints have no generated entry
      const generated = GENERATED_API_ROUTES[override.apiRoute];
      const schemaFields = new Set(Object.keys(generated?.schema || {}));
      const generatedPositionals = generatedArgNames(generated);

      for (const [index, arg] of (override.positionals || []).entries()) {
        const field = commandArgName(arg);
        const canonical = override.aliases?.[field] || generatedPositionals[index];
        if (
          !schemaFields.has(field) &&
          (!canonical || !schemaFields.has(canonical)) &&
          !override.schemaExtensions?.[field] &&
          !override.schemaExtensions?.[canonical || ''] &&
          !POSITIONAL_SCHEMA_GAP_EXEMPTIONS.has(`${command}.${field}`)
        ) {
          failures.push(`${command}: positional "${field}" does not map to a generated schema field`);
        }
      }

      for (const [alias, canonical] of Object.entries(override.aliases || {})) {
        if (!schemaFields.has(canonical) && !override.schemaExtensions?.[canonical]) {
          failures.push(`${command}: alias "${alias}" points to unknown canonical field "${canonical}"`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('command override defaults target generated schema fields or explicit exemptions', () => {
    const failures: string[] = [];

    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
      if (!override.apiRoute) continue; // standalone public endpoints have no generated entry
      const generated = GENERATED_API_ROUTES[override.apiRoute];
      const schemaFields = new Set(Object.keys(generated?.schema || {}));
      for (const field of Object.keys(override.defaults || {})) {
        if (
          !schemaFields.has(field) &&
          !override.schemaExtensions?.[field] &&
          !DEFAULT_SCHEMA_GAP_EXEMPTIONS.has(`${command}.${field}`)
        ) {
          failures.push(`${command}: default "${field}" does not map to a generated schema field`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('local commands include complete help and required arg metadata', () => {
    const failures: string[] = [];

    for (const [command, config] of Object.entries(LOCAL_COMMANDS)) {
      if (!config.usage) failures.push(`${command}: missing usage`);
      if (!config.description) failures.push(`${command}: missing description`);
      if (!config.category) failures.push(`${command}: missing category`);

      const required = new Set(config.required || []);
      for (const arg of config.args || []) {
        const name = commandArgName(arg);
        if (!required.has(name)) failures.push(`${command}: arg "${name}" is missing from required`);
      }
    }

    expect(failures).toEqual([]);
  });

  test('array transforms target known schema fields', () => {
    const failures: string[] = [];

    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
      if (!override.apiRoute) continue; // standalone public endpoints have no generated entry
      const generated = GENERATED_API_ROUTES[override.apiRoute];
      const schemaFields = new Set(Object.keys(generated?.schema || {}));

      for (const field of override.arrayFields || []) {
        const canonical = override.aliases?.[field] || field;
        if (!schemaFields.has(canonical) && !override.schemaExtensions?.[canonical]) {
          failures.push(`${command}: array field "${field}" does not map to a known schema field`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  test('every required arg appears in command args and local help', () => {
    const missing: string[] = [];

    for (const [command, config] of Object.entries(COMMANDS)) {
      const required = config.required || [];
      if (required.length === 0) continue;

      const argNames = getArgNames(config);
      const help = captureHelp(visibleBundledCommandName(command));
      for (const arg of required) {
        if (!argNames.includes(arg)) missing.push(`${command}: ${arg} missing from args`);
        if (!help.includes(arg)) missing.push(`${command}: ${arg} missing from help`);
      }
    }

    expect(missing).toEqual([]);
  }, 10_000);

  test('completion enum values match generated command schemas', () => {
    const topLevelEnumCases = getCompletionEnumCases();
    const groupedEnumCases = getCompletionEnumCases({ includeGrouped: true });
    expect(topLevelEnumCases.length).toBeGreaterThan(0);
    expect(groupedEnumCases.length).toBeGreaterThan(topLevelEnumCases.length);

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      // Zsh static grouped completions currently expose nested action names only; dynamic completion covers action args.
      const enumCases = shell === 'zsh' ? topLevelEnumCases : groupedEnumCases;
      const missing = enumCases.flatMap(({ command, arg, values }) =>
        values
          .filter((value) => !completion.includes(value))
          .map((value) => `${shell}: ${command}.${arg} missing enum value ${value}`),
      );

      expect(missing).toEqual([]);
    }
  });

  test('completion argument metadata classifies static inserts by schema shape', () => {
    const sellArgs = completionArgsForCommand('sell', BUNDLED_COMMAND_REGISTRY.allCommands.sell);
    const buyArgs = completionArgsForCommand('buy', BUNDLED_COMMAND_REGISTRY.allCommands.buy);

    expect(sellArgs.find((arg) => arg.name === 'item_id')).toMatchObject({
      kind: 'id',
      insert: 'item_id=',
    });
    expect(buyArgs.find((arg) => arg.name === 'delivery')).toMatchObject({
      kind: 'enum',
      values: ['cargo', 'storage'],
    });
  });

  test('nullable booleans retain boolean completion metadata', () => {
    const config: CommandConfig = {
      args: ['enabled'],
      route: { tool: 'probe', action: 'union', method: 'POST' },
      schema: { enabled: { type: ['boolean', 'null'], description: 'Enable the probe.' } },
    };

    expect(completionArgsForCommand('union_probe', config)).toEqual([
      {
        name: 'enabled',
        description: 'Enable the probe.',
        values: ['true', 'false'],
        insert: 'enabled=',
        kind: 'boolean',
      },
    ]);
  });

  test('shell completions include local top-level commands', () => {
    const expectedCommands = ['config', 'doctor', 'version', 'profile', 'ids', 'where-can-i', 'sync-api'];

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      const actual =
        shell === 'bash'
          ? bashTopLevelCommandWords(completion)
          : shell === 'zsh'
            ? zshTopLevelCommandWords(completion)
            : fishTopLevelCommandWords(completion);
      const missing = expectedCommands.filter((command) => !actual.includes(command));

      expect(missing, `${shell} completion is missing local top-level commands`).toEqual([]);
    }
  });

  test('shell completions expose nested groups instead of grouped flat commands', () => {
    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      const topLevel =
        shell === 'bash'
          ? bashTopLevelCommandWords(completion)
          : shell === 'zsh'
            ? zshTopLevelCommandWords(completion)
            : fishTopLevelCommandWords(completion);

      expect(topLevel, shell).toContain('faction');
      expect(topLevel, shell).toContain('facility');
      expect(topLevel, shell).toContain('trade');
      expect(topLevel, shell).not.toContain('faction_info');
      expect(topLevel, shell).not.toContain('facility_job_add');
      expect(topLevel, shell).not.toContain('trade_offer');
    }
  });

  test('shell completions include nested command group action values', () => {
    const expected = ['info', 'create_buy_order', 'invite'];
    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      if (shell === 'zsh') {
        expect(zshCommandCompletionPosition(completion, 'faction'), `${shell} faction action position`).toBe('2');
      }
      expect(commandCompletionWords(shell, completion, 'faction'), `${shell} faction actions`).toEqual(
        expect.arrayContaining(expected),
      );
    }
  });

  test('shell completions include local subcommand values', () => {
    const expectedValues = {
      config: ['user-agent'],
      completion: ['bash', 'zsh', 'fish'],
      ids: ['poi', 'system', 'item', 'player'],
      profile: ['list', 'default'],
    };

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      for (const [command, values] of Object.entries(expectedValues)) {
        expect(commandCompletionWords(shell, completion, command), `${shell} ${command} completion values`).toEqual(
          values,
        );
      }
    }
  });

  test('zsh explain completion only includes explainable registry commands', () => {
    const completion = generateCompletion('zsh');
    const topLevelCommands = zshFunctionCommandWords(completion, '_spacemolt_commands');
    const explainCommands = zshFunctionCommandWords(completion, '_spacemolt_explain_commands');

    expect(topLevelCommands).toContain('doctor');
    expect(topLevelCommands).toContain('version');
    expect(explainCommands).toContain('travel');
    expect(explainCommands).toContain('get_status');
    expect(explainCommands).not.toContain('doctor');
    expect(explainCommands).not.toContain('version');
    expect(explainCommands).not.toContain('completion');
    expect(explainCommands).not.toContain('commands');
  });

  test('shell completions include every parser-supported global option', () => {
    const globalOptions = [
      '--json',
      '-j',
      '--quiet',
      '-q',
      '--plain',
      '-p',
      '--debug',
      '--raw',
      '--allow-unknown',
      '-allow-unknown',
      '--dry-run',
      '--preview',
      '--no-timestamp',
      '--compact',
      '--structured',
      '--watch',
      '-w',
      '--format',
      '-fmt',
      '--jq',
      '--search',
      '--search-keys',
      '--search-values',
      '--search-regex',
      '--profile',
      '--field',
      '--extract',
      '--fields',
      '-f',
      '--help',
      '-h',
      '--version',
      '-v',
    ];

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
      const actual =
        shell === 'bash'
          ? bashGlobalOptionWords(completion)
          : shell === 'zsh'
            ? zshGlobalOptionWords(completion)
            : fishGlobalOptionWords(completion);
      const missing = globalOptions.filter((option) => !actual.includes(option));

      expect(missing, `${shell} completion is missing global options`).toEqual([]);
    }
  });

  test('zsh completion does not require values for boolean global flag aliases', () => {
    const completion = generateCompletion('zsh');

    expect(completion).toContain('"--dry-run[Preview supported mutations without executing]"');
    expect(completion).toContain('"--preview[Alias for --dry-run]"');
    expect(completion).not.toContain('"--dry-run[Preview supported mutations without executing]:dry-run:');
    expect(completion).not.toContain('"--preview[Alias for --dry-run]:preview:');
    expect(completion).toContain('"(-fmt --format)"{-fmt,--format}"[Output format]:format:(table json yaml text)"');
  });

  test('zsh global option word extraction ignores option-like description text', () => {
    const completion = `_spacemolt() {
  _arguments -C \\
    "--preview[Alias for --dry-run]" \\
    "1:command:_spacemolt_commands" \\
    "*::arg:->args"
}`;

    expect(zshGlobalOptionWords(completion)).toEqual(['--preview']);
  });

  test('fish completion only advertises separate values for value-taking global options', () => {
    const completion = generateCompletion('fish');

    expect(fishGlobalOptionLine(completion, '-l dry-run')).not.toContain(' -a ');
    expect(fishGlobalOptionLine(completion, '-l preview')).not.toContain(' -a ');
    expect(fishGlobalOptionLine(completion, '-l format')).toContain("-a 'table json yaml text'");
  });

  test('every command has a description from override or generated summary', () => {
    const missing: string[] = [];

    for (const [command, config] of Object.entries(COMMANDS)) {
      if (!config.description) {
        missing.push(command);
      }
    }

    expect(
      missing,
      `Commands missing description (add a description override or ensure the OpenAPI spec has a summary):\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  const numericMinimumRegistry = {
    commands: {
      numeric_minimum_probe: {
        args: ['integer_value', 'number_value', 'integer_values'],
        route: { tool: 'probe', action: 'numeric_minimum', method: 'POST' as const },
        schema: {
          integer_value: { type: 'integer', minimum: 1 },
          number_value: { type: 'number', minimum: 0.5 },
          integer_values: { type: 'integer', minimum: 1 },
        },
      },
    },
  } satisfies { commands: Record<string, CommandConfig> };

  test('schema validation enforces numeric minima after successful type parsing', () => {
    const accepted = [
      { integer_value: 1 },
      { integer_value: '2' },
      { number_value: 0.5 },
      { number_value: '0.75' },
      { integer_values: [1, '2'] },
    ];
    for (const payload of accepted) {
      expect(validatePayloadAgainstSchema('numeric_minimum_probe', payload, numericMinimumRegistry)).toEqual([]);
    }

    expect(
      validatePayloadAgainstSchema(
        'numeric_minimum_probe',
        { integer_value: 0, number_value: '0.25', integer_values: [1, '0', -1] },
        numericMinimumRegistry,
      ),
    ).toEqual([
      {
        field: 'integer_value',
        message: 'Parameter "integer_value" must be at least 1, but received 0.',
        code: 'below_minimum',
      },
      {
        field: 'number_value',
        message: 'Parameter "number_value" must be at least 0.5, but received "0.25".',
        code: 'below_minimum',
      },
      {
        field: 'integer_values',
        message: 'Parameter "integer_values" must be at least 1, but received "0".',
        code: 'below_minimum',
      },
      {
        field: 'integer_values',
        message: 'Parameter "integer_values" must be at least 1, but received -1.',
        code: 'below_minimum',
      },
    ]);
  });

  test('schema minimum validation does not duplicate type errors or mutate payloads', () => {
    const payload = { integer_value: '1.5', number_value: 'not-a-number' };
    const before = structuredClone(payload);

    expect(validatePayloadAgainstSchema('numeric_minimum_probe', payload, numericMinimumRegistry)).toEqual([
      {
        field: 'integer_value',
        message: 'Parameter "integer_value" must be an integer, but received "1.5".',
        code: 'invalid_integer',
      },
      {
        field: 'number_value',
        message: 'Parameter "number_value" must be a number, but received "not-a-number".',
        code: 'invalid_number',
      },
    ]);
    expect(payload).toEqual(before);
  });

  test('schema validation catches invalid enum values', () => {
    const errors = validatePayloadAgainstSchema('register', { empire: 'invalid_empire' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_enum');
    expect(errors[0]?.field).toBe('empire');
  });

  test('schema validation catches invalid integers', () => {
    const errors = validatePayloadAgainstSchema('get_battle_log', { id: 'battle-1', limit: 'abc' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_integer');
  });

  test('schema validation catches boolean typos with suggestions', () => {
    const errors = validatePayloadAgainstSchema('cloak', { enable: 'flase' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_boolean');
    expect(errors[0]?.message).toContain('Did you mean');
  });

  test('schema validation passes for valid payloads', () => {
    const errors = validatePayloadAgainstSchema('register', {
      username: 'test',
      empire: 'solarian',
      registration_code: 'abc123',
    });
    expect(errors).toEqual([]);
  });
});
