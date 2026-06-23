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

  test('leaves single-station hints unchanged', () => {
    const content = {
      base_id: 'earth_station',
      hint: '12 items in storage at earth_station',
      items: [{ item_id: 'fuel_cell', quantity: 12 }],
    };

    expect(rewriteStorageViewHint(content)).toEqual(content);
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
});
