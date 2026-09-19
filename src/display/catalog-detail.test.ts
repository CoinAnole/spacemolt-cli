import { expect, test } from 'bun:test';
import {
  catalogSkillTableColumns,
  classifyRecipeVenue,
  countRecipeVenues,
  formatCatalogYesNo,
  formatProducedByFacilities,
  formatProducedByFacilityIds,
  type RecipeVenue,
  summarizeBonusPerLevel,
} from './catalog-detail.ts';

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
