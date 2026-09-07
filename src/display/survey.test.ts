import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import { renderStructuredResult } from './index.ts';
import { poiWorkabilityFixture } from './status.fixtures.ts';
import { surveySystemDetails, surveySystemFixture, surveySystemNoHitsFixture } from './survey.fixtures.ts';
import { surveyFormatters } from './survey.ts';
import { formatCompactTable } from './tables.ts';

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

function renderSurvey(result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}) {
  return renderStructuredResult('survey_system', result, { ...options, ...extra }, context);
}

function stdoutOf(result: Record<string, unknown>, extra: Partial<GlobalOptions> = {}): string {
  return renderSurvey(result, extra).stdout.join('\n');
}

function clonePresent(mutate?: (details: Record<string, unknown>) => void): Record<string, unknown> {
  const fixture = structuredClone(surveySystemFixture) as {
    details: Record<string, unknown>;
  };
  mutate?.(fixture.details);
  return fixture;
}

test('survey_system prints present-field sections and 4-space ResourceInfo bullets', () => {
  const stdout = stdoutOf(structuredClone(surveySystemFixture));
  const poiStdout = stdoutOfGetPoi();

  expect(stdout).toContain('=== Survey: Sol (sol) ===');
  expect(stdout).toContain('Survey power: 18');
  expect(stdout).toContain('Bloom: active (intensity 0.8)');
  expect(stdout).toContain('Survey complete. Hidden deposits resolved.');
  expect(stdout).toContain('A faint resonance west of the belt.');
  expect(stdout).toContain('Kaiser Vein (sol_kaiser_vein)  asteroid_belt');
  expect(stdout).toContain('A dense iron-gold plug beneath the main belt.');

  const iron = lineContaining(stdout, '120/300');
  const gold = lineContaining(stdout, 'Gold Ore');
  const copper = lineContaining(stdout, 'Copper Ore');
  expect(iron.startsWith('    - ')).toBe(true);
  expect(iron.startsWith('      - ')).toBe(false);
  expect(gold.startsWith('    - ')).toBe(true);
  expect(gold.startsWith('      - ')).toBe(false);
  expect(copper.startsWith('    - ')).toBe(true);
  expect(copper.startsWith('      - ')).toBe(false);
  expect(gold.slice(2)).toBe(lineContaining(poiStdout, 'Gold Ore'));
  expect(copper.slice(2)).toBe(lineContaining(poiStdout, 'Copper Ore'));
  expect(iron.slice(2)).toBe(lineContaining(poiStdout, 'Iron Ore'));

  const knownIron = lineContaining(stdout, '750/1000');
  expect(knownIron).toContain('supports power 12');
  expect(knownIron).not.toContain('lock min');
  expect(knownIron).not.toContain('too sparse');

  expect(stdout).toContain('  - deep_core: Need more survey power (difficulty 24)');
  expect(stdout).toContain('Skill XP: scanning +12, deep_core_mining +8');

  const wildlife = formatCompactTable(
    'Wildlife',
    [
      {
        species: 'ember_grazer',
        name: 'Ember Grazer',
        role: 'grazer',
        estimate: 42,
        abundance: 'common',
        ranched_display: '0',
      },
      {
        species: 'molt_leviathan',
        name: 'Molt Leviathan',
        role: 'predator',
        estimate: 1,
        abundance: 'rare',
        ranched_display: '',
      },
    ],
    [
      ['Species', ['species']],
      ['Name', ['name']],
      ['Role', ['role']],
      ['Estimate', ['estimate']],
      ['Abundance', ['abundance']],
      ['Ranched', ['ranched_display']],
    ],
    { maxCellWidth: 40 },
  ).join('\n');
  expect(stdout).toContain(wildlife);
  expect(stdout).toContain('Ranched');
  expect(lineContaining(stdout, 'ember_grazer')).toMatch(/ 0\s*$/);

  expect(stdout).not.toContain('=== Response ===');
  expect(stdout).not.toContain('=== Location ===');
  expect(stdout).not.toContain('=== Your Skills ===');
});

test('survey_system no-hits prints empty newly-revealed and wildlife copy', () => {
  const stdout = stdoutOf(structuredClone(surveySystemNoHitsFixture));

  expect(stdout).toContain('=== Survey: Sol (sol) ===');
  expect(stdout).toContain('Survey power: 8');
  expect(stdout).toContain('Bloom: none (intensity 0)');
  expect(stdout).toContain('Survey complete. No hidden deposits resolved.');
  expect(stdout).toContain('Newly Revealed:\n  (none)');
  expect(stdout).toContain('Wildlife:\n  (none)');
  expect(stdout).not.toContain('Already Known');
  expect(stdout).not.toContain('Faint Signatures');
  expect(stdout).not.toContain('Skill XP:');
  expect(stdout).not.toContain('A faint resonance');
  expect(stdout).not.toContain('=== Wildlife ===');
});

test('survey_system empty resources on a hit omit resource lines', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.newly_revealed = [
        {
          id: 'sol_kaiser_vein',
          name: 'Kaiser Vein',
          type: 'asteroid_belt',
          description: 'A dense iron-gold plug beneath the main belt.',
          resources: [],
        },
      ];
      details.already_revealed = [];
    }),
  );

  expect(stdout).toContain('Kaiser Vein (sol_kaiser_vein)');
  expect(stdout).not.toContain('Iron Ore');
  expect(stdout).not.toContain('Resources:');
});

test('survey_system too_sparse false does not print too sparse', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.newly_revealed = [
        {
          id: 'sol_kaiser_vein',
          name: 'Kaiser Vein',
          type: 'asteroid_belt',
          resources: [{ ...poiWorkabilityFixture.resources[1], too_sparse: false }],
        },
      ];
    }),
  );

  expect(stdout).toContain('supports power 3');
  expect(stdout).not.toContain('too sparse');
});

