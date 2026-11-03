import { expect, test } from 'bun:test';
import {
  catalogSkillTableColumns,
  classifyRecipeVenue,
  countRecipeVenues,
  emitCatalogItemDetail,
  emitCatalogModuleDetail,
  emitCatalogShipDetail,
  emitCatalogSkillDetail,
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

test('empty-string facility id is facility only', () => {
  expect(classifyRecipeVenue({ hand_craftable: false, produced_by_facility_ids: [''] })).toBe('facility only');
});

test('recipe.ship_passive or recipe.passive true is ship passive over craftable or facility only', () => {
  expect(classifyRecipeVenue({ ship_passive: true, hand_craftable: true })).toBe('ship passive');
  expect(classifyRecipeVenue({ passive: true, hand_craftable: false, produced_by_facility_ids: ['nano_fab'] })).toBe(
    'ship passive',
  );
});

test('numeric ship_passive 1 with hand_craftable true is craftable', () => {
  expect(classifyRecipeVenue({ ship_passive: 1, hand_craftable: true })).toBe('craftable');
});

test('numeric facility_only 1 is craftable', () => {
  expect(classifyRecipeVenue({ facility_only: 1 })).toBe('craftable');
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

test('formatProducedByFacilityIds drops non-string ids', () => {
  expect(formatProducedByFacilityIds([1, 'nano_fab'])).toBe('nano_fab');
  expect(formatProducedByFacilityIds([1])).toBeUndefined();
});

test('formatCatalogYesNo maps booleans only', () => {
  expect(formatCatalogYesNo(true)).toBe('yes');
  expect(formatCatalogYesNo(false)).toBe('no');
  expect(formatCatalogYesNo(undefined)).toBeUndefined();
});

test('summarizeBonusPerLevel joins finite numeric entries as key n parts', () => {
  expect(summarizeBonusPerLevel({ miningYield: 1, accuracy: 2 })).toBe('miningYield 1, accuracy 2');
});

test('bonus per level 0 prints miningYield 0', () => {
  expect(summarizeBonusPerLevel({ miningYield: 0 })).toBe('miningYield 0');
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

test('emitCatalogSkillDetail prints a whitespace empire_restriction as Empire: followed by those three spaces', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogSkillDetail({ empire_restriction: '   ' }), { plain: true });
  const line = buffer.stdout.find((row) => row.startsWith('Empire:'));
  expect(line).toBe(`Empire: ${'   '}`);
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

test('cloak strength prints Cloak: 4', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ cloak_strength: 4 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Cloak: 4');
});

test('webify strength prints Webify: 3', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ webify_strength: 3 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Webify: 3');
});

test('disruptor bonus prints Disruptor: 3', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ disruptor_power: 3 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Disruptor: 3');
});

test('salvage bonus prints Salvage: 2', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ salvage_bonus: 2 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Salvage: 2');
});

test('scanner bonus prints Scanner: 5', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ scanner_power: 5 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Scanner: 5');
});

test('survey bonus prints Survey: 4', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ survey_power: 4 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Survey: 4');
});

test('repair bonus prints Repair: 5', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ armor_repair_rate: 5 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Repair: 5');
});

test('remote repair bonus prints Remote repair: 6', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ remote_repair_power: 6 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Remote repair: 6');
});

test('tow penalty prints Tow penalty: 30', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ tow_speed_penalty: 30 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Tow penalty: 30');
});

test('shield without recharge prints the exact line Shield: 700 and not a tick suffix', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ base_shield: 700 }, {}), { plain: true });
  expect(buffer.stdout).toContain('Shield: 700');
  expect(buffer.stdout.join('\n')).not.toContain('/tick');
});

test('shield 0 prints Shield: 0', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ base_shield: 0 }, {}), { plain: true });
  const line = buffer.stdout.find((row) => row.includes('Shield:'));
  expect(line).toBe('Shield: 0');
});

