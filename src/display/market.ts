import { c, emitLine, firstArray, formatter, namedFormatter, printCompactTable, printItemTable } from './helpers.ts';

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
      emitLine(`\n${c.bright}=== Market Listings ===${c.reset}`);
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

  // Station storage
  namedFormatter(
    'storage',
    ['base_id', 'items'],
    (r) => {
      if (!r.base_id || !Array.isArray(r.items)) return false;
      const items = r.items as Array<Record<string, unknown>>;
      const ships = (r.ships as Array<Record<string, unknown>>) || [];
      emitLine(`\n${c.bright}=== Storage at ${r.base_id} ===${c.reset}\n`);
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
    { commands: ['storage', 'view_storage'], shapeFallback: true },
  ),

  // Market orders
  namedFormatter(
    'market_orders',
    ['orders'],
    (r) => {
      const orders = firstArray(r, ['orders']);
      if (!orders) return false;
      printCompactTable('Market Orders', orders, [
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
      printCompactTable('Ship Commissions', commissions, [
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
