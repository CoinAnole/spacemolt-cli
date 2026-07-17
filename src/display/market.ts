import {
  c,
  emitLine,
  finiteNumber,
  firstArray,
  formatDepletionRemainingSuffix,
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

function formatCreditWords(value: unknown): string | undefined {
  const amount = finiteNumber(value);
  return amount === undefined ? undefined : `${amount.toLocaleString()} credits`;
}

function firstDisplayValue(row: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    const value = row[key];
    if (!isMissingDisplayValue(value)) return value;
  }
  return undefined;
}

function isMissingDisplayValue(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function formatDisplayNumber(value: unknown): string {
  if (isMissingDisplayValue(value)) return '';
  const number = finiteNumber(value);
  if (number !== undefined) return number.toLocaleString();
  return String(value);
}

function formatCreditCell(value: unknown): string {
  if (isMissingDisplayValue(value)) return '';
  const number = finiteNumber(value);
  if (number !== undefined) return formatCredits(number);
  return String(value);
}

function formatOpenQuantity(order: Record<string, unknown>): string {
  const remaining = formatDisplayNumber(order.remaining);
  const quantity = formatDisplayNumber(order.quantity);
  if (remaining && quantity) return `${remaining}/${quantity}`;
  return remaining || quantity;
}

function formatTimestampPreview(value: unknown): string {
  if (isMissingDisplayValue(value)) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1_000_000_000_000 ? value : value * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString().replace('T', ' ').slice(0, 16) : String(value);
  }
  const text = String(value);
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(text);
  return match ? `${match[1]} ${match[2]}` : text;
}

