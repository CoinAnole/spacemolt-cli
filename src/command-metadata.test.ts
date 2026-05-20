import { describe, expect, test } from 'bun:test';
import { getArgNames, validatePayloadAgainstSchema } from './args';
import { BATTLE_SHIPYARD_COMMAND_OVERRIDES } from './command-overrides-battle-shipyard';
import { COMMERCE_FACILITY_COMMAND_OVERRIDES } from './command-overrides-commerce-facility';
import { CORE_COMMAND_OVERRIDES } from './command-overrides-core';
import { FACTION_SOCIAL_COMMAND_OVERRIDES } from './command-overrides-faction-social';
import { QUERY_REFERENCE_COMMAND_OVERRIDES } from './command-overrides-query-reference';
import { buildCommandRegistrySnapshot } from './command-registry';
import {
  ALLOWED_COMMAND_OVERRIDE_FIELDS,
  COMMAND_OVERRIDES,
  COMMANDS,
  type CommandArg,
  LOCAL_COMMANDS,
} from './commands';
import { generateCompletion } from './completion';
import { GENERATED_API_ROUTES, type GeneratedApiRoute } from './generated/api-commands';
import { showCommandHelp } from './help';

const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

const POSITIONAL_SCHEMA_GAP_EXEMPTIONS = new Set([
  'trade_offer.credits',
  'faction_create_buy_order.deliver_to',
  'send_gift.credits',
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

describe('command metadata', () => {
  test('command registry preserves curated commands and local commands', () => {
    const snapshot = buildCommandRegistrySnapshot();
    expect(snapshot.commands.travel).toBeDefined();
    expect(snapshot.localCommands.ids).toBe(LOCAL_COMMANDS.ids);
    expect(snapshot.allCommands.ids).toBeDefined();
    expect(snapshot.apiRoutes).toEqual(
      Object.fromEntries(Object.entries(snapshot.commands).map(([command, config]) => [command, config.route])),
    );
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
