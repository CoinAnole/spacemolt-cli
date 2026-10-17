import { describe, expect, test } from 'bun:test';
import { parseApiJson } from '../json-number.ts';
import { emitSovereignMint, withDisplayRenderBuffer } from './helpers.ts';
import { sovereignMintBlockedInputs, sovereignMintBlockedInternal } from './ship.fixtures.ts';

function renderMint(mint: unknown): { printed: boolean; stdout: string } {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  const printed = withDisplayRenderBuffer(buffer, () => emitSovereignMint(mint), { plain: true });
  return { printed, stdout: buffer.stdout.join('\n') };
}

const crystalShortage = {
  item_id: 'trade_crystal',
  name: 'Trade Crystal',
  quantity_in_storage: 2,
  quantity_missing: 8,
  quantity_required: 10,
};

const mintBlocker = {
  stage: 'sovereign_mint',
  item_id: 'trade_authenticator',
  name: 'Trade Authenticator',
  status: 'unavailable',
  facility_id: 'fac-mint-1',
  facility_name: 'Sovereign Mint',
  remediation: 'Restore the sovereign mint; Trade Authenticators cannot be produced until this stage is online.',
};

const priceLimitedRemediation =
  'Sell listed inputs with buy_order_available=true to the station through its public market. Available sell prices exceed the station buy price. Check current prices and order depth before acquiring supplies. The station must arrange procurement for inputs with buy_order_available=false.';

const crystalPriceLimit = {
  item_id: 'trade_crystal',
  name: 'Trade Crystal',
  lowest_sell_price: 550,
  station_buy_price: 372,
};

