import { describe, expect, test } from 'bun:test';
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
        '  Trade Crystal: 2/10, 8 missing',
        '',
        'Mine or otherwise acquire the listed root inputs, principally Trade Crystals, and sell them to this station through its public market. Check the ordinary market listings for current prices and available order depth.',
      ].join('\n'),
    );
    expect(stdout).not.toContain('  Mine or otherwise');
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
    expect(stdout).toContain('Trade Crystal: 2/10, 8 missing');
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
    expect(stdout).toContain('Trade Crystal: 10/10, 0 missing');
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
    expect(renderMint(undefined).printed).toBe(false);
    expect(renderMint({}).printed).toBe(false);
  });
});
