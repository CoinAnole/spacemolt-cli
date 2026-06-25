import {
  c,
  emitLine,
  finiteNumber,
  firstArray,
  formatter,
  isRecord,
  namedFormatter,
  printCompactTable,
  printItemTable,
  sumNumericField,
} from './helpers.ts';
import { formatCompactTable, rowValue } from './tables.ts';

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

function formatStorageHint(hint: string): string {
  return hint.replace(/[ \t]+(Fuel bunker here:)/g, '\n$1');
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

type OrderSide = 'buy' | 'sell';

function createOrderSide(result: Record<string, unknown>, command?: string): OrderSide | undefined {
  if (result.action === 'create_buy_order') return 'buy';
  if (result.action === 'create_sell_order') return 'sell';
  if (command?.endsWith('create_buy_order')) return 'buy';
  if (command?.endsWith('create_sell_order')) return 'sell';
  return undefined;
}

function formatCredits(value: number): string {
  return `${value.toLocaleString()} cr`;
}

function firstDisplayValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function formatDisplayNumber(value: unknown): string {
  const number = finiteNumber(value);
  if (number !== undefined) return number.toLocaleString();
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function formatCreditCell(value: unknown): string {
  const number = finiteNumber(value);
  if (number !== undefined) return formatCredits(number);
  if (value === undefined || value === null || value === '') return '';
  return String(value);
}

function formatOpenQuantity(order: Record<string, unknown>): string {
  const remaining = formatDisplayNumber(order.remaining);
  const quantity = formatDisplayNumber(order.quantity);
  if (remaining && quantity) return `${remaining}/${quantity}`;
  return remaining || quantity;
}

function formatTimestampPreview(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    return new Date(milliseconds)
      .toISOString()
      .replace('T', ' ')
      .replace(/\.\d{3}Z$/, '');
  }
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}(?::\d{2})?)/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

function formatOrderCount(value: unknown): string {
  const number = finiteNumber(value);
  if (number === undefined) return '';
  return `${number.toLocaleString()} ${number === 1 ? 'order' : 'orders'}`;
}

function formatOrderPage(result: Record<string, unknown>): string {
  const page = formatDisplayNumber(result.page);
  const totalPages = formatDisplayNumber(result.total_pages);
  if (!page || !totalPages) return '';
  return `page ${page}/${totalPages}`;
}

function marketOrderContext(result: Record<string, unknown>): string {
  return [result.base, result.scope, result.sort_by, formatOrderCount(result.total), formatOrderPage(result)]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' | ');
}

function marketOrderRows(orders: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return orders.map((order) => ({
    ...order,
    item_display: rowValue(order, ['item_name', 'item_id']),
    side_display: rowValue(order, ['side', 'type']),
    open_quantity_display: formatOpenQuantity(order),
    filled_display: formatDisplayNumber(order.filled_quantity),
    price_display: formatCreditCell(firstDisplayValue(order, ['price_each', 'price'])),
    fee_display: formatCreditCell(order.listing_fee),
    created_preview: formatTimestampPreview(order.created_at),
    id_display: rowValue(order, ['order_id', 'listing_id', 'id']),
  }));
}

function printMarketOrders(result: Record<string, unknown>, orders: Array<Record<string, unknown>>): void {
  emitLine(`\n${c.bright}=== Orders ===${c.reset}`);
  const context = marketOrderContext(result);
  if (context) emitLine(context);
  if (result.hint !== undefined && result.hint !== null && result.hint !== '') emitLine(String(result.hint));

  const lines = formatCompactTable('Orders', marketOrderRows(orders), [
    ['Item', ['item_display']],
    ['Side', ['side_display']],
    ['Open/Qty', ['open_quantity_display']],
    ['Filled', ['filled_display']],
    ['Price', ['price_display']],
    ['Fee', ['fee_display']],
    ['Created', ['created_preview']],
    ['ID', ['id_display']],
  ]);

  for (const line of lines.slice(1)) emitLine(line);
}

function formatTradeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isRecord).map((item) => `${item.quantity ?? '?'}x ${item.item_id ?? '?'}`);
}

function formatTradeTerms(items: unknown, credits: unknown): string {
  const parts = formatTradeItems(items);
  const creditValue = finiteNumber(credits);
  if (creditValue !== undefined && creditValue !== 0) parts.push(formatCredits(creditValue));
  return parts.join(', ') || 'nothing';
}

function formatOptionalNumber(value: unknown): string {
  const number = finiteNumber(value);
  return number === undefined ? '?' : number.toLocaleString();
}

