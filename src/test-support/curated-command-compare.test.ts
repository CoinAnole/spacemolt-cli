import { describe, expect, test } from 'bun:test';
import type { CommandOverride } from '../commands.ts';
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

    const text = formatCuratedCommandComparisonReport(report);

    expect(text).toContain('Curated Command vs Generated OpenAPI Command Divergence Report');
    expect(text).toContain('## repair');
    expect(text).toContain('generated command: shipyard_repair');
  });
});
