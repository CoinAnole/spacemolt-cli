import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { storageDepositAutoDockedFixture } from './generic.fixtures.ts';
import { renderStructuredResult } from './index.ts';
import { mineFilteredDetails, mineFilteredFixture, mineYieldDetails, mineYieldFixture } from './mine.fixtures.ts';
import { mineFormatters } from './mine.ts';

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

function renderMine(result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}) {
  return renderStructuredResult('mine', result, { ...options, ...extra }, context);
}

function stdoutOf(result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  return renderMine(result, extra).stdout.join('\n');
}

function clonePresent(mutate?: (details: Record<string, unknown>) => void): Record<string, unknown> {
  const fixture = structuredClone(mineYieldFixture) as {
    details: Record<string, unknown>;
  };
  mutate?.(fixture.details);
  return fixture;
}

function earthStationLocation(dockedAt: string | null): Record<string, unknown> {
  return structuredClone({
    ...(storageDepositAutoDockedFixture.location as Record<string, unknown>),
    docked_at: dockedAt,
  });
}

function lineContaining(stdout: string, snippet: string): string {
  const line = stdout.split('\n').find((candidate) => candidate.includes(snippet));
  expect(line).toBeDefined();
  return line ?? '';
}

test('mine prints present-field yield name, remaining, depletion, and XP', () => {
  const stdout = stdoutOf(structuredClone(mineYieldFixture));

  expect(stdout).toContain(
    '=== Mine ===\nMined 42 Iron Ore (ore_iron)\nDeposit: 120/300 (40.00% remaining)\nSkill XP: mining +8',
  );
  expect(stdout).not.toContain('Drone:');
  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('kind');
  expect(stdout).not.toContain('Kind:');
});

test('mine filtered prints no-yield framing and the server message', () => {
  const stdout = stdoutOf(structuredClone(mineFilteredFixture));

  expect(stdout).toContain(
    '=== Mine ===\nNo yield this cycle.\nExtraction filter rejected every workable deposit at this POI. Unfit the filter, or move to a field carrying an ore the filter accepts.',
  );
  expect(stdout).not.toContain('Kind: filtered');
  expect(stdout).not.toContain('Filtered: true');
  expect(stdout).not.toContain('Message:');
  expect(stdout).not.toContain('=== Response ===');
});

test('mine omits XP, resource name, depletion, and drone when those fields are absent', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      delete details.resource_name;
      delete details.depletion_percent;
      delete details.xp_gained;
      delete details.drone_id;
    }),
  );

  expect(stdout).toContain('Mined 42 ore_iron');
  expect(stdout).not.toContain('Iron Ore');
  expect(lineContaining(stdout, 'Deposit:')).toBe('Deposit: 120/300');
  expect(stdout).not.toContain('% remaining');
  expect(stdout).not.toContain('Skill XP:');
  expect(stdout).not.toContain('Drone:');
});

test('mine prints resource_id only when resource_name equals the id', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.resource_name = 'ore_iron';
    }),
  );

  expect(stdout).toContain('Mined 42 ore_iron');
  expect(stdout).not.toContain('ore_iron (ore_iron)');
});

test('mine skips Skill XP for empty, zero, and non-record maps', () => {
  const empty = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = {};
    }),
  );
  const zero = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = { mining: 0 };
    }),
  );
  const scalar = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = 8;
    }),
  );

  expect(empty).toContain('=== Mine ===');
  expect(empty).not.toContain('Skill XP:');
  expect(zero).toContain('=== Mine ===');
  expect(zero).not.toContain('Skill XP:');
  expect(scalar).toContain('=== Mine ===');
  expect(scalar).not.toContain('Skill XP:');
  expect(scalar).not.toContain('=== Response ===');
});

test('mine joins multiple non-zero XP entries', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = { mining: 8, deep_core_mining: 3 };
    }),
  );

  expect(stdout).toContain('Skill XP: mining +8, deep_core_mining +3');
});

test('mine prints quantity as a plain decimal without grouping', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.quantity = 1234;
    }),
  );

  expect(stdout).toContain('Mined 1234 Iron Ore (ore_iron)');
  expect(stdout).not.toContain('1,234');
});

test('mine unlimited remaining skips depletion even with percent 0 and max_remaining', () => {
  const both = stdoutOf(
    clonePresent((details) => {
      details.remaining = -1;
      details.remaining_display = 'unlimited';
      details.max_remaining = 300;
      details.depletion_percent = 0;
    }),
  );
  const byRemaining = stdoutOf(
    clonePresent((details) => {
      details.remaining = -1;
      details.remaining_display = '120 units';
      details.max_remaining = 300;
      details.depletion_percent = 0;
    }),
  );
  const byDisplay = stdoutOf(
    clonePresent((details) => {
      details.remaining = 120;
      details.remaining_display = 'unlimited';
      details.max_remaining = 300;
      details.depletion_percent = 0;
    }),
  );

  for (const stdout of [both, byRemaining, byDisplay]) {
    expect(lineContaining(stdout, 'Deposit:')).toBe('Deposit: unlimited');
    expect(stdout).not.toContain('-1/');
    expect(stdout).not.toContain('% remaining');
  }
});

