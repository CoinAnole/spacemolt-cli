import { expect, test } from 'bun:test';
import {
  catalogSkillTableColumns,
  classifyRecipeVenue,
  countRecipeVenues,
  emitCatalogItemDetail,
  emitCatalogModuleDetail,
  emitCatalogShipDetail,
  formatCatalogYesNo,
  formatProducedByFacilities,
  formatProducedByFacilityIds,
  joinStringIds,
  type RecipeVenue,
  summarizeBonusPerLevel,
  summarizeNamedItemQuantities,
} from './catalog-detail.ts';
import { withDisplayRenderBuffer } from './helpers.ts';

const classifyCases: Array<{
  name: string;
  recipe: Record<string, unknown>;
  options?: { passive?: boolean };
  expected: RecipeVenue;
}> = [
  {
    name: 'caller override { passive: true } even with dump-complete hand_craftable true',
    recipe: { hand_craftable: true, produced_by_facility_ids: [] },
    options: { passive: true },
    expected: 'ship passive',
  },
  {
    name: 'dump-complete Ship Passive with empty facility ids is ship passive',
    recipe: { category: 'Ship Passive', hand_craftable: false, produced_by_facility_ids: [] },
    expected: 'ship passive',
  },
  {
    name: 'paginated Ship Passive with no dump keys and no facility_only is ship passive',
    recipe: { category: 'Ship Passive' },
    expected: 'ship passive',
  },
  {
    name: 'dump-complete hand_craftable true with empty facility ids is craftable',
    recipe: { hand_craftable: true, produced_by_facility_ids: [] },
    expected: 'craftable',
  },
  {
    name: 'dump-complete hand_craftable true with nonempty facility ids is craftable',
    recipe: { hand_craftable: true, produced_by_facility_ids: ['ore_refinery'] },
    expected: 'craftable',
  },
  {
    name: 'dump-complete hand_craftable false with nonempty facility ids is facility only',
    recipe: { hand_craftable: false, produced_by_facility_ids: ['nano_fab'] },
    expected: 'facility only',
  },
  {
    name: 'dump-complete hand_craftable false with empty facility ids and refining category is no venue',
    recipe: { category: 'refining', hand_craftable: false, produced_by_facility_ids: [] },
    expected: 'no venue',
  },
  {
    name: 'dump-complete Facility Only with empty facility ids is no venue',
    recipe: { category: 'Facility Only', hand_craftable: false, produced_by_facility_ids: [] },
    expected: 'no venue',
  },
  {
    name: 'partial dump hand_craftable false with ids absent and Facility Only category is facility only',
    recipe: { category: 'Facility Only', hand_craftable: false },
    expected: 'facility only',
  },
  {
    name: 'partial dump hand_craftable false with ids absent and facility_only true is facility only',
    recipe: { hand_craftable: false, facility_only: true },
    expected: 'facility only',
  },
  {
    name: 'hand_craftable false with facility ids absent and no facility-only flag is no venue',
    recipe: { hand_craftable: false, category: 'refining' },
    expected: 'no venue',
  },
  {
    name: 'paginated facility_only true with no dump keys is facility only',
    recipe: { facility_only: true },
    expected: 'facility only',
  },
  {
    name: 'paginated Facility Only category with facility_only omitted and no dump keys is facility only',
    recipe: { category: 'Facility Only' },
    expected: 'facility only',
  },
  {
    name: 'paginated refining recipe with no flags is craftable',
    recipe: { category: 'refining' },
    expected: 'craftable',
  },
  {
    name: 'hand_craftable not boolean and no category flags is craftable',
    recipe: { hand_craftable: 'yes' },
    expected: 'craftable',
  },
];

for (const { name, recipe, options, expected } of classifyCases) {
  test(name, () => {
    expect(classifyRecipeVenue(recipe, options)).toBe(expected);
  });
}

test('recipe.ship_passive or recipe.passive true is ship passive over craftable or facility only', () => {
  expect(classifyRecipeVenue({ ship_passive: true, hand_craftable: true })).toBe('ship passive');
  expect(classifyRecipeVenue({ passive: true, hand_craftable: false, produced_by_facility_ids: ['nano_fab'] })).toBe(
    'ship passive',
  );
});

