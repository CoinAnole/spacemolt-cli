import { describe, expect, test } from 'bun:test';
import { CURATED_COMMAND_DESCRIPTIONS } from '../command-descriptions.ts';
import { buildCuratedCommands, COMMAND_OVERRIDES, type CommandOverride } from '../commands.ts';
import { GENERATED_API_ROUTES } from '../generated/api-commands.ts';
import type { GeneratedApiRoute } from '../openapi-metadata.ts';
import { compareCuratedCommandsToGenerated, formatCuratedCommandComparisonReport } from './curated-command-compare.ts';

const generatedRoute = (summary = 'Repair ship'): GeneratedApiRoute => ({
  operationId: 'spacemolt_shipyard_repair',
  summary,
  route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
  required: ['ship_id'],
  schema: {
    ship_id: { type: 'string', positionalIndex: 0 },
    dry_run: { type: 'boolean', description: 'Preview only' },
  },
});

const generatedRouteWithOnlyRequiredField = (): GeneratedApiRoute => ({
  operationId: 'spacemolt_shipyard_repair',
  summary: 'Repair ship',
  route: { tool: 'spacemolt_shipyard', action: 'repair', method: 'POST' },
  required: ['ship_id'],
  schema: {
    ship_id: { type: 'string', positionalIndex: 0 },
  },
});

function differsOnlyByTrailingPeriod(left: string, right: string): boolean {
  const normalizedLeft = left.trim();
  const normalizedRight = right.trim();
  return (
    (normalizedLeft.endsWith('.') && normalizedLeft.slice(0, -1) === normalizedRight) ||
    (normalizedRight.endsWith('.') && normalizedRight.slice(0, -1) === normalizedLeft)
  );
}

