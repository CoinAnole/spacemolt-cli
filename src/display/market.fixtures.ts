export const browseShipsFixture = {
  base_name: 'Earth Station',
  listings: [
    {
      listing_id: 'listing-1',
      ship_id: 'ship-1',
      ship_name: 'Lucky Strike',
      class_id: 'prospector',
      price: 125000,
      scale: 1,
      tier: 2,
      category: 'Mining',
      hull: 80,
      max_hull: 100,
      shield: 20,
      seller: 'Marlowe',
    },
  ],
};

export const viewMarketFixture = {
  action: 'view_market',
  base: 'Earth Station',
  base_id: 'earth_station',
  categories: ['ore', 'fuel'],
  message: 'Market at Earth Station',
  items: [
    {
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      category: 'ore',
      best_buy: 15,
      best_buy_qty: 575,
      best_sell: 18,
      best_sell_qty: 15,
      buy_quantity: 1475,
      buy_price: 15,
      sell_quantity: 1015,
      sell_price: 18,
      buy_orders: [
        { price_each: 15, quantity: 500, source: 'station' },
        { price_each: 15, quantity: 75, source: 'player' },
        { price_each: 12, quantity: 900, source: 'player' },
      ],
      sell_orders: [
        { price_each: 18, quantity: 5 },
        { price_each: 18, quantity: 10 },
        { price_each: 75, quantity: 1000 },
      ],
    },
    {
      item_id: 'fuel_cell',
      item_name: 'Fuel Cell',
      category: 'fuel',
      best_buy: 0,
      best_buy_qty: 0,
      best_sell: 0,
      best_sell_qty: 0,
      buy_quantity: 0,
      buy_price: 0,
      sell_quantity: 0,
      sell_price: 0,
      buy_orders: [],
      sell_orders: [],
    },
  ],
};

export const viewMarketSingleItemFixture = {
  action: 'view_market',
  base_id: 'earth_station',
  items: [viewMarketFixture.items[0]],
};

export const subscribeMarketFixture = {
  action: 'subscribe_market',
  base_id: 'haven_exchange',
  base_name: 'Haven Exchange',
  message: 'Subscribed to market updates.',
  items: [
    {
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      sell_orders: [{ price_each: 12, quantity: 40, source: 'station' }],
      buy_orders: [{ price_each: 9, quantity: 25 }],
    },
  ],
};

export const storageFixture = {
  base_id: 'earth_station',
  items: [{ item_id: 'fuel_cell', item_name: 'Fuel Cell', quantity: 12 }],
  ships: [
    {
      ship_id: 'ship-1',
      class_id: 'prospector',
      class_name: 'Prospector',
      modules: 3,
      cargo_used: 10,
    },
  ],
};

export const marketOrdersFixture = {
  action: 'view_orders',
  base: 'Earth Station',
  scope: 'personal',
  orders: [
    {
      order_id: 'order-1',
      order_type: 'limit',
      side: 'buy',
      item_id: 'ore_iron',
      item_name: 'Iron Ore',
      quantity: 100,
      remaining: 75,
      filled_quantity: 25,
      price_each: 12,
      listing_fee: 25,
      created_at: '2026-05-29T00:00:00Z',
    },
  ],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
  has_more: false,
  hint: 'Showing personal market orders.',
  sort_by: 'newest',
};

export const createSellOrderFixture = {
  details: {
    action: 'create_sell_order',
    from_storage: 1,
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 1,
    price_each: 999999,
    listing_fee: 10000,
    order_id: 'order-sell-1',
    message: 'Sell order created. 1x Nickel Ore listed at 999999 credits each. Listing fee: 10000 credits.',
  },
};

export const createBuyOrderFixture = {
  details: {
    action: 'create_buy_order',
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 1,
    price_each: 1,
    total_escrowed: 1,
    remaining_escrowed: 1,
    listing_fee: 1,
    order_id: 'order-buy-1',
    message:
      'Buy order created. Offering 1 credits each for 1x Nickel Ore. 1 credits escrowed. Listing fee: 1 credits.',
  },
};

export const factionCreateBuyOrderFixture = {
  details: {
    action: 'create_buy_order',
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 25,
    price_each: 2,
    quantity_filled: 0,
    quantity_listed: 25,
    total_spent: 0,
    total_escrowed: 50,
    remaining_escrowed: 50,
    listing_fee: 1,
    order_id: 'faction-buy-1',
    message: 'Created faction buy order.',
  },
};