describe('emitSovereignMint', () => {
  test('omits non-printable mint payloads', () => {
    for (const mint of [undefined, null, [], '', {}, 'blocked_inputs', 42]) {
      const { printed, stdout } = renderMint(mint);
      expect(printed).toBe(false);
      expect(stdout).toBe('');
      expect(stdout).not.toContain('=== Sovereign Mint ===');
    }
  });

  test('prints the OpenAPI blocked_inputs example with unindented remediation', () => {
    const { printed, stdout } = renderMint(sovereignMintBlockedInputs);
    expect(printed).toBe(true);
    expect(stdout).toContain(
      [
        '=== Sovereign Mint ===',
        'Status: blocked_inputs',
        'Output: Trade Authenticator (trade_authenticator)',
        'Shortages:',
        '  Trade Crystal: 2/10, 8 missing, buy order: yes',
        '',
        'Sell listed inputs with buy_order_available=true to the station through its public market. Check current prices and order depth before acquiring supplies. The station must arrange procurement for inputs with buy_order_available=false.',
      ].join('\n'),
    );
    expect(stdout).not.toContain('  Sell listed inputs');
    expect(stdout).not.toContain('Price limits:');
  });

  test('buy_order_available false prints buy order: no', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [
        {
          buy_order_available: false,
          item_id: 'steel_plate',
          name: 'Steel Plate',
          quantity_in_storage: 1,
          quantity_missing: 4,
          quantity_required: 5,
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout.split('\n')).toContain('  Steel Plate: 1/5, 4 missing, buy order: no');
  });

  test('mixed buy_order_available rows keep yes before no', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [
        {
          buy_order_available: true,
          item_id: 'trade_crystal',
          name: 'Trade Crystal',
          quantity_in_storage: 2,
          quantity_missing: 8,
          quantity_required: 10,
        },
        {
          buy_order_available: false,
          item_id: 'steel_plate',
          name: 'Steel Plate',
          quantity_in_storage: 1,
          quantity_missing: 4,
          quantity_required: 5,
        },
      ],
    });
    expect(printed).toBe(true);
    const yesLine = '  Trade Crystal: 2/10, 8 missing, buy order: yes';
    const noLine = '  Steel Plate: 1/5, 4 missing, buy order: no';
    expect(stdout.split('\n')).toContain(yesLine);
    expect(stdout.split('\n')).toContain(noLine);
    expect(stdout.indexOf(yesLine)).toBeGreaterThan(-1);
    expect(stdout.indexOf(noLine)).toBeGreaterThan(stdout.indexOf(yesLine));
  });

  test('omitted buy_order_available prints quantity line only', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [crystalShortage],
    });
    expect(printed).toBe(true);
    expect(stdout.split('\n')).toContain('  Trade Crystal: 2/10, 8 missing');
    expect(stdout).not.toContain('buy order:');
  });

  test('non-boolean buy_order_available omits the suffix', () => {
    for (const buy_order_available of ['true', 1, null]) {
      const { printed, stdout } = renderMint({
        status: 'blocked_inputs',
        output_item_id: 'trade_authenticator',
        shortages: [
          {
            buy_order_available,
            item_id: 'trade_crystal',
            name: 'Trade Crystal',
            quantity_in_storage: 2,
            quantity_missing: 8,
            quantity_required: 10,
          },
        ],
      });
      expect(printed).toBe(true);
      expect(stdout.split('\n')).toContain('  Trade Crystal: 2/10, 8 missing');
      expect(stdout).not.toContain('buy order:');
      expect(stdout).not.toContain('undefined');
      expect(stdout).not.toContain('NaN');
      expect(stdout).not.toContain('[object Object]');
    }
  });

  test('prints blocked_internal with Facility and Facility ID on separate lines', () => {
    const { printed, stdout } = renderMint(sovereignMintBlockedInternal);
    expect(printed).toBe(true);
    expect(stdout).toContain(
      [
        '=== Sovereign Mint ===',
        'Status: blocked_internal',
        'Output: Trade Authenticator (trade_authenticator)',
        'Internal blockers:',
        '  sovereign_mint — unavailable',
        '    Item: Trade Authenticator (trade_authenticator)',
        '    Facility: Sovereign Mint',
        '    Facility ID: fac-mint-1',
        '    Restore the sovereign mint; Trade Authenticators cannot be produced until this stage is online.',
      ].join('\n'),
    );
    expect(stdout).toContain('Facility: Sovereign Mint');
    expect(stdout).toContain('Facility ID: fac-mint-1');
    expect(stdout).toContain('    Restore the sovereign mint');
    expect(stdout).not.toContain('Facility: Sovereign Mint (fac-mint-1)');
    expect(stdout).not.toContain('Price limits:');
  });

  test('id-only blocker prints Facility ID without a Facility name line', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_internal',
      output_item_id: 'trade_authenticator',
      internal_blockers: [
        {
          stage: 'sovereign_mint',
          status: 'unavailable',
          facility_id: 'fac-mint-1',
          remediation: 'Restore the sovereign mint.',
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Facility ID: fac-mint-1');
    expect(stdout).not.toMatch(/^\s*Facility: /m);
  });

  test('internal_intermediate damaged without facility_id omits facility lines', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_internal',
      output_item_id: 'trade_authenticator',
      internal_blockers: [
        {
          stage: 'internal_intermediate',
          item_id: 'internal_trade_cipher',
          name: 'Internal Trade Cipher',
          status: 'damaged',
          remediation: 'This feeder is not a player supply request.',
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('internal_intermediate — damaged');
    expect(stdout).not.toMatch(/^\s*Facility: /m);
    expect(stdout).not.toMatch(/^\s*Facility ID:/m);
  });

  test('unknown status blocked_power still prints', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_power',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Sovereign Mint ===');
    expect(stdout).toContain('Status: blocked_power');
    expect(stdout).toContain('Output: Trade Authenticator (trade_authenticator)');
  });

  test('empty shortages omits Shortages heading but still prints Status and Output', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      shortages: [],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Sovereign Mint ===');
    expect(stdout).toContain('Status: blocked_inputs');
    expect(stdout).toContain('Output: Trade Authenticator (trade_authenticator)');
    expect(stdout).not.toContain('Shortages:');
  });

  test('status and output_item_id with no shortages still print the heading', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Sovereign Mint ===');
    expect(stdout).toContain('Status: blocked_inputs');
    expect(stdout).toContain('Output: trade_authenticator');
    expect(stdout).not.toContain('Shortages:');
    expect(stdout).not.toContain('Internal blockers:');
  });

  test('unformattable shortage rows are omitted from the list', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [{ quantity_required: 10, quantity_in_storage: 0, quantity_missing: 10 }, crystalShortage],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Shortages:');
    expect(stdout.split('\n')).toContain('  Trade Crystal: 2/10, 8 missing');
    expect(stdout).not.toContain('buy order:');
    expect(
      stdout
        .split('Shortages:')[1]
        ?.split('\n')
        .filter((line) => line.startsWith('  ')).length,
    ).toBe(1);
  });

  test('all-unformattable shortages omit the Shortages heading', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [{ quantity_required: 10, quantity_in_storage: 0, quantity_missing: 10 }],
    });
    expect(printed).toBe(true);
    expect(stdout).not.toContain('Shortages:');
  });

  test('quantity_missing 0 still prints 0 missing', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [
        {
          item_id: 'trade_crystal',
          name: 'Trade Crystal',
          quantity_in_storage: 10,
          quantity_missing: 0,
          quantity_required: 10,
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout.split('\n')).toContain('  Trade Crystal: 10/10, 0 missing');
    expect(stdout).not.toContain('buy order:');
  });

  test('preserves shortage order for two items', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      shortages: [
        crystalShortage,
        {
          item_id: 'steel_plate',
          name: 'Steel Plate',
          quantity_in_storage: 1,
          quantity_missing: 4,
          quantity_required: 5,
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout.indexOf('Trade Crystal: 2/10, 8 missing')).toBeGreaterThan(-1);
    expect(stdout.indexOf('Steel Plate: 1/5, 4 missing')).toBeGreaterThan(
      stdout.indexOf('Trade Crystal: 2/10, 8 missing'),
    );
  });

  test('prints both Shortages and Internal blockers regardless of status', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      shortages: [crystalShortage],
      internal_blockers: [mintBlocker],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Status: blocked_inputs');
    expect(stdout).toContain('Shortages:');
    expect(stdout).toContain('Internal blockers:');
    expect(stdout.indexOf('Internal blockers:')).toBeGreaterThan(stdout.indexOf('Shortages:'));
  });

  test('empty internal_blockers objects omit the Internal blockers heading', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_internal',
      output_item_id: 'trade_authenticator',
      internal_blockers: [{}],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Sovereign Mint ===');
    expect(stdout).not.toContain('Internal blockers:');
  });

  test('name equal to id prints Output without parentheses', () => {
    const { stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      output_name: 'trade_authenticator',
    });
    expect(stdout).toContain('Output: trade_authenticator');
    expect(stdout).not.toContain('Output: trade_authenticator (trade_authenticator)');
  });

  test('output name only prints without an id suffix', () => {
    const { stdout } = renderMint({
      status: 'blocked_inputs',
      output_name: 'Trade Authenticator',
    });
    expect(stdout).toContain('Output: Trade Authenticator');
    expect(stdout).not.toContain('Output: Trade Authenticator (');
  });

  test('omits Output when neither name nor id is printable', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: '',
      output_name: '',
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Status: blocked_inputs');
    expect(stdout).not.toContain('Output:');
  });

  test('whitespace-only status prints; empty string omits Status', () => {
    const whitespace = renderMint({ status: '   ', output_item_id: 'trade_authenticator' });
    expect(whitespace.printed).toBe(true);
    expect(whitespace.stdout.split('\n')).toContain('Status:    ');

    const empty = renderMint({ status: '', output_item_id: 'trade_authenticator' });
    expect(empty.printed).toBe(true);
    expect(empty.stdout).not.toMatch(/^Status:/m);
    expect(empty.stdout).not.toContain('\nStatus:');
  });

  test('blocker with only stage or only status prints a single first-line token', () => {
    const stageOnly = renderMint({
      status: 'blocked_internal',
      internal_blockers: [{ stage: 'sovereign_mint' }],
    });
    expect(stageOnly.printed).toBe(true);
    expect(stageOnly.stdout.split('\n')).toContain('  sovereign_mint');
    expect(stageOnly.stdout).not.toContain(' — ');

    const statusOnly = renderMint({
      status: 'blocked_internal',
      internal_blockers: [{ status: 'unavailable' }],
    });
    expect(statusOnly.stdout.split('\n')).toContain('  unavailable');
    expect(statusOnly.stdout).not.toContain(' — ');
  });

  test('blocker with neither stage nor status starts at the detail lines', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_internal',
      internal_blockers: [
        {
          item_id: 'trade_authenticator',
          name: 'Trade Authenticator',
          facility_name: 'Sovereign Mint',
          remediation: 'Restore the sovereign mint.',
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Internal blockers:');
    expect(stdout).toContain('    Item: Trade Authenticator (trade_authenticator)');
    expect(stdout).toContain('    Facility: Sovereign Mint');
    expect(stdout).not.toMatch(/Internal blockers:\n {2}[^\s]/);
  });

  test('name-only facility omits Facility ID', () => {
    const { stdout } = renderMint({
      status: 'blocked_internal',
      internal_blockers: [
        {
          stage: 'sovereign_mint',
          status: 'unavailable',
          facility_name: 'Sovereign Mint',
        },
      ],
    });
    expect(stdout).toContain('    Facility: Sovereign Mint');
    expect(stdout).not.toMatch(/^\s*Facility ID:/m);
  });

  test('ignores extra mint keys', () => {
    const { printed, stdout } = renderMint({
      status: 'blocked_inputs',
      output_item_id: 'trade_authenticator',
      unexpected: { nested: true },
      extra: 'dump me',
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Status: blocked_inputs');
    expect(stdout).not.toContain('dump me');
    expect(stdout).not.toContain('[object Object]');
    expect(stdout).not.toContain('unexpected');
  });

  test('return value matches print versus omit', () => {
    expect(renderMint(sovereignMintBlockedInputs).printed).toBe(true);
    expect(renderMint(sovereignMintBlockedInternal).printed).toBe(true);
    expect(renderMint({ remediation: 'Sell Trade Crystals to the station.' }).printed).toBe(true);
    expect(renderMint({ shortages: [crystalShortage] }).printed).toBe(true);
    expect(renderMint({ internal_blockers: [mintBlocker] }).printed).toBe(true);
    expect(
      renderMint({
        price_limits: [
          {
            item_id: 'trade_crystal',
            name: 'Trade Crystal',
            station_buy_price: 372,
            lowest_sell_price: 550,
          },
        ],
      }).printed,
    ).toBe(true);
    expect(renderMint({ price_limits: [{ station_buy_price: 1, lowest_sell_price: 2 }] }).printed).toBe(false);
    expect(renderMint({ price_limits: [] }).printed).toBe(false);
    expect(renderMint(undefined).printed).toBe(false);
    expect(renderMint({}).printed).toBe(false);
  });

  test('prints the spec price_limited block with shortages and price limits', () => {
    const { printed, stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      shortages: [
        {
          buy_order_available: true,
          item_id: 'trade_crystal',
          name: 'Trade Crystal',
          quantity_in_storage: 2,
          quantity_missing: 8,
          quantity_required: 10,
        },
      ],
      price_limits: [crystalPriceLimit],
      remediation: priceLimitedRemediation,
    });
    expect(printed).toBe(true);
    expect(stdout).toContain(
      [
        '=== Sovereign Mint ===',
        'Status: price_limited',
        'Output: Trade Authenticator (trade_authenticator)',
        'Shortages:',
        '  Trade Crystal: 2/10, 8 missing, buy order: yes',
        'Price limits:',
        '  Trade Crystal: station buy 372 credits, lowest sell 550 credits',
        '',
        priceLimitedRemediation,
      ].join('\n'),
    );
    expect(stdout).not.toContain('  Sell listed inputs');
  });

  test('price limits without shortages insert a blank line before remediation', () => {
    const { printed, stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      price_limits: [crystalPriceLimit],
      remediation: priceLimitedRemediation,
    });
    expect(printed).toBe(true);
    expect(stdout).not.toContain('Shortages:');
    expect(stdout).toContain(
      'Price limits:\n  Trade Crystal: station buy 372 credits, lowest sell 550 credits\n\nSell listed',
    );
    expect(stdout).toContain(
      [
        '=== Sovereign Mint ===',
        'Status: price_limited',
        'Output: Trade Authenticator (trade_authenticator)',
        'Price limits:',
        '  Trade Crystal: station buy 372 credits, lowest sell 550 credits',
        '',
        priceLimitedRemediation,
      ].join('\n'),
    );
  });

  test('price limits alone print the section without Status', () => {
    const { printed, stdout } = renderMint({ price_limits: [crystalPriceLimit] });
    expect(printed).toBe(true);
    expect(stdout).toContain('=== Sovereign Mint ===');
    expect(stdout).toContain('Price limits:');
    expect(stdout).toContain('  Trade Crystal: station buy 372 credits, lowest sell 550 credits');
    expect(stdout).not.toMatch(/^Status:/m);
    expect(stdout).not.toContain('\nStatus:');
  });

  test('price row without identity prints nothing', () => {
    const { printed, stdout } = renderMint({
      price_limits: [{ station_buy_price: 1, lowest_sell_price: 2 }],
    });
    expect(printed).toBe(false);
    expect(stdout).toBe('');
    expect(stdout).not.toContain('Price limits:');
  });

  test('explicit zero prices print 0 credits', () => {
    for (const price of [0, 0n]) {
      const { stdout } = renderMint({
        price_limits: [{ name: 'Trade Crystal', station_buy_price: price, lowest_sell_price: price }],
      });
      expect(stdout).toContain('  Trade Crystal: station buy 0 credits, lowest sell 0 credits');
      expect(stdout).not.toContain('NaN');
      expect(stdout).not.toContain('undefined');
      expect(stdout).not.toContain('[object Object]');
    }
  });

  test('coerced and non-integer prices omit the clause', () => {
    for (const station_buy_price of [null, '', '0', '372', true, false, 550.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { stdout } = renderMint({
        price_limits: [{ name: 'Trade Crystal', station_buy_price, lowest_sell_price: 550 }],
      });
      expect(stdout).toContain('  Trade Crystal: lowest sell 550 credits');
      expect(stdout).not.toContain('station buy');
      expect(stdout).not.toContain('station buy 0');
      expect(stdout).not.toContain('station buy 1');
    }
  });

  test('one missing price omits only that clause', () => {
    const missingBuy = renderMint({
      price_limits: [{ name: 'Trade Crystal', lowest_sell_price: 550 }],
    });
    expect(missingBuy.stdout).toContain('  Trade Crystal: lowest sell 550 credits');
    expect(missingBuy.stdout).not.toContain('station buy');

    const missingSell = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: 372 }],
    });
    expect(missingSell.stdout).toContain('  Trade Crystal: station buy 372 credits');
    expect(missingSell.stdout).not.toContain('lowest sell');
  });

  test('identity with no formattable prices prints the name without a colon', () => {
    const { printed, stdout } = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: null, lowest_sell_price: '550' }],
      remediation: 'Sell listed inputs.',
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Price limits:');
    expect(stdout.split('\n')).toContain('  Trade Crystal');
    expect(stdout).not.toContain('Trade Crystal:');
    expect(stdout).toContain('Price limits:\n  Trade Crystal\n\nSell listed inputs.');
  });

  test('nameless price row is skipped beside a printable row', () => {
    const { stdout } = renderMint({
      price_limits: [null, 'trade_crystal', { station_buy_price: 1, lowest_sell_price: 2 }, crystalPriceLimit],
    });
    expect(stdout).toContain('Price limits:');
    expect(stdout).toContain('  Trade Crystal: station buy 372 credits, lowest sell 550 credits');
    expect(
      stdout
        .split('Price limits:')[1]
        ?.split('\n')
        .filter((line) => line.startsWith('  ')).length,
    ).toBe(1);
  });

  test('all nameless price rows omit the Price limits heading', () => {
    const { printed, stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      price_limits: [
        { station_buy_price: 1, lowest_sell_price: 2 },
        { name: '', item_id: '' },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('Status: price_limited');
    expect(stdout).toContain('Output: Trade Authenticator (trade_authenticator)');
    expect(stdout).not.toContain('Price limits:');
  });

  test('non-array price_limits is ignored', () => {
    for (const price_limits of [{}, 'trade_crystal', null]) {
      const { printed, stdout } = renderMint({
        status: 'price_limited',
        output_item_id: 'trade_authenticator',
        price_limits,
      });
      expect(printed).toBe(true);
      expect(stdout).toContain('Status: price_limited');
      expect(stdout).not.toContain('Price limits:');
    }
  });

  test('price rows stay in server order', () => {
    const copper = {
      item_id: 'copper_wiring',
      name: 'Copper Wiring',
      station_buy_price: 10,
      lowest_sell_price: 11,
    };
    const crystal = {
      item_id: 'trade_crystal',
      name: 'Trade Crystal',
      station_buy_price: 372,
      lowest_sell_price: 550,
    };
    const forward = renderMint({ price_limits: [copper, crystal] }).stdout;
    const copperLine = 'Copper Wiring: station buy 10 credits, lowest sell 11 credits';
    const crystalLine = 'Trade Crystal: station buy 372 credits, lowest sell 550 credits';
    expect(forward.indexOf(copperLine)).toBeGreaterThan(-1);
    expect(forward.indexOf(crystalLine)).toBeGreaterThan(forward.indexOf(copperLine));
    expect(forward).not.toContain('Grand Exchange');

    const reverse = renderMint({ price_limits: [crystal, copper] }).stdout;
    expect(reverse.indexOf(crystalLine)).toBeGreaterThan(-1);
    expect(reverse.indexOf(copperLine)).toBeGreaterThan(reverse.indexOf(crystalLine));
    expect(reverse).not.toContain('Grand Exchange');
  });

  test('equal name and id prints once without parentheses', () => {
    const { stdout } = renderMint({
      price_limits: [
        {
          name: 'trade_crystal',
          item_id: 'trade_crystal',
          station_buy_price: 372,
          lowest_sell_price: 550,
        },
      ],
    });
    expect(stdout).toContain('  trade_crystal: station buy 372 credits, lowest sell 550 credits');
    expect(stdout).not.toContain('trade_crystal (trade_crystal)');
  });

  test('item id only prints without a name', () => {
    const { stdout } = renderMint({
      price_limits: [{ item_id: 'trade_crystal', station_buy_price: 372, lowest_sell_price: 550 }],
    });
    expect(stdout).toContain('  trade_crystal: station buy 372 credits, lowest sell 550 credits');
  });

  test('groups safe integer prices with the locale', () => {
    const grouped = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: 12500, lowest_sell_price: 12500 }],
    });
    expect(grouped.stdout).toContain(`station buy ${(12500).toLocaleString()} credits`);
    expect(grouped.stdout).toContain(`lowest sell ${(12500).toLocaleString()} credits`);

    const maxSafe = Number.MAX_SAFE_INTEGER;
    const edge = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: maxSafe, lowest_sell_price: maxSafe }],
    });
    expect(edge.stdout).toContain(`station buy ${maxSafe.toLocaleString()} credits`);
    expect(edge.stdout.replace(/\D/g, '')).toContain(String(maxSafe));
  });

  test('negative prices print the locale minus sign', () => {
    const safe = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: -3, lowest_sell_price: -3 }],
    });
    expect(safe.stdout).toContain(`station buy ${(-3).toLocaleString()} credits`);
    expect(safe.stdout).toContain(`lowest sell ${(-3).toLocaleString()} credits`);

    const big = -3n;
    const wide = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: big, lowest_sell_price: big }],
    });
    expect(wide.stdout).toContain(`station buy ${big.toLocaleString()} credits`);
  });

  test('bigint price prints every digit', () => {
    const value = 9007199254740993n;
    const { stdout } = renderMint({
      price_limits: [{ name: 'Trade Crystal', station_buy_price: value, lowest_sell_price: value }],
    });
    expect(stdout).toContain(`station buy ${value.toLocaleString()} credits`);
    expect(stdout).toContain(`lowest sell ${value.toLocaleString()} credits`);
    expect(stdout.replace(/\D/g, '')).toContain('9007199254740993');
  });

  test('parseApiJson station_buy_price past the safe range prints every digit', () => {
    const parsed = parseApiJson(
      '{"price_limits":[{"item_id":"trade_crystal","name":"Trade Crystal","station_buy_price":9007199254740993,"lowest_sell_price":550}]}',
    );
    const { printed, stdout } = renderMint(parsed);
    expect(printed).toBe(true);
    const buyLine = stdout.split('\n').find((line) => line.includes('station buy'));
    expect(buyLine?.replace(/\D/g, '')).toContain('9007199254740993');
    expect(buyLine).toContain(`station buy ${(9007199254740993n).toLocaleString()} credits`);
    expect(buyLine).not.toContain('9007199254740992');
  });

  test('in-memory unsafe number omits the price clause', () => {
    const { stdout } = renderMint({
      price_limits: [
        {
          name: 'Trade Crystal',
          item_id: 'trade_crystal',
          // biome-ignore lint/correctness/noPrecisionLoss: already-rounded unsafe number; the clause must be omitted
          station_buy_price: 9007199254740993,
          lowest_sell_price: 550,
        },
      ],
    });
    expect(stdout).toContain('  Trade Crystal: lowest sell 550 credits');
    expect(stdout).not.toContain('station buy');
    expect(stdout.replace(/\D/g, '')).not.toContain('9007199254740992');
    expect(stdout.replace(/\D/g, '')).not.toContain('9007199254740993');
  });

  test('prints price_limited status verbatim without ceiling language', () => {
    const { stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      price_limits: [crystalPriceLimit],
    });
    expect(stdout.split('\n')).toContain('Status: price_limited');
    expect(stdout).not.toContain('ceiling');
    expect(stdout).not.toContain('Grand Exchange');
  });

  test('shortages, price limits, and internal blockers stay in that order', () => {
    for (const status of ['price_limited', 'blocked_inputs']) {
      const { stdout } = renderMint({
        status,
        output_item_id: 'trade_authenticator',
        output_name: 'Trade Authenticator',
        shortages: [crystalShortage],
        price_limits: [crystalPriceLimit],
        internal_blockers: [mintBlocker],
        remediation: 'Arrange procurement.',
      });
      const shortagesAt = stdout.indexOf('Shortages:');
      const pricesAt = stdout.indexOf('Price limits:');
      const blockersAt = stdout.indexOf('Internal blockers:');
      const remediationAt = stdout.indexOf('Arrange procurement.');
      expect(stdout).toContain(`Status: ${status}`);
      expect(shortagesAt).toBeGreaterThan(-1);
      expect(pricesAt).toBeGreaterThan(shortagesAt);
      expect(blockersAt).toBeGreaterThan(pricesAt);
      expect(remediationAt).toBeGreaterThan(blockersAt);
    }
  });

  test('empty price_limits does not insert a blank line before remediation', () => {
    const { stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      output_name: 'Trade Authenticator',
      price_limits: [],
      remediation: 'Sell listed inputs.',
    });
    expect(stdout).toContain('Output: Trade Authenticator (trade_authenticator)\nSell listed inputs.');
    expect(stdout).not.toMatch(/Output:.*\n\nSell/);
    expect(stdout).not.toContain('Price limits:');
  });

  test('ignores extra keys on the mint object and on a price row', () => {
    const { printed, stdout } = renderMint({
      status: 'price_limited',
      output_item_id: 'trade_authenticator',
      unexpected: { nested: true },
      extra: 'dump me',
      price_limits: [
        {
          name: 'Trade Crystal',
          item_id: 'trade_crystal',
          station_buy_price: 372,
          lowest_sell_price: 550,
          buy_order_available: true,
          quantity_missing: 8,
          quantity_required: 10,
          quantity_in_storage: 2,
          surprise: 'hidden-price-key',
        },
      ],
    });
    expect(printed).toBe(true);
    expect(stdout).toContain('  Trade Crystal: station buy 372 credits, lowest sell 550 credits');
    expect(stdout).not.toContain('dump me');
    expect(stdout).not.toContain('unexpected');
    expect(stdout).not.toContain('hidden-price-key');
    expect(stdout).not.toContain('buy order:');
    expect(stdout).not.toContain('missing');
    expect(stdout).not.toContain('[object Object]');
  });
});