describe('curated command vs generated command comparison', () => {
  test('reports no differences when curated config matches generated config', () => {
    const overrides: Record<string, CommandOverride> = {
      shipyard_repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        category: 'Generated API',
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRouteWithOnlyRequiredField() },
    });

    expect(report.commands).toHaveLength(1);
    expect(report.commands[0]?.summary).toBe('no curated/generated divergences detected');
    expect(report.commands[0]?.differences).toEqual([]);
  });

  test('reports generated command name and user-facing config differences', () => {
    const overrides: Record<string, CommandOverride> = {
      repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        positionals: ['ship'],
        usage: '<ship>',
        description: 'Friendly repair command',
        category: 'Shipyard',
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.commands[0]?.differences.map((d) => d.field)).toEqual(
      expect.arrayContaining(['commandName', 'args', 'required', 'usage', 'description', 'category']),
    );
  });

  test('curated source descriptions adopt OpenAPI summaries when they only differ by trailing periods', () => {
    const periodOnlyDifferences: string[] = [];
    for (const [command, override] of Object.entries(COMMAND_OVERRIDES)) {
      if (!override.apiRoute) continue;
      const curated = override.description ?? CURATED_COMMAND_DESCRIPTIONS[command];
      const generated = GENERATED_API_ROUTES[override.apiRoute]?.summary;
      if (curated && generated && curated !== generated && differsOnlyByTrailingPeriod(curated, generated)) {
        periodOnlyDifferences.push(
          `${command}: curated ${JSON.stringify(curated)} vs generated ${JSON.stringify(generated)}`,
        );
      }
    }

    expect(periodOnlyDifferences).toEqual([]);
  });

  test('reports missing and changed schema fields', () => {
    const overrides: Record<string, CommandOverride> = {
      shipyard_repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        schemaExtensions: {
          dry_run: { type: 'string' },
          priority: { type: 'integer' },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.commands[0]?.differences.map((d) => d.field)).toEqual(
      expect.arrayContaining(['schema.dry_run.type', 'schema.priority']),
    );
  });

  test('schema extensions preserve generated positional metadata', () => {
    const overrides: Record<string, CommandOverride> = {
      craft: {
        apiRoute: 'POST /api/v2/spacemolt/craft',
        schemaExtensions: {
          id: { description: 'Curated recipe ID description' },
          quantity: { description: 'Curated quantity description' },
        },
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/craft': {
        operationId: 'spacemolt_craft',
        summary: 'Craft recipe',
        route: { tool: 'spacemolt', action: 'craft', method: 'POST' },
        schema: {
          id: { type: 'string', description: 'Generated recipe ID description', positionalIndex: 0 },
          quantity: { type: 'integer', description: 'Generated quantity description', positionalIndex: 1 },
        },
      },
    };

    const commands = buildCuratedCommands(overrides, generatedRoutes);

    expect(commands.craft?.schema?.id).toEqual({
      type: 'string',
      description: 'Curated recipe ID description',
      positionalIndex: 0,
    });
    expect(commands.craft?.schema?.quantity).toEqual({
      type: 'integer',
      description: 'Curated quantity description',
      positionalIndex: 1,
    });
  });

  test('reports missing generated route metadata', () => {
    const report = compareCuratedCommandsToGenerated({
      overrides: { repair: { apiRoute: 'POST /api/v2/spacemolt_shipyard/repair' } },
      generatedRoutes: {},
    });

    expect(report.commands[0]?.differences[0]).toMatchObject({
      kind: 'missing-generated-route',
      field: 'apiRoute',
    });
  });

  test('filters by curated or generated command name', () => {
    const overrides: Record<string, CommandOverride> = {
      repair: { apiRoute: 'POST /api/v2/spacemolt_shipyard/repair' },
      scan: { apiRoute: 'POST /api/v2/spacemolt_scan/scan' },
    };
    const routes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt_shipyard/repair': generatedRoute(),
      'POST /api/v2/spacemolt_scan/scan': {
        operationId: 'spacemolt_scan_scan',
        summary: 'Scan',
        route: { tool: 'spacemolt_scan', action: 'scan', method: 'POST' },
      },
    };

    expect(
      compareCuratedCommandsToGenerated({ overrides, generatedRoutes: routes, only: ['shipyard'] }).commands,
    ).toHaveLength(1);
  });

  test('formats a stable text report', () => {
    const report = compareCuratedCommandsToGenerated({
      overrides: { repair: { apiRoute: 'POST /api/v2/spacemolt_shipyard/repair' } },
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    const text = formatCuratedCommandComparisonReport(report, { includeCosmetic: true });

    expect(text).toContain('Curated Command vs Generated OpenAPI Command Divergence Report');
    expect(text).toContain('## repair');
    expect(text).toContain('generated command: shipyard_repair');
    expect(text).toContain('--include-cosmetic');
  });

  test('classifies cosmetic differences and hides cosmetic-only commands by default', () => {
    const overrides: Record<string, CommandOverride> = {
      repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        positionals: ['ship'],
        usage: '<ship>',
        description: 'Friendly repair command',
        category: 'Shipyard',
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.summary.actionableCommands).toBe(0);
    expect(report.summary.cosmeticOnlyCommands).toBe(1);
    expect(report.commands[0]?.differences.every((d) => d.kind === 'curated-cosmetic')).toBe(true);

    const defaultText = formatCuratedCommandComparisonReport(report);
    expect(defaultText).toContain('Actionable commands: 0');
    expect(defaultText).toContain('Cosmetic-only commands: 1');
    expect(defaultText).not.toContain('## repair');

    const cosmeticText = formatCuratedCommandComparisonReport(report, { includeCosmetic: true });
    expect(cosmeticText).toContain('## repair');
    expect(cosmeticText).toContain('curated-cosmetic:');
  });

  test('classifies same-name friendly required aliases as cosmetic', () => {
    const overrides: Record<string, CommandOverride> = {
      shipyard_repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        positionals: ['ship'],
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.summary.actionableCommands).toBe(0);
    expect(report.summary.cosmeticOnlyCommands).toBe(1);
    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'curated-cosmetic',
        field: 'required',
      }),
    );
    expect(report.commands[0]?.differences).not.toContainEqual(
      expect.objectContaining({
        kind: 'schema-required',
        field: 'required',
      }),
    );
  });

  test('classifies canonical required drift as actionable', () => {
    const overrides: Record<string, CommandOverride> = {
      shipyard_repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        aliases: { ship_id: 'dry_run' },
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.summary.actionableCommands).toBe(1);
    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'schema-required',
        field: 'required',
      }),
    );
  });

  test('classifies curated-only client fields using override clientOnlyFields', () => {
    const overrides: Record<string, CommandOverride> = {
      get_status: {
        apiRoute: 'POST /api/v2/spacemolt/get_status',
        schemaExtensions: {
          summary: {
            type: 'boolean',
            description: 'Client-side display flag.',
          },
        },
        clientOnlyFields: ['summary'],
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: {
        'POST /api/v2/spacemolt/get_status': {
          operationId: 'spacemolt_get_status',
          summary: 'Get status',
          route: { tool: 'spacemolt', action: 'get_status', method: 'POST' },
          schema: {},
        },
      },
    });

    expect(report.summary.clientOnlyFields).toBe(1);
    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'client-only',
        field: 'schema.summary',
      }),
    );

    const defaultText = formatCuratedCommandComparisonReport(report);
    expect(defaultText).toContain('## get_status');
    expect(defaultText).toContain('client-only:');
  });

  test('classifies schema enum, type, and positional drift as actionable', () => {
    const overrides: Record<string, CommandOverride> = {
      shipyard_repair: {
        apiRoute: 'POST /api/v2/spacemolt_shipyard/repair',
        positionals: ['dry_run', 'ship_id'],
        schemaExtensions: {
          ship_id: { type: 'integer', positionalIndex: 2 },
          dry_run: { type: 'string', enum: ['yes', 'no'] },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({
      overrides,
      generatedRoutes: { 'POST /api/v2/spacemolt_shipyard/repair': generatedRoute() },
    });

    expect(report.summary.actionableCommands).toBe(1);
    expect(report.commands[0]?.differences.map((d) => d.kind)).toEqual(
      expect.arrayContaining(['schema-contract', 'schema-enum', 'schema-positional']),
    );
    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({ kind: 'schema-positional', field: 'args' }),
    );
  });

  test('does not report positional drift when curated positionals alias to generated fields', () => {
    const overrides: Record<string, CommandOverride> = {
      craft: {
        apiRoute: 'POST /api/v2/spacemolt/craft',
        positionals: ['recipe_id', 'quantity'],
        schemaExtensions: {
          id: { description: 'Curated recipe ID description', positionalIndex: 99 },
          quantity: { description: 'Curated quantity description' },
          action: { type: 'string', enum: ['queue'] },
        },
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/craft': {
        operationId: 'spacemolt_craft',
        summary: 'Craft recipe',
        route: { tool: 'spacemolt', action: 'craft', method: 'POST' },
        schema: {
          id: { type: 'string', description: 'Generated recipe ID description', positionalIndex: 0 },
          quantity: { type: 'integer', description: 'Generated quantity description', positionalIndex: 1 },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({ overrides, generatedRoutes });
    const fields = report.commands[0]?.differences.map((d) => d.field) ?? [];

    expect(fields).toContain('schema.action');
    expect(report.commands[0]?.differences).not.toContainEqual(
      expect.objectContaining({
        kind: 'schema-positional',
      }),
    );
  });

  test('reports positional drift when curated positionals do not map to generated fields', () => {
    const overrides: Record<string, CommandOverride> = {
      craft: {
        apiRoute: 'POST /api/v2/spacemolt/craft',
        positionals: ['wrong_id', 'quantity'],
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/craft': {
        operationId: 'spacemolt_craft',
        summary: 'Craft recipe',
        route: { tool: 'spacemolt', action: 'craft', method: 'POST' },
        schema: {
          id: { type: 'string', positionalIndex: 0 },
          wrong_id: { type: 'string' },
          quantity: { type: 'integer', positionalIndex: 1 },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({ overrides, generatedRoutes });

    expect(report.summary.actionableCommands).toBe(1);
    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'schema-positional',
        field: 'args',
      }),
    );
  });

  test('reports an unmatched trailing curated positional', () => {
    const overrides: Record<string, CommandOverride> = {
      craft: {
        apiRoute: 'POST /api/v2/spacemolt/craft',
        positionals: ['id', 'quantity', 'unexpected'],
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/craft': {
        operationId: 'spacemolt_craft',
        summary: 'Craft recipe',
        route: { tool: 'spacemolt', action: 'craft', method: 'POST' },
        schema: {
          id: { type: 'string', positionalIndex: 0 },
          quantity: { type: 'integer', positionalIndex: 1 },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({ overrides, generatedRoutes });

    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'schema-positional',
        field: 'args',
        curated: ['id', 'quantity', 'unexpected'],
        generated: ['id', 'quantity'],
      }),
    );
  });

  test('treats a rest positional as terminal before later generated positionals', () => {
    const overrides: Record<string, CommandOverride> = {
      craft: {
        apiRoute: 'POST /api/v2/spacemolt/craft',
        positionals: [{ rest: 'id' }, 'quantity'],
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/craft': {
        operationId: 'spacemolt_craft',
        summary: 'Craft recipe',
        route: { tool: 'spacemolt', action: 'craft', method: 'POST' },
        schema: {
          id: { type: 'string', positionalIndex: 0 },
          quantity: { type: 'integer', positionalIndex: 1 },
        },
      },
    };

    const report = compareCuratedCommandsToGenerated({ overrides, generatedRoutes });

    expect(report.commands[0]?.differences).toContainEqual(
      expect.objectContaining({
        kind: 'schema-positional',
        field: 'args',
        curated: ['id'],
        generated: ['id', 'quantity'],
      }),
    );
  });
});
