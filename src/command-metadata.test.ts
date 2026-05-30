import { describe, expect, test } from 'bun:test';
import {
  convertPayloadTypes,
  getArgNames,
  normalizeParsedPayload,
  parseArgs,
  validatePayloadAgainstSchema,
} from './args';
import { BATTLE_SHIPYARD_COMMAND_OVERRIDES } from './command-overrides-battle-shipyard';
import { COMMERCE_FACILITY_COMMAND_OVERRIDES } from './command-overrides-commerce-facility';
import { CORE_COMMAND_OVERRIDES } from './command-overrides-core';
import { FACTION_SOCIAL_COMMAND_OVERRIDES } from './command-overrides-faction-social';
import { QUERY_REFERENCE_COMMAND_OVERRIDES } from './command-overrides-query-reference';
import { BUNDLED_COMMAND_REGISTRY, buildCommandRegistrySnapshot } from './command-registry';
import {
  ALLOWED_COMMAND_OVERRIDE_FIELDS,
  COMMAND_OVERRIDES,
  COMMANDS,
  type CommandArg,
  LOCAL_COMMANDS,
} from './commands';
import { generateCompletion } from './completion';
import { completionArgsForCommand } from './completion-metadata';
import { GENERATED_API_ROUTES, type GeneratedApiRoute } from './generated/api-commands';
import { showCommandHelp } from './help';
import { createCommandConfigDryRunResponse } from './preview';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const POSITIONAL_SCHEMA_GAP_EXEMPTIONS = new Set([
  'trade_offer.credits',
  'faction_create_buy_order.deliver_to',
  'analyze_market.item_id',
  'analyze_market.page',
  'help.category',
  'help.command',
]);

const DEFAULT_SCHEMA_GAP_EXEMPTIONS = new Set(['faction_withdraw_credits.source']);

function captureHelp(command: string): string {
  const stdout: string[] = [];

  expect(
    showCommandHelp(command, {
      out(message = '') {
        stdout.push(message);
      },
      err() {},
    }),
  ).toBe(true);

  return stdout.join('\n').replace(ANSI_PATTERN, '');
}

function getCompletionEnumCases(): Array<{ command: string; arg: string; values: string[] }> {
  const cases: Array<{ command: string; arg: string; values: string[] }> = [];
  for (const [command, config] of Object.entries(COMMANDS)) {
    for (const arg of getArgNames(config)) {
      const canonicalArg = config.aliases?.[arg] || arg;
      const values = config.schema?.[canonicalArg]?.enum;
      if (values?.length) cases.push({ command, arg, values });
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
  if (schema?.type === 'integer' || schema?.type === 'number') return '1';
  if (schema?.type === 'boolean') return 'true';
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
  const match = completion.match(new RegExp(`^\\s*${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'));
  const body = match?.groups?.body;
  const words = body?.match(/compgen -W "([^"]*)"/)?.[1];
  return words?.split(/\s+/).filter((word) => word && !word.includes('$')) || [];
}

function zshCommandCompletionWords(completion: string, command: string): string[] {
  const escapedCommand = command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = completion.match(new RegExp(`^\\s*${escapedCommand}\\)\\n(?<body>[\\s\\S]*?)^\\s*;;`, 'm'));
  const body = match?.groups?.body;
  const words = body?.match(/_arguments "1:[^"]*:\(([^)]*)\)"/)?.[1];
  return words?.split(/\s+/).filter(Boolean) || [];
}

function fishCommandCompletionWords(completion: string, command: string): string[] {
  const words: string[] = [];
  for (const line of completion.split('\n')) {
    if (!line.includes(`__fish_seen_subcommand_from ${command}`)) continue;
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

  test('repair help does not advertise unsupported target positional syntax', () => {
    const config = BUNDLED_COMMAND_REGISTRY.allCommands.repair;
    expect(config?.description).toBe('Repair hull damage using station services, repair kits, or repair equipment.');
    expect(config?.example).toBe('spacemolt repair');
    expect(config?.usage).not.toContain('target=');

    const help = captureHelp('repair');
    expect(help).not.toContain('[target=ship|modules]');
    expect(help).not.toContain('spacemolt repair modules');
  });

  test('craft help does not advertise a fixed batch quantity limit', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.craft;
    // usage is now auto-generated from the spec; the key protection is that the bad
    // hardcoded limit never appears in the schema description or rendered help.
    expect(config?.usage).not.toContain('1-10');
    expect(config?.schema?.quantity?.description).toContain('server-capped by crafting skill level');
    expect(config?.schema?.quantity?.description).not.toContain('1-10');

    const help = captureHelp('craft');
    expect(help).toContain('server-capped by crafting skill level');
    expect(help).not.toContain('1-10');
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

  test('notifications is curated instead of exposed as a generated fallback', () => {
    const config = BUNDLED_COMMAND_REGISTRY.commands.notifications;

    expect(config).toMatchObject({
      category: 'Query commands',
      description: 'Poll pending notifications',
      example: 'spacemolt notifications',
      route: { tool: 'notifications', action: 'notifications', method: 'GET' },
    });

    const snapshot = buildCommandRegistrySnapshot();
    expect(snapshot.commands.notifications).toEqual(config);
    expect(
      Object.entries(snapshot.commands)
        .filter(([, commandConfig]) => commandConfig.category === 'Generated API')
        .map(([command]) => command),
    ).toEqual([]);
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
      if (!GENERATED_API_ROUTES[override.apiRoute]) {
        failures.push(`${command}: unknown generated API route ${override.apiRoute}`);
      }

      for (const field of Object.keys(override)) {
        if (!allowed.has(field)) failures.push(`${command}: override field "${field}" is not allowed`);
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

      const parsed = parseArgs(args);
      if (!parsed.ok) {
        failures.push(`${command}: parse failed: ${parsed.errors.map((error) => error.message).join('; ')}`);
        continue;
      }

      const normalized = normalizeParsedPayload(command, parsed.payload);
      const converted = convertPayloadTypes(normalized, command);
      const dryRun = createCommandConfigDryRunResponse(command, config, converted);

      if (!dryRun.structuredContent) failures.push(`${command}: dry run missing structuredContent`);
      if (dryRun.error) failures.push(`${command}: dry run error: ${dryRun.error.message}`);
    }

    expect(failures).toEqual([]);
  });

  test('command override positionals and aliases map to generated schema fields', () => {
    const failures: string[] = [];

    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
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
      const help = captureHelp(command);
      for (const arg of required) {
        if (!argNames.includes(arg)) missing.push(`${command}: ${arg} missing from args`);
        if (!help.includes(arg)) missing.push(`${command}: ${arg} missing from help`);
      }
    }

    expect(missing).toEqual([]);
  });

  test('completion enum values match generated command schemas', () => {
    const enumCases = getCompletionEnumCases();
    expect(enumCases.length).toBeGreaterThan(0);

    for (const shell of ['bash', 'zsh', 'fish']) {
      const completion = generateCompletion(shell);
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

  test('shell completions include local top-level commands', () => {
    const expectedCommands = ['doctor', 'version', 'profile', 'ids', 'where-can-i', 'sync-api'];

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

  test('shell completions include local subcommand values', () => {
    const expectedValues = {
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

  test('schema validation catches invalid enum values', () => {
    const errors = validatePayloadAgainstSchema('register', { empire: 'invalid_empire' });
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.code).toBe('invalid_enum');
    expect(errors[0]?.field).toBe('empire');
  });

  test('schema validation catches invalid integers', () => {
    const errors = validatePayloadAgainstSchema('buy_insurance', { ticks: 'abc' });
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
