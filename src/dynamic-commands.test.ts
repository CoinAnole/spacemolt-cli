import { describe, expect, test } from 'bun:test';
import { buildDynamicCommands, buildGeneratedCommandConfig, generatedCommandName } from './dynamic-commands';
import { GENERATED_API_ROUTES } from './generated/api-commands';
import type { GeneratedApiRoute } from './openapi-metadata';

const route = (tool: string, action: string, method: 'GET' | 'POST' = 'POST'): GeneratedApiRoute => ({
  operationId: `${tool}_${action}`,
  summary: `${action} summary`,
  stateSections: ['ship', 'cargo'],
  route: { tool, action, method },
  required: ['ship_id'],
  schema: {
    ship_id: { type: 'string', positionalIndex: 0 },
    dry_run: { type: 'boolean' },
  },
});

describe('dynamic OpenAPI commands', () => {
  test('generated usage recognizes nullable boolean fields', () => {
    const config = buildGeneratedCommandConfig({
      operationId: 'probeUnion',
      route: { tool: 'spacemolt_probe', action: 'union', method: 'POST' },
      schema: {
        enabled: { type: ['boolean', 'null'] },
      },
    });

    expect(config.usage).toBe('[enabled=true/false]');
    expect(config.schema?.enabled?.type).toEqual(['boolean', 'null']);
  });

  test('exposes v0.522 shipping actions but keeps both shipping help routes hidden', () => {
    const shippingRoutes = Object.fromEntries(
      Object.entries(GENERATED_API_ROUTES).filter(([signature]) => signature.includes('/spacemolt_shipping/')),
    );
    const commands = buildDynamicCommands(shippingRoutes, new Set());

    expect(Object.keys(shippingRoutes).sort()).toEqual([
      'GET /api/v2/spacemolt_shipping/help',
      'POST /api/v2/spacemolt_shipping/accept',
      'POST /api/v2/spacemolt_shipping/cancel',
      'POST /api/v2/spacemolt_shipping/deliver',
      'POST /api/v2/spacemolt_shipping/get',
      'POST /api/v2/spacemolt_shipping/help',
      'POST /api/v2/spacemolt_shipping/list',
      'POST /api/v2/spacemolt_shipping/pay_debt',
      'POST /api/v2/spacemolt_shipping/post',
      'POST /api/v2/spacemolt_shipping/profile',
      'POST /api/v2/spacemolt_shipping/quote',
      'POST /api/v2/spacemolt_shipping/return',
      'POST /api/v2/spacemolt_shipping/track',
    ]);
    expect(Object.keys(commands).sort()).toEqual([
      'shipping_accept',
      'shipping_cancel',
      'shipping_deliver',
      'shipping_get',
      'shipping_list',
      'shipping_pay_debt',
      'shipping_post',
      'shipping_profile',
      'shipping_quote',
      'shipping_return',
      'shipping_track',
    ]);
    expect(commands.shipping_help).toBeUndefined();
  });

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
      stateSections: ['ship', 'cargo'],
      route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
      schema: {
        ship_id: { type: 'string', positionalIndex: 0 },
        dry_run: { type: 'boolean' },
      },
    });
  });

  test('orders required generated arguments before optional fields while honoring positional indexes', () => {
    const commands = buildDynamicCommands(
      {
        'POST /api/v2/spacemolt_shipping/post': {
          operationId: 'spacemolt_shipping_post',
          summary: 'Post freight',
          route: { tool: 'spacemolt_shipping', action: 'post', method: 'POST' },
          required: ['package_id', 'destination_base_id'],
          schema: {
            base_reward: { type: 'integer' },
            destination_base_id: { type: 'string' },
            package_id: { type: 'string' },
          },
        },
        'POST /api/v2/spacemolt_facility/ranch_set_cull': {
          operationId: 'spacemolt_facility_ranch_set_cull',
          summary: 'Set ranch cull target',
          route: { tool: 'spacemolt_facility', action: 'ranch_set_cull', method: 'POST' },
          required: ['cull_target'],
          schema: {
            cull_target: { type: 'integer' },
            facility_id: { type: 'string', positionalIndex: 1 },
          },
        },
      },
      new Set(),
    );

    expect(commands.shipping_post?.args).toEqual(['package_id', 'destination_base_id', 'base_reward']);
    expect(commands.shipping_post?.usage).toBe('<package_id> <destination_base_id> [base_reward=...]');
    expect(commands.facility_ranch_set_cull?.args).toEqual(['cull_target', 'facility_id']);
    expect(commands.facility_ranch_set_cull?.usage).toBe('<cull_target> [facility_id=...]');
  });

  test('does not allocate proportionally to untrusted positional indexes', () => {
    const commands = buildDynamicCommands(
      {
        'POST /api/v2/spacemolt_probe/ping': {
          operationId: 'spacemolt_probe_ping',
          summary: 'Ping probe',
          route: { tool: 'spacemolt_probe', action: 'ping', method: 'POST' },
          required: ['id'],
          schema: {
            id: { type: 'string' },
            unsafe: { type: 'string', positionalIndex: 1_000_000_000 },
            fractional: { type: 'string', positionalIndex: 1.5 },
          },
        },
      },
      new Set(),
    );

    expect(commands.probe_ping?.args).toEqual(['id', 'unsafe', 'fractional']);
  });
});
