import { expect, test } from 'bun:test';
import type { GlobalOptions } from '../types.ts';
import {
  citizenshipApplyOmittedFixture,
  citizenshipApplyPendingFixture,
  citizenshipListFixture,
  citizenshipListOmittedFixture,
  citizenshipListStatelessFixture,
  citizenshipRenounceLastFixture,
  citizenshipRenounceOmittedFixture,
  citizenshipWithdrawFixture,
} from './citizenship.fixtures.ts';
import { renderStructuredResult } from './index.ts';

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

function stdoutOf(command: string, fixture: Record<string, unknown>): string {
  const rendered = renderStructuredResult(command, structuredClone(fixture), options, context);
  expect(rendered.success).toBe(true);
  expect(rendered.stderr).toEqual([]);
  return rendered.stdout.join('\n');
}

test('citizenship list prints origin, remaining grants, empires, and pending petitions', () => {
  const stdout = stdoutOf('citizenship_list', citizenshipListFixture);

  expect(stdout).toContain('=== Citizenship ===');
  expect(stdout).toContain('Origin: nebula');
  expect(stdout).toContain('=== Citizenships ===');
  expect(stdout).toContain('solarian');
  expect(stdout).toContain('2026-01-15T00:00:00Z');
  expect(stdout).toContain('council');
  expect(stdout).toContain('=== Empires ===');
  expect(stdout).toContain('Crimson');
  expect(stdout).toContain('=== Pending Petitions ===');
  expect(stdout).toContain('pet-crimson-1');
  expect(stdout).not.toContain('player-1');
  expect(stdout).not.toContain('Marlowe');
  expect(stdout).not.toContain('=== Response ===');
});

test('citizenship list prints Citizenships: none for an empty remaining array', () => {
  const stdout = stdoutOf('citizenship_list', citizenshipListStatelessFixture);

  expect(stdout).toContain('=== Citizenship ===');
  expect(stdout).toContain('Origin: nebula');
  expect(stdout).toContain('Citizenships: none');
  expect(stdout).toContain('=== Empires ===');
  expect(stdout).not.toContain('Citizenships: stateless');
  expect(stdout).not.toContain('=== Citizenships ===');
  expect(stdout).not.toContain('(None)');
  expect(stdout).not.toContain('=== Response ===');
});

test('citizenship list prints Citizenships: none when remaining is omitted', () => {
  const stdout = stdoutOf('citizenship_list', citizenshipListOmittedFixture);

  expect(stdout).toContain('Origin: nebula');
  expect(stdout).toContain('Citizenships: none');
  expect(stdout).toContain('=== Empires ===');
  expect(stdout).not.toContain('Citizenships: stateless');
});

test('citizenship renounce of the last grant prints none and Renounced', () => {
  const stdout = stdoutOf('citizenship_renounce', citizenshipRenounceLastFixture);

  expect(stdout).toContain('=== Citizenship Renounced ===');
  expect(stdout).toContain('Last citizenship dropped.');
  expect(stdout).toContain('Citizenships: none');
  expect(stdout).toContain('Renounced: solarian');
  expect(stdout).toContain('Origin: nebula');
  expect(stdout).not.toContain('=== Response ===');
});

test('citizenship renounce treats omitted remaining as none', () => {
  const stdout = stdoutOf('citizenship_renounce', citizenshipRenounceOmittedFixture);

  expect(stdout).toContain('=== Citizenship Renounced ===');
  expect(stdout).toContain('Citizenships: none');
  expect(stdout).toContain('Renounced: solarian');
});

test('citizenship apply pending prints remaining grants and a petition block', () => {
  const stdout = stdoutOf('citizenship_apply', citizenshipApplyPendingFixture);

  expect(stdout).toContain('=== Citizenship Application ===');
  expect(stdout).toContain('=== Citizenships ===');
  expect(stdout).toContain('Petition:');
  expect(stdout).toContain('Empire: solarian');
  expect(stdout).toContain('Fee: 1,000 cr');
  expect(stdout).toContain('Fee paid: 1,000 cr');
  expect(stdout).not.toContain('Renounced:');
  expect(stdout).not.toContain('player-1');
  expect(stdout).not.toContain('=== Response ===');
});

test('citizenship apply omits Citizenships: none when remaining is omitted', () => {
  const stdout = stdoutOf('citizenship_apply', citizenshipApplyOmittedFixture);

  expect(stdout).toContain('=== Citizenship Application ===');
  expect(stdout).toContain('Petition:');
  expect(stdout).not.toContain('Citizenships: none');
  expect(stdout).not.toContain('Renounced:');
});

test('citizenship withdraw prints the refund and leaves held citizenships', () => {
  const stdout = stdoutOf('citizenship_withdraw', citizenshipWithdrawFixture);

  expect(stdout).toContain('=== Application Withdrawn ===');
  expect(stdout).toContain('Fee refunded: 1,000 cr');
  expect(stdout).toContain('=== Citizenships ===');
  expect(stdout).not.toContain('Renounced:');
  expect(stdout).not.toContain('=== Response ===');
});

test('citizenship list declines dry-run route previews', () => {
  const stdout = stdoutOf('citizenship_list', {
    method: 'POST',
    url: 'https://game.spacemolt.com/api/v2/spacemolt_citizenship/list',
    payload: {},
  });

  expect(stdout).not.toContain('=== Citizenship ===');
  expect(stdout).toContain('=== Response ===');
});

test('citizenship list prints a comma remaining line for defensive string ids', () => {
  const stdout = stdoutOf('citizenship_list', {
    origin: 'nebula',
    citizenships: ['solarian', 'nebula'],
  });

  expect(stdout).toContain('Citizenships: solarian, nebula');
  expect(stdout).not.toContain('=== Citizenships ===');
});
