import { describe, expect, test } from 'bun:test';
import {
  enrichStorageViewStructuredContent,
  parseStorageInventoryHint,
  rewriteStorageViewHint,
  sumStorageItemQuantities,
} from './storage-view-display.ts';

describe('parseStorageInventoryHint', () => {
  test('parses personal storage hints with multiple stations', () => {
    expect(
      parseStorageInventoryHint(
        '181,708 items in storage at confederacy_central_command, crimson_war_citadel, nova_terra_central',
      ),
    ).toEqual({
      totalQuantity: 181708,
      faction: false,
      stations: ['confederacy_central_command', 'crimson_war_citadel', 'nova_terra_central'],
      suffix: '',
    });
  });

  test('parseStorageInventoryHint returns undefined when station tokens are blank', () => {
    expect(parseStorageInventoryHint('5 items in storage at ,')).toBeUndefined();
  });

  test('parseStorageInventoryHint returns undefined for a non-finite quantity', () => {
    expect(parseStorageInventoryHint(`${'1'.repeat(400)} items in storage at earth_station`)).toBeUndefined();
  });

  test('parses faction storage hints and preserves bunker suffix', () => {
    expect(
      parseStorageInventoryHint(
        "3,076,406 items in faction storage at crimson_war_citadel, nova_terra_central Fuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
      ),
    ).toEqual({
      totalQuantity: 3076406,
      faction: true,
      stations: ['crimson_war_citadel', 'nova_terra_central'],
      suffix: " Fuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
    });
  });
});

describe('rewriteStorageViewHint', () => {
  test('rewrites multi-station hints to station-local totals', () => {
    const rewritten = rewriteStorageViewHint(
      {
        base_id: 'crimson_war_citadel',
        hint: '181,708 items in storage at confederacy_central_command, crimson_war_citadel, nova_terra_central',
        items: [
          { item_id: 'deuterium_ice', quantity: 3 },
          { item_id: 'iron_ore', quantity: 6324 },
        ],
      },
      { requestedStationId: 'crimson_war_citadel' },
    );

    expect(rewritten.hint).toBe('6,327 items in storage at crimson_war_citadel (181,708 total across 3 stations)');
    expect(rewritten.storage_title).toBeUndefined();
  });

  test('marks pooled inventory with an across-stations title', () => {
    const rewritten = rewriteStorageViewHint(
      {
        base_id: 'nova_terra_central',
        hint: '181,708 items in storage at confederacy_central_command, crimson_war_citadel, nova_terra_central',
        items: [{ item_id: 'iron_ore', quantity: 181708 }],
      },
      { requestedStationId: 'nova_terra_central' },
    );

    expect(rewritten.storage_title).toBe('across 3 stations');
    expect(rewritten.hint).toBe(
      '181,708 items in storage at confederacy_central_command, crimson_war_citadel, nova_terra_central',
    );
  });

  test('pooled faction hint keeps the faction label and bunker suffix', () => {
    const rewritten = rewriteStorageViewHint(
      {
        base_id: 'crimson_war_citadel',
        hint: "3,076,406 items in faction storage at crimson_war_citadel, nova_terra_central Fuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
        items: [{ item_id: 'iron_ore', quantity: 3076406 }],
      },
      { requestedStationId: 'crimson_war_citadel' },
    );

    expect(rewritten.storage_title).toBe('across 2 stations');
    expect(rewritten.hint).toContain('items in faction storage at');
    expect(rewritten.hint).toContain(
      "Fuel bunker here: deposit fuel from your ship's tank with storage deposit target=faction item_id=fuel.",
    );
  });

  test('leaves single-station hints unchanged', () => {
    const content = {
      base_id: 'earth_station',
      hint: '12 items in storage at earth_station',
      items: [{ item_id: 'fuel_cell', quantity: 12 }],
    };

    expect(rewriteStorageViewHint(content)).toEqual(content);
  });

  test('returns the same content for an empty hint', () => {
    const content = { hint: '' };

    expect(rewriteStorageViewHint(content)).toEqual(content);
  });

  test('returns the same content for a non-string hint', () => {
    const content = { hint: 12 };

    expect(rewriteStorageViewHint(content)).toEqual(content);
  });

  test('returns the same content for an unparseable storage hint', () => {
    const content = {
      base_id: 'earth_station',
      hint: 'see storage',
      items: [{ item_id: 'fuel_cell', quantity: 12 }],
    };

    expect(rewriteStorageViewHint(content, { requestedStationId: 'earth_station' })).toEqual(content);
  });

  test('leaves a multi-station hint unchanged when no station id is available', () => {
    const content = { hint: '100 items in storage at alpha, beta' };

    expect(rewriteStorageViewHint(content)).toEqual(content);
  });

  test('rewrites a multi-station hint for a requested station id without base_id', () => {
    const rewritten = rewriteStorageViewHint(
      {
        hint: '100 items in storage at alpha, beta',
        items: [{ item_id: 'ore', quantity: 40 }],
      },
      { requestedStationId: 'alpha' },
    );

    expect(rewritten.hint).toBe('40 items in storage at alpha (100 total across 2 stations)');
  });

  test('rewrites a multi-station hint for a zero local quantity', () => {
    const rewritten = rewriteStorageViewHint(
      {
        hint: '100 items in storage at alpha, beta',
        items: [{ item_id: 'ore', quantity: 0 }],
      },
      { requestedStationId: 'alpha' },
    );

    expect(rewritten.hint).toBe('0 items in storage at alpha (100 total across 2 stations)');
  });

  test('rewrites a multi-station hint whose parsed total is not greater than the local quantity', () => {
    const rewritten = rewriteStorageViewHint(
      {
        hint: '0 items in storage at alpha, beta',
        items: [{ item_id: 'ore', quantity: 40 }],
      },
      { requestedStationId: 'alpha' },
    );

    expect(rewritten.hint).toBe('40 items in storage at alpha');
    expect(rewritten.hint).not.toContain('total across');
  });
});

describe('enrichStorageViewStructuredContent', () => {
  test('adds payload target and rewrites hints from unfiltered inventory items', () => {
    const enriched = enrichStorageViewStructuredContent(
      {
        base_id: 'nova_terra_central',
        hint: '181,708 items in storage at confederacy_central_command, nova_terra_central',
        items: [{ item_id: 'steel_plate', quantity: 70257 }],
      },
      {
        payloadTarget: 'self',
        requestedStationId: 'nova_terra_central',
        inventoryItems: [
          { item_id: 'steel_plate', quantity: 70257 },
          { item_id: 'fuel_cell', quantity: 12 },
        ],
      },
    );

    expect(enriched.target).toBe('self');
    expect(enriched.hint).toBe('70,269 items in storage at nova_terra_central (181,708 total across 2 stations)');
  });

  test('keeps an existing storage target when payloadTarget is self', () => {
    const enriched = enrichStorageViewStructuredContent(
      { target: 'faction', hint: '12 items in storage at earth_station' },
      { payloadTarget: 'self' },
    );

    expect(enriched.target).toBe('faction');
  });
});

describe('sumStorageItemQuantities', () => {
  test('sums numeric item quantities', () => {
    expect(
      sumStorageItemQuantities([
        { item_id: 'iron_ore', quantity: 10 },
        { item_id: 'fuel_cell', quantity: 2 },
      ]),
    ).toBe(12);
  });

  test('skips a non-finite quantity', () => {
    expect(
      sumStorageItemQuantities([
        { item_id: 'iron_ore', quantity: 10 },
        { item_id: 'bad', quantity: Number.NaN },
      ]),
    ).toBe(10);
  });
});