test('base_shield_recharge alone does not print Shield', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ base_shield_recharge: 12 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Shield');
});

test('whitespace description is omitted', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ description: '   ', class: 'Shuttle' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Class: Shuttle');
  expect(stdout).not.toContain('   ');
});

test('object ship or item description is omitted', () => {
  const ship = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    ship,
    () => emitCatalogShipDetail({ description: { note: 'secret' }, class: 'Shuttle' }, {}),
    { plain: true },
  );
  const shipStdout = ship.stdout.join('\n');
  expect(shipStdout).toContain('Class: Shuttle');
  expect(shipStdout).not.toContain('[object Object]');
  expect(shipStdout).not.toContain('secret');

  const item = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(item, () => emitCatalogItemDetail({ description: { note: 'secret' }, category: 'ore' }, {}), {
    plain: true,
  });
  const itemStdout = item.stdout.join('\n');
  expect(itemStdout).toContain('Category: ore');
  expect(itemStdout).not.toContain('[object Object]');
  expect(itemStdout).not.toContain('secret');
});

test('item description with surrounding spaces prints the padded liner line and not a trimmed one', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ description: '  liner  ' }, {}), { plain: true });
  expect(buffer.stdout).toContain('  liner  ');
  expect(buffer.stdout).not.toContain('liner');
});

test('missing weapon slot count prints Slots: 0 weapon, 4 defense, 0 utility', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ defense_slots: 4 }, {}), { plain: true });
  expect(buffer.stdout).toContain('Slots: 0 weapon, 4 defense, 0 utility');
});

test('weapon_slots 0 with defense and utility omitted prints Slots: 0 weapon, 0 defense, 0 utility', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ weapon_slots: 0 }, {}), { plain: true });
  expect(buffer.stdout).toContain('Slots: 0 weapon, 0 defense, 0 utility');
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

test('truthy non-boolean hidden omits Hidden', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ hidden: 1 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Hidden');
});

test('module class_name prints Class: Shield', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ class_name: 'Shield' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Class: Shield');
});

test('module category prints Category and does not fall back to type', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({ category: 'defense', type: 'weapon' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Category: defense');
  expect(stdout).not.toContain('Category: weapon');
});

test('quantity 0 prints 0x Steel Plate', () => {
  expect(summarizeNamedItemQuantities([{ name: 'Steel Plate', quantity: 0 }])).toBe('0x Steel Plate');
});

test('missing quantity prints ?x Steel Plate', () => {
  expect(summarizeNamedItemQuantities([{ name: 'Steel Plate' }])).toBe('?x Steel Plate');
});

test('missing ship build quantity prints ?x station_core', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ build_materials: [{ item_id: 'station_core' }] }, {}), {
    plain: true,
  });
  const line = buffer.stdout.find((row) => row.includes('Build materials:'));
  expect(line).toBe('Build materials: ?x station_core');
});

test('build material quantity 0 prints 0x station_core', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ build_materials: [{ item_id: 'station_core', quantity: 0 }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Build materials:'));
  expect(line).toBe('Build materials: 0x station_core');
});