test('survey_system omitted anomaly_hint prints no hint text', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      delete details.anomaly_hint;
    }),
  );

  expect(stdout).not.toContain('A faint resonance west of the belt.');
});

test('survey_system omitted bloom does not interpolate undefined', () => {
  const rendered = renderSurvey(
    clonePresent((details) => {
      delete details.bloom_status;
      delete details.bloom_intensity;
    }),
  );
  const stdout = rendered.stdout.join('\n');
  const stderr = rendered.stderr.join('\n');

  expect(stdout).not.toContain('Bloom:');
  expect(stdout).not.toContain('undefined');
  expect(stderr).not.toContain('undefined');
});

test('survey_system skips Skill XP for empty and zero maps', () => {
  const empty = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = {};
    }),
  );
  const zero = stdoutOf(
    clonePresent((details) => {
      details.xp_gained = { scanning: 0 };
    }),
  );

  expect(empty).not.toContain('Skill XP:');
  expect(zero).not.toContain('Skill XP:');
});

test('survey_system omits Ranched column when no row has ranched', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      details.wildlife = [
        {
          species: 'ember_grazer',
          name: 'Ember Grazer',
          role: 'grazer',
          estimate: 42,
          abundance: 'common',
        },
      ];
    }),
  );

  const header = lineContaining(stdout, 'Species');
  expect(header).toContain('Species');
  expect(header).toContain('Name');
  expect(header).toContain('Role');
  expect(header).toContain('Estimate');
  expect(header).toContain('Abundance');
  expect(header).not.toContain('Ranched');
  expect(stdout).not.toContain('Ranched');
});

test('survey_system formats flat details without an envelope', () => {
  const stdout = stdoutOf(structuredClone(surveySystemDetails));

  expect(stdout).toContain('=== Survey: Sol (sol) ===');
  expect(stdout).toContain('Kaiser Vein (sol_kaiser_vein)');
  expect(stdout).not.toContain('=== Response ===');
});

function overlaySurveyedPoi(rows: unknown, value: unknown): void {
  const poi = Array.isArray(rows) ? rows[0] : undefined;
  if (!poi || typeof poi !== 'object') throw new Error('expected surveyed POI');
  (poi as Record<string, unknown>).deep_core = value;
}

test('survey_system appends [deep core] on a newly revealed overlay', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      overlaySurveyedPoi(details.newly_revealed, true);
    }),
  );

  expect(stdout).toContain('Kaiser Vein (sol_kaiser_vein)  asteroid_belt [deep core]');
  expect(stdout).toContain('  - deep_core: Need more survey power (difficulty 24)');
  expect(stdout).not.toContain('Deep core: yes');
});

test('survey_system appends [deep core] on an already known overlay', () => {
  const stdout = stdoutOf(
    clonePresent((details) => {
      overlaySurveyedPoi(details.already_revealed, true);
    }),
  );

  expect(stdout).toContain('Outer Belt Cache (sol_outer_cache)  asteroid_belt [deep core]');
  expect(stdout).toContain('  - deep_core: Need more survey power (difficulty 24)');
});

test('survey_system omits [deep core] when false or missing and leaves faint signatures unchanged', () => {
  const missing = stdoutOf(structuredClone(surveySystemFixture));
  expect(missing).not.toContain('[deep core]');
  expect(missing).toContain('  - deep_core: Need more survey power (difficulty 24)');

  const falsy = stdoutOf(
    clonePresent((details) => {
      overlaySurveyedPoi(details.newly_revealed, false);
      overlaySurveyedPoi(details.already_revealed, 'true');
    }),
  );
  expect(falsy).not.toContain('[deep core]');
  expect(falsy).toContain('  - deep_core: Need more survey power (difficulty 24)');
});

test('survey_system does not dump sibling location or skills', () => {
  const stdout = stdoutOf(structuredClone(surveySystemFixture));

  expect(stdout).not.toContain('sol_asteroid_belt');
  expect(stdout).not.toContain('=== Location ===');
  expect(stdout).not.toContain('=== Your Skills ===');
});

test('survey_system recognition declines when revealed lists are not arrays', () => {
  const payload = {
    survey_power: 1,
    newly_revealed: 'not-an-array',
    already_revealed: { nested: true },
    extra: { nested: 'object' },
  };

  expect(surveyFormatters[0]?.(payload, 'survey_system')).toBe(false);

  const stdout = stdoutOf(payload);
  expect(stdout).toContain('=== Response ===');
  expect(stdout).not.toContain('=== Survey:');
  expect(stdout).not.toContain('=== Location ===');
  expect(stdout).not.toContain('=== Your Skills ===');
});

test('survey_system omits faint difficulty when it is not a non-empty string', () => {
  const omitted = stdoutOf(
    clonePresent((details) => {
      details.faint_signatures = [{ type: 'deep_core', hint: 'Need more survey power' }];
    }),
  );
  const blank = stdoutOf(
    clonePresent((details) => {
      details.faint_signatures = [{ type: 'deep_core', hint: 'Need more survey power', difficulty: '' }];
    }),
  );

  expect(omitted).toContain('  - deep_core: Need more survey power');
  expect(omitted).not.toContain('difficulty');
  expect(blank).toContain('  - deep_core: Need more survey power');
  expect(blank).not.toContain('difficulty');
});

function stdoutOfGetPoi(): string {
  return renderStructuredResult('get_poi', structuredClone(poiWorkabilityFixture), options, context).stdout.join('\n');
}

function lineContaining(stdout: string, snippet: string): string {
  const line = stdout.split('\n').find((candidate) => candidate.includes(snippet));
  expect(line).toBeDefined();
  return line ?? '';
}
