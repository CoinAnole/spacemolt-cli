import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { fitPreviewFixture, fitPreviewStatsFixture } from './ship.fixtures.ts';

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
      return new Date('2026-06-19T00:00:00.000Z');
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

function renderFitPreview(fixture: Record<string, unknown> = fitPreviewFixture, command = 'fit_preview') {
  return renderStructuredResult(command, structuredClone(fixture), options, context).stdout.join('\n');
}

function stepsHeader(stdout: string): string {
  const header = stdout.split('\n').find((line) => line.includes('action') && line.includes('Temporary'));
  expect(header).toBeDefined();
  return header ?? '';
}

test('fit_preview prints ship, validity, issues, present stats, and steps', () => {
  const stdout = renderFitPreview();
  expect(stdout).toContain('Ship: ship-active');
  expect(stdout).toContain('Valid: no');
  expect(stdout).toContain('=== Issues ===');
  expect(stdout).toContain('cpu_exceeded');
  expect(stdout).toContain('Need 4 more CPU');
  expect(stdout).toContain('cargo_used: 0');
  expect(stdout).toContain('utility_slots_used: 0');
  expect(stdout).toContain('marines: 0');
  expect(stdout).toContain('cpu_used: 24');
  expect(stdout).toContain('cpu_capacity: 20');
  expect(stdout.indexOf('max_hull: 80')).toBeLessThan(stdout.indexOf('marines: 0'));
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('already matches');
  expect(stdout).not.toContain('free cargo');
  expect(stdout).not.toContain('CPU:');
  expect(stdout).not.toContain('Steps: (none)');

  const header = stepsHeader(stdout);
  expect(header).toContain('action');
  expect(header).toContain('module_id');
  expect(header).toContain('type_id');
  expect(header).toContain('name');
  expect(header).toContain('Temporary');
  expect(header).not.toContain('Slot');

  const kept = stdout.split('\n').find((line) => line.includes('Shield Booster I'));
  const removed = stdout.split('\n').find((line) => line.includes('Cargo Expander I'));
  const installed = stdout.split('\n').find((line) => line.includes('Pulse Laser I'));
  expect(kept).toContain('yes');
  expect(removed).toContain('no');
  expect(installed).toBeDefined();
  expect(installed).not.toContain('yes');
  expect(installed).not.toContain('no');
});

test('fit_preview prints an explicit 0 and skips an omitted stats key', () => {
  const stats = { ...fitPreviewStatsFixture, cpu_used: 0 };
  delete (stats as { speed?: number }).speed;
  const stdout = renderFitPreview({ ...fitPreviewFixture, stats });
  expect(stdout).toContain('cpu_used: 0');
  expect(stdout).not.toContain('speed');
  expect(stdout).not.toContain('free');
});

test('fit_preview prints stats in schema order when the object order differs', () => {
  const stats = Object.fromEntries(Object.entries(fitPreviewStatsFixture).reverse());
  const stdout = renderFitPreview({ ...fitPreviewFixture, stats });
  expect(stdout.indexOf('max_hull: 80')).toBeLessThan(stdout.indexOf('marines: 0'));
  expect(stdout.indexOf('cpu_capacity: 20')).toBeLessThan(stdout.indexOf('cpu_used: 24'));
});

test('fit_preview prints an extra stats key and does not recompute cargo', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    stats: { ...fitPreviewStatsFixture, bonus_armor: 1 },
  });
  expect(stdout).toContain('bonus_armor: 1');
  expect(stdout).toContain('cargo_capacity: 50');
  expect(stdout).toContain('cargo_used: 0');
  expect(stdout).not.toContain('cargo_free');
  expect(stdout).not.toContain('available');
});

test('fit_preview prints nothing for empty issues and Steps: (none) for empty steps', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    valid: true,
    issues: [],
    steps: [],
  });
  expect(stdout).toContain('Valid: yes');
  expect(stdout).not.toContain('=== Issues ===');
  expect(stdout).not.toContain('code');
  expect(stdout).toContain('Steps: (none)');
  expect(stdout).not.toContain('=== Steps ===');
  expect(stdout).not.toContain('already matches');
});