test('mine depleted remaining skips depletion even with percent 100', () => {
  const both = stdoutOf(
    clonePresent((details) => {
      details.remaining = 0;
      details.remaining_display = 'depleted';
      details.depletion_percent = 100;
    }),
  );
  const byRemaining = stdoutOf(
    clonePresent((details) => {
      details.remaining = 0;
      details.remaining_display = '120 units';
      details.depletion_percent = 100;
    }),
  );
  const byDisplay = stdoutOf(
    clonePresent((details) => {
      details.remaining = 120;
      details.remaining_display = 'depleted';
      details.depletion_percent = 100;
    }),
  );

  for (const stdout of [both, byRemaining, byDisplay]) {
    expect(lineContaining(stdout, 'Deposit:')).toBe('Deposit: depleted');
    expect(stdout).not.toContain('% remaining');
  }
});

test('mine omitted max_remaining uses remaining_display plus optional depletion suffix', () => {
  const withSuffix = stdoutOf(
    clonePresent((details) => {
      delete details.max_remaining;
    }),
  );
  const withoutSuffix = stdoutOf(
    clonePresent((details) => {
      delete details.max_remaining;
      delete details.depletion_percent;
    }),
  );

  expect(lineContaining(withSuffix, 'Deposit:')).toBe('Deposit: 120 units (40.00% remaining)');
  expect(lineContaining(withoutSuffix, 'Deposit:')).toBe('Deposit: 120 units');
});

test('mine formats flat details without an envelope', () => {
  const stdout = stdoutOf(structuredClone(mineYieldDetails));

  expect(stdout).toContain('=== Mine ===');
  expect(stdout).toContain('Mined 42 Iron Ore (ore_iron)');
  expect(stdout).not.toContain('=== Response ===');
});

test('mine does not dump sibling location or skills', () => {
  const stdout = stdoutOf(structuredClone(mineYieldFixture));

  expect(stdout).not.toContain('sol_asteroid_belt');
  expect(stdout).not.toContain('=== Location ===');
  expect(stdout).not.toContain('=== Your Skills ===');
  expect(stdout).not.toContain('System Id');
  expect(stdout).not.toContain('Poi Name');
});

test('mine details-only auto_undocked does not print a banner or compact undock', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.auto_undocked = true;
    }),
  );

  expect(stdout).toContain('=== Mine ===');
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
  expect(stdout).not.toContain('Auto-undocked');
  expect(stdout).not.toContain('Undocked at:');
});

test('mine compact undock prints Undocked at after the mine block', () => {
  const fixture = clonePresent((details) => {
    details.auto_undocked = true;
  });
  fixture.location = earthStationLocation(null);
  const stdout = stdoutOf(fixture);

  expect(stdout).toContain('=== Mine ===');
  expect(stdout).toContain('Undocked at: Earth Station (earth_station), Sol (sol)');
  expect(stdout.indexOf('=== Mine ===')).toBeLessThan(stdout.indexOf('Undocked at:'));
  expect(stdout).not.toContain('[AUTO-UNDOCKED]');
  expect(stdout).not.toContain('Auto-undocked');
});

test('mine top-level auto_undocked prints the cyan banner without a formatter field', () => {
  const fixture = clonePresent();
  fixture.auto_undocked = true;
  fixture.location = earthStationLocation(null);
  const stdout = stdoutOf(fixture);

  expect(stdout).toContain('[AUTO-UNDOCKED]');
  expect(stdout).toContain('=== Mine ===');
  expect(stdout).not.toContain('Auto-undocked: yes');
  expect(stdout).not.toContain('Auto-undocked');
});

test('mine prints drone_id between deposit and XP', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.drone_id = 'drone-17';
    }),
  );

  expect(stdout).toContain(
    '=== Mine ===\nMined 42 Iron Ore (ore_iron)\nDeposit: 120/300 (40.00% remaining)\nDrone: drone-17\nSkill XP: mining +8',
  );
});

test('mine declines scalar no-kind yield to the raw fallback', () => {
  const payload = {
    resource_id: 'ore_iron',
    quantity: 42,
    remaining: 120,
    remaining_display: '120 units',
  };

  expect(mineFormatters[0]?.(payload, 'mine')).toBe(false);

  const stdout = stdoutOf(payload);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Mine ===');
});

test('mine declines scalar no-kind filtered to the raw fallback', () => {
  const payload = {
    filtered: true,
    message: mineFilteredDetails.message,
  };

  expect(mineFormatters[0]?.(payload, 'mine')).toBe(false);

  const stdout = stdoutOf(payload);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Mine ===');
});
