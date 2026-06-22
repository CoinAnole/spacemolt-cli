export interface ParsedStorageInventoryHint {
  totalQuantity: number;
  faction: boolean;
  stations: string[];
  suffix: string;
}

const STORAGE_INVENTORY_HINT_RE = /^([\d,]+) items in (faction )?storage at (.+)$/;

export function parseStorageInventoryHint(hint: string): ParsedStorageInventoryHint | undefined {
  const bunkerMarker = 'Fuel bunker here:';
  const bunkerIndex = hint.indexOf(bunkerMarker);
  const main = bunkerIndex >= 0 ? hint.slice(0, bunkerIndex).trimEnd() : hint.trimEnd();
  const suffix = bunkerIndex >= 0 ? hint.slice(bunkerIndex - 1) : '';

  const match = main.match(STORAGE_INVENTORY_HINT_RE);
  const totalText = match?.[1];
  const stationText = match?.[3];
  if (!totalText || !stationText) return undefined;

  const totalQuantity = Number(totalText.replace(/,/g, ''));
  if (!Number.isFinite(totalQuantity)) return undefined;

  const stations = stationText
    .split(',')
    .map((station) => station.trim())
    .filter(Boolean);
  if (!stations.length) return undefined;

  return {
    totalQuantity,
    faction: Boolean(match?.[2]),
    stations,
    suffix,
  };
}

export function sumStorageItemQuantities(items: Array<Record<string, unknown>>): number {
  return items.reduce((total, item) => {
    const quantity = Number(item.quantity);
    return Number.isFinite(quantity) ? total + quantity : total;
  }, 0);
}

function formatQuantity(value: number): string {
  return value.toLocaleString('en-US');
}

function storageLooksPooled(localQuantity: number, globalQuantity: number): boolean {
  if (globalQuantity <= 0) return false;
  return localQuantity >= globalQuantity * 0.95;
}

export function rewriteStorageViewHint(
  content: Record<string, unknown>,
  options?: { requestedStationId?: string; inventoryItems?: Array<Record<string, unknown>> },
): Record<string, unknown> {
  if (typeof content.hint !== 'string' || !content.hint) return content;

  const parsed = parseStorageInventoryHint(content.hint);
  if (!parsed || parsed.stations.length <= 1) return content;

  const inventoryItems = options?.inventoryItems ?? (Array.isArray(content.items) ? content.items : []);
  const localQuantity = sumStorageItemQuantities(inventoryItems as Array<Record<string, unknown>>);
  const stationId =
    (typeof content.base_id === 'string' && content.base_id) ||
    (typeof options?.requestedStationId === 'string' && options.requestedStationId) ||
    undefined;
  const pooled = storageLooksPooled(localQuantity, parsed.totalQuantity);
  const factionLabel = parsed.faction ? 'faction ' : '';

  const next: Record<string, unknown> = { ...content };

  if (pooled) {
    next.storage_title = `across ${parsed.stations.length} stations`;
    next.hint = `${formatQuantity(parsed.totalQuantity)} items in ${factionLabel}storage at ${parsed.stations.join(', ')}${parsed.suffix}`;
    return next;
  }

  if (!stationId) return content;

  let hint = `${formatQuantity(localQuantity)} items in ${factionLabel}storage at ${stationId}`;
  if (parsed.totalQuantity > localQuantity) {
    hint += ` (${formatQuantity(parsed.totalQuantity)} total across ${parsed.stations.length} stations)`;
  }
  hint += parsed.suffix;
  next.hint = hint;
  return next;
}

export function enrichStorageViewStructuredContent(
  content: Record<string, unknown>,
  options?: { requestedStationId?: string; payloadTarget?: unknown; inventoryItems?: Array<Record<string, unknown>> },
): Record<string, unknown> {
  let next = { ...content };

  if (next.target === undefined && typeof options?.payloadTarget === 'string') {
    next = { ...next, target: options.payloadTarget };
  }

  return rewriteStorageViewHint(next, {
    requestedStationId: options?.requestedStationId,
    inventoryItems: options?.inventoryItems,
  });
}