test('countRecipeVenues returns undefined when zero records were counted', () => {
  expect(countRecipeVenues([])).toBeUndefined();
  expect(countRecipeVenues(undefined)).toBeUndefined();
  expect(countRecipeVenues([1, 'x'])).toBeUndefined();
});

test('countRecipeVenues counts a mixed four-row array of records', () => {
  expect(
    countRecipeVenues([
      { hand_craftable: true, produced_by_facility_ids: [] },
      { hand_craftable: false, produced_by_facility_ids: ['nano_fab'] },
      { category: 'Ship Passive', hand_craftable: false, produced_by_facility_ids: [] },
      { category: 'refining', hand_craftable: false, produced_by_facility_ids: [] },
    ]),
  ).toEqual({
    craftable: 1,
    'facility only': 1,
    'ship passive': 1,
    'no venue': 1,
  });
});

test('formatProducedByFacilities skips rows unless definition_id and name are non-empty strings', () => {
  expect(
    formatProducedByFacilities([
      { definition_id: 'ore_refinery', name: 'Frontier Smelter', level: 3 },
      { definition_id: '', name: 'Blank Id', level: 1 },
      { definition_id: 'nano_fab', name: '', level: 2 },
      { name: 'Missing Id', level: 1 },
      { definition_id: 'missing_name', level: 1 },
      { definition_id: 12, name: 'Number Id', level: 1 },
      'skip',
      { definition_id: 'nano_fab', name: 'Nano Fab', level: 2 },
    ]),
  ).toBe('Frontier Smelter (ore_refinery, L3), Nano Fab (nano_fab, L2)');
});

test('formatProducedByFacilities omits L{n} when level is not a finite number', () => {
  expect(formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager' }])).toBe('Packager (packager)');
  expect(formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager', level: null }])).toBe(
    'Packager (packager)',
  );
  expect(formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager', level: '3' }])).toBe(
    'Packager (packager)',
  );
  expect(formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager', level: Number.NaN }])).toBe(
    'Packager (packager)',
  );
  expect(
    formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager', level: Number.POSITIVE_INFINITY }]),
  ).toBe('Packager (packager)');
  expect(formatProducedByFacilities([{ definition_id: 'packager', name: 'Packager', level: 0 }])).toBe(
    'Packager (packager, L0)',
  );
});

test('formatProducedByFacilities returns undefined when nothing remains', () => {
  expect(formatProducedByFacilities(undefined)).toBeUndefined();
  expect(formatProducedByFacilities([])).toBeUndefined();
  expect(formatProducedByFacilities([{ definition_id: 'packager' }])).toBeUndefined();
  expect(formatProducedByFacilities([{ name: 'Packager' }])).toBeUndefined();
});

test('formatProducedByFacilityIds comma-joins present string ids', () => {
  expect(formatProducedByFacilityIds(['ore_refinery', 'nano_fab'])).toBe('ore_refinery, nano_fab');
  expect(formatProducedByFacilityIds(['ore_refinery', '', 'nano_fab'])).toBe('ore_refinery, nano_fab');
  expect(formatProducedByFacilityIds([])).toBeUndefined();
  expect(formatProducedByFacilityIds(undefined)).toBeUndefined();
  expect(formatProducedByFacilityIds('ore_refinery')).toBeUndefined();
});

test('formatCatalogYesNo maps booleans only', () => {
  expect(formatCatalogYesNo(true)).toBe('yes');
  expect(formatCatalogYesNo(false)).toBe('no');
  expect(formatCatalogYesNo(undefined)).toBeUndefined();
});

test('summarizeBonusPerLevel joins finite numeric entries as key n parts', () => {
  expect(summarizeBonusPerLevel({ miningYield: 1, accuracy: 2 })).toBe('miningYield 1, accuracy 2');
});

test('summarizeBonusPerLevel returns undefined for empty objects, arrays, and strings', () => {
  expect(summarizeBonusPerLevel({})).toBeUndefined();
  expect(summarizeBonusPerLevel([])).toBeUndefined();
  expect(summarizeBonusPerLevel('miningYield 1')).toBeUndefined();
});

test('summarizeBonusPerLevel skips non-finite values', () => {
  expect(summarizeBonusPerLevel({ miningYield: 1, skip: Number.NaN })).toBe('miningYield 1');
  expect(summarizeBonusPerLevel({ skip: Number.POSITIVE_INFINITY })).toBeUndefined();
  expect(summarizeBonusPerLevel({ nested: { miningYield: 1 } })).toBeUndefined();
});

test('catalogSkillTableColumns adds Empire only when empire_restriction is a non-empty string', () => {
  const labels = (rows: Array<Record<string, unknown>>) => catalogSkillTableColumns(rows).map(([label]) => label);
  expect(labels([{ name: 'Mining' }])).toEqual(['Name', 'ID', 'Category', 'Max']);
  expect(labels([{ empire_restriction: '' }])).toEqual(['Name', 'ID', 'Category', 'Max']);
  expect(labels([{ empire_restriction: '   ' }])).toEqual(['Name', 'ID', 'Category', 'Max']);
  expect(labels([{ empire_restriction: 1 }])).toEqual(['Name', 'ID', 'Category', 'Max']);
  expect(labels([{ empire_restriction: 'solarian' }])).toEqual(['Name', 'ID', 'Category', 'Max', 'Empire']);
  expect(labels([{ empire_restriction: '' }, { empire_restriction: 'solarian' }])).toEqual([
    'Name',
    'ID',
    'Category',
    'Max',
    'Empire',
  ]);
});

test('zero module bonus omits a Reach line and prints Scramble: 2', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ reach: 0, scramble_power: 2 }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Scramble: 2');
  expect(stdout).not.toContain('Reach');
});