test('fit_preview declines a non-numeric stat, a non-boolean temporary, and an extra top-level key', () => {
  const nullStat = renderFitPreview({
    ...fitPreviewFixture,
    stats: { ...fitPreviewStatsFixture, cargo_used: null },
  });
  expect(nullStat).toContain('=== Response ===');
  expect(nullStat).not.toContain('Valid:');

  const steps = structuredClone(fitPreviewFixture.steps) as Array<Record<string, unknown>>;
  const first = steps[0];
  if (!first) throw new Error('missing fit preview step');
  first.temporary = 'true';
  const badTemporary = renderFitPreview({ ...fitPreviewFixture, steps });
  expect(badTemporary).toContain('=== Response ===');
  expect(badTemporary).not.toContain('Valid:');

  const extra = renderFitPreview({ ...fitPreviewFixture, note: 'keep' });
  expect(extra).toContain('=== Response ===');
  expect(extra).toContain('keep');
  expect(extra).not.toContain('Valid:');
});

test('fit_preview formatting does not run for another command', () => {
  const stdout = renderFitPreview(fitPreviewFixture, 'get_ship');
  expect(stdout).not.toContain('Valid:');
  expect(stdout).toContain('=== Response ===');
});

test('fit_preview prints a bigint armor stat', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    stats: { ...fitPreviewStatsFixture, armor: 9007199254740993n },
  });
  expect(stdout).toContain('armor: 9007199254740993');
  expect(stdout).not.toContain('=== Response ===');
});

test('fit_preview prints negative zero speed as 0', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    stats: { ...fitPreviewStatsFixture, speed: -0 },
  });
  expect(stdout).toContain('speed: 0');
  expect(stdout).not.toContain('speed: -0');
});

test('fit_preview declines a non-finite speed stat', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    stats: { ...fitPreviewStatsFixture, speed: Number.NaN },
  });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview prints Valid and skips an undefined speed value', () => {
  const stats = { ...fitPreviewStatsFixture } as Record<string, unknown>;
  stats.speed = undefined;
  const stdout = renderFitPreview({ ...fitPreviewFixture, stats });
  expect(stdout).toContain('Valid:');
  expect(stdout).not.toContain('speed');
});

test('fit_preview declines when issues are omitted', () => {
  const fixture = { ...fitPreviewFixture };
  delete (fixture as { issues?: unknown }).issues;
  const stdout = renderFitPreview(fixture);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines a non-boolean valid value', () => {
  const stdout = renderFitPreview({ ...fitPreviewFixture, valid: 'yes' });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines a non-string ship_id', () => {
  const stdout = renderFitPreview({ ...fitPreviewFixture, ship_id: 7 });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview prints an issue code when its message is omitted', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    issues: [{ code: 'cpu_exceeded' }],
  });
  expect(stdout).toContain('cpu_exceeded');
  expect(stdout).toContain('Valid:');
  expect(stdout).not.toContain('Need 4 more CPU');
});

test('fit_preview declines when steps are omitted', () => {
  const fixture = { ...fitPreviewFixture };
  delete (fixture as { steps?: unknown }).steps;
  const stdout = renderFitPreview(fixture);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines when stats are omitted', () => {
  const fixture = { ...fitPreviewFixture };
  delete (fixture as { stats?: unknown }).stats;
  const stdout = renderFitPreview(fixture);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview prints an issue message when its code is omitted', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    issues: [{ message: 'Need 4 more CPU' }],
  });
  expect(stdout).toContain('Need 4 more CPU');
  expect(stdout).toContain('Valid:');
  expect(stdout).not.toContain('cpu_exceeded');
});

test('fit_preview prints a step when its name is omitted', () => {
  const steps = structuredClone(fitPreviewFixture.steps) as Array<Record<string, unknown>>;
  const pulse = steps.find((step) => step.name === 'Pulse Laser I');
  if (!pulse) throw new Error('missing fit preview step');
  delete pulse.name;
  const stdout = renderFitPreview({ ...fitPreviewFixture, steps });
  expect(stdout).toContain('install_mod');
  expect(stdout).toContain('Valid:');
  expect(stdout).not.toContain('Pulse Laser I');
  expect(stdout).not.toContain('=== Response ===');
});

test('fit_preview declines an issue with an extra key', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    issues: [{ code: 'cpu_exceeded', message: 'Need 4 more CPU', severity: 'error' }],
  });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines a non-string issue code', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    issues: [{ code: 1 }],
  });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines a non-record issue entry', () => {
  const stdout = renderFitPreview({
    ...fitPreviewFixture,
    issues: ['cpu_exceeded'],
  });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});

test('fit_preview declines a step with an extra key', () => {
  const steps = structuredClone(fitPreviewFixture.steps) as Array<Record<string, unknown>>;
  const first = steps[0];
  if (!first) throw new Error('missing fit preview step');
  first.slot = 'weapon';
  const stdout = renderFitPreview({ ...fitPreviewFixture, steps });
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('Valid:');
});
