import { describe, expect, test } from 'bun:test';
import { buildDynamicCommands, generatedCommandName } from './dynamic-commands';
import type { GeneratedApiRoute } from './openapi-metadata';

const route = (tool: string, action: string, method: 'GET' | 'POST' = 'POST'): GeneratedApiRoute => ({
  operationId: `${tool}_${action}`,
  summary: `${action} summary`,
  route: { tool, action, method },
  required: ['ship_id'],
  schema: {
    ship_id: { type: 'string', positionalIndex: 0 },
    dry_run: { type: 'boolean' },
  },
});

describe('dynamic OpenAPI commands', () => {
  test('derives stable command names from v2 routes', () => {
    expect(generatedCommandName(route('spacemolt_shipyard', 'repair'))).toBe('shipyard_repair');
    expect(generatedCommandName(route('spacemolt_catalog', 'spacemolt_catalog'))).toBe('catalog');
    expect(generatedCommandName(route('notifications', 'notifications', 'GET'))).toBe('notifications');
  });

  test('uses x-cli-command when present', () => {
    const generated = route('spacemolt_shipyard', 'repair');
    generated.cli = { command: 'repair_ship' };
    expect(generatedCommandName(generated)).toBe('repair_ship');
  });

  test('does not replace curated commands', () => {
    const commands = buildDynamicCommands(
      {
        'POST /api/v2/spacemolt_shipyard/repair': route('spacemolt_shipyard', 'repair'),
      },
      new Set(['shipyard_repair']),
    );
    expect(commands.shipyard_repair).toBeUndefined();
  });

  test('does not duplicate curated API routes under generated names', () => {
    const commands = buildDynamicCommands(
      {
        'POST /api/v2/spacemolt_auth/register': route('spacemolt_auth', 'register'),
      },
      new Set(['register']),
      new Set(['POST /api/v2/spacemolt_auth/register']),
    );
    expect(commands.auth_register).toBeUndefined();
  });

  test('skips help and hidden routes', () => {
    const hidden = route('spacemolt_shipyard', 'secret');
    hidden.cli = { hidden: true };
    const commands = buildDynamicCommands(
      {
        'GET /api/v2/spacemolt_shipyard/help': route('spacemolt_shipyard', 'help', 'GET'),
        'POST /api/v2/spacemolt_shipyard/secret': hidden,
      },
      new Set(),
    );
    expect(commands.shipyard_help).toBeUndefined();
    expect(commands.shipyard_secret).toBeUndefined();
  });

  test('builds a command config with args, required, usage, description, category, route, and schema', () => {
    const commands = buildDynamicCommands(
      {
        'POST /api/v2/spacemolt_shipyard/repair': route('spacemolt_shipyard', 'repair'),
      },
      new Set(),
    );
    expect(commands.shipyard_repair).toMatchObject({
      args: ['ship_id', 'dry_run'],
      required: ['ship_id'],
      usage: '<ship_id> [dry_run=true/false]',
      description: 'repair summary',
      category: 'Generated API',
      route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
      schema: {
        ship_id: { type: 'string', positionalIndex: 0 },
        dry_run: { type: 'boolean' },
      },
    });
  });
});
