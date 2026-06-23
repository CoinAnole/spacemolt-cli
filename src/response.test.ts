import { describe, expect, test } from 'bun:test';
import { normalizeStructuredResultForDisplay, normalizeStructuredResultForOutput } from './response.ts';

const factionIntelFixture = {
  count: 1,
  current_tick: 900690,
  entries: [
    {
      system_id: 'sol',
      name: 'Sol',
      pois: [
        {
          id: 'sol_gas_cloud',
          type: 'gas_cloud',
          name: 'Sol Gas Cloud',
          resources: [
            { resource_id: 'hydrogen_gas', richness: 4, remaining: 500 },
            { id: null, resource_id: 'argon_gas', richness: 2, remaining: 200 },
            { id: 'helium_gas', richness: 1, remaining: 50 },
          ],
        },
      ],
    },
  ],
};

describe('normalizeStructuredResultForOutput', () => {
  test('faction_query_intel fills missing resource id from resource_id', () => {
    const normalized = normalizeStructuredResultForOutput('faction_query_intel', factionIntelFixture);
    const resources = (
      (normalized.entries as Array<Record<string, unknown>>)[0]?.pois as Array<Record<string, unknown>>
    )[0]?.resources as Array<Record<string, unknown>>;

    expect(resources[0]?.id).toBe('hydrogen_gas');
    expect(resources[0]?.resource_id).toBe('hydrogen_gas');
    expect(resources[1]?.id).toBe('argon_gas');
    expect(resources[1]?.resource_id).toBe('argon_gas');
    expect(resources[2]?.id).toBe('helium_gas');
    expect(resources[2]?.resource_id).toBe('helium_gas');
  });

  test('does not rewrite unrelated commands', () => {
    const actionLog = {
      entries: [{ id: 'event-1', summary: 'crafted' }],
    };
    expect(normalizeStructuredResultForOutput('get_action_log', actionLog)).toEqual(actionLog);
  });
});

describe('normalizeStructuredResultForDisplay', () => {
  test('normalizes faction intel entries for table rendering', () => {
    const normalized = normalizeStructuredResultForDisplay(factionIntelFixture);
    const resources = (
      (normalized.entries as Array<Record<string, unknown>>)[0]?.pois as Array<Record<string, unknown>>
    )[0]?.resources as Array<Record<string, unknown>>;

    expect(resources[1]?.id).toBe('argon_gas');
  });
});