test('ship build materials prefer name over item_id', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () =>
      emitCatalogShipDetail({ build_materials: [{ name: 'Steel Plate', item_id: 'steel_plate', quantity: 2 }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Build materials:'));
  expect(line).toBe('Build materials: 2x Steel Plate');
});

test('empty-string build material name does not fall through to item_id', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ build_materials: [{ name: '', item_id: 'steel_plate', quantity: 2 }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Build materials:'));
  expect(line).toBe('Build materials: 2x ');
  expect(buffer.stdout.join('\n')).not.toContain('steel_plate');
});

test('non-record ship build materials print 1x station_core and not skip', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ build_materials: [null, 'skip', { item_id: 'station_core', quantity: 1 }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Build materials:'));
  expect(line).toBe('Build materials: 1x station_core');
  expect(buffer.stdout.join('\n')).not.toContain('skip');
});

test('missing name prints 2x item', () => {
  expect(summarizeNamedItemQuantities([{ quantity: 2 }])).toBe('2x item');
});

test('non-array summarizeNamedItemQuantities returns empty', () => {
  expect(summarizeNamedItemQuantities(undefined)).toBe('');
  expect(summarizeNamedItemQuantities('steel')).toBe('');
});

test('non-record rows print 2x Steel Plate', () => {
  expect(summarizeNamedItemQuantities([null, { name: 'Steel Plate', quantity: 2 }, 'skip'])).toBe('2x Steel Plate');
});

test('item_id name fallback prints 2x steel_plate', () => {
  expect(summarizeNamedItemQuantities([{ item_id: 'steel_plate', quantity: 2 }])).toBe('2x steel_plate');
});

test('id fallback prints 2x plate', () => {
  expect(summarizeNamedItemQuantities([{ id: 'plate', quantity: 2 }])).toBe('2x plate');
});

test('item_name is preferred over item_id', () => {
  expect(summarizeNamedItemQuantities([{ item_name: 'Plate', item_id: 'plate', quantity: 1 }])).toBe('1x Plate');
});

test('name is preferred over item_name', () => {
  expect(summarizeNamedItemQuantities([{ name: 'Steel Plate', item_name: 'Plate', quantity: 1 }])).toBe(
    '1x Steel Plate',
  );
});

test('empty-string name does not fall through to item_id', () => {
  expect(summarizeNamedItemQuantities([{ name: '', item_id: 'steel_plate', quantity: 2 }])).toBe('2x ');
});

test('non-string id returns empty from joinStringIds', () => {
  expect(joinStringIds(['laser', 1])).toBe('');
});

test('joinStringIds drops empty strings', () => {
  expect(joinStringIds(['', 'laser'])).toBe('laser');
});

test('empty id array returns empty from joinStringIds', () => {
  expect(joinStringIds([])).toBe('');
});

test('non-array joinStringIds returns empty', () => {
  expect(joinStringIds(undefined)).toBe('');
  expect(joinStringIds('laser')).toBe('');
});

test('non-string passive recipes are dropped', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ passive_recipes: ['refine_steel', 1, 'smelt'] }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Passive recipes: refine_steel, smelt');
  expect(stdout).not.toContain('refine_steel, 1');
});

test('empty passive recipes omit Passive recipes', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ passive_recipes: [] }, {}), {
    plain: true,
  });
  expect(buffer.stdout.join('\n')).not.toContain('Passive recipes');
});

test('non-array passive recipes omit Passive recipes', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ passive_recipes: 'refine_steel' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).not.toContain('Passive recipes');
  expect(stdout).not.toContain('refine_steel');
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

test('empty capability array omits Capabilities', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ inherent_capabilities: [] }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Capabilities');
});

test('non-array inherent_capabilities cloak omits Capabilities and does not print cloak', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ inherent_capabilities: 'cloak' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).not.toContain('Capabilities');
  expect(stdout).not.toContain('cloak');
});

test('blank capability record prints Capabilities: cloak without a leading comma', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ inherent_capabilities: [{}, { type: 'cloak' }] }, {}), {
    plain: true,
  });
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak');
  expect(line).not.toContain(',');
});

test('whitespace capability flag prints Capabilities: cloak', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', flag: '   ' }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak');
});

test('padded capability type prints Capabilities: cloak', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ inherent_capabilities: [{ type: '  cloak  ' }] }, {}), {
    plain: true,
  });
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak');
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

test('ship capability value false prints the exact line Capabilities: cloak false', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', value: false }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak false');
});

test('legacy-only ship prints Availability: legacy', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ legacy: true }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Availability: legacy');
  expect(stdout).not.toContain('hidden');
});

test('string mobile_base services print Mobile base and Ship modules: yes without Services or market', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ mobile_base: { services: 'market', ship_modules: true } }, {}),
    { plain: true },
  );
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Mobile base');
  expect(stdout).toContain('Ship modules: yes');
  expect(stdout).not.toContain('Services:');
  expect(stdout).not.toContain('market');
});

