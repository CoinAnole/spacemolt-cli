import { describe, expect, test } from 'bun:test';
import {
  buildCommandHelpReport,
  formatCommandHelpReport,
  parseOpenApiHelpEntries,
  parseReportArgs,
} from './command-help-report';

describe('command help report', () => {
  test('parses operation summaries and descriptions from OpenAPI documents', () => {
    const entries = parseOpenApiHelpEntries({
      paths: {
        '/travel': {
          post: {
            operationId: 'travel',
            summary: 'Travel to a different Point of Interest (POI) within your current system',
            description: 'Use get_system to see available POIs.',
          },
        },
        '/api/v2/spacemolt_market/view_orders': {
          post: {
            operationId: 'spacemolt_market_view_orders',
            summary: 'view_orders',
          },
        },
      },
    });

    expect(entries).toEqual([
      {
        aliases: ['view_orders', 'spacemolt_market_view_orders'],
        command: 'view_orders',
        description: undefined,
        operationId: 'spacemolt_market_view_orders',
        routeSignature: 'POST /api/v2/spacemolt_market/view_orders',
        summary: 'view_orders',
      },
      {
        aliases: ['travel'],
        command: 'travel',
        description: 'Use get_system to see available POIs.',
        operationId: 'travel',
        routeSignature: 'POST /travel',
        summary: 'Travel to a different Point of Interest (POI) within your current system',
      },
    ]);
  });

  test('compares v2 OpenAPI summaries and descriptions against v1', () => {
    const v1Entries = parseOpenApiHelpEntries({
      paths: {
        '/travel': {
          post: {
            operationId: 'travel',
            summary: 'Travel to a different Point of Interest (POI) within your current system',
            description: 'Use get_system to see available POIs.',
          },
        },
      },
    });
    const v2Entries = parseOpenApiHelpEntries({
      paths: {
        '/api/v2/spacemolt/travel': {
          post: {
            operationId: 'spacemolt_travel',
            summary: 'travel',
          },
        },
      },
    });

    const report = buildCommandHelpReport({ v1Entries, v2Entries });

    expect(report.differenceCount).toBe(2);
    expect(report.commands[0]).toEqual({
      command: 'travel',
      routeSignature: 'POST /api/v2/spacemolt/travel',
      differences: [
        {
          field: 'summary',
          openapiV1: 'Travel to a different Point of Interest (POI) within your current system',
          openapiV2: 'travel',
          signal: 'review',
          status: 'different',
        },
        {
          field: 'description',
          openapiV1: 'Use get_system to see available POIs.',
          signal: 'review',
          status: 'missing',
        },
      ],
    });

    const text = formatCommandHelpReport(report);
    expect(text).toContain('summary [different, review]');
    expect(text).toContain('openapi-v1: Travel to a different Point of Interest');
    expect(text).toContain('openapi-v2: travel');
    expect(text).toContain('description [missing, review]');
    expect(text).not.toContain('api.md');
    expect(text).not.toContain('curated:');
  });

  test('omits matching rows by default and includes them with --all', () => {
    const v1Entries = parseOpenApiHelpEntries({
      paths: {
        '/session': {
          post: {
            operationId: 'createSession',
            summary: 'Create a new session',
            description: 'Creates a new API session.',
          },
        },
      },
    });
    const v2Entries = parseOpenApiHelpEntries({
      paths: {
        '/api/v2/session': {
          post: {
            operationId: 'createSession',
            summary: 'Create a new session',
            description: 'Creates a new API session.',
          },
        },
      },
    });

    const report = buildCommandHelpReport({ v1Entries, v2Entries });

    expect(report.differenceCount).toBe(0);
    expect(formatCommandHelpReport(report)).toContain('No command help differences found.');
    expect(formatCommandHelpReport(report, { includeAll: true })).toContain('summary [match, match]');
  });

  test('filters the report by command name', () => {
    const v1Entries = parseOpenApiHelpEntries({
      paths: {
        '/travel': { post: { operationId: 'travel', summary: 'Travel', description: 'Travel details.' } },
        '/dock': { post: { operationId: 'dock', summary: 'Dock', description: 'Dock details.' } },
      },
    });
    const v2Entries = parseOpenApiHelpEntries({
      paths: {
        '/api/v2/spacemolt/travel': { post: { operationId: 'spacemolt_travel', summary: 'travel' } },
        '/api/v2/spacemolt/dock': { post: { operationId: 'spacemolt_dock', summary: 'dock' } },
      },
    });

    const report = buildCommandHelpReport({ v1Entries, v2Entries, command: 'dock' });

    expect(report.commands.map((entry) => entry.command)).toEqual(['dock']);
  });

  test('omits v1-only operations unless explicitly included', () => {
    const v1Entries = parseOpenApiHelpEntries({
      paths: {
        '/old_command': {
          post: {
            operationId: 'old_command',
            summary: 'Deprecated old command',
            description: 'Old command details.',
          },
        },
      },
    });
    const v2Entries = parseOpenApiHelpEntries({
      paths: {
        '/api/v2/spacemolt/travel': {
          post: {
            operationId: 'spacemolt_travel',
            summary: 'Travel',
            description: 'Travel details.',
          },
        },
      },
    });

    const defaultReport = buildCommandHelpReport({ v1Entries, v2Entries });

    expect(defaultReport.commands.map((entry) => entry.command)).toEqual(['travel']);
    expect(defaultReport.differenceCount).toBe(0);
    expect(formatCommandHelpReport(defaultReport)).not.toContain('old_command');

    const reportWithV1Only = buildCommandHelpReport({ v1Entries, v2Entries, includeV1Only: true });

    expect(reportWithV1Only.differenceCount).toBe(0);
    expect(reportWithV1Only.commands.map((entry) => entry.command)).toEqual(['travel', 'old_command']);
    expect(formatCommandHelpReport(reportWithV1Only, { includeV1Only: true })).toContain(
      'openapi-v2 operation [missing, intentional]',
    );
  });

  test('parses report script flags', () => {
    expect(
      parseReportArgs([
        '--all',
        '--json',
        '--command',
        'travel',
        '--include-intentional',
        '--include-v1-only',
        '--fail-on-diff',
      ]),
    ).toEqual({
      includeAll: true,
      includeIntentional: true,
      includeV1Only: true,
      json: true,
      command: 'travel',
      failOnDiff: true,
    });
    expect(parseReportArgs(['--command=buy'])).toEqual({
      includeAll: false,
      includeIntentional: false,
      includeV1Only: false,
      json: false,
      command: 'buy',
      failOnDiff: false,
    });
  });
});