export const factionCreateSellOrderFixture = {
  details: {
    action: 'create_sell_order',
    item: 'Nickel Ore',
    item_id: 'nickel_ore',
    quantity: 25,
    price_each: 4,
    quantity_filled: 10,
    quantity_listed: 15,
    total_earned: 40,
    listing_fee: 2,
    order_id: 'faction-sell-1',
    message: 'Created faction sell order.',
  },
};

export const commissionStatusFixture = {
  commissions: [
    {
      commission_id: 'commission-1',
      ship_class_id: 'prospector',
      ship_name: 'Lucky Strike',
      status: 'building',
      base_name: 'Earth Station',
      ticks_remaining: 12,
    },
  ],
  count: 1,
};

export const emptyCommissionStatusFixture = {
  commissions: [],
  count: 0,
};

export const intelFixture = {
  intel: [
    {
      system_name: 'Sol',
      poi_name: 'Earth',
      item_id: 'fuel_cell',
      price_each: 25,
      updated_at: '2026-05-17T00:00:00Z',
    },
  ],
};

export const factionQueryIntelFixture = {
  count: 1,
  current_tick: 900690,
  intel_level: 2,
  message: 'Showing intel for 1 system',
  total: 1,
  entries: [
    {
      system_id: 'sol',
      name: 'Sol',
      empire: 'solarian',
      police_level: 3,
      submitted_at_tick: 900685,
      submitted_by: 'p-123',
      submitter_name: 'Marlowe',
      pois: [
        {
          id: 'sol_gas_cloud',
          type: 'gas_cloud',
          name: 'Sol Gas Cloud',
          position: { x: 12, y: -4 },
          resources: [
            {
              resource_id: 'hydrogen_gas',
              richness: 4,
              remaining: 500,
              max_remaining: 1000,
              depletion_percent: 50,
              remaining_display: '500 units',
            },
            {
              id: null,
              resource_id: 'argon_gas',
              richness: 2,
              remaining: 200,
              max_remaining: 500,
              depletion_percent: 40,
              remaining_display: '200 units',
            },
          ],
        },
      ],
    },
  ],
};

export const marketListingsFixture = {
  listings: [
    {
      listing_id: 'listing-1',
      item_id: 'ore_iron',
      quantity: 100,
      price_each: 15,
      seller_name: 'Marlowe',
    },
  ],
};

export const tradeOffersFixture = {
  incoming: [],
  outgoing: [
    {
      trade_id: 'trade-1',
      offerer_name: 'BuyerBob',
      target_name: 'Marlowe',
      offer_items: [{ item_id: 'ore_iron', quantity: 50 }],
      request_items: [{ item_id: 'fuel_cell', quantity: 3 }],
      offer_credits: 0,
      request_credits: 120,
      expires_at: '2026-06-26T00:00:00Z',
    },
  ],
};

export const marketFixtureCases = {
  create_sell_order: { command: 'create_sell_order', fixture: createSellOrderFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  storage: { command: 'storage', fixture: storageFixture },
  market_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
  faction_query_intel: { command: 'faction_query_intel', fixture: factionQueryIntelFixture },
};

export const marketHighValueFixtures = {
  browse_ships: { command: 'browse_ships', fixture: browseShipsFixture },
  create_buy_order: { command: 'create_buy_order', fixture: createBuyOrderFixture },
  create_sell_order: { command: 'create_sell_order', fixture: createSellOrderFixture },
  subscribe_market: { command: 'subscribe_market', fixture: subscribeMarketFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  storage: { command: 'storage', fixture: storageFixture },
  view_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  commission_status: { command: 'commission_status', fixture: commissionStatusFixture },
  commission_status_empty: { command: 'commission_status', fixture: emptyCommissionStatusFixture },
  storage_view: { command: 'storage', fixture: { ...storageFixture, action: 'view', target: 'self' } },
  faction_query_trade_intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
  faction_query_intel: { command: 'faction_query_intel', fixture: factionQueryIntelFixture },
  faction_create_buy_order: { command: 'faction_create_buy_order', fixture: factionCreateBuyOrderFixture },
  faction_create_sell_order: { command: 'faction_create_sell_order', fixture: factionCreateSellOrderFixture },
  get_trades: { command: 'get_trades', fixture: tradeOffersFixture },
};
