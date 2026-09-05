import { describe, expect, test } from 'bun:test';
import {
  convertPayloadTypes,
  getArgNames,
  normalizeParsedPayload,
  parseArgs,
  validatePayloadAgainstSchema,
} from './args';
import { CURATED_COMMAND_DESCRIPTIONS } from './command-descriptions.ts';
import type { GroupedCommandName } from './command-groups';
import { BATTLE_SHIPYARD_COMMAND_OVERRIDES } from './command-overrides-battle-shipyard';
import { COMMERCE_FACILITY_COMMAND_OVERRIDES } from './command-overrides-commerce-facility';
import { CORE_COMMAND_OVERRIDES } from './command-overrides-core';
import { FACTION_SOCIAL_COMMAND_OVERRIDES } from './command-overrides-faction-social';
import {
  NOTIFICATION_TYPE_ENUM,
  NOTIFICATION_TYPES_FIELD_DESCRIPTION,
  QUERY_REFERENCE_COMMAND_OVERRIDES,
} from './command-overrides-query-reference';
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

function registryHasRelatedCommand(name: string): boolean {
  if (BUNDLED_COMMAND_REGISTRY.commands[name] || BUNDLED_COMMAND_REGISTRY.allCommands[name] || COMMANDS[name]) {
    return true;
  }
  for (const group of Object.values(BUNDLED_COMMAND_REGISTRY.commandGroups)) {
    if (!group) continue;
    if (group.name === name || group.actions[name]) return true;
    for (const action of Object.values(group.actions)) {
      if (action.command === name || action.displayName === name) return true;
    }
  }
  return false;
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
      'faction_personnel',
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

  test('register username help keeps OpenAPI character rules and notes station-id collision', () => {
    const generated = GENERATED_API_ROUTES['POST /api/v2/spacemolt_auth/register']?.schema?.username?.description ?? '';
    const curated = BUNDLED_COMMAND_REGISTRY.commands.register?.schema?.username?.description;
    expect(generated).not.toBe('');
    expect(curated).toContain(generated);
    expect(curated).toContain('station id');
    expect(curated).toContain('ignores case');
    expect(curated).toContain('whole name');
    expect(curated).toContain('contain a station word');
    expect(curated).not.toBe(generated);
    expect(BUNDLED_COMMAND_REGISTRY.commands.login?.schema?.username?.description).toBe('Your username');
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
    expect(config?.description).toContain('intact prize');

    const help = captureHelp('scan');
    expect(help).toContain('spacemolt scan');
    expect(help).toContain('[target_id]');
    expect(help).toContain('area sensor sweep');
    expect(help).toContain('creature');
    expect(help).toContain('intact prize');
  });

  test('attack help documents persistent battle semantics and repeat-attack risks', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.attack;
    expect(config?.usage).toMatch(/player.*pirate.*empire NPC.*wildlife.*intact prize.*station/i);
    expect(config?.description).toContain('persistent system battle');
    expect(config?.description).toContain('resolves automatically each tick');
    expect(config?.description).toContain('never fires an extra volley');
    expect(config?.description).toContain('reapplies reputation loss');
    expect(config?.description).toContain('resummons available pirate combatants');
    expect(config?.description).toContain('Wildlife stays single-target');
    expect(config?.description).toContain('station attacks start sieges');
    expect(config?.description).toContain('get_battle_status');
    expect(config?.description).toContain('intact prize');
    expect(config?.description).toContain('get_nearby');
    expect(config?.description).toContain('current POI');
    expect(config?.description).toContain('intercepts the physical captured hull');
    expect(config?.seeAlso).toEqual(
      expect.arrayContaining(['get_nearby', 'get_battle_status', 'battle_target', 'battle_stance']),
    );

    expect(config?.schema?.id?.description).toContain('intact-prize actor');
    expect(config?.schema?.id?.description).toContain('Prize actor IDs come from get_nearby');

    const help = captureHelp('attack');
    expect(help).toContain('persistent system battle');
    expect(help).toContain('never fires an extra volley');
    expect(help).toContain('resummons available pirate combatants');
    expect(help).toContain('station attacks start sieges');
    expect(help).toContain('get_battle_status');
    expect(help).toContain('intact prize');
    expect(help).toContain('Prize actor IDs come from get_nearby');
    expect(help).toContain('shelling an empire station is a serious crime');
    expect(help).toContain('get_nearby');
  });

  test('battle_engage help only offers joining an existing battle', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.battle_engage;
    expect(config?.required ?? []).toEqual([]);
    expect(config?.usage).toContain('[side_id]');
    expect(config?.usage).toContain('numeric');
    expect(config?.description).toContain('Join an existing battle');
    expect(config?.description).toContain('cannot start a battle');
    expect(config?.description).toContain('faction-based auto-assignment');
    expect(config?.description).toContain('Does not cost a tick');
    expect(config?.example).toBe('spacemolt battle_engage 1');
    expect(config?.seeAlso).toEqual(
      expect.arrayContaining(['attack', 'get_battle_status', 'battle_target', 'battle_stance']),
    );
    expect(COMMANDS.battle_engage?.schema?.side_id?.type).toBe('integer');
    expect(convertPayloadTypes({ side_id: '2' }, 'battle_engage')).toEqual({ side_id: 2 });

    const help = captureHelp('battle_engage');
    expect(help).toContain('[side_id]');
    expect(help).toContain('cannot start a battle');
    expect(help).toContain('faction-based auto-assignment');
    expect(help).toContain('Does not cost a tick');
  });

  test('tactical battle commands document that only reload costs a tick', () => {
    for (const command of ['battle_advance', 'battle_retreat', 'battle_stance', 'battle_target', 'battle_engage']) {
      const config = BUNDLED_COMMAND_REGISTRY.allCommands[command];
      expect(config?.description).toContain('Does not cost a tick');
      expect(captureHelp(command)).toContain('Does not cost a tick');
    }
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.reload?.description).toContain('only battle command that costs a tick');
    expect(captureHelp('reload')).toContain('only battle command that costs a tick');

    const fullHelp = captureFullHelp();
    expect(fullHelp).toContain('Join an existing battle only (no tick)');
    expect(fullHelp).toContain('Advance battle range (no tick)');
    expect(fullHelp).toContain('Retreat from battle (no tick)');
    expect(fullHelp).toContain('Set stance (fire/evade/brace/flee/board; no tick)');
    expect(fullHelp).toContain('Focus by ID or name (any combatant; no tick)');
    expect(fullHelp).toContain('Reload weapon with ammo (costs a tick)');
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

  test('get_nearby help lists intact prizes and prize id fields', () => {
    const nearby = BUNDLED_COMMAND_REGISTRY.allCommands.get_nearby;
    expect(nearby?.description).toContain('intact prizes');
    expect(nearby?.description).toContain('actor_id');
    expect(nearby?.description).toContain('prize_id');
    expect(nearby?.description).toContain('claim_prize');
    expect(nearby?.seeAlso).toEqual(expect.arrayContaining(['scan', 'hunt', 'attack', 'claim_prize']));
    const help = captureHelp('get_nearby');
    expect(help).toContain('intact prizes');
    expect(help).toContain('primary_color');
    expect(help).toContain('secondary_color');
    expect(help).not.toContain('captor_kind');
    expect(CURATED_COMMAND_DESCRIPTIONS.get_nearby).toContain('intact prizes');
    expect(CURATED_COMMAND_DESCRIPTIONS.get_nearby).not.toContain('Get other players');
    expect(CURATED_COMMAND_DESCRIPTIONS.get_nearby).not.toBe(nearby?.description);
  });

  test('observation and battle help document livery, captor_kind, and plundered', () => {
    const observationHelp = captureHelp('subscribe_observation');
    expect(observationHelp).toContain('livery');
    expect(observationHelp).not.toContain('captor_kind');

    expect(captureHelp('get_battle_summary')).toContain('captor_kind');
    expect(captureHelp('get_battle_log')).toContain('plundered (cargo taken, hull left)');

    const statusHelp = captureHelp('get_battle_status');
    expect(statusHelp).not.toContain('plundered (cargo taken, hull left)');
    expect(statusHelp).not.toContain('Boarding Event');
  });

  test('battle_stance documents board, optional target, and server-required marines', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.battle_stance;
    expect(config?.usage).toContain('[target]');
    expect(config?.usage).toContain('[marines=N]');
    expect(config?.description).toContain('server requires');
    expect(config?.description).toContain('board');
    expect(config?.description).toContain('marines');
    expect(config?.description).toContain('Does not cost a tick');
    expect(config?.example).toBe('spacemolt battle_stance board pirate-1 marines=8');
    expect(config?.discoverWith).toEqual(expect.arrayContaining(['get_battle_status']));
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.battle_stance?.positionals).toEqual(['stance', 'target']);
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.battle_stance?.aliases).toEqual({
      stance: 'id',
      target_id: 'target',
    });
    expect(config?.required).toEqual(['stance']);
    expect(config?.schema?.id?.enum).toEqual(expect.arrayContaining(['board']));
    expect(config?.schema?.id?.description).toContain('target');
    expect(config?.schema?.id?.description).not.toContain('target_id');
    expect(config?.schema?.marines?.minimum).toBe(1);

    const generatedId = GENERATED_API_ROUTES['POST /api/v2/spacemolt_battle/stance']?.schema?.id?.description;
    expect(generatedId).toBeDefined();
    const adaptedId = generatedId?.replace('requires target_id and marines', 'the server requires target and marines');
    expect(config?.schema?.id?.description).toBe(adaptedId);
    expect(config?.schema?.id?.description).not.toContain('target_id');

    expect(config?.description).toContain('effective speed');
    expect(config?.description).toContain('intercept');
    expect(config?.description).toContain('kite');
    expect(config?.schema?.target?.description).toContain('not capturable');

    const generatedTarget = GENERATED_API_ROUTES['POST /api/v2/spacemolt_battle/stance']?.schema?.target?.description;
    expect(generatedTarget).toBeDefined();
    expect(config?.schema?.target?.description).toBe(
      `${generatedTarget} Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).`,
    );
    expect(config?.schema?.target?.description).toContain('pirate_1');
    expect(config?.schema?.target?.description).toContain('pirate-1');
    expect(config?.schema?.target?.description?.startsWith(generatedTarget ?? '')).toBe(true);

    const help = captureHelp('battle_stance');
    expect(help).toContain('[target]');
    expect(help).toContain('[marines=N]');
    expect(help).toContain('server requires');
    expect(help).toContain('Does not cost a tick');
    expect(help).toContain('effective speed');
    expect(help).toContain('intercept');
    expect(help).toContain('kite');
    expect(help).toContain('not capturable');
    expect(help).toContain('pirate_1');
    expect(help).toContain('pirate-1');

    expect(captureFullHelp()).toContain('Set stance (fire/evade/brace/flee/board; no tick)');

    const completionArgs = completionArgsForCommand('battle_stance', config);
    expect(completionArgs.find((arg) => arg.name === 'stance')).toMatchObject({
      kind: 'enum',
      values: expect.arrayContaining(['board']),
    });
    expect(completionArgs.some((arg) => arg.name === 'target')).toBe(true);
  });

  test('battle_target help documents ID or name targeting for any combatant', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.battle_target;
    expect(config?.usage).toContain('target_id_or_name');
    expect(config?.description).toContain('intact prizes');
    expect(config?.example).toBe('spacemolt battle_target "Pirate Skiff"');
    expect(config?.seeAlso).toEqual(expect.arrayContaining(['get_battle_status']));
    // Positional stays target_id (wire alias → id); not exposed on assembled CommandConfig
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.battle_target?.positionals).toEqual(['target_id']);
    expect(config?.schema?.id?.description).toContain('intact prizes');
    expect(config?.schema?.id?.description).toBe(
      'ID or name of any battle combatant from get_battle_status (players, pirates, police, drones, creatures, stations, or intact prizes). Board stance (not focus fire) rejects creatures, drones, and stations because they are not capturable. Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).',
    );
    expect(config?.schema?.id?.description).not.toBe(
      GENERATED_API_ROUTES['POST /api/v2/spacemolt_battle/target']?.schema?.id?.description,
    );
    expect(config?.schema?.id?.description).toContain(
      'Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).',
    );

    const help = captureHelp('battle_target');
    expect(help).toContain('target_id_or_name');
    expect(help).toContain('intact prizes');
    expect(help).toContain(
      'Board stance (not focus fire) rejects creatures, drones, and stations because they are not capturable.',
    );
    expect(help).toContain('Underscore aliases resolve hyphenated IDs on the server (pirate_1 matches pirate-1).');
    expect(help).not.toContain('Board attempts against');
    expect(help).not.toContain('entering the board stance');
    for (const kind of ['creatures', 'drones', 'stations'] as const) {
      expect(config?.description).toContain(kind);
      expect(help).toContain(kind);
    }

    // KD-9: Battle cheatsheet in full help stays aligned with command help
    expect(captureFullHelp()).toContain('Focus by ID or name (any combatant; no tick)');
  });

  test('arena group claims curated flats with distinct Battle copy and challenge player alias', () => {
    const arena = BUNDLED_COMMAND_REGISTRY.commandGroups.arena;
    expect(arena).toBeDefined();
    expect(Object.keys(arena?.actions ?? {}).sort()).toEqual([
      'accept',
      'cancel',
      'challenge',
      'challenges',
      'decline',
      'fight',
      'status',
    ]);

    const status = arena?.actions.status?.config;
    const challenge = arena?.actions.challenge?.config;
    const accept = arena?.actions.accept?.config;
    const decline = arena?.actions.decline?.config;
    const cancel = arena?.actions.cancel?.config;
    const challenges = arena?.actions.challenges?.config;
    const fight = arena?.actions.fight?.config;

    expect(status?.category).toBe('Battle');
    expect(challenge?.category).toBe('Battle');
    expect(accept?.category).toBe('Battle');
    expect(decline?.category).toBe('Battle');
    expect(cancel?.category).toBe('Battle');
    expect(challenges?.category).toBe('Battle');
    expect(fight?.category).toBe('Battle');

    expect(status?.description).toContain('arena lobby');
    expect(challenge?.description).toContain('Challenge a pilot');
    expect(accept?.description).toContain('Accept the incoming arena challenge');
    expect(decline?.description).toContain('Decline the incoming arena challenge');
    expect(cancel?.description).toContain('Withdraw your own unanswered arena challenge');
    expect(challenges?.description).toContain('NPC arena trial');
    expect(challenges?.description).not.toContain('Consequence-free combat at an arena POI: challenge a pilot');
    expect(fight?.description).toContain('unlocked NPC trial');
    expect(fight?.description).not.toContain('Consequence-free combat at an arena POI: challenge a pilot');

    const descriptions = [status, challenge, accept, decline, cancel, challenges, fight].map(
      (config) => config?.description,
    );
    expect(new Set(descriptions).size).toBe(7);
    const generatedSummary = GENERATED_API_ROUTES['POST /api/v2/spacemolt_arena/status']?.summary ?? '';
    expect(generatedSummary).toBeTruthy();
    for (const description of descriptions) {
      expect(description).not.toBe(generatedSummary);
    }

    expect(fight?.usage).toContain('<challenge_id>');
    expect(fight?.args).toEqual(['challenge_id']);
    expect(fight?.required).toEqual(['challenge_id']);
    expect(fight?.aliases).toEqual({ challenge_id: 'id' });
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_fight?.positionals).toEqual(['challenge_id']);
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_fight?.aliases).toEqual({ challenge_id: 'id' });
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_challenges?.discoverWith).toEqual(['arena_status', 'get_poi']);
    expect(status?.seeAlso).toEqual(expect.arrayContaining(['arena_challenges', 'arena_fight']));

    expect(challenge?.usage).toContain('<player>');
    expect(challenge?.usage).toContain('[max_side_size=N]');
    expect(challenge?.args).toEqual(['player']);
    expect(challenge?.required).toEqual(['player']);
    expect(challenge?.aliases).toEqual({ player: 'id', player_id: 'id' });
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_challenge?.positionals).toEqual(['player']);
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_challenge?.aliases).toEqual({ player_id: 'id' });
    expect(BATTLE_SHIPYARD_COMMAND_OVERRIDES.arena_challenge?.discoverWith).toEqual([
      'get_poi',
      'get_nearby',
      'arena_status',
    ]);
    expect(QUERY_REFERENCE_COMMAND_OVERRIDES.get_poi?.seeAlso).toEqual(['arena_status']);

    expect(BUNDLED_COMMAND_REGISTRY.commands.arena_status).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.arena_challenge).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.arena_challenge).toBeUndefined();

    const challengeHelp = captureHelp('arena challenge');
    expect(challengeHelp).toContain('<player>');
    expect(challengeHelp).toContain('max_side_size');
    expect(challengeHelp).toContain('solo duel');
    expect(challengeHelp).not.toContain('Consequence-free combat at an arena POI: challenge a pilot');

    expect(captureFullHelp()).toContain('arena status              Arena lobby: record, pending challenges, XP cap');
    expect(captureFullHelp()).toContain('arena challenge <player>  Consequence-free duel at an arena POI');
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
    expect(commission?.usage).toContain('bare_hull=true/false');
    expect(commission?.usage).toContain('source_missing_materials=true/false');
    expect(commission?.usage).toContain('provide_materials=true/false');
    expect(commission?.description).toContain('bare_hull=true');
    expect(commission?.description).toContain('source_missing_materials=true');
    expect(commission?.description).toContain('Do not combine provide_materials with source_missing_materials');
    expect(commission?.description).toContain('do not market-source missing materials');
    expect(commission?.description).toContain('NPC, empire, and faction yards');
    expect(commission?.example).toBe('spacemolt commission_ship viper source_missing_materials=true');
    expect(commission?.seeAlso).toEqual(['commission_quote', 'commission_status', 'catalog']);
    expect(commission?.args).toEqual(['ship_class', 'provide_materials']);
    expect(commission?.schema?.bare_hull?.type).toBe('boolean');
    expect(commission?.schema?.source_missing_materials?.type).toBe('boolean');
    expect(CURATED_COMMAND_DESCRIPTIONS.commission_ship).toBe(
      'Commission a ship at this shipyard. Default fitted; optional bare_hull. Empire/NPC: credits, provide_materials, or source_missing_materials (not both). Faction yards: fund_from_faction=true (ManageTreasury), no market sourcing.',
    );

    const licenseHelp = captureHelp('buy_ship_license');
    expect(licenseHelp).toContain('ship_class');
    expect(licenseHelp).toContain('specific ship design');

    const commissionHelp = captureHelp('commission_ship');
    expect(commissionHelp).toContain('fund_from_faction');
    expect(commissionHelp).toContain('bare_hull=true/false');
    expect(commissionHelp).toContain('source_missing_materials=true/false');
    expect(commissionHelp).toContain('Do not combine provide_materials with source_missing_materials');
    expect(commissionHelp).toContain('do not market-source missing materials');
    expect(commissionHelp).toContain('If true, commission only the hull without its default module loadout.');
    expect(commissionHelp).toContain('Do not combine with provide_materials.');
    expect(commissionHelp).toContain('spacemolt commission_ship viper source_missing_materials=true');
    expect(commissionHelp).toMatch(/Arguments:\n {2}ship_class, provide_materials\n/);
  });

  test('commission_quote documents bare_hull and source_missing_materials', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.commission_quote;
    expect(config?.usage).toContain('<ship_class>');
    expect(config?.usage).toContain('bare_hull=true/false');
    expect(config?.usage).toContain('source_missing_materials=true/false');
    expect(config?.description).toContain('bare_hull=true quotes the hull without its default module loadout');
    expect(config?.description).toContain(
      'source_missing_materials=true previews stacks taken from cargo then station storage',
    );
    expect(config?.description).not.toContain('provide_materials');
    expect(config?.description).toContain('Default quotes a fitted hull');
    expect(config?.description).toContain('faction yards do not market-source missing materials');
    expect(config?.description).toContain('same bare_hull and source_missing_materials choices');
    expect(config?.example).toBe('spacemolt commission_quote viper source_missing_materials=true');
    expect(config?.seeAlso).toEqual(['commission_ship', 'commission_status']);
    expect(config?.args).toEqual(['ship_class']);

    const help = captureHelp('commission_quote');
    expect(help).toContain('<ship_class> [bare_hull=true/false] [source_missing_materials=true/false]');
    expect(help).toContain('bare_hull=true quotes the hull without its default module loadout');
    expect(help).toContain('If true, quote the hull without its default module loadout.');
    expect(help).toContain(
      'Preview the materials you can contribute, the remaining deficit, and partial-sourcing total.',
    );
    expect(help).toContain('spacemolt commission_quote viper source_missing_materials=true');
    expect(help).toContain('Default quotes a fitted hull');
    expect(help).toContain('faction yards do not market-source missing materials');
    expect(help).not.toContain('provide_materials');
  });

  test('full help shipyard notes fitted default and partial sourcing', () => {
    const help = captureFullHelp();
    expect(help).toContain('Order a custom ship (fitted default; optional bare hull)');
    expect(help).toContain('Quote a build (bare hull / partial sourcing)');
  });

  test('craft help documents queued station-storage production and packages', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.craft;
    expect(config?.args).toEqual(['recipe_id', 'quantity']);
    expect(config?.aliases).toMatchObject({ recipe_id: 'id' });
    expect(config?.usage).toContain('source=storage|faction|faction:<bucket>|cargo');
    expect(config?.usage).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('package_ids=id[,id...]');
    expect(config?.usage).toContain('output_package_label');
    expect(config?.usage).toContain('items=JSON');
    expect(config?.usage).toContain('package_id');
    expect(config?.usage).toContain('label');
    expect(config?.usage).toContain('target=');
    expect(config?.arrayFields).toEqual(['package_ids']);
    expect(config?.description).toContain('faction:<bucket>');
    expect(config?.description).toContain('package_ids');
    expect(config?.description).toContain('no storage/cargo backfill');
    expect(config?.description).toContain('empty cargo_containers are reclaimed only when accessible Logistics');
    expect(config?.description).toContain('output_package_label');
    expect(config?.description).toContain('pack_package');
    expect(config?.description).toContain('unpack_package');
    expect(config?.description).toContain('spacemolt craft pack_package items=');
    expect(config?.example).toContain('package_ids');
    expect(config?.example).toContain('output_package_label');
    expect(config?.schema?.deliver_to?.enum).toBeUndefined();
    expect(config?.schema?.deliver_to?.description).toContain('faction:<bucket name or id>');
    expect(config?.schema?.deliver_to?.description).toContain(
      "with job_id to redirect an already queued job's remaining output",
    );
    expect(config?.schema?.deliver_to?.description).toContain('alias for target');
    expect(config?.schema?.source?.type).toBe('string');
    expect(config?.schema?.source?.description).toContain('cargo');
    expect(config?.schema?.items?.type).toBe('array');
    expect(config?.schema?.label?.type).toBe('string');
    expect(config?.schema?.package_id?.type).toBe('string');
    expect(config?.schema?.package_ids?.type).toBe('array');
    expect(config?.schema?.package_ids?.description).toContain('exactly');
    expect(config?.schema?.package_ids?.description).toContain('no storage/cargo backfill');
    expect(config?.schema?.package_ids?.description).toContain(
      'Empty cargo_containers are reclaimed only when an accessible Logistics facility is present',
    );
    expect(config?.schema?.output_package_label?.type).toBe('string');
    expect(config?.schema?.output_package_label?.description).toContain('Logistics');
    expect(config?.schema?.output_package_label?.description).toContain('cargo_container');
    expect(config?.schema?.dry_run?.description).toContain('packaged craft');
    expect(config?.schema?.dry_run?.description).toContain('bulk jobs');
    expect(config?.schema?.target?.type).toBe('string');
    expect(config?.schema?.action).toBeUndefined();
    expect(config?.schema?.job_id?.type).toBe('string');
    expect(config?.schema?.job_id?.description).toContain('job_id alone to cancel');
    expect(config?.schema?.job_id?.description).toContain('job_id with deliver_to to retarget');
    expect(config?.schema?.job_id?.description).toContain('queue position');
    expect(config?.schema?.job_id?.description).toContain('spacemolt craft with no recipe');
    expect(config?.schema?.job_ids?.description).toContain('spacemolt craft with no recipe');
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
    expect(help).toContain('List queued crafting');
    expect(help).toContain('list jobs with no recipe');
    expect(help).toContain('source=storage|faction|faction:<bucket>|cargo');
    expect(help).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(help).toContain('escrow');
    expect(help).toContain('dry_run');
    expect(help).toContain('jobs');
    expect(help).not.toContain('action=queue');
    expect(help).toContain('job_id');
    expect(help).toContain('spacemolt craft job_id=craft-job-1 deliver_to=faction:Workshop');
    expect(help).toContain('package pack/unpack jobs cannot be retargeted');
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
    expect(help).toContain('package_ids');
    expect(help).toContain('output_package_label');
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
    expect(config?.usage).toStartWith('[recipe_id]');
    expect(config?.usage).not.toContain('<recipe_id>');
    expect(config?.usage).toContain('source=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('deliver_to=storage|faction|faction:<bucket>');
    expect(config?.usage).toContain('preset=fast|cheap|prefer_own');
    expect(config?.schema?.deliver_to?.enum).toBeUndefined();
    expect(config?.schema?.deliver_to?.description).toContain('faction:<bucket name or id>');
    expect(config?.schema?.deliver_to?.description).toContain(
      "with job_id to redirect an already queued job's remaining output",
    );
    expect(config?.schema?.source?.type).toBe('string');
    expect(config?.schema?.job_id?.type).toBe('string');
    expect(config?.schema?.job_id?.description).toContain('job_id alone to cancel');
    expect(config?.schema?.job_id?.description).toContain('job_id with deliver_to to retarget');
    expect(config?.schema?.job_id?.description).not.toContain('action=queue');
    expect(config?.schema?.job_id?.description).toContain('spacemolt craft');
    expect(config?.schema?.job_id?.description).toContain('facility_job_list');
    expect(config?.schema?.job_ids?.description).not.toContain('action=queue');
    expect(config?.schema?.job_ids?.description).toContain('spacemolt craft');
    expect(config?.schema?.job_ids?.description).toContain('facility_job_list');
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
    expect(help).not.toContain('action=queue');
    expect(help).toContain('spacemolt craft');
    expect(help).toContain('facility_job_list');
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
    expect(help).toContain('spacemolt recycle job_id=recycle-job-1 deliver_to=faction:Scrap');
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

  test('view_market help teaches Company Store narrowing', () => {
    const viewMarket = BUNDLED_COMMAND_REGISTRY.commands.view_market;
    expect(viewMarket?.description).toContain('public plus your faction');
    expect(viewMarket?.description).toContain('best price');
    expect(viewMarket?.description).toContain('narrows');
    expect(viewMarket?.description).toContain('Company Store');
    expect(viewMarket?.description).not.toContain('or pass company_store=true to show');
    expect(viewMarket?.description).not.toContain('station book');
    expect(viewMarket?.usage).toContain('narrows to only your faction');

    const viewMarketHelp = captureHelp('view_market');
    expect(viewMarketHelp).toContain('[company_store=true]');
    expect(viewMarketHelp).toContain('public plus your faction');
    expect(viewMarketHelp).toContain('narrows to only those private listings');
  });

  test('subscribe_market help teaches public liquidity', () => {
    const subscribe = BUNDLED_COMMAND_REGISTRY.commands.subscribe_market;
    expect(subscribe?.description).toContain('public liquidity');
    expect(subscribe?.description).not.toContain('public-liquidity');

    const subscribeHelp = captureHelp('subscribe_market');
    expect(subscribeHelp).toContain('public liquidity');
    expect(subscribeHelp).toContain('Company Store');
    expect(subscribeHelp).toContain('view_market company_store=true');
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
    expect(config?.usage).toContain('package_ids');
    expect(config?.arrayFields).toEqual(['package_ids']);
    expect(config?.schema?.bucket?.description).toContain('Storage Extension bucket');
    expect(config?.schema?.package_ids?.type).toBe('array');

    const help = captureHelp(action?.displayName || 'faction build');
    expect(help).toContain('[bucket=name-or-id]');
    expect(help).toContain('Storage Extension bucket');
    expect(help).toContain('package_ids');
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
    expect(config?.arrayFields).toEqual(['package_ids']);
    expect(config?.usage).toContain('package_ids');
    expect(config?.schema?.package_ids?.type).toBe('array');

    const help = captureHelp(action?.displayName || 'facility build');
    expect(help).toContain('faction facility types are accepted');
    expect(help).toContain('package_ids');
    expect(help).not.toContain('Build a player facility at the current base.');
  });

  test('facility upgrade and faction facility_upgrade expose package_ids arrays', () => {
    const personal = BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions.upgrade?.config;
    const faction = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.facility_upgrade?.config;
    expect(personal?.arrayFields).toEqual(['package_ids']);
    expect(faction?.arrayFields).toEqual(['package_ids']);
    expect(personal?.usage).toContain('package_ids');
    expect(faction?.usage).toContain('package_ids');
  });

  test('facility dismantle help documents per-tier packages and cargo_container cost', () => {
    for (const [group, action] of [
      ['facility', 'dismantle'],
      ['faction', 'dismantle'],
    ] as const) {
      const config = BUNDLED_COMMAND_REGISTRY.commandGroups[group]?.actions[action]?.config;
      expect(config?.description).toContain('one package per upgrade tier');
      expect(config?.description).toContain('cargo_container');
      expect(config?.description).toContain('dismantle_outpost');
      expect(config?.description).toContain('fuel bunkers cannot be dismantled alone');
      expect(config?.description).toContain('without repairing');
      expect(config?.description).toContain('cancels');
      expect(config?.description).toContain('still dismantling');
      expect(config?.seeAlso).toContain('dismantle_outpost');
      const help = captureHelp(`${group} ${action}`);
      expect(help).toContain('cargo_container');
      expect(help).toContain('package');
      expect(help).toContain('dismantle_outpost');
      expect(help).toContain('without repairing');
      expect(help).toContain('cancels');
      expect(help).toContain('still dismantling');
      if (group === 'facility') {
        expect(config?.description).toContain('other personal facilities');
        expect(help).toContain('other personal facilities');
      } else {
        expect(config?.description).toContain('Faction Storage');
        expect(help).toContain('Faction Storage');
      }
    }
  });

  test('dismantle_outpost is curated top-level with empty payload and bunker preconditions', () => {
    const config = COMMANDS.dismantle_outpost;
    expect(config).toBeDefined();
    expect(config?.route).toEqual({
      tool: 'spacemolt_facility',
      action: 'dismantle_outpost',
      method: 'POST',
    });
    expect(config?.args).toEqual([]);
    expect(config?.description).toContain('ManageBases');
    expect(config?.description).toContain('Outpost Kit');
    expect(config?.description).toContain('fuel bunkers cannot be dismantled alone');
    expect(config?.example).toBe('spacemolt dismantle_outpost');
    expect(config?.seeAlso).toEqual(
      expect.arrayContaining(['build_outpost', 'facility_dismantle', 'faction_dismantle', 'storage_view']),
    );
    expect(config?.discoverWith).toEqual(expect.arrayContaining(['build_outpost', 'storage_view', 'storage_withdraw']));
    // Must not blank the usage line via usage: ''
    expect(config?.usage === undefined || config.usage.length > 0).toBe(true);
    // Generated facility_dismantle_outpost is route-claimed away (check bundled registry, not
    // curated COMMANDS — generated fallbacks never appear on COMMANDS alone).
    expect(BUNDLED_COMMAND_REGISTRY.commands.facility_dismantle_outpost).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.allCommands.facility_dismantle_outpost).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions.dismantle_outpost).toBeUndefined();

    const help = captureHelp('dismantle_outpost');
    expect(help).toContain('ManageBases');
    expect(help).toContain('Outpost Kit');
    expect(help).toContain('fuel bunkers');

    expect(COMMANDS.build_outpost?.seeAlso).toContain('dismantle_outpost');
  });

  test('storage deposit/withdraw help documents auto-docking, fleets, special targets, and ship towing', () => {
    const deposit = BUNDLED_COMMAND_REGISTRY.commandGroups.storage?.actions.deposit?.config;
    const withdraw = BUNDLED_COMMAND_REGISTRY.commandGroups.storage?.actions.withdraw?.config;
    for (const config of [deposit, withdraw]) {
      expect(config?.description).toContain('omitted target, target=self, or target=faction');
      expect(config?.description).toContain("auto-dock at the current POI's base");
      expect(config?.description).toContain('fleet leader docks the fleet');
    }
    expect(deposit?.description).toContain('before deposit validation');
    expect(deposit?.description).toContain('failed deposit may still leave you docked');
    expect(deposit?.description).toContain('Player gifts, empire donations, and faction:TAG donations');
    expect(deposit?.description).toContain('station:');
    expect(deposit?.description).toContain('send_gift');
    expect(deposit?.description).toContain('already be docked');
    expect(deposit?.description).toContain('they do not auto-dock');
    expect(deposit?.description).toContain('tow');
    expect(deposit?.description).toContain('tow rig');
    expect(deposit?.description).toContain('equal or smaller class scale');
    expect(deposit?.description).toContain('same scale is allowed');
    expect(deposit?.description).not.toContain('must be smaller');
    expect(withdraw?.description).toContain('towed own ship');
    expect(withdraw?.description).toContain('must be at the same station');
    expect(withdraw?.description).toContain('local path can auto-dock first');
    expect(deposit?.aliases?.ship_id).toBe('item_id');
    expect(withdraw?.aliases?.ship_id).toBe('item_id');
    expect(deposit?.schema?.item_id?.description).toContain('equal to or smaller than your active ship');
    expect(deposit?.schema?.item_id?.description).toContain('local path can auto-dock first');
    expect(withdraw?.schema?.item_id?.description).toContain('local withdrawal path can auto-dock first');
    expect(withdraw?.schema?.item_id?.description).toContain('must be at the same station');

    const depositHelp = captureHelp('storage deposit');
    expect(depositHelp).toContain('tow');
    expect(depositHelp).toContain('ship');
    expect(depositHelp).toContain('same scale is allowed');
    expect(depositHelp).toContain('before deposit validation');
    expect(depositHelp).toContain('faction:TAG donations');
    expect(depositHelp).toContain('send_gift');
    expect(depositHelp).toContain('they do not auto-dock');
    expect(depositHelp).toContain('station:<base-or-POI-ID>');

    const withdrawHelp = captureHelp('storage withdraw');
    expect(withdrawHelp).toContain("auto-dock at the current POI's base");
    expect(withdrawHelp).toContain('fleet leader docks the fleet');
    expect(withdrawHelp).toContain('local withdrawal path can auto-dock first');

    const tow = COMMANDS.tow_wreck;
    expect(tow?.description).toContain('storage deposit');
    expect(tow?.description).toContain('equal or smaller class scale');
    expect(tow?.description).not.toContain('smaller-scale');
    expect(tow?.seeAlso).toContain('storage_deposit');
    const release = COMMANDS.release_tow;
    expect(release?.description).toContain('storage withdraw');
  });

  test('claim_prize and service_prize are curated Salvage & Tow commands, not generated salvage_* names', () => {
    const claim = COMMANDS.claim_prize;
    expect(claim).toBeDefined();
    if (!claim) throw new Error('claim_prize command is missing from COMMANDS');
    expect(claim.usage).toBe('<prize_id> <destination_base_id> [crew_disposition=aboard|faction_reserve]');
    expect(claim.example).toBe('spacemolt claim_prize prize-1 earth_station');
    expect(claim.discoverWith).toEqual(['get_nearby', 'get_status', 'get_guide']);
    expect(claim.seeAlso).toEqual(['service_prize', 'recruit_personnel', 'get_status', 'get_guide']);
    expect(claim.category).toBe('Salvage & Tow');
    expect(claim.description).toBe('Assign prize crew and begin recovery of an intact captured ship');
    expect(CURATED_COMMAND_DESCRIPTIONS.claim_prize).toBe(claim.description);
    expect(claim.args).toEqual(['prize_id', 'destination_base_id']);
    expect(claim.aliases).toEqual({ prize_id: 'id', destination_base_id: 'target' });
    expect(claim.aliases?.target).toBeUndefined();
    expect(claim.route).toEqual({ tool: 'spacemolt_salvage', action: 'claim_prize', method: 'POST' });

    const service = COMMANDS.service_prize;
    expect(service).toBeDefined();
    if (!service) throw new Error('service_prize command is missing from COMMANDS');
    expect(service.usage).toBe(
      '<prize_id> <service_action> [quantity=N] [destination_base_id=...] (stop|resume|redirect|refuel|repair)',
    );
    expect(service.example).toBe('spacemolt service_prize prize-1 refuel');
    expect(service.discoverWith).toEqual(['get_nearby', 'get_status']);
    expect(service.seeAlso).toEqual(['claim_prize', 'refuel', 'repair', 'get_guide']);
    expect(service.category).toBe('Salvage & Tow');
    expect(service.description).toBe('Stop, resume, redirect, refuel, or repair a claimed intact prize');
    expect(CURATED_COMMAND_DESCRIPTIONS.service_prize).toBe(service.description);
    expect(service.args).toEqual(['prize_id', 'service_action']);
    expect(service.required).toEqual(['prize_id', 'service_action']);
    expect(getArgNames(service)).toEqual(['prize_id', 'service_action']);
    expect(service.aliases).toEqual({
      prize_id: 'id',
      action: 'service_action',
      destination_base_id: 'target',
    });
    expect(service.aliases?.target).toBeUndefined();
    expect(service.route).toEqual({ tool: 'spacemolt_salvage', action: 'service_prize', method: 'POST' });

    expect(BUNDLED_COMMAND_REGISTRY.commands.salvage_claim_prize).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.salvage_service_prize).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.claim_prize?.category).not.toBe('Generated API');
    expect(BUNDLED_COMMAND_REGISTRY.commands.service_prize?.category).not.toBe('Generated API');

    for (const related of [...(claim.discoverWith ?? []), ...(claim.seeAlso ?? [])]) {
      expect(registryHasRelatedCommand(related), `claim_prize related command "${related}"`).toBe(true);
    }
    for (const related of [...(service.discoverWith ?? []), ...(service.seeAlso ?? [])]) {
      expect(registryHasRelatedCommand(related), `service_prize related command "${related}"`).toBe(true);
    }

    const claimHelp = captureHelp('claim_prize');
    expect(claimHelp).toContain('prize_id -> id');
    expect(claimHelp).toContain('destination_base_id -> target');
    const serviceHelp = captureHelp('service_prize');
    expect(serviceHelp).toMatch(/Arguments:\n {2}prize_id, service_action\n/);
    expect(serviceHelp).not.toMatch(/Arguments:\n {2}prize_id, service_action, action\n/);
    expect(serviceHelp).toContain('action -> service_action');

    const claimDryRun = createCommandConfigDryRunResponse('claim_prize', claim, {
      id: 'prize-1',
      target: 'earth_station',
    });
    expect(claimDryRun.result).toContain('Assigns minimum crew from the active ship');
    const serviceDryRun = createCommandConfigDryRunResponse('service_prize', service, {
      id: 'prize-1',
      service_action: 'refuel',
    });
    expect(serviceDryRun.result).toContain('refuel/repair consume ship fuel or repair kits');
  });

  test('facility repair help documents auto-rebuild, faction permissions, accounting, and completion discovery', () => {
    const repair = BUNDLED_COMMAND_REGISTRY.commandGroups.facility?.actions.repair?.config;
    expect(repair?.description).toContain('rebuilds its own faction');
    expect(repair?.description).toContain('every facility it can afford at once');
    expect(repair?.description).toContain('unpayable bill');
    expect(repair?.description).toContain('NPC-station repair bills');
    expect(repair?.description).toContain('player-faction stations pay full price');
    expect(repair?.description).not.toContain('one at a time');
    expect(repair?.description).toContain('jump the queue');
    expect(repair?.description).toContain("somebody else's station");
    expect(repair?.description).toContain('draw materials from faction storage');
    expect(repair?.description).toContain('facility-management rights');
    expect(repair?.description).toContain(
      'automatic rebuild spends and manual spends are recorded in the faction action log',
    );
    expect(repair?.description).toContain('next station maintenance cycle');
    expect(repair?.description).toContain('rounded up');
    expect(repair?.description).toContain('paid Faction Storage already under repair');
    expect(repair?.description).not.toContain('Facility listings expose when an in-progress repair completes');
    expect(repair?.description).toContain('get_action_log');
    expect(repair?.description).toContain('Damaged-station facility IDs also appear on get_base');
    expect(repair?.seeAlso).toContain('get_action_log');
    expect(repair?.seeAlso).toContain('get_base');
    expect(repair?.discoverWith).toContain('get_base');
    expect(repair?.schema?.facility_id?.description).toContain('auto-rebuilds');
    expect(repair?.schema?.facility_id?.description).toContain('facility_list or facility_owned');
    expect(repair?.schema?.facility_id?.description).toContain('faction_facility_list');
    expect(repair?.schema?.facility_id?.description).toContain('repair completion timing');
    expect(repair?.schema?.facility_id?.description).toContain('repair_complete_tick');
    expect(repair?.schema?.facility_id?.description).toContain('next station maintenance cycle');
    expect(repair?.schema?.facility_id?.description).toContain('get_base');
    expect(repair?.schema?.facility_id?.description).toContain('Facility ID in the repair queue');

    const help = captureHelp('facility repair');
    expect(help).toContain('jump the queue');
    expect(help).toContain('every facility it can afford at once');
    expect(help).toContain('player-faction stations pay full price');
    expect(help).toContain('faction storage');
    expect(help).toContain('get_action_log');
    expect(help).toContain('repair completion timing');
    expect(help).toContain('get_base');
    expect(help).toContain('next station maintenance cycle');
    expect(help).toContain('paid Faction Storage already under repair');
    expect(help).toContain('repair_complete_tick');
  });

  test('get_base help documents the repair queue and related commands', () => {
    expect(COMMANDS.get_base?.description).toContain('Get docked station details');
    expect(COMMANDS.get_base?.description).toContain('repair queue');
    expect(COMMANDS.get_base?.description).toContain('hull recovery');
    expect(COMMANDS.get_base?.description).toContain('combined');
    expect(COMMANDS.get_base?.description).toContain('shared stock');
    expect(COMMANDS.get_base?.description).toContain('missing supplies');
    expect(COMMANDS.get_base?.seeAlso).toEqual(['facility_repair', 'facility_list', 'view_market', 'storage']);

    const help = captureHelp('get_base');
    expect(help).toContain('repair queue');
    expect(help).toContain('combined');
    expect(help).toContain('shared stock');
    expect(help).toContain('facility repair');
    expect(help).toContain('facility list');
    expect(help).toContain('view_market');
    expect(help).toContain('storage');
    expect(help).not.toContain('`');
  });

  test('faction post_mission help documents item_id validation and objective-type rules', () => {
    const postMission = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.post_mission?.config;
    expect(postMission?.description).toContain('invalid_item');
    expect(postMission?.description).toContain('see Fields');
    expect(postMission?.description).not.toContain('kill_pirate');
    expect(postMission?.description).not.toContain('Intel Center');
    expect(postMission?.schema?.objectives?.description).toContain('deliver_item');
    expect(postMission?.schema?.objectives?.description).toContain('kill_pirate');
    expect(postMission?.schema?.objectives?.description).toContain('visit_system');
    expect(postMission?.schema?.objectives?.description).toContain('dock_at_base');
    expect(postMission?.schema?.objectives?.description).toMatch(/omit/i);
    expect(postMission?.schema?.objectives?.description).toContain('Intel Center');
    expect(postMission?.schema?.objectives?.description).toContain('Commerce Terminal');
    expect(postMission?.schema?.rewards?.description).toContain('invalid_item');
    expect(postMission?.schema?.rewards?.description).toContain('merged by quantity');
    expect(postMission?.schema?.rewards?.description).toContain('Names work as ids');

    const help = captureHelp('faction post_mission');
    expect(help).toContain('invalid_item');
    expect(help).toContain('deliver_item');
    expect(help).toContain('--payload-json');
    expect(help).toContain('Intel Center');
    expect(help).toContain('spacemolt faction post_mission');
    expect(help).not.toContain('spacemolt faction_post_mission');
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

  test('faction_personnel is curated on the faction group', () => {
    const action = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.personnel;
    const config = action?.config ?? COMMANDS.faction_personnel;
    expect(action?.displayName).toBe('faction personnel');
    expect(action?.command).toBe('faction_personnel');
    expect(COMMANDS.faction_personnel).toBeDefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.faction_personnel).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.ship_faction_personnel).toBeUndefined();
    expect(config?.route).toEqual({
      tool: 'spacemolt_ship',
      action: 'faction_personnel',
      method: 'POST',
    });
    expect(config?.route.defaults).toBeUndefined();
    expect(config?.aliases).toEqual({ action: 'personnel_action' });
    expect(config?.args).toEqual(['personnel_action']);
    expect(config?.example).toBe('spacemolt faction personnel status');
    expect(config?.seeAlso).toEqual([
      'recruit_personnel',
      'treat_personnel',
      'transfer_personnel',
      'faction_garages',
      'get_guide',
    ]);
    expect(config?.description).not.toContain('v1');
    expect(config?.description).not.toContain('personnel_action (legacy');
    expect(config?.schema?.fit_crew?.description).toBeTruthy();
    expect(config?.schema?.personnel_action?.enum).toEqual(['status', 'recruit', 'deposit', 'withdraw']);

    const help = captureHelp(action?.displayName || 'faction personnel');
    expect(help).toContain('spacemolt faction personnel status');
    expect(help).not.toContain('spacemolt faction_personnel');
    expect(help).toContain('personnel_action');
    expect(help).toContain('ManageTreasury');
    expect(help).toContain('faction garages');
    expect(help).toContain('get_guide');
    expect(help).toContain(
      'See also: recruit_personnel, treat_personnel, transfer_personnel, faction garages, get_guide',
    );
    expect(help).not.toContain('See also: faction_personnel');
    expect(help).not.toContain('legacy docs');
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

  test('faction_edit help documents ally access toggles', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commandGroups.faction?.actions.edit?.config;
    expect(config?.usage).toContain('ally_fuel_access');
    expect(config?.usage).toContain('ally_facility_access');
    expect(config?.usage).toContain('ally_intel_opt_out');
    expect(config?.description).toContain('ally-sharing toggles');
    expect(config?.description).toContain('fuel access');
    expect(config?.description).toContain('facility access');
    expect(config?.description).toContain('intel opt-out');
    expect(config?.example).toContain('ally_fuel_access=true');

    const help = captureHelp('faction edit');
    expect(help).toContain('ally_fuel_access');
    expect(help).toContain('ally_facility_access');
    expect(help).toContain('ally_intel_opt_out');
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
          enum: [...NOTIFICATION_TYPE_ENUM],
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
      // MCP-only auth helpers remain generated fallbacks (not curated CLI commands).
      'auth_login_link',
      'auth_login_link_poll',
      'battle_self_destruct',
      'shipping_accept',
      'shipping_cancel',
      'shipping_pay_debt',
      'shipping_profile',
    ]);
    expect(BUNDLED_COMMAND_REGISTRY.commands.ship_recruit_personnel).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.ship_treat_personnel).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.ship_transfer_personnel).toBeUndefined();

    expect(COMMANDS.recruit_personnel).toMatchObject({
      category: 'Ship management',
      usage: '[crew=N] [marines=N]  (docked; at least one count must be positive)',
      example: 'spacemolt recruit_personnel crew=4 marines=2',
      discoverWith: ['get_status', 'get_ship', 'get_base'],
      seeAlso: ['treat_personnel', 'transfer_personnel', 'faction_personnel', 'get_guide'],
      route: { tool: 'spacemolt_ship', action: 'recruit_personnel', method: 'POST' },
    });
    expect(COMMANDS.recruit_personnel?.aliases ?? {}).toEqual({});
    expect(COMMANDS.recruit_personnel?.required ?? []).toEqual([]);
    for (const command of ['recruit_personnel', 'treat_personnel', 'transfer_personnel']) {
      const help = captureHelp(command);
      expect(help).toContain('faction personnel');
      expect(help).not.toContain('faction_personnel');
    }
    expect(COMMANDS.treat_personnel).toMatchObject({
      category: 'Ship management',
      usage: '[target] [crew=N] [marines=N] [provider=station|field|faction] [reserve=true/false]',
      example: 'spacemolt treat_personnel provider=station',
      discoverWith: ['get_ship', 'get_status'],
      seeAlso: ['recruit_personnel', 'transfer_personnel', 'repair', 'faction_personnel', 'get_guide'],
      aliases: { target: 'id' },
      route: { tool: 'spacemolt_ship', action: 'treat_personnel', method: 'POST' },
    });
    expect(COMMANDS.treat_personnel?.args).toEqual(['target', 'crew', 'marines', 'provider', 'reserve']);
    expect(COMMANDS.treat_personnel?.required ?? []).toEqual([]);
    expect(
      completionArgsForCommand('treat_personnel', COMMANDS.treat_personnel).find((arg) => arg.name === 'provider'),
    ).toMatchObject({
      kind: 'enum',
      values: ['station', 'field', 'faction'],
    });
    expect(
      completionArgsForCommand('treat_personnel', COMMANDS.treat_personnel).find((arg) => arg.name === 'reserve'),
    ).toMatchObject({
      kind: 'boolean',
      values: ['true', 'false'],
    });
    expect(COMMANDS.transfer_personnel).toMatchObject({
      category: 'Ship management',
      usage:
        '<target> [fit_crew=N] [fit_marines=N] [injured_crew=N] [injured_marines=N]  (allied player at same POI; out of combat)',
      example: 'spacemolt transfer_personnel ally fit_crew=2',
      discoverWith: ['get_nearby', 'get_ship'],
      seeAlso: ['recruit_personnel', 'treat_personnel', 'faction_personnel', 'get_guide'],
      aliases: { target: 'id' },
      route: { tool: 'spacemolt_ship', action: 'transfer_personnel', method: 'POST' },
    });
    expect(COMMANDS.transfer_personnel?.args).toEqual([
      'target',
      'fit_crew',
      'fit_marines',
      'injured_crew',
      'injured_marines',
    ]);
    expect(COMMANDS.transfer_personnel?.required).toEqual(['target']);
    expect(BUNDLED_COMMAND_REGISTRY.commands.ship_faction_personnel).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.salvage_claim_prize).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.salvage_service_prize).toBeUndefined();
    expect(COMMANDS.faction_personnel).toBeDefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.faction_personnel).toBeUndefined();
    expect(BUNDLED_COMMAND_REGISTRY.commands.pay_bounty?.category).not.toBe('Generated API');
    const shippingList = BUNDLED_COMMAND_REGISTRY.commands.shipping_list;
    if (!shippingList) throw new Error('shipping_list command missing');
    expect(shippingList).toMatchObject({
      args: ['eligible_as', 'filter_destination', 'filter_service_level', 'filter_shipper', 'page', 'per_page', 'sort'],
      description:
        'List freight contracts you can accept from the current station. You must be docked, and only contracts posted at that station are shown. filter_destination accepts a station base ID or station POI ID.',
      usage:
        '[eligible_as=player|faction] [filter_destination=...] [filter_service_level=standard|priority] [filter_shipper=...] [sort=reward|distance|age] [page=...] [per_page=...]',
      example:
        'spacemolt shipping_list filter_destination=sirius_observatory_station filter_service_level=priority sort=distance',
      category: 'Missions',
      discoverWith: ['get_status'],
      seeAlso: ['shipping_active', 'shipping_quote', 'shipping_accept', 'shipping_profile'],
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
    const shippingActive = BUNDLED_COMMAND_REGISTRY.commands.shipping_active;
    if (!shippingActive) throw new Error('shipping_active command missing');
    // Avoid expect.arrayContaining / stringContaining inside toMatchObject on registry
    // objects — bun:test can replace matched properties with matcher instances.
    expect(shippingActive.description).toContain('live freight');
    expect(shippingActive.example).toBe('spacemolt shipping_active');
    expect(shippingActive.category).toBe('Missions');
    expect(shippingActive.discoverWith).toEqual(['get_status', 'get_cargo', 'shipping_list']);
    expect(shippingActive.seeAlso).toEqual([
      'shipping_list',
      'shipping_get',
      'shipping_track',
      'shipping_deliver',
      'shipping_return',
      'shipping_profile',
    ]);
    expect(shippingActive.route).toEqual({ tool: 'spacemolt_shipping', action: 'active', method: 'POST' });
    expect(shippingActive.required ?? []).toEqual([]);
    expect(shippingActive.usage).toBeUndefined();
    // package_id dual-identifier curation: explicit usage is mandatory (empty required
    // would drop optional-only usage via buildUsageFromSchema).
    for (const [name, usage, action] of [
      ['shipping_get', '[package_id=...] [shipment_id=...]  (provide exactly one)', 'get'],
      [
        'shipping_track',
        '[package_id=...] [shipment_id=...] [limit=...]  (provide package_id or shipment_id)',
        'track',
      ],
      ['shipping_deliver', '[package_id=...] [shipment_id=...]  (provide exactly one)', 'deliver'],
      ['shipping_return', '[package_id=...] [shipment_id=...]  (provide exactly one)', 'return'],
    ] as const) {
      const cmd = BUNDLED_COMMAND_REGISTRY.commands[name];
      if (!cmd) throw new Error(`${name} command missing`);
      expect(cmd.usage).toBe(usage);
      expect(cmd.category).toBe('Missions');
      expect(cmd.example).toContain('package_id=');
      expect(cmd.description).toContain('package_id');
      expect(cmd.required ?? []).toEqual([]);
      expect(cmd.discoverWith).toEqual(['shipping_active', 'get_cargo']);
      expect(cmd.route).toEqual({ tool: 'spacemolt_shipping', action, method: 'POST' });
      expect(cmd.schema?.package_id?.type).toBe('string');
      expect(cmd.schema?.shipment_id?.type).toBe('string');
    }
    expect(BUNDLED_COMMAND_REGISTRY.commands.shipping_track?.schema?.limit?.type).toBe('integer');
    const shippingQuote = BUNDLED_COMMAND_REGISTRY.commands.shipping_quote;
    if (!shippingQuote) throw new Error('shipping_quote command missing');
    expect(shippingQuote).toMatchObject({
      required: ['package_id', 'destination_base_id'],
      category: 'Missions',
      route: { tool: 'spacemolt_shipping', action: 'quote', method: 'POST' },
    });
    expect(shippingQuote.seeAlso).toEqual(['shipping_post', 'shipping_list', 'shipping_active', 'get_cargo']);
    expect(shippingQuote.usage).toBe(
      '<package_id> <destination_base_id>  (package_id: bare id or package:<id>; destination_base_id: station base ID or station POI ID)',
    );
    expect(shippingQuote.description).toContain('package:<id>');
    expect(shippingQuote.description).toContain('POI');
    const shippingPost = BUNDLED_COMMAND_REGISTRY.commands.shipping_post;
    if (!shippingPost) throw new Error('shipping_post command missing');
    expect(shippingPost).toMatchObject({
      args: ['package_id', 'destination_base_id', 'base_reward'],
      required: ['package_id', 'destination_base_id', 'base_reward'],
      usage:
        '<package_id> <destination_base_id> <base_reward> [speed_bonus=...]  (package_id: bare id or package:<id>; destination_base_id: station base ID or station POI ID)',
      category: 'Missions',
      route: { tool: 'spacemolt_shipping', action: 'post', method: 'POST' },
      schema: {
        base_reward: { type: 'integer', minimum: 1 },
      },
    });
    expect(shippingPost.description).toContain('package:<id>');
    expect(shippingPost.description).toContain('POI');
    expect(shippingPost.seeAlso).toEqual(['shipping_quote', 'shipping_list', 'shipping_active', 'get_cargo']);
    for (const cmd of [shippingQuote, shippingPost]) {
      expect(cmd.schema?.package_id?.description).toContain('package:<id>');
      expect(cmd.schema?.destination_base_id?.description).toContain('POI ID');
      expect(cmd.schema?.recipient_id?.description).toContain('station POI ID');
    }
    expect(shippingQuote.schema?.base_reward).toMatchObject({
      type: 'integer',
    });
    expect(shippingQuote.schema?.base_reward).not.toHaveProperty('minimum');
    const postHelp = captureHelp('shipping_post');
    const quoteHelp = captureHelp('shipping_quote');
    expect(postHelp).toContain('package:<id>');
    expect(postHelp).toContain('POI');
    expect(postHelp).toContain('spacemolt shipping_post package:package-1');
    expect(quoteHelp).toContain('package:<id>');
    expect(quoteHelp).toContain('POI');
    expect(quoteHelp).toContain('spacemolt shipping_quote package:package-1');
  });

  test('station-aware commands document station base ID or station POI ID', () => {
    const phrase = 'station base ID or station POI ID';
    expect(COMMANDS.travel?.usage).toContain('<poi_id_or_cached_name>');
    expect(COMMANDS.travel?.usage).toContain(phrase);
    expect(COMMANDS.travel?.description).toContain(phrase);
    expect(COMMANDS.find_route?.usage).toContain('<system_id>');
    expect(COMMANDS.find_route?.usage).toContain(phrase);
    expect(COMMANDS.storage_view?.schema?.station_id?.description).toContain('station Base ID or station POI ID');
    expect(COMMANDS.browse_ships?.schema?.base_id?.description).toContain('Base ID or station POI ID');
    expect(COMMANDS.view_orders?.usage).toContain(phrase);
    expect(COMMANDS.view_orders?.description).toContain(phrase);
    expect(COMMANDS.load_passenger?.usage).toContain('station base ID');
    expect(COMMANDS.load_passenger?.usage).toContain('station POI ID');
    expect(COMMANDS.load_passenger?.description).toContain('station base ID');
    expect(COMMANDS.load_passenger?.description).toContain('station POI ID');
    expect(COMMANDS.faction_scan_poi?.usage).toContain(phrase);
    expect(COMMANDS.faction_scan_poi?.description).toContain(phrase);
    expect(COMMANDS.commission_status?.usage).toContain(phrase);
    expect(COMMANDS.commission_status?.description).toContain(phrase);
    expect(COMMANDS.shipping_list?.description).toContain(phrase);
    expect(COMMANDS.faction_query_trade_intel?.usage).toContain(phrase);
    expect(COMMANDS.faction_query_trade_intel?.description).toContain(phrase);
    expect(COMMANDS.faction_post_mission?.schema?.objectives?.description).toContain('target_base_id');
    expect(COMMANDS.faction_post_mission?.schema?.objectives?.description).toContain(phrase);
    expect(COMMANDS.jump?.usage).toContain('bearing');
    expect(COMMANDS.jump?.usage).not.toContain(phrase);
    expect(COMMANDS.jump?.description).not.toContain(phrase);
  });

  test('loot_wreck and storage_loot document module_id fit', () => {
    expect(COMMANDS.loot_wreck?.args).toEqual(['wreck_id', 'item_id', 'quantity', 'module_id']);
    expect(COMMANDS.loot_wreck?.usage).toContain('[module_id=…]');
    expect(COMMANDS.loot_wreck?.description).toContain('fit a module onto your ship');
    expect(COMMANDS.loot_wreck?.description).toContain('withdrawn');
    expect(COMMANDS.loot_wreck?.schema?.module_id?.description).toContain('withdrawn');
    expect(COMMANDS.loot_wreck?.schema?.module_id?.description).toContain('onto your ship');
    expect(COMMANDS.loot_wreck?.example).toBe('spacemolt loot_wreck wreck-1 module_id=module-1');
    expect(COMMANDS.loot_wreck?.route).toEqual({ tool: 'spacemolt_salvage', action: 'loot', method: 'POST' });

    expect(COMMANDS.storage_loot?.args).toEqual(['wreck_id', 'item_id', 'quantity', 'module_id']);
    expect(COMMANDS.storage_loot?.description).toContain('fit a module onto your ship');
    expect(COMMANDS.storage_loot?.description).not.toContain('from a wreck into cargo via');
    expect(COMMANDS.storage_loot?.schema?.module_id?.description).toContain('onto your ship');
    expect(COMMANDS.storage_loot?.schema?.module_id?.description).toContain('withdrawn');
    expect(COMMANDS.storage_loot?.example).toBe('spacemolt storage_loot wreck-1 module_id=module-1');
    expect(COMMANDS.storage_loot?.route).toEqual({ tool: 'spacemolt_storage', action: 'loot', method: 'POST' });
  });

  test('scrap_wreck documents faction-station scrap', () => {
    expect(COMMANDS.scrap_wreck?.description).toContain("faction's own player station");
    expect(COMMANDS.scrap_wreck?.description).toContain('Salvaging 2+');
    expect(COMMANDS.scrap_wreck?.description).toContain('A Lucrative Sideline');
    expect(COMMANDS.scrap_wreck?.route).toEqual({ tool: 'spacemolt_salvage', action: 'scrap', method: 'POST' });
  });

  test('get_map documents optional system_id and chart description', () => {
    const config = COMMANDS.get_map;
    expect(config).toBeDefined();
    if (!config) throw new Error('get_map command is missing from COMMANDS');
    expect(config.usage).toBe('[system_id]  (omit for all systems)');
    expect(config.usage).not.toContain(config.description);
    expect(config.description).toBe(
      "View the galaxy chart: all systems, or one system's coordinates, connections, visit state, and chart description.",
    );
    expect(CURATED_COMMAND_DESCRIPTIONS.get_map).toBe(config.description);
    expect(config.example).toBe('spacemolt get_map; spacemolt get_map sol');
    expect(config.seeAlso).toEqual(['get_system', 'search_systems', 'find_route', 'get_location']);
    expect(config.args).toEqual(['system_id']);

    const help = captureHelp('get_map');
    expect(help).toContain('spacemolt get_map [system_id]');
    expect(help).toContain('omit for all systems');
    expect(help).not.toContain('<args...>');
    expect(help).toContain('spacemolt get_map sol');
    expect(help).not.toContain('`');
  });

  test('get_ship accepts optional ship_id and documents remote fleet reads', () => {
    const config = COMMANDS.get_ship;
    expect(config).toBeDefined();
    if (!config) throw new Error('get_ship command is missing from COMMANDS');
    expect(config.usage).toContain('[ship_id]');
    expect(config.usage).not.toContain(config.description);
    expect(config.aliases?.ship_id).toBe('id');
    expect(config.example).toContain('ship-abc');
    expect(COMMANDS.list_ships?.description).toContain('get_ship <id>');
    expect(COMMANDS.list_ships?.description).not.toContain('<ship_id>');

    const help = captureHelp('get_ship');
    expect(help).toMatch(/omit for the (hull|ship) you are flying/i);
    expect(help).toMatch(/anywhere/i);
    expect(help).toMatch(/faction garage/i);
  });

  test('faction_garages documents remote get_ship as the fit path', () => {
    const config = COMMANDS.faction_garages;
    expect(config).toBeDefined();
    if (!config) throw new Error('faction_garages command is missing from COMMANDS');
    expect(config.route).toEqual({ tool: 'spacemolt_faction', action: 'garages', method: 'POST' });
    expect(config.description).toContain('get_ship');
    expect(config.description).toMatch(/anywhere|without docking/i);
    expect(config.description).toContain('switch_ship');
    expect(config.description).not.toContain('ship_id=');
    expect(config.example).toContain('spacemolt faction garages');
    expect(config.example).toMatch(/get_ship id=/);
    expect(config.seeAlso).toEqual(['list_ships', 'switch_ship', 'get_ship']);

    const help = captureHelp('faction garages');
    expect(help).toMatch(/get_ship <id>|get_ship id=/);
    expect(help).toMatch(/without docking|from anywhere/i);
    expect(help).toMatch(/claim/i);
    expect(help).toContain('See also:');
    expect(help).not.toContain('ship_id=');
  });

  test('pay_bounty is curated under Taxes with empire aliases', () => {
    const config = COMMANDS.pay_bounty;
    expect(config).toBeDefined();
    if (!config) throw new Error('pay_bounty command is missing from COMMANDS');
    expect(config.category).toBe('Taxes');
    expect(config.route).toEqual({ tool: 'spacemolt', action: 'pay_bounty', method: 'POST' });
    expect(config.args).toEqual(['id', 'source']);
    expect(config.aliases).toEqual({
      empire: 'id',
      empire_id: 'id',
    });
    expect(config.route.defaults).toBeUndefined();
    expect(config.example).toBe('spacemolt pay_bounty solarian faction');
    expect(config.seeAlso).toEqual(['get_status', 'get_empire_info', 'prepay_tax']);
    expect(config.discoverWith).toEqual(['get_status', 'get_empire_info']);
    expect(COMMANDS.prepay_tax?.seeAlso).toContain('pay_bounty');
    expect(COMMANDS.get_empire_info?.seeAlso).toContain('pay_bounty');
    expect(COMMANDS.get_player?.seeAlso).toContain('pay_bounty');
    expect(COMMANDS.get_status?.seeAlso).not.toContain('pay_bounty');
  });

  test('notification commands expose exactly the server-emitted type choices', () => {
    const emittedTypes = [...NOTIFICATION_TYPE_ENUM];
    expect(COMMANDS.notifications?.schema?.types?.enum).toEqual(emittedTypes);
    expect(COMMANDS.get_notifications?.schema?.types?.enum).toEqual(emittedTypes);
    expect(COMMANDS.get_notifications?.schema?.types?.description).toBe(NOTIFICATION_TYPES_FIELD_DESCRIPTION);
    expect(COMMANDS.notifications?.schema?.types?.description).toBe(NOTIFICATION_TYPES_FIELD_DESCRIPTION);
    for (const command of ['get_notifications', 'notifications']) {
      const config = COMMANDS[command];
      expect(config?.schema?.types?.enum).toEqual(emittedTypes);
      const typesArg = completionArgsForCommand(command, config).find((arg) => arg.name === 'types');
      expect(typesArg?.values).toEqual(emittedTypes);
      const help = captureHelp(command);
      expect(help).toContain(`types (${NOTIFICATION_TYPE_ENUM.join('|')})`);
      expect(help).toContain('types=chat,combat,market,observation');
      expect(help).toContain('fall back to system');
      expect(help).toContain('types=combat does not include them');
      expect(help).toContain('pirate_radio');
      expect(help).not.toContain('types=action_result');
      expect(help).not.toContain('types (chat|combat|trade|faction|friend|forum');
    }
    expect(COMMANDS.get_notifications?.example).toContain('types=chat,market,observation');
    expect(COMMANDS.notifications?.example).toContain('types=chat,observation');
    expect(captureHelp('get_notifications')).toContain('types=chat,market,observation');
    const subscribeHelp = captureHelp('subscribe_observation');
    expect(subscribeHelp).toContain('observation notifications');
    expect(subscribeHelp).not.toContain('shared notification queue');
    expect(COMMANDS.subscribe_observation?.description).toContain('observation notifications');
    expect(COMMANDS.subscribe_observation?.description).not.toContain('shared notification queue');
  });

  test('get_action_log advertises explicit event arrays and polling cursors', () => {
    expect(COMMANDS.get_action_log).toMatchObject({
      usage: '[category=...] [event_type=type[,type...]] [faction_id=...] [page=...] [page_size=...] [since_id=...]',
      example:
        'spacemolt get_action_log event_type=session.daily_balance,faction.production_cycle since_id=42 page_size=100',
      arrayFields: ['event_type'],
    });
    expect(COMMANDS.get_action_log?.description).toContain('session.daily_balance');
    expect(COMMANDS.get_action_log?.schema).toHaveProperty('page_size');
    expect(COMMANDS.get_action_log?.schema).toHaveProperty('since_id');
    const eventTypeSchema = COMMANDS.get_action_log?.schema?.event_type as { description?: string } | undefined;
    expect(eventTypeSchema?.description).toContain('session.daily_balance');
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

      expect(topLevel, shell).toContain('arena');
      expect(topLevel, shell).toContain('faction');
      expect(topLevel, shell).toContain('facility');
      expect(topLevel, shell).toContain('trade');
      expect(topLevel, shell).not.toContain('arena_challenge');
      expect(topLevel, shell).not.toContain('faction_info');
      expect(topLevel, shell).not.toContain('facility_job_add');
      expect(topLevel, shell).not.toContain('trade_offer');
    }
  });

  test('shell completions include nested command group action values', () => {
    const expected = ['info', 'create_buy_order', 'invite', 'personnel'];
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
      config: ['user-agent', 'fuzzy-ids'],
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
      '--follow',
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
