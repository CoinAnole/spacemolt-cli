import { describe, expect, test } from 'bun:test';
import { emitGiftEntries } from './gifts.ts';
import { withDisplayRenderBuffer } from './helpers.ts';

function renderGifts(gifts: unknown, options: { ships: boolean }): { stdout: string; stderr: string } {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitGiftEntries(gifts, options), { plain: true });
  return { stdout: buffer.stdout.join('\n'), stderr: buffer.stderr.join('\n') };
}

describe('emitGiftEntries', () => {
  test('credit-only gift prints credits and omits empty payload sections', () => {
    const { stdout, stderr } = renderGifts(
      [
        {
          sender: 'Cleo',
          sender_id: 'player-cleo',
          timestamp: '2026-09-23T16:00:00Z',
          credits: 40,
        },
      ],
      { ships: true },
    );

    expect(stderr).toBe('');
    expect(stdout).toBe(['  From: Cleo (player-cleo)', '  When: 2026-09-23 16:00', '  Credits: 40 cr'].join('\n'));
    expect(stdout).not.toContain('Items:');
    expect(stdout).not.toContain('Ships:');
    expect(stdout).not.toContain('Note:');
    expect(stdout).not.toContain('Gifts');
  });

  test('items and note print in full', () => {
    const note = `for the fuel\n${'unchanged note text '.repeat(12).trimEnd()}`;
    const { stdout, stderr } = renderGifts(
      [
        {
          sender: 'Ada',
          sender_id: 'player-ada',
          timestamp: '2026-09-23T14:05:00Z',
          credits: 1500,
          message: note,
          items: [{ item_id: 'fuel_cell', name: 'Fuel Cell', quantity: 12 }],
        },
      ],
      { ships: true },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('  Credits: 1,500 cr');
    expect(stdout).toContain('    12 Fuel Cell (fuel_cell)');
    expect(stdout).toContain(`  Note: ${note}`);
    expect(stdout).not.toContain('...');
  });

  test('ship lines keep class id only when it is not already the label', () => {
    const named = renderGifts(
      [
        {
          sender: 'Bo',
          ships: [
            {
              ship_id: 'ship-9',
              class_id: 'prospector',
              class_name: 'Prospector',
              custom_name: 'Rock Skipper',
            },
          ],
        },
      ],
      { ships: true },
    );
    expect(named.stdout.split('\n').find((line) => line.startsWith('    '))).toBe(
      '    Rock Skipper — Prospector (prospector) ship-9',
    );

    const classOnly = renderGifts(
      [
        {
          ships: [{ ship_id: 'ship-9', class_id: 'prospector', class_name: 'Prospector' }],
        },
      ],
      { ships: true },
    );
    expect(classOnly.stdout.split('\n').find((line) => line.startsWith('    '))).toBe(
      '    Prospector (prospector) ship-9',
    );

    const unresolvedCustom = renderGifts(
      [
        {
          ships: [{ ship_id: 'ship-9', class_id: 'prospector', class_name: '', custom_name: 'Rock Skipper' }],
        },
      ],
      { ships: true },
    );
    expect(unresolvedCustom.stdout.split('\n').find((line) => line.startsWith('    '))).toBe(
      '    Rock Skipper (prospector) ship-9',
    );

    const unresolved = renderGifts([{ ships: [{ ship_id: 'ship-9', class_id: 'prospector', class_name: '' }] }], {
      ships: true,
    });
    const unresolvedLine = unresolved.stdout.split('\n').find((line) => line.startsWith('    '));
    expect(unresolvedLine).toBe('    prospector ship-9');
    expect(unresolvedLine).not.toContain('(prospector)');

    const idOnly = renderGifts([{ ships: [{ ship_id: 'ship-9' }] }], { ships: true });
    expect(idOnly.stdout.split('\n').find((line) => line.startsWith('    '))).toBe('    ship-9');
  });

  test('zero, negative, and bigint credits print without numeric-string coercion', () => {
    const zero = renderGifts([{ sender: 'Ada', credits: 0 }], { ships: true });
    expect(zero.stdout).toContain('Credits: 0 cr');

    const negative = renderGifts([{ sender: 'Ada', credits: -1500 }], { ships: true });
    expect(negative.stdout).toContain('Credits: -1,500 cr');

    const big = renderGifts([{ sender: 'Ada', credits: 9007199254740993n }], { ships: true });
    expect(big.stdout).toContain('Credits: 9,007,199,254,740,993 cr');
    expect(big.stdout).not.toContain('9,007,199,254,740,992');

    const numericString = renderGifts([{ sender: 'Ada', timestamp: '2026-09-23T14:05:00Z', credits: '1500' }], {
      ships: true,
    });
    expect(numericString.stdout).toContain('From: Ada');
    expect(numericString.stdout).not.toContain('Credits:');
    expect(numericString.stdout).not.toContain('1,500');
  });

  test('omitted and empty nested fields produce no line', () => {
    const omitted = renderGifts([{ sender: 'Ada', timestamp: '2026-09-23T14:05:00Z' }], { ships: true });
    expect(omitted.stdout).not.toContain('Credits:');
    expect(omitted.stdout).not.toContain('Items:');
    expect(omitted.stdout).not.toContain('Ships:');
    expect(omitted.stdout).not.toContain('Note:');

    const empty = renderGifts(
      [
        {
          sender: 'Ada',
          sender_id: 'player-ada',
          timestamp: '2026-09-23T14:05:00Z',
          items: [],
          ships: [],
          message: '  ',
        },
      ],
      { ships: true },
    );
    expect(empty.stdout).toContain('From: Ada (player-ada)');
    expect(empty.stdout).not.toContain('Items:');
    expect(empty.stdout).not.toContain('Ships:');
    expect(empty.stdout).not.toContain('Note:');
    expect(empty.stdout).not.toContain('Credits:');
  });

  test('ships false drops ships and unknown keys', () => {
    const gift = {
      sender: 'Ada',
      sender_id: 'player-ada',
      timestamp: '2026-09-23T14:05:00Z',
      ships: [{ ship_id: 'gift-hull-9', class_id: 'prospector', class_name: 'Prospector' }],
      base_id: 'gift_base_should_hide',
    };
    const hidden = renderGifts([gift], { ships: false });
    expect(hidden.stderr).toBe('');
    expect(hidden.stdout).toContain('From: Ada (player-ada)');
    expect(hidden.stdout).toContain('When: 2026-09-23 14:05');
    expect(hidden.stdout).not.toContain('gift-hull-9');
    expect(hidden.stdout).not.toContain('gift_base_should_hide');
    expect(hidden.stdout).not.toContain('Ships:');

    const shown = renderGifts([gift], { ships: true });
    expect(shown.stdout).toContain('gift-hull-9');
    expect(shown.stdout).not.toContain('gift_base_should_hide');
  });

  test('non-records and empty records are skipped without a heading', () => {
    const { stdout, stderr } = renderGifts(
      [null, 'nope', 4, {}, { base_id: 'gift_base_should_hide' }, { sender: 'Ada', timestamp: 'not-iso' }, {}],
      { ships: true },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('From: Ada');
    expect(stdout).toContain('When: not-iso');
    expect(stdout.split('\n').filter((line) => line.includes('From:'))).toHaveLength(1);
    expect(stdout).not.toContain('unknown');
    expect(stdout).not.toContain('Gifts');
    expect(stdout).not.toContain('gift_base_should_hide');
    expect(renderGifts([], { ships: true }).stdout).toBe('');
  });

  test('timestamps use the text clock and leave objects unprinted', () => {
    const iso = renderGifts([{ sender: 'Ada', timestamp: '2026-09-23T14:05:00Z' }], { ships: true });
    expect(iso.stdout).toContain('When: 2026-09-23 14:05');

    const raw = renderGifts([{ sender: 'Ada', timestamp: 'yesterday at dock' }], { ships: true });
    expect(raw.stdout).toContain('When: yesterday at dock');

    const millis = Date.parse('2026-09-23T14:05:00Z');
    const numeric = renderGifts([{ sender: 'Ada', timestamp: millis }], { ships: true });
    expect(numeric.stdout).toContain('When: 2026-09-23 14:05');

    const seconds = renderGifts([{ sender: 'Ada', timestamp: Math.floor(millis / 1000) }], { ships: true });
    expect(seconds.stdout).toContain('When: 2026-09-23 14:05');

    const blank = renderGifts([{ sender: 'Ada', timestamp: '' }], { ships: true });
    expect(blank.stdout).not.toContain('When:');

    const objectStamp = renderGifts([{ sender: 'Ada', timestamp: { at: '2026-09-23T14:05:00Z' } }], { ships: true });
    expect(objectStamp.stdout).toContain('From: Ada');
    expect(objectStamp.stdout).not.toContain('When:');
    expect(objectStamp.stdout).not.toContain('[object Object]');
  });

  test('object credits and quantities do not stringify', () => {
    const { stdout, stderr } = renderGifts(
      [
        {
          sender: 'Ada',
          timestamp: '2026-09-23T14:05:00Z',
          credits: { amount: 5 },
          items: [{ name: 'Fuel Cell', item_id: 'fuel_cell', quantity: { n: 12 } }],
        },
      ],
      { ships: true },
    );

    expect(stderr).toBe('');
    expect(stdout).toContain('From: Ada');
    expect(stdout).toContain('    Fuel Cell (fuel_cell)');
    expect(stdout).not.toContain('Credits:');
    expect(stdout).not.toContain('undefined');
    expect(stdout).not.toContain('NaN');
    expect(stdout).not.toContain('[object Object]');
  });

  test('from line omits empty parentheses', () => {
    const both = renderGifts([{ sender: 'Ada', sender_id: 'player-ada', timestamp: '2026-09-23T14:05:00Z' }], {
      ships: true,
    });
    expect(both.stdout).toContain('From: Ada (player-ada)');

    const same = renderGifts([{ sender: 'Ada', sender_id: 'Ada', timestamp: '2026-09-23T14:05:00Z' }], { ships: true });
    expect(same.stdout).toContain('From: Ada');
    expect(same.stdout).not.toContain('(Ada)');

    const idOnly = renderGifts([{ sender_id: 'player-ada', timestamp: '2026-09-23T14:05:00Z' }], { ships: true });
    expect(idOnly.stdout).toContain('From: player-ada');
    expect(idOnly.stdout).not.toContain('(');

    const senderOnly = renderGifts([{ sender: 'Ada', timestamp: '2026-09-23T14:05:00Z' }], { ships: true });
    expect(senderOnly.stdout).toContain('From: Ada');
    expect(senderOnly.stdout).not.toContain('(');
  });

  test('blank line separates blocks and the last block has no trailing blank', () => {
    const { stdout } = renderGifts(
      [
        { sender: 'Ada', timestamp: '2026-09-23T14:05:00Z', credits: 1 },
        null,
        {},
        { sender: 'Cleo', timestamp: '2026-09-23T16:00:00Z', credits: 2 },
      ],
      { ships: true },
    );

    expect(stdout).toContain('Credits: 1 cr\n\n  From: Cleo');
    expect(stdout.endsWith('Credits: 2 cr')).toBe(true);
  });
});
