import {
  c,
  emitLine,
  finiteNumber,
  firstArray,
  formatter,
  namedFormatter,
  printCompactTable,
  printItemTable,
  sumNumericField,
} from './helpers.ts';

interface BestPriceDepth {
  price: number;
  quantity: number;
  orders: number;
}

function orderPrice(order: Record<string, unknown>): number | undefined {
  const price = Number(order.price_each);
  return Number.isFinite(price) ? price : undefined;
}

function orderQuantity(order: Record<string, unknown>): number {
  const quantity = Number(order.quantity);
  return Number.isFinite(quantity) ? quantity : 0;
}

function bestPriceDepth(
  orders: Array<Record<string, unknown>> | undefined,
  side: 'buy' | 'sell',
): BestPriceDepth | undefined {
  if (!orders?.length) return undefined;
  const prices = orders.map(orderPrice).filter((price): price is number => price !== undefined);
  if (!prices.length) return undefined;
  const bestPrice = side === 'buy' ? Math.max(...prices) : Math.min(...prices);
  const ordersAtBest = orders.filter((order) => orderPrice(order) === bestPrice);
  return {
    price: bestPrice,
    quantity: ordersAtBest.reduce((total, order) => total + orderQuantity(order), 0),
    orders: ordersAtBest.length,
  };
}

function formatPriceDepth(depth: BestPriceDepth | undefined): { price: string; depth: string } {
  if (!depth) return { price: '', depth: '' };
  return {
    price: `${depth.price.toLocaleString()} cr`,
    depth: `${depth.quantity.toLocaleString()} / ${depth.orders.toLocaleString()}`,
  };
}

function marketSummaryRows(items: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return items.map((item) => {
    const buy = formatPriceDepth(bestPriceDepth(item.buy_orders as Array<Record<string, unknown>> | undefined, 'buy'));
    const sell = formatPriceDepth(
      bestPriceDepth(item.sell_orders as Array<Record<string, unknown>> | undefined, 'sell'),
    );
    return {
      item_name: item.item_name || item.item_id || 'unknown',
      item_id: item.item_id || '',
      best_buy: buy.price,
      buy_depth: buy.depth,
      best_sell: sell.price,
      sell_depth: sell.depth,
    };
  });
}

