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
      berth_class: 'economy',
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

export const listStationPassengersWithLoungeFixture = {
  ...listStationPassengersFixture,
  transit_lounge: {
    lounge: 'Transit Lounge',
    capacity: 20,
    occupancy: 1,
    passengers: [
      {
        citizen_id: 'citizen-ada',
        name: 'Ada Quill',
        bio: 'A connecting traveler waiting for the Nova leg.',
        class: 'economy',
        connecting: true,
        destination: 'nova_central',
        destination_name: 'Nova Central',
        destination_system: 'Nova',
        base_fare: 180,
        speed_bonus: 15,
        ticks_remaining: 12,
      },
    ],
  },
};

export const loadPassengerConnectingFixture = {
  message: 'Loaded passengers.',
  loaded: [
    {
      citizen_id: 'citizen-ada',
      name: 'Ada Quill',
      bio: 'A connecting traveler boarding for Nova.',
      class: 'economy',
      berth_class: 'economy',
      connecting: true,
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      base_fare: 180,
      speed_bonus: 15,
      ticks_remaining: 12,
    },
  ],
  count: 1,
  total_fare: 180,
};

export const unloadPassengerTransferFixture = {
  message: 'Transferred passengers to a docked ship.',
  target_ship: 'ship-mate-1',
  target_ship_name: 'Mate Runner',
  count: 1,
  transferred: [
    {
      citizen_id: 'citizen-lyra',
      name: 'Lyra Vale',
      bio: 'A courier continuing on a connecting flight.',
      class: 'economy',
      connecting: true,
      destination: 'nova_central',
      destination_name: 'Nova Central',
      destination_system: 'Nova',
      base_fare: 125,
      speed_bonus: 25,
      ticks_remaining: 8,
    },
  ],
  skipped_no_berth: 1,
};

export const unloadPassengerLoungeFixture = {
  message: 'Checked passengers into the Transit Lounge.',
  lounge: 'Transit Lounge',
  capacity: 20,
  occupancy: 2,
  count: 1,
  deadline_bonus_ticks: 50,
  checked_in: [
    {
      citizen_id: 'citizen-orin',
      name: 'Orin Pax',
      bio: 'A machinist laid over for an onward leg.',
      class: 'business',
      connecting: true,
      destination: 'earth_station',
      destination_name: 'Earth Station',
      destination_system: 'Sol',
      base_fare: 240,
      speed_bonus: 0,
      ticks_remaining: 40,
    },
  ],
  skipped_full: 0,
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
