import type { HighValueFixtureEntry } from './formatter-fixtures.ts';

export const listPassengersFixture = {
  count: 1,
  economy_berths: '1/2',
  business_berths: '0/1',
  first_berths: '0/0',
  passengers: [
    {
      citizen_id: 'citizen-lyra',
      name: 'Lyra Vale',
      bio: 'A courier with a nervous smile and a sealed satchel.',
      class: 'economy',
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      base_fare: 125,
      speed_bonus: 25,
      ticks_remaining: 8,
    },
  ],
};

export const listStationPassengersFixture = {
  station: 'Earth Station',
  count: 1,
  fare_surge: 1.8,
  demand_level: 'underserved',
  market_conditions: 'High demand after long wait times.',
  waiting: [
    {
      citizen_id: 'citizen-orin',
      name: 'Orin Pax',
      bio: 'A machinist headed home after a long contract in the belt.',
      class: 'business',
      citizenship: 'solarian',
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      estimated_fare: 240,
    },
  ],
};

export const loadPassengerFixture = {
  message: 'Loaded passengers.',
  loaded: [
    {
      citizen_id: 'citizen-lyra',
      name: 'Lyra Vale',
      bio: 'A courier with a nervous smile and a sealed satchel.',
      class: 'economy',
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      base_fare: 125,
      speed_bonus: 25,
      ticks_remaining: 8,
    },
  ],
  count: 1,
  total_fare: 125,
  skipped_unfunded: 2,
};

export const unloadPassengerBulkFixture = {
  message: 'Unloaded all passengers.',
  delivered: [
    {
      citizen_id: 'citizen-lyra',
      name: 'Lyra Vale',
      bio: 'A courier with a nervous smile and a sealed satchel.',
      class: 'economy',
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      base_fare: 125,
      speed_bonus: 25,
      ticks_remaining: 8,
    },
  ],
  stranded: [
    {
      citizen_id: 'citizen-orin',
      name: 'Orin Pax',
      bio: 'A machinist stranded before reaching home.',
      class: 'business',
      destination: 'earth_station',
      destination_name: 'Earth Station',
      destination_system: 'Sol',
      base_fare: 240,
      speed_bonus: 0,
      ticks_remaining: 3,
    },
  ],
  fare_collected: 150,
  reputation_changes: { solarian: -1 },
};

export const passengerFixtureCases = {
  list_passengers: { command: 'list_passengers', fixture: listPassengersFixture },
  list_station_passengers: { command: 'list_station_passengers', fixture: listStationPassengersFixture },
  load_passenger: { command: 'load_passenger', fixture: loadPassengerFixture },
};

export const passengerHighValueFixtures: Record<string, HighValueFixtureEntry> = {
  ...passengerFixtureCases,
  unload_passenger_bulk: {
    command: 'unload_passenger',
    fixture: unloadPassengerBulkFixture,
    schemaTarget: 'details',
  },
};
