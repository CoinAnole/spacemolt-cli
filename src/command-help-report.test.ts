import { describe, expect, test } from 'bun:test';
import {
  type ApiMdCommandMap,
  buildCommandHelpReport,
  formatCommandHelpReport,
  parseApiMdCommands,
  parseReportArgs,
} from './command-help-report';
import type { CommandConfig } from './commands';
import type { GeneratedApiRoute } from './openapi-metadata';

describe('command help report', () => {
  test('parses command entries from the api.md Client Commands section', () => {
    const markdown = `
## Client Commands

### Navigation
- \`travel(target_poi)\` -- Travel to a different POI **Mutation.**
- \`dock()\` -- Dock at a base **Mutation.**

### Trading
- \`buy(item_id, quantity, auto_list?)\` -- Buy items at market price

---

## Data Structures
`;

    expect(parseApiMdCommands(markdown)).toEqual({
      travel: {
        name: 'travel',
        args: [{ name: 'target_poi', optional: false }],
        description: 'Travel to a different POI',
        category: 'Navigation',
      },
      dock: {
        name: 'dock',
        args: [],
        description: 'Dock at a base',
        category: 'Navigation',
      },
      buy: {
        name: 'buy',
        args: [
          { name: 'item_id', optional: false },
          { name: 'quantity', optional: false },
          { name: 'auto_list', optional: true },
        ],
        description: 'Buy items at market price',
        category: 'Trading',
      },
    });
  });

  test('compares curated command help with OpenAPI and api.md metadata', () => {
    const commands: Record<string, CommandConfig> = {
      travel: {
        description: 'Curated travel help',
        usage: '<target>',
        example: 'spacemolt travel sol_asteroid_belt',
        discoverWith: ['get_system'],
        aliases: { target: 'target_poi' },
        route: { tool: 'spacemolt', action: 'travel', method: 'POST' },
        schema: { target_poi: { type: 'string', description: 'Curated target help' } },
      },
      dock: {
        description: 'Dock at a base',
        route: { tool: 'spacemolt', action: 'dock', method: 'POST' },
      },
    };
    const generatedRoutes: Record<string, GeneratedApiRoute> = {
      'POST /api/v2/spacemolt/travel': {
        summary: 'OpenAPI travel help',
        route: { tool: 'spacemolt', action: 'travel', method: 'POST' },
        required: ['target_poi'],
        schema: { target_poi: { type: 'string', description: 'OpenAPI target help', positionalIndex: 0 } },
      },
      'POST /api/v2/spacemolt/dock': {
        summary: 'Dock at a base',
        route: { tool: 'spacemolt', action: 'dock', method: 'POST' },
      },
    };
    const apiMdCommands: ApiMdCommandMap = {
      travel: {
        name: 'travel',
        args: [{ name: 'target_poi', optional: false }],
        description: 'Docs travel help',
        category: 'Navigation',
      },
      dock: {
        name: 'dock',
        args: [],
        description: 'Dock at a base',
        category: 'Navigation',
      },
    };

    const report = buildCommandHelpReport({ commands, generatedRoutes, apiMdCommands });
    const travel = report.commands.find((entry) => entry.command === 'travel');
    const dock = report.commands.find((entry) => entry.command === 'dock');

    expect(travel?.differences.filter((diff) => diff.status !== 'match').map((diff) => diff.field)).toEqual([
      'description',
      'usage',
      'field.target_poi.description',
      'curated-only example',
      'curated-only aliases',
      'curated-only discoverWith',
    ]);
    expect(report.differenceCount).toBe(1);
    expect(dock?.differences.every((diff) => diff.status === 'match')).toBe(true);

    const defaultText = formatCommandHelpReport(report);
    expect(defaultText).toContain('travel');
    expect(defaultText).toContain('field.target_poi.description');
    expect(defaultText).not.toContain('Curated travel help');
    expect(defaultText).not.toContain('dock');
    expect(defaultText).not.toContain('curated-only example');

    const intentionalText = formatCommandHelpReport(report, { includeIntentional: true });
    expect(intentionalText).toContain('Curated travel help');

    const allText = formatCommandHelpReport(report, { includeAll: true });
    expect(allText).toContain('dock');
    expect(allText).toContain('[match, match]');
    expect(allText).toContain('curated-only example');
  });

  test('classifies intentional aliases separately from review-worthy description drift', () => {
    const report = buildCommandHelpReport({
      commands: {
        travel: {
          description: 'travel',
          usage: '<poi_id_or_cached_name>',
          aliases: { poi_id_or_cached_name: 'target_poi' },
          route: { tool: 'spacemolt', action: 'travel', method: 'POST' },
          schema: { target_poi: { type: 'string', description: 'Target POI' } },
        },
      },
      generatedRoutes: {
        'POST /api/v2/spacemolt/travel': {
          summary: 'travel',
          route: { tool: 'spacemolt', action: 'travel', method: 'POST' },
          required: ['target_poi'],
          schema: { target_poi: { type: 'string', description: 'Target POI', positionalIndex: 0 } },
        },
      },
      apiMdCommands: {
        travel: {
          name: 'travel',
          args: [{ name: 'target_poi', optional: false }],
          description: 'Travel to a different POI',
          category: 'Navigation',
        },
      },
    });
    const travel = report.commands[0];

    expect(travel?.differences.find((diff) => diff.field === 'description')?.signal).toBe('review');
    expect(travel?.differences.find((diff) => diff.field === 'usage')?.signal).toBe('intentional');
    expect(report.differenceCount).toBe(1);

    const defaultText = formatCommandHelpReport(report);
    expect(defaultText).toContain('description [different, review]');
    expect(defaultText).not.toContain('usage [different, intentional]');

    const intentionalText = formatCommandHelpReport(report, { includeIntentional: true });
    expect(intentionalText).toContain('usage [different, intentional]');
  });

  test('records missing docs entries as command differences', () => {
    const report = buildCommandHelpReport({
      commands: {
        travel: {
          description: 'Travel to a POI',
          route: { tool: 'spacemolt', action: 'travel', method: 'POST' },
        },
      },
      generatedRoutes: {},
      apiMdCommands: {},
    });

    expect(report.commands[0]?.differences).toEqual([
      {
        field: 'openapi route',
        status: 'missing',
        signal: 'review',
        curated: 'POST /api/v2/spacemolt/travel',
      },
      {
        field: 'api.md command',
        status: 'missing',
        signal: 'review',
        curated: 'travel',
      },
    ]);
    expect(report.differenceCount).toBe(2);
  });

  test('parses report script flags', () => {
    expect(
      parseReportArgs(['--all', '--json', '--command', 'travel', '--include-intentional', '--fail-on-diff']),
    ).toEqual({
      includeAll: true,
      includeIntentional: true,
      json: true,
      command: 'travel',
      failOnDiff: true,
    });
    expect(parseReportArgs(['--command=buy'])).toEqual({
      includeAll: false,
      includeIntentional: false,
      json: false,
      command: 'buy',
      failOnDiff: false,
    });
  });
});
