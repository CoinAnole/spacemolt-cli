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
      fare: 125,
      ticks_remaining: 8,
    },
  ],
};

export const listStationPassengersFixture = {
  station: 'Earth Station',
  count: 1,
  waiting: [
    {
      citizen_id: 'citizen-orin',
      name: 'Orin Pax',
      bio: 'A machinist headed home after a long contract in the belt.',
      class: 'business',
      citizenship: 'solarian',
      destination: 'nova_central',
      destination_name: 'Nova Central',
    },
  ],
};

export const passengerFixtureCases = {
  list_passengers: { command: 'list_passengers', fixture: listPassengersFixture },
  list_station_passengers: { command: 'list_station_passengers', fixture: listStationPassengersFixture },
};

export const passengerHighValueFixtures = passengerFixtureCases;
