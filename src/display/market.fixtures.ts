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
      seller_name: 'Marlowe',
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
  action: 'create_sell_order',
  item: 'Iron Ore',
  item_id: 'iron_ore',
  quantity: 1,
  price_each: 999999,
  quantity_listed: 1,
  listing_fee: 19999,
  order_id: 'order-sell-1',
  message: 'Created sell order for 1 Iron Ore at 999999 credits each.',
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

export const marketFixtureCases = {
  create_sell_order: { command: 'create_sell_order', fixture: createSellOrderFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  storage: { command: 'storage', fixture: storageFixture },
  market_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
};

export const marketHighValueFixtures = {
  browse_ships: { command: 'browse_ships', fixture: browseShipsFixture },
  create_sell_order: { command: 'create_sell_order', fixture: createSellOrderFixture },
  view_market: { command: 'view_market', fixture: viewMarketFixture },
  storage: { command: 'storage', fixture: storageFixture },
  view_orders: { command: 'view_orders', fixture: marketOrdersFixture },
  commission_status: { command: 'commission_status', fixture: commissionStatusFixture },
  commission_status_empty: { command: 'commission_status', fixture: emptyCommissionStatusFixture },
  view_storage: { command: 'view_storage', fixture: storageFixture },
  faction_query_trade_intel: { command: 'faction_query_trade_intel', fixture: intelFixture },
  get_trades: { command: 'get_trades', fixture: marketListingsFixture },
};
