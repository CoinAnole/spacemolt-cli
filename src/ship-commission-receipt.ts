function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function scalarText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function namedId(name: string | undefined, id: string | undefined): string | undefined {
  if (name && id && name !== id) return `${name} (${id})`;
  return name ?? id;
}

export function formatShipCommissionReceipt(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;

  const commissionId = scalarText(value.commission_id);
  const shipId = scalarText(value.ship_id);
  if (!commissionId || !shipId) return undefined;

  const ship = namedId(scalarText(value.ship_name), scalarText(value.ship_class));
  const base = namedId(scalarText(value.base_name), scalarText(value.base_id));
  const delivered = ship ? `delivered ${ship}, ship ${shipId}` : `delivered ship ${shipId}`;
  const location = base ? `, at ${base}` : '';
  return `Commission ${commissionId} ${delivered}${location}`;
}
