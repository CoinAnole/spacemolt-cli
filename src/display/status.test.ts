import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { scanCreatureFixture } from './status.fixtures.ts';

const options: GlobalOptions = {
  args: [],
  json: false,
  quiet: false,
  plain: true,
  allowUnknown: false,
  dryRun: false,
  noTimestamp: true,
  compact: false,
};

const context = {
  clock: {
    now() {
      return new Date('2026-07-18T00:00:00.000Z');
    },
  },
  output: {
    json: false,
    quiet: false,
    plain: true,
    format: 'table' as const,
    compact: false,
  },
};

test('renders creature scan identity, hull, and revealed wildlife details in order', () => {
  const rendered = renderStructuredResult('scan', structuredClone(scanCreatureFixture), options, context);
  const stdout = rendered.stdout.join('\n');

  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  expect(stdout).toContain('=== Scan Result ===');
  expect(stdout).toContain('Target: creature-ember-grazer-1');
  expect(stdout).toContain('Hull: 80');
  expect(stdout).toContain('Revealed:');

  const revealLines = ['Species: Ember Grazer', 'Role: grazer', 'Danger: low', 'Ranchable: yes'];
  const revealIndexes = revealLines.map((line) => stdout.indexOf(line));
  expect(revealIndexes.every((index) => index >= 0)).toBe(true);
  expect(revealIndexes).toEqual([...revealIndexes].sort((left, right) => left - right));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('NaN');
  expect(stdout).not.toContain('undefined');
  expect(stdout).not.toContain('[object Object]');
});

test('scan formatter declines a malformed shape without a target identity', () => {
  const malformed = { revealed_info: ['Species: Ember Grazer'] };
  const rendered = renderStructuredResult('scan', malformed, options, context);

  expect(rendered.stdout.join('\n')).toContain('=== Response ===');
});
