function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

export { nonEmptyString as prizeFieldText };

/** Compact origin for the table Location column. Preposition-free. */
export function formatPrizeCaptureLocation(data: Record<string, unknown>): string | undefined {
  const poi = nonEmptyString(data.prize_poi_name) ?? nonEmptyString(data.prize_poi_id);
  const system = nonEmptyString(data.prize_system_name) ?? nonEmptyString(data.prize_system_id);
  if (poi !== undefined && system !== undefined) return `${poi} (${system})`;
  return poi ?? system;
}

/**
 * First-detail site line for ship_captured. Prepositions match wreckSiteLabel:
 * at {poi}, in {system}. Undefined when there is neither prize_id nor location.
 */
export function formatPrizeCaptureSite(data: Record<string, unknown>): string | undefined {
  const prizeId = nonEmptyString(data.prize_id);
  const poi = nonEmptyString(data.prize_poi_name) ?? nonEmptyString(data.prize_poi_id);
  const system = nonEmptyString(data.prize_system_name) ?? nonEmptyString(data.prize_system_id);

  let place: string | undefined;
  if (poi !== undefined && system !== undefined) place = `at ${poi} (${system})`;
  else if (poi !== undefined) place = `at ${poi}`;
  else if (system !== undefined) place = `in ${system}`;

  if (prizeId !== undefined && place !== undefined) return `prize ${prizeId} ${place}`;
  if (prizeId !== undefined) return `prize ${prizeId}`;
  return formatPrizeCaptureLocation(data);
}