function formatOrderCount(value: unknown): string {
  if (isMissingDisplayValue(value)) return '';
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

function bulkInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

function bulkNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function bulkText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function bulkItem(result: Record<string, unknown>): string {
  const name = bulkText(result.item);
  const id = bulkText(result.item_id);
  if (name && id && name !== id) return `${name} (${id})`;
  return name ?? id ?? '';
}

function bulkFilledListed(result: Record<string, unknown>): string {
  const filled = bulkInteger(result.quantity_filled);
  const listed = bulkInteger(result.quantity_listed);
  if (filled !== undefined && listed !== undefined) return `${filled.toLocaleString()}/${listed.toLocaleString()}`;
  if (filled !== undefined) return `filled ${filled.toLocaleString()}`;
  if (listed !== undefined) return `listed ${listed.toLocaleString()}`;
  return '';
}

function bulkBucket(result: Record<string, unknown>): string {
  const bucket = bulkText(result.bucket) ?? '';
  if (typeof result.consolidated !== 'boolean') return bucket;
  const mode = result.consolidated ? 'consolidated' : 'separate';
  return bucket ? `${bucket} (${mode})` : mode;
}

function bulkFinancial(result: Record<string, unknown>, side: OrderSide): string {
  const parts: string[] = [];
  const add = (label: string, value: unknown) => {
    const amount = bulkNumber(value);
    if (amount !== undefined) parts.push(`${label} ${formatCredits(amount)}`);
  };

  if (side === 'buy') {
    add('spent', result.total_spent);
    add('escrow', result.total_escrowed);
    add('refund', result.escrow_refunded);
  } else {
    add('earned', result.total_earned);
  }
  add('fee', result.listing_fee);
  return parts.join('; ');
}

function bulkOrderOrError(result: Record<string, unknown>): string {
  if (result.success === true) return bulkText(result.order_id) ?? bulkText(result.message) ?? '';

  const code = bulkText(result.error_code);
  const message = bulkText(result.error) ?? bulkText(result.message);
  if (code && message) return `${code}: ${message}`;
  return code ?? message ?? '';
}

function renderFactionBulkOrders(result: Record<string, unknown>, command?: string): boolean {
  const side = createOrderSide(result, command);
  const expectedAction = side === 'buy' ? 'faction_create_buy_order' : 'faction_create_sell_order';
  if (!side || result.kind !== 'bulk' || result.mode !== 'bulk' || result.action !== expectedAction) return false;
  const summary = result.summary;
  const resultsValue = result.results;
  if (!isRecord(summary) || !Array.isArray(resultsValue)) return false;

  const total = bulkInteger(summary.total);
  const succeeded = bulkInteger(summary.succeeded);
  const failed = bulkInteger(summary.failed);
  if (total === undefined || succeeded === undefined || failed === undefined) return false;
  if (
    !resultsValue.every(
      (entry) => isRecord(entry) && bulkInteger(entry.index) !== undefined && typeof entry.success === 'boolean',
    )
  ) {
    return false;
  }

  const results = resultsValue as Array<Record<string, unknown>>;
  const title = side === 'buy' ? 'Faction Buy Orders' : 'Faction Sell Orders';
  emitLine(`\n${c.bright}=== ${title} ===${c.reset}`);
  emitLine(
    `${total.toLocaleString()} requested | ${succeeded.toLocaleString()} succeeded | ${failed.toLocaleString()} failed`,
  );
  if (results.length === 0) {
    emitLine('No order results.');
    return true;
  }

  const rows = results.map((entry) => ({
    index: (entry.index as number).toLocaleString(),
    status: entry.success ? 'created' : 'failed',
    item_display: bulkItem(entry),
    quantity_display: bulkInteger(entry.quantity)?.toLocaleString() ?? '',
    filled_listed: bulkFilledListed(entry),
    price_display: bulkNumber(entry.price_each) === undefined ? '' : formatCredits(entry.price_each as number),
    bucket_display: bulkBucket(entry),
    financial_display: bulkFinancial(entry, side),
    outcome_display: bulkOrderOrError(entry),
  }));

  printCompactTable(
    'Results',
    rows,
    [
      ['#', ['index']],
      ['Status', ['status']],
      ['Item', ['item_display']],
      ['Qty', ['quantity_display']],
      ['Filled/Listed', ['filled_listed']],
      ['Price', ['price_display']],
      ['Bucket', ['bucket_display']],
      ['Financial', ['financial_display']],
      ['Order / Error', ['outcome_display']],
    ],
    { maxCellWidth: 64 },
  );
  return true;
}

export const marketFormatters = [
  // Ship listings (browse_ships) — must come before market listings since both use r.listings
  formatter(
    (r, command) => {
      const normalizedCommand = command?.replace(/^v2_/, '');
      const listings = Array.isArray(r.listings)
        ? (r.listings as Array<Record<string, unknown>>).filter((listing) => listing.ship_id)
        : [];
      const shipBuyOrderSource = normalizedCommand === 'view_ship_buy_orders' ? r.orders : r.buy_orders;
      const buyOrders = Array.isArray(shipBuyOrderSource) ? shipBuyOrderSource.filter(isRecord) : [];
      if (!listings.length && !buyOrders.length) return false;

      const orderStations = [...new Set(buyOrders.map((order) => order.base_name || order.base_id).filter(Boolean))];
      const stationName = r.base_name || r.base || orderStations[0] || 'Station';
      if (listings.length) emitLine(`\n${c.bright}=== Ships for Sale @ ${stationName} ===${c.reset}`);
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
      if (buyOrders.length) {
        emitLine(`\n${c.bright}=== Ship Buy Orders @ ${stationName} ===${c.reset}`);
        for (const order of buyOrders) {
          const shipClass = order.class_id || 'Unknown';
          const shipName = order.class_name || shipClass;
          const price = formatCreditWords(order.price);
          const taxEscrow = formatCreditWords(order.tax_escrow);
          const orderBase = order.base_name || order.base_id;
          emitLine(`\n${c.cyan}${shipName}${c.reset} (${shipClass})`);
          if (orderBase && (orderStations.length !== 1 || orderBase !== stationName))
            emitLine(`  Station: ${orderBase}`);
          if (price) emitLine(`  Price: ${c.yellow}${price}${c.reset}`);
          if (order.buyer) emitLine(`  Buyer: ${order.buyer}`);
          if (order.being_built !== undefined) emitLine(`  Building: ${order.being_built ? 'yes' : 'no'}`);
          if (taxEscrow) emitLine(`  Tax escrow: ${taxEscrow}`);
          emitLine(`  Order ID: ${order.order_id}`);
        }
      }
      return true;
    },
    { commands: ['browse_ships', 'view_ship_buy_orders'], shapeFallback: true },
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
  namedFormatter('faction_bulk_orders', ['kind', 'results', 'summary'], renderFactionBulkOrders, {
    commands: ['faction_create_buy_order', 'faction_create_sell_order'],
    suppressShapeFallbackOnDecline: true,
  }),

  namedFormatter(
    'create_market_order',
    ['listing_fee', 'order_id'],
    (r, command) => {
      const side = createOrderSide(r, command);
      if (!side) return false;
      if (r.kind !== undefined && r.kind !== 'single') return false;
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
      if (isFactionStorage && r.credits !== undefined) {
        const credits = finiteNumber(r.credits);
        emitLine(`Faction credits: ${credits === undefined ? r.credits : credits.toLocaleString()}`);
      }
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
    { commands: ['storage_view'], shapeFallback: true },
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
        ['Station', ['base_name', 'base_id']],
        ['Ticks', ['ticks_remaining']],
        ['Materials', ['materials_provided']],
        ['ID', ['commission_id']],
      ]);
      if (r.count !== undefined && commissions.length !== r.count) emitLine(`${c.dim}count ${r.count}${c.reset}`);
      return true;
    },
    { commands: ['commission_status'] },
  ),

  // Commission quote (includes yard_margin; build_materials items use size, not inventory "have")
  formatter(
    (r) => {
      if (r.ship_class === undefined && r.credits_only_total === undefined && r.yard_margin === undefined) {
        return false;
      }
      if (r.can_commission === undefined && r.material_cost === undefined && !Array.isArray(r.build_materials)) {
        return false;
      }

      emitLine(`\n${c.bright}=== Commission Quote ===${c.reset}`);
      if (r.message) emitLine(String(r.message));
      if (r.ship_name || r.ship_class) {
        emitLine(`Ship: ${r.ship_name ?? r.ship_class}${r.ship_class && r.ship_name ? ` (${r.ship_class})` : ''}`);
      }
      if (r.shipyard_tier_here !== undefined || r.shipyard_tier_required !== undefined) {
        emitLine(`Shipyard tier: ${r.shipyard_tier_here ?? '?'}/${r.shipyard_tier_required ?? '?'}`);
      }
      if (r.build_time !== undefined) emitLine(`Build time: ${r.build_time} ticks`);
      if (r.material_cost !== undefined) emitLine(`Materials: ${formatCreditCell(r.material_cost)}`);
      if (r.labor_cost !== undefined) emitLine(`Labor: ${formatCreditCell(r.labor_cost)}`);
      if (r.yard_margin !== undefined) emitLine(`Yard fee: ${formatCreditCell(r.yard_margin)}`);
      if (r.credits_only_total !== undefined) emitLine(`Credits-only total: ${formatCreditCell(r.credits_only_total)}`);
      if (r.provide_materials_total !== undefined) {
        emitLine(`Provide-materials total: ${formatCreditCell(r.provide_materials_total)}`);
      }
      if (r.player_credits !== undefined) emitLine(`Your credits: ${formatCreditCell(r.player_credits)}`);
      if (r.can_commission !== undefined) emitLine(`Can commission: ${r.can_commission ? 'yes' : 'no'}`);
      if (r.credits_only_available !== undefined) {
        emitLine(`Credits-only available: ${r.credits_only_available ? 'yes' : 'no'}`);
      }
      if (r.can_afford_credits_only !== undefined) {
        emitLine(`Afford credits-only: ${r.can_afford_credits_only ? 'yes' : 'no'}`);
      }
      if (r.can_afford_provide_materials !== undefined) {
        emitLine(`Afford provide-materials: ${r.can_afford_provide_materials ? 'yes' : 'no'}`);
      }
      const blockers = firstArray(r, ['blockers']);
      if (blockers?.length) {
        emitLine(`Blockers: ${blockers.map(String).join('; ')}`);
      }
      const materials = firstArray(r, ['build_materials']);
      if (materials) {
        printCompactTable('Build Materials', materials, [
          ['Item', ['name', 'item_id']],
          ['Qty', ['quantity', 'amount']],
          ['Size', ['size']],
        ]);
      }
      return true;
    },
    { commands: ['commission_quote'] },
  ),

  // Insurance quote
  formatter(
    (r) => {
      const quote = isRecord(r.quote) ? r.quote : undefined;
      if (!quote) return false;

      emitLine(`\n${c.bright}=== Insurance Quote ===${c.reset}`);
      if (r.message) emitLine(String(r.message));
      if (r.notice) emitLine(String(r.notice));
      if (quote.fitted_value !== undefined) emitLine(`Fitted value: ${formatCreditCell(quote.fitted_value)}`);
      if (quote.coverage !== undefined) emitLine(`Coverage: ${formatCreditCell(quote.coverage)}`);
      if (quote.premium !== undefined) emitLine(`Premium: ${formatCreditCell(quote.premium)}`);
      if (quote.risk_score !== undefined) emitLine(`Risk score: ${quote.risk_score}`);
      if (quote.refused !== undefined) emitLine(`Refused: ${quote.refused ? 'yes' : 'no'}`);
      if (quote.expires_in !== undefined) emitLine(`Expires in: ${quote.expires_in}`);
      const factors = Array.isArray(quote.factors) ? quote.factors.filter(isRecord) : [];
      if (factors.length) {
        printCompactTable('Risk Factors', factors, [
          ['Factor', ['name']],
          ['Multiplier', ['multiplier']],
          ['Detail', ['detail']],
        ]);
      }
      return true;
    },
    { commands: ['get_insurance_quote'] },
  ),

  // Active insurance policies (v2 POST …/salvage/policies → curated view_insurance only)
  formatter(
    (r, command) => {
      const cmd = command?.replace(/^v2_/, '');
      if (cmd !== 'view_insurance') return false;
      const policies = firstArray(r, ['policies']);
      if (!policies) return false;

      emitLine(`\n${c.bright}=== Insurance Policies ===${c.reset}`);
      if (r.message) emitLine(String(r.message));
      if (policies.length === 0) {
        emitLine('No active policies.');
        return true;
      }
      printCompactTable('Policies', policies, [
        ['Ship', ['ship_class']],
        ['Coverage', ['coverage']],
        ['Premium', ['premium']],
        ['Risk', ['risk_score']],
        ['Expires', ['expires_at']],
        ['ID', ['policy_id']],
      ]);
      for (const policy of policies) {
        const factors = Array.isArray(policy.risk_factors) ? policy.risk_factors.filter(isRecord) : [];
        if (!factors.length) continue;
        printCompactTable(`Risk Factors (${policy.policy_id ?? policy.ship_class ?? 'policy'})`, factors, [
          ['Factor', ['name']],
          ['Multiplier', ['multiplier']],
          ['Detail', ['detail']],
        ]);
      }
      return true;
    },
    { commands: ['view_insurance'] },
  ),

  // Intel
  namedFormatter(
    'intel',
    ['intel'],
    (r) => {
      const entries = firstArray(r, ['entries']);
      if (entries?.every((entry) => isRecord(entry) && Array.isArray(entry.items))) {
        const rows = entries.flatMap((entry) =>
          ((entry.items as unknown[]) ?? []).filter(isRecord).map((item) => ({
            system_id: entry.system_id,
            station_name: entry.station_name ?? entry.base_name ?? entry.base_id,
            item_name: item.item_name ?? item.item_id,
            best_buy: formatCreditCell(item.best_buy),
            best_sell: formatCreditCell(item.best_sell),
            buy_volume: formatDisplayNumber(item.buy_volume),
            sell_volume: formatDisplayNumber(item.sell_volume),
            submitted_tick:
              entry.submitted_at_tick === undefined ? '' : `tick ${formatDisplayNumber(entry.submitted_at_tick)}`,
            submitter: entry.submitter_name ?? entry.submitted_by,
          })),
        );
        emitLine(`\n${c.bright}=== Trade Intel ===${c.reset}`);
        if (r.intel_level !== undefined) emitLine(`Intel level: ${r.intel_level}`);
        if (r.showing !== undefined || r.total !== undefined) {
          emitLine(`Showing: ${formatDisplayNumber(r.showing)} / ${formatDisplayNumber(r.total)}`);
        }
        printCompactTable('Items', rows, [
          ['System', ['system_id']],
          ['Station', ['station_name']],
          ['Item', ['item_name']],
          ['Best Buy', ['best_buy']],
          ['Best Sell', ['best_sell']],
          ['Buy Vol', ['buy_volume']],
          ['Sell Vol', ['sell_volume']],
          ['Updated', ['submitted_tick']],
          ['By', ['submitter']],
        ]);
        return true;
      }

      const intel = firstArray(r, ['intel', 'results', 'trade_intel']);
      if (!intel) return false;
      printCompactTable('Intel', intel, [
        ['System', ['system_name', 'system_id']],
        ['POI/Station', ['poi_name', 'poi_id', 'base_name', 'base_id']],
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

            const depletion =
              resource.depletion_percent !== undefined
                ? formatDepletionRemainingSuffix(resource.depletion_percent)
                : '';
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
