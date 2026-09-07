import type { HighValueFixtureEntry } from './formatter-fixtures.ts';
import { poiWorkabilityResources } from './status.fixtures.ts';

export const surveyAlreadyKnownResources = [
  {
    resource_id: 'ore_iron',
    name: 'Iron Ore',
    richness: 3,
    remaining: 750,
    remaining_display: '750 units',
    max_remaining: 1000,
    depletion_percent: 25,
    supported_power: 12,
    // lock / too_sparse omitted: absence-is-silent on the already-known row
  },
];

export const surveySystemDetails = {
  system_id: 'sol',
  system_name: 'Sol',
  survey_power: 18,
  message: 'Survey complete. Hidden deposits resolved.',
  anomaly_hint: 'A faint resonance west of the belt.',
  bloom_status: 'active',
  bloom_intensity: 0.8,
  newly_revealed: [
    {
      id: 'sol_kaiser_vein',
      name: 'Kaiser Vein',
      type: 'asteroid_belt',
      description: 'A dense iron-gold plug beneath the main belt.',
      resources: poiWorkabilityResources,
    },
  ],
  already_revealed: [
    {
      id: 'sol_outer_cache',
      name: 'Outer Belt Cache',
      type: 'asteroid_belt',
      resources: surveyAlreadyKnownResources,
    },
  ],
  faint_signatures: [{ type: 'deep_core', hint: 'Need more survey power', difficulty: '24' }],
  wildlife: [
    {
      species: 'ember_grazer',
      name: 'Ember Grazer',
      role: 'grazer',
      estimate: 42,
      abundance: 'common',
      ranched: 0,
    },
    {
      species: 'molt_leviathan',
      name: 'Molt Leviathan',
      role: 'predator',
      estimate: 1,
      abundance: 'rare',
      // ranched omitted: empty Ranched cell; column still present because ember has 0
    },
  ],
  xp_gained: { scanning: 12, deep_core_mining: 8 },
};

export const surveySystemFixture = {
  details: surveySystemDetails,
  location: {
    system_id: 'sol',
    system_name: 'Sol',
    poi_id: 'sol_asteroid_belt',
    poi_name: 'Sol Asteroid Belt',
  },
  // Distinctive name/level map so a leaked sibling would print === Your Skills ===
  skills: {
    scanning: {
      name: 'Scanning',
      category: 'Exploration',
      level: 7,
      max_level: 100,
      xp: 900,
    },
  },
};

export const surveySystemNoHitsFixture = {
  details: {
    system_id: 'sol',
    system_name: 'Sol',
    survey_power: 8,
    message: 'Survey complete. No hidden deposits resolved.',
    bloom_status: 'none',
    bloom_intensity: 0,
    newly_revealed: [],
    already_revealed: [],
    faint_signatures: [],
    wildlife: [],
    xp_gained: {},
  },
};

export const surveyFixtureCases = {
  survey_system: { command: 'survey_system', fixture: surveySystemFixture },
};

export const surveyHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  survey_system: {
    command: 'survey_system',
    fixture: surveySystemFixture,
    schemaTarget: 'details',
  },
  survey_system_no_hits: {
    command: 'survey_system',
    fixture: surveySystemNoHitsFixture,
    schemaTarget: 'details',
  },
};