test('empire is preferred when it differs from faction', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ empire: 'nebula', faction: 'solarian' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Empire: nebula');
  expect(stdout).not.toContain('solarian');
});

test('hidden-only ship prints Availability: hidden', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ hidden: true }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Availability: hidden');
  expect(stdout).not.toContain('legacy');
});

test('numeric hidden 1 with legacy prints Availability: legacy', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ hidden: 1, legacy: true }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Availability: legacy');
  expect(stdout).not.toContain('hidden');
});

test('module package operation falls back to catalog.package_operation', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogModuleDetail({}, { package_operation: 'unpack' }), {
    plain: true,
  });
  expect(buffer.stdout.join('\n')).toContain('Package operation: unpack');
});

test('item package operation prints Package operation: pack', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ package_operation: 'pack' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Package operation: pack');
});

test('whitespace package_operation falls through to catalog and is omitted without a fallback', () => {
  const fallback = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    fallback,
    () => emitCatalogItemDetail({ package_operation: '   ' }, { package_operation: 'unpack' }),
    { plain: true },
  );
  expect(fallback.stdout.join('\n')).toContain('Package operation: unpack');

  const blank = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(blank, () => emitCatalogItemDetail({ package_operation: '   ' }, {}), { plain: true });
  expect(blank.stdout.join('\n')).not.toContain('Package operation');
});

test('item category falls back to type when category is absent', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ type: 'ore' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Category: ore');
});

test('item category is preferred over type', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ category: 'mineral', type: 'ore' }, {}), {
    plain: true,
  });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).toContain('Category: mineral');
  expect(stdout).not.toContain('Category: ore');
});

test('empty category does not print Category:', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ category: '', type: 'ore' }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).not.toContain('Category:');
});

test('null size omits Size and base_value 2 prints Base value: 2', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ size: null, base_value: 2 }, {}), { plain: true });
  const stdout = buffer.stdout.join('\n');
  expect(stdout).not.toContain('Size');
  expect(stdout).toContain('Base value: 2');
});

test('item tier prints Tier: 2', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ tier: 2 }, {}), { plain: true });
  expect(buffer.stdout.join('\n')).toContain('Tier: 2');
});

test('numeric description 0 prints the line 0', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ description: 0 }, {}), { plain: true });
  expect(buffer.stdout.find((line) => line === '0')).toBe('0');
});

test('boolean false description prints the line false', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogItemDetail({ description: false }, {}), { plain: true });
  expect(buffer.stdout.find((line) => line === 'false')).toBe('false');
});

test('empty-string empire does not fall back to faction', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(buffer, () => emitCatalogShipDetail({ empire: '', faction: 'outerrim' }, {}), {
    plain: true,
  });
  expect(buffer.stdout.join('\n')).not.toContain('Empire:');
});

test('non-finite ship price omits Price', () => {
  const nan = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(nan, () => emitCatalogShipDetail({ price: Number.NaN }, {}), { plain: true });
  expect(nan.stdout.join('\n')).not.toContain('Price:');

  const text = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(text, () => emitCatalogShipDetail({ price: '100' }, {}), { plain: true });
  expect(text.stdout.join('\n')).not.toContain('Price:');
});

test('empty-string capability value prints Capabilities: cloak', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', value: '' }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak');
});

test('null capability value prints Capabilities: cloak', () => {
  const buffer = { stdout: [] as string[], stderr: [] as string[] };
  withDisplayRenderBuffer(
    buffer,
    () => emitCatalogShipDetail({ inherent_capabilities: [{ type: 'cloak', value: null }] }, {}),
    { plain: true },
  );
  const line = buffer.stdout.find((row) => row.includes('Capabilities:'));
  expect(line).toBe('Capabilities: cloak');
  expect(buffer.stdout.join('\n')).not.toContain('null');
});