export const marketFormatters = [
  // Ship listings (browse_ships) — must come before market listings since both use r.listings
  formatter(
    (r) => {
      if (!Array.isArray(r.listings)) return false;
      const listings = r.listings as Array<Record<string, unknown>>;
      const firstListing = listings[0];
      if (!firstListing?.ship_id) return false;
      emitLine(`\n${c.bright}=== Ships for Sale @ ${r.base_name || 'Station'} ===${c.reset}`);
      for (const listing of listings) {
        const shipClass = listing.class_id || 'Unknown';
        const shipName = listing.ship_name || shipClass;
        const price = listing.price as number;
        const formattedPrice = price.toLocaleString();
        const scale = listing.scale ? `(Scale ${listing.scale})` : '';
        const tier = listing.tier ? `T${listing.tier}` : '';
        const category = listing.category ? `${listing.category}` : '';
        const categoryTier = [category, tier].filter(Boolean).join(' - ');
        const hull = listing.hull ? `Hull: ${listing.hull}/${listing.max_hull}` : '';
        const shield = listing.shield ? `Shield: ${listing.shield}` : '';
        const stats = [hull, shield].filter(Boolean).join(', ');
        const seller = listing.seller || listing.seller_name || listing.seller_id || 'Unknown';
        emitLine(`\n${c.cyan}${shipName}${c.reset} (${shipClass}) ${scale}`);
        if (categoryTier) emitLine(`  ${categoryTier}`);
        emitLine(`  Price: ${c.yellow}${formattedPrice} credits${c.reset}`);
        if (stats) emitLine(`  ${stats}`);
        emitLine(`  Seller: ${seller}`);
        emitLine(`  Listing ID: ${listing.listing_id}`);
      }
      return true;
    },
    { commands: ['browse_ships'], shapeFallback: true },
  ),

  // Market listings
  formatter(
    (r) => {
      if (!Array.isArray(r.listings)) return false;
      const listings = r.listings as Array<Record<string, unknown>>;
      emitLine(`\n${c.bright}=== Listings ===${c.reset}`);
      if (r.buy_price_modifier) {
        emitLine(`Buy price modifier: ${r.buy_price_modifier}x`);
        emitLine(`Sell price modifier: ${r.sell_price_modifier}x`);
      }
      if (!listings.length) {
        emitLine(`\n(No listings at this market)`);
      } else {
        for (const listing of listings) {
          const seller = listing.seller_name || listing.seller || listing.seller_id || 'NPC';
          emitLine(`\n  ${listing.item_id}: ${listing.quantity} @ ${listing.price_each} each`);
          emitLine(`    Listing ID: ${listing.listing_id}`);
          emitLine(`    Seller: ${seller}`);
        }
      }
      return true;
    },
    { commands: ['get_trades'], shapeFallback: true },
  ),

  // Market order book
  namedFormatter(
    'view_market',
    ['items'],
    (r) => {
      if (r.action !== 'view_market' || !r.base_id) return false;
      const items = r.items as Array<Record<string, unknown>>;
      if (!items || items.length === 0) {
        emitLine(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n  (empty)`);
        return true;
      }
      emitLine(`\n${c.bright}=== Market at ${r.base_id} ===${c.reset}\n`);
      if (items.length > 1) {
        printCompactTable('Items', marketSummaryRows(items), [
          ['Item', ['item_name']],
          ['ID', ['item_id']],
          ['Best Buy', ['best_buy']],
          ['Buy Depth', ['buy_depth']],
          ['Best Sell', ['best_sell']],
          ['Sell Depth', ['sell_depth']],
        ]);
        emitLine('');
        emitLine('Depth columns show quantity / orders at the best price.');
        emitLine('Use spacemolt view_market <item_id> for full order depth.');
        return true;
      }
      for (const item of items) {
        const name = String(item.item_name || item.item_id || 'unknown');
        const buyOrders = item.buy_orders as Array<Record<string, unknown>> | undefined;
        const sellOrders = item.sell_orders as Array<Record<string, unknown>> | undefined;
        emitLine(`${c.bright}${name}${c.reset}`);
        if (buyOrders && buyOrders.length > 0) {
          emitLine(`  Buy orders (${buyOrders.length}):`);
          for (const o of buyOrders) {
            const price = Number(o.price_each).toLocaleString();
            const qty = Number(o.quantity).toLocaleString();
            const src = o.source && o.source !== 'station' && o.source !== 'player' ? ` [${o.source}]` : '';
            emitLine(`    ${c.green}${price} cr${c.reset} x ${qty}${src}`);
          }
        }
        if (sellOrders && sellOrders.length > 0) {
          emitLine(`  Sell orders (${sellOrders.length}):`);
          for (const o of sellOrders) {
            const price = Number(o.price_each).toLocaleString();
            const qty = Number(o.quantity).toLocaleString();
            emitLine(`    ${c.red}${price} cr${c.reset} x ${qty}`);
          }
        }
        if (!buyOrders?.length && !sellOrders?.length) {
          emitLine('  (no orders)');
        }
        emitLine('');
      }
      return true;
    },
    { commands: ['view_market'], shapeFallback: true },
  ),

  // Market order creation
  namedFormatter(
    'create_sell_order',
    ['listing_fee', 'order_id'],
    (r) => {
      if (r.action && r.action !== 'create_sell_order' && r.action !== 'create_buy_order') return false;
      if (r.order_id === undefined && r.listing_fee === undefined) return false;
      const itemName = r.item || r.item_name || r.item_id || 'unknown';
      const itemId = r.item_id && r.item_id !== itemName ? ` (${r.item_id})` : '';
      const requested = finiteNumber(r.quantity);
      const filled = finiteNumber(r.quantity_filled) ?? sumNumericField(r.fills, 'quantity');
      const listed =
        finiteNumber(r.quantity_listed) ??
        (requested !== undefined && filled !== undefined ? Math.max(0, requested - filled) : undefined);
      const earned = finiteNumber(r.total_earned) ?? sumNumericField(r.fills, 'subtotal');
      const priceEach = finiteNumber(r.price_each);
      const listingFee = finiteNumber(r.listing_fee);

      emitLine(`\n${c.bright}=== Sell Order Created ===${c.reset}`);
      emitLine(`Item: ${itemName}${itemId}`);
      if (requested !== undefined) emitLine(`Requested: ${requested.toLocaleString()}`);
      if (filled !== undefined) {
        const earnedText = earned !== undefined ? ` (earned: ${earned.toLocaleString()} cr)` : '';
        emitLine(`Instant fills: ${filled.toLocaleString()}${earnedText}`);
      }
      if (listed !== undefined) emitLine(`Remaining listed: ${listed.toLocaleString()}`);
      if (priceEach !== undefined) emitLine(`Price each: ${priceEach.toLocaleString()} cr`);
      if (listingFee !== undefined) emitLine(`Listing fee: ${listingFee.toLocaleString()} cr`);
      if (r.order_id) emitLine(`Order ID: ${r.order_id}`);
      return true;
    },
    { commands: ['create_sell_order'], shapeFallback: true },
  ),

  // Station storage
  namedFormatter(
    'storage',
    ['base_id', 'items'],
    (r, command) => {
      if (!r.base_id || !Array.isArray(r.items)) return false;
      const items = r.items as Array<Record<string, unknown>>;
      const ships = (r.ships as Array<Record<string, unknown>>) || [];
      const isFactionStorage = command === 'view_faction_storage' || r.target === 'faction';
      const title = isFactionStorage ? 'Faction Storage' : 'Storage';
      emitLine(`\n${c.bright}=== ${title} at ${r.base_id} ===${c.reset}\n`);
      const factionFuelReserve = r.faction_fuel_reserve;
      const factionFuelCapacity = r.faction_fuel_capacity;
      if (isFactionStorage && (factionFuelReserve !== undefined || factionFuelCapacity !== undefined)) {
        emitLine(`Fuel bunker: ${factionFuelReserve ?? '?'} / ${factionFuelCapacity ?? '?'} units\n`);
      }
      if (typeof r.hint === 'string' && r.hint) emitLine(`${c.dim}${r.hint}${c.reset}\n`);
      printItemTable(items);
      if (ships.length) {
        const nameW = Math.max(9, ...ships.map((s) => String(s.class_name || s.class_id || '').length));
        const classW = Math.max(5, ...ships.map((s) => String(s.class_id || '').length));
        const idW = Math.max(2, ...ships.map((s) => String(s.ship_id || '').length));
        const modsW = Math.max(4, ...ships.map((s) => String(s.modules ?? '').length));
        const cargoW = Math.max(5, ...ships.map((s) => String(s.cargo_used ?? '').length));
        emitLine(`\n${c.bright}Ships (${ships.length}):${c.reset}\n`);
        emitLine(
          `  ${'Ship Name'.padEnd(nameW)} | ${'Class'.padEnd(classW)} | ${'Mods'.padStart(modsW)} | ${'Cargo'.padStart(cargoW)} | ${'ID'.padEnd(idW)}`,
        );
        emitLine(
          `  ${'-'.repeat(nameW)}-+-${'-'.repeat(classW)}-+-${'-'.repeat(modsW)}-+-${'-'.repeat(cargoW)}-+-${'-'.repeat(idW)}`,
        );
        for (const s of ships) {
          const name = String(s.class_name || s.class_id || '').padEnd(nameW);
          const cls = String(s.class_id || '').padEnd(classW);
          const mods = String(s.modules ?? '').padStart(modsW);
          const cargo = String(s.cargo_used ?? '').padStart(cargoW);
          const id = String(s.ship_id || '').padEnd(idW);
          emitLine(`  ${name} | ${cls} | ${mods} | ${cargo} | ${id}`);
        }
      }
      return true;
    },
    { commands: ['storage', 'view_storage', 'view_faction_storage'], shapeFallback: true },
  ),

  // Market orders
  namedFormatter(
    'market_orders',
    ['orders'],
    (r) => {
      const orders = firstArray(r, ['orders']);
      if (!orders) return false;
      printCompactTable('Orders', orders, [
        ['Item', ['item_id', 'item_name']],
        ['ID', ['order_id', 'listing_id', 'id']],
        ['Side', ['side', 'type']],
        ['Qty', ['quantity', 'remaining']],
        ['Price', ['price_each', 'price']],
      ]);
      return true;
    },
    { commands: ['view_orders'], shapeFallback: true },
  ),

  // Ship commissions
  formatter(
    (r) => {
      const commissions = firstArray(r, ['commissions']);
      if (!commissions) return false;
      printCompactTable('Commissions', commissions, [
        ['Ship', ['ship_name', 'ship_class_id']],
        ['Status', ['status']],
        ['Base', ['base_name', 'base_id']],
        ['Ticks', ['ticks_remaining']],
        ['ID', ['commission_id']],
      ]);
      if (r.count !== undefined && commissions.length !== r.count) emitLine(`${c.dim}count ${r.count}${c.reset}`);
      return true;
    },
    { commands: ['commission_status'] },
  ),

  // Intel
  namedFormatter(
    'intel',
    ['intel'],
    (r) => {
      const intel = firstArray(r, ['intel', 'results', 'trade_intel']);
      if (!intel) return false;
      printCompactTable('Intel', intel, [
        ['System', ['system_name', 'system_id']],
        ['POI/Base', ['poi_name', 'poi_id', 'base_name', 'base_id']],
        ['Type', ['poi_type', 'resource_type', 'item_id']],
        ['Value', ['quantity', 'price_each', 'confidence']],
        ['Updated', ['updated_at', 'created_at']],
      ]);
      return true;
    },
    { commands: ['faction_query_trade_intel', 'faction_trade_intel'], shapeFallback: true },
  ),
];