function formatFillCounterparties(fills: unknown): string {
  if (!Array.isArray(fills)) return '';
  const counterparties: string[] = [];
  const seen = new Set<string>();
  for (const fill of fills) {
    if (!isRecord(fill) || typeof fill.counterparty !== 'string') continue;
    const counterparty = fill.counterparty.trim();
    if (!counterparty || seen.has(counterparty)) continue;
    counterparties.push(counterparty);
    seen.add(counterparty);
  }
  return counterparties.length ? ` from ${counterparties.join(', ')}` : '';
}

function autoListedOrder(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function emitAutoListed(value: unknown): void {
  const order = autoListedOrder(value);
  if (!order) return;
  const quantity = finiteNumber(order.quantity);
  const priceEach = finiteNumber(order.price_each);
  const listingFee = finiteNumber(order.listing_fee);
  const escrow = finiteNumber(order.escrow);

  if (quantity !== undefined && priceEach !== undefined) {
    emitLine(`Auto-listed: ${quantity.toLocaleString()} @ ${formatCredits(priceEach)}`);
  } else if (quantity !== undefined) {
    emitLine(`Auto-listed: ${quantity.toLocaleString()}`);
  }
  if (escrow !== undefined) emitLine(`Escrow: ${formatCredits(escrow)}`);
  if (listingFee !== undefined) emitLine(`Listing fee: ${formatCredits(listingFee)}`);
  if (order.order_id) emitLine(`Order ID: ${order.order_id}`);
}

function hasAnyField(record: Record<string, unknown>, fields: string[]): boolean {
  return fields.some((field) => record[field] !== undefined);
}

function hasMarketItem(record: Record<string, unknown>): boolean {
  return record.item !== undefined || record.item_name !== undefined || record.item_id !== undefined;
}

function isDirectMarketSellShape(record: Record<string, unknown>): boolean {
  return (
    hasMarketItem(record) && hasAnyField(record, ['quantity_sold', 'total_earned', 'fills', 'unsold', 'auto_listed'])
  );
}

function isDirectMarketBuyShape(record: Record<string, unknown>): boolean {
  return (
    hasMarketItem(record) &&
    hasAnyField(record, [
      'quantity',
      'total_cost',
      'fills',
      'unfilled',
      'delivered_to_cargo',
      'delivered_to_storage',
      'auto_listed',
    ])
  );
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

  // Trade offers (get_trades real shape per GetTradesResponse)
  formatter(
    (r) => {
      const hasIncoming = Array.isArray(r.incoming);
      const hasOutgoing = Array.isArray(r.outgoing);
      if (!hasIncoming && !hasOutgoing) return false;

      const incoming = hasIncoming ? (r.incoming as Array<Record<string, unknown>>) : [];
      const outgoing = hasOutgoing ? (r.outgoing as Array<Record<string, unknown>>) : [];

      emitLine(`\n${c.bright}=== Pending Trade Offers ===${c.reset}`);

      if (incoming.length === 0 && outgoing.length === 0) {
        emitLine(`\n(No pending trade offers)`);
        return true;
      }

      if (outgoing.length) {
        emitLine(`\nOutgoing:`);
        for (const t of outgoing) {
          const requested = formatTradeTerms(t.request_items, t.request_credits);
          const offered = formatTradeTerms(t.offer_items, t.offer_credits);
          emitLine(`  ${t.trade_id}: offering ${offered} for ${requested}`);
          if (t.target_name) emitLine(`    To: ${t.target_name}`);
          if (t.expires_at) emitLine(`    Expires: ${t.expires_at}`);
        }
      }

      if (incoming.length) {
        emitLine(`\nIncoming:`);
        for (const t of incoming) {
          const requested = formatTradeTerms(t.request_items, t.request_credits);
          const offered = formatTradeTerms(t.offer_items, t.offer_credits);
          emitLine(`  ${t.trade_id}: ${t.offerer_name || 'someone'} offers ${offered} for ${requested}`);
          if (t.expires_at) emitLine(`    Expires: ${t.expires_at}`);
        }
      }
      return true;
    },
    { commands: ['get_trades'] },
  ),

  // Market listings (legacy/other paths; does not apply to real get_trades trade offers)
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
      if (!['view_market', 'subscribe_market'].includes(String(r.action)) || !r.base_id) return false;
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
            const price = formatOptionalNumber(o.price_each);
            const qty = formatOptionalNumber(o.quantity);
            const src = o.source && o.source !== 'station' && o.source !== 'player' ? ` [${o.source}]` : '';
            emitLine(`    ${c.green}${price} cr${c.reset} x ${qty}${src}`);
          }
        }
        if (sellOrders && sellOrders.length > 0) {
          emitLine(`  Sell orders (${sellOrders.length}):`);
          for (const o of sellOrders) {
            const price = formatOptionalNumber(o.price_each);
            const qty = formatOptionalNumber(o.quantity);
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
    { commands: ['view_market', 'subscribe_market'], shapeFallback: true },
  ),

  // Market order creation
  namedFormatter(
    'create_market_order',
    ['listing_fee', 'order_id'],
    (r, command) => {
      const side = createOrderSide(r, command);
      if (!side) return false;
      if (r.order_id === undefined && r.listing_fee === undefined) return false;

      const itemName = r.item || r.item_name || r.item_id || 'unknown';
      const itemId = r.item_id && r.item_id !== itemName ? ` (${r.item_id})` : '';
      const requested = finiteNumber(r.quantity);
      const filled = finiteNumber(r.quantity_filled) ?? sumNumericField(r.fills, 'quantity');
      const remaining =
        finiteNumber(r.quantity_listed) ??
        (requested !== undefined && filled !== undefined ? Math.max(0, requested - filled) : undefined);
      const fillTotal =
        side === 'buy'
          ? (finiteNumber(r.total_spent) ?? sumNumericField(r.fills, 'subtotal'))
          : (finiteNumber(r.total_earned) ?? sumNumericField(r.fills, 'subtotal'));
      const priceEach = finiteNumber(r.price_each);
      const listingFee = finiteNumber(r.listing_fee);
      const totalEscrowed = finiteNumber(r.total_escrowed);
      const remainingEscrowed = finiteNumber(r.remaining_escrowed);
      const escrowRefunded = finiteNumber(r.escrow_refunded);
      const notListed = finiteNumber(r.quantity_not_listed);
      const deliveredToCargo = finiteNumber(r.delivered_to_cargo);
      const deliveredToStorage = finiteNumber(r.delivered_to_storage);
      const selfCleared = finiteNumber(r.self_cleared);
      const selfClearRefund = finiteNumber(r.self_clear_refund);
      const selfClearReturned = finiteNumber(r.self_clear_returned);

      emitLine(`\n${c.bright}=== ${side === 'buy' ? 'Buy' : 'Sell'} Order Created ===${c.reset}`);
      emitLine(`Item: ${itemName}${itemId}`);
      if (requested !== undefined) emitLine(`Requested: ${requested.toLocaleString()}`);
      if (filled !== undefined) {
        const totalLabel = side === 'buy' ? 'spent' : 'earned';
        const totalText = fillTotal !== undefined ? ` (${totalLabel}: ${formatCredits(fillTotal)})` : '';
        emitLine(`Instant fills: ${filled.toLocaleString()}${totalText}${formatFillCounterparties(r.fills)}`);
      }
      if (deliveredToCargo !== undefined) emitLine(`Delivered to cargo: ${deliveredToCargo.toLocaleString()}`);
      if (deliveredToStorage !== undefined) emitLine(`Delivered to storage: ${deliveredToStorage.toLocaleString()}`);
      if (remaining !== undefined)
        emitLine(`${side === 'buy' ? 'Remaining open' : 'Remaining listed'}: ${remaining.toLocaleString()}`);
      if (notListed !== undefined) emitLine(`Not listed: ${notListed.toLocaleString()}`);
      if (selfCleared !== undefined) emitLine(`Self-cleared own crossing order(s): ${selfCleared.toLocaleString()}`);
      if (selfClearRefund !== undefined) emitLine(`Self-clear refund: ${formatCredits(selfClearRefund)}`);
      if (selfClearReturned !== undefined)
        emitLine(`Self-clear returned to storage: ${selfClearReturned.toLocaleString()}`);
      if (priceEach !== undefined) emitLine(`Price each: ${formatCredits(priceEach)}`);
      if (totalEscrowed !== undefined) emitLine(`Total escrowed: ${formatCredits(totalEscrowed)}`);
      if (remainingEscrowed !== undefined) emitLine(`Remaining escrowed: ${formatCredits(remainingEscrowed)}`);
      if (escrowRefunded !== undefined) emitLine(`Escrow refunded: ${formatCredits(escrowRefunded)}`);
      if (listingFee !== undefined) emitLine(`Listing fee: ${formatCredits(listingFee)}`);
      if (r.order_id) emitLine(`Order ID: ${r.order_id}`);
      return true;
    },
    {
      commands: ['create_sell_order', 'create_buy_order', 'faction_create_sell_order', 'faction_create_buy_order'],
      shapeFallback: true,
    },
  ),

  // Station storage
  namedFormatter(
    'storage',
    ['base_id', 'items'],
    (r, _command) => {
      if (!r.base_id || !Array.isArray(r.items)) return false;
      const items = r.items as Array<Record<string, unknown>>;
      const ships = (r.ships as Array<Record<string, unknown>>) || [];
      const isFactionStorage = r.target === 'faction';
      const title = isFactionStorage ? 'Faction Storage' : 'Storage';
      const location = typeof r.storage_title === 'string' ? r.storage_title : r.base_id ? `at ${r.base_id}` : '';
      emitLine(`\n${c.bright}=== ${title}${location ? ` ${location}` : ''} ===${c.reset}\n`);
      const factionFuelReserve = r.faction_fuel_reserve;
      const factionFuelCapacity = r.faction_fuel_capacity;
      if (isFactionStorage && (factionFuelReserve !== undefined || factionFuelCapacity !== undefined)) {
        emitLine(`Fuel bunker: ${factionFuelReserve ?? '?'} / ${factionFuelCapacity ?? '?'} units\n`);
      }
      if (typeof r.hint === 'string' && r.hint) emitLine(`${c.dim}${formatStorageHint(r.hint)}${c.reset}\n`);
      printItemTable(items);
      if (ships.length) {
        const shipDisplayName = (ship: Record<string, unknown>) =>
          String(ship.custom_name || ship.ship_name || ship.class_name || ship.class_id || '');
        const nameW = Math.max(9, ...ships.map((s) => shipDisplayName(s).length));
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
          const name = shipDisplayName(s).padEnd(nameW);
          const cls = String(s.class_id || '').padEnd(classW);
          const mods = String(s.modules ?? '').padStart(modsW);
          const cargo = String(s.cargo_used ?? '').padStart(cargoW);
          const id = String(s.ship_id || '').padEnd(idW);
          emitLine(`  ${name} | ${cls} | ${mods} | ${cargo} | ${id}`);
        }
      }
      return true;
    },
    { commands: ['storage'], shapeFallback: true },
  ),

  // Direct market sell
  namedFormatter(
    'direct_sell',
    ['quantity_sold', 'total_earned', 'fills'],
    (r, command) => {
      if ((command !== 'sell' && r.action !== 'sell') || !isDirectMarketSellShape(r)) return false;
      const itemName = r.item || r.item_name || r.item_id || 'unknown';
      const itemId = r.item_id && r.item_id !== itemName ? ` (${r.item_id})` : '';
      const sold = finiteNumber(r.quantity_sold) ?? sumNumericField(r.fills, 'quantity');
      const earned = finiteNumber(r.total_earned) ?? sumNumericField(r.fills, 'subtotal');
      const unsold = finiteNumber(r.unsold);

      emitLine(`\n${c.bright}=== Sell Complete ===${c.reset}`);
      emitLine(`Item: ${itemName}${itemId}`);
      if (sold !== undefined) emitLine(`Sold: ${sold.toLocaleString()}`);
      if (sold !== undefined) {
        const earnedText = earned !== undefined ? ` (earned: ${formatCredits(earned)})` : '';
        emitLine(`Instant fills: ${sold.toLocaleString()}${earnedText}${formatFillCounterparties(r.fills)}`);
      } else if (earned !== undefined) {
        emitLine(`Total earned: ${formatCredits(earned)}`);
      }
      if (unsold !== undefined) emitLine(`Unsold: ${unsold.toLocaleString()}`);
      emitAutoListed(r.auto_listed);
      return true;
    },
    { commands: ['sell'], shapeFallback: true },
  ),

  // Direct market buy
  namedFormatter(
    'direct_buy',
    ['quantity', 'total_cost', 'fills'],
    (r, command) => {
      if ((command !== 'buy' && r.action !== 'buy') || !isDirectMarketBuyShape(r)) return false;
      const itemName = r.item || r.item_name || r.item_id || 'unknown';
      const itemId = r.item_id && r.item_id !== itemName ? ` (${r.item_id})` : '';
      const requested = finiteNumber(r.quantity);
      const unfilled = finiteNumber(r.unfilled);
      const filled =
        sumNumericField(r.fills, 'quantity') ??
        (requested !== undefined && unfilled !== undefined ? Math.max(0, requested - unfilled) : undefined);
      const spent = finiteNumber(r.total_cost) ?? sumNumericField(r.fills, 'subtotal');
      const deliveredToCargo = finiteNumber(r.delivered_to_cargo);
      const deliveredToStorage = finiteNumber(r.delivered_to_storage);

      emitLine(`\n${c.bright}=== Buy Complete ===${c.reset}`);
      emitLine(`Item: ${itemName}${itemId}`);
      if (requested !== undefined) emitLine(`Requested: ${requested.toLocaleString()}`);
      if (filled !== undefined) emitLine(`Filled: ${filled.toLocaleString()}`);
      if (filled !== undefined) {
        const spentText = spent !== undefined ? ` (spent: ${formatCredits(spent)})` : '';
        emitLine(`Instant fills: ${filled.toLocaleString()}${spentText}${formatFillCounterparties(r.fills)}`);
      } else if (spent !== undefined) {
        emitLine(`Total cost: ${formatCredits(spent)}`);
      }
      if (deliveredToCargo !== undefined) emitLine(`Delivered to cargo: ${deliveredToCargo.toLocaleString()}`);
      if (deliveredToStorage !== undefined) emitLine(`Delivered to storage: ${deliveredToStorage.toLocaleString()}`);
      if (unfilled !== undefined) emitLine(`Unfilled: ${unfilled.toLocaleString()}`);
      emitAutoListed(r.auto_listed);
      return true;
    },
    { commands: ['buy'], shapeFallback: true },
  ),

  // Market orders
  namedFormatter(
    'market_orders',
    ['orders'],
    (r) => {
      const orders = firstArray(r, ['orders']);
      if (!orders) return false;
      printMarketOrders(r, orders);
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
    { commands: ['faction_query_trade_intel'], shapeFallback: true },
  ),

  namedFormatter(
    'faction_query_intel',
    ['entries'],
    (r) => {
      const entries = firstArray(r, ['entries']);
      if (!entries) return false;
      if (
        !entries.every((entry) => isRecord(entry) && typeof entry.system_id === 'string' && Array.isArray(entry.pois))
      ) {
        return false;
      }

      emitLine(`\n${c.bright}=== Faction Intel ===${c.reset}`);
      if (r.current_tick !== undefined) emitLine(`Current tick: ${r.current_tick}`);
      if (r.count !== undefined) emitLine(`Systems: ${r.count}`);

      for (const entry of entries) {
        const systemName = String(entry.name ?? entry.system_id ?? 'unknown');
        const systemId = String(entry.system_id ?? 'unknown');
        emitLine(`\n${c.bright}${systemName}${c.reset} ${c.dim}(${systemId})${c.reset}`);
        if (entry.empire) emitLine(`Empire: ${entry.empire}`);
        if (entry.police_level !== undefined) emitLine(`Police: ${entry.police_level}`);
        if (entry.submitted_at_tick !== undefined) {
          const submitter = entry.submitter_name ?? entry.submitted_by;
          const age =
            r.current_tick !== undefined
              ? `, age ${Number(r.current_tick) - Number(entry.submitted_at_tick)} ticks`
              : '';
          emitLine(`Intel tick: ${entry.submitted_at_tick}${submitter ? ` by ${submitter}` : ''}${age}`);
        }

        const pois = entry.pois as Array<Record<string, unknown>>;
        for (const poi of pois) {
          const poiName = String(poi.name ?? poi.id ?? 'unknown');
          const poiType = poi.type ? ` (${poi.type})` : '';
          const poiId = poi.id ? ` ${c.dim}${poi.id}${c.reset}` : '';
          emitLine(`  ${poiName}${poiType}${poiId}`);

          const resources = Array.isArray(poi.resources) ? poi.resources.filter(isRecord) : [];
          for (const resource of resources) {
            const resourceId = String(resource.resource_id ?? resource.id ?? 'unknown');
            const display = resource.remaining_display || `${resource.remaining ?? '?'} remaining`;
            if (display === 'depleted' || resource.remaining === 0) {
              emitLine(`    - ${resourceId}: richness ${resource.richness ?? '?'}, depleted`);
              continue;
            }

            let depletion = '';
            if (resource.depletion_percent !== undefined) {
              const pct = Number(resource.depletion_percent);
              const color = pct > 25 ? c.green : pct >= 5 ? c.yellow : c.red;
              depletion = ` (${color}${pct.toFixed(2)}% remaining${c.reset})`;
            }
            const remaining = resource.max_remaining
              ? `${resource.remaining ?? '?'}/${resource.max_remaining}`
              : display;
            emitLine(`    - ${resourceId}: richness ${resource.richness ?? '?'}, ${remaining}${depletion}`);
          }
        }
      }

      return true;
    },
    { commands: ['faction_query_intel'] },
  ),
];