test('accuracy bonus prints Accuracy: 4', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ accuracy_bonus: 4 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Accuracy: 4');
});

test('shield without recharge prints the exact line Shield: 700 and not a tick suffix', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ base_shield: 700 }, {}), { plain: true });
  expect(buffer.stdout).toContain('Shield: 700');
  expect(buffer.stdout.join('\n')).not.toContain('/tick');
});

test('missing weapon slot count prints Slots: 0 weapon, 4 defense, 0 utility', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ defense_slots: 4 }, {}), { plain: true });
  expect(buffer.stdout).toContain('Slots: 0 weapon, 4 defense, 0 utility');
});

test('omitted ship slots do not print Slots', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({}, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Slots');
});

test('zero shield recharge prints Shield: 700 (+0/tick)', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ base_shield: 700, base_shield_recharge: 0 }, {}), {
    plain: true,
  });
  expect(buffer.stdout.join('\n')).toContain('Shield: 700 (+0/tick)');
});

test('required reputation 0 prints Reputation: 0', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ required_reputation: 0 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Reputation: 0');
});

test('hidden module prints Hidden: yes', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ hidden: true }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Hidden: yes');
});

test('quantity 0 prints 0x Steel Plate', () => {
  expect(summarizeNamedItemQuantities([{ name: 'Steel Plate', quantity: 0 }])).toBe('0x Steel Plate');
});

test('missing quantity prints ?x Steel Plate', () => {
  expect(summarizeNamedItemQuantities([{ name: 'Steel Plate' }])).toBe('?x Steel Plate');
});

test('item_id name fallback prints 2x steel_plate', () => {
  expect(summarizeNamedItemQuantities([{ item_id: 'steel_plate', quantity: 2 }])).toBe('2x steel_plate');
});

test('non-string id returns empty from joinStringIds', () => {
  expect(joinStringIds(['laser', 1])).toBe('');
});

test('ship capability flag prints Capabilities: cloak passive 2', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', flag: 'passive', value: 2 }] }, {}),
    { plain: true },
  );
  expect(buffer.stdout.join('\n')).toContain('Capabilities: cloak passive 2');
});

test('ship capability value 0 prints Capabilities: cloak 0', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', value: 0 }] }, {}),
    { plain: true },
  );
  expect(buffer.stdout.join('\n')).toContain('Capabilities: cloak 0');
});

test('legacy-only ship prints Availability: legacy', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ legacy: true }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Availability: legacy');
  expect(stdout).not.toContain('hidden');
});

test('hidden-only ship prints Availability: hidden', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ hidden: true }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Availability: hidden');
  expect(stdout).not.toContain('legacy');
});

test('module package operation falls back to catalog.package_operation', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({}, { package_operation: 'unpack' }), {
    plain: true,
  });
  expect(buffer.stdout.join('\n')).toContain('Package operation: unpack');
});

test('item category falls back to type when category is absent', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ type: 'ore' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Category: ore');
});

test('empty category does not print Category:', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ category: '', type: 'ore' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Category:');
